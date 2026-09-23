import { countBefore, hasArabic, mentionsAny, normalizeText, numbersIn, splitPassages } from "./assistPassages";
import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * Public-page draft review. Pure module shared by the Convex loader, the
 * preview adapter and the Settings editor.
 *
 * The application cuts the saved draft's tagline and description (both
 * languages) into addressable passages and lists what the gym's own records
 * say: active branches, published trainers, active PT packages, active plans
 * and their terms, the timetable, the chosen amenities and audience. Jev is
 * asked two bounded questions over those passages: which passage the records
 * contradict, and which passage says something the other language's text
 * does not. Silence in the records is never a contradiction; a passage the
 * records do not cover stays unknown, and code lists it as unchecked.
 */

type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type ChoiceJudgment = Extract<JevJudgment, { kind: "choice" }>;

function spread(ids: readonly string[], choice: string, weight: number): ChoiceJudgment {
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - weight) / others.length : 0;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = id === choice ? (others.length ? weight : 1) : rest;
  return { kind: "choice", choice, probabilities, confidence: Math.min(0.96, weight + 0.04) };
}

function spreadMany(ids: readonly string[], flagged: readonly string[], weight: number): ChoiceJudgment {
  const chosen = flagged.filter((id) => ids.includes(id));
  if (!chosen.length) return spread(ids, ids[0] ?? "", 1);
  const others = ids.filter((id) => !chosen.includes(id));
  const share = weight / chosen.length;
  const rest = others.length ? (1 - weight) / others.length : 0;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = chosen.includes(id) ? (others.length ? share : 1 / chosen.length) : rest;
  return { kind: "choice", choice: chosen[0]!, probabilities, confidence: Math.min(0.94, weight + 0.02) };
}

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

export type ProfileLanguage = "en" | "ar";
export type ProfileTextField = "taglineEn" | "taglineAr" | "descriptionEn" | "descriptionAr";

export interface ProfilePassage {
  id: string;
  lang: ProfileLanguage;
  field: ProfileTextField;
  index: number;
  text: string;
}

export interface ProfileDraftText {
  taglineEn: string;
  taglineAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
}

const FIELDS: ReadonlyArray<{ field: ProfileTextField; lang: ProfileLanguage; key: keyof ProfileDraftText }> = [
  { field: "taglineEn", lang: "en", key: "taglineEn" },
  { field: "descriptionEn", lang: "en", key: "descriptionEn" },
  { field: "taglineAr", lang: "ar", key: "taglineAr" },
  { field: "descriptionAr", lang: "ar", key: "descriptionAr" },
];

export const PROFILE_FIELD_LABELS: Record<ProfileTextField, string> = {
  taglineEn: "English tagline",
  taglineAr: "Arabic tagline",
  descriptionEn: "English description",
  descriptionAr: "Arabic description",
};

export function profilePassages(draft: ProfileDraftText): ProfilePassage[] {
  const passages: ProfilePassage[] = [];
  for (const { field, lang, key } of FIELDS) {
    splitPassages(draft[key] ?? "").forEach((slice, index) => passages.push({ id: `${lang}:${field}:${index}`, lang, field, index, text: slice }));
  }
  return passages;
}

// ---------------------------------------------------------------------------
// Recorded services and the review context
// ---------------------------------------------------------------------------

export interface ProfileRecordedServices {
  branches: { count: number; names: string[] };
  trainers: { publishedCount: number; names: string[]; specialties: string[]; languages: string[] };
  ptPackages: { count: number; names: string[] };
  plans: { count: number; names: string[]; freezeAvailable: boolean; multiBranchAccess: boolean; includedTraining: boolean };
  classes: { count: number; names: string[] };
  amenities: string[];
  audience: string;
  category: string;
}

export interface GymProfileReviewContext {
  organizationId: string;
  version: number;
  status: string;
  updatedAt: string;
  hasArabic: boolean;
  passages: ProfilePassage[];
  services: ProfileRecordedServices;
  generatedAt: string;
}

