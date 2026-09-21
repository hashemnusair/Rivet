import { contentTokens, hasArabic, mentionsAny, normalizeText, sharedTokenCount } from "./assistPassages";
import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * Branch-operations assistance: filing a written maintenance description,
 * related repair history, handover grouping and notification grouping. Pure
 * module shared by the Convex loaders, the preview adapter and the pages.
 *
 * Existing record relationships come first (same machine, same checklist
 * item, same linked task, same notification target); Jev only answers
 * bounded questions where the records are silent: which category or target
 * a description points at, whether two similarly worded reports are the same
 * fault, whether two unresolved checklist items are the same problem, and
 * which group a stray notification belongs with. Groups are presentation
 * aids: every original item, owner, branch, date, unread state and safety
 * flag is kept, and nothing here resolves, merges, reads or hides anything.
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

/** Everything that carries at least half the top option's mass counts as "also possible". */
function alsoPossible(judgment: ChoiceJudgment, exclude: readonly string[]): string[] {
  const top = judgment.probabilities[judgment.choice] ?? 0;
  return Object.entries(judgment.probabilities)
    .filter(([id, probability]) => id !== judgment.choice && !exclude.includes(id) && probability >= Math.max(0.05, top * 0.5))
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id);
}

export const BRANCHOPS_NONE = "none";
export const BRANCHOPS_UNCLEAR = "unclear";
export const BRANCHOPS_DESCRIPTION_MIN_LENGTH = 8;
export const BRANCHOPS_DESCRIPTION_MAX_LENGTH = 500;

// ---------------------------------------------------------------------------
// 1. Filing a written description: existing category and room/equipment target
// ---------------------------------------------------------------------------

export type ReportCategoryId = "cleaning" | "inspection" | "incident" | "equipment_issue" | "unclear";

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  description: string;
  patterns: readonly RegExp[];
}

/** The categories that already exist: the three maintenance-task kinds and a machine issue. */
export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  { id: "equipment_issue", label: "Machine issue", description: "A machine is faulty, noisy, stuck or unsafe: recorded against the machine with severity and safety status.", patterns: [/\b(belt|motor|treadmill|bike|rower|elliptical|cable|pulley|weight stack|console|display|screen|button|resistance|pedal|handle|squeak|grind|slipp|stuck|jam|won'?t start|not starting|doesn'?t start|error code|beep|smok|spark|loose bolt|wobbl)/i, /سير|حزام|موتور|محرك|جهاز|آلة|الة|تريدميل|دراجة|كابل|بكرة|شاشة|زر|مقاومة|صوت|علق|معلق|ما يشتغل|لا يعمل|شرار|دخان/] },
  { id: "cleaning", label: "Cleaning task", description: "Dirt, spills, smells, bins or supplies in a gym space.", patterns: [/\b(clean|dirty|spill|smell|stink|mop|wipe|bin|trash|garbage|towel|soap|sanitiz|disinfect|dust|sticky|mess|toilet paper|paper)/i, /تنظيف|نظافة|وسخ|متسخ|انسكب|رائحة|ريحة|مسح|زبالة|قمامة|سلة|مناشف|صابون|معقم|غبار|فوضى/] },
  { id: "incident", label: "Incident", description: "Something happened to a person or the building: injury, leak, flooding, power, water, a broken fixture, a hazard.", patterns: [/\b(injur|hurt|fell|fall|slipped on|slippery|blood|leak|flood|water on|power cut|electric|outage|fire|alarm|broken glass|broken mirror|ceiling|door (won'?t|does ?n'?t)|lock|hazard|emergency|ambulance)/i, /إصابة|اصابة|وقع|سقط|تزحلق|دم|تسريب|تسرب|فيضان|كهرباء|انقطاع|حريق|إنذار|زجاج|مرآة|سقف|باب|قفل|خطر|طوارئ|إسعاف/] },
  { id: "inspection", label: "Inspection", description: "Something should be checked, tested or verified on a schedule rather than fixed now.", patterns: [/\b(inspect|check|test|verify|audit|due for service|service due|routine|schedule|calibrat|expir)/i, /فحص|تفقد|تحقق|اختبار|صيانة دورية|روتيني|موعد الصيانة|معايرة|انتهاء/] },
];

export function reportCategoryOptions(): Record<string, string> {
  return Object.fromEntries([...REPORT_CATEGORIES.map((category) => [category.id, `${category.label}: ${category.description}`] as const), [BRANCHOPS_UNCLEAR, "Unclear: the description does not say what kind of report it is."] as const]);
}

export function buildReportCategoryState(input: { description: string; branchId: string; machineCount: number; spaceCount: number }): { state: JevState; scopeKey: string; sourceVersion: string } {
  return {
    state: { description: input.description.slice(0, BRANCHOPS_DESCRIPTION_MAX_LENGTH), branchMachines: input.machineCount, branchSpaces: input.spaceCount, note: "Categories are the gym's existing report kinds. Severity, safety and who is responsible are set by staff afterwards, never here." },
    scopeKey: `branch:${input.branchId}`,
    sourceVersion: "branchops-report-category:1",
  };
}

