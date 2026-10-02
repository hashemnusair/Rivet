import { isolate, isolateLtr } from "./bidi";
import type { TFunction, TKey } from "./core";
import { isPluralForms, type MessageVars } from "./dictionary";
import type { Formatters } from "./formatters";
import type { Locale } from "./locale";
import { communicationCompletion as enCatalogue } from "./messages/en/communicationCompletion";
import { domain as enDomain } from "./messages/en/domain";

/**
 * Stable, translatable descriptors for system-generated notifications and
 * timeline events.
 *
 * A record keeps its original stored text forever; a descriptor rides beside
 * it (`titleMessage`, `bodyMessage`) so a reader can see the same event in
 * their own language. The descriptor names a catalogue key and typed
 * parameters. Names, references and reasons stay as written: they are
 * isolated for direction, never translated. Unknown keys, missing or
 * malformed parameters and unrecognised enum values fall back to the
 * original text, so an older or newer record can never render a guess.
 *
 * Pure: no React, no Convex. Shared by Convex creators, the preview adapter
 * and the UI.
 */
export type SystemMessageKey = Extract<TKey, `communicationCompletion.notifications.${string}` | `communicationCompletion.timeline.${string}`>;

/** Enumerations a parameter may name; each maps to catalogue labels. */
export type SystemMessageEnum = "channel" | "paymentMethod" | "messageContext";

export type SystemMessageParam =
  /** Verbatim text (a name, reference, branch or plan): isolated, never translated. */
  | string
  /** A count; drives plural selection when named `count`. */
  | number
  /** A calendar date, YYYY-MM-DD. */
  | { date: string }
  /** A UTC instant, ISO 8601; shown in the reader's gym time zone. */
  | { at: string }
  /** A wall-clock time of day, HH:MM, never converted between time zones. */
  | { clock: string }
  /** Money in integer minor units. */
  | { amountMinor: number; currency: string }
  /** A code-owned value with catalogue labels. */
  | { enum: SystemMessageEnum; value: string }
  /** A nested descriptor, for a fact that is itself a known phrase. */
  | { message: SystemMessage };

export interface SystemMessage {
  key: SystemMessageKey;
  params?: Record<string, SystemMessageParam>;
}

/** Bumped only if the descriptor shape itself changes; keys stay stable. */
export const SYSTEM_MESSAGE_FORMAT = 1;

export function systemMessage(key: SystemMessageKey, params?: Record<string, SystemMessageParam>): SystemMessage {
  return params ? { key, params } : { key };
}

const PREFIX = "communicationCompletion.";
const ENUM_PATHS: Record<SystemMessageEnum, (value: string) => string | undefined> = {
  channel: (value) => value in enCatalogue.values.channel ? `communicationCompletion.values.channel.${value}` : undefined,
  paymentMethod: (value) => value in enDomain.paymentMethod ? `domain.paymentMethod.${value}` : undefined,
  messageContext: (value) => value === "message" ? "communicationCompletion.timeline.contextMessage" : value === "renewal" ? "communicationCompletion.timeline.contextRenewal" : undefined,
};

function leafFor(key: string): unknown {
  if (!key.startsWith(PREFIX)) return undefined;
  let node: unknown = enCatalogue;
  for (const segment of key.slice(PREFIX.length).split(".")) {
    if (!node || typeof node !== "object" || isPluralForms(node)) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" || isPluralForms(node) ? node : undefined;
}

function placeholders(leaf: unknown): Set<string> {
  const texts = typeof leaf === "string" ? [leaf] : Object.values(leaf as Record<string, string>);
  const names = new Set<string>();
  for (const text of texts) for (const match of text.matchAll(/\{(\w+)\}/g)) names.add(match[1]!);
  return names;
}

/** Whether the descriptor names a real catalogue entry and supplies every value it needs. */
export function isRenderableSystemMessage(message: unknown): message is SystemMessage {
  if (!message || typeof message !== "object") return false;
  const { key, params } = message as { key?: unknown; params?: unknown };
  if (typeof key !== "string") return false;
  const leaf = leafFor(key);
  if (!leaf) return false;
  if (params !== undefined && (!params || typeof params !== "object" || Array.isArray(params))) return false;
  const supplied = (params ?? {}) as Record<string, unknown>;
  for (const name of placeholders(leaf)) if (!validParam(supplied[name])) return false;
  return Object.values(supplied).every(validParam);
}

function validParam(value: unknown): boolean {
  if (typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if ("date" in item) return typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date);
  if ("at" in item) return typeof item.at === "string" && Number.isFinite(Date.parse(item.at));
  if ("clock" in item) return typeof item.clock === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.clock);
  if ("amountMinor" in item) return Number.isSafeInteger(item.amountMinor) && typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency);
  if ("enum" in item) return typeof item.value === "string" && typeof item.enum === "string" && item.enum in ENUM_PATHS && Boolean(ENUM_PATHS[item.enum as SystemMessageEnum](item.value));
  if ("message" in item) return isRenderableSystemMessage(item.message);
  return false;
}

