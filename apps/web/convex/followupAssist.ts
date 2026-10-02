import {
  CONTACT_OUTCOME_LABELS,
  REACHED_OUTCOMES,
  isContactOutcome,
  resolveFollowUpTasks,
  suggestedFollowUpDays,
  type ContactOutcome,
  type FollowUpTaskFact,
} from "../src/lib/crm/contact-outcomes";
import { MESSAGE_TEMPLATE_CATALOGUE, renderMessageTemplate, type CatalogueTemplate } from "./messagingTemplates";
import { consentForRenewalChannel, isRenewalQuietHours, nextRenewalQuietHoursEnd, renewalMessageSuppressionReason, renewalStopReason, type RenewalConsentStatus } from "./renewalPolicy";

/**
 * Connected staff follow-up assistance: the pure logic shared by the server
 * loaders, the preview adapter and the pages.
 *
 * Everything that decides what is allowed stays deterministic here: which
 * outcomes exist for a lead or a member, what a chosen outcome does to the
 * stage, the follow-up date and the open tasks, whether renewal reminders are
 * suppressed, opted out, deferred by quiet hours or already queued, which
 * templates are approved for the timing, and which permission each reason
 * check needs.
 *
 * No Convex or path-alias imports: the browser preview adapter shares it.
 */
type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  const result = text(value).trim();
  return result || undefined;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / DAY_MS);
}