export function buildGymProfileReviewContext(input: { organizationId: string; version: number; status: string; updatedAt: string; draft: ProfileDraftText; services: ProfileRecordedServices; now?: string }): GymProfileReviewContext {
  const passages = profilePassages(input.draft);
  return {
    organizationId: input.organizationId,
    version: input.version,
    status: input.status,
    updatedAt: input.updatedAt,
    hasArabic: passages.some((passage) => passage.lang === "ar"),
    passages,
    services: {
      ...input.services,
      branches: { count: input.services.branches.count, names: input.services.branches.names.slice(0, 20) },
      trainers: { ...input.services.trainers, names: input.services.trainers.names.slice(0, 40), specialties: [...new Set(input.services.trainers.specialties)].slice(0, 40), languages: [...new Set(input.services.trainers.languages)] },
      ptPackages: { count: input.services.ptPackages.count, names: input.services.ptPackages.names.slice(0, 20) },
      plans: { ...input.services.plans, names: input.services.plans.names.slice(0, 30) },
      classes: { count: input.services.classes.count, names: [...new Set(input.services.classes.names)].slice(0, 30) },
    },
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

function servicesState(services: ProfileRecordedServices): Record<string, string | number | boolean | string[]> {
  return {
    activeBranches: services.branches.count,
    branchNames: services.branches.names,
    publishedTrainers: services.trainers.publishedCount,
    trainerNames: services.trainers.names,
    trainerSpecialties: services.trainers.specialties,
    trainerLanguages: services.trainers.languages,
    activePtPackages: services.ptPackages.count,
    ptPackageNames: services.ptPackages.names,
    activePlans: services.plans.count,
    planNames: services.plans.names,
    anyPlanAllowsFreezing: services.plans.freezeAvailable,
    anyPlanGrantsEveryBranch: services.plans.multiBranchAccess,
    anyPlanIncludesTraining: services.plans.includedTraining,
    scheduledClasses: services.classes.count,
    classNames: services.classes.names,
    chosenAmenities: services.amenities,
    audience: services.audience,
    category: services.category,
  };
}

// ---------------------------------------------------------------------------
// Concept families, bilingual
// ---------------------------------------------------------------------------

export interface ProfileConceptFamily {
  id: string;
  label: string;
  patterns: readonly RegExp[];
  /** Whether the recorded services can confirm or deny the concept at all. */
  checkable: boolean;
}

export const PROFILE_CONCEPTS: readonly ProfileConceptFamily[] = [
  { id: "women_only", label: "women-only access", checkable: true, patterns: [/\b(women|ladies|female)s?[- ]only\b/i, /\bfor women only\b/i, /\bwomen'?s[- ]only\b/i, /للسيدات فقط|للنساء فقط|سيدات فقط|نسائي فقط|نساء فقط/] },
  { id: "men_only", label: "men-only access", checkable: true, patterns: [/\bmen[- ]only\b/i, /\bfor men only\b/i, /للرجال فقط|رجالي فقط|رجال فقط/] },
  { id: "branches", label: "branch count", checkable: true, patterns: [/\b(branch|branches|location|locations|sites)\b/i, /فرع|فروع|أفرع|افرع|موقع/] },
  { id: "trainers", label: "trainer count", checkable: true, patterns: [/\b(trainers?|coach|coaches)\b/i, /مدرب|مدربين|مدربات|مدربون/] },
  { id: "freeze", label: "membership freezing", checkable: true, patterns: [/\bfreez(e|es|ing)\b|\bpause\b/i, /تجميد|جمد|جمّد|إيقاف مؤقت|ايقاف مؤقت/] },
  { id: "multi_branch", label: "access to every branch", checkable: true, patterns: [/\b(all|every|any) (of our )?(branch|branches|location|locations)\b/i, /كل الفروع|جميع الفروع|أي فرع|اي فرع|كافة الفروع/] },
  { id: "personal_training", label: "personal training", checkable: false, patterns: [/personal train/i, /\bpt\b/i, /one[- ]on[- ]one|1[- ]on[- ]1/i, /تدريب شخصي|مدرب شخصي|مدربين شخصيين|تدريب خاص/] },
  { id: "classes", label: "group classes", checkable: false, patterns: [/\bclass(es)?\b|group (session|training|workout)s?/i, /حصص|كلاسات|صفوف|تمارين جماعية|تدريب جماعي/] },
  { id: "parking", label: "parking", checkable: false, patterns: [/\bparking\b/i, /موقف|مواقف|باركنج|كراج|جراج/] },
  { id: "showers", label: "showers", checkable: false, patterns: [/\bshowers?\b|\blockers?\b/i, /دش|دشات|حمامات|استحمام|خزائن/] },
  { id: "free_weights", label: "free weights", checkable: false, patterns: [/free weights?|barbells?|dumbbells?/i, /أوزان حرة|اوزان حرة|دمبل/] },
  { id: "cardio", label: "cardio", checkable: false, patterns: [/\bcardio\b|treadmills?/i, /كارديو|تريدميل|سير كهربائي/] },
  { id: "pool", label: "pool", checkable: false, patterns: [/\bpools?\b|\bswim/i, /مسبح|سباحة/] },
  { id: "sauna", label: "sauna or steam", checkable: false, patterns: [/\bsauna\b|steam room/i, /ساونا|غرفة بخار|بخار/] },
  { id: "all_day", label: "24-hour opening", checkable: false, patterns: [/24\s*\/\s*7|24 hours|around the clock|all day|\b24h\b/i, /24 ساعة|على مدار الساعة|طوال اليوم|٢٤ ساعة/] },
  { id: "nutrition", label: "nutrition", checkable: false, patterns: [/nutrition|\bdiet\b|meal plans?/i, /تغذية|حمية|نظام غذائي|رجيم/] },
  { id: "kids", label: "kids", checkable: false, patterns: [/\bkids?\b|children|juniors?/i, /أطفال|اطفال|صغار|ناشئين/] },
  { id: "students", label: "students", checkable: false, patterns: [/\bstudents?\b/i, /طلاب|طالب|طالبات/] },
  { id: "families", label: "families", checkable: false, patterns: [/famil(y|ies)/i, /عائل|عوائل|أسر|اسر/] },
  { id: "offers", label: "offers or discounts", checkable: false, patterns: [/\bdiscounts?\b|special offers?|\bpromo(tion)?s?\b|free trial|first (week|month) free/i, /خصم|خصومات|عرض خاص|عروض خاصة|تجربة مجانية/] },
  { id: "certified", label: "certified staff", checkable: false, patterns: [/certified|licensed|accredited|qualified/i, /معتمد|معتمدين|مرخص|مؤهل/] },
  { id: "physio", label: "physiotherapy or rehab", checkable: false, patterns: [/physio|rehab/i, /علاج طبيعي|تأهيل/] },
  { id: "boxing", label: "boxing or martial arts", checkable: false, patterns: [/\bboxing\b|kickbox|\bmma\b|martial arts?/i, /ملاكمة|كيك بوكسينج|فنون قتالية/] },
  { id: "yoga", label: "yoga or pilates", checkable: false, patterns: [/\byoga\b|pilates/i, /يوغا|يوجا|بيلاتس/] },
];

export function profileConceptsIn(value: string): ProfileConceptFamily[] {
  const normalized = normalizeText(value);
  return PROFILE_CONCEPTS.filter((family) => mentionsAny(value, family.patterns) || mentionsAny(normalized, family.patterns));
}

// ---------------------------------------------------------------------------
// Claims the recorded services contradict
// ---------------------------------------------------------------------------

export const PROFILE_NONE = "none";

export function buildProfileClaimState(input: { context: GymProfileReviewContext }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  return {
    state: {
      version: context.version,
      passages: context.passages.map((passage) => ({ id: passage.id, field: PROFILE_FIELD_LABELS[passage.field], text: passage.text })),
      recordedServices: servicesState(context.services),
      note: "Only a contradiction counts. A facility, service or feature the records do not mention is unknown, not false.",
    },
    candidates: [
      ...context.passages.map((passage) => ({ id: passage.id, description: `${PROFILE_FIELD_LABELS[passage.field]}: "${passage.text}"` })),
      { id: PROFILE_NONE, description: "No passage contradicts the recorded services. Anything the records do not cover is unknown, not false." },
    ],
    scopeKey: `gymProfile:${context.organizationId}:v${context.version}`,
    sourceVersion: "profile-claim-check:1",
  };
}

/** "Every branch" is a plan claim only when the passage is about access or training there, not about parking or showers at each branch. */
const ACCESS_CONTEXT = /\b(access|train|trains|training|use|visit|visits|work ?out|membership|members?)\b|دخول|تدرب|تتدرب|تمرن|اشتراك|عضوية|الأعضاء|الاعضاء/i;
const BRANCH_NOUN = /branch|branches|location|locations|sites|فرع|فروع|افرع|اقسام|مواقع/;
const TRAINER_NOUN = /trainers?|coach|coaches|instructors?|مدرب|مدربين|مدربات|مدربون/;

/**
 * Why the recorded services contradict a passage, or undefined when they do
 * not (or say nothing). The wording quotes the records only.
 */
export function profileClaimEvidence(passage: Pick<ProfilePassage, "text">, services: ProfileRecordedServices): string | undefined {
  const value = passage.text;
  const branchClaim = countBefore(value, BRANCH_NOUN);
  if (branchClaim !== undefined && branchClaim !== services.branches.count) return `Recorded: ${services.branches.count} active branch${services.branches.count === 1 ? "" : "es"}${services.branches.names.length ? ` (${services.branches.names.join(", ")})` : ""}.`;
  const trainerClaim = countBefore(value, TRAINER_NOUN);
  if (trainerClaim !== undefined && trainerClaim > services.trainers.publishedCount) return `Recorded: ${services.trainers.publishedCount} published trainer profile${services.trainers.publishedCount === 1 ? "" : "s"}${services.trainers.names.length ? ` (${services.trainers.names.join(", ")})` : ""}.`;
  const families = new Set(profileConceptsIn(value).map((family) => family.id));
  if (families.has("women_only") && normalizeText(services.audience) !== "women") return `Recorded audience: ${services.audience}.`;
  if (families.has("men_only") && normalizeText(services.audience) !== "men") return `Recorded audience: ${services.audience}.`;
  if (families.has("freeze") && services.plans.count > 0 && !services.plans.freezeAvailable) return `Recorded plans (${services.plans.names.join(", ")}) allow no freeze days.`;
  if (families.has("multi_branch") && ACCESS_CONTEXT.test(value) && services.branches.count > 1 && services.plans.count > 0 && !services.plans.multiBranchAccess) return `Recorded plans (${services.plans.names.join(", ")}) are limited to selected branches; none grants every branch.`;
  return undefined;
}

export function resolveProfileClaimFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const recorded = record(state.recordedServices);
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const services: ProfileRecordedServices = {
    branches: { count: number(recorded.activeBranches), names: list(recorded.branchNames) },
    trainers: { publishedCount: number(recorded.publishedTrainers), names: list(recorded.trainerNames), specialties: list(recorded.trainerSpecialties), languages: list(recorded.trainerLanguages) },
    ptPackages: { count: number(recorded.activePtPackages), names: list(recorded.ptPackageNames) },
    plans: { count: number(recorded.activePlans), names: list(recorded.planNames), freezeAvailable: recorded.anyPlanAllowsFreezing === true, multiBranchAccess: recorded.anyPlanGrantsEveryBranch === true, includedTraining: recorded.anyPlanIncludesTraining === true },
    classes: { count: number(recorded.scheduledClasses), names: list(recorded.classNames) },
    amenities: list(recorded.chosenAmenities),
    audience: text(recorded.audience),
    category: text(recorded.category),
  };
  const passages = (Array.isArray(state.passages) ? state.passages : []).map(record);
  const flagged = passages.filter((passage) => ids.includes(text(passage.id)) && profileClaimEvidence({ text: text(passage.text) }, services)).map((passage) => text(passage.id));
  if (!flagged.length) return spread(ids, ids.includes(PROFILE_NONE) ? PROFILE_NONE : ids[0]!, 0.82);
  return spreadMany(ids, flagged, 0.86);
}

/** Everything that carries at least half the top option's mass is flagged with it; a long tail is not. */
export interface ProfilePassageFinding {
  passage: ProfilePassage;
  probability: number;
  evidence: string;
}

export function resolveProfileClaimReading(judgment: JevJudgment, context: GymProfileReviewContext): { clear: boolean; findings: ProfilePassageFinding[] } {
  if (judgment.kind !== "choice") return { clear: false, findings: [] };
  if (judgment.choice === PROFILE_NONE) return { clear: true, findings: [] };
  const byId = new Map(context.passages.map((passage) => [passage.id, passage] as const));
  // Choice alternatives express uncertainty, not additional independent findings.
  const findings = Object.entries(judgment.probabilities)
    .filter(([id]) => id === judgment.choice)
    .map(([id, probability]) => ({ passage: byId.get(id), probability }))
    .filter((entry): entry is { passage: ProfilePassage; probability: number } => Boolean(entry.passage))
    .map((entry) => ({ ...entry, evidence: profileClaimEvidence(entry.passage, context.services) ?? "Compare this passage with the recorded services below; the records do not confirm it." }));
  return { clear: false, findings };
}

/** Passages that mention something the records cannot confirm or deny; listed as unknown, never as false. */
export function profileUncheckedClaims(context: GymProfileReviewContext): Array<{ passage: ProfilePassage; concepts: string[] }> {
  return context.passages
    .map((passage) => ({ passage, concepts: profileConceptsIn(passage.text).filter((family) => !family.checkable).map((family) => family.label) }))
    .filter((entry) => entry.concepts.length > 0)
    .slice(0, 12);
}

// ---------------------------------------------------------------------------
// Meaningful differences between the Arabic and English text
// ---------------------------------------------------------------------------

export const PROFILE_LANGUAGE_GAP_UNAVAILABLE = "Add an Arabic tagline or description to compare the two languages.";

export function languageGapUnavailableReason(context: Pick<GymProfileReviewContext, "passages">): string | undefined {
  const hasEnglish = context.passages.some((passage) => passage.lang === "en");
  const hasArabicText = context.passages.some((passage) => passage.lang === "ar");
  return hasEnglish && hasArabicText ? undefined : PROFILE_LANGUAGE_GAP_UNAVAILABLE;
}

export function buildLanguageGapState(input: { context: GymProfileReviewContext }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  return {
    state: {
      version: context.version,
      english: context.passages.filter((passage) => passage.lang === "en").map((passage) => ({ id: passage.id, field: PROFILE_FIELD_LABELS[passage.field], text: passage.text })),
      arabic: context.passages.filter((passage) => passage.lang === "ar").map((passage) => ({ id: passage.id, field: PROFILE_FIELD_LABELS[passage.field], text: passage.text })),
      note: "A difference is a service, facility, number, price, restriction or audience that one language states and the other does not, or that the two state differently. Wording, order, tone and idiom are not differences.",
    },
    candidates: [
      ...context.passages.map((passage) => ({ id: passage.id, description: `${PROFILE_FIELD_LABELS[passage.field]}: "${passage.text}"` })),
      { id: PROFILE_NONE, description: "No meaningful difference: both languages state the same services, numbers and restrictions, even if worded differently." },
    ],
    scopeKey: `gymProfile:${context.organizationId}:v${context.version}`,
    sourceVersion: "profile-language-gap:1",
  };
}

interface LanguageProfile {
  concepts: Set<string>;
  numbers: Set<string>;
}

function languageProfile(texts: readonly string[]): LanguageProfile {
  const joined = texts.join(" \n ");
  return { concepts: new Set(profileConceptsIn(joined).map((family) => family.id)), numbers: new Set(numbersIn(joined)) };
}

/** What a passage states that the other language's whole text does not; empty when it is a paraphrase. */
export function languageGapEvidence(passage: Pick<ProfilePassage, "lang" | "text">, context: Pick<GymProfileReviewContext, "passages">): string | undefined {
  const other = languageProfile(context.passages.filter((candidate) => candidate.lang !== passage.lang).map((candidate) => candidate.text));
  const missingConcepts = profileConceptsIn(passage.text).filter((family) => !other.concepts.has(family.id)).map((family) => family.label);
  const missingNumbers = numbersIn(passage.text).filter((number) => !other.numbers.has(number));
  if (!missingConcepts.length && !missingNumbers.length) return undefined;
  const otherName = passage.lang === "en" ? "Arabic" : "English";
  const parts = [missingConcepts.length ? `mentions ${missingConcepts.join(", ")}` : "", missingNumbers.length ? `states the number${missingNumbers.length === 1 ? "" : "s"} ${missingNumbers.join(", ")}` : ""].filter(Boolean);
  return `This passage ${parts.join(" and ")}; the ${otherName} text does not.`;
}

export function resolveLanguageGapFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const english = (Array.isArray(state.english) ? state.english : []).map(record);
  const arabic = (Array.isArray(state.arabic) ? state.arabic : []).map(record);
  const passages = [
    ...english.map((passage) => ({ id: text(passage.id), lang: "en" as const, text: text(passage.text) })),
    ...arabic.map((passage) => ({ id: text(passage.id), lang: "ar" as const, text: text(passage.text) })),
  ];
  const context = { passages: passages.map((passage) => ({ ...passage, field: "descriptionEn" as const, index: 0 })) };
  const flagged = passages.filter((passage) => ids.includes(passage.id) && languageGapEvidence(passage, context)).map((passage) => passage.id);
  if (!flagged.length) return spread(ids, ids.includes(PROFILE_NONE) ? PROFILE_NONE : ids[0]!, 0.8);
  return spreadMany(ids, flagged, 0.84);
}

export function resolveLanguageGapReading(judgment: JevJudgment, context: GymProfileReviewContext): { aligned: boolean; findings: ProfilePassageFinding[] } {
  if (judgment.kind !== "choice") return { aligned: false, findings: [] };
  if (judgment.choice === PROFILE_NONE) return { aligned: true, findings: [] };
  const byId = new Map(context.passages.map((passage) => [passage.id, passage] as const));
  // Choice alternatives express uncertainty, not additional independent findings.
  const findings = Object.entries(judgment.probabilities)
    .filter(([id]) => id === judgment.choice)
    .map(([id, probability]) => ({ passage: byId.get(id), probability }))
    .filter((entry): entry is { passage: ProfilePassage; probability: number } => Boolean(entry.passage))
    .map((entry) => ({ ...entry, evidence: languageGapEvidence(entry.passage, context) ?? `The ${entry.passage.lang === "en" ? "Arabic" : "English"} text does not state this.` }));
  return { aligned: false, findings };
}

export function profileDraftHasArabic(draft: ProfileDraftText): boolean {
  return hasArabic(`${draft.taglineAr ?? ""} ${draft.descriptionAr ?? ""}`);
}
