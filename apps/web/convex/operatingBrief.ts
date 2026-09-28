import { finalizeTodayQueue } from "../src/lib/dashboard/today-queue";

function contentTokens(value: string): string[] {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((token) => token.length >= 2);
}

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = new Set(contentTokens(right));
  return [...new Set(contentTokens(left))].filter((token) => rightTokens.has(token)).length;
}

/**
 * The evidence-backed daily operating brief: the pure logic shared by the
 * Convex query, the preview adapter and the dashboard.
 *
 * The brief is a working view of unresolved commercial and operational
 * issues. Everything in it is computed here from records the adapters read:
 * the queue items (the same items the Today queue already builds, without
 * its page limit), the extra sources (lapsed terms, machine reports, low
 * stock, open RIVET cases), every balance, count, overdue condition and
 * branch scope, the deterministic order, which items are mandatory, and how
 * complete the coverage is. Headings and related wording comparisons are
 * deterministic; neither hides, merges, closes or reorders anything.
 *
 * No Convex or path-alias imports: the browser preview adapter shares it.
 */
export const BRIEF_QUEUE_LIMIT = 2_000;
/** A follow-up this far overdue is reported as stale, not merely overdue. */
export const BRIEF_STALE_DAYS = 7;
export const BRIEF_RELATED_MAX_PAIRS = 6;
export const BRIEF_RELATED_MIN_TOKENS = 2;

export type BriefItemKind =
  | "follow_up"
  | "at_risk"
  | "renewal"
  | "outstanding_balance"
  | "access_denial"
  | "approval"
  | "cash_variance"
  | "facility_task"
  | "branch_checklist"
  | "equipment_issue"
  | "low_stock"
  | "support_case";

export type BriefPriority = "urgent" | "high" | "normal";

export interface BriefMoney { amount: number; currency: string }

/** The queue item shape the adapters already produce for the Today queue. */
export interface BriefQueueItem {
  id: string;
  kind: BriefItemKind;
  priority: BriefPriority;
  title: string;
  detail: string;
  href: string;
  action: { kind: "navigate" | "complete_task"; label: string; taskId?: string };
  subjectName?: string;
  subject?: { kind: "lead" | "member"; id: string };
  branchName?: string;
  dueAt?: string;
  occurredAt?: string;
  overdue?: boolean;
  amount?: BriefMoney;
  /** Free text the record carries (notes, a report description) for relating descriptions; never shown as prose. */
  description?: string;
  /** For machine reports: the recorded safety status, shown as recorded and never judged. */
  safetyStatus?: string;
}

export type BriefSectionKey = "collections" | "renewals" | "followups" | "retention" | "controls" | "facilities" | "equipment" | "checklists" | "stock" | "support";
export type BriefSourceKey = "queue" | "expired" | "equipment" | "stock" | "support";
export type BriefSourceStatus = "ok" | "empty" | "unavailable" | "not_enabled" | "no_permission";

export interface BriefEvidenceLink { label: string; href: string }

export interface BriefItem extends BriefQueueItem {
  section: BriefSectionKey;
  /** Urgent by the existing queue rules: always listed on top and never folded away. */
  mandatory: boolean;
  /** Whole days past the due date at generation time, when the item has one and is overdue. */
  overdueDays?: number;
  /** Overdue by `BRIEF_STALE_DAYS` or more: the work has been waiting too long to be routine. */
  stale: boolean;
  evidence: BriefEvidenceLink[];
}

export type BriefFigureValue = { kind: "count"; value: number } | { kind: "money"; money: BriefMoney };

export interface BriefFigure {
  key: string;
  label: string;
  value: BriefFigureValue;
  href?: string;
}

export interface BriefSection {
  key: BriefSectionKey;
  label: string;
  kind: "commercial" | "operational";
  source: BriefSourceKey;
  figures: BriefFigure[];
  items: BriefItem[];
  /** The section's complete count; equals `items.length` unless the queue was truncated. */
  totalItems: number;
  href?: string;
}

export interface BriefSource {
  key: BriefSourceKey;
  label: string;
  status: BriefSourceStatus;
  asOf: string;
  itemCount: number;
  message?: string;
}

