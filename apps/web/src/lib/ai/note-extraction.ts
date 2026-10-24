import { z } from "zod";
import type { AiDateResolution, AiNoteExtraction, AiSourceKind } from "./contracts";
import { normalizeNoteText, resolveDatePhrase, timeOfDayIn } from "./relative-dates";

/**
 * Contact note → prepared fields.
 *
 * A model (or, in fixture mode, the deterministic reader below) may only
 * point at words in the note. RIVET then resolves every date itself against
 * the note time and the gym's timezone, checks that each piece of evidence is
 * really in the note, and drops anything it cannot verify. Text in the note
 * that tries to instruct RIVET is ignored and reported, never followed.
 */

export const NOTE_EXTRACTION_PROMPT_VERSION = "note-extraction.v1";
export const NOTE_MAX_LENGTH = 2_000;

type Outcome = NonNullable<AiNoteExtraction["outcome"]>["value"];
type Topic = AiNoteExtraction["topics"][number];

/** Stable short hash for cache keys and receipts; not a security boundary. */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function noteHash(note: string, noteAt: string, timezone: string): string {
  return stableHash(`${normalizeNoteText(note)}|${noteAt.slice(0, 16)}|${timezone}`);
}

/** Split a note into clauses, keeping the original words for evidence. */
export function noteClauses(note: string): string[] {
  return note
    .split(/(?<=[.!?؟;؛,،\n])|\s+(?:and then|then|but|and|ثم|بس|لكن)\s+/u)
    .map((clause) => clause.replace(/^[\s,،.;؛]+|[\s,،.;؛]+$/gu, ""))
    .filter((clause) => clause.length > 0);
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(ignore|disregard|forget) (all |the |any )?(previous|prior|above|earlier) (instructions?|rules?|messages?)\b/i,
  /\b(system|assistant|developer)\s*(prompt|message|:)/i,
  /\byou are (now )?(an?|the) (ai|assistant|model|admin)\b/i,
  /\b(export|send|show|reveal|list) (all|every) (members?|records?|customers?|phone numbers?|data)\b/i,
  /\b(api[_ -]?key|secret|password|token)s?\b/i,
  /\b(grant|give) (me |yourself )?(admin|owner|full) (access|permissions?|role)\b/i,
  /\b(approve|refund|delete|void) (all|every|this)\b/i,
  /(تجاهل|انسَ|انسى) (كل )?(التعليمات|الأوامر|القواعد)/u,
  /(أعطني|اعطيني) (صلاحية|صلاحيات) (المالك|المدير|كاملة)/u,
  /(صدّر|صدر|ابعت|أرسل) (كل|جميع) (الأعضاء|المشتركين|الأرقام)/u,
];

export function containsInstructionAttempt(note: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(note));
}