/** Whole calendar days from `from` to `to` (YYYY-MM-DD); negative when `to` is earlier. */
export function followUpDaysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A short, whitespace-normalised excerpt of a note for recorded evidence lists. */
export function followUpExcerpt(value: string | undefined, max = 200): string | undefined {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return undefined;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function mentionsAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

// ---------------------------------------------------------------------------
// Recorded context: what a note or a call actually mentions
// ---------------------------------------------------------------------------

export type FollowUpTopic = "callback" | "travel" | "complaint";

/** Latin patterns run against the lower-cased text; Arabic patterns match as substrings (no word boundaries). */
const TRAVEL_PATTERNS: readonly RegExp[] = [
  /\b(travel(l?ing|s|led)?|abroad|out of (the )?country|on a trip|trip to|away until|back on|back in|returns? (on|in)|overseas|holiday|vacation|out of town|umrah|hajj)\b/i,
  /(مسافر|مسافرة|سفر|بسافر|برا البلد|خارج البلد|راجع بعد|راجعة بعد|عمرة|الحج)/u,
];
const COMPLAINT_PATTERNS: readonly RegExp[] = [
  /\b(complain(t|ed|ing|s)?|unhappy|angry|upset|frustrated|furious|rude|dirty|broken|not working|out of order|overcharged|charged twice|double charged|dispute|disputed|refund|too crowded|no hot water|too expensive|bad experience|poor service|didn'?t like|did not like)\b/i,
  /(شكوى|اشتكى|اشتكت|زعلان|زعلانة|معصب|معصبة|مش راضي|مش راضية|خربان|مكسور|وسخ|غالي|مش مبسوط|مش مبسوطة|تعامل سيء)/u,
];
const CALLBACK_PATTERNS: readonly RegExp[] = [
  /\b(call (him|her|them|me) (back|again|later|tomorrow|tonight|next week)|call back|callback|ring (back|again|later)|phone (back|later)|try (again|later)|asked (me|us) to call|wants? a call|call after|call on (mon|tue|wed|thu|fri|sat|sun)|reach (him|her|them) (after|on|at)|later today|tomorrow (morning|afternoon|evening)|next week|after (work|ramadan|eid|the weekend))\b/i,
  /(اتصل (لاحقا|لاحقاً|بكرة|بكرا|بعدين|بعد|يوم)|اتصلي (لاحقا|لاحقاً|بكرة|بكرا|بعدين)|رجع اتصال|عاود الاتصال|عاودي الاتصال|بدو اتصال|بدها اتصال|اتصلوا فيه|اتصلوا فيها|كلمني بعدين|كلميني بعدين)/u,
];

/** Which of the recorded topics a piece of free text mentions. Deterministic; shown beside the text, never instead of it. */
export function followUpTopicsIn(value: string | undefined): FollowUpTopic[] {
  const source = normalizeWhitespace(value ?? "");
  if (!source) return [];
  const lower = source.toLowerCase();
  const topics: FollowUpTopic[] = [];
  if (mentionsAny(lower, CALLBACK_PATTERNS) || mentionsAny(source, CALLBACK_PATTERNS)) topics.push("callback");
  if (mentionsAny(lower, TRAVEL_PATTERNS) || mentionsAny(source, TRAVEL_PATTERNS)) topics.push("travel");
  if (mentionsAny(lower, COMPLAINT_PATTERNS) || mentionsAny(source, COMPLAINT_PATTERNS)) topics.push("complaint");
  return topics;
}

// ---------------------------------------------------------------------------
// 1. Manual contact outcome contract
// ---------------------------------------------------------------------------

export const FOLLOWUP_NOTE_MIN_LENGTH = 8;

export type ContactSubjectKind = "member" | "lead";

/** The outcomes a person may record by hand, in the form's order; trial outcomes exist for leads only. */
export const MANUAL_CONTACT_OUTCOMES: Record<ContactSubjectKind, readonly ContactOutcome[]> = {
  lead: ["no_answer", "answered_interested", "answered_call_back", "answered_not_interested", "whatsapp_sent", "trial_booked", "trial_completed", "wrong_number"],
  member: ["no_answer", "answered_interested", "answered_call_back", "answered_not_interested", "whatsapp_sent", "wrong_number"],
};

export interface ContactConsequenceTask extends FollowUpTaskFact {
  title: string;
  ownerName?: string;
}

export type ContactTaskEffect =
  | { effect: "reschedule"; task: ContactConsequenceTask; to: string }
  | { effect: "complete"; task: ContactConsequenceTask }
  | { effect: "kept"; task: ContactConsequenceTask; why: "other_owner" | "later" };

export interface ContactConsequences {
  followUp: { kind: "date"; date: string; source: "suggested" | "typed" } | { kind: "none" };
  tasks: ContactTaskEffect[];
  createsTask: boolean;
  stage?: { from?: string; to: string };
}

/**
 * What logging an outcome would do, computed exactly the way the mutation
 * does it: the shared task resolution, the suggested retry gap, and the lead
 * stage the form would send. Nothing here writes; it is the preview a person
 * reads before accepting a suggested outcome.
 */
export function previewContactConsequences(input: {
  subject: ContactSubjectKind;
  subjectId: string;
  outcome: ContactOutcome;
  /** The follow-up date currently in the form (YYYY-MM-DD), if the person typed or kept one. */
  typedFollowUpDate?: string;
  followUpTouched: boolean;
  today: string;
  tasks: readonly ContactConsequenceTask[];
  actorId: string;
  canManageTeam: boolean;
  isDue: (dueAt: string) => boolean;
  stageAfter?: (outcome: ContactOutcome) => string | undefined;
  currentStage?: string;
}): ContactConsequences {
  const suggestedDays = suggestedFollowUpDays(input.outcome);
  const date = input.followUpTouched
    ? input.typedFollowUpDate
    : suggestedDays
      ? new Date((dayNumber(input.today) + suggestedDays) * DAY_MS).toISOString().slice(0, 10)
      : undefined;
  const nextFollowUpAt = date ? `${date}T10:00:00.000Z` : undefined;
  const subject = input.subject === "member" ? { memberId: input.subjectId } : { leadId: input.subjectId };
  const resolution = resolveFollowUpTasks({ tasks: input.tasks, subject, actorId: input.actorId, canManageTeam: input.canManageTeam, nextFollowUpAt, outcome: input.outcome, isDue: input.isDue });
  const touched = new Set<string>([...(resolution.reschedule ? [resolution.reschedule.id] : []), ...resolution.complete.map((task) => task.id)]);
  const effects: ContactTaskEffect[] = [];
  if (resolution.reschedule && date) effects.push({ effect: "reschedule", task: resolution.reschedule, to: date });
  for (const task of resolution.complete) effects.push({ effect: "complete", task });
  for (const task of input.tasks) {
    if (task.status !== "open" || touched.has(task.id)) continue;
    const about = input.subject === "member" ? task.memberId === input.subjectId : task.leadId === input.subjectId;
    if (!about) continue;
    const mine = input.canManageTeam || !task.ownerId || task.ownerId === input.actorId;
    effects.push({ effect: "kept", task, why: mine ? "later" : "other_owner" });
  }
  const to = input.stageAfter?.(input.outcome);
  return {
    followUp: date ? { kind: "date", date, source: input.followUpTouched ? "typed" : "suggested" } : { kind: "none" },
    tasks: effects,
    createsTask: input.subject === "member" && resolution.createFollowUp && Boolean(nextFollowUpAt),
    ...(to && to !== input.currentStage ? { stage: { from: input.currentStage, to } } : {}),
  };
}

// ---------------------------------------------------------------------------
// 2. Related open work
// ---------------------------------------------------------------------------

export const TASK_TYPE_LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  renewal_call: "Renewal call",
  payment_collection: "Payment collection",
  trial_follow_up: "Trial follow-up",
  general: "General",
};

export interface FollowUpRelatedTask {
  id: string;
  type: string;
  title: string;
  ownerId?: string;
  ownerName: string;
  dueAt: string;
  priority: string;
  status: string;
  /** Owned by the person asking (or by nobody). */
  mine: boolean;
  createdById?: string;
  relatedTaskId?: string;
  relatedTaskTitle?: string;
}

// ---------------------------------------------------------------------------
// 3. The member's recorded follow-up context
// ---------------------------------------------------------------------------

export const FOLLOWUP_EVIDENCE_LIMIT = 12;

export type FollowUpEvidenceKind = "contact" | "note" | "message" | "freeze" | "snooze" | "renewal";
export type FollowUpEvidenceFlag = "callback_requested" | "reached" | "opened_not_sent" | "provider_accepted_not_confirmed" | "not_sent" | "mentions_travel" | "mentions_complaint";

export interface FollowUpEvidence {
  /** The timeline event id: the reusable reference a page links to. */
  id: string;
  type: string;
  kind: FollowUpEvidenceKind;
  title: string;
  excerpt?: string;
  occurredAt: string;
  actorName?: string;
  outcome?: string;
  outcomeLabel?: string;
  topics: FollowUpTopic[];
  flags: FollowUpEvidenceFlag[];
}

export interface FollowUpDelivery {
  id: string;
  checkpointKey: string;
  channel: string;
  status: string;
  /** Truthful wording: queued is not delivered, accepted by the provider is not confirmed. */
  label: string;
  detail?: string;
  updatedAt: string;
}

export interface FollowUpMoney {
  amount: number;
  currency: string;
}

export interface MemberFollowUpContext {
  memberId: string;
  memberName: string;
  /** For the WhatsApp handoff only; never part of assistance context. */
  phone?: string;
  preferredLanguage: "en" | "ar";
  generatedAt: string;
  renewal: {
    membershipId?: string;
    planName?: string;
    branchName?: string;
    startDate?: string;
    endDate?: string;
    /** Negative once the term has ended. */
    daysUntilExpiry?: number;
    status?: string;
    hasSuccessor: boolean;
    /** Why the automated renewal journey stops for this term, when it does; undefined means the journey may run. */
    journeyStopReason?: string;
    journeyStopLabel?: string;
    outstanding: FollowUpMoney;
  };
  messaging: {
    consent: RenewalConsentStatus;
    consentSource?: string;
    channelOptedOut: boolean;
    /** Why RIVET will not send a renewal reminder, when it will not. */
    suppressionReason?: string;
    quietHours: { start: string; end: string; activeNow: boolean; resumesAt?: string };
    deliveryMode: "sandbox" | "live";
    deliveries: FollowUpDelivery[];
  };
  lastContact?: { evidenceId: string; at: string; outcome: string; label: string };
  /** The most recent callback request, with the open task that carries its date when one exists. */
  callback?: { evidenceId: string; requestedAt: string; taskId?: string; dueAt?: string; future: boolean };
  evidence: FollowUpEvidence[];
  relatedWork: FollowUpRelatedTask[];
}

export interface FollowUpTimelineLike {
  id: string;
  type: string;
  title: string;
  body?: string;
  occurredAt: string;
  actorName?: string;
  meta?: Data;
}

export interface FollowUpMembershipLike {
  id: string;
  planName?: string;
  branchName?: string;
  startDate: string;
  endDate: string;
  status?: string;
  cancelledAt?: string;
  previousMembershipId?: string;
  remainingVisits?: number;
  activeFreeze?: { status?: string; startDate?: string; endDate?: string };
  outstandingMinor: number;
}

export interface FollowUpDeliveryLike {
  id: string;
  checkpointKey: string;
  channel: string;
  status: string;
  suppressionReason?: string;
  cancellationReason?: string;
  deferredUntil?: number;
  attempts: number;
  updatedAt: number;
  membershipId: string;
}

export interface FollowUpContextInput {
  member: { id: string; fullName: string; phone?: string; preferredLanguage?: string; status?: string; consent: Data };
  memberships: readonly FollowUpMembershipLike[];
  timeline: readonly FollowUpTimelineLike[];
  tasks: readonly FollowUpRelatedTask[];
  deliveries: readonly FollowUpDeliveryLike[];
  quietHours: { start: string; end: string };
  deliveryMode: "sandbox" | "live";
  currency: string;
  timezone: string;
  today: string;
  now: number;
}

const STOP_REASON_LABELS: Record<string, string> = {
  member_or_membership_not_found: "no current membership",
  membership_renewed: "already renewed",
  membership_cancelled: "membership cancelled",
  member_not_active: "member not active",
  member_requested_no_contact: "member asked not to be contacted",
  membership_frozen: "membership frozen",
  membership_not_started: "term has not started",
  membership_expired: "term has ended",
  membership_depleted: "visits used up",
  membership_term_changed: "term dates changed",
  membership_not_found: "membership not found",
  member_not_found: "member not found",
};

function stopLabel(reason: string | undefined): string | undefined {
  return reason ? STOP_REASON_LABELS[reason] ?? reason.replaceAll("_", " ") : undefined;
}

function localTime(timestamp: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(11, 16);
  }
}