export interface BriefScope {
  branchId?: string;
  branches: Array<{ id: string; name: string }>;
  branchScope: "all" | "selected";
  role: string;
  userId: string;
}

export interface OperatingBrief {
  generatedAt: string;
  today: string;
  timezone: string;
  currency: string;
  scope: BriefScope;
  coverage: "complete" | "partial";
  sources: BriefSource[];
  sections: BriefSection[];
  mandatory: BriefItem[];
  totals: { items: number; mandatory: number; overdue: number; stale: number };
  /** Every item in the deterministic order (priority, time, id), for the complete-queue view. */
  queue: BriefItem[];
  /** True when the queue source held more than `BRIEF_QUEUE_LIMIT` items and the tail was cut. */
  truncated: boolean;
  /** The prepared emphasis chosen without a model: the first applicable one in rank order. */
  defaultEmphasis: BriefEmphasisKey;
  /** Every prepared emphasis whose deterministic precondition holds, in rank order. */
  applicableEmphases: BriefEmphasisKey[];
  related: BriefRelatedPair[];
}

// ---------------------------------------------------------------------------
// Authored sections and headings
// ---------------------------------------------------------------------------

const SECTION_ORDER: readonly BriefSectionKey[] = ["collections", "renewals", "followups", "retention", "controls", "facilities", "equipment", "checklists", "stock", "support"];

const SECTION_META: Record<BriefSectionKey, { label: string; kind: BriefSection["kind"]; source: BriefSourceKey; kinds: readonly BriefItemKind[]; href?: string }> = {
  collections: { label: "Balances to collect", kind: "commercial", source: "queue", kinds: ["outstanding_balance"], href: "/payments" },
  renewals: { label: "Renewals and lapsed terms", kind: "commercial", source: "queue", kinds: ["renewal"], href: "/crm/queues?view=renewals" },
  followups: { label: "Follow-ups due", kind: "commercial", source: "queue", kinds: ["follow_up"], href: "/crm/queues" },
  retention: { label: "Members at risk", kind: "commercial", source: "queue", kinds: ["at_risk"], href: "/crm/queues?view=at-risk" },
  controls: { label: "Approvals, cash and entry", kind: "operational", source: "queue", kinds: ["approval", "cash_variance", "access_denial"], href: "/audit?approval=pending" },
  facilities: { label: "Maintenance work", kind: "operational", source: "queue", kinds: ["facility_task"], href: "/operations?tab=facilities" },
  equipment: { label: "Machine reports", kind: "operational", source: "equipment", kinds: ["equipment_issue"], href: "/operations?tab=equipment" },
  checklists: { label: "Daily checklists", kind: "operational", source: "queue", kinds: ["branch_checklist"], href: "/checklists" },
  stock: { label: "Low stock", kind: "operational", source: "stock", kinds: ["low_stock"], href: "/operations?tab=inventory&stock=attention" },
  support: { label: "Open RIVET cases", kind: "operational", source: "support", kinds: ["support_case"], href: "/support" },
};

export const BRIEF_SOURCE_LABELS: Record<BriefSourceKey, string> = {
  queue: "Today queue (follow-ups, renewals, balances, at-risk members, approvals, cash, entry, maintenance, checklists)",
  expired: "Lapsed memberships",
  equipment: "Machine reports",
  stock: "Stock levels",
  support: "RIVET support cases",
};

export function briefSectionLabel(key: BriefSectionKey): string {
  return SECTION_META[key].label;
}

export function briefSectionForKind(kind: BriefItemKind): BriefSectionKey {
  for (const key of SECTION_ORDER) if (SECTION_META[key].kinds.includes(kind)) return key;
  return "controls";
}

// ---------------------------------------------------------------------------
// Building the brief
// ---------------------------------------------------------------------------

export interface BriefSourceInput {
  key: BriefSourceKey;
  status: BriefSourceStatus;
  items?: BriefQueueItem[];
  message?: string;
}