const OUTCOME_PATTERNS: Array<{ outcome: Outcome; en: RegExp; ar: RegExp }> = [
  { outcome: "wrong_number", en: /\b(wrong number|not (his|her|their) number|number (is )?(wrong|disconnected|not in service))\b/i, ar: /(رقم غلط|الرقم غلط|الرقم خطأ|رقم خطأ|مش رقمه|مش رقمها)/u },
  { outcome: "no_answer", en: /\b(no answer|didn'?t (answer|pick up)|did not (answer|pick up)|not answering|no reply|voicemail|unreachable|phone (was )?off)\b/i, ar: /(ما رد|مارد|ما ردت|ماردت|لم يرد|لم ترد|ما بيرد|مسكر|مغلق|لا يرد)/u },
  { outcome: "answered_not_interested", en: /\b(not interested|isn'?t interested|no longer interested|won'?t (renew|come back|be renewing)|not renewing|doesn'?t want|does not want|cancel(ling|led)? (his|her|their)? ?membership)\b/i, ar: /(مش مهتم|مش مهتمة|غير مهتم|غير مهتمة|ما بدو|ما بدها|مش رح يجدد|مش رح تجدد|مش حابب|مش حابة|بدو يلغي|بدها تلغي)/u },
  { outcome: "whatsapp_sent", en: /\b(sent (him|her|them)? ?(a )?whatsapp|whatsapp(ed)? (him|her|them)|messaged (him|her|them) on whatsapp)\b/i, ar: /(بعتله واتساب|بعتلها واتساب|أرسلت واتساب|ارسلت واتساب|بعتت رسالة واتساب)/u },
];

const CALL_REQUEST_EN = /\b(call|ring|phone|contact|follow up|follow-up|check in|reach|try( again| later)?)\b/i;
const CALL_REQUEST_AR = /(اتصل|اتصلي|اتصال|كلم|كلمه|كلمها|رن|تابع|تواصل|احكي معه|احكي معها|جرب|جربي|حاول|حاولي)/u;
const TRAVEL_EN = /\b(travel(l?ing|s|led)?|abroad|out of (the )?country|on a trip|away|overseas|holiday|vacation|out of town|umrah|hajj)\b/i;
const TRAVEL_AR = /(مسافر|مسافرة|سفر|بسافر|برا البلد|خارج البلد|عمرة|الحج|بالسفر)/u;
const UNTIL_EN = /\b(until|till|til|through|back (on|by)|returns? (on|by)?|coming back)\b/i;
const UNTIL_AR = /(لحد|لغاية|حتى|لعند|راجع|راجعة|برجع|بترجع|يرجع|ترجع)/u;
const INTEREST_YES_EN = /\b(interested in renewing|wants to renew|will renew|going to renew|plans to renew|happy to renew|keen to renew|interested)\b/i;
const INTEREST_YES_AR = /(بدو يجدد|بدها تجدد|حابب يجدد|حابة تجدد|رح يجدد|رح تجدد|مهتم|مهتمة|موافق يجدد)/u;
const INTEREST_MAYBE_EN = /\b(thinking about it|will think|not sure|undecided|maybe|considering)\b/i;
const INTEREST_MAYBE_AR = /(بفكر|بتفكر|رح يفكر|رح تفكر|مش متأكد|مش متأكدة|يمكن|لسا مش مقرر)/u;
const PREFERS_EN = /\b(prefers?|better|best|only|usually free|free) (in the )?(mornings?|afternoons?|evenings?|after work|after \d)/i;
const PREFERS_AR = /(بيحب|بتحب|أفضل|افضل|بس|دايما|عادة).{0,12}(الصبح|بعد الظهر|المسا|المساء|بالليل|بعد الدوام)/u;

const TOPIC_PATTERNS: Array<{ topic: Topic; en: RegExp; ar: RegExp }> = [
  { topic: "complaint", en: /\b(complain(t|ed|ing|s)?|unhappy|angry|upset|frustrated|rude|dirty|broken|not working|overcharged|charged twice|refund|bad experience)\b/i, ar: /(شكوى|اشتكى|اشتكت|زعلان|زعلانة|معصب|مش راضي|مش راضية|خربان|مكسور|وسخ|تعامل سيء)/u },
  { topic: "price", en: /\b(price|expensive|cost|discount|cheaper|afford|money)\b/i, ar: /(السعر|غالي|غالية|خصم|أرخص|ارخص|المصاري|مصاري)/u },
  { topic: "schedule", en: /\b(schedule|timing|class times?|evening class(es)?|morning class(es)?|no time|busy|work hours|shift)\b/i, ar: /(الوقت|المواعيد|مواعيد|الحصص|حصة|ما عنده وقت|مشغول|مشغولة|الدوام)/u },
  { topic: "injury", en: /\b(injur(y|ed)|hurt|pain|surgery|doctor|physio)\b/i, ar: /(إصابة|اصابة|مصاب|مصابة|وجع|عملية|دكتور|علاج طبيعي)/u },
  { topic: "renewal", en: /\b(renew(al|ing)?|membership end(s|ing)?|expir(es|ing|ed))\b/i, ar: /(تجديد|يجدد|تجدد|اشتراكه|اشتراكها|ينتهي|خلص الاشتراك)/u },
];

function matches(clause: string, en: RegExp, ar: RegExp): boolean {
  const normalized = normalizeNoteText(clause);
  return en.test(normalized) || ar.test(normalized);
}

/**
 * Deterministic bilingual reading used in fixture mode, in tests and in the
 * evaluation harness. It is labelled `fixture`; production never uses it as a
 * fallback for an unavailable provider.
 */
export function extractNoteDeterministic(input: { note: string; noteAt: string; timezone: string; subject: "member" | "lead" }): AiNoteExtraction {
  const note = input.note.slice(0, NOTE_MAX_LENGTH);
  const clauses = noteClauses(note);
  const result: AiNoteExtraction = {
    noteHash: noteHash(note, input.noteAt, input.timezone),
    topics: [],
    clarifications: [],
    ignoredInstructions: containsInstructionAttempt(note),
    source: "fixture",
    promptVersion: NOTE_EXTRACTION_PROMPT_VERSION,
  };
  // Instruction-like clauses never contribute fields; they are reported instead.
  const usable = clauses.filter((clause) => !containsInstructionAttempt(clause));

  // Travel first, so a callback can be kept after the member is back.
  for (const clause of usable) {
    if (!matches(clause, TRAVEL_EN, TRAVEL_AR)) continue;
    if (!result.topics.includes("travel")) result.topics.push("travel");
    if (matches(clause, UNTIL_EN, UNTIL_AR) || /\b(back|return)/i.test(clause)) {
      const until = resolveDatePhrase(clause.replace(/\b(evening|morning|afternoon)\b/gi, ""), input.noteAt, input.timezone);
      if (until) {
        result.travelUntil = { value: { ...until, time: undefined }, evidence: clause };
        if (until.alternatives?.length) result.clarifications.push({ field: "travelUntil", messageKey: "aiWork.extract.clarifyTravelDate" });
      }
    }
    if (!result.travelUntil) result.clarifications.push({ field: "travelUntil", messageKey: "aiWork.extract.travelNoDate" });
    break;
  }

  let callRequested = false;
  for (const clause of usable) {
    if (result.travelUntil && clause === result.travelUntil.evidence && !matches(clause, CALL_REQUEST_EN, CALL_REQUEST_AR)) continue;
    if (!matches(clause, CALL_REQUEST_EN, CALL_REQUEST_AR)) continue;
    const resolved = resolveDatePhrase(clause, input.noteAt, input.timezone, { notBefore: result.travelUntil?.value.date });
    if (!resolved) continue;
    callRequested = true;
    result.followUp = { value: resolved, evidence: clause };
    if (resolved.alternatives?.length) result.clarifications.push({ field: "followUp", messageKey: "aiWork.extract.clarifyFollowUpDate" });
    break;
  }

  for (const { outcome, en, ar } of OUTCOME_PATTERNS) {
    const clause = usable.find((candidate) => matches(candidate, en, ar));
    if (clause) {
      result.outcome = { value: outcome, evidence: clause };
      break;
    }
  }
  if (!result.outcome) {
    if (callRequested && result.followUp) {
      result.outcome = { value: "answered_call_back", evidence: result.followUp.evidence };
    } else {
      const interested = usable.find((clause) => matches(clause, INTEREST_YES_EN, INTEREST_YES_AR));
      if (interested) result.outcome = { value: "answered_interested", evidence: interested };
    }
  }

  const notRenewing = usable.find((clause) => /\b(won'?t|not|no longer) (renew|be renewing)|not renewing\b/i.test(normalizeNoteText(clause)) || /(مش رح يجدد|مش رح تجدد|ما بدو يجدد|ما بدها تجدد)/u.test(normalizeNoteText(clause)));
  const yes = usable.find((clause) => matches(clause, INTEREST_YES_EN, INTEREST_YES_AR) && !/\bnot interested\b/i.test(clause) && !/(مش مهتم|غير مهتم)/u.test(clause));
  const maybe = usable.find((clause) => matches(clause, INTEREST_MAYBE_EN, INTEREST_MAYBE_AR));
  if (notRenewing) result.renewalInterest = { value: "not_interested", evidence: notRenewing };
  else if (maybe) result.renewalInterest = { value: "undecided", evidence: maybe };
  else if (yes && /renew|تجدد|يجدد|تجديد/iu.test(yes)) result.renewalInterest = { value: "interested", evidence: yes };

  const preferring = usable.find((clause) => matches(clause, PREFERS_EN, PREFERS_AR));
  const timed = preferring ? timeOfDayIn(normalizeNoteText(preferring)) : undefined;
  if (preferring && timed) result.preferredContactTime = { value: timed.value, evidence: preferring };
  else if (/after work|بعد الدوام/iu.test(note)) {
    const clause = usable.find((candidate) => /after work|بعد الدوام/iu.test(candidate));
    if (clause) result.preferredContactTime = { value: "evening", evidence: clause };
  }

  if (callRequested && !result.topics.includes("callback")) result.topics.push("callback");
  for (const { topic, en, ar } of TOPIC_PATTERNS) {
    if (usable.some((clause) => matches(clause, en, ar)) && !result.topics.includes(topic)) result.topics.push(topic);
  }
  // A lead's trial outcomes are recorded by hand; members never get them.
  if (input.subject === "member" && result.outcome && !["no_answer", "answered_interested", "answered_not_interested", "answered_call_back", "wrong_number", "whatsapp_sent"].includes(result.outcome.value)) delete result.outcome;
  if (result.outcome?.value === "answered_call_back" && !result.followUp) result.clarifications.push({ field: "followUp", messageKey: "aiWork.extract.callbackNoDate" });
  return result;
}

// ---------------------------------------------------------------------------
// Live model output: phrases and evidence only, validated strictly.
// ---------------------------------------------------------------------------

const evidenceText = z.string().trim().min(1).max(400);

export const modelNoteOutputSchema = z.object({
  outcome: z.object({ value: z.enum(["no_answer", "answered_interested", "answered_not_interested", "answered_call_back", "wrong_number", "whatsapp_sent"]), evidence: evidenceText }).nullable().optional(),
  followUpPhrase: z.object({ phrase: z.string().trim().min(1).max(120), evidence: evidenceText }).nullable().optional(),
  travelUntilPhrase: z.object({ phrase: z.string().trim().min(1).max(120), evidence: evidenceText }).nullable().optional(),
  renewalInterest: z.object({ value: z.enum(["interested", "not_interested", "undecided"]), evidence: evidenceText }).nullable().optional(),
  preferredContactTime: z.object({ value: z.enum(["morning", "afternoon", "evening"]), evidence: evidenceText }).nullable().optional(),
  topics: z.array(z.enum(["callback", "travel", "complaint", "price", "schedule", "injury", "renewal"])).max(7).default([]),
}).strict();

export type ModelNoteOutput = z.infer<typeof modelNoteOutputSchema>;

function inNote(note: string, evidence: string): boolean {
  const haystack = normalizeNoteText(note).toLowerCase();
  const needle = normalizeNoteText(evidence).toLowerCase();
  return needle.length > 0 && haystack.includes(needle);
}

/**
 * Turn validated model output into the same extraction contract the fixture
 * produces. Evidence not found in the note drops that field; RIVET computes
 * dates; nothing in the output can add tools, permissions or actions.
 */
export function normalizeModelNoteOutput(raw: unknown, input: { note: string; noteAt: string; timezone: string; subject: "member" | "lead"; source: AiSourceKind }): { extraction: AiNoteExtraction; droppedFields: string[] } | { error: "malformed" } {
  const parsed = modelNoteOutputSchema.safeParse(raw);
  if (!parsed.success) return { error: "malformed" };
  const output = parsed.data;
  const dropped: string[] = [];
  const extraction: AiNoteExtraction = {
    noteHash: noteHash(input.note, input.noteAt, input.timezone),
    topics: [...new Set(output.topics)],
    clarifications: [],
    ignoredInstructions: containsInstructionAttempt(input.note),
    source: input.source,
    promptVersion: NOTE_EXTRACTION_PROMPT_VERSION,
  };
  const resolve = (phrase: { phrase: string; evidence: string } | null | undefined, field: "followUp" | "travelUntil", notBefore?: string): { value: AiDateResolution; evidence: string } | undefined => {
    if (!phrase) return undefined;
    if (!inNote(input.note, phrase.evidence) || !inNote(phrase.evidence, phrase.phrase)) {
      dropped.push(field);
      return undefined;
    }
    const value = resolveDatePhrase(phrase.phrase, input.noteAt, input.timezone, { notBefore });
    if (!value) {
      dropped.push(field);
      return undefined;
    }
    return { value: field === "travelUntil" ? { ...value, time: undefined } : value, evidence: phrase.evidence };
  };
  const travel = resolve(output.travelUntilPhrase, "travelUntil");
  if (travel) {
    extraction.travelUntil = travel;
    if (travel.value.alternatives?.length) extraction.clarifications.push({ field: "travelUntil", messageKey: "aiWork.extract.clarifyTravelDate" });
  }
  const followUp = resolve(output.followUpPhrase, "followUp", travel?.value.date);
  if (followUp) {
    extraction.followUp = followUp;
    if (followUp.value.alternatives?.length) extraction.clarifications.push({ field: "followUp", messageKey: "aiWork.extract.clarifyFollowUpDate" });
  }
  for (const key of ["outcome", "renewalInterest", "preferredContactTime"] as const) {
    const value = output[key];
    if (!value) continue;
    if (!inNote(input.note, value.evidence)) {
      dropped.push(key);
      continue;
    }
    // Each key keeps its own literal type; the cast only joins the three branches.
    (extraction as unknown as Record<string, unknown>)[key] = { value: value.value, evidence: value.evidence };
  }
  if (input.subject === "member" && extraction.outcome && !["no_answer", "answered_interested", "answered_not_interested", "answered_call_back", "wrong_number", "whatsapp_sent"].includes(extraction.outcome.value)) delete extraction.outcome;
  if (extraction.outcome?.value === "answered_call_back" && !extraction.followUp) extraction.clarifications.push({ field: "followUp", messageKey: "aiWork.extract.callbackNoDate" });
  return { extraction, droppedFields: dropped };
}

// ---------------------------------------------------------------------------
// Applying suggestions to a form without overwriting the person's work
// ---------------------------------------------------------------------------

export interface ContactFormState {
  outcome?: string;
  nextFollowUp?: string;
  nextFollowUpTime?: string;
  touched: { outcome: boolean; nextFollowUp: boolean };
}

export interface FieldSuggestion {
  field: "outcome" | "nextFollowUp" | "travelUntil" | "renewalInterest" | "preferredContactTime";
  value: string;
  time?: string;
  evidence: string;
  /** The person already set this field; RIVET shows the suggestion but never replaces their value. */
  blockedByEdit: boolean;
  needsChoice: boolean;
  alternatives: Array<{ date: string; time?: string; reasonKey: string }>;
}

export function fieldSuggestions(extraction: AiNoteExtraction, form: ContactFormState): FieldSuggestion[] {
  const suggestions: FieldSuggestion[] = [];
  if (extraction.outcome) suggestions.push({ field: "outcome", value: extraction.outcome.value, evidence: extraction.outcome.evidence, blockedByEdit: form.touched.outcome && Boolean(form.outcome) && form.outcome !== extraction.outcome.value, needsChoice: false, alternatives: [] });
  if (extraction.followUp) suggestions.push({ field: "nextFollowUp", value: extraction.followUp.value.date, time: extraction.followUp.value.time, evidence: extraction.followUp.evidence, blockedByEdit: form.touched.nextFollowUp && Boolean(form.nextFollowUp) && form.nextFollowUp !== extraction.followUp.value.date, needsChoice: Boolean(extraction.followUp.value.alternatives?.length), alternatives: extraction.followUp.value.alternatives ?? [] });
  if (extraction.travelUntil) suggestions.push({ field: "travelUntil", value: extraction.travelUntil.value.date, evidence: extraction.travelUntil.evidence, blockedByEdit: false, needsChoice: Boolean(extraction.travelUntil.value.alternatives?.length), alternatives: extraction.travelUntil.value.alternatives ?? [] });
  if (extraction.renewalInterest) suggestions.push({ field: "renewalInterest", value: extraction.renewalInterest.value, evidence: extraction.renewalInterest.evidence, blockedByEdit: false, needsChoice: false, alternatives: [] });
  if (extraction.preferredContactTime) suggestions.push({ field: "preferredContactTime", value: extraction.preferredContactTime.value, evidence: extraction.preferredContactTime.evidence, blockedByEdit: false, needsChoice: false, alternatives: [] });
  return suggestions;
}