/** The renewal target: the term in force today, otherwise the most recent ended term that was never renewed. */
export function pickFollowUpMembership(memberships: readonly FollowUpMembershipLike[], today: string): { membership?: FollowUpMembershipLike; hasSuccessor: boolean } {
  const renewed = new Set(memberships.map((term) => term.previousMembershipId).filter((id): id is string => Boolean(id)));
  const live = memberships.filter((term) => !term.cancelledAt && !renewed.has(term.id));
  const current = live.filter((term) => term.startDate <= today && term.endDate >= today).sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
  if (current) return { membership: current, hasSuccessor: false };
  const ended = live.filter((term) => term.endDate < today).sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
  if (ended) return { membership: ended, hasSuccessor: false };
  const latest = [...memberships].sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
  return { membership: latest, hasSuccessor: latest ? renewed.has(latest.id) : false };
}

/** Truthful delivery wording for the member record: nothing here says "delivered". */
export function describeFollowUpDelivery(delivery: FollowUpDeliveryLike, timezone: string): FollowUpDelivery {
  const channel = delivery.channel === "staff_task" ? "Staff call task" : delivery.channel === "sms" ? "SMS" : "WhatsApp";
  const checkpoint = delivery.checkpointKey.replace("_day_call", " day before: call").replace("_day", " days before");
  const base = { id: delivery.id, checkpointKey: delivery.checkpointKey, channel: delivery.channel, status: delivery.status, updatedAt: new Date(delivery.updatedAt).toISOString() };
  switch (delivery.status) {
    case "queued":
      return { ...base, label: `${channel} reminder (${checkpoint}) queued · not delivered`, detail: delivery.channel === "staff_task" ? "The call task is open." : "Waiting for the outbound worker; nothing has reached the member yet." };
    case "sent":
      return { ...base, label: `${channel} reminder (${checkpoint}) accepted by the provider · delivery not confirmed`, detail: "RIVET has no delivery receipt." };
    case "sandboxed":
      return { ...base, label: `${channel} reminder (${checkpoint}) prepared in sandbox · not sent`, detail: "External delivery is off for this gym." };
    case "deferred":
      return { ...base, label: `${channel} reminder (${checkpoint}) deferred · quiet hours`, detail: delivery.deferredUntil ? `Resumes at ${localTime(delivery.deferredUntil, timezone)}.` : undefined };
    case "suppressed":
      return { ...base, label: `${channel} reminder (${checkpoint}) not sent`, detail: delivery.suppressionReason ?? "Suppressed by RIVET's messaging rules." };
    case "cancelled":
      return { ...base, label: `${channel} reminder (${checkpoint}) stopped`, detail: stopLabel(delivery.cancellationReason) };
    case "failed":
      return { ...base, label: `${channel} reminder (${checkpoint}) failed`, detail: `Failed after ${delivery.attempts} attempt${delivery.attempts === 1 ? "" : "s"}; follow up by phone.` };
    case "completed":
      return { ...base, label: `${channel} (${checkpoint}) completed`, detail: "The call task was completed." };
    default:
      return { ...base, label: `${channel} reminder (${checkpoint}) · ${delivery.status}` };
  }
}