export interface BriefInput {
  generatedAt: string;
  today: string;
  timezone: string;
  currency: string;
  scope: BriefScope;
  /** The complete queue the dashboard already builds, before any page limit. */
  queue: readonly BriefQueueItem[];
  /** The Today queue's own total when it was cut at `BRIEF_QUEUE_LIMIT`. */
  queueTotal?: number;
  sources: readonly BriefSourceInput[];
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / DAY_MS);
}

/** Whole days between two YYYY-MM-DD dates; the ISO instant's calendar date is read in the brief's own timezone by the adapter. */
export function briefDaysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function localDate(iso: string, timezone: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso.slice(0, 10);
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
  } catch {
    return new Date(parsed).toISOString().slice(0, 10);
  }
}

function itemEvidence(item: BriefQueueItem): BriefEvidenceLink[] {
  const links: BriefEvidenceLink[] = [];
  if (item.subject?.kind === "member") links.push({ label: "Member record", href: `/members/${item.subject.id}` }, { label: "Timeline", href: `/members/${item.subject.id}?tab=timeline` });
  if (item.subject?.kind === "lead") links.push({ label: "Lead record", href: `/crm/leads/${item.subject.id}` });
  switch (item.kind) {
    case "outstanding_balance":
      if (item.subject) links.push({ label: "Payments", href: `/members/${item.subject.id}?tab=payments` });
      break;
    case "renewal":
      links.push({ label: "Renewals queue", href: "/crm/queues?view=renewals" });
      break;
    case "follow_up":
      links.push({ label: "Work queue", href: "/crm/queues" });
      break;
    case "at_risk":
      links.push({ label: "At-risk queue", href: "/crm/queues?view=at-risk" });
      break;
    case "approval":
      links.push({ label: "Audit trail", href: "/audit?approval=pending" });
      break;
    case "cash_variance":
      links.push({ label: "Shifts", href: "/payments/shifts" });
      break;
    case "access_denial":
      links.push({ label: "Reception", href: "/reception" });
      break;
    case "facility_task":
    case "equipment_issue":
    case "low_stock":
    case "support_case":
    case "branch_checklist":
      break;
  }
  if (!links.some((link) => link.href === item.href)) links.unshift({ label: item.action.label === "Done" ? "Open" : item.action.label, href: item.href });
  return links;
}

function toBriefItem(item: BriefQueueItem, today: string, timezone: string): BriefItem {
  const overdueDays = item.dueAt && item.overdue ? Math.max(0, briefDaysBetween(localDate(item.dueAt, timezone), today)) : undefined;
  return {
    ...item,
    section: briefSectionForKind(item.kind),
    mandatory: item.priority === "urgent",
    ...(overdueDays !== undefined ? { overdueDays } : {}),
    stale: overdueDays !== undefined && overdueDays >= BRIEF_STALE_DAYS,
    evidence: itemEvidence(item),
  };
}

function sumMoney(items: readonly BriefItem[], currency: string): BriefMoney {
  let amount = 0;
  for (const item of items) if (item.amount) amount += item.amount.amount;
  return { amount, currency: items.find((item) => item.amount)?.amount?.currency ?? currency };
}

function count(label: string, key: string, value: number, href?: string): BriefFigure {
  return { key, label, value: { kind: "count", value }, ...(href ? { href } : {}) };
}

