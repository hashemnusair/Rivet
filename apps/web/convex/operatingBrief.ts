import { finalizeTodayQueue } from "../src/lib/dashboard/today-queue";

/**
 * The dashboard's "Needs attention" summary: the pure logic shared by the
 * Convex query, the preview adapter and the dashboard.
 *
 * It counts the unresolved work a gym has right now — the same items the
 * Today list builds, plus ended memberships, machine reports, low stock and
 * open RIVET support requests — and turns each non-zero count into one plain
 * sentence that links to the page where the work is done. Every number is
 * computed here; the dashboard only renders the sentences. The Today list
 * below it stays the one ordered list of individual tasks.
 *
 * No Convex or path-alias imports: the browser preview adapter shares it.
 */
export const BRIEF_QUEUE_LIMIT = 2_000;
/** A follow-up this far overdue is reported as waiting, not merely late. */
export const BRIEF_STALE_DAYS = 7;

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

/** One queue item with the facts the counts need. Internal to the summary; never sent to the page. */
interface BriefItem extends BriefQueueItem {
  section: BriefSectionKey;
  /** Whole days past the due date at generation time, when the item has one and is late. */
  overdueDays?: number;
  /** Late by `BRIEF_STALE_DAYS` or more. */
  stale: boolean;
}

export type BriefFigureValue = { kind: "count"; value: number } | { kind: "money"; money: BriefMoney };

export interface BriefFigure {
  key: string;
  label: string;
  value: BriefFigureValue;
}

export interface BriefSection {
  key: BriefSectionKey;
  label: string;
  figures: BriefFigure[];
  totalItems: number;
  href: string;
}

export interface BriefSource {
  key: BriefSourceKey;
  status: BriefSourceStatus;
  asOf: string;
  itemCount: number;
}

