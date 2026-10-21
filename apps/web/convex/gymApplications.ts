import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { domainError, publicUserId, requirePlatformAdmin } from "./security";
import { notifyPlatformAdmins } from "./notificationDelivery";
import { applicantReceivedEmail, applicantReviewEmail, applicationInternalEmail } from "./gymApplicationEmail";
import { systemMessage } from "../src/lib/i18n/system-messages";
import { enforcePublicRateLimit, privacyFingerprint } from "./publicAbuse";
import { checkPromo } from "./platformCommerce";
import { normalizePromoCode } from "./firstPayment";
import { isQuotedPlan, validQuotedPriceMinor } from "./planCatalogue";

const billingInterval = v.union(v.literal("monthly"), v.literal("annual"));
const notificationStatus = v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"), v.literal("not_configured"));
const reviewDecision = v.union(v.literal("under_review"), v.literal("approved"), v.literal("rejected"));

const applicationArgs = {
  gymName: v.string(),
  gymAddress: v.string(),
  ownerName: v.string(),
  email: v.string(),
  contactNumber: v.string(),
  plan: v.union(v.literal("Basic"), v.literal("Pro")),
  billingInterval: v.optional(billingInterval),
  idempotencyKey: v.optional(v.string()),
  website: v.optional(v.string()),
  /** The language the applicant applied in; their own copies follow it. */
  language: v.optional(v.union(v.literal("en"), v.literal("ar"))),
  /** Launch offers. (`website` above is the bot trap; this is the real add-on.) */
  websiteRequested: v.optional(v.boolean()),
  promoCode: v.optional(v.string()),
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
  gymAddress: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
  billingInterval?: "monthly" | "annual";
  idempotencyKey?: string;
  website?: string;
  websiteRequested?: boolean;
  promoCode?: string;
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
  gymAddress?: string;
  ownerName: string;
  email: string;
  plan: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
  billingInterval: "monthly" | "annual";
  status: "under_review" | "approved" | "rejected";
  reviewNotificationStatus: "pending" | "sent" | "failed" | "not_configured";
  reviewNotificationError?: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy: string;
  reviewNotes?: string;
};

function clean(value: string, label: string, maxLength: number, minLength = 2): string {
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < minLength || result.length > maxLength) throw new Error(`INVALID_${label.toUpperCase()}`);
  return result;
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
  return email;
}

/**
 * The inbox an address delivers to, for throttling only. Most providers ignore
 * a "+tag" in the local part, and Gmail also ignores dots, so
 * "a.b+1@gmail.com" and "ab@gmail.com" reach the same person.
 */
function throttleInbox(email: string): string {
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1) === "googlemail.com" ? "gmail.com" : email.slice(at + 1);
  const local = email.slice(0, at).split("+")[0] ?? "";
  return `${domain === "gmail.com" ? local.replaceAll(".", "") : local}@${domain}`;
}

function cleanPhone(value: string): string {
  const phone = value.trim().replace(/\s+/g, " ");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || phone.length > 40) throw new Error("INVALID_CONTACT_NUMBER");
  return phone;
}

/**
 * Formatting is presentation; throttling must use one stable phone identity.
 * Preserve a leading international `+`, accept `00` as its E.164 equivalent,
 * and otherwise retain digits only because a local number has no safe country
 * code to infer here.
 */