export interface SystemTextContext {
  locale: Locale;
  t: TFunction;
  format: Formatters;
}

function renderParam(value: SystemMessageParam, context: SystemTextContext): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return context.locale === "ar" ? isolate(value) : value;
  if ("date" in value) return context.format.date(value.date);
  if ("at" in value) return context.format.dateTime(value.at);
  if ("clock" in value) return context.format.clock(value.clock);
  if ("amountMinor" in value) {
    const amount = context.format.money({ amount: value.amountMinor, currency: value.currency });
    return context.locale === "ar" ? isolateLtr(amount) : amount;
  }
  if ("enum" in value) return context.t(ENUM_PATHS[value.enum](value.value) as TKey);
  return renderSystemMessage(value.message, context);
}

/** The descriptor in the reader's language. Callers must check `isRenderableSystemMessage` first. */
export function renderSystemMessage(message: SystemMessage, context: SystemTextContext): string {
  const vars: MessageVars = {};
  for (const [name, value] of Object.entries(message.params ?? {})) vars[name] = renderParam(value, context);
  return context.t(message.key, vars);
}

/**
 * What a reader sees for one stored line. English shows the stored original,
 * which is the English the system wrote at the time. Another language shows
 * the descriptor when it is renderable, otherwise the original unchanged.
 */
export function presentSystemText(original: string | undefined, message: unknown, context: SystemTextContext): string {
  if (context.locale === "en" && original) return original;
  if (isRenderableSystemMessage(message)) return renderSystemMessage(message, context);
  return original ?? "";
}

// ---------------------------------------------------------------------------
// Historical records written before descriptors existed
// ---------------------------------------------------------------------------

/**
 * Exact system wording, by record kind. A historical record is projected only
 * when its kind and its whole text match one of these; nothing is parsed out
 * of a sentence except a count or a date the system itself wrote. Text that
 * carries names, reasons or provider errors is left as written.
 */
