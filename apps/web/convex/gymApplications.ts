import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const plan = v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"));
const notificationStatus = v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"), v.literal("not_configured"));

const applicationArgs = {
  gymName: v.string(),
  ownerName: v.string(),
  email: v.string(),
  contactNumber: v.string(),
  plan,
};

const applicationResult = v.object({
  applicationId: v.string(),
  status: v.union(v.literal("pending"), v.literal("under_review"), v.literal("approved"), v.literal("rejected")),
  notificationStatus,
  submittedAt: v.string(),
  duplicate: v.boolean(),
});

type ApplicationInput = {
  gymName: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: "Starter" | "Growth" | "Pro";
};

type ApplicationResult = {
  applicationId: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  notificationStatus: "pending" | "sent" | "failed" | "not_configured";
  submittedAt: string;
  duplicate: boolean;
};

function clean(value: string, label: string, maxLength: number): string {
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < 2 || result.length > maxLength) throw new Error(`INVALID_${label.toUpperCase()}`);
  return result;
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
  return email;
}

function cleanPhone(value: string): string {
  const phone = value.trim().replace(/\s+/g, " ");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || phone.length > 40) throw new Error("INVALID_CONTACT_NUMBER");
  return phone;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "gym";
}

function inputValues(args: ApplicationInput) {
  const gymName = clean(args.gymName, "gym_name", 120);
  const ownerName = clean(args.ownerName, "owner_name", 160);
  const email = cleanEmail(args.email);
  const contactNumber = cleanPhone(args.contactNumber);
  return { gymName, ownerName, email, contactNumber, plan: args.plan };
}

/**
 * Stores a public application without creating a Clerk account, tenant, or
 * gym membership. This is internal so the public entry point is the action
 * below, which can also deliver notifications without exposing the table.
 */
export const create = internalMutation({
  args: applicationArgs,
  returns: v.object({
    applicationDocumentId: v.id("gymApplications"),
    applicationId: v.string(),
    status: v.union(v.literal("pending"), v.literal("under_review"), v.literal("approved"), v.literal("rejected")),
    notificationStatus,
    submittedAt: v.number(),
    duplicate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const values = inputValues(args);
    const baseKey = `${values.email}::${slug(values.gymName)}`;
    const matches = await ctx.db
      .query("gymApplications")
      .withIndex("by_application_key", (q) => q.eq("applicationKey", baseKey))
      .collect();
    const existing = matches.find((row) => row.status !== "rejected");
    if (existing) {
      return {
        applicationDocumentId: existing._id,
        applicationId: existing.publicId,
        status: existing.status,
        notificationStatus: existing.notificationStatus,
        submittedAt: existing.submittedAt,
        duplicate: true,
      };
    }

    const now = Date.now();
    const publicId = crypto.randomUUID();
    const applicationDocumentId = await ctx.db.insert("gymApplications", {
      publicId,
      applicationKey: matches.length > 0 ? `${baseKey}::${now}` : baseKey,
      ...values,
      status: "pending",
      notificationStatus: "pending",
      submittedAt: now,
      updatedAt: now,
    });
    return { applicationDocumentId, applicationId: publicId, status: "pending" as const, notificationStatus: "pending" as const, submittedAt: now, duplicate: false };
  },
});

export const markNotification = internalMutation({
  args: {
    applicationId: v.id("gymApplications"),
    status: notificationStatus,
    error: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.applicationId, {
      notificationStatus: args.status,
      notificationError: args.error,
      updatedAt: Date.now(),
    });
    return undefined;
  },
});

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function detailsHtml(values: ApplicationInput): string {
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Arial,sans-serif;font-size:14px">
    <tr><td style="padding:8px 0;color:#777">Gym name</td><td style="padding:8px 0;font-weight:600">${escapeHtml(values.gymName)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Owner name</td><td style="padding:8px 0;font-weight:600">${escapeHtml(values.ownerName)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Email</td><td style="padding:8px 0"><a href="mailto:${encodeURIComponent(values.email)}">${escapeHtml(values.email)}</a></td></tr>
    <tr><td style="padding:8px 0;color:#777">Contact number</td><td style="padding:8px 0">${escapeHtml(values.contactNumber)}</td></tr>
    <tr><td style="padding:8px 0;color:#777">Chosen plan</td><td style="padding:8px 0">${escapeHtml(values.plan)}</td></tr>
  </table>`;
}

async function sendResendEmail(args: { apiKey: string; from: string; to: string[]; subject: string; html: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: args.from, to: args.to, subject: args.subject, html: args.html, text: args.text }),
    });
    if (!response.ok) return { ok: false, error: `Resend returned HTTP ${response.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Resend could not be reached." };
  }
}

function recipientList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, all) => item && all.indexOf(item) === index);
}