function sectionFigures(key: BriefSectionKey, items: readonly BriefItem[], input: BriefInput): BriefFigure[] {
  const today = input.today;
  switch (key) {
    case "collections": {
      const total = sumMoney(items, input.currency);
      const largest = items.reduce((best, item) => (item.amount && item.amount.amount > (best?.amount?.amount ?? 0) ? item : best), undefined as BriefItem | undefined);
      return [
        { key: "outstanding", label: "Outstanding", value: { kind: "money", money: total }, href: "/payments" },
        count("Members with a balance", "members", items.length),
        ...(largest?.amount ? [{ key: "largest", label: "Largest balance", value: { kind: "money" as const, money: largest.amount }, href: largest.href }] : []),
      ];
    }
    case "renewals": {
      const expired = items.filter((item) => item.id.startsWith("expired:"));
      const ending = items.filter((item) => !item.id.startsWith("expired:"));
      const endingToday = ending.filter((item) => item.dueAt && localDate(item.dueAt, input.timezone) === today).length;
      return [count("Ending within 7 days", "ending", ending.length, "/crm/queues?view=renewals"), count("Ending today", "today", endingToday), count("Expired, not renewed (30 days)", "expired", expired.length, "/crm/queues?view=renewals")];
    }
    case "followups": {
      const overdue = items.filter((item) => item.overdue).length;
      return [count("Overdue", "overdue", overdue, "/crm/queues"), count("Due today", "today", items.length - overdue), count(`Waiting ${BRIEF_STALE_DAYS}+ days`, "stale", items.filter((item) => item.stale).length)];
    }
    case "retention":
      return [count("Members to reconnect with", "members", items.length, "/crm/queues?view=at-risk")];
    case "controls": {
      const variances = items.filter((item) => item.kind === "cash_variance");
      return [
        count("Pending approvals", "approvals", items.filter((item) => item.kind === "approval").length, "/audit?approval=pending"),
        count("Cash variances", "variances", variances.length, "/payments/shifts"),
        { key: "variance_total", label: "Variance total", value: { kind: "money", money: { amount: variances.reduce((sum, item) => sum + Math.abs(item.amount?.amount ?? 0), 0), currency: variances.find((item) => item.amount)?.amount?.currency ?? input.currency } } },
        count("Entry denied today", "entry", items.filter((item) => item.kind === "access_denial").length),
      ];
    }
    case "facilities":
      return [count("Open tasks", "open", items.length, "/operations?tab=facilities"), count("Overdue", "overdue", items.filter((item) => item.overdue).length), count("Blocked or critical", "urgent", items.filter((item) => item.mandatory).length)];
    case "equipment":
      return [count("Open reports", "open", items.length, "/operations?tab=equipment"), count("Out of service", "out_of_service", items.filter((item) => item.safetyStatus === "out_of_service").length), count("Safety not assessed", "unknown", items.filter((item) => item.safetyStatus === "unknown").length)];
    case "checklists":
      return [count("Checklists with failed items", "failed", items.filter((item) => item.id.startsWith("checklist-failed:")).length, "/checklists"), count("Checklists still due", "due", items.filter((item) => item.id.startsWith("checklist-due:")).length), count("Past due time", "overdue", items.filter((item) => item.overdue).length)];
    case "stock":
      return [count("Products at or below reorder point", "products", items.length, "/operations?tab=inventory&stock=attention")];
    case "support":
      return [count("Open cases", "open", items.length, "/support"), count("Urgent", "urgent", items.filter((item) => item.mandatory).length)];
  }
}

/**
 * Build the brief. Sections keep the authored order; items inside a section
 * and in the complete queue follow the Today queue's own order (priority,
 * then time, then stable id). Mandatory items are the urgent ones by the
 * existing rules and are listed on top as well as in their sections.
 */