export function resolveReportCategoryFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const description = text(record(input.state).description);
  const ids = [...REPORT_CATEGORIES.map((category) => category.id), BRANCHOPS_UNCLEAR];
  if (!description.trim()) return spread(ids, BRANCHOPS_UNCLEAR, 0.7);
  const normalized = normalizeText(description);
  const matches = (pattern: RegExp) => new Set([...description.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)), ...normalized.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].map((match) => match[0].toLowerCase())).size;
  const hits = REPORT_CATEGORIES.map((category) => ({ id: category.id, count: category.patterns.reduce((sum, pattern) => sum + matches(pattern), 0) })).filter((hit) => hit.count > 0);
  if (!hits.length) return spread(ids, BRANCHOPS_UNCLEAR, 0.6);
  // A machine word beside an incident word is an incident about a machine (a leak, a fire): the person, not the fault, comes first.
  const best = hits.sort((left, right) => right.count - left.count || (left.id === "incident" ? -1 : right.id === "incident" ? 1 : 0))[0]!;
  const tie = hits.filter((hit) => hit.count === best.count).length > 1;
  return spread(ids, best.id, tie ? 0.55 : 0.82);
}

export interface ReportCategoryReading {
  category?: ReportCategory;
  unclear: boolean;
  probability: number;
  alternatives: ReportCategory[];
}

export function resolveReportCategoryReading(judgment: JevJudgment): ReportCategoryReading {
  if (judgment.kind !== "choice") return { unclear: true, probability: 0, alternatives: [] };
  const category = REPORT_CATEGORIES.find((candidate) => candidate.id === judgment.choice);
  const alternatives = alsoPossible(judgment, [BRANCHOPS_UNCLEAR]).map((id) => REPORT_CATEGORIES.find((candidate) => candidate.id === id)).filter((candidate): candidate is ReportCategory => Boolean(candidate));
  return { category, unclear: !category, probability: judgment.probabilities[judgment.choice] ?? 0, alternatives };
}

export interface ReportMachineLike { id: string; code: string; name: string; manufacturer?: string; model?: string; zoneId?: string; status: string }
export interface ReportSpaceLike { id: string; name: string; nameAr?: string; kind: string }

export function reportTargetCandidates(input: { machines: readonly ReportMachineLike[]; spaces: readonly ReportSpaceLike[] }): JevCandidate[] {
  const spaceName = new Map(input.spaces.map((space) => [space.id, space.name] as const));
  const machines = input.machines.filter((machine) => machine.status !== "retired" && machine.status !== "replaced").slice(0, 80);
  return [
    ...machines.map((machine) => ({ id: `asset:${machine.id}`, description: `Machine ${machine.code} · ${machine.name}${machine.manufacturer || machine.model ? ` · ${[machine.manufacturer, machine.model].filter(Boolean).join(" ")}` : ""}${machine.zoneId && spaceName.get(machine.zoneId) ? ` · in ${spaceName.get(machine.zoneId)}` : ""}` })),
    ...input.spaces.slice(0, 30).map((space) => ({ id: `zone:${space.id}`, description: `Space: ${space.name}${space.nameAr ? ` (${space.nameAr})` : ""} · ${space.kind}` })),
    { id: BRANCHOPS_NONE, description: "None of these: the description names no machine or space at this branch, or names one that is not listed." },
  ];
}

export function buildReportTargetState(input: { description: string; branchId: string; machines: readonly ReportMachineLike[]; spaces: readonly ReportSpaceLike[] }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  return {
    state: { description: input.description.slice(0, BRANCHOPS_DESCRIPTION_MAX_LENGTH), branchId: input.branchId, note: "Only machines and spaces registered at this branch are offered. A machine with the same name at another branch is a different machine and is not listed." },
    candidates: reportTargetCandidates(input),
    scopeKey: `branch:${input.branchId}`,
    sourceVersion: "branchops-report-target:1",
  };
}

/** A machine's own words only: its location is offered as a space of its own and must not vouch for the machine. */
function candidateTokens(candidate: JevCandidate): string[] {
  const own = candidate.description.replace(/^(Machine|Space:)\s*/i, "").split(" · ").filter((segment) => !/^in\s/i.test(segment.trim())).join(" ");
  return contentTokens(own).filter((token) => !["machine", "space", "unknown", "manufacturer"].includes(token));
}

export function resolveReportTargetFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const description = text(record(input.state).description);
  const candidates = input.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const lower = normalizeText(description);
  const descriptionTokens = contentTokens(description);
  const scored = candidates
    .filter((candidate) => candidate.id !== BRANCHOPS_NONE)
    .map((candidate) => {
      const code = candidate.id.startsWith("asset:") ? normalizeText(candidate.description.split("·")[0]?.replace(/^machine\s*/i, "") ?? "") : "";
      const codeHit = code && lower.includes(code) ? 3 : 0;
      const tokenHits = candidateTokens(candidate).filter((token) => descriptionTokens.some((word) => word === token || (word.length >= 4 && token.length >= 4 && (word.startsWith(token) || token.startsWith(word))))).length;
      return { id: candidate.id, score: codeHit + tokenHits };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best) return spread(ids, BRANCHOPS_NONE, 0.72);
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.score === best.score) {
    // Two equally plausible targets (for example two treadmills): the answer is uncertain, not a guess.
    const tied = scored.filter((entry) => entry.score === best.score).map((entry) => entry.id);
    const restIds = ids.filter((id) => !tied.includes(id));
    const tiedShare = 0.7 / tied.length;
    const restShare = restIds.length ? Math.min(0.3 / restIds.length, tiedShare * 0.8) : 0;
    const total = tiedShare * tied.length + restShare * restIds.length;
    const probabilities: Record<string, number> = {};
    for (const id of ids) probabilities[id] = (tied.includes(id) ? tiedShare : restShare) / total;
    return { kind: "choice", choice: tied[0]!, probabilities, confidence: 0.45 };
  }
  return spread(ids, best.id, best.score >= 3 ? 0.88 : 0.7);
}