const EVIDENCE_TYPES = new Set(["call_attempt", "note", "message", "membership_frozen", "membership_unfrozen", "renewal_message_suppressed", "renewal_message_sandboxed", "renewal_journey_cancelled", "renewal_call_task_created"]);

/** One timeline event read as follow-up evidence, or nothing when the event is not about the conversation. */
export function classifyFollowUpEvidence(event: FollowUpTimelineLike): FollowUpEvidence | undefined {
  if (!EVIDENCE_TYPES.has(event.type)) return undefined;
  const meta = record(event.meta);
  const excerpt = followUpExcerpt(event.body);
  const topics = followUpTopicsIn(`${event.title} ${event.body ?? ""}`);
  const flags: FollowUpEvidenceFlag[] = [];
  if (topics.includes("travel")) flags.push("mentions_travel");
  if (topics.includes("complaint")) flags.push("mentions_complaint");
  const base = { id: event.id, type: event.type, title: event.title, excerpt, occurredAt: event.occurredAt, actorName: event.actorName, topics, flags };
  if (event.type === "call_attempt") {
    const outcome = optionalText(meta.outcome);
    const known = isContactOutcome(outcome) ? outcome : undefined;
    if (known === "answered_call_back") { flags.unshift("callback_requested"); if (!topics.includes("callback")) topics.unshift("callback"); }
    if (known && REACHED_OUTCOMES.has(known)) flags.push("reached");
    if (known === "whatsapp_opened") flags.push("opened_not_sent");
    return { ...base, kind: "contact", outcome, outcomeLabel: known ? CONTACT_OUTCOME_LABELS[known] : outcome?.replaceAll("_", " ") };
  }
  if (event.type === "note") return { ...base, kind: optionalText(meta.kind) === "retention_snooze" ? "snooze" : "note" };
  if (event.type === "message") {
    const state = optionalText(meta.deliveryState);
    if (state === "provider_accepted") flags.push("provider_accepted_not_confirmed");
    else flags.push("not_sent");
    return { ...base, kind: "message" };
  }
  if (event.type === "membership_frozen" || event.type === "membership_unfrozen") return { ...base, kind: "freeze" };
  return { ...base, kind: "renewal" };
}