const LEGACY_NOTIFICATION_TITLES: Record<string, Record<string, SystemMessageKey>> = {
  application_awaiting_review: { "Gym application awaiting review": "communicationCompletion.notifications.applicationAwaitingReview" },
  provisioning_failure: {
    "Gym provisioning requires manual correction": "communicationCompletion.notifications.provisioningNeedsCorrection",
    "Gym provisioning failed": "communicationCompletion.notifications.provisioningFailed",
  },
  staff_invitation_failure: { "Staff invitation needs attention": "communicationCompletion.notifications.invitationFailed" },
  operational_email_failed: { "A gym email could not be delivered": "communicationCompletion.notifications.emailFailed" },
  message_delivery_failed: {
    "A member message could not be sent": "communicationCompletion.notifications.messageFailed",
    "A renewal reminder could not be sent": "communicationCompletion.notifications.renewalMessageFailed",
  },
  trial_request: { "New free-trial request": "communicationCompletion.notifications.trialRequest" },
  automation_attention: { "Automation requires attention": "communicationCompletion.notifications.automationAttention" },
  automation_failed: { "Automation retries exhausted": "communicationCompletion.notifications.automationFailed" },
  pt_package_activated: { "PT package activated": "communicationCompletion.notifications.ptPackageActivated" },
  pt_package_request: { "PT package payment requested": "communicationCompletion.notifications.ptPackageRequested" },
  pt_booking: { "New PT booking": "communicationCompletion.notifications.ptBooking" },
  pt_booking_rescheduled: { "PT booking rescheduled": "communicationCompletion.notifications.ptBookingRescheduled" },
  pt_booking_reassigned: { "PT booking reassigned": "communicationCompletion.notifications.ptBookingReassigned" },
  pt_booking_reminder: { "PT session tomorrow": "communicationCompletion.notifications.ptBookingReminder" },
  platform_invoice_past_due: { "RIVET invoice marked past due": "communicationCompletion.notifications.invoicePastDue" },
  support_reply: { "RIVET replied to your support case": "communicationCompletion.notifications.supportReply" },
  support_resolved: { "RIVET resolved your support case": "communicationCompletion.notifications.supportResolved" },
  support_assignment: { "Support case assigned to you": "communicationCompletion.notifications.supportAssigned" },
  support_gym_reply: { "New gym reply on support case": "communicationCompletion.notifications.supportGymReply" },
  support_case_created: {
    "New gym support case": "communicationCompletion.notifications.supportCreated",
    "Urgent gym support case": "communicationCompletion.notifications.supportCreatedUrgent",
  },
  trial_status: {
    "Trial confirmed": "communicationCompletion.notifications.trialConfirmed",
    "Trial completed": "communicationCompletion.notifications.trialCompleted",
    "Trial marked as no-show": "communicationCompletion.notifications.trialNoShow",
    "Trial cancelled": "communicationCompletion.notifications.trialCancelled",
  },
  checkin_override: { "Check-in override recorded": "communicationCompletion.notifications.checkinOverride" },
  refund_review: { "Payment refund recorded": "communicationCompletion.notifications.refundRecorded" },
  void_review: { "Payment voided": "communicationCompletion.notifications.paymentVoided" },
  cash_shift_variance: { "Cash shift variance": "communicationCompletion.notifications.cashVariance" },
  renewal_reminder: { "Membership renewal approaching": "communicationCompletion.notifications.renewalApproaching" },
  membership_expiry: { "Membership end date approaching": "communicationCompletion.notifications.endDateApproaching" },
};

const LEGACY_NOTIFICATION_BODIES: Record<string, Array<{ pattern: RegExp; build: (match: RegExpMatchArray) => SystemMessage }>> = {
  operational_email_failed: [
    { pattern: /^An email could not be delivered after (\d+) attempts\. Check email settings\.$/, build: (m) => systemMessage("communicationCompletion.notifications.emailFailedAttempts", { count: Number(m[1]) }) },
    { pattern: /^The email service could not deliver an email\. Check email settings\.$/, build: () => systemMessage("communicationCompletion.notifications.emailFailedProvider") },
  ],
  message_delivery_failed: [
    { pattern: /^The message could not be sent after (\d+) attempts\. Contact the member another way\.$/, build: (m) => systemMessage("communicationCompletion.notifications.messageFailedBody", { count: Number(m[1]) }) },
    { pattern: /^The renewal reminder could not be sent after (\d+) attempts\. Call the member instead\.$/, build: (m) => systemMessage("communicationCompletion.notifications.renewalMessageFailedBody", { count: Number(m[1]) }) },
  ],
  renewal_reminder: [{ pattern: /^Your current membership term ends (\d{4}-\d{2}-\d{2})\.$/, build: (m) => systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date: m[1]! } }) }],
  membership_expiry: [{ pattern: /^Your current membership term ends (\d{4}-\d{2}-\d{2})\.$/, build: (m) => systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date: m[1]! } }) }],
};