export interface ReportTargetReading {
  kind: "machine" | "space" | "none";
  machine?: ReportMachineLike;
  space?: ReportSpaceLike;
  probability: number;
  /** Other targets that carried real weight; shown so an uncertain pick is never taken as certain. */
  alternatives: Array<{ machine?: ReportMachineLike; space?: ReportSpaceLike }>;
  uncertain: boolean;
}

export function resolveReportTargetReading(judgment: JevJudgment, input: { machines: readonly ReportMachineLike[]; spaces: readonly ReportSpaceLike[] }): ReportTargetReading {
  if (judgment.kind !== "choice") return { kind: "none", probability: 0, alternatives: [], uncertain: true };
  const resolve = (id: string) => ({ machine: id.startsWith("asset:") ? input.machines.find((machine) => machine.id === id.slice(6)) : undefined, space: id.startsWith("zone:") ? input.spaces.find((space) => space.id === id.slice(5)) : undefined });
  const chosen = resolve(judgment.choice);
  const probability = judgment.probabilities[judgment.choice] ?? 0;
  const alternatives = alsoPossible(judgment, [BRANCHOPS_NONE]).map(resolve).filter((entry) => entry.machine || entry.space).slice(0, 3);
  if (judgment.choice === BRANCHOPS_NONE || (!chosen.machine && !chosen.space)) return { kind: "none", probability, alternatives, uncertain: alternatives.length > 0 };
  return { kind: chosen.machine ? "machine" : "space", machine: chosen.machine, space: chosen.space, probability, alternatives, uncertain: alternatives.length > 0 || probability < 0.6 };
}

// ---------------------------------------------------------------------------
// 2a. Related repair history for one machine
// ---------------------------------------------------------------------------

export interface IssueLike {
  id: string;
  branchId: string;
  assetId: string;
  title: string;
  description?: string;
  severity: string;
  status: string;
  safetyStatus: string;
  reportedAt: string;
  resolvedAt?: string;
}

export interface WorkOrderLike {
  id: string;
  assetId: string;
  issueId?: string;
  status: string;
  description: string;
  openedAt: string;
  completedAt?: string;
  vendorName?: string;
}

export const OPEN_ISSUE_STATUSES = new Set(["open", "in_progress"]);
export const SIMILAR_WORDING_MIN_TOKENS = 2;

function issueText(issue: Pick<IssueLike, "title" | "description">): string {
  return `${issue.title} ${issue.description ?? ""}`;
}

export interface RepairHistoryEntry {
  issue: IssueLike;
  workOrders: WorkOrderLike[];
  /** Shared wording with the anchor issue: a reason to compare, never proof of the same fault. */
  similarWording: boolean;
  sharedTokens: number;
}

export interface RepairHistory {
  anchor: IssueLike;
  entries: RepairHistoryEntry[];
  /** Pairs worth a semantic comparison: same machine (a record relationship) and similar wording. */
  comparisons: Array<{ issueId: string; otherIssueId: string }>;
  disclosure: string;
}

/**
 * Every other report on the same machine, newest first, with its linked work
 * orders. The relationship is the record (same asset id): a machine with the
 * same name at another branch, or another machine of the same model, is never
 * part of this history.
 */
export function relatedRepairHistory(anchor: IssueLike, issues: readonly IssueLike[], workOrders: readonly WorkOrderLike[]): RepairHistory {
  const sameMachine = issues.filter((issue) => issue.assetId === anchor.assetId && issue.id !== anchor.id).sort((left, right) => right.reportedAt.localeCompare(left.reportedAt));
  const entries = sameMachine.map((issue) => {
    const shared = sharedTokenCount(issueText(anchor), issueText(issue));
    return { issue, workOrders: workOrders.filter((order) => order.issueId === issue.id), similarWording: shared >= SIMILAR_WORDING_MIN_TOKENS, sharedTokens: shared };
  });
  const oldest = sameMachine.concat(anchor).map((issue) => issue.reportedAt).sort()[0];
  const disclosure = sameMachine.length
    ? `History covers ${sameMachine.length + 1} report${sameMachine.length + 1 === 1 ? "" : "s"} on this machine since ${oldest?.slice(0, 10) ?? "its first report"}. Other machines and other branches are not included, even with the same name.`
    : "No earlier report exists for this machine. Other machines and other branches are not included, even with the same name.";
  return { anchor, entries, comparisons: entries.filter((entry) => entry.similarWording).slice(0, 6).map((entry) => ({ issueId: anchor.id, otherIssueId: entry.issue.id })), disclosure };
}

export type SameFaultVerdict = "same_fault" | "similar_but_separate" | "unclear";

export function sameFaultOptions(): Record<SameFaultVerdict, string> {
  return {
    same_fault: "The same fault recurring: the later report describes the same defect on the same part or behaviour as the earlier one.",
    similar_but_separate: "Similar wording but a separate fault: the reports describe different parts, symptoms or causes even if the words overlap.",
    unclear: "Unclear: the descriptions do not say enough to tell.",
  };
}