/**
 * The deterministic projection a renewal conversation starts from. Every
 * fact is read from records that already exist; consent is never inferred,
 * quiet hours and suppression follow the renewal policy exactly, and a queued
 * or provider-accepted reminder is never described as delivered.
 */
export function buildMemberFollowUpContext(input: FollowUpContextInput): MemberFollowUpContext {
  const { membership, hasSuccessor } = pickFollowUpMembership(input.memberships, input.today);
  const stopReason = membership
    ? renewalStopReason({ membership: { ...membership, status: membership.cancelledAt ? "cancelled" : membership.status }, member: { status: input.member.status ?? "active", ...input.member.consent }, today: input.today, hasSuccessor })
    : "member_or_membership_not_found";
  const consent = consentForRenewalChannel(input.member.consent, "whatsapp");
  const suppressionReason = renewalMessageSuppressionReason(consent.status, input.member.phone);
  const quietNow = isRenewalQuietHours(input.timezone, input.quietHours.start, input.quietHours.end, new Date(input.now));
  const evidence = input.timeline
    .map(classifyFollowUpEvidence)
    .filter((item): item is FollowUpEvidence => Boolean(item))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, FOLLOWUP_EVIDENCE_LIMIT);
  const contacts = evidence.filter((item) => item.kind === "contact");
  const last = contacts[0];
  const callbackEvent = contacts.find((item) => item.flags.includes("callback_requested"));
  const openTasks = input.tasks.filter((task) => task.status === "open").sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const callbackTask = callbackEvent ? openTasks.find((task) => (task.type === "follow_up" || task.type === "renewal_call") && task.dueAt >= callbackEvent.occurredAt) : undefined;
  const nowIso = new Date(input.now).toISOString();
  const deliveries = input.deliveries
    .filter((delivery) => !membership || delivery.membershipId === membership.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 8)
    .map((delivery) => describeFollowUpDelivery(delivery, input.timezone));
  return {
    memberId: input.member.id,
    memberName: input.member.fullName,
    phone: input.member.phone,
    preferredLanguage: input.member.preferredLanguage === "ar" ? "ar" : "en",
    generatedAt: nowIso,
    renewal: {
      membershipId: membership?.id,
      planName: membership?.planName,
      branchName: membership?.branchName,
      startDate: membership?.startDate,
      endDate: membership?.endDate,
      daysUntilExpiry: membership ? followUpDaysBetween(input.today, membership.endDate) : undefined,
      status: membership?.status,
      hasSuccessor,
      journeyStopReason: stopReason,
      journeyStopLabel: stopLabel(stopReason),
      outstanding: { amount: membership?.outstandingMinor ?? 0, currency: input.currency },
    },
    messaging: {
      consent: consent.status,
      consentSource: consent.source,
      channelOptedOut: consent.channelOptedOut,
      suppressionReason,
      quietHours: { start: input.quietHours.start, end: input.quietHours.end, activeNow: quietNow, resumesAt: quietNow ? new Date(nextRenewalQuietHoursEnd(input.now, input.timezone, input.quietHours.start, input.quietHours.end)).toISOString() : undefined },
      deliveryMode: input.deliveryMode,
      deliveries,
    },
    lastContact: last ? { evidenceId: last.id, at: last.occurredAt, outcome: last.outcome ?? "", label: last.outcomeLabel ?? "Contacted" } : undefined,
    callback: callbackEvent ? { evidenceId: callbackEvent.id, requestedAt: callbackEvent.occurredAt, taskId: callbackTask?.id, dueAt: callbackTask?.dueAt, future: Boolean(callbackTask && callbackTask.dueAt > nowIso) } : undefined,
    evidence,
    relatedWork: openTasks,
  };
}