/** One plain sentence on the dashboard, with the page where the work is done. */
export interface BriefAttentionLine {
  key: string;
  /** Safety, cash and entry problems: shown first and marked. */
  urgent: boolean;
  text: string;
  /** A money total shown beside the sentence, when the line is about money. */
  money?: BriefMoney;
  href: string;
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
  /** Plain names of sources that could not be read just now (not those switched off or hidden by role). */
  missing: string[];
  sections: BriefSection[];
  totals: { items: number; urgent: number; overdue: number; stale: number };
  /** The sentences to show, most urgent first; empty when nothing needs attention. */
  attention: BriefAttentionLine[];
  /** True when the Today list held more than `BRIEF_QUEUE_LIMIT` items and the counts stop there. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Sections: where each kind of work is counted and where it is done
// ---------------------------------------------------------------------------

const SECTION_ORDER: readonly BriefSectionKey[] = ["collections", "renewals", "followups", "retention", "controls", "facilities", "equipment", "checklists", "stock", "support"];

const SECTION_META: Record<BriefSectionKey, { label: string; kinds: readonly BriefItemKind[]; href: string }> = {
  collections: { label: "Unpaid balances", kinds: ["outstanding_balance"], href: "/members?membership=outstanding&sort=-outstanding" },
  renewals: { label: "Renewals", kinds: ["renewal"], href: "/crm/queues?view=renewals" },
  followups: { label: "Follow-ups", kinds: ["follow_up"], href: "/crm/queues" },
  retention: { label: "Members who may not come back", kinds: ["at_risk"], href: "/crm/queues?view=at-risk" },
  controls: { label: "Approvals, cash and entry", kinds: ["approval", "cash_variance", "access_denial"], href: "/audit?approval=pending" },
  facilities: { label: "Maintenance jobs", kinds: ["facility_task"], href: "/maintenance" },
  equipment: { label: "Machines", kinds: ["equipment_issue"], href: "/operations?tab=equipment" },
  checklists: { label: "Daily checklists", kinds: ["branch_checklist"], href: "/checklists" },
  stock: { label: "Stock", kinds: ["low_stock"], href: "/operations?tab=inventory&stock=attention" },
  support: { label: "RIVET support", kinds: ["support_case"], href: "/support" },
};

/** Plain names for the sources, used only when one could not be read. */
const SOURCE_NAMES: Record<BriefSourceKey, string> = {
  queue: "today's work",
  expired: "ended memberships",
  equipment: "machine reports",
  stock: "stock levels",
  support: "RIVET support requests",
};

export function briefSectionLabel(key: BriefSectionKey): string {
  return SECTION_META[key].label;
}

export function briefSectionForKind(kind: BriefItemKind): BriefSectionKey {
  for (const key of SECTION_ORDER) if (SECTION_META[key].kinds.includes(kind)) return key;
  return "controls";
}

// ---------------------------------------------------------------------------
// Building the summary
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

function toBriefItem(item: BriefQueueItem, today: string, timezone: string): BriefItem {
  const overdueDays = item.dueAt && item.overdue ? Math.max(0, briefDaysBetween(localDate(item.dueAt, timezone), today)) : undefined;
  return {
    ...item,
    section: briefSectionForKind(item.kind),
    ...(overdueDays !== undefined ? { overdueDays } : {}),
    stale: overdueDays !== undefined && overdueDays >= BRIEF_STALE_DAYS,
  };
}

function sumMoney(items: readonly BriefItem[], currency: string): BriefMoney {
  let amount = 0;
  for (const item of items) if (item.amount) amount += item.amount.amount;
  return { amount, currency: items.find((item) => item.amount)?.amount?.currency ?? currency };
}

function count(label: string, key: string, value: number): BriefFigure {
  return { key, label, value: { kind: "count", value } };
}

function sectionFigures(key: BriefSectionKey, items: readonly BriefItem[], input: BriefInput): BriefFigure[] {
  const today = input.today;
  switch (key) {
    case "collections": {
      const total = sumMoney(items, input.currency);
      const largest = items.reduce((best, item) => (item.amount && item.amount.amount > (best?.amount?.amount ?? 0) ? item : best), undefined as BriefItem | undefined);
      return [
        { key: "outstanding", label: "Unpaid", value: { kind: "money", money: total } },
        count("Members who owe money", "members", items.length),
        ...(largest?.amount ? [{ key: "largest", label: "Largest unpaid balance", value: { kind: "money" as const, money: largest.amount } }] : []),
      ];
    }
    case "renewals": {
      const expired = items.filter((item) => item.id.startsWith("expired:"));
      const ending = items.filter((item) => !item.id.startsWith("expired:"));
      const endingToday = ending.filter((item) => item.dueAt && localDate(item.dueAt, input.timezone) === today).length;
      return [count("Ending in the next 7 days", "ending", ending.length), count("Ending today", "today", endingToday), count("Ended in the last 30 days, not renewed", "expired", expired.length)];
    }
    case "followups": {
      const overdue = items.filter((item) => item.overdue).length;
      return [count("Late", "overdue", overdue), count("Due today", "today", items.length - overdue), count(`Waiting ${BRIEF_STALE_DAYS} days or more`, "stale", items.filter((item) => item.stale).length)];
    }
    case "retention":
      return [count("Members to contact", "members", items.length)];
    case "controls": {
      const variances = items.filter((item) => item.kind === "cash_variance");
      return [
        count("Waiting for approval", "approvals", items.filter((item) => item.kind === "approval").length),
        count("Cash differences", "variances", variances.length),
        { key: "variance_total", label: "Cash difference total", value: { kind: "money", money: { amount: variances.reduce((sum, item) => sum + Math.abs(item.amount?.amount ?? 0), 0), currency: variances.find((item) => item.amount)?.amount?.currency ?? input.currency } } },
        count("Entry refused today", "entry", items.filter((item) => item.kind === "access_denial").length),
      ];
    }
    case "facilities":
      return [count("Open", "open", items.length), count("Late", "overdue", items.filter((item) => item.overdue).length), count("Blocked or critical", "urgent", items.filter((item) => item.priority === "urgent").length)];
    case "equipment":
      return [count("Open problems", "open", items.length), count("Do not use", "out_of_service", items.filter((item) => item.safetyStatus === "out_of_service").length), count("Not checked yet", "unknown", items.filter((item) => item.safetyStatus === "unknown").length)];
    case "checklists":
      return [count("With failed items", "failed", items.filter((item) => item.id.startsWith("checklist-failed:")).length), count("Not finished", "due", items.filter((item) => item.id.startsWith("checklist-due:")).length), count("Past their time", "overdue", items.filter((item) => item.overdue).length)];
    case "stock":
      return [count("Running low", "products", items.length)];
    case "support":
      return [count("Open", "open", items.length), count("Urgent", "urgent", items.filter((item) => item.priority === "urgent").length)];
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The single link for a line: the one record when every item points at the same place, otherwise the section's list. */
function lineHref(items: readonly BriefItem[], fallback: string): string {
  const hrefs = new Set(items.map((item) => item.href));
  return hrefs.size === 1 ? [...hrefs][0]! : fallback;
}

/**
 * Turn the counts into the dashboard's sentences, most urgent first. Only
 * non-zero lines are returned, so a quiet day shows nothing but "all clear".
 */
function attentionLines(itemsBySection: Map<BriefSectionKey, BriefItem[]>, currency: string): BriefAttentionLine[] {
  const items = (key: BriefSectionKey) => itemsBySection.get(key) ?? [];
  const lines: BriefAttentionLine[] = [];
  const add = (key: string, urgent: boolean, matching: readonly BriefItem[], text: string, href: string, money?: BriefMoney) => {
    if (matching.length) lines.push({ key, urgent, text, href, ...(money ? { money } : {}) });
  };

  const machines = items("equipment");
  const doNotUse = machines.filter((item) => item.safetyStatus === "out_of_service");
  add("machines-do-not-use", true, doNotUse, `${plural(doNotUse.length, "machine is", "machines are")} marked "do not use"`, lineHref(doNotUse, SECTION_META.equipment.href));
  const controls = items("controls");
  const cash = controls.filter((item) => item.kind === "cash_variance");
  add("cash-differences", true, cash, `${plural(cash.length, "cash difference", "cash differences")} to check`, "/payments/shifts");
  const refused = controls.filter((item) => item.kind === "access_denial");
  add("entry-refused", true, refused, `${plural(refused.length, "member was", "members were")} refused entry today`, "/reception");
  const checklists = items("checklists");
  const failed = checklists.filter((item) => item.id.startsWith("checklist-failed:"));
  add("checklists-failed", true, failed, `${plural(failed.length, "daily checklist has", "daily checklists have")} failed items`, SECTION_META.checklists.href);
  const support = items("support");
  const urgentSupport = support.filter((item) => item.priority === "urgent");
  add("support-urgent", true, urgentSupport, `${plural(urgentSupport.length, "urgent request", "urgent requests")} with RIVET support`, lineHref(urgentSupport, SECTION_META.support.href));

  const approvals = controls.filter((item) => item.kind === "approval");
  add("approvals", false, approvals, `${plural(approvals.length, "request is", "requests are")} waiting for your approval`, SECTION_META.controls.href);
  const owed = items("collections");
  add("unpaid", false, owed, `${plural(owed.length, "member owes", "members owe")} money`, SECTION_META.collections.href, owed.length ? sumMoney(owed, currency) : undefined);
  const renewals = items("renewals");
  const ending = renewals.filter((item) => !item.id.startsWith("expired:"));
  add("renewals-ending", false, ending, `${plural(ending.length, "membership ends", "memberships end")} in the next 7 days`, SECTION_META.renewals.href);
  const ended = renewals.filter((item) => item.id.startsWith("expired:"));
  add("renewals-ended", false, ended, `${plural(ended.length, "membership", "memberships")} ended in the last 30 days and ${ended.length === 1 ? "was" : "were"} not renewed`, SECTION_META.renewals.href);
  const followups = items("followups");
  const late = followups.filter((item) => item.overdue);
  const dueToday = followups.length - late.length;
  if (late.length) lines.push({ key: "followups", urgent: false, text: `${plural(late.length, "follow-up is", "follow-ups are")} late${dueToday ? `, and ${dueToday} more ${dueToday === 1 ? "is" : "are"} due today` : ""}`, href: SECTION_META.followups.href });
  else add("followups", false, followups, `${plural(followups.length, "follow-up is", "follow-ups are")} due today`, SECTION_META.followups.href);
  const atRisk = items("retention");
  add("at-risk", false, atRisk, `${plural(atRisk.length, "member", "members")} may not come back`, SECTION_META.retention.href);
  const otherMachines = machines.filter((item) => item.safetyStatus !== "out_of_service");
  add("machines-open", false, otherMachines, `${plural(otherMachines.length, "machine problem is", "machine problems are")} not fixed yet`, lineHref(otherMachines, SECTION_META.equipment.href));
  const maintenance = items("facilities");
  add("maintenance", false, maintenance, `${plural(maintenance.length, "maintenance job is", "maintenance jobs are")} open`, SECTION_META.facilities.href);
  const unfinished = checklists.filter((item) => item.id.startsWith("checklist-due:"));
  add("checklists-due", false, unfinished, `${plural(unfinished.length, "daily checklist is", "daily checklists are")} not finished`, SECTION_META.checklists.href);
  const stock = items("stock");
  add("stock", false, stock, `${plural(stock.length, "product is", "products are")} running low`, SECTION_META.stock.href);
  const otherSupport = support.filter((item) => item.priority !== "urgent");
  add("support-open", false, otherSupport, `${plural(otherSupport.length, "open request", "open requests")} with RIVET support`, lineHref(otherSupport, SECTION_META.support.href));
  return lines;
}

/**
 * Build the summary. Counts cover every item the Today list and the extra
 * sources hold for the viewer's own branches and role.
 */
export function buildOperatingBrief(input: BriefInput): OperatingBrief {
  const timezone = input.timezone || "UTC";
  const collected: BriefQueueItem[] = [...input.queue];
  const sources: BriefSource[] = [];
  const queueTruncated = (input.queueTotal ?? input.queue.length) > input.queue.length;
  sources.push({ key: "queue", status: input.queue.length ? "ok" : "empty", asOf: input.generatedAt, itemCount: input.queue.length });
  for (const source of input.sources) {
    const items = source.status === "ok" || source.status === "empty" ? source.items ?? [] : [];
    collected.push(...items);
    sources.push({ key: source.key, status: source.status === "ok" && !items.length ? "empty" : source.status, asOf: input.generatedAt, itemCount: items.length });
  }
  const ordered = finalizeTodayQueue(collected, input.generatedAt, BRIEF_QUEUE_LIMIT);
  const queue = ordered.items.map((item) => toBriefItem(item, input.today, timezone));
  const itemsBySection = new Map<BriefSectionKey, BriefItem[]>();
  for (const item of queue) itemsBySection.set(item.section, [...(itemsBySection.get(item.section) ?? []), item]);
  const sections: BriefSection[] = SECTION_ORDER.map((key) => {
    const items = itemsBySection.get(key) ?? [];
    return { key, label: SECTION_META[key].label, figures: sectionFigures(key, items, input), totalItems: items.length, href: SECTION_META[key].href };
  });
  // Switched off or hidden by role is the gym's own setup, not missing information.
  const missing = sources.filter((source) => source.status === "unavailable").map((source) => SOURCE_NAMES[source.key]);
  return {
    generatedAt: input.generatedAt,
    today: input.today,
    timezone,
    currency: input.currency,
    scope: input.scope,
    coverage: sources.every((source) => source.status === "ok" || source.status === "empty") && !queueTruncated ? "complete" : "partial",
    sources,
    missing,
    sections,
    totals: { items: queue.length, urgent: queue.filter((item) => item.priority === "urgent").length, overdue: queue.filter((item) => item.overdue).length, stale: queue.filter((item) => item.stale).length },
    attention: attentionLines(itemsBySection, input.currency),
    truncated: queueTruncated || ordered.totalItems > queue.length,
  };
}

/** One section by key. */
export function briefSection(brief: Pick<OperatingBrief, "sections">, key: BriefSectionKey): BriefSection | undefined {
  return brief.sections.find((section) => section.key === key);
}
