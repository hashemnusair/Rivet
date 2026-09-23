import { contentTokens, hasArabic, mentionsAny, numbersIn, sharedTokenCount, splitPassages, stemMatch } from "./assistPassages";
import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * Support and review assistance for the platform inbox. Pure module shared by
 * the Convex loaders, the preview adapter and the console UI.
 *
 * The application cuts every gym and platform message into addressable
 * passages and builds the recorded facts about the gym (subscription, ledger,
 * public page). Jev answers bounded questions over those: which category a
 * case belongs to, which invoice it refers to, which single prepared
 * clarification would help, which explicit request no reply has addressed and
 * which passage asserts something the recorded facts do not support. Code
 * decides what is offered and what is shown; nothing here changes a case.
 */

type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type ChoiceJudgment = Extract<JevJudgment, { kind: "choice" }>;

function spread(ids: readonly string[], choice: string, weight: number): ChoiceJudgment {
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - weight) / others.length : 0;
  const probabilities: Record<string, number> = {};
  for (const id of ids) probabilities[id] = id === choice ? (others.length ? weight : 1) : rest;
  return { kind: "choice", choice, probabilities, confidence: Math.min(0.96, weight + 0.04) };
}

/** Several flagged ids share the weight; the first flagged one is the choice. */
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

export const SUPPORT_MAX_PASSAGES = 80;
export const SUPPORT_STATE_PASSAGES = 24;
export const SUPPORT_MAX_INVOICES = 24;
export const SUPPORT_SUMMARY_MAX_LENGTH = 500;

export interface SupportMessageLike {
  id: string;
  authorType: "gym" | "platform";
  authorName: string;
  body: string;
  createdAt: string;
}

export interface SupportCaseLike {
  id: string;
  subject: string;
  body?: string;
  status: string;
  priority: string;
  requestType?: string;
  requestedPlan?: string;
  billingInterval?: string;
  branchName?: string;
  creatorName?: string;
  createdAt?: string;
  updatedAt?: string;
  resolutionSummary?: string;
  messages?: SupportMessageLike[];
}

/** One addressable slice of one message; `text` is a verbatim substring of that message's body. */
export interface SupportPassage {
  id: string;
  messageId: string;
  authorType: "gym" | "platform";
  authorName: string;
  createdAt: string;
  index: number;
  text: string;
}