// ---------------------------------------------------------------------------
// 4. Approved reminder templates, or a staff-written message
// ---------------------------------------------------------------------------

/** Which approved renewal template fits the term's timing, if any. */
export function timedRenewalTemplate(daysUntilExpiry: number | undefined, hasSuccessor: boolean): CatalogueTemplate | undefined {
  if (daysUntilExpiry === undefined || hasSuccessor) return undefined;
  const key = daysUntilExpiry >= 4 && daysUntilExpiry <= 14 ? "renewal_7d" : daysUntilExpiry >= 1 && daysUntilExpiry <= 3 ? "renewal_3d" : daysUntilExpiry === 0 ? "renewal_today" : daysUntilExpiry < 0 && daysUntilExpiry >= -45 ? "renewal_expired_3d" : undefined;
  return key ? MESSAGE_TEMPLATE_CATALOGUE.find((template) => template.key === key) : undefined;
}

/**
 * The templates staff may be offered for this member right now. An explicit
 * opt-out offers nothing; unknown consent still lets staff open a personal
 * WhatsApp handoff (logged as opened, never sent), so the template is offered
 * with the suppression shown beside it.
 */
export function eligibleReminderTemplates(context: MemberFollowUpContext): CatalogueTemplate[] {
  if (context.messaging.consent === "explicit_opt_out" || context.messaging.channelOptedOut) return [];
  const timed = timedRenewalTemplate(context.renewal.daysUntilExpiry, context.renewal.hasSuccessor);
  return timed ? [timed] : [];
}

/** Why no template may be suggested for this member right now; the page hides the ask and the loader refuses it. */
export function reminderTemplateUnavailableReason(context: MemberFollowUpContext): string | undefined {
  if (context.messaging.consent === "explicit_opt_out" || context.messaging.channelOptedOut) return "This member opted out of renewal messages. Call instead; no message is suggested.";
  if (eligibleReminderTemplates(context).length === 0) return "No approved renewal reminder fits this term's timing.";
  return undefined;
}

/** The template filled from the member record, in the member's language; unknown variables stay visible. */
export function renderReminderForMember(template: CatalogueTemplate, context: MemberFollowUpContext, gymName: string): string {
  const body = context.preferredLanguage === "ar" ? template.bodyAr : template.bodyEn;
  return renderMessageTemplate(body, {
    member_name: context.memberName.trim().split(/\s+/)[0] || context.memberName,
    gym_name: gymName,
    end_date: context.renewal.endDate,
    branch_name: context.renewal.branchName ?? gymName,
  });
}

