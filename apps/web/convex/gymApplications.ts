import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { domainError, publicUserId, requirePlatformAdmin } from "./security";
import { notifyPlatformAdmins } from "./notificationDelivery";

const plan = v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro"));
const notificationStatus = v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"), v.literal("not_configured"));
const reviewDecision = v.union(v.literal("under_review"), v.literal("approved"), v.literal("rejected"));

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

type ReviewResult = {
  applicationId: string;
  gymName: string;
  ownerName: string;
  email: string;
  plan: "Starter" | "Growth" | "Pro";
  status: "under_review" | "approved" | "rejected";
  reviewNotificationStatus: "pending" | "sent" | "failed" | "not_configured";
  reviewNotificationError?: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy: string;
  reviewNotes?: string;
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
    await notifyPlatformAdmins(ctx, {
      kind: "application_awaiting_review",
      title: "Gym application awaiting review",
      body: `${values.gymName} · ${values.plan}`,
      href: `/platform/applications?application=${publicId}`,
      dedupeKey: `gym-application:${publicId}`,
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

const reviewArgs = {
  applicationId: v.string(),
  decision: reviewDecision,
  note: v.optional(v.string()),
  correlationId: v.string(),
};

/**
 * Changes the review state and writes an immutable platform audit event before
 * any external email is attempted. The action below owns the Resend call.
 */
export const reviewRecord = internalMutation({
  args: reviewArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await ctx.db
      .query("gymApplications")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.applicationId))
      .unique();
    if (!application) domainError("NOT_FOUND", "Gym application not found.", { correlationId: args.correlationId });
    if (application.status === "approved" || application.status === "rejected") {
      domainError("VALIDATION_ERROR", "This gym application has already been finalized.", { correlationId: args.correlationId });
    }

    const note = args.note?.trim() || undefined;
    if (args.decision === "rejected" && !note) {
      domainError("VALIDATION_ERROR", "Add a reason before rejecting an application.", {
        correlationId: args.correlationId,
        fieldErrors: { note: ["Required when rejecting an application"] },
      });
    }

    const now = Date.now();
    const reviewNotificationStatus = args.decision === "under_review" ? "not_configured" : "pending";
    const nextReviewNotes = note ?? application.reviewNotes;
    await ctx.db.patch(application._id, {
      status: args.decision,
      reviewNotificationStatus,
      reviewNotificationError: undefined,
      reviewedAt: args.decision === "under_review" ? undefined : now,
      reviewedBy: admin.user.fullName,
      reviewNotes: nextReviewNotes,
      updatedAt: now,
    });
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      actorUserId: admin.user._id,
      actorPublicId: publicUserId(admin.user),
      actorName: admin.user.fullName,
      action: `gym_application.${args.decision}`,
      entityType: "gym_application",
      entityPublicId: application.publicId,
      entityLabel: application.gymName,
      summary: `${args.decision === "under_review" ? "Moved to review" : args.decision === "approved" ? "Approved" : "Rejected"} gym application for ${application.gymName}`,
      reason: note,
      before: { status: application.status },
      after: { status: args.decision, plan: application.plan },
      correlationId: args.correlationId,
      occurredAt: now,
    });

    return {
      applicationDocumentId: application._id,
      applicationId: application.publicId,
      gymName: application.gymName,
      ownerName: application.ownerName,
      email: application.email,
      plan: application.plan,
      status: args.decision,
      reviewNotificationStatus,
      reviewNotificationError: undefined,
      submittedAt: new Date(application.submittedAt).toISOString(),
      updatedAt: new Date(now).toISOString(),
      reviewedAt: args.decision === "under_review" ? undefined : new Date(now).toISOString(),
      reviewedBy: admin.user.fullName,
      reviewNotes: nextReviewNotes,
    };
  },
});

export const markReviewNotification = internalMutation({
  args: {
    applicationId: v.id("gymApplications"),
    status: notificationStatus,
    error: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.applicationId, {
      reviewNotificationStatus: args.status,
      reviewNotificationError: args.error,
      updatedAt: Date.now(),
    });
    return undefined;
  },
});

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

