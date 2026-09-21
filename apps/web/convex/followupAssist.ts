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
import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * Connected staff follow-up assistance: the pure logic shared by the server
 * loaders, the preview adapter and the pages.
 *
 * Five bounded judgments sit on top of facts RIVET already records:
 *
 * - a contact note may be read for the supported outcome it describes, with
 *   third-party conversations, contradictions and unclear notes called out
 *   instead of guessed;
 * - new follow-up work may be checked against the person's open tasks;
 * - a renewal conversation may be pointed at the recorded item that matters
 *   most (a callback that was agreed, a complaint, travel, a freeze);
 * - an approved utility template may be suggested for that conversation, or
 *   a staff-written message called for;
 * - the reason typed for a sensitive action may be checked for the factual
 *   detail an auditor needs.
 *
 * Everything that decides what is allowed stays deterministic here: which
 * outcomes exist for a lead or a member, what a chosen outcome does to the
 * stage, the follow-up date and the open tasks, whether renewal reminders are
 * suppressed, opted out, deferred by quiet hours or already queued, which
 * templates are approved for the timing, and which permission each reason
 * check needs. Jev only ever picks among options built here, and nothing it
 * picks is applied until a person accepts it through the normal mutation.
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

/** A short, whitespace-normalised excerpt of a note for evidence lists and state. */
export function followUpExcerpt(value: string | undefined, max = 200): string | undefined {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) return undefined;
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

type ChoiceJudgment = Extract<JevJudgment, { kind: "choice" }>;

function spread(ids: readonly string[], choice: string, weight: number): ChoiceJudgment {
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - weight) / others.length : 0;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = id === choice ? (others.length ? weight : 1) : rest;
  return { kind: "choice", choice, probabilities, confidence: Math.min(0.96, weight + 0.04) };
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

const THIRD_PARTY_PATTERNS: readonly RegExp[] = [
  /\b(his|her|their)\s+(brother|sister|mother|father|mom|mum|dad|wife|husband|son|daughter|friend|colleague|cousin|uncle|aunt|parent|parents|partner|assistant|secretary|roommate|flatmate|neighbou?r|boss|manager|driver|nanny|maid)\b/i,
  /\b(spoke|speaking|talked|talking|chatted)\s+(to|with)\s+(a|the|his|her|their|some|one of)?\s*(brother|sister|mother|father|mom|mum|dad|wife|husband|son|daughter|friend|colleague|cousin|uncle|aunt|parent|parents|partner|assistant|secretary|relative|family|neighbou?r|boss|manager|driver|receptionist|someone|somebody)\b/i,
  /\b(someone else|somebody else|another person|a relative|family member|not (him|her) on the phone|not (him|her) who answered|(brother|sister|mother|father|wife|husband|friend|colleague) (answered|picked up|took the call|said))\b/i,
  /\b(answered by|picked up by|left (a )?message with)\s+(his|her|their|a|the)\b/i,
  /(أخوه|أخوها|أخته|أختها|أمه|أمها|أبوه|أبوها|والده|والدها|والدته|والدتها|زوجه|زوجها|زوجته|ابنه|ابنها|بنته|بنتها|صديقه|صديقها|صاحبه|صاحبها|زميله|زميلها|رد أخو|ردت أخت|رد ابن|ردت بنت|حدا غيره|حدا غيرها|شخص ثاني|واحد ثاني|مش هو اللي رد|مش هي اللي ردت)/u,
];

const CONTRAST_PATTERNS: readonly RegExp[] = [
  /\b(but then|however|then (he|she|they) said|changed (his|her|their) mind|on second thought|actually,? (no|not)|never ?mind|at first .* but|but (he|she|they) (also|then))\b/i,
  /(بس بعدين|لكن بعدين|غير رأيه|غيرت رأيها|غير رأيها|بالأول .* بس)/u,
];

interface OutcomeFamily {
  outcome: ContactOutcome;
  patterns: readonly RegExp[];
}