export function buildOperatingBrief(input: BriefInput): OperatingBrief {
  const timezone = input.timezone || "UTC";
  const collected: BriefQueueItem[] = [...input.queue];
  const sources: BriefSource[] = [];
  const queueTruncated = (input.queueTotal ?? input.queue.length) > input.queue.length;
  sources.push({ key: "queue", label: BRIEF_SOURCE_LABELS.queue, status: input.queue.length ? "ok" : "empty", asOf: input.generatedAt, itemCount: input.queue.length, ...(queueTruncated ? { message: `Showing the first ${input.queue.length} of ${input.queueTotal} queue items.` } : {}) });
  for (const source of input.sources) {
    const items = source.status === "ok" || source.status === "empty" ? source.items ?? [] : [];
    collected.push(...items);
    sources.push({ key: source.key, label: BRIEF_SOURCE_LABELS[source.key], status: source.status === "ok" && !items.length ? "empty" : source.status, asOf: input.generatedAt, itemCount: items.length, ...(source.message ? { message: source.message } : {}) });
  }
  const ordered = finalizeTodayQueue(collected, input.generatedAt, BRIEF_QUEUE_LIMIT);
  const queue = ordered.items.map((item) => toBriefItem(item, input.today, timezone));
  const sections: BriefSection[] = SECTION_ORDER.map((key) => {
    const meta = SECTION_META[key];
    const items = queue.filter((item) => item.section === key);
    return { key, label: meta.label, kind: meta.kind, source: meta.source, figures: sectionFigures(key, items, input), items, totalItems: items.length, ...(meta.href ? { href: meta.href } : {}) };
  });
  const mandatory = queue.filter((item) => item.mandatory);
  const brief: OperatingBrief = {
    generatedAt: input.generatedAt,
    today: input.today,
    timezone,
    currency: input.currency,
    scope: input.scope,
    coverage: sources.every((source) => source.status === "ok" || source.status === "empty") && !queueTruncated ? "complete" : "partial",
    sources,
    sections,
    mandatory,
    totals: { items: queue.length, mandatory: mandatory.length, overdue: queue.filter((item) => item.overdue).length, stale: queue.filter((item) => item.stale).length },
    queue,
    truncated: queueTruncated || ordered.totalItems > queue.length,
    defaultEmphasis: "steady",
    applicableEmphases: [],
    related: [],
  };
  brief.applicableEmphases = applicableEmphases(brief);
  brief.defaultEmphasis = brief.applicableEmphases[0] ?? "steady";
  brief.related = briefRelatedPairs(brief.queue);
  return brief;
}

/** The section a figure belongs to, for the section links in the emphasis card. */
export function briefSection(brief: Pick<OperatingBrief, "sections">, key: BriefSectionKey): BriefSection | undefined {
  return brief.sections.find((section) => section.key === key);
}

// ---------------------------------------------------------------------------
// Prepared emphasis (brief.emphasis)
// ---------------------------------------------------------------------------

export type BriefEmphasisKey = "safety_first" | "collections" | "renewals" | "followups" | "retention" | "facilities" | "checklists" | "support" | "steady";

export interface BriefEmphasis {
  key: BriefEmphasisKey;
  heading: string;
  /** Which sections' figures the heading is about; they are the evidence shown under it. */
  sections: BriefSectionKey[];
  /** Deterministic precondition, computed from the brief's own figures. */
  applies: (brief: Pick<OperatingBrief, "sections" | "mandatory" | "totals">) => boolean;
  /** The order used without a model and to break ties. */
  rank: number;
}

const figureCount = (brief: Pick<OperatingBrief, "sections">, section: BriefSectionKey, key: string): number => {
  const figure = briefSection(brief, section)?.figures.find((candidate) => candidate.key === key);
  return figure?.value.kind === "count" ? figure.value.value : figure?.value.kind === "money" ? figure.value.money.amount : 0;
};

export const BRIEF_EMPHASES: readonly BriefEmphasis[] = [
  { key: "safety_first", heading: "Safety, cash and entry problems come first", sections: ["controls", "facilities", "equipment", "checklists"], applies: (brief) => brief.mandatory.length > 0, rank: 0 },
  { key: "collections", heading: "Collections are the largest open amount", sections: ["collections"], applies: (brief) => figureCount(brief, "collections", "outstanding") > 0, rank: 1 },
  { key: "renewals", heading: "Renewals decide this week's revenue", sections: ["renewals"], applies: (brief) => figureCount(brief, "renewals", "ending") + figureCount(brief, "renewals", "expired") > 0, rank: 2 },
  { key: "followups", heading: "Follow-up work is overdue", sections: ["followups"], applies: (brief) => figureCount(brief, "followups", "overdue") > 0, rank: 3 },
  { key: "retention", heading: "Members are slipping away quietly", sections: ["retention"], applies: (brief) => figureCount(brief, "retention", "members") > 0, rank: 4 },
  { key: "facilities", heading: "Repairs and machine reports are waiting", sections: ["facilities", "equipment"], applies: (brief) => figureCount(brief, "facilities", "open") + figureCount(brief, "equipment", "open") > 0, rank: 5 },
  { key: "checklists", heading: "Daily checklists were not completed", sections: ["checklists"], applies: (brief) => figureCount(brief, "checklists", "failed") + figureCount(brief, "checklists", "due") > 0, rank: 6 },
  { key: "support", heading: "RIVET is waiting on an open case", sections: ["support"], applies: (brief) => figureCount(brief, "support", "open") > 0, rank: 7 },
  { key: "steady", heading: "Routine day: keep to the standard order", sections: [], applies: () => true, rank: 8 },
];

