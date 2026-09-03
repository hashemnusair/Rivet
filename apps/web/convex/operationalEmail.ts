import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { notifyOrganizationSupervisors } from "./notificationDelivery";
import { parseEmailAllowlist, resolveEmailMode, routeEmail, sandboxSubject } from "./emailMode";

const RETRY_MINUTES = [1, 5, 30] as const;
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
const LEASE_MS = 2 * 60 * 1000;

type Language = "en" | "ar";
type MessageClass = "service" | "marketing";
type Delivery = Doc<"operationalEmailDeliveries">;
const MANDATORY_PLATFORM_KINDS = new Set(["platform_invoice_issued", "platform_invoice_reminder", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled", "subscription_agreement_signed", "subscription_agreement_countersigned", "subscription_agreement_copy"]);

function providerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

/** The worker runs in every mode except off, and only with a configured provider. */
function deliveryEnabled(): boolean {
  return resolveEmailMode().mode !== "off" && providerConfigured();
}

export interface QueueOperationalEmailInput {
  organizationId?: Id<"organizations">;
  branchId?: Id<"branches">;
  kind: string;
  templateVersion: string;
  language?: Language;
  recipientReference: string;
  recipientEmail?: string;
  relatedEntityType?: string;
  relatedEntityPublicId?: string;
  dedupeKey: string;
  messageClass?: MessageClass;
  suppressionReason?: string;
  subject?: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}

function utcIso(value: number): string {
  return new Date(value).toISOString();
}

function cleanEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

const SERVICE_COPY: Readonly<Record<string, { en: { subject: string; body: string }; ar: { subject: string; body: string } }>> = {
  subscription_agreement_signed: {
    en: { subject: "Your signed RIVET subscription agreement", body: "Thank you for signing your RIVET subscription agreement. Your copy, with your ID number masked, is available in RIVET under Settings → Agreement. RIVET will countersign and confirm the completed agreement." },
    ar: { subject: "اتفاقية اشتراك RIVET الموقّعة", body: "شكرًا لتوقيع اتفاقية اشتراك RIVET. نسختك، مع إخفاء رقم الهوية، متاحة داخل RIVET ضمن الإعدادات ← الاتفاقية. ستوقّع RIVET بدورها وتؤكد الاتفاقية النهائية." },
  },
  subscription_agreement_copy: {
    en: { subject: "A gym signed its RIVET subscription agreement", body: "A gym owner signed the RIVET subscription agreement. The full record, with the signature, is in the platform console under Agreements." },
    ar: { subject: "وقّع نادٍ اتفاقية اشتراك RIVET", body: "وقّع مالك نادٍ اتفاقية اشتراك RIVET. السجل الكامل مع التوقيع متاح في لوحة المنصة ضمن الاتفاقيات." },
  },
  subscription_agreement_countersigned: {
    en: { subject: "RIVET countersigned your subscription agreement", body: "RIVET has countersigned your subscription agreement. The completed agreement, with both signatures, is available in RIVET under Settings → Agreement." },
    ar: { subject: "وقّعت RIVET اتفاقية اشتراككم", body: "وقّعت RIVET اتفاقية الاشتراك الخاصة بكم. الاتفاقية المكتملة بالتوقيعين متاحة داخل RIVET ضمن الإعدادات ← الاتفاقية." },
  },
  trial_request_confirmation: {
    en: { subject: "Your RIVET trial request", body: "Your trial request was received. Sign in to RIVET to see its current status and the gym's response." },
    ar: { subject: "طلب التجربة في RIVET", body: "تم استلام طلب التجربة. سجّل الدخول إلى RIVET للاطلاع على حالته الحالية ورد النادي." },
  },
  trial_status: {
    en: { subject: "Your RIVET trial request was updated", body: "Your gym updated the status of your trial request. Sign in to RIVET to view the current outcome and any follow-up." },
    ar: { subject: "تم تحديث طلب التجربة في RIVET", body: "قام النادي بتحديث حالة طلب التجربة. سجّل الدخول إلى RIVET لعرض النتيجة الحالية وأي متابعة." },
  },
  payment_receipt: {
    en: { subject: "Your RIVET payment receipt", body: "A payment was recorded on your gym account. Sign in to RIVET to view the authoritative receipt and remaining balance." },
    ar: { subject: "إيصال دفع من RIVET", body: "تم تسجيل دفعة في حساب النادي. سجّل الدخول إلى RIVET لعرض الإيصال المعتمد والرصيد المتبقي." },
  },
  renewal_reminder: {
    en: { subject: "Your gym membership is approaching renewal", body: "Your current membership term is approaching its renewal date. Sign in to RIVET to review the current term, upcoming invoice, and gym contact details." },
    ar: { subject: "موعد تجديد عضوية النادي يقترب", body: "تقترب عضويتك الحالية من تاريخ التجديد. سجّل الدخول إلى RIVET لمراجعة المدة الحالية والفاتورة القادمة وبيانات التواصل مع النادي." },
  },
  membership_expiry: {
    en: { subject: "Your gym membership is approaching expiry", body: "Your current membership term is approaching expiry. Sign in to RIVET to review the authoritative membership status and contact the gym." },
    ar: { subject: "عضوية النادي تقترب من الانتهاء", body: "تقترب عضويتك الحالية من الانتهاء. سجّل الدخول إلى RIVET لمراجعة حالة العضوية المعتمدة والتواصل مع النادي." },
  },
  support_acknowledgement: {
    en: { subject: "RIVET received your support request", body: "Your support case was received. You can follow its current status and conversation in RIVET." },
    ar: { subject: "استلمت RIVET طلب الدعم", body: "تم استلام طلب الدعم. يمكنك متابعة الحالة الحالية والمحادثة داخل RIVET." },
  },
  support_reply: {
    en: { subject: "RIVET replied to your support case", body: "There is a new reply on your support case. Sign in to RIVET to read the persisted conversation." },
    ar: { subject: "رد جديد على طلب الدعم", body: "يوجد رد جديد على طلب الدعم. سجّل الدخول إلى RIVET لقراءة المحادثة المحفوظة." },
  },
  support_resolved: {
    en: { subject: "Your RIVET support case was resolved", body: "Your support case was marked resolved. Sign in to RIVET to view the resolution or reopen the case." },
    ar: { subject: "تم حل طلب الدعم في RIVET", body: "تم وضع طلب الدعم بحالة محلول. سجّل الدخول إلى RIVET لعرض الحل أو إعادة فتح الطلب." },
  },
  platform_invoice_issued: {
    en: { subject: "A RIVET invoice was issued", body: "A platform invoice was issued for your gym. Sign in to RIVET to view the amount, billing period, and due date." },
    ar: { subject: "تم إصدار فاتورة RIVET", body: "تم إصدار فاتورة منصة للنادي. سجّل الدخول إلى RIVET لعرض المبلغ وفترة الفوترة وتاريخ الاستحقاق." },
  },
  platform_invoice_reminder: {
    en: { subject: "Your RIVET invoice is coming due", body: "Your next RIVET platform invoice is due in three days. Sign in to review the amount, billing period, and due date." },
    ar: { subject: "فاتورة RIVET مستحقة قريباً", body: "تستحق فاتورة منصة RIVET القادمة خلال ثلاثة أيام. سجّل الدخول لمراجعة المبلغ وفترة الفوترة وتاريخ الاستحقاق." },
  },
  platform_invoice_paid: {
    en: { subject: "Your RIVET invoice was marked paid", body: "An offline payment was recorded against your platform invoice. Sign in to RIVET to view the reference and status." },
    ar: { subject: "تم تسجيل فاتورة RIVET كمدفوعة", body: "تم تسجيل دفعة يدوية على فاتورة المنصة. سجّل الدخول إلى RIVET لعرض المرجع والحالة." },
  },
  platform_invoice_past_due: {
    en: { subject: "Your RIVET invoice is past due", body: "A platform invoice was marked past due. Sign in to RIVET to review the authoritative invoice and contact support if needed." },
    ar: { subject: "فاتورة RIVET متأخرة", body: "تم وضع فاتورة المنصة بحالة متأخرة. سجّل الدخول إلى RIVET لمراجعة الفاتورة المعتمدة والتواصل مع الدعم عند الحاجة." },
  },
  platform_subscription_suspended: {
    en: { subject: "Your RIVET subscription was suspended", body: "Your gym's RIVET subscription was suspended. Sign in to review the current status or contact RIVET support." },
    ar: { subject: "تم تعليق اشتراك RIVET", body: "تم تعليق اشتراك النادي في RIVET. سجّل الدخول لمراجعة الحالة الحالية أو التواصل مع دعم RIVET." },
  },
  platform_subscription_cancelled: {
    en: { subject: "Your RIVET subscription was cancelled", body: "Your gym's RIVET subscription was cancelled. Sign in to review the current status or contact RIVET support." },
    ar: { subject: "تم إلغاء اشتراك RIVET", body: "تم إلغاء اشتراك النادي في RIVET. سجّل الدخول لمراجعة الحالة الحالية أو التواصل مع دعم RIVET." },
  },
  pt_package_paid: {
    en: { subject: "Your PT sessions are available", body: "Your PT package is fully paid and its sessions are now available. Sign in to RIVET to view the balance and book." },
    ar: { subject: "جلسات التدريب الشخصي متاحة", body: "تم دفع باقة التدريب الشخصي بالكامل وأصبحت الجلسات متاحة. سجّل الدخول إلى RIVET لعرض الرصيد والحجز." },
  },
  pt_booking_confirmation: {
    en: { subject: "Your PT session is booked", body: "A PT credit was reserved for your booking. Sign in to RIVET to view the trainer, branch, time, and cancellation cutoff." },
    ar: { subject: "تم حجز جلسة التدريب الشخصي", body: "تم حجز رصيد لجلسة التدريب الشخصي. سجّل الدخول إلى RIVET لعرض المدرب والفرع والوقت وموعد الإلغاء." },
  },
  pt_booking_update: {
    en: { subject: "Your PT booking was updated", body: "Your PT booking changed. Sign in to RIVET to see the current time, status, and credit outcome." },
    ar: { subject: "تم تحديث حجز التدريب الشخصي", body: "تم تغيير حجز التدريب الشخصي. سجّل الدخول إلى RIVET لعرض الوقت والحالة ونتيجة الرصيد." },
  },
  pt_booking_reminder: {
    en: { subject: "Your PT session is tomorrow", body: "Your PT session starts in about 24 hours. Sign in to RIVET to review the booking and cancellation policy." },
    ar: { subject: "جلسة التدريب الشخصي غداً", body: "تبدأ جلسة التدريب الشخصي خلال نحو 24 ساعة. سجّل الدخول إلى RIVET لمراجعة الحجز وسياسة الإلغاء." },
  },
  pt_low_balance: {
    en: { subject: "Your PT session balance is low", body: "Your available PT session balance is low. Sign in to RIVET to review the balance and available gym packages." },
    ar: { subject: "رصيد جلسات التدريب الشخصي منخفض", body: "رصيد جلسات التدريب الشخصي المتاح منخفض. سجّل الدخول إلى RIVET لمراجعة الرصيد وباقات النادي المتاحة." },
  },
};

function fallbackContent(kind: string, language: Language) {
  const localized = SERVICE_COPY[kind]?.[language];
  const label = kind.replaceAll("_", " ");
  const subject = localized?.subject ?? (language === "ar" ? "تحديث خدمة من RIVET" : "A service update from RIVET");
  const body = localized?.body ?? (language === "ar" ? `لديك تحديث جديد بخصوص ${label}. سجّل الدخول إلى RIVET للاطلاع على التفاصيل.` : `There is a new update about ${label}. Sign in to RIVET to view the authoritative details.`);
  if (language === "ar") {
    return {
      subject,
      text: body,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.7"><h2>${subject}</h2><p>${body}</p></div>`,
    };
  }
  return {
    subject,
    text: body,
    html: `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6"><h2>${subject}</h2><p>${body}</p></div>`,
  };
}

async function mirrorDelivery(ctx: MutationCtx, delivery: Delivery) {
  if (!delivery.organizationId) return;
  const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) =>
    q.eq("organizationId", delivery.organizationId!).eq("entityType", "operationalEmailDelivery").eq("publicId", delivery.publicId),
  ).unique();
  const value = {
    id: delivery.publicId,
    kind: delivery.kind,
    messageClass: delivery.messageClass,
    templateVersion: delivery.templateVersion,
    language: delivery.language,
    recipientReference: delivery.recipientReference,
    recipientEmail: delivery.recipientEmail,
    relatedEntityType: delivery.relatedEntityType,
    relatedEntityPublicId: delivery.relatedEntityPublicId,
    dedupeKey: delivery.dedupeKey,
    providerId: delivery.providerId,
    attempts: delivery.attempts.map((attempt) => ({
      attemptedAt: utcIso(attempt.attemptedAt),
      outcome: attempt.outcome,
      statusCode: attempt.statusCode,
      errorCode: attempt.errorCode,
      mode: attempt.mode,
      deliveredTo: attempt.deliveredTo,
    })),
    attachments: delivery.attachments?.map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, bytes: Math.floor((attachment.contentBase64.length * 3) / 4) })),
    retryPolicy: { maxAttempts: MAX_ATTEMPTS, backoffMinutes: [...RETRY_MINUTES] },
    nextAttemptAt: delivery.nextAttemptAt ? utcIso(delivery.nextAttemptAt) : undefined,
    status: delivery.status,
    suppressionReason: delivery.suppressionReason,
    queuedAt: utcIso(delivery.createdAt),
    updatedAt: utcIso(delivery.updatedAt),
  };
  if (existing) await ctx.db.patch(existing._id, { data: value, updatedAt: delivery.updatedAt });
  else await ctx.db.insert("domainRecords", {
    organizationId: delivery.organizationId,
    entityType: "operationalEmailDelivery",
    publicId: delivery.publicId,
    branchId: delivery.branchId,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    data: value,
  });
}