export function buildSameFaultState(input: { current: IssueLike; other: IssueLike; machine: { code: string; name: string; model?: string } }): { state: JevState; scopeKey: string; sourceVersion: string } {
  const describe = (issue: IssueLike) => ({ title: issue.title, description: (issue.description ?? "").slice(0, 600), severity: issue.severity, status: issue.status, reportedAt: issue.reportedAt.slice(0, 10), resolvedAt: issue.resolvedAt?.slice(0, 10) ?? "" });
  return {
    state: { machine: `${input.machine.code} · ${input.machine.name}${input.machine.model ? ` (${input.machine.model})` : ""}`, current: describe(input.current), earlier: describe(input.other), note: "Both reports are about this one machine. Severity and safety status are staff decisions and are not being judged." },
    scopeKey: `issue:${input.current.id}:${input.other.id}`,
    sourceVersion: "branchops-same-fault:1",
  };
}

const COMPONENT_FAMILIES: ReadonlyArray<{ id: string; patterns: readonly RegExp[] }> = [
  { id: "belt", patterns: [/\bbelt\b|\bdeck\b/i, /سير|حزام/] },
  { id: "motor", patterns: [/\bmotor\b|\bengine\b/i, /موتور|محرك/] },
  { id: "display", patterns: [/\b(display|screen|console|monitor)\b/i, /شاشة|كونسول/] },
  { id: "cable", patterns: [/\b(cable|wire|pulley|cord)\b/i, /كابل|سلك|بكرة/] },
  { id: "power", patterns: [/\b(power|plug|socket|start|turn on|switch)\b/i, /كهرباء|قابس|فيش|تشغيل|ما يشتغل|لا يعمل/] },
  { id: "noise", patterns: [/\b(noise|noisy|squeak|grind|rattle|click)\b/i, /صوت|صرير|طقطقة/] },
  { id: "resistance", patterns: [/\b(resistance|tension|incline)\b/i, /مقاومة|شد|ميلان/] },
  { id: "seat", patterns: [/\b(seat|saddle|handle|grip|pedal|strap)\b/i, /مقعد|كرسي|مقبض|دواسة|حزام القدم/] },
  { id: "structure", patterns: [/\b(frame|bolt|loose|wobbl|crack)\b/i, /هيكل|برغي|مفكوك|يهتز|شرخ/] },
];

function componentsIn(value: string): string[] {
  const normalized = normalizeText(value);
  return COMPONENT_FAMILIES.filter((family) => mentionsAny(value, family.patterns) || mentionsAny(normalized, family.patterns)).map((family) => family.id);
}

export function resolveSameFaultFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const current = record(state.current);
  const earlier = record(state.earlier);
  const ids: SameFaultVerdict[] = ["same_fault", "similar_but_separate", "unclear"];
  const currentText = `${text(current.title)} ${text(current.description)}`;
  const earlierText = `${text(earlier.title)} ${text(earlier.description)}`;
  const shared = sharedTokenCount(currentText, earlierText);
  // The titles name the part that failed; the descriptions add symptoms. Titles decide first.
  const currentTitleParts = componentsIn(text(current.title));
  const earlierTitleParts = componentsIn(text(earlier.title));
  if (currentTitleParts.length && earlierTitleParts.length) {
    const overlap = currentTitleParts.filter((part) => earlierTitleParts.includes(part));
    if (!overlap.length) return spread(ids, "similar_but_separate", 0.84);
    return spread(ids, "same_fault", shared >= 3 ? 0.86 : 0.74);
  }
  const currentParts = componentsIn(currentText);
  const earlierParts = componentsIn(earlierText);
  if (currentParts.length && earlierParts.length) {
    const overlap = currentParts.filter((part) => earlierParts.includes(part));
    if (!overlap.length) return spread(ids, "similar_but_separate", 0.82);
    if (overlap.length === currentParts.length || overlap.length === earlierParts.length) return spread(ids, "same_fault", shared >= 3 ? 0.86 : 0.74);
    return spread(ids, "unclear", 0.55);
  }
  if (shared >= 3) return spread(ids, "same_fault", 0.66);
  return spread(ids, "unclear", 0.6);
}

export interface SameFaultReading {
  verdict: SameFaultVerdict;
  probability: number;
  label: string;
  explanation: string;
}

export function resolveSameFaultReading(judgment: JevJudgment): SameFaultReading {
  const verdict: SameFaultVerdict = judgment.kind === "choice" && (["same_fault", "similar_but_separate", "unclear"] as const).includes(judgment.choice as SameFaultVerdict) ? (judgment.choice as SameFaultVerdict) : "unclear";
  const probability = judgment.kind === "choice" ? judgment.probabilities[judgment.choice] ?? 0 : 0;
  const strong = probability >= 0.7;
  if (verdict === "same_fault") return { verdict, probability, label: strong ? "Same fault, recurring" : "Possibly the same fault", explanation: strong ? "Both reports describe the same defect on this machine. Severity, safety status and the repair decision stay with the responsible person." : "The wording suggests the same defect, but not strongly. Treat it as a lead, not a finding." };
  if (verdict === "similar_but_separate") return { verdict, probability, label: "Similar wording, separate fault", explanation: "The reports overlap in wording but describe different parts or symptoms. They are not counted as one recurring fault." };
  return { verdict, probability, label: "Unclear", explanation: "The descriptions do not say enough to tell whether this is the same fault. Nothing is grouped." };
}