export function briefEmphasis(key: string): BriefEmphasis | undefined {
  return BRIEF_EMPHASES.find((emphasis) => emphasis.key === key);
}

export function applicableEmphases(brief: Pick<OperatingBrief, "sections" | "mandatory" | "totals">): BriefEmphasisKey[] {
  return [...BRIEF_EMPHASES].sort((left, right) => left.rank - right.rank).filter((emphasis) => emphasis.applies(brief)).map((emphasis) => emphasis.key);
}

/** Counts and amounts used by the brief's deterministic summaries. */
export function briefEmphasisFacts(brief: Pick<OperatingBrief, "sections" | "mandatory" | "totals" | "coverage" | "scope" | "today">): Record<string, unknown> {
  const figures: Record<string, Record<string, number>> = {};
  for (const section of brief.sections) {
    const values: Record<string, number> = { items: section.totalItems };
    for (const figure of section.figures) values[figure.key] = figure.value.kind === "count" ? figure.value.value : figure.value.money.amount;
    figures[section.key] = values;
  }
  return {
    today: brief.today,
    scope: brief.scope.branchId ? "one_branch" : brief.scope.branchScope === "all" ? "all_branches" : "assigned_branches",
    branchCount: brief.scope.branchId ? 1 : brief.scope.branches.length,
    coverage: brief.coverage,
    mandatoryItems: brief.mandatory.length,
    overdueItems: brief.totals.overdue,
    staleItems: brief.totals.stale,
    figures,
  };
}

// ---------------------------------------------------------------------------
// Related matter (brief.related_matter)
// ---------------------------------------------------------------------------

const RELATABLE_KINDS: ReadonlySet<BriefItemKind> = new Set(["facility_task", "equipment_issue", "branch_checklist", "support_case"]);

export function briefItemText(item: Pick<BriefQueueItem, "title" | "detail" | "description">): string {
  return [item.title, item.detail, item.description ?? ""].filter(Boolean).join(". ");
}

export interface BriefRelatedPair {
  firstId: string;
  secondId: string;
  sharedTokens: number;
}

export function briefPairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join("+");
}

/**
 * Operational items in the same branch whose wording overlaps. Wording
 * only proposes a comparison; both items stay listed as recorded.
 */
export function briefRelatedPairs(items: readonly BriefItem[]): BriefRelatedPair[] {
  const candidates = items.filter((item) => RELATABLE_KINDS.has(item.kind));
  const pairs: BriefRelatedPair[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    for (let other = index + 1; other < candidates.length; other += 1) {
      const first = candidates[index]!;
      const second = candidates[other]!;
      if (first.branchName && second.branchName && first.branchName !== second.branchName) continue;
      const shared = sharedTokenCount(briefItemText(first), briefItemText(second));
      if (shared >= BRIEF_RELATED_MIN_TOKENS) pairs.push({ firstId: first.id, secondId: second.id, sharedTokens: shared });
    }
  }
  return pairs.sort((left, right) => right.sharedTokens - left.sharedTokens || left.firstId.localeCompare(right.firstId) || left.secondId.localeCompare(right.secondId)).slice(0, BRIEF_RELATED_MAX_PAIRS);
}

/** Which content words two items share, for the comparison's own evidence line. */
export function briefSharedWords(first: Pick<BriefQueueItem, "title" | "detail" | "description">, second: Pick<BriefQueueItem, "title" | "detail" | "description">): string[] {
  const left = new Set(contentTokens(briefItemText(first)));
  return [...new Set(contentTokens(briefItemText(second)))].filter((token) => left.has(token)).slice(0, 8);
}