function canonicalPhone(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return digits;
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
  const gymAddress = clean(args.gymAddress, "gym_address", 300, 5);
  const ownerName = clean(args.ownerName, "owner_name", 160);
  const email = cleanEmail(args.email);
  const contactNumber = cleanPhone(args.contactNumber);
  return { gymName, gymAddress, ownerName, email, contactNumber, canonicalContactNumber: canonicalPhone(contactNumber), plan: args.plan, billingInterval: args.billingInterval ?? "monthly" };
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
    const requestHash = await privacyFingerprint({
      scope: "gym_application",
      gymName: slug(values.gymName),
      gymAddress: values.gymAddress,
      ownerName: values.ownerName,
      email: values.email,
      contactNumber: values.canonicalContactNumber,
      plan: values.plan,
      billingInterval: values.billingInterval,
    });
    const idempotencyKey = args.idempotencyKey?.trim();
    if (idempotencyKey) {
      if (idempotencyKey.length > 200) domainError("VALIDATION_ERROR", "The application request could not be processed.");
      const existingRequests = await ctx.db.query("publicRequestIdempotency").withIndex("by_scope_key", (q) => q.eq("scope", "gym_application").eq("key", idempotencyKey)).collect();
      const existingRequest = existingRequests.find((row) => row.expiresAt > Date.now());
      if (existingRequest) {
        if (existingRequest.requestHash !== requestHash) domainError("CONFLICT", "This application request has already been used.");
        const previous = existingRequest.result as { applicationDocumentId: Id<"gymApplications">; applicationId: string; status: ApplicationResult["status"]; notificationStatus: ApplicationResult["notificationStatus"]; submittedAt: number };
        // Remove stale rows left by an older non-unique implementation while
        // retaining the active replay record.
        await Promise.all(existingRequests.filter((row) => row._id !== existingRequest._id && row.expiresAt <= Date.now()).map((row) => ctx.db.delete(row._id)));
        return { ...previous, duplicate: true };
      }
      if (existingRequests.length > 0) {
        // Delete expired rows before a replacement insert. Convex indexes are
        // not unique constraints, so leaving the old row would make the next
        // lookup ambiguous after enough retries.
        await Promise.all(existingRequests.map((row) => ctx.db.delete(row._id)));
      }
    }
    // Keyed on the inbox alone: the applicant's copy goes to this address, so
    // a new phone number on each request must not open a fresh window and let
    // one script mail the same person again and again.
    await enforcePublicRateLimit(ctx, {
      scope: "gym_application",
      fingerprint: await privacyFingerprint({ inbox: throttleInbox(values.email) }),
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
    });
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
    // A code is checked when the gym applies, so a mistyped one is caught on
    // the form. It is checked again, and priced, when the gym is set up.
    const promoCode = normalizePromoCode(args.promoCode);
    if (promoCode) {
      const promo = await checkPromo(ctx, promoCode, values.plan, now);
      if (!promo.valid) domainError("VALIDATION_ERROR", "This promo code cannot be used.", { fieldErrors: { promoCode: [promo.reason ?? "not_found"] } });
    }
    const publicId = crypto.randomUUID();
    const applicationDocumentId = await ctx.db.insert("gymApplications", {
      publicId,
      applicationKey: matches.length > 0 ? `${baseKey}::${now}` : baseKey,
      gymName: values.gymName,
      gymAddress: values.gymAddress,
      ownerName: values.ownerName,
      email: values.email,
      contactNumber: values.contactNumber,
      plan: values.plan,
      billingInterval: values.billingInterval,
      ...(args.language ? { language: args.language } : {}),
      ...(args.websiteRequested ? { websiteRequested: true } : {}),
      ...(promoCode ? { promoCode } : {}),
      status: "pending",
      notificationStatus: "pending",
      submittedAt: now,
      updatedAt: now,
    });
    await notifyPlatformAdmins(ctx, {
      kind: "application_awaiting_review",
      title: "Gym application awaiting review",
      body: `${values.gymName} · ${values.plan}`,
      titleMessage: systemMessage("communicationCompletion.notifications.applicationAwaitingReview"),
      bodyMessage: systemMessage("communicationCompletion.notifications.facts2", { a: values.gymName, b: values.plan }),
      href: `/platform/applications?application=${publicId}`,
      dedupeKey: `gym-application:${publicId}`,
    });
    if (idempotencyKey) {
      await ctx.db.insert("publicRequestIdempotency", {
        scope: "gym_application",
        key: idempotencyKey,
        requestHash,
        result: { applicationDocumentId, applicationId: publicId, status: "pending", notificationStatus: "pending", submittedAt: now },
        createdAt: now,
        expiresAt: now + 365 * 86_400_000,
      });
    }
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
  /** Approving an Enterprise application records its quoted monthly price. */
  quotedPriceMinor: v.optional(v.number()),
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
    // An approved application whose provisioning failed permanently and
    // created no workspace is a dead end; rejecting it is the only way to
    // clear it from the operator queue. Every other finalized state stays
    // immutable.
    const provisioningDeadEnd = application.status === "approved"
      && args.decision === "rejected"
      && application.provisioningStatus === "failed"
      && !application.provisionedOrganizationId;
    if ((application.status === "approved" && !provisioningDeadEnd) || application.status === "rejected") {
      domainError("VALIDATION_ERROR", "This gym application has already been finalized.", { correlationId: args.correlationId });
    }

    const note = args.note?.trim() || undefined;
    if (args.decision === "rejected" && !note) {
      domainError("VALIDATION_ERROR", "Add a reason before rejecting an application.", {
        correlationId: args.correlationId,
        fieldErrors: { note: ["Required when rejecting an application"] },
      });
    }

    // Enterprise is sold by quote, so approving one fixes the price the gym
    // will be billed. Other plans use the published catalogue.
    const quotedPriceMinor = args.decision === "approved" && isQuotedPlan(application.plan)
      ? validQuotedPriceMinor(args.quotedPriceMinor ?? application.quotedPriceMinor)
      : undefined;
    if (args.decision === "approved" && isQuotedPlan(application.plan) && quotedPriceMinor === undefined) {
      domainError("VALIDATION_ERROR", "Enter the monthly price you quoted this Enterprise gym.", {
        correlationId: args.correlationId,
        fieldErrors: { quotedPriceMinor: ["Required for Enterprise"] },
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
      ...(quotedPriceMinor !== undefined ? { quotedPriceMinor } : {}),
      // Rejecting a provisioning dead end clears the failure so the operator
      // queue and overview stop flagging an application that can never ship.
      ...(provisioningDeadEnd ? {
        provisioningStatus: undefined,
        provisioningCheckpoint: undefined,
        provisioningOutcome: undefined,
        provisioningError: undefined,
        provisioningStartedAt: undefined,
      } : {}),
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
      after: { status: args.decision, plan: application.plan, ...(quotedPriceMinor !== undefined ? { quotedPriceMinor } : {}) },
      correlationId: args.correlationId,
      occurredAt: now,
    });

    const recordedQuote = quotedPriceMinor ?? application.quotedPriceMinor;
    return {
      applicationDocumentId: application._id,
      applicantLanguage: application.language,
      applicationId: application.publicId,
      gymName: application.gymName,
      gymAddress: application.gymAddress,
      ownerName: application.ownerName,
      email: application.email,
      plan: application.plan,
      billingInterval: application.billingInterval ?? "monthly",
      ...(recordedQuote !== undefined ? { quotedPriceMinor: recordedQuote } : {}),
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
    // A hidden field catches unsophisticated automated form submissions. It
    // intentionally returns the same generic success shape without creating
    // a lead, logging raw input, or revealing which field was detected.
    if (args.website?.trim()) {
      return { applicationId: crypto.randomUUID(), status: "pending", notificationStatus: "pending", submittedAt: new Date().toISOString(), duplicate: false };
    }
    const created = await ctx.runMutation(internal.gymApplications.create, args);
    if (created.duplicate && created.notificationStatus === "sent") return { applicationId: created.applicationId, status: created.status, notificationStatus: created.notificationStatus, submittedAt: new Date(created.submittedAt).toISOString(), duplicate: true };

    const recipients = recipientList(process.env.RIVET_APPLICATION_RECIPIENTS);
    const values = { ...inputValues(args), websiteRequested: args.websiteRequested === true, promoCode: normalizePromoCode(args.promoCode) || undefined };
    const internalCopy = applicationInternalEmail(values, process.env.RIVET_SITE_URL);
    const applicantLanguage = args.language ?? "en";
    const applicantCopy = applicantReceivedEmail(values, applicantLanguage);
    const applicant = await ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: "gym_application_received_applicant",
      templateVersion: "gym-application-received-v3",
      language: applicantLanguage,
      recipientReference: values.email,
      recipientEmail: values.email,
      dedupeKey: `gym-application-received-applicant:${created.applicationId}`,
      relatedEntityType: "gym_application_submission",
      relatedEntityPublicId: created.applicationId,
      ...applicantCopy,
    });
    const internalRecipients = recipients.length > 0 ? recipients : [undefined];
    const internalNotifications = await Promise.all(internalRecipients.map((recipient, index) => ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: "gym_application_received_internal",
      templateVersion: "gym-application-internal-v2",
      recipientReference: recipient ?? "platform-applications",
      recipientEmail: recipient,
      dedupeKey: `gym-application-received-internal:${created.applicationId}:${index}`,
      relatedEntityType: "gym_application_submission",
      relatedEntityPublicId: created.applicationId,
      ...internalCopy,
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
    const { applicationDocumentId, applicantLanguage, ...publicReview } = reviewed as {
      applicationDocumentId: Id<"gymApplications">;
      applicantLanguage?: "en" | "ar";
      applicationId: string;
      gymName: string;
      gymAddress?: string;
      ownerName: string;
      email: string;
      plan: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
      billingInterval: "monthly" | "annual";
      quotedPriceMinor?: number;
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

    const email = applicantReviewEmail({ gymName: publicReview.gymName, ownerName: publicReview.ownerName, plan: publicReview.plan }, args.decision, applicantLanguage ?? "en");
    const queued = await ctx.runMutation(internal.operationalEmail.enqueue, {
      kind: args.decision === "approved" ? "gym_application_approved" : "gym_application_rejected",
      templateVersion: args.decision === "approved" ? "gym-application-approved-v3" : "gym-application-rejected-v3",
      language: applicantLanguage ?? "en",
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