export function recurringSummary(confirmed: number): string {
  if (confirmed === 0) return "No confirmed recurrence.";
  return `${confirmed} earlier report${confirmed === 1 ? "" : "s"} confirmed as the same fault. Recurrence changes nothing by itself: the repair decision uses the recorded costs, age and downtime.`;
}

// ---------------------------------------------------------------------------
// 2b. Handover: unresolved checklist items and their groups
// ---------------------------------------------------------------------------

export interface HandoverRunLike {
  templateId: string;
  branchId: string;
  localDate: string;
  name: string;
  type: string;
  dueTime: string;
  assignedRole: string;
  assignedUserId?: string;
  assignedUserName?: string;
  overdue: boolean;
  items: Array<{ itemId: string; label: string; instructions?: string; required: boolean; status: string; zoneId?: string; note?: string; reason?: string; actorName?: string; at?: string; facilityTaskId?: string }>;
}

export interface HandoverItem {
  key: string;
  templateId: string;
  localDate: string;
  itemId: string;
  label: string;
  runName: string;
  runType: string;
  dueTime: string;
  required: boolean;
  status: "failed" | "pending";
  zoneId?: string;
  note?: string;
  reason?: string;
  actorName?: string;
  responsible: string;
  assignedUserId?: string;
  overdue: boolean;
  facilityTaskId?: string;
}

export const HANDOVER_WINDOW_DAYS = 7;

export function handoverItemKey(templateId: string, localDate: string, itemId: string): string {
  return `${templateId}|${localDate}|${itemId}`;
}

/** Unresolved work only: failed items and required items still pending. Completed and skipped items are not obligations here. */
export function handoverItems(runs: readonly HandoverRunLike[]): HandoverItem[] {
  const items: HandoverItem[] = [];
  for (const run of runs) {
    for (const item of run.items) {
      const status = item.status === "failed" ? "failed" : item.required && item.status === "pending" ? "pending" : undefined;
      if (!status) continue;
      items.push({ key: handoverItemKey(run.templateId, run.localDate, item.itemId), templateId: run.templateId, localDate: run.localDate, itemId: item.itemId, label: item.label, runName: run.name, runType: run.type, dueTime: run.dueTime, required: item.required, status, zoneId: item.zoneId, note: item.note, reason: item.reason, actorName: item.actorName, responsible: run.assignedUserName ?? run.assignedRole, assignedUserId: run.assignedUserId, overdue: run.overdue, facilityTaskId: item.facilityTaskId });
    }
  }
  return items.sort((left, right) => left.localDate.localeCompare(right.localDate) || left.runName.localeCompare(right.runName) || left.label.localeCompare(right.label));
}

export type HandoverGroupKind = "recurring" | "task" | "space" | "judged";

export interface HandoverGroup {
  id: string;
  kind: HandoverGroupKind;
  label: string;
  reason: string;
  items: HandoverItem[];
}

export interface HandoverGrouping {
  groups: HandoverGroup[];
  ungrouped: HandoverItem[];
  /** Wording-similar pairs across groups and singles, offered for an explicit semantic check. */
  comparisons: Array<{ first: HandoverItem; second: HandoverItem; sharedTokens: number }>;
  disclosure: string;
}

function itemText(item: HandoverItem): string {
  return `${item.label} ${item.note ?? ""} ${item.reason ?? ""}`;
}

/**
 * Deterministic groups from record relationships: the same checklist item
 * unresolved on several days (recurring), items escalated to the same
 * maintenance task, and items linked to the same gym space. An item belongs
 * to one group at most and is never dropped: whatever is not grouped stays
 * listed on its own.
 */