/**
 * Public application entry point. The database write happens before email
 * delivery, so a temporary provider failure never loses a lead.
 */
export const submit = action({
  args: applicationArgs,
  returns: applicationResult,
  handler: async (ctx, args): Promise<ApplicationResult> => {
    const created = await ctx.runMutation(internal.gymApplications.create, args);
    if (created.duplicate && created.notificationStatus === "sent") return { applicationId: created.applicationId, status: created.status, notificationStatus: created.notificationStatus, submittedAt: new Date(created.submittedAt).toISOString(), duplicate: true };

    const apiKey = text(process.env.RESEND_API_KEY);
    const from = text(process.env.RESEND_FROM_EMAIL) || "applications@rivetjo.com";
    const recipients = recipientList(process.env.RIVET_APPLICATION_RECIPIENTS);
    if (!apiKey || recipients.length === 0) {
      await ctx.runMutation(internal.gymApplications.markNotification, { applicationId: created.applicationDocumentId, status: "not_configured", error: "Resend application notifications are not configured." });
      return { applicationId: created.applicationId, status: created.status, notificationStatus: "not_configured", submittedAt: new Date(created.submittedAt).toISOString(), duplicate: created.duplicate };
    }

    const values = inputValues(args);
    const summary = detailsHtml(values);
    const applicant = await sendResendEmail({
      apiKey,
      from,
      to: [values.email],
      subject: "RIVET gym application received",
      html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>Application received</h2><p>Thanks for applying to bring <strong>${escapeHtml(values.gymName)}</strong> onto RIVET.</p><p>Our team will review your application and contact you soon. There is no gym account to create yet; approved gyms receive access directly from RIVET.</p>${summary}</div>`,
      text: `Application received for ${values.gymName}. Our team will review it and contact you soon.\n\nGym: ${values.gymName}\nOwner: ${values.ownerName}\nEmail: ${values.email}\nContact: ${values.contactNumber}\nPlan: ${values.plan}`,
    });
    const internalNotification = await sendResendEmail({
      apiKey,
      from,
      to: recipients,
      subject: `New RIVET gym application · ${values.gymName}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>New gym application</h2><p>A gym owner submitted an application through rivetjo.com.</p>${summary}<p style="color:#777;font-size:12px">Review the applicant before provisioning a gym workspace or sending access.</p></div>`,
      text: `New RIVET gym application\n\nGym: ${values.gymName}\nOwner: ${values.ownerName}\nEmail: ${values.email}\nContact: ${values.contactNumber}\nPlan: ${values.plan}\n\nReview before provisioning access.`,
    });

    const notificationStatus = applicant.ok && internalNotification.ok ? "sent" : "failed";
    const error = [applicant.error, internalNotification.error].filter(Boolean).join(" ") || undefined;
    await ctx.runMutation(internal.gymApplications.markNotification, { applicationId: created.applicationDocumentId, status: notificationStatus, error });
    return { applicationId: created.applicationId, status: created.status, notificationStatus, submittedAt: new Date(created.submittedAt).toISOString(), duplicate: created.duplicate };
  },
});