const OUTCOME_FAMILIES: readonly OutcomeFamily[] = [
  { outcome: "no_answer", patterns: [/\b(no answer|didn'?t (pick|answer)|did not (pick|answer)|not answering|not picking up|voicemail|voice mail|rang out|kept ringing|line busy|busy tone|switched off|phone off|unreachable|no reply|no response|couldn'?t reach|could not reach)\b/i, /(ما رد|ما ردت|لم يرد|لم ترد|ما بيرد|ما بترد|مغلق|مسكر|جهازه مغلق|جهازها مغلق|لا يجيب|لا تجيب|بريد صوتي|مش متاح|مش متاحة)/u] },
  { outcome: "answered_call_back", patterns: CALLBACK_PATTERNS },
  { outcome: "answered_not_interested", patterns: [/\b(not interested|no longer interested|isn'?t interested|is not interested|don'?t call|do not call|stop calling|declined|not renewing|won'?t renew|will not renew|not coming back|joined another gym|moved to another gym|wants? to cancel|cancel(l?ing)? (the )?membership|no thanks|not for (him|her|them))\b/i, /(مش مهتم|مش مهتمة|غير مهتم|غير مهتمة|ما بدو|ما بدها|ما بده|لا تتصل|لا تتصلي|ما راح يجدد|ما رح تجدد|ما بده يجدد|ما بدها تجدد|بدو يلغي|بدها تلغي|اشترك بنادي ثاني|اشتركت بنادي ثاني)/u] },
  { outcome: "answered_interested", patterns: [/\b((?<!not )(?<!longer )(?<!n't )interested|keen|wants? to renew|will renew|renewing|happy to renew|will come (in|by)|coming (in|by|tomorrow|today)|asked about (the )?(price|prices|plans|offer|offers|discount)|wants? (the |a )?(offer|plan|price|discount)|will pay|wants? to continue|thinking about (it|renewing)|send (him|her|them) the (offer|price|plans))\b/i, /((?<!مش )(?<!غير )(?<!ما )مهتم|(?<!مش )(?<!غير )(?<!ما )مهتمة|بده يجدد|بدو يجدد|بدها تجدد|راح يجدد|رح تجدد|رح يجي|رح تجي|بدو العرض|بدها العرض|سأل عن السعر|سألت عن السعر|رح يدفع|رح تدفع)/u] },
  { outcome: "wrong_number", patterns: [/\b(wrong number|not (his|her|their) number|number (belongs|is) (to )?someone else|doesn'?t know (him|her|them)|never heard of (him|her|them)|number (changed|disconnected|not in service))\b/i, /(رقم غلط|رقم خطأ|مش رقمه|مش رقمها|الرقم مش إله|الرقم مش إلها|ما بيعرفه|ما بتعرفه|الرقم غير مستخدم)/u] },
  { outcome: "whatsapp_sent", patterns: [/\b(sent\b[^.!?]{0,60}\b(whatsapp|whats app|message|msg|text)|whatsapp(ed)? (him|her|them)|messaged (him|her|them)|texted (him|her|them))\b/i, /(بعثت (له|لها|إله|إلها)? ?(واتس|واتساب|رسالة|مسج)|أرسلت (له|لها)? ?(واتس|واتساب|رسالة)|ارسلت (له|لها)? ?(واتس|واتساب|رسالة))/u] },
  { outcome: "trial_booked", patterns: [/\b(trial (booked|scheduled|set|arranged|confirmed)|booked (a |the |him for a |her for a )?trial|scheduled (a |the )?trial|coming (in )?for a trial|trial (on|at) (mon|tue|wed|thu|fri|sat|sun|tomorrow))\b/i, /(حجزت (له|لها)? ?تجربة|حجز تجربة|موعد تجربة|جاي يجرب|جاية تجرب|حجزنا (له|لها) تجربة)/u] },
  { outcome: "trial_completed", patterns: [/\b(trial (done|completed|attended|finished)|attended (the |his |her )?trial|did (the |his |her )?trial|came (in )?for (the |a |his |her )?trial|finished (the |his |her )?trial)\b/i, /(خلص التجربة|خلصت التجربة|جرب|جربت|حضر التجربة|حضرت التجربة|أنهى التجربة|أنهت التجربة)/u] },
];

const POSITIVE_OUTCOMES = new Set<ContactOutcome>(["answered_interested", "trial_booked", "trial_completed", "answered_call_back"]);
const NEGATIVE_OUTCOMES = new Set<ContactOutcome>(["answered_not_interested", "wrong_number"]);

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

export function noteMentionsThirdParty(value: string): boolean {
  const source = normalizeWhitespace(value);
  return mentionsAny(source.toLowerCase(), THIRD_PARTY_PATTERNS) || mentionsAny(source, THIRD_PARTY_PATTERNS);
}

// ---------------------------------------------------------------------------
// 1. Contact note review
// ---------------------------------------------------------------------------

export const NOTE_THIRD_PARTY = "third_party";
export const NOTE_CONTRADICTORY = "contradictory";
export const NOTE_UNCLEAR = "unclear";
export const FOLLOWUP_NOTE_MIN_LENGTH = 8;
export const FOLLOWUP_NOTE_MAX_LENGTH = 512;

export type ContactSubjectKind = "member" | "lead";

/** The outcomes a person may record by hand, in the form's order; trial outcomes exist for leads only. */
export const MANUAL_CONTACT_OUTCOMES: Record<ContactSubjectKind, readonly ContactOutcome[]> = {
  lead: ["no_answer", "answered_interested", "answered_call_back", "answered_not_interested", "whatsapp_sent", "trial_booked", "trial_completed", "wrong_number"],
  member: ["no_answer", "answered_interested", "answered_call_back", "answered_not_interested", "whatsapp_sent", "wrong_number"],
};

const OUTCOME_DESCRIPTIONS: Record<ContactOutcome, string> = {
  no_answer: "The person did not answer: the call rang out, went to voicemail or the line was busy; no conversation took place.",
  answered_interested: "The person themselves answered and showed interest: wants to renew, asked about prices or plans, or said they will come in.",
  answered_call_back: "The person themselves answered and asked to be called again later, at a time they chose.",
  answered_not_interested: "The person themselves answered and declined: not interested, not renewing, or asked not to be called.",
  wrong_number: "The number does not belong to the person: someone unrelated answered or the number is out of service.",
  whatsapp_sent: "The staff member sent the person a WhatsApp message from their own phone.",
  whatsapp_opened: "RIVET opened WhatsApp with a prepared message; delivery is not confirmed.",
  trial_booked: "A trial session was booked for the lead.",
  trial_completed: "The lead attended and completed a trial session.",
};

const NON_OUTCOME_DESCRIPTIONS: Record<string, string> = {
  [NOTE_THIRD_PARTY]: "The note describes speaking with someone other than the person (a relative, friend or colleague); the person themselves was not reached, whatever the other party said.",
  [NOTE_CONTRADICTORY]: "The note states things that cannot all be true, or changes its mind part-way through.",
  [NOTE_UNCLEAR]: "The note does not say clearly which of the listed outcomes happened.",
};

export function contactNoteCandidates(subject: ContactSubjectKind): JevCandidate[] {
  return [
    ...MANUAL_CONTACT_OUTCOMES[subject].map((outcome) => ({ id: outcome, description: `${CONTACT_OUTCOME_LABELS[outcome]}: ${OUTCOME_DESCRIPTIONS[outcome]}` })),
    { id: NOTE_THIRD_PARTY, description: NON_OUTCOME_DESCRIPTIONS[NOTE_THIRD_PARTY]! },
    { id: NOTE_CONTRADICTORY, description: NON_OUTCOME_DESCRIPTIONS[NOTE_CONTRADICTORY]! },
    { id: NOTE_UNCLEAR, description: NON_OUTCOME_DESCRIPTIONS[NOTE_UNCLEAR]! },
  ];
}

export interface ContactNoteStateInput {
  subject: ContactSubjectKind;
  subjectId: string;
  note: string;
  currentStage?: string;
}

/** The bounded state for a note review: the note, who it is about (kind only) and the lead's stage. Names are never included. */
export function buildContactNoteState(input: ContactNoteStateInput): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const note = normalizeWhitespace(input.note).slice(0, FOLLOWUP_NOTE_MAX_LENGTH);
  const state: JevState = {
    purpose: "A gym staff member logged a contact attempt and wrote this note about what happened. Decide which supported outcome the note records.",
    subject: input.subject,
    ...(input.currentStage ? { currentStage: input.currentStage } : {}),
    note,
  };
  return { state, candidates: contactNoteCandidates(input.subject), scopeKey: `contact-note:${input.subject}:${input.subjectId}`, sourceVersion: "contact-note:1" };
}

function outcomeFamiliesIn(note: string): ContactOutcome[] {
  const lower = note.toLowerCase();
  return OUTCOME_FAMILIES.filter((family) => mentionsAny(lower, family.patterns) || mentionsAny(note, family.patterns)).map((family) => family.outcome);
}

/** The preview's stand-in for the model: keyword rules over the note, third party and contradiction first. */
export function resolveContactNoteFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const note = normalizeWhitespace(text(state.note));
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  if (!note) return spread(ids, NOTE_UNCLEAR, 0.7);
  if (ids.includes(NOTE_THIRD_PARTY) && noteMentionsThirdParty(note)) return spread(ids, NOTE_THIRD_PARTY, 0.88);
  const families = outcomeFamiliesIn(note).filter((outcome) => ids.includes(outcome));
  const positive = families.some((outcome) => POSITIVE_OUTCOMES.has(outcome));
  const negative = families.some((outcome) => NEGATIVE_OUTCOMES.has(outcome));
  const reachedAndNot = families.includes("no_answer") && families.some((outcome) => REACHED_OUTCOMES.has(outcome));
  const contrast = mentionsAny(note.toLowerCase(), CONTRAST_PATTERNS) || mentionsAny(note, CONTRAST_PATTERNS);
  if (ids.includes(NOTE_CONTRADICTORY) && ((positive && negative) || reachedAndNot || (contrast && families.length > 1))) return spread(ids, NOTE_CONTRADICTORY, 0.82);
  if (families.length === 0) return spread(ids, NOTE_UNCLEAR, 0.72);
  // A callback request beside interest is the actionable outcome; a message
  // sent after no answer is the thing that actually happened last.
  const priority: ContactOutcome[] = ["trial_completed", "trial_booked", "answered_not_interested", "wrong_number", "answered_call_back", "whatsapp_sent", "answered_interested", "no_answer"];
  const choice = priority.find((outcome) => families.includes(outcome)) ?? families[0]!;
  const weight = families.length === 1 ? 0.86 : 0.58;
  const judgment = spread(ids, choice, weight);
  if (families.length > 1) {
    const runnerUp = families.find((outcome) => outcome !== choice);
    if (runnerUp) judgment.probabilities[runnerUp] = Math.max(judgment.probabilities[runnerUp] ?? 0, 0.3);
    const total = Object.values(judgment.probabilities).reduce((sum, value) => sum + value, 0);
    for (const key of Object.keys(judgment.probabilities)) judgment.probabilities[key] = (judgment.probabilities[key] ?? 0) / total;
  }
  return judgment;
}

export type ContactNoteReading =
  | { kind: "outcome"; outcome: ContactOutcome; label: string }
  | { kind: "third_party" }
  | { kind: "contradictory" }
  | { kind: "unclear" };

/** What a judgment means for the form; anything outside the offered outcomes reads as unclear. */
export function resolveContactNoteReading(judgment: JevJudgment, offered: readonly string[]): ContactNoteReading {
  if (judgment.kind !== "choice" || !offered.includes(judgment.choice)) return { kind: "unclear" };
  if (judgment.choice === NOTE_THIRD_PARTY) return { kind: "third_party" };
  if (judgment.choice === NOTE_CONTRADICTORY) return { kind: "contradictory" };
  if (judgment.choice === NOTE_UNCLEAR) return { kind: "unclear" };
  if (!isContactOutcome(judgment.choice)) return { kind: "unclear" };
  return { kind: "outcome", outcome: judgment.choice, label: CONTACT_OUTCOME_LABELS[judgment.choice] };
}

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

export const RELATED_TASK_NONE = "none";
export const FOLLOWUP_TASK_LIMIT = 30;

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

export interface RelatedTaskDraft {
  type: string;
  title: string;
  dueDate: string;
  ownerName?: string;
}

function describeTask(task: FollowUpRelatedTask): string {
  return `${TASK_TYPE_LABELS[task.type] ?? task.type} · “${task.title}” · owner ${task.ownerName} · due ${task.dueAt.slice(0, 10)} · ${task.priority} priority`;
}

export function relatedTaskCandidates(tasks: readonly FollowUpRelatedTask[]): JevCandidate[] {
  return [
    ...tasks.filter((task) => task.status === "open").slice(0, FOLLOWUP_TASK_LIMIT).map((task) => ({ id: task.id, description: describeTask(task) })),
    { id: RELATED_TASK_NONE, description: "No open task concerns the same work as the new one." },
  ];
}

export function buildRelatedTaskState(input: { subject: ContactSubjectKind; subjectId: string; personName: string; draft: RelatedTaskDraft; tasks: readonly FollowUpRelatedTask[] }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const open = input.tasks.filter((task) => task.status === "open");
  const state: JevState = {
    purpose: "A staff member is about to create a task about this person. Decide whether an open task already covers the same work.",
    person: input.personName,
    newTask: {
      type: TASK_TYPE_LABELS[input.draft.type] ?? input.draft.type,
      title: normalizeWhitespace(input.draft.title).slice(0, 200),
      dueDate: input.draft.dueDate,
      ...(input.draft.ownerName ? { owner: input.draft.ownerName } : {}),
    },
    openTasks: open.length,
  };
  return { state, candidates: relatedTaskCandidates(open), scopeKey: `related-task:${input.subject}:${input.subjectId}`, sourceVersion: "related-task:1" };
}

const TASK_STOPWORDS = new Set(["follow", "up", "with", "about", "the", "and", "for", "call", "task", "member", "lead", "after", "before", "next", "this", "that", "from", "into", "his", "her", "their", "them", "him", "she", "he"]);

function taskTokens(value: string, exclude: ReadonlySet<string>): string[] {
  return [...new Set(value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((token) => token.length >= 3 && !TASK_STOPWORDS.has(token) && !exclude.has(token)))];
}

function stemMatch(left: string, right: string): boolean {
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

/** The preview's stand-in: same task type first, then shared words in the titles once the person's name is removed. */
export function resolveRelatedTaskFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const draft = record(state.newTask);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const nameTokens = new Set(taskTokens(text(state.person), new Set()));
  const draftType = text(draft.type).toLowerCase();
  const draftTokens = taskTokens(text(draft.title), nameTokens);
  let best: { id: string; score: number } | undefined;
  for (const candidate of input.candidates ?? []) {
    if (candidate.id === RELATED_TASK_NONE) continue;
    const [typePart = "", titlePart = ""] = candidate.description.split(" · ");
    let score = typePart.toLowerCase() === draftType ? 3 : 0;
    const candidateTokens = taskTokens(titlePart.replace(/[“”]/g, ""), nameTokens);
    const overlap = draftTokens.filter((token) => candidateTokens.some((other) => stemMatch(token, other))).length;
    score += overlap * 2;
    if (!best || score > best.score) best = { id: candidate.id, score };
  }
  if (!best || best.score < 3) return spread(ids, RELATED_TASK_NONE, 0.8);
  return spread(ids, best.id, best.score >= 5 ? 0.84 : 0.64);
}

export type RelatedTaskReading = { kind: "related"; task: FollowUpRelatedTask } | { kind: "none" };

export function resolveRelatedTaskReading(judgment: JevJudgment, tasks: readonly FollowUpRelatedTask[]): RelatedTaskReading {
  if (judgment.kind !== "choice" || judgment.choice === RELATED_TASK_NONE) return { kind: "none" };
  const task = tasks.find((candidate) => candidate.id === judgment.choice && candidate.status === "open");
  return task ? { kind: "related", task } : { kind: "none" };
}

// ---------------------------------------------------------------------------
// 3. The member's recorded follow-up context
// ---------------------------------------------------------------------------

export const FOLLOWUP_EVIDENCE_LIMIT = 12;
export const CONTEXT_NONE = "none";
export const TEMPLATE_STAFF_REVIEW = "staff_review";

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
  /** For the WhatsApp handoff only; never part of any Jev state. */
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
// 3b. Which recorded item matters most for the renewal conversation
// ---------------------------------------------------------------------------

function describeEvidence(item: FollowUpEvidence, today: string): string {
  const age = followUpDaysBetween(item.occurredAt.slice(0, 10), today);
  const when = age <= 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`;
  const what = item.kind === "contact" ? `contact · ${item.outcomeLabel ?? "contacted"}` : item.kind === "note" ? "staff note" : item.kind === "snooze" ? "follow-up snoozed" : item.kind === "message" ? `message · ${item.flags.includes("not_sent") ? "not sent" : "accepted by provider, not confirmed"}` : item.kind === "freeze" ? "freeze" : "renewal journey";
  const topics = item.topics.length ? ` · mentions ${item.topics.join(", ")}` : "";
  return `${when} · ${what}${topics}${item.excerpt ? ` · “${item.excerpt.slice(0, 160)}”` : ` · ${item.title}`}`;
}

export function renewalContextCandidates(context: MemberFollowUpContext, today: string): JevCandidate[] {
  return [
    ...context.evidence.map((item) => ({ id: item.id, description: describeEvidence(item, today) })),
    { id: CONTEXT_NONE, description: "Nothing recorded changes how the renewal conversation should go." },
  ];
}

function contextFacts(context: MemberFollowUpContext, today: string): Data {
  const last = context.lastContact;
  return {
    conversation: "renewal",
    daysUntilExpiry: context.renewal.daysUntilExpiry ?? null,
    plan: context.renewal.planName ?? null,
    outstanding: context.renewal.outstanding.amount > 0 ? `${(context.renewal.outstanding.amount / 1000).toFixed(3)} ${context.renewal.outstanding.currency}` : "none",
    lastContact: last ? `${last.label}, ${Math.max(0, followUpDaysBetween(last.at.slice(0, 10), today))} days ago` : "never",
    callbackAgreed: context.callback ? (context.callback.future ? `yes, due ${context.callback.dueAt?.slice(0, 10) ?? "later"}` : "requested earlier, no open date") : "no",
    openTasks: context.relatedWork.length,
  };
}

export function buildRenewalContextState(input: { context: MemberFollowUpContext; today: string }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const state: JevState = {
    purpose: "A staff member is about to talk to this member about renewing. Pick the recorded item that most changes how that conversation should go.",
    ...contextFacts(input.context, input.today),
  } as JevState;
  return { state, candidates: renewalContextCandidates(input.context, input.today), scopeKey: `renewal-context:${input.context.memberId}`, sourceVersion: "renewal-context:1" };
}

function evidenceScore(description: string, callbackAgreed: boolean): number {
  let score = 1;
  // A callback the member asked for decides whether to call at all now, so it outranks everything else once it is agreed.
  if (description.includes("mentions callback")) score += callbackAgreed ? 11 : 6;
  if (description.includes("mentions complaint")) score += 7;
  if (description.includes("mentions travel")) score += 6;
  if (description.includes("freeze")) score += 4;
  if (description.includes("follow-up snoozed")) score += 4;
  if (description.includes("not sent")) score += 3;
  if (description.includes("Not interested")) score += 5;
  if (description.includes("Interested")) score += 3;
  if (description.includes("staff note")) score += 2;
  if (description.startsWith("today") || description.startsWith("yesterday")) score += 2;
  else { const days = Number.parseInt(description, 10); if (Number.isFinite(days) && days <= 14) score += 1; }
  return score;
}

/** The preview's stand-in: recorded topics first (callback, complaint, travel), then recency. */
export function resolveRenewalContextFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const candidates = input.candidates ?? [];
  const callbackAgreed = text(record(input.state).callbackAgreed).startsWith("yes");
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const scored = candidates.filter((candidate) => candidate.id !== CONTEXT_NONE).map((candidate) => ({ id: candidate.id, score: evidenceScore(candidate.description, callbackAgreed) }));
  if (!scored.length) return spread(ids, CONTEXT_NONE, 0.9);
  const total = scored.reduce((sum, item) => sum + item.score, 0) + 1;
  const probabilities: Record<string, number> = { [CONTEXT_NONE]: 1 / total };
  for (const item of scored) probabilities[item.id] = item.score / total;
  const best = [...scored].sort((left, right) => right.score - left.score)[0]!;
  const confidence = best.score >= 7 ? 0.86 : 0.62;
  return { kind: "choice", choice: best.id, probabilities, confidence };
}

export interface RenewalContextReading {
  kind: "evidence" | "none";
  /** Evidence in the order Jev weighted it, strongest first; the first is the choice. */
  items: Array<{ evidence: FollowUpEvidence; probability: number }>;
}

export function resolveRenewalContextReading(judgment: JevJudgment, evidence: readonly FollowUpEvidence[]): RenewalContextReading {
  if (judgment.kind !== "choice" || judgment.choice === CONTEXT_NONE) return { kind: "none", items: [] };
  const byId = new Map(evidence.map((item) => [item.id, item] as const));
  const chosen = byId.get(judgment.choice);
  if (!chosen) return { kind: "none", items: [] };
  const rest = Object.entries(judgment.probabilities)
    .filter(([id, probability]) => id !== judgment.choice && id !== CONTEXT_NONE && probability >= 0.15 && byId.has(id))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([id, probability]) => ({ evidence: byId.get(id)!, probability }));
  return { kind: "evidence", items: [{ evidence: chosen, probability: judgment.probabilities[judgment.choice] ?? 0 }, ...rest] };
}

// ---------------------------------------------------------------------------
// 4. Approved reminder templates, or a staff-written message
// ---------------------------------------------------------------------------

/** Which approved renewal template fits the term's timing, if any; a deterministic rule, never Jev's. */
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

export function reminderTemplateCandidates(templates: readonly CatalogueTemplate[]): JevCandidate[] {
  return [
    ...templates.map((template) => ({ id: template.key, description: `${template.name} (approved ${template.category} template): “${template.bodyEn}”` })),
    { id: TEMPLATE_STAFF_REVIEW, description: "No standard reminder fits: a staff member should write the message themselves, or call instead (a callback was agreed, a complaint or dispute is recorded, the last contact was with someone else, or the standard wording would read wrong)." },
  ];
}

export function buildReminderTemplateState(input: { context: MemberFollowUpContext; today: string }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const recorded = input.context.evidence.slice(0, 6).map((item) => describeEvidence(item, input.today));
  const state: JevState = {
    purpose: "A staff member wants to remind this member to renew. Decide whether an approved standard reminder is appropriate or whether the recorded context calls for a message written by staff.",
    ...contextFacts(input.context, input.today),
    consent: input.context.messaging.consent,
    quietHoursNow: input.context.messaging.quietHours.activeNow,
    recorded,
  } as JevState;
  return { state, candidates: reminderTemplateCandidates(eligibleReminderTemplates(input.context)), scopeKey: `reminder-template:${input.context.memberId}`, sourceVersion: "reminder-template:1" };
}

/** The preview's stand-in: an agreed callback, a complaint or a third-party contact means staff write it; otherwise the timed template. */
export function resolveReminderTemplateFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const recorded = Array.isArray(state.recorded) ? state.recorded.map((item) => text(item)) : [];
  const callbackAgreed = text(state.callbackAgreed).startsWith("yes");
  const complaint = recorded.some((item) => item.includes("mentions complaint"));
  const declined = recorded[0]?.includes("Not interested") ?? false;
  const template = ids.find((id) => id !== TEMPLATE_STAFF_REVIEW);
  if (!template || callbackAgreed || complaint || declined) return spread(ids, TEMPLATE_STAFF_REVIEW, 0.84);
  return spread(ids, template, 0.8);
}

export type ReminderTemplateReading = { kind: "template"; template: CatalogueTemplate } | { kind: "staff_review" };

export function resolveReminderTemplateReading(judgment: JevJudgment, offered: readonly CatalogueTemplate[]): ReminderTemplateReading {
  if (judgment.kind !== "choice" || judgment.choice === TEMPLATE_STAFF_REVIEW) return { kind: "staff_review" };
  const template = offered.find((candidate) => candidate.key === judgment.choice);
  return template ? { kind: "template", template } : { kind: "staff_review" };
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
  /** What an auditor needs to find in the reason. Application copy; Jev sees it as the criterion. */
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

export const REASON_CHECK_LEVELS = [
  "Not a reason: a placeholder, a greeting, random characters or text unrelated to this action",
  "Generic: words such as request, mistake, goodwill or error with no fact behind them",
  "Partly specific: says what happened but not who asked or confirmed it, or when",
  "Specific: says what happened, who asked or confirmed it, and when, so an auditor could check it",
] as const;

export function buildReasonCheckState(input: { action: ReasonActionKey; reason: string }): { state: JevState; scopeKey: string; sourceVersion: string } {
  const action = REASON_ACTIONS[input.action];
  const state: JevState = {
    purpose: "A staff member typed a reason for a sensitive action that goes into the audit log. Rate how much checkable factual detail the reason gives. Never propose a reason.",
    action: action.label,
    needs: action.needs,
    reason: normalizeWhitespace(input.reason).slice(0, FOLLOWUP_NOTE_MAX_LENGTH),
  };
  return { state, scopeKey: `reason:${input.action}`, sourceVersion: "reason-check:1" };
}

const PLACEHOLDER_REASON = /^(test|testing|asdf|qwerty|xxx+|\.+|-+|n\/?a|none|no|ok|okay|yes|hello|hi|reason|because|abc|123+)$/i;
const GENERIC_PHRASES: readonly RegExp[] = [
  /\b(customer|member|client) (request|requested|asked|wants?)\b/i,
  /\b(as (requested|agreed|discussed)|on request|per request|by request)\b/i,
  /\b(mistake|error|wrong|goodwill|gesture|courtesy|refund|cancel(led)?|void|override|adjust(ment)?|correction|fix|issue|problem)\b/i,
  /\b(manager (said|approved|ok'?d)|approved|authori[sz]ed)\b/i,
  /(طلب العميل|طلب العضو|بناء على الطلب|خطأ|غلط|إلغاء|استرجاع)/u,
];
/** What happened: the concrete event behind the action. */
const WHAT_SIGNALS: readonly RegExp[] = [
  /\b(charged twice|double charged|duplicate (charge|payment)|paid (at|in) [a-z]+|paid twice|wrong (amount|member|plan|method)|cancelled class|class was cancelled|trainer (did not|didn'?t) (show|come)|closed (on|for)|outage|no hot water|equipment (down|broken)|relocat(ed|ing)|moving (abroad|to)|injur(y|ed)|surgery|travel(l?ing)?|pregnan|work (trip|schedule)|corporate rate|written offer|keyed (the )?wrong)\b/i,
  /(دفع في فرع|دفعت في فرع|خصم مرتين|مبلغ غلط|مبلغ خطأ|إصابة|عملية|سفر|انتقل|انتقلت|عرض مكتوب)/u,
];
/** Who confirmed it or what can be checked: a person, a receipt, a channel. */
const PROOF_SIGNALS: readonly RegExp[] = [
  /\b(receipt|invoice|ref(erence)?|#)\s*[a-z]*-?\d+/i,
  /\b(confirmed (by|with)|approved by|agreed with|spoke (to|with)|checked with|signed by|shown (at|to)|per (the )?(email|message|whatsapp) from|manager [A-Z][a-z]+)\s+\S+/i,
  /\b(at the desk|by phone|in writing|by email|on whatsapp|in person)\b/i,
  /\b[A-Z][a-z]+ [A-Z][a-z]+\b/, // a person's name
  /(إيصال رقم|فاتورة رقم|أكد|أكدت|بالهاتف|على الكاونتر|خطياً|بموافقة)/u,
];
/** When it happened. */
const WHEN_SIGNALS: readonly RegExp[] = [
  /\b\d{1,4}([./-]\d{1,4}){1,2}\b/, // a date
  /\b(today|yesterday|this morning|this afternoon|tonight|last (week|night|month)|on (mon|tue|wed|thu|fri|sat|sun)[a-z]*|back on|returns? on|until \d|from .* to)\b/i,
  /(بتاريخ|يوم (السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة)|اليوم|أمس|الأسبوع الماضي|راجع بتاريخ)/u,
];

/** The preview's stand-in: placeholders, generic phrases, then what / proof / when signals. */
export function resolveReasonCheckFixture(input: { state: JevState }): JevJudgment | undefined {
  const state = record(input.state);
  const reason = normalizeWhitespace(text(state.reason));
  const levelCount = REASON_CHECK_LEVELS.length;
  const judge = (level: number, score: number): JevJudgment => {
    const probabilities: Record<string, number> = {};
    for (let index = 0; index < levelCount; index += 1) probabilities[String(index)] = index === level ? 0.82 : 0.18 / (levelCount - 1);
    return { kind: "score", score, level, levelCount, probabilities, confidence: 0.84 };
  };
  const words = reason.split(/\s+/).filter(Boolean);
  if (!reason || reason.length < 4 || PLACEHOLDER_REASON.test(reason) || !/[\p{L}]{3,}/u.test(reason)) return judge(0, 0.2);
  const what = mentionsAny(reason, WHAT_SIGNALS);
  const proof = mentionsAny(reason, PROOF_SIGNALS);
  const when = mentionsAny(reason, WHEN_SIGNALS);
  const groups = [what, proof, when].filter(Boolean).length;
  if (groups === 3 || (proof && when && words.length >= 8)) return judge(3, 2.85);
  if (groups >= 1 && words.length >= 4) return judge(2, 2.1);
  if (mentionsAny(reason, GENERIC_PHRASES) || words.length <= 5) return judge(1, 1.05);
  return judge(2, 1.8);
}

export interface ReasonCheckReading {
  level: 0 | 1 | 2 | 3;
  label: string;
  /** The question to ask the person; empty when the reason already carries the detail. */
  prompt?: string;
}

/** The clarification a page shows for a level: it asks for the missing fact and never supplies one. */
export function reasonCheckReading(judgment: JevJudgment, action: ReasonActionKey): ReasonCheckReading {
  const level = judgment.kind === "score" ? (Math.min(3, Math.max(0, Math.round(judgment.level))) as 0 | 1 | 2 | 3) : 1;
  const prompts = REASON_ACTIONS[action].prompts;
  const labels = ["Not a reason yet", "Too general", "Missing who or when", "Specific enough"] as const;
  const prompt = level === 0 ? "Write what actually happened; this text goes into the audit log under your name." : level === 1 ? prompts.what : level === 2 ? prompts.who : undefined;
  return { level, label: labels[level], prompt };
}