export function handoverGroups(items: readonly HandoverItem[], spaces: ReadonlyMap<string, string> = new Map()): HandoverGrouping {
  const groups: HandoverGroup[] = [];
  const placed = new Set<string>();
  const byItem = new Map<string, HandoverItem[]>();
  for (const item of items) {
    const key = `${item.templateId}|${item.itemId}`;
    byItem.set(key, [...(byItem.get(key) ?? []), item]);
  }
  for (const [key, members] of byItem) {
    const dates = new Set(members.map((member) => member.localDate));
    if (dates.size < 2) continue;
    groups.push({ id: `recurring:${key}`, kind: "recurring", label: members[0]!.label, reason: `Unresolved on ${dates.size} days (${[...dates].sort().join(", ")}). The same checklist item, not a guess.`, items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const byTask = new Map<string, HandoverItem[]>();
  for (const item of items) if (item.facilityTaskId && !placed.has(item.key)) byTask.set(item.facilityTaskId, [...(byTask.get(item.facilityTaskId) ?? []), item]);
  for (const [taskId, members] of byTask) {
    if (members.length < 2) continue;
    groups.push({ id: `task:${taskId}`, kind: "task", label: "Same maintenance task", reason: "These items were escalated to one maintenance task.", items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const bySpace = new Map<string, HandoverItem[]>();
  for (const item of items) if (item.zoneId && !placed.has(item.key)) bySpace.set(item.zoneId, [...(bySpace.get(item.zoneId) ?? []), item]);
  for (const [zoneId, members] of bySpace) {
    if (members.length < 2) continue;
    groups.push({ id: `space:${zoneId}`, kind: "space", label: spaces.get(zoneId) ?? "Same gym space", reason: "Linked to the same gym space. Different items can still be different problems.", items: members });
    members.forEach((member) => placed.add(member.key));
  }
  const ungrouped = items.filter((item) => !placed.has(item.key));
  // Wording overlap proposes a comparison; only an explicit judgment turns it into a group.
  const anchors = [...groups.map((group) => group.items[0]!), ...ungrouped];
  const comparisons: HandoverGrouping["comparisons"] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    for (let other = index + 1; other < anchors.length; other += 1) {
      const first = anchors[index]!;
      const second = anchors[other]!;
      if (first.templateId === second.templateId && first.itemId === second.itemId) continue;
      const shared = sharedTokenCount(itemText(first), itemText(second));
      if (shared >= SIMILAR_WORDING_MIN_TOKENS) comparisons.push({ first, second, sharedTokens: shared });
    }
  }
  comparisons.sort((left, right) => right.sharedTokens - left.sharedTokens);
  return { groups, ungrouped, comparisons: comparisons.slice(0, 6), disclosure: `Covers today and the previous ${HANDOVER_WINDOW_DAYS} days only, the handover window. Older unresolved work is not shown here.` };
}

export type HandoverVerdict = "same_problem" | "related_but_separate" | "unrelated" | "unclear";

export function handoverRelatedOptions(): Record<HandoverVerdict, string> {
  return {
    same_problem: "The same underlying problem: both items fail for one cause that one fix would resolve.",
    related_but_separate: "Related but separate: the items concern the same place or theme but need separate actions.",
    unrelated: "Unrelated: the wording overlaps but the problems have nothing to do with each other.",
    unclear: "Unclear: the notes do not say enough to tell.",
  };
}

export function buildHandoverRelatedState(input: { first: HandoverItem; second: HandoverItem; spaces?: ReadonlyMap<string, string> }): { state: JevState; scopeKey: string; sourceVersion: string } {
  const describe = (item: HandoverItem) => ({ checklist: item.runName, date: item.localDate, item: item.label, status: item.status, space: item.zoneId ? input.spaces?.get(item.zoneId) ?? "linked space" : "", note: (item.note ?? "").slice(0, 300), reason: (item.reason ?? "").slice(0, 300) });
  return {
    state: { first: describe(input.first), second: describe(input.second), note: "Both items are still unresolved. Who is responsible, due dates and whether an item is required are staff decisions and are not being judged." },
    scopeKey: `handover:${[input.first.key, input.second.key].sort().join("+")}`,
    sourceVersion: "branchops-handover-related:1",
  };
}

export function resolveHandoverRelatedFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const state = record(input.state);
  const first = record(state.first);
  const second = record(state.second);
  const ids: HandoverVerdict[] = ["same_problem", "related_but_separate", "unrelated", "unclear"];
  const firstText = `${text(first.item)} ${text(first.note)} ${text(first.reason)}`;
  const secondText = `${text(second.item)} ${text(second.note)} ${text(second.reason)}`;
  const shared = sharedTokenCount(firstText, secondText);
  const sameSpace = Boolean(text(first.space)) && text(first.space) === text(second.space);
  const firstParts = componentsIn(firstText);
  const secondParts = componentsIn(secondText);
  if (firstParts.length && secondParts.length && !firstParts.some((part) => secondParts.includes(part))) return spread(ids, sameSpace ? "related_but_separate" : "unrelated", 0.78);
  if (shared >= 3 && (sameSpace || firstParts.some((part) => secondParts.includes(part)))) return spread(ids, "same_problem", 0.8);
  if (shared >= 2 && sameSpace) return spread(ids, "related_but_separate", 0.62);
  if (shared >= 2) return spread(ids, "unclear", 0.58);
  return spread(ids, "unrelated", 0.7);
}

export interface HandoverRelatedReading {
  verdict: HandoverVerdict;
  probability: number;
  label: string;
  explanation: string;
  /** True only for a strong same-problem answer; that is the only outcome that forms a presentation group. */
  groups: boolean;
}

export function resolveHandoverRelatedReading(judgment: JevJudgment): HandoverRelatedReading {
  const verdict: HandoverVerdict = judgment.kind === "choice" && (["same_problem", "related_but_separate", "unrelated", "unclear"] as const).includes(judgment.choice as HandoverVerdict) ? (judgment.choice as HandoverVerdict) : "unclear";
  const probability = judgment.kind === "choice" ? judgment.probabilities[judgment.choice] ?? 0 : 0;
  switch (verdict) {
    case "same_problem": return probability >= 0.7
      ? { verdict, probability, label: "Same underlying problem", explanation: "Both items point at one cause. They stay separate obligations with their own owners and dates; the group only reads them together.", groups: true }
      : { verdict, probability, label: "Possibly the same problem", explanation: "Not strong enough to group. Both items stay where they are.", groups: false };
    case "related_but_separate": return { verdict, probability, label: "Related, separate actions", explanation: "Same place or theme, but each item needs its own action. Not grouped.", groups: false };
    case "unrelated": return { verdict, probability, label: "Unrelated", explanation: "The wording overlaps by coincidence. Not grouped.", groups: false };
    default: return { verdict, probability, label: "Unclear", explanation: "The notes do not say enough. Not grouped.", groups: false };
  }
}

// ---------------------------------------------------------------------------
// 3. Notification groups
// ---------------------------------------------------------------------------

export interface NotificationLike {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  branchId?: string;
  readAt?: string;
  createdAt: string;
}

/** Alerts that always stay individually visible at the top, never folded into a group. */
export const MANDATORY_NOTIFICATION_KINDS: readonly string[] = ["access_denial", "incident", "message_delivery_failed", "platform_invoice_past_due", "cash_variance", "automation_attention"];

export interface NotificationFamily { id: string; label: string; test: (kind: string) => boolean }

export const NOTIFICATION_FAMILIES: readonly NotificationFamily[] = [
  { id: "pt", label: "Personal training", test: (kind) => kind.startsWith("pt_") },
  { id: "support", label: "Support", test: (kind) => kind.startsWith("support_") },
  { id: "members", label: "Member follow-up", test: (kind) => ["renewal", "at_risk", "outstanding_balance", "follow_up", "checkin_override", "trial_status", "retention_snooze"].includes(kind) },
  { id: "billing", label: "RIVET billing", test: (kind) => kind.startsWith("platform_invoice_") },
  { id: "operations", label: "Operations", test: (kind) => ["facility_task", "branch_checklist", "low_stock", "purchase_order", "equipment_issue"].includes(kind) },
];

/** The record a notification is about, from its own link or dedupe key; undefined when it names none. */
export function notificationEntity(notification: Pick<NotificationLike, "href" | "dedupeKey">): { key: string; label: string } | undefined {
  const href = notification.href;
  const query = href.includes("?") ? new URLSearchParams(href.slice(href.indexOf("?") + 1)) : undefined;
  const path = href.split("?")[0] ?? href;
  const booking = query?.get("booking");
  if (booking) return { key: `booking:${booking}`, label: "PT booking" };
  const supportCase = query?.get("case");
  if (supportCase) return { key: `case:${supportCase}`, label: `Support case ${supportCase}` };
  const invoice = query?.get("invoice");
  if (invoice) return { key: `invoice:${invoice}`, label: `Invoice ${invoice}` };
  const member = /^\/members\/([^/]+)/.exec(path);
  if (member?.[1]) return { key: `member:${member[1]}`, label: "Member" };
  const lead = /^\/crm\/leads\/([^/]+)/.exec(path);
  if (lead?.[1]) return { key: `lead:${lead[1]}`, label: "Lead" };
  const task = query?.get("task");
  if (task) return { key: `task:${task}`, label: "Maintenance task" };
  const dedupe = /^([a-z-]+):([^:]+)/i.exec(notification.dedupeKey);
  if (dedupe && dedupe[1] && dedupe[2] && !/^\d{4}-\d{2}-\d{2}/.test(dedupe[2]) && dedupe[2].length >= 6) return { key: `${dedupe[1]}:${dedupe[2]}`, label: dedupe[1].replaceAll("-", " ") };
  return undefined;
}

export interface NotificationGroup {
  id: string;
  kind: "entity" | "family";
  label: string;
  notifications: NotificationLike[];
  unreadCount: number;
  latestAt: string;
}

export interface NotificationGrouping {
  /** Kept out of every group and listed first. */
  mandatory: NotificationLike[];
  groups: NotificationGroup[];
  singles: NotificationLike[];
  totalUnread: number;
}

function familyOf(kind: string): NotificationFamily | undefined {
  return NOTIFICATION_FAMILIES.find((family) => family.test(kind));
}

/**
 * Presentation groups only. Mandatory alerts never fold; a group needs at
 * least two notifications about the same record, otherwise at least two of
 * the same family; everything else stays single. Unread counts are sums of
 * the originals and nothing is marked read.
 */
export function groupNotifications(notifications: readonly NotificationLike[]): NotificationGrouping {
  const sorted = [...notifications].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const mandatory = sorted.filter((notification) => MANDATORY_NOTIFICATION_KINDS.includes(notification.kind));
  const rest = sorted.filter((notification) => !MANDATORY_NOTIFICATION_KINDS.includes(notification.kind));
  const groups: NotificationGroup[] = [];
  const placed = new Set<string>();
  const byEntity = new Map<string, { label: string; items: NotificationLike[] }>();
  for (const notification of rest) {
    const entity = notificationEntity(notification);
    if (!entity) continue;
    const bucket = byEntity.get(entity.key) ?? { label: entity.label, items: [] };
    bucket.items.push(notification);
    byEntity.set(entity.key, bucket);
  }
  for (const [key, bucket] of byEntity) {
    if (bucket.items.length < 2) continue;
    groups.push(group(`entity:${key}`, "entity", bucket.label === "Member" || bucket.label === "Lead" || bucket.label === "PT booking" ? `${bucket.label}: ${entityName(bucket.items)}` : bucket.label, bucket.items));
    bucket.items.forEach((item) => placed.add(item.id));
  }
  const byFamily = new Map<string, { family: NotificationFamily; items: NotificationLike[] }>();
  for (const notification of rest) {
    if (placed.has(notification.id)) continue;
    const family = familyOf(notification.kind);
    if (!family) continue;
    const bucket = byFamily.get(family.id) ?? { family, items: [] };
    bucket.items.push(notification);
    byFamily.set(family.id, bucket);
  }
  for (const [id, bucket] of byFamily) {
    if (bucket.items.length < 2) continue;
    groups.push(group(`family:${id}`, "family", bucket.family.label, bucket.items));
    bucket.items.forEach((item) => placed.add(item.id));
  }
  groups.sort((left, right) => right.latestAt.localeCompare(left.latestAt));
  const singles = rest.filter((notification) => !placed.has(notification.id));
  return { mandatory, groups, singles, totalUnread: notifications.filter((notification) => !notification.readAt).length };
}

/** The first body segment that reads as a name rather than a timestamp, so a group is called by who it concerns. */
function entityName(items: readonly NotificationLike[]): string {
  return entityNames(items)[0] ?? items[0]?.title ?? "";
}

/** Body heads that read as names rather than dates or times, distinct, in list order. */
function entityNames(items: readonly NotificationLike[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    const head = item.body.split(" · ")[0]?.trim() ?? "";
    if (!head || /^\d/.test(head) || /^(today|tomorrow|yesterday|tonight)\b/i.test(head) || /\d{1,2}:\d{2}/.test(head)) continue;
    if (!names.includes(head)) names.push(head);
  }
  return names;
}

function group(id: string, kind: NotificationGroup["kind"], label: string, items: NotificationLike[]): NotificationGroup {
  return { id, kind, label, notifications: items, unreadCount: items.filter((item) => !item.readAt).length, latestAt: items.map((item) => item.createdAt).sort().at(-1) ?? "" };
}

export function notificationGroupCandidates(grouping: Pick<NotificationGrouping, "groups">): JevCandidate[] {
  return [
    ...grouping.groups.slice(0, 20).map((entry) => ({ id: entry.id, description: `${entry.label}: ${[...new Set([...entry.notifications.slice(0, 3).map((item) => item.title), ...entityNames(entry.notifications).slice(0, 3)])].join("; ")}` })),
    { id: BRANCHOPS_NONE, description: "No group: this notification is about something else and stays on its own." },
  ];
}

export function buildNotificationTopicState(input: { notification: NotificationLike; grouping: Pick<NotificationGrouping, "groups"> }): { state: JevState; candidates: JevCandidate[]; scopeKey: string; sourceVersion: string } {
  return {
    state: { notification: { kind: input.notification.kind, title: input.notification.title, body: input.notification.body.slice(0, 300) }, note: "Placing a notification in a group changes nothing about it: it stays unread if unread, keeps its link, and mandatory alerts are never grouped." },
    candidates: notificationGroupCandidates(input.grouping),
    scopeKey: `notification:${input.notification.id}`,
    sourceVersion: "branchops-notification-topic:1",
  };
}

export function resolveNotificationTopicFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  const notification = record(record(input.state).notification);
  const candidates = input.candidates ?? [];
  const ids = candidates.map((candidate) => candidate.id);
  if (!ids.length) return undefined;
  const family = familyOf(text(notification.kind));
  const familyGroup = family ? ids.find((id) => id === `family:${family.id}`) : undefined;
  if (familyGroup) return spread(ids, familyGroup, 0.8);
  const haystack = `${text(notification.title)} ${text(notification.body)}`;
  const byWords = candidates.filter((candidate) => candidate.id !== BRANCHOPS_NONE).map((candidate) => ({ id: candidate.id, shared: sharedTokenCount(haystack, candidate.description) })).filter((entry) => entry.shared >= 2).sort((left, right) => right.shared - left.shared)[0];
  if (byWords) return spread(ids, byWords.id, 0.6);
  return spread(ids, ids.includes(BRANCHOPS_NONE) ? BRANCHOPS_NONE : ids[0]!, 0.72);
}

export function resolveNotificationTopicReading(judgment: JevJudgment, grouping: Pick<NotificationGrouping, "groups">): { group?: NotificationGroup; probability: number } {
  if (judgment.kind !== "choice" || judgment.choice === BRANCHOPS_NONE) return { probability: judgment.kind === "choice" ? judgment.probabilities[judgment.choice] ?? 0 : 0 };
  return { group: grouping.groups.find((entry) => entry.id === judgment.choice), probability: judgment.probabilities[judgment.choice] ?? 0 };
}

// ---------------------------------------------------------------------------
// Measurement: useful grouping, false grouping and hidden obligations, apart
// ---------------------------------------------------------------------------

export interface GroupingEvaluation {
  /** Pairs grouped together that the fixture says belong together. */
  usefulPairs: number;
  /** Pairs grouped together that the fixture says are separate. */
  falsePairs: number;
  /** Pairs the fixture says belong together that were not grouped. */
  missedPairs: number;
  /** Items present in the source that the grouped view does not show anywhere. */
  hiddenItems: string[];
}

/**
 * Scores a grouping against a synthetic truth set without conflating the
 * three things that matter: grouping that helps, grouping that misleads, and
 * anything a grouped view would hide.
 */
export function evaluateGrouping(input: { sourceIds: readonly string[]; groups: ReadonlyArray<readonly string[]>; shownIds: readonly string[]; truePairs: ReadonlyArray<readonly [string, string]> }): GroupingEvaluation {
  const pairKey = (left: string, right: string) => [left, right].sort().join("+");
  const truth = new Set(input.truePairs.map(([left, right]) => pairKey(left, right)));
  const predicted = new Set<string>();
  for (const members of input.groups) {
    for (let index = 0; index < members.length; index += 1) for (let other = index + 1; other < members.length; other += 1) predicted.add(pairKey(members[index]!, members[other]!));
  }
  const usefulPairs = [...predicted].filter((key) => truth.has(key)).length;
  const shown = new Set(input.shownIds);
  return { usefulPairs, falsePairs: predicted.size - usefulPairs, missedPairs: [...truth].filter((key) => !predicted.has(key)).length, hiddenItems: input.sourceIds.filter((id) => !shown.has(id)) };
}

export function describesArabic(value: string): boolean {
  return hasArabic(value);
}