export function supportPassages(supportCase: SupportCaseLike): SupportPassage[] {
  const messages: SupportMessageLike[] = supportCase.messages?.length
    ? supportCase.messages
    : supportCase.body
      ? [{ id: `case:${supportCase.id}`, authorType: "gym", authorName: supportCase.creatorName ?? "Gym", body: supportCase.body, createdAt: supportCase.createdAt ?? "" }]
      : [];
  const passages: SupportPassage[] = [];
  for (const message of [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    splitPassages(message.body).forEach((slice, index) => {
      passages.push({ id: `${message.id}:${index}`, messageId: message.id, authorType: message.authorType === "platform" ? "platform" : "gym", authorName: message.authorName, createdAt: message.createdAt, index, text: slice });
    });
  }
  // The newest passages matter most before closure; keep the head of the case too.
  if (passages.length <= SUPPORT_MAX_PASSAGES) return passages;
  const head = passages.slice(0, 8);
  return [...head, ...passages.slice(passages.length - (SUPPORT_MAX_PASSAGES - head.length))];
}

// ---------------------------------------------------------------------------
// Categories and review destinations (existing console pages only)
// ---------------------------------------------------------------------------

export type SupportCategoryId = "technical_issue" | "feature_upgrade" | "billing_schedule" | "invoice_dispute" | "public_page" | "account_access" | "other";
export type SupportDestinationKind = "gym_record" | "billing_invoice" | "billing_gym" | "gym_public_page";

export interface SupportCategory {
  id: SupportCategoryId;
  label: string;
  description: string;
  destination: SupportDestinationKind;
  keywords: readonly string[];
}

export const SUPPORT_CATEGORIES: readonly SupportCategory[] = [
  { id: "invoice_dispute", label: "Invoice dispute", description: "The gym disputes an invoice that exists: its amount, a payment it says it made, a duplicate or a charge it does not recognise.", destination: "billing_invoice", keywords: ["invoice", "charged", "double", "twice", "duplicate", "overcharged", "amount", "we paid", "already paid", "payment failed", "receipt", "refund", "فاتورة", "فاتوره", "دفعنا", "مبلغ", "مرتين", "استرجاع", "استرداد"] },
  { id: "billing_schedule", label: "Billing schedule request", description: "The gym asks to change when or how often it is billed: billing date, cadence, renewal timing or a payment extension.", destination: "billing_gym", keywords: ["billing date", "billing cycle", "cadence", "renewal date", "due date", "extension", "extend", "postpone", "monthly instead", "annual instead", "move our billing", "switch to annual", "switch to monthly", "تاريخ الفوترة", "دورة الفوترة", "تمديد", "تأجيل", "سنوي بدل", "شهري بدل"] },
  { id: "feature_upgrade", label: "Feature or plan upgrade", description: "The gym asks for a feature, a higher plan or a module it does not have on its current plan.", destination: "gym_record", keywords: ["upgrade", "upgrading", "plan", "growth", "pro", "enterprise", "feature", "module", "unlock", "entitle", "financial reporting", "automation", "ترقية", "باقة", "خطة", "ميزة", "خاصية"] },
  { id: "public_page", label: "Public page review", description: "The gym asks RIVET to review, publish, change or take down its public page in Find gyms.", destination: "gym_public_page", keywords: ["public page", "public profile", "draft", "publish", "directory", "find gyms", "listing", "take down", "unpublish", "الصفحة العامة", "الملف العام", "نشر", "مسودة", "الدليل"] },
  { id: "account_access", label: "Account or access", description: "Sign-in, invitations, roles, permissions or a staff member who cannot get in.", destination: "gym_record", keywords: ["login", "log in", "sign in", "password", "invitation", "invite", "permission", "role", "access", "locked out", "cannot get in", "staff", "تسجيل الدخول", "دعوة", "صلاحية", "صلاحيات", "كلمة المرور", "الدخول"] },
  { id: "technical_issue", label: "Technical issue", description: "Something in the product does not work: an error, a device, a sync, an import, a page that fails.", destination: "gym_record", keywords: ["error", "bug", "crash", "not working", "doesn't work", "does not work", "failed", "fails", "broken", "scanner", "kiosk", "printer", "slow", "sync", "import", "stuck", "blank", "cannot", "can't", "unable", "لا يعمل", "خطأ", "عطل", "مشكلة", "معلق", "لا يفتح", "بطيء"] },
  { id: "other", label: "Other", description: "Anything the categories above do not cover, or a case that is not yet clear.", destination: "gym_record", keywords: [] },
];

export interface SupportDestination {
  label: string;
  href: string;
}

/** Only destinations that already exist in the console; the invoice deep link needs a real invoice id from the ledger. */
export function supportDestination(input: { category: SupportCategoryId; gymId: string; caseId: string; invoiceId?: string }): SupportDestination {
  const category = SUPPORT_CATEGORIES.find((candidate) => candidate.id === input.category) ?? SUPPORT_CATEGORIES[SUPPORT_CATEGORIES.length - 1]!;
  const gymRecord = { label: "Open gym record", href: `/platform/gyms/${encodeURIComponent(input.gymId)}` };
  switch (category.destination) {
    case "billing_invoice":
      return input.invoiceId
        ? { label: `Open invoice ${input.invoiceId} in the ledger`, href: `/platform/billing?invoice=${encodeURIComponent(input.invoiceId)}&case=${encodeURIComponent(input.caseId)}` }
        : { label: "Open the gym's subscription invoices", href: gymRecord.href };
    case "billing_gym":
      return { label: "Open the gym in Billing", href: `/platform/billing?bill=${encodeURIComponent(input.gymId)}&case=${encodeURIComponent(input.caseId)}` };
    case "gym_public_page":
      return { label: "Open gym record (public page)", href: gymRecord.href };
    default:
      return gymRecord;
  }
}

// ---------------------------------------------------------------------------
// Recorded facts and the review context
// ---------------------------------------------------------------------------

export interface SupportInvoiceFact {
  id: string;
  status: string;
  amount?: string;
  amountMinor?: number;
  currency?: string;
  date?: string;
  issuedAt?: string;
  dueAt?: string;
  paidAt?: string;
  periodStart?: string;
  periodEnd?: string;
  billingInterval?: string;
}

export interface SupportFacts {
  gymId: string;
  gymName: string;
  organizationStatus?: string;
  plan?: string;
  billingInterval?: string;
  currentPeriodEndsAt?: string;
  trialEndsAt?: string;
  branchCount?: number;
  invoices: SupportInvoiceFact[];
  publicPage?: { publishedVersion: number; draftVersion?: number; draftAwaitingReview: boolean };
}

export interface SupportCategoryView {
  id: SupportCategoryId;
  label: string;
  description: string;
  destination: SupportDestination;
}

export interface SupportClarification {
  id: string;
  label: string;
  text: string;
  categories: readonly SupportCategoryId[];
}

export const SUPPORT_CLARIFICATIONS: readonly SupportClarification[] = [
  { id: "invoice_reference", label: "Invoice number, amount and payment date", text: "Could you tell us the invoice number, the amount and the date you paid it, so we can check the ledger entry?", categories: ["invoice_dispute"] },
  { id: "billing_target", label: "Which billing date or cadence", text: "Which billing date or cadence (monthly or annual) would you like, and from which period should it apply?", categories: ["billing_schedule"] },
  { id: "plan_target", label: "Which plan and cadence", text: "Which plan (Growth, Pro or Enterprise) and billing cadence do you need, and which feature is blocking you today?", categories: ["feature_upgrade"] },
  { id: "where_when", label: "Branch, device and time", text: "Which branch and device were affected, and when did it last happen (date and time)?", categories: ["technical_issue"] },
  { id: "error_text", label: "What the screen showed", text: "What message did the screen show, and could you send a screenshot?", categories: ["technical_issue"] },
  { id: "draft_version", label: "Which draft version", text: "Which saved draft version should we review, and did anything change after you sent it?", categories: ["public_page"] },
  { id: "account_target", label: "Which user and role", text: "Which staff member (name and email) and which role should have access?", categories: ["account_access"] },
  { id: "outcome", label: "What outcome is needed", text: "What outcome do you need from us, and by when?", categories: ["other", "technical_issue", "account_access"] },
];

export interface SupportReviewContext {
  caseId: string;
  gymId: string;
  gymName: string;
  subject: string;
  status: string;
  priority: string;
  requestType: string;
  requestedPlan?: string;
  billingInterval?: string;
  branchName?: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount: number;
  passages: SupportPassage[];
  facts: SupportFacts;
  categories: SupportCategoryView[];
  clarifications: SupportClarification[];
  generatedAt: string;
}

export function buildSupportReviewContext(input: { supportCase: SupportCaseLike; gymId: string; facts: SupportFacts; now?: string }): SupportReviewContext {
  const { supportCase } = input;
  return {
    caseId: supportCase.id,
    gymId: input.gymId,
    gymName: input.facts.gymName,
    subject: supportCase.subject,
    status: supportCase.status,
    priority: supportCase.priority,
    requestType: supportCase.requestType ?? "general",
    requestedPlan: supportCase.requestedPlan,
    billingInterval: supportCase.billingInterval,
    branchName: supportCase.branchName,
    createdAt: supportCase.createdAt,
    updatedAt: supportCase.updatedAt,
    messageCount: supportCase.messages?.length ?? (supportCase.body ? 1 : 0),
    passages: supportPassages(supportCase),
    facts: { ...input.facts, invoices: input.facts.invoices.slice(0, SUPPORT_MAX_INVOICES) },
    categories: SUPPORT_CATEGORIES.map((category) => ({ id: category.id, label: category.label, description: category.description, destination: supportDestination({ category: category.id, gymId: input.gymId, caseId: supportCase.id }) })),
    clarifications: SUPPORT_CLARIFICATIONS.map((clarification) => ({ ...clarification })),
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

function gymText(context: SupportReviewContext, limit = SUPPORT_STATE_PASSAGES): string[] {
  return context.passages.filter((passage) => passage.authorType === "gym").slice(0, limit).map((passage) => passage.text);
}

function platformText(context: SupportReviewContext, limit = SUPPORT_STATE_PASSAGES): string[] {
  return context.passages.filter((passage) => passage.authorType === "platform").slice(-limit).map((passage) => passage.text);
}

function invoiceLine(invoice: SupportInvoiceFact): string {
  return [invoice.id, invoice.status, invoice.amount ?? (invoice.amountMinor !== undefined ? `${(invoice.amountMinor / 1000).toFixed(3)} ${invoice.currency ?? ""}`.trim() : undefined), invoice.date ?? invoice.issuedAt?.slice(0, 10), invoice.paidAt ? `paid ${invoice.paidAt.slice(0, 10)}` : undefined, invoice.billingInterval].filter(Boolean).join(" · ");
}

function factsState(facts: SupportFacts): Record<string, string | number | boolean | string[]> {
  return {
    gym: facts.gymName,
    organizationStatus: facts.organizationStatus ?? "unknown",
    plan: facts.plan ?? "not recorded",
    billingInterval: facts.billingInterval ?? "not recorded",
    currentPeriodEndsAt: facts.currentPeriodEndsAt?.slice(0, 10) ?? "not recorded",
    branchCount: facts.branchCount ?? -1,
    invoices: facts.invoices.slice(0, SUPPORT_MAX_INVOICES).map(invoiceLine),
    publicPage: facts.publicPage ? `published v${facts.publicPage.publishedVersion}${facts.publicPage.draftAwaitingReview ? ` · draft v${facts.publicPage.draftVersion} awaiting review` : " · no draft awaiting review"}` : "not recorded",
  };
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export function buildSupportCategoryState(input: { context: SupportReviewContext }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  return {
    state: {
      caseId: context.caseId,
      subject: context.subject,
      requestType: context.requestType,
      requestedPlan: context.requestedPlan ?? "",
      requestedBillingInterval: context.billingInterval ?? "",
      priority: context.priority,
      branch: context.branchName ?? "",
      gymMessages: gymText(context, 16),
      platformMessages: platformText(context, 6),
      facts: factsState(context.facts),
    },
    candidates: SUPPORT_CATEGORIES.map((category) => ({ id: category.id, description: `${category.label}: ${category.description}` })),
    scopeKey: `supportCase:${context.caseId}`,
    sourceVersion: "support-category:1",
  };
}

const PLAN_NAMES = ["starter", "growth", "pro", "enterprise"];
const INVOICE_ID_PATTERN = /\b[a-z]{2,5}-\d{3,}\b/;

function keywordHits(haystack: string, keywords: readonly string[]): number {
  return keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
}

export function resolveSupportCategoryFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const haystack = [text(state.subject), ...strings(state.gymMessages)].join(" \n ").toLowerCase();
  if (text(state.requestType) === "plan_upgrade" && ids.includes("feature_upgrade")) return spread(ids, "feature_upgrade", 0.88);
  const scores = new Map<SupportCategoryId, number>();
  for (const category of SUPPORT_CATEGORIES) {
    if (!ids.includes(category.id) || category.id === "other") continue;
    scores.set(category.id, keywordHits(haystack, category.keywords));
  }
  // A named invoice is the strongest sign of a dispute about an invoice that exists.
  if (scores.has("invoice_dispute") && INVOICE_ID_PATTERN.test(haystack)) scores.set("invoice_dispute", (scores.get("invoice_dispute") ?? 0) + 2);
  // A plan name alone is weak evidence for an upgrade: "pro" appears inside other words too.
  if (scores.has("feature_upgrade") && !/upgrad|ترقية|باقة|plan\b|خطة|feature|module|ميزة/.test(haystack)) scores.set("feature_upgrade", Math.max(0, (scores.get("feature_upgrade") ?? 0) - PLAN_NAMES.filter((name) => haystack.includes(name)).length));
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const [best, runnerUp] = ranked;
  if (!best || best[1] === 0) return spread(ids, ids.includes("other") ? "other" : ids[0]!, 0.55);
  const margin = best[1] - (runnerUp?.[1] ?? 0);
  // The mass follows the evidence, so a case that straddles two categories shows both.
  return distribute(ids, scores, margin >= 2 ? 0.88 : margin === 1 ? 0.7 : 0.55);
}

function distribute(ids: readonly string[], weights: ReadonlyMap<string, number>, confidence: number): ChoiceJudgment {
  const floor = 0.02;
  const raw = ids.map((id) => Math.max(floor, weights.get(id) ?? 0));
  const sum = raw.reduce((total, value) => total + value, 0);
  const probabilities: Record<string, number> = {};
  ids.forEach((id, index) => { probabilities[id] = raw[index]! / sum; });
  const choice = ids.reduce((top, id) => (probabilities[id]! > probabilities[top]! ? id : top), ids[0]!);
  return { kind: "choice", choice, probabilities, confidence };
}

export interface SupportCategoryReading {
  category: SupportCategoryView;
  probability: number;
  /** Categories that also carry weight, for an honest "or" when the case straddles two. */
  alternatives: Array<{ category: SupportCategoryView; probability: number }>;
}

export function resolveSupportCategoryReading(judgment: JevJudgment, context: SupportReviewContext): SupportCategoryReading | undefined {
  if (judgment.kind !== "choice") return undefined;
  const category = context.categories.find((candidate) => candidate.id === judgment.choice);
  if (!category) return undefined;
  const alternatives = Object.entries(judgment.probabilities)
    .filter(([id, probability]) => id !== judgment.choice && probability >= 0.2)
    .map(([id, probability]) => ({ category: context.categories.find((candidate) => candidate.id === id), probability }))
    .filter((entry): entry is { category: SupportCategoryView; probability: number } => Boolean(entry.category))
    .sort((left, right) => right.probability - left.probability)
    .slice(0, 2);
  return { category, probability: judgment.probabilities[judgment.choice] ?? 0, alternatives };
}

// ---------------------------------------------------------------------------
// Invoice match: which recorded invoice a billing case refers to
// ---------------------------------------------------------------------------

export const SUPPORT_NONE = "none";

export function buildSupportInvoiceMatchState(input: { context: SupportReviewContext }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  const invoices = context.facts.invoices.slice(0, SUPPORT_MAX_INVOICES);
  return {
    state: {
      caseId: context.caseId,
      subject: context.subject,
      gymMessages: gymText(context, 16),
      invoiceCount: invoices.length,
    },
    candidates: [
      ...invoices.map((invoice) => ({ id: invoice.id, description: `Invoice ${invoiceLine(invoice)}` })),
      { id: SUPPORT_NONE, description: "None of the recorded invoices: the case names no invoice, or the invoice it names is not in this list." },
    ],
    scopeKey: `supportCase:${context.caseId}`,
    sourceVersion: "support-invoice-match:1",
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function resolveSupportInvoiceMatchFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const candidates = input.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const haystack = [text(state.subject), ...strings(state.gymMessages)].join(" \n ").toLowerCase();
  const invoices = candidates.filter((candidate) => candidate.id !== SUPPORT_NONE);
  const byId = invoices.find((candidate) => haystack.includes(candidate.id.toLowerCase()));
  if (byId) return spread(ids, byId.id, 0.9);
  const numbers = numbersIn(haystack);
  const byAmount = invoices.filter((candidate) => numbersIn(candidate.description.split("·")[2] ?? "").some((amount) => numbers.some((number) => number === amount || number === amount.replace(/\.000$/, ""))));
  if (byAmount.length === 1) return spread(ids, byAmount[0]!.id, 0.7);
  const monthMentions = MONTHS.filter((month) => new RegExp(`\\b${month}`).test(haystack));
  const byMonth = invoices.filter((candidate) => monthMentions.some((month) => candidate.description.toLowerCase().includes(month)));
  if (byMonth.length === 1) return spread(ids, byMonth[0]!.id, 0.62);
  return spread(ids, ids.includes(SUPPORT_NONE) ? SUPPORT_NONE : ids[0]!, 0.7);
}

export interface SupportInvoiceReading {
  invoice?: SupportInvoiceFact;
  probability: number;
}

export function resolveSupportInvoiceReading(judgment: JevJudgment, context: SupportReviewContext): SupportInvoiceReading {
  if (judgment.kind !== "choice" || judgment.choice === SUPPORT_NONE) return { probability: judgment.kind === "choice" ? judgment.probabilities[judgment.choice] ?? 0 : 0 };
  const invoice = context.facts.invoices.find((candidate) => candidate.id === judgment.choice);
  return { invoice, probability: judgment.probabilities[judgment.choice] ?? 0 };
}

// ---------------------------------------------------------------------------
// One prepared clarification, or none
// ---------------------------------------------------------------------------

export function supportClarificationsFor(category?: SupportCategoryId): SupportClarification[] {
  const relevant = category ? SUPPORT_CLARIFICATIONS.filter((clarification) => clarification.categories.includes(category)) : [...SUPPORT_CLARIFICATIONS];
  return relevant.length ? relevant : [...SUPPORT_CLARIFICATIONS];
}

export function isSupportCategoryId(value: unknown): value is SupportCategoryId {
  return typeof value === "string" && SUPPORT_CATEGORIES.some((category) => category.id === value);
}

export function buildSupportClarificationState(input: { context: SupportReviewContext; category?: SupportCategoryId }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  return {
    state: {
      caseId: context.caseId,
      subject: context.subject,
      category: input.category ?? "unknown",
      requestType: context.requestType,
      requestedPlan: context.requestedPlan ?? "",
      branch: context.branchName ?? "",
      gymMessages: gymText(context, 16),
      platformMessages: platformText(context, 8),
    },
    candidates: [
      ...supportClarificationsFor(input.category).map((clarification) => ({ id: clarification.id, description: `${clarification.label}: "${clarification.text}"` })),
      { id: SUPPORT_NONE, description: "No clarification: the case already contains what the team needs to act, or a prepared question would not help." },
    ],
    scopeKey: `supportCase:${context.caseId}`,
    sourceVersion: "support-clarification:1",
  };
}

const DATE_PATTERN = /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b|\b(yesterday|today|this morning|last week|امس|أمس|اليوم|الاسبوع الماضي)\b/;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;

function clarificationAnswered(id: string, haystack: string, state: Data): boolean {
  switch (id) {
    case "invoice_reference": return INVOICE_ID_PATTERN.test(haystack) && (DATE_PATTERN.test(haystack) || /\bpaid on\b|دفعنا (في|بتاريخ)/.test(haystack));
    case "billing_target": return /\b(monthly|annual|annually|yearly)\b|شهري|سنوي/.test(haystack) && (/\b\d{1,2}(st|nd|rd|th)?\b.*\b(of|each|every)\b|\bfrom (next|the next|january|february|march|april|may|june|july|august|september|october|november|december)|\b(next|from) (month|term|period|renewal)\b|من (الشهر|الفترة) القادم|اول الشهر|أول الشهر/.test(haystack) || /\bfrom\b/.test(haystack));
    case "plan_target": return Boolean(text(state.requestedPlan)) || PLAN_NAMES.some((name) => new RegExp(`\\b${name}\\b`).test(haystack));
    case "where_when": return Boolean(text(state.branch)) && DATE_PATTERN.test(haystack);
    case "error_text": return /\berror\b|\bmessage\b|\bsays\b|\bshows\b|screenshot|\bcode\b|رسالة|خطأ|صورة/.test(haystack);
    case "draft_version": return /\bv\d+\b|\bversion\b|نسخة|مسودة رقم/.test(haystack);
    case "account_target": return EMAIL_PATTERN.test(haystack);
    case "outcome": return /\?|؟/.test(haystack) || /\bwe need\b|\bplease\b|نريد|نحتاج|الرجاء|نرجو/.test(haystack);
    default: return false;
  }
}

export function resolveSupportClarificationFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const haystack = [text(state.subject), ...strings(state.gymMessages)].join(" \n ").toLowerCase();
  const offered = ids.filter((id) => id !== SUPPORT_NONE);
  const open = offered.find((id) => !clarificationAnswered(id, haystack, state));
  if (open) return spread(ids, open, 0.78);
  return spread(ids, ids.includes(SUPPORT_NONE) ? SUPPORT_NONE : ids[0]!, 0.8);
}

export function resolveSupportClarificationReading(judgment: JevJudgment, context: SupportReviewContext): { clarification?: SupportClarification; probability: number } {
  if (judgment.kind !== "choice" || judgment.choice === SUPPORT_NONE) return { probability: judgment.kind === "choice" ? judgment.probabilities[judgment.choice] ?? 0 : 0 };
  return { clarification: context.clarifications.find((candidate) => candidate.id === judgment.choice), probability: judgment.probabilities[judgment.choice] ?? 0 };
}

// ---------------------------------------------------------------------------
// Pre-closure: explicit requests no reply addressed
// ---------------------------------------------------------------------------

export const SUPPORT_ALL_ANSWERED = "all_answered";

const REQUEST_PATTERNS: readonly RegExp[] = [
  /\?|؟/,
  /\b(please|kindly|can you|could you|would you|we need|we want|we would like|we'd like|need you to|when will|when can|why|how do|how can|let us know|send us|refund|move our|change our|add|remove|fix|upgrade|cancel|extend|confirm|update|apply|activate|enable|disable|review|publish|unpublish|reset)\b/i,
  /من فضلك|لو سمحت|ممكن|نريد|نحتاج|نرجو|الرجاء|متى|لماذا|كيف|هل|أرسلوا|ارسلوا|أعيدوا|اعيدوا|غيروا|اضيفوا|أضيفوا|حدثوا|فعلوا|ألغوا|الغوا|مددوا|أكدوا|اكدوا|راجعوا|انشروا/,
];

export function supportRequestPassages(passages: readonly SupportPassage[]): SupportPassage[] {
  return passages.filter((passage) => passage.authorType === "gym" && mentionsAny(passage.text, REQUEST_PATTERNS)).slice(-30);
}

export function buildSupportUnansweredState(input: { context: SupportReviewContext; summaryDraft?: string }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  const requests = supportRequestPassages(context.passages);
  const replies = context.passages.filter((passage) => passage.authorType === "platform").slice(-30);
  return {
    state: {
      caseId: context.caseId,
      subject: context.subject,
      status: context.status,
      requests: requests.map((passage) => ({ id: passage.id, at: passage.createdAt.slice(0, 16), text: passage.text })),
      platformReplies: replies.map((passage) => ({ at: passage.createdAt.slice(0, 16), text: passage.text })),
      closingSummaryDraft: (input.summaryDraft ?? "").slice(0, SUPPORT_SUMMARY_MAX_LENGTH),
    },
    candidates: [
      ...requests.map((passage) => ({ id: passage.id, description: `${passage.authorName} (${passage.createdAt.slice(0, 10)}): "${passage.text}"` })),
      { id: SUPPORT_ALL_ANSWERED, description: "Every explicit request above is addressed by a platform reply or by the closing summary draft." },
    ],
    scopeKey: `supportCase:${context.caseId}`,
    sourceVersion: "support-unanswered:1",
  };
}

function addressedBy(request: string, replies: readonly string[]): boolean {
  const requestTokens = contentTokens(request);
  if (!requestTokens.length) return replies.length > 0;
  const needed = Math.min(2, requestTokens.length);
  return replies.some((reply) => sharedTokenCount(request, reply) >= needed || contentTokens(reply).some((token) => /^[a-z]{2,5}-\d{3,}$/.test(token) && requestTokens.includes(token)));
}

export function resolveSupportUnansweredFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const requests = (Array.isArray(state.requests) ? state.requests : []).map(record);
  const replies = [...(Array.isArray(state.platformReplies) ? state.platformReplies : []).map((reply) => text(record(reply).text)), text(state.closingSummaryDraft)].filter(Boolean);
  const laterReplies = (at: string) => (Array.isArray(state.platformReplies) ? state.platformReplies : []).map(record).filter((reply) => text(reply.at) >= at).map((reply) => text(reply.text)).concat(text(state.closingSummaryDraft) ? [text(state.closingSummaryDraft)] : []);
  const unanswered = requests.filter((request) => ids.includes(text(request.id)) && !addressedBy(text(request.text), text(request.at) ? laterReplies(text(request.at)) : replies)).map((request) => text(request.id));
  if (!unanswered.length) return spread(ids, ids.includes(SUPPORT_ALL_ANSWERED) ? SUPPORT_ALL_ANSWERED : ids[0]!, 0.84);
  return spreadMany(ids, unanswered, 0.86);
}

/** Everything that carries at least half the top option's mass is flagged with it; a long tail is not. */
export interface SupportPassageFinding {
  passage: SupportPassage;
  probability: number;
  /** Deterministic note from the recorded facts; never model prose. */
  evidence?: string;
}

/** Flagged passages whose ids still exist on the case; anything else is dropped rather than shown. */
export function resolveSupportUnansweredReading(judgment: JevJudgment, context: SupportReviewContext): { allAnswered: boolean; findings: SupportPassageFinding[] } {
  if (judgment.kind !== "choice") return { allAnswered: false, findings: [] };
  if (judgment.choice === SUPPORT_ALL_ANSWERED) return { allAnswered: true, findings: [] };
  const byId = new Map(context.passages.map((passage) => [passage.id, passage] as const));
  // Choice alternatives express uncertainty, not additional independent findings.
  const findings = Object.entries(judgment.probabilities)
    .filter(([id]) => id === judgment.choice)
    .map(([id, probability]) => ({ passage: byId.get(id), probability }))
    .filter((entry): entry is { passage: SupportPassage; probability: number } => Boolean(entry.passage));
  return { allAnswered: false, findings };
}

// ---------------------------------------------------------------------------
// Pre-closure: claims the recorded facts do not support
// ---------------------------------------------------------------------------

const PLATFORM_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(fixed|resolved|sorted|done|applied|updated|upgraded|moved|changed|switched|activated|enabled|published|refunded|credited|voided|cancelled|reactivated|restored|released|deployed|corrected|now works|should work|is working|working again|paid|settled|went through|processed)\b/i,
  /تم (الحل|الإصلاح|الاصلاح|التحديث|الترقية|النشر|الدفع|التفعيل|التعديل|النقل|الاسترجاع|الاسترداد)|يعمل الان|يعمل الآن|أصلحنا|اصلحنا|حللنا|رقّينا|رقينا|نشرنا/,
];
const GYM_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(we (already )?paid|we have paid|we've paid|payment was made|transferred|bank transfer|we sent the payment|already settled|we upgraded|we are on|we're on|is published|was published|went live|we published)\b/i,
  /دفعنا|تم الدفع|حولنا|حوّلنا|سددنا|تم التحويل|رقّينا|نحن على باقة|تم النشر/,
];
const PAID_CLAIM = /\b(paid|settled|payment|received|went through|processed|cleared)\b|دفع|سدد|تحويل|استلم/i;
const VOID_CLAIM = /\b(void|voided|cancelled the invoice|cancel(l)?ed)\b|ألغينا|الغينا|ملغاة/i;
const PUBLISH_CLAIM = /\b(published|went live|is live|now live|publish)\b|نشر|تم النشر/i;
const INTERVAL_CLAIM = /\b(annual|annually|yearly|monthly)\b|سنوي|شهري/i;
const FIX_CLAIM = /\b(fixed|resolved|sorted|now works|should work|is working|working again|corrected|deployed|restored|released)\b|تم الحل|تم الإصلاح|تم الاصلاح|يعمل الان|يعمل الآن|أصلحنا|اصلحنا|حللنا/i;

export function supportClaimPassages(passages: readonly SupportPassage[]): SupportPassage[] {
  return passages.filter((passage) => (passage.authorType === "platform" ? mentionsAny(passage.text, PLATFORM_CLAIM_PATTERNS) : mentionsAny(passage.text, GYM_CLAIM_PATTERNS))).slice(-30);
}

export function buildSupportClaimState(input: { context: SupportReviewContext }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  const { context } = input;
  const claims = supportClaimPassages(context.passages);
  return {
    state: {
      caseId: context.caseId,
      subject: context.subject,
      claims: claims.map((passage) => ({ id: passage.id, author: passage.authorType, at: passage.createdAt.slice(0, 16), text: passage.text })),
      recordedFacts: factsState(context.facts),
      note: "The recorded facts are the subscription, the invoice ledger and the public page state. A reply saying a technical issue was fixed is not evidence that it was: nothing here records product fixes.",
    },
    candidates: [
      ...claims.map((passage) => ({ id: passage.id, description: `${passage.authorType === "platform" ? "RIVET" : "Gym"} · ${passage.authorName} (${passage.createdAt.slice(0, 10)}): "${passage.text}"` })),
      { id: SUPPORT_NONE, description: "Every claim above is supported by the recorded facts." },
    ],
    scopeKey: `supportCase:${context.caseId}`,
    sourceVersion: "support-claim-check:1",
  };
}

const PAID_STATUSES = new Set(["paid"]);

function invoicesNamed(passage: string, facts: SupportFacts): SupportInvoiceFact[] {
  const lower = passage.toLowerCase();
  return facts.invoices.filter((invoice) => lower.includes(invoice.id.toLowerCase()));
}

function planNamed(passage: string): string | undefined {
  const lower = passage.toLowerCase();
  return ["Starter", "Growth", "Pro", "Enterprise"].find((plan) => new RegExp(`\\b${plan.toLowerCase()}\\b`).test(lower));
}

/**
 * Why a claim is unsupported, from the recorded facts alone. Returns
 * undefined when the facts support the claim or say nothing that contradicts
 * it; the generic "no recorded evidence" reading is only used for fix claims.
 */
export function supportClaimEvidence(passage: Pick<SupportPassage, "authorType" | "text">, facts: SupportFacts): string | undefined {
  const named = invoicesNamed(passage.text, facts);
  if (PAID_CLAIM.test(passage.text)) {
    const unpaid = named.filter((invoice) => !PAID_STATUSES.has(invoice.status));
    if (unpaid.length) return `Ledger: ${unpaid.map((invoice) => `invoice ${invoice.id} is recorded as ${invoice.status.replace("_", " ")}`).join("; ")}.`;
    if (!named.length) {
      const open = facts.invoices.filter((invoice) => ["open", "past_due", "failed"].includes(invoice.status));
      if (open.length) return `Ledger: no invoice is named, and ${open.map((invoice) => `${invoice.id} is ${invoice.status.replace("_", " ")}`).join(", ")}.`;
    }
  }
  if (VOID_CLAIM.test(passage.text)) {
    const notVoid = named.filter((invoice) => invoice.status !== "void");
    if (notVoid.length) return `Ledger: ${notVoid.map((invoice) => `invoice ${invoice.id} is recorded as ${invoice.status.replace("_", " ")}, not void`).join("; ")}.`;
  }
  const plan = planNamed(passage.text);
  if (plan && /\b(upgraded|moved|changed|switched|now on|are on|applied|activated)\b|رقّينا|رقينا|تم الترقية|تم النقل|نحن على/i.test(passage.text) && facts.plan && facts.plan !== plan) return `Subscription: the recorded plan is ${facts.plan}, not ${plan}.`;
  if (passage.authorType === "platform" && INTERVAL_CLAIM.test(passage.text) && /\b(moved|switched|changed|now|applied|updated)\b|تم (النقل|التغيير|التحديث)|نقلنا|غيرنا/i.test(passage.text) && facts.billingInterval) {
    const claimed = /annual|annually|yearly|سنوي/i.test(passage.text) ? "annual" : /monthly|شهري/i.test(passage.text) ? "monthly" : undefined;
    if (claimed && claimed !== facts.billingInterval) return `Subscription: the recorded billing cadence is ${facts.billingInterval}, not ${claimed}.`;
  }
  if (PUBLISH_CLAIM.test(passage.text) && facts.publicPage?.draftAwaitingReview) return `Public page: draft v${facts.publicPage.draftVersion} is still awaiting review; v${facts.publicPage.publishedVersion} is the published version.`;
  if (passage.authorType === "platform" && FIX_CLAIM.test(passage.text) && !named.length && !plan) return "No recorded evidence covers this: the ledger, subscription and public page say nothing about product fixes, and a reply alone does not show the issue was fixed.";
  return undefined;
}

export function resolveSupportClaimFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const ids = (input.candidates ?? []).map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const recorded = record(state.recordedFacts);
  const invoices = strings(recorded.invoices).map((line) => {
    const [id = "", status = ""] = line.split(" · ");
    return { id, status } satisfies SupportInvoiceFact;
  });
  const publicPage = text(recorded.publicPage);
  const draftMatch = /draft v(\d+) awaiting review/.exec(publicPage);
  const publishedMatch = /published v(\d+)/.exec(publicPage);
  const facts: SupportFacts = {
    gymId: "",
    gymName: text(recorded.gym),
    plan: text(recorded.plan) === "not recorded" ? undefined : text(recorded.plan),
    billingInterval: text(recorded.billingInterval) === "not recorded" ? undefined : text(recorded.billingInterval),
    invoices,
    publicPage: publishedMatch ? { publishedVersion: Number(publishedMatch[1]), draftVersion: draftMatch ? Number(draftMatch[1]) : undefined, draftAwaitingReview: Boolean(draftMatch) } : undefined,
  };
  const claims = (Array.isArray(state.claims) ? state.claims : []).map(record);
  const flagged = claims
    .filter((claim) => ids.includes(text(claim.id)) && supportClaimEvidence({ authorType: claim.author === "platform" ? "platform" : "gym", text: text(claim.text) }, facts))
    .map((claim) => text(claim.id));
  if (!flagged.length) return spread(ids, ids.includes(SUPPORT_NONE) ? SUPPORT_NONE : ids[0]!, 0.82);
  return spreadMany(ids, flagged, 0.86);
}