const LEGACY_TIMELINE_TITLES: Record<string, Record<string, SystemMessageKey>> = {
  member_created: { "Member profile created": "communicationCompletion.timeline.memberCreated", "Lead captured": "communicationCompletion.timeline.leadCaptured" },
  membership_unfrozen: { "Freeze ended early": "communicationCompletion.timeline.freezeEnded" },
  membership_cancelled: { "Membership cancelled": "communicationCompletion.timeline.membershipCancelled" },
  note: { "Note added": "communicationCompletion.timeline.noteAdded" },
  call_attempt: { "WhatsApp handoff opened — delivery not confirmed": "communicationCompletion.timeline.whatsappOpened" },
  lead_contact_updated: { "Lead contact details corrected": "communicationCompletion.timeline.leadContactUpdated" },
  lead_lost: { "Lead closed as not sold": "communicationCompletion.timeline.leadLost" },
  trial_confirmed: { "Trial scheduled": "communicationCompletion.timeline.trialScheduled", "Trial confirmed": "communicationCompletion.notifications.trialConfirmed" },
  trial_completed: { "Trial completed": "communicationCompletion.notifications.trialCompleted" },
  trial_no_show: { "Trial marked as no-show": "communicationCompletion.notifications.trialNoShow" },
  trial_cancelled: { "Trial cancelled": "communicationCompletion.notifications.trialCancelled" },
  pt_package_cancelled: { "PT package order cancelled": "communicationCompletion.timeline.ptPackageCancelled" },
  pt_booking_cancelled: {
    "PT booking cancelled — credit restored": "communicationCompletion.timeline.ptCancelledRestored",
    "PT booking cancelled after cutoff — credit used": "communicationCompletion.timeline.ptCancelledUsed",
  },
  pt_session_completed: { "PT session completed": "communicationCompletion.timeline.ptCompleted" },
  pt_session_no_show: { "PT session marked no-show": "communicationCompletion.timeline.ptNoShow" },
  marketing_preference_changed: { "Marketing messages enabled": "communicationCompletion.timeline.marketingEnabled", "Marketing messages disabled": "communicationCompletion.timeline.marketingDisabled" },
  renewal_journey_cancelled: { "Renewal follow-up stopped": "communicationCompletion.timeline.renewalStopped" },
  renewal_message_suppressed: { "Renewal message suppressed": "communicationCompletion.timeline.renewalSuppressed" },
  renewal_call_task_created: { "Renewal call task created": "communicationCompletion.timeline.renewalCallTask" },
  renewal_message_sandboxed: { "Renewal message prepared in sandbox": "communicationCompletion.timeline.renewalSandboxed" },
};

const LEGACY_TIMELINE_BODIES: Record<string, Record<string, SystemMessageKey>> = {
  lead_contact_updated: { "Contact details were updated; pipeline status was unchanged.": "communicationCompletion.timeline.leadContactUpdatedBody" },
  marketing_preference_changed: {
    "Preference changed from opted out to opted in.": "communicationCompletion.timeline.marketingNowIn",
    "Preference changed from opted in to opted out.": "communicationCompletion.timeline.marketingNowOut",
  },
  message: {
    "Redirected to RIVET's sandbox number (sandbox mode). The member did not receive it.": "communicationCompletion.timeline.messageSandboxed",
    "Handed to the messaging provider. Delivery to the phone is not confirmed by RIVET.": "communicationCompletion.timeline.messageHandedOver",
    "Suppressed by RIVET's messaging rules.": "communicationCompletion.timeline.messageSuppressedByRules",
  },
  renewal_message_sandboxed: {
    "A whatsapp reminder was prepared but not sent.": "communicationCompletion.timeline.renewalSandboxedBody",
    "A sms reminder was prepared but not sent.": "communicationCompletion.timeline.renewalSandboxedBody",
  },
};

const SANDBOX_CHANNEL = /^A (whatsapp|sms) reminder was prepared but not sent\.$/;
const MESSAGE_OUTCOME = /^(WhatsApp|SMS) (message|renewal reminder) (accepted by the provider|failed|not sent)$/;
const MESSAGE_FAILED_AFTER = /^Failed after (\d+) attempts?(?: \(([^()]+)\))?\. Managers were notified; follow up by phone\.$/;
const OUTCOME_KEYS: Record<string, SystemMessageKey> = {
  "accepted by the provider": "communicationCompletion.timeline.messageAccepted",
  failed: "communicationCompletion.timeline.messageFailed",
  "not sent": "communicationCompletion.timeline.messageNotSent",
};