function reviewEmail(values: { gymName: string; ownerName: string; plan: "Starter" | "Growth" | "Pro" }, decision: "approved" | "rejected") {
  const approved = decision === "approved";
  const heading = approved ? "Your RIVET application is approved" : "An update on your RIVET application";
  const message = approved
    ? "Our team will contact you soon to finish setup and provide your gym access."
    : "We are unable to approve the application at this time. Our team will contact you if more information is needed.";
  return {
    subject: approved ? `RIVET application approved · ${values.gymName}` : `RIVET application update · ${values.gymName}`,
    html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>${heading}</h2><p>Hi ${escapeHtml(values.ownerName)},</p><p>${message}</p><p><strong>Gym:</strong> ${escapeHtml(values.gymName)}<br/><strong>Plan:</strong> ${escapeHtml(values.plan)}</p><p style="color:#777;font-size:12px">This message was sent by RIVET. Please contact our team directly if you have questions.</p></div>`,
    text: `${heading}\n\nHi ${values.ownerName},\n\n${message}\n\nGym: ${values.gymName}\nPlan: ${values.plan}`,
  };
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

    const recipients = recipientList(process.env.RIVET_APPLICATION_RECIPIENTS);
    const values = inputValues(args);
    const summary = detailsHtml(values);
    const applicant = await ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: "gym_application_received_applicant",
      templateVersion: "gym-application-received-v1",
      recipientReference: values.email,
      recipientEmail: values.email,
      dedupeKey: `gym-application-received-applicant:${created.applicationId}`,
      relatedEntityType: "gym_application_submission",
      relatedEntityPublicId: created.applicationId,
      subject: "RIVET gym application received",
      html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>Application received</h2><p>Thanks for applying to bring <strong>${escapeHtml(values.gymName)}</strong> onto RIVET.</p><p>Our team will review your application and contact you soon. There is no gym account to create yet; approved gyms receive access directly from RIVET.</p>${summary}</div>`,
      text: `Application received for ${values.gymName}. Our team will review it and contact you soon.\n\nGym: ${values.gymName}\nOwner: ${values.ownerName}\nEmail: ${values.email}\nContact: ${values.contactNumber}\nPlan: ${values.plan}`,
    });
    const internalRecipients = recipients.length > 0 ? recipients : [undefined];
    const internalNotifications = await Promise.all(internalRecipients.map((recipient, index) => ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: "gym_application_received_internal",
      templateVersion: "gym-application-internal-v1",
      recipientReference: recipient ?? "platform-applications",
      recipientEmail: recipient,
      dedupeKey: `gym-application-received-internal:${created.applicationId}:${index}`,
      relatedEntityType: "gym_application_submission",
      relatedEntityPublicId: created.applicationId,
      subject: `New RIVET gym application · ${values.gymName}`,
      html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>New gym application</h2><p>A gym owner submitted an application through rivetjo.com.</p>${summary}<p style="color:#777;font-size:12px">Review the applicant before provisioning a gym workspace or sending access.</p></div>`,
      text: `New RIVET gym application\n\nGym: ${values.gymName}\nOwner: ${values.ownerName}\nEmail: ${values.email}\nContact: ${values.contactNumber}\nPlan: ${values.plan}\n\nReview before provisioning access.`,
    })));
    const results = [applicant, ...internalNotifications];
    const notificationStatus = results.some((result) => result.status === "suppressed") ? "not_configured" as const : "pending" as const;
    const error = notificationStatus === "not_configured" ? "Application email delivery is sandboxed or not fully configured." : undefined;
    await ctx.runMutation(internal.gymApplications.markNotification, { applicationId: created.applicationDocumentId, status: notificationStatus, error });
    return { applicationId: created.applicationId, status: created.status, notificationStatus, submittedAt: new Date(created.submittedAt).toISOString(), duplicate: created.duplicate };
  },
});

/**
 * Final review decisions send the applicant a separate status email. The
 * application state remains durable even when Resend is temporarily missing or
 * unavailable, and the notification status makes that failure visible to the
 * platform operator.
 */
export const review = action({
  args: reviewArgs,
  returns: v.any(),
  handler: async (ctx, args): Promise<ReviewResult> => {
    const reviewed = await ctx.runMutation(internal.gymApplications.reviewRecord, args);
    const { applicationDocumentId, ...publicReview } = reviewed as {
      applicationDocumentId: Id<"gymApplications">;
      applicationId: string;
      gymName: string;
      ownerName: string;
      email: string;
      plan: "Starter" | "Growth" | "Pro";
      status: "under_review" | "approved" | "rejected";
      reviewNotificationStatus: "pending" | "sent" | "failed" | "not_configured";
      reviewNotificationError?: string;
      submittedAt: string;
      updatedAt: string;
      reviewedAt?: string;
      reviewedBy: string;
      reviewNotes?: string;
    };
    if (args.decision === "under_review") return publicReview;

    const email = reviewEmail({ gymName: publicReview.gymName, ownerName: publicReview.ownerName, plan: publicReview.plan }, args.decision);
    const queued = await ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: args.decision === "approved" ? "gym_application_approved" : "gym_application_rejected",
      templateVersion: args.decision === "approved" ? "gym-application-approved-v1" : "gym-application-rejected-v1",
      recipientReference: publicReview.email,
      recipientEmail: publicReview.email,
      dedupeKey: `gym-application-review:${publicReview.applicationId}:${args.decision}`,
      relatedEntityType: "gym_application_review",
      relatedEntityPublicId: publicReview.applicationId,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }) as { publicId: string; status: string };
    const status = queued.status === "suppressed" ? "not_configured" as const : "pending" as const;
    const error = status === "not_configured" ? "Application review email delivery is sandboxed or not fully configured." : undefined;
    await ctx.runMutation(internal.gymApplications.markReviewNotification, { applicationId: applicationDocumentId, status, error });
    return { ...publicReview, reviewNotificationStatus: status, reviewNotificationError: error };
  },
});