export function resolveSupportClaimReading(judgment: JevJudgment, context: SupportReviewContext): { supported: boolean; findings: SupportPassageFinding[] } {
  if (judgment.kind !== "choice") return { supported: false, findings: [] };
  if (judgment.choice === SUPPORT_NONE) return { supported: true, findings: [] };
  const byId = new Map(context.passages.map((passage) => [passage.id, passage] as const));
  // Choice alternatives express uncertainty, not additional independent findings.
  const findings = Object.entries(judgment.probabilities)
    .filter(([id]) => id === judgment.choice)
    .map(([id, probability]) => ({ passage: byId.get(id), probability }))
    .filter((entry): entry is { passage: SupportPassage; probability: number } => Boolean(entry.passage))
    .map((entry) => ({ ...entry, evidence: supportClaimEvidence(entry.passage, context.facts) ?? "Nothing in the recorded facts confirms this passage. A reply alone is not evidence that a backend issue was fixed." }));
  return { supported: false, findings };
}

/** Case ids and passage ids are opaque; a passage id is valid only when the current case still carries it with the same text. */
export function validSupportPassage(context: SupportReviewContext, id: string): SupportPassage | undefined {
  return context.passages.find((passage) => passage.id === id);
}

export function supportCaseHasArabic(context: SupportReviewContext): boolean {
  return context.passages.some((passage) => hasArabic(passage.text));
}

/** Token overlap helper re-exported for the UI's "also mentioned" hints. */
export const supportStemMatch = stemMatch;