/** Delivery-outcome rows are wholly system-written, so their counts, channels and error codes are recoverable exactly. */
function legacyMessageOutcome(record: { title: string; body?: string }): { titleMessage?: SystemMessage; bodyMessage?: SystemMessage } {
  const title = record.title.match(MESSAGE_OUTCOME);
  const failed = (record.body ?? "").match(MESSAGE_FAILED_AFTER);
  return {
    ...(title ? { titleMessage: systemMessage(OUTCOME_KEYS[title[3]!]!, { channel: { enum: "channel", value: title[1] === "SMS" ? "sms" : "whatsapp" }, context: { enum: "messageContext", value: title[2] === "message" ? "message" : "renewal" } }) } : {}),
    ...(failed ? { bodyMessage: systemMessage(failed[2] ? "communicationCompletion.timeline.messageFailedAfterReason" : "communicationCompletion.timeline.messageFailedAfter", { count: Number(failed[1]), ...(failed[2] ? { reason: failed[2] } : {}) }) } : {}),
  };
}

export interface PresentableRecord {
  title?: string;
  body?: string;
  titleMessage?: unknown;
  bodyMessage?: unknown;
}

/** Descriptors for a notification written before descriptors existed, or nothing. */
export function legacyNotificationMessages(record: { kind: string; title: string; body?: string }): { titleMessage?: SystemMessage; bodyMessage?: SystemMessage } {
  const titleKey = LEGACY_NOTIFICATION_TITLES[record.kind]?.[record.title];
  const body = record.body ?? "";
  const bodyRule = LEGACY_NOTIFICATION_BODIES[record.kind]?.find((rule) => rule.pattern.test(body));
  const bodyMatch = bodyRule ? body.match(bodyRule.pattern) : null;
  return {
    ...(titleKey ? { titleMessage: systemMessage(titleKey) } : {}),
    ...(bodyRule && bodyMatch ? { bodyMessage: bodyRule.build(bodyMatch) } : {}),
  };
}

/** Descriptors for a timeline event written before descriptors existed, or nothing. */
export function legacyTimelineMessages(record: { type: string; title: string; body?: string; meta?: Record<string, unknown> }): { titleMessage?: SystemMessage; bodyMessage?: SystemMessage } {
  const titleKey = LEGACY_TIMELINE_TITLES[record.type]?.[record.title];
  const body = record.body ?? "";
  const outcome = record.type === "message" ? legacyMessageOutcome(record) : {};
  const bodyKey = LEGACY_TIMELINE_BODIES[record.type]?.[body];
  const channel = record.type === "renewal_message_sandboxed" ? body.match(SANDBOX_CHANNEL)?.[1] : undefined;
  return {
    ...(titleKey ? { titleMessage: systemMessage(titleKey) } : {}),
    ...(bodyKey ? { bodyMessage: systemMessage(bodyKey, channel ? { channel: { enum: "channel", value: channel } } : undefined) } : {}),
    ...outcome,
  };
}

/** Title and body for a notification in the reader's language. */
export function presentNotification(record: PresentableRecord & { kind: string; title: string; body?: string }, context: SystemTextContext): { title: string; body: string } {
  const legacy = record.titleMessage || record.bodyMessage ? {} : legacyNotificationMessages(record);
  return {
    title: presentSystemText(record.title, record.titleMessage ?? legacy.titleMessage, context),
    body: presentSystemText(record.body, record.bodyMessage ?? legacy.bodyMessage, context),
  };
}

/** Title and body for a timeline event in the reader's language. A body without a descriptor is authored text and stays as written. */
export function presentTimelineEvent(record: PresentableRecord & { type: string; title: string; body?: string; meta?: Record<string, unknown> }, context: SystemTextContext): { title: string; body?: string } {
  const legacy = record.titleMessage || record.bodyMessage ? {} : legacyTimelineMessages(record);
  const body = record.body === undefined && !record.bodyMessage ? undefined : presentSystemText(record.body, record.bodyMessage ?? legacy.bodyMessage, context);
  return { title: presentSystemText(record.title, record.titleMessage ?? legacy.titleMessage, context), ...(body === undefined ? {} : { body }) };
}