export async function enqueueOperationalEmail(ctx: MutationCtx, input: QueueOperationalEmailInput): Promise<Delivery> {
  const existing = await ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", input.dedupeKey)).unique();
  if (existing) return existing;
  const now = Date.now();
  const language = input.language ?? "en";
  const content = fallbackContent(input.kind, language);
  const recipientEmail = cleanEmail(input.recipientEmail);
  let suppressionReason = input.suppressionReason ?? (!recipientEmail ? "A valid recipient email is not available" : undefined);
  if (!suppressionReason) {
    if (!deliveryEnabled()) suppressionReason = resolveEmailMode().mode === "off" ? "Operational email mode is off (RIVET_EMAIL_MODE)" : "The email provider is not configured";
    else if (input.organizationId && !MANDATORY_PLATFORM_KINDS.has(input.kind)) {
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", input.organizationId!)).unique();
      if (!settings?.ownerConfirmedAt) suppressionReason = "The gym owner has not confirmed operational email preferences";
      else if (!settings.enabledKinds.includes(input.kind)) suppressionReason = "This operational email type is not enabled";
    } else if (!input.organizationId) {
      const enabledKinds = (process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      if (!enabledKinds.includes(input.kind)) suppressionReason = "This platform operational email type is not enabled";
    }
  }
  const id = await ctx.db.insert("operationalEmailDeliveries", {
    publicId: `EMAIL-${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    messageClass: input.messageClass ?? "service",
    templateVersion: input.templateVersion,
    language,
    recipientReference: input.recipientReference,
    recipientEmail,
    relatedEntityType: input.relatedEntityType,
    relatedEntityPublicId: input.relatedEntityPublicId,
    subject: input.subject ?? content.subject,
    html: input.html ?? content.html,
    text: input.text ?? content.text,
    attachments: input.attachments,
    dedupeKey: input.dedupeKey,
    attempts: [],
    status: suppressionReason ? "suppressed" : "queued",
    suppressionReason,
    nextAttemptAt: suppressionReason ? undefined : now,
    createdAt: now,
    updatedAt: now,
  });
  const delivery = (await ctx.db.get(id))!;
  await mirrorDelivery(ctx, delivery);
  await syncRelatedApplicationStatus(ctx, delivery);
  return delivery;
}

async function syncRelatedApplicationStatus(ctx: MutationCtx, delivery: Delivery) {
  if (!delivery.relatedEntityPublicId || !["gym_application_submission", "gym_application_review"].includes(delivery.relatedEntityType ?? "")) return;
  const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", delivery.relatedEntityPublicId!)).unique();
  if (!application) return;
  const related = await ctx.db.query("operationalEmailDeliveries").withIndex("by_related_entity", (q) =>
    q.eq("relatedEntityType", delivery.relatedEntityType).eq("relatedEntityPublicId", delivery.relatedEntityPublicId),
  ).collect();
  const status = related.some((item) => item.status === "failed")
    ? "failed" as const
    : related.length > 0 && related.every((item) => item.status === "delivered")
      ? "sent" as const
      : related.some((item) => item.status === "suppressed")
        ? "not_configured" as const
        : "pending" as const;
  const error = status === "failed"
    ? "One or more durable application emails reached terminal delivery failure."
    : status === "not_configured"
      ? "Application email delivery is sandboxed or not fully configured."
      : undefined;
  if (delivery.relatedEntityType === "gym_application_submission") {
    await ctx.db.patch(application._id, { notificationStatus: status, notificationError: error, updatedAt: Date.now() });
  } else {
    await ctx.db.patch(application._id, { reviewNotificationStatus: status, reviewNotificationError: error, updatedAt: Date.now() });
  }
}

export const enqueue = internalMutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    branchId: v.optional(v.id("branches")),
    kind: v.string(),
    templateVersion: v.string(),
    language: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    recipientReference: v.string(),
    recipientEmail: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityPublicId: v.optional(v.string()),
    dedupeKey: v.string(),
    messageClass: v.optional(v.union(v.literal("service"), v.literal("marketing"))),
    suppressionReason: v.optional(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.object({ publicId: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const delivery = await enqueueOperationalEmail(ctx, args);
    return { publicId: delivery.publicId, status: delivery.status };
  },
});

async function kindEnabled(ctx: MutationCtx, delivery: Delivery): Promise<boolean> {
  if (MANDATORY_PLATFORM_KINDS.has(delivery.kind)) return true;
  if (!delivery.organizationId) {
    const kinds = (process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return kinds.includes(delivery.kind);
  }
  const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", delivery.organizationId!)).unique();
  return Boolean(settings?.ownerConfirmedAt && settings.enabledKinds.includes(delivery.kind));
}

export const leaseDue = internalMutation({
  args: { limit: v.number() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const queued = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "queued")).collect();
    const retrying = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "retrying")).collect();
    const expiredLeases = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "leased")).collect();
    const candidates = [...queued, ...retrying, ...expiredLeases]
      .filter((delivery) => (delivery.nextAttemptAt ?? 0) <= now && (delivery.status !== "leased" || (delivery.leaseExpiresAt ?? 0) <= now))
      .sort((left, right) => (left.nextAttemptAt ?? left.createdAt) - (right.nextAttemptAt ?? right.createdAt));
    const leased: Delivery[] = [];
    for (const delivery of candidates.slice(0, Math.max(0, Math.min(args.limit, 50)))) {
      if (!await kindEnabled(ctx, delivery)) {
        await ctx.db.patch(delivery._id, { status: "suppressed", suppressionReason: "This operational email type was disabled before delivery", nextAttemptAt: undefined, leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: now });
        const suppressed = (await ctx.db.get(delivery._id))!;
        await mirrorDelivery(ctx, suppressed);
        await syncRelatedApplicationStatus(ctx, suppressed);
        continue;
      }
      const leaseToken = crypto.randomUUID();
      await ctx.db.patch(delivery._id, { status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS, updatedAt: now });
      leased.push({ ...delivery, status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS, updatedAt: now });
    }
    return leased;
  },
});

export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("operationalEmailDeliveries"),
    leaseToken: v.string(),
    accepted: v.boolean(),
    retryable: v.boolean(),
    providerId: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    mode: v.optional(v.string()),
    deliveredTo: v.optional(v.string()),
    suppressionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "leased" || delivery.leaseToken !== args.leaseToken) return null;
    const now = Date.now();
    const suppressed = Boolean(args.suppressionReason);
    const attempts = [...delivery.attempts, {
      attemptedAt: now,
      outcome: suppressed ? "suppressed" as const : args.accepted ? "accepted" as const : args.retryable ? "retryable_failure" as const : "terminal_failure" as const,
      statusCode: args.statusCode,
      errorCode: args.errorCode,
      mode: args.mode,
      deliveredTo: args.deliveredTo,
    }];
    const exhausted = attempts.length >= MAX_ATTEMPTS;
    const status = suppressed ? "suppressed" as const : args.accepted ? "provider_accepted" as const : args.retryable && !exhausted ? "retrying" as const : "failed" as const;
    const nextAttemptAt = status === "retrying" ? now + (RETRY_MINUTES[Math.min(attempts.length - 1, RETRY_MINUTES.length - 1)] ?? RETRY_MINUTES[RETRY_MINUTES.length - 1] ?? 30) * 60_000 : undefined;
    await ctx.db.patch(delivery._id, {
      attempts,
      status,
      providerId: args.providerId ?? delivery.providerId,
      nextAttemptAt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: args.errorCode,
      ...(suppressed ? { suppressionReason: args.suppressionReason } : {}),
      updatedAt: now,
    });
    const updated = (await ctx.db.get(delivery._id))!;
    await mirrorDelivery(ctx, updated);
    await syncRelatedApplicationStatus(ctx, updated);
    if (status === "failed" && delivery.organizationId) {
      await notifyOrganizationSupervisors(ctx, {
        organizationId: delivery.organizationId,
        branchId: delivery.branchId,
        kind: "operational_email_failed",
        title: "An operational email needs attention",
        body: `${delivery.kind.replaceAll("_", " ")} could not be delivered after ${attempts.length} attempts.`,
        // The automation workspace is intentionally deferred. Email delivery
        // failures belong with the authoritative activation/provider controls.
        href: "/settings?section=email",
        dedupeKey: `operational-email-failed:${delivery.publicId}`,
      });
    }
    return null;
  },
});

export const recordWebhook = internalMutation({
  args: {
    webhookId: v.string(),
    providerId: v.optional(v.string()),
    eventType: v.string(),
    occurredAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("operationalEmailWebhookEvents").withIndex("by_webhook_id", (q) => q.eq("webhookId", args.webhookId)).unique();
    if (duplicate) return null;
    await ctx.db.insert("operationalEmailWebhookEvents", { ...args, receivedAt: Date.now() });
    if (!args.providerId) return null;
    const delivery = await ctx.db.query("operationalEmailDeliveries").withIndex("by_provider_id", (q) => q.eq("providerId", args.providerId)).unique();
    if (!delivery) return null;
    if ((delivery.providerEventAt ?? 0) > args.occurredAt) return null;
    const nextStatus = args.eventType === "email.delivered" ? "delivered" : ["email.bounced", "email.failed", "email.suppressed"].includes(args.eventType) ? "failed" : undefined;
    if (!nextStatus) return null;
    await ctx.db.patch(delivery._id, { status: nextStatus, providerEventAt: args.occurredAt, lastErrorCode: nextStatus === "failed" ? args.eventType : undefined, updatedAt: Date.now() });
    const updated = (await ctx.db.get(delivery._id))!;
    await mirrorDelivery(ctx, updated);
    await syncRelatedApplicationStatus(ctx, updated);
    if (nextStatus === "failed" && delivery.organizationId) {
      await notifyOrganizationSupervisors(ctx, {
        organizationId: delivery.organizationId,
        branchId: delivery.branchId,
        kind: "operational_email_failed",
        title: "An operational email needs attention",
        body: `${delivery.kind.replaceAll("_", " ")} received a terminal provider event.`,
        href: "/settings?section=email",
        dedupeKey: `operational-email-failed:${delivery.publicId}`,
      });
    }
    return null;
  },
});

export const processDue = internalAction({
  args: {},
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async (ctx) => {
    if (!deliveryEnabled()) return { processed: 0, disabled: true };
    const { mode } = resolveEmailMode();
    const sandboxTo = process.env.RIVET_EMAIL_SANDBOX_TO;
    const allowlist = parseEmailAllowlist(process.env.RIVET_EMAIL_ALLOWLIST);
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from = process.env.RESEND_FROM_EMAIL!.trim();
    const deliveries = await ctx.runMutation(internal.operationalEmail.leaseDue, { limit: 25 }) as Delivery[];
    let processed = 0;
    for (const delivery of deliveries) {
      if (!delivery.leaseToken || !delivery.recipientEmail) continue;
      // The mode decides where the message may go. Sandbox never reaches the
      // real inbox; allowlist drops with a reason the gym can read; both are
      // recorded on the attempt so an audit shows exactly what happened.
      const route = routeEmail({ mode, kind: delivery.kind, recipient: delivery.recipientEmail, sandboxTo, allowlist });
      if (route.decision === "drop") {
        await ctx.runMutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id, leaseToken: delivery.leaseToken, accepted: false, retryable: false, mode, suppressionReason: route.reason });
        processed += 1;
        continue;
      }
      const to = route.to;
      const subject = route.decision === "redirect" ? sandboxSubject(delivery.subject, route.originalRecipient) : delivery.subject;
      let accepted = false;
      let retryable = true;
      let providerId: string | undefined;
      let statusCode: number | undefined;
      let errorCode: string | undefined;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": delivery.dedupeKey },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            html: delivery.html,
            text: delivery.text,
            ...(delivery.attachments?.length ? { attachments: delivery.attachments.map((attachment) => ({ filename: attachment.filename, content: attachment.contentBase64, content_type: attachment.contentType })) } : {}),
          }),
        });
        statusCode = response.status;
        accepted = response.ok;
        retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
        if (response.ok) {
          const payload = await response.json() as { id?: string };
          providerId = payload.id;
          if (!providerId) {
            accepted = false;
            retryable = true;
            errorCode = "provider_response_missing_id";
          }
        } else errorCode = `provider_http_${response.status}`;
      } catch {
        errorCode = "provider_network_error";
      }
      await ctx.runMutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id, leaseToken: delivery.leaseToken, accepted, retryable, providerId, statusCode, errorCode, mode, deliveredTo: to });
      processed += 1;
    }
    return { processed, disabled: false };
  },
});