// ---------------------------------------------------------------------------
// 5. Reasons for sensitive actions
// ---------------------------------------------------------------------------

export type ReasonActionKey = "refund" | "void" | "checkin_override" | "freeze" | "unfreeze" | "extend" | "cancel" | "transfer" | "plan_change" | "price_override" | "lead_lost";

export interface ReasonAction {
  key: ReasonActionKey;
  label: string;
  /** The server permission the action itself needs; the loader re-checks it before any reason is read. */
  permission: string;
  /** What an auditor needs to find in the reason. */
  needs: string;
  prompts: { what: string; who: string };
}

export const REASON_ACTIONS: Record<ReasonActionKey, ReasonAction> = {
  refund: { key: "refund", label: "Refund", permission: "payments.refund", needs: "what was wrong with the payment or the service, who asked for or approved the refund, and when", prompts: { what: "Say what was wrong with the payment or the service, for example a duplicate charge, a cancelled session or a wrong amount.", who: "Add who asked for or approved the refund and when, or the receipt it relates to, so an auditor can check it." } },
  void: { key: "void", label: "Void", permission: "payments.void", needs: "what was keyed wrongly at the time of collection and who noticed it", prompts: { what: "Say what was wrong with the collection, for example the wrong amount, method or member.", who: "Add who noticed it and when, so the same-day correction can be checked against the drawer." } },
  checkin_override: { key: "checkin_override", label: "Check-in override", permission: "checkins.override", needs: "why entry is allowed despite the block: what was paid or shown, where, and who confirmed it", prompts: { what: "Say why entry is allowed despite the block, for example payment made at another branch or a receipt shown at the desk.", who: "Add who confirmed it or what was shown, so the manager reviewing overrides can check it." } },
  freeze: { key: "freeze", label: "Freeze", permission: "memberships.freeze", needs: "the member's reason for pausing and the dates it covers", prompts: { what: "Say why the member is pausing, for example travel, injury or work, in their words.", who: "Add when they asked and how (at the desk, by phone), or the date they expect to return." } },
  unfreeze: { key: "unfreeze", label: "End freeze early", permission: "memberships.freeze", needs: "why the freeze ends early and who asked", prompts: { what: "Say why the freeze is ending early, for example the member came back sooner.", who: "Add who asked and when, for example at the desk today." } },
  extend: { key: "extend", label: "Extend", permission: "memberships.override_dates", needs: "the concrete event the extra days compensate for, and who approved it", prompts: { what: "Say what the extra days compensate for, for example the closure dates or the outage.", who: "Add who approved the extension and when." } },
  cancel: { key: "cancel", label: "Cancel membership", permission: "memberships.override_dates", needs: "the member's reason for leaving and how it was confirmed", prompts: { what: "Say why the membership is being cancelled, in the member's words.", who: "Add how the request was confirmed, for example by phone today or in writing." } },
  transfer: { key: "transfer", label: "Transfer", permission: "memberships.override_dates", needs: "why the member moves branch and who agreed", prompts: { what: "Say why the membership moves branch, for example the member relocated.", who: "Add who agreed the transfer, for example the receiving branch manager." } },
  plan_change: { key: "plan_change", label: "Change plan", permission: "memberships.sell", needs: "what the member asked for and when the change was agreed", prompts: { what: "Say what the member asked for and why the plan changes.", who: "Add when it was agreed and with whom." } },
  price_override: { key: "price_override", label: "Price override", permission: "memberships.override_dates", needs: "the agreement behind the exceptional price and who approved it", prompts: { what: "Say what agreement the exceptional price comes from, for example a corporate rate or a written offer.", who: "Add who approved it and when." } },
  lead_lost: { key: "lead_lost", label: "Lead not sold", permission: "crm.write", needs: "what the person said about not joining", prompts: { what: "Say what the person said about not joining, for example price, distance or schedule.", who: "Add when and how they said it, so the pipeline report reads true." } },
};

export function isReasonAction(value: unknown): value is ReasonActionKey {
  return typeof value === "string" && value in REASON_ACTIONS;
}
