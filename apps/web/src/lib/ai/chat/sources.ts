import { z } from "zod";
import { addDays } from "../../utils/dates";
import type { ChatContextItem, ChatSourceKind, ChatToolOutcome } from "./contracts";
import {
  atRiskRow,
  classRow,
  dashboardSummary,
  isRecord,
  leadDetail,
  leadRow,
  listOf,
  memberDetail,
  memberRow,
  moneyText,
  paymentRow,
  planRow,
  renewalRow,
  reportSummary,
  shiftRow,
  str,
  taskRow,
  timelineRow,
  type Row,
} from "./compact";

/**
 * Everything the assistant can read, as named sources over the existing
 * domain reads. A source is used two ways: attached from a screen (the panel
 * sends its kind, record and filters) or looked up by a tool. Either way the
 * reader runs the existing read operation as the signed-in person, so access,
 * branch scope and field visibility are exactly what the screens enforce.
 */

export type ChatReadOperation =
  | "members.list"
  | "members.get"
  | "members.timeline"
  | "leads.list"
  | "leads.get"
  | "tasks.list"
  | "renewal.queue"
  | "retention.queue"
  | "dashboard"
  | "transactions.list"
  | "shifts.list"
  | "classes.occurrences.list"
  | "analytics.peak_hours"
  | "analytics.class_utilization"
  | "analytics.retention"
  | "analytics.renewal_forecast"
  | "analytics.collections"
  | "analytics.crm_funnel"
  | "plans.list";

export const CHAT_READ_OPERATIONS: readonly ChatReadOperation[] = ["members.list", "members.get", "members.timeline", "leads.list", "leads.get", "tasks.list", "renewal.queue", "retention.queue", "dashboard", "transactions.list", "shifts.list", "classes.occurrences.list", "analytics.peak_hours", "analytics.class_utilization", "analytics.retention", "analytics.renewal_forecast", "analytics.collections", "analytics.crm_funnel", "plans.list"];

export type ChatReadFailure = NonNullable<ChatToolOutcome["failure"]>;

/** A read refused or failed; readers translate their own errors into one of these. */
export class ChatReadError extends Error {
  constructor(readonly failure: ChatReadFailure) {
    super(failure);
    this.name = "ChatReadError";
  }
}

export interface ChatReader {
  read(operation: ChatReadOperation, input: Record<string, unknown>): Promise<unknown>;
}

/** Facts about the asker's workspace the sources need; never sent as instructions. */
export interface ChatEnv {
  /** Gym-local calendar date, YYYY-MM-DD. */
  today: string;
  timezone: string;
  currency: string;
  activeBranchId?: string;
  /** Branches the person can see, for reads that need one. */
  branchIds: string[];
}

export interface SourceResult {
  /** One line naming what was read, for the assistant. */
  title: string;
  data: unknown;
  outcome: ChatToolOutcome;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shortText = z.string().trim().max(120);
const id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);

export const MEMBERSHIP_FILTERS = ["active", "expiring", "expired", "frozen", "outstanding", "scheduled", "cancelled"] as const;
export const LEAD_STAGES = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"] as const;
export const REPORTS = ["peak_hours", "class_utilization", "retention", "renewal_forecast", "collections", "crm_funnel"] as const;
export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "cliq", "other"] as const;

const PARAMS = {
  member: z.object({}).strict(),
  member_payments: z.object({}).strict(),
  member_timeline: z.object({}).strict(),
  lead: z.object({}).strict(),
  member_list: z.object({ search: shortText.optional(), membershipStatus: z.enum(MEMBERSHIP_FILTERS).optional(), status: z.enum(["active", "inactive", "archived"]).optional(), planId: id.optional(), branchId: id.optional() }).strict(),
  lead_list: z.object({ search: shortText.optional(), stage: z.enum(LEAD_STAGES).optional(), overdueOnly: z.boolean().optional(), branchId: id.optional() }).strict(),
  today: z.object({}).strict(),
  renewals: z.object({ bucket: z.enum(["expiring", "expired"]).optional(), days: z.number().int().min(1).max(90).optional() }).strict(),
  at_risk: z.object({}).strict(),
  tasks: z.object({ overdueOnly: z.boolean().optional() }).strict(),
  payments: z.object({ from: isoDate.optional(), to: isoDate.optional(), method: z.enum(PAYMENT_METHODS).optional(), memberId: id.optional() }).strict(),
  shifts: z.object({}).strict(),
  classes: z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict(),
  report: z.object({ report: z.enum(REPORTS), from: isoDate.optional(), to: isoDate.optional() }).strict(),
  plans: z.object({}).strict(),
} satisfies Record<ChatSourceKind, z.ZodType>;

const RECORD_KINDS: ReadonlySet<ChatSourceKind> = new Set(["member", "member_payments", "member_timeline", "lead"]);

/** A context item as the server accepts it: known kind, a record id where one is needed, valid filters. */
export function parseContextItem(raw: unknown): ChatContextItem | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = raw.kind as ChatSourceKind;
  if (!(kind in PARAMS)) return undefined;
  const parsedId = raw.id === undefined ? undefined : id.safeParse(raw.id);
  if (RECORD_KINDS.has(kind) && !parsedId?.success) return undefined;
  const params = PARAMS[kind].safeParse(raw.params ?? {});
  if (!params.success) return undefined;
  const label = (str(raw.label) ?? kind).slice(0, 80);
  const cleanParams = params.data as Record<string, string | number | boolean>;
  return { kind, ...(RECORD_KINDS.has(kind) && parsedId?.success ? { id: parsedId.data } : {}), ...(Object.keys(cleanParams).length ? { params: cleanParams } : {}), label };
}

function range(env: ChatEnv, from: string | undefined, to: string | undefined, defaultDays: number, maxDays: number): { from: string; to: string } {
  const end = to ?? env.today;
  let start = from ?? addDays(end, -(defaultDays - 1));
  if (start > end) start = end;
  if (addDays(start, maxDays - 1) < end) start = addDays(end, -(maxDays - 1));
  return { from: start, to: end };
}

async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

type Loader = (reader: ChatReader, item: { id?: string; params: Record<string, unknown> }, env: ChatEnv) => Promise<SourceResult>;

function listResult(title: string, list: { rows: Row[]; count: number; total: number }, extra: Row = {}): SourceResult {
  return { title, data: { ...extra, total: list.total, rows: list.rows }, outcome: { count: list.count, total: list.total } };
}

async function paymentsIn(reader: ChatReader, input: Record<string, unknown>) {
  const rows: unknown[] = [];
  let page = 1;
  let totalPages = 1;
  // Totals describe the whole window, not one page; a busy quarter is flagged as cut, never silently partial.
  do {
    const result = await reader.read("transactions.list", { ...input, page, pageSize: 100, sort: "-occurredAt" });
    if (isRecord(result) && Array.isArray(result.items)) rows.push(...result.items);
    totalPages = isRecord(result) && typeof result.totalPages === "number" ? result.totalPages : 1;
    page += 1;
  } while (page <= totalPages && page <= 5);
  const byMethod = new Map<string, { count: number; amount: number; currency: string }>();
  let collected = 0;
  let refunded = 0;
  let currency = "";
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.amount)) continue;
    const amount = typeof row.amount.amount === "number" ? row.amount.amount : 0;
    currency ||= String(row.amount.currency ?? "");
    if (row.status === "voided" || row.type === "void") continue;
    if (row.type === "refund") {
      refunded += Math.abs(amount);
      continue;
    }
    collected += amount;
    const method = String(row.method ?? "other");
    const entry = byMethod.get(method) ?? { count: 0, amount: 0, currency };
    entry.count += 1;
    entry.amount += amount;
    byMethod.set(method, entry);
  }
  const money = (amount: number) => moneyText({ amount, currency: currency || "JOD" });
  return {
    rows,
    totals: {
      transactions: rows.length,
      collected: money(collected),
      refunded: money(refunded),
      byMethod: Object.fromEntries([...byMethod].map(([method, entry]) => [method, { count: entry.count, amount: money(entry.amount) }])),
      ...(totalPages > 5 ? { truncated: "more than 500 transactions in this window; totals cover the latest 500" } : {}),
    },
  };
}

const LOADERS: Record<ChatSourceKind, Loader> = {
  member: async (reader, { id: memberId }) => {
    const member = await reader.read("members.get", { memberId });
    const [tasks, timeline] = await Promise.all([
      optional(() => reader.read("tasks.list", { memberId, status: "open", pageSize: 5 })),
      optional(() => reader.read("members.timeline", { memberId, pageSize: 6 })),
    ]);
    const openTasks = tasks ? listOf(tasks, 5, taskRow).rows : [];
    const recent = timeline ? listOf(timeline, 6, timelineRow).rows : [];
    const detail = memberDetail(member);
    return { title: `Member ${str(isRecord(member) ? member.fullName : undefined) ?? memberId}`, data: { ...detail, ...(openTasks.length ? { openTasks } : {}), ...(recent.length ? { recentTimeline: recent } : {}) }, outcome: { subject: str(detail.fullName) } };
  },
  member_payments: async (reader, { id: memberId }) => listResult("Payments for this member, newest first", listOf(await reader.read("transactions.list", { memberId, pageSize: 20, sort: "-occurredAt" }), 20, paymentRow)),
  member_timeline: async (reader, { id: memberId }) => listResult("Member timeline, newest first", listOf(await reader.read("members.timeline", { memberId, pageSize: 25 }), 25, timelineRow)),
  lead: async (reader, { id: leadId }) => {
    const lead = leadDetail(await reader.read("leads.get", { leadId }));
    return { title: `Lead ${str(lead.fullName) ?? leadId}`, data: lead, outcome: { subject: str(lead.fullName) } };
  },
  member_list: async (reader, { params }) => listResult("Members matching the filters", listOf(await reader.read("members.list", { ...params, pageSize: 25 }), 25, memberRow), { filters: params }),
  lead_list: async (reader, { params }) => listResult("Leads matching the filters", listOf(await reader.read("leads.list", { ...params, pageSize: 25 }), 25, leadRow), { filters: params }),
  today: async (reader, _item, env) => {
    const dashboard = await reader.read("dashboard", { ...(env.activeBranchId ? { branchId: env.activeBranchId } : {}), from: addDays(env.today, -29), to: env.today });
    const summary = dashboardSummary(dashboard);
    const queue = isRecord(summary.todayQueue) ? summary.todayQueue : {};
    return { title: "Today's numbers and work queue", data: summary, outcome: { count: Array.isArray(queue.items) ? queue.items.length : 0, total: typeof queue.totalItems === "number" ? queue.totalItems : undefined } };
  },
  renewals: async (reader, { params }) => {
    const bucket = params.bucket === "expired" ? "expired" : "expiring";
    const days = typeof params.days === "number" ? params.days : bucket === "expired" ? 30 : 14;
    return listResult(bucket === "expired" ? `Memberships that ended in the last ${days} days` : `Memberships ending in the next ${days} days`, listOf(await reader.read("renewal.queue", { bucket, days, pageSize: 25 }), 25, renewalRow), { bucket, days });
  },
  at_risk: async (reader) => listResult("Members at risk of leaving", listOf(await reader.read("retention.queue", { pageSize: 25 }), 25, atRiskRow)),
  tasks: async (reader, { params }) => listResult(params.overdueOnly ? "Overdue open tasks" : "Open tasks", listOf(await reader.read("tasks.list", { status: "open", ...(params.overdueOnly ? { overdueOnly: true } : {}), pageSize: 25 }), 25, taskRow)),
  payments: async (reader, { params }, env) => {
    const window = range(env, params.from as string | undefined, params.to as string | undefined, 30, 92);
    const input = { ...window, ...(params.method ? { method: params.method } : {}), ...(params.memberId ? { memberId: params.memberId } : {}), ...(env.activeBranchId ? { branchId: env.activeBranchId } : {}) };
    const { rows, totals } = await paymentsIn(reader, input);
    const latest = rows.slice(0, 15).map(paymentRow);
    return { title: `Payments from ${window.from} to ${window.to}`, data: { window, totals, latest }, outcome: { count: rows.length } };
  },
  shifts: async (reader) => listResult("Recent cash drawer shifts", listOf(await reader.read("shifts.list", { pageSize: 10 }), 10, shiftRow)),
  classes: async (reader, { params }, env) => {
    const from = (params.from as string | undefined) ?? env.today;
    const window = range(env, from, (params.to as string | undefined) ?? addDays(from, 6), 7, 14);
    const branchId = env.activeBranchId ?? env.branchIds[0];
    if (!branchId) throw new ChatReadError("unavailable");
    const occurrences = await reader.read("classes.occurrences.list", { branchId, fromDate: window.from, toDate: window.to });
    return listResult(`Classes from ${window.from} to ${window.to}`, listOf(occurrences, 40, classRow), { window });
  },
  report: async (reader, { params }, env) => {
    const report = params.report as (typeof REPORTS)[number];
    const branch = env.activeBranchId ? { branchId: env.activeBranchId } : {};
    const branchOnly = report === "retention" || report === "renewal_forecast";
    const window = range(env, params.from as string | undefined, params.to as string | undefined, 30, 366);
    const value = await reader.read(`analytics.${report}`, branchOnly ? branch : { ...branch, ...window });
    return { title: branchOnly ? `${report} report` : `${report} report from ${window.from} to ${window.to}`, data: reportSummary(value), outcome: {} };
  },
  plans: async (reader) => listResult("Active membership plans", listOf(await reader.read("plans.list", { status: "active", pageSize: 30 }), 30, planRow)),
};

/** Reads one source; a refusal or a missing record becomes an honest outcome, never an exception. */
export async function loadSource(reader: ChatReader, item: Pick<ChatContextItem, "kind" | "id" | "params">, env: ChatEnv): Promise<SourceResult> {
  try {
    return await LOADERS[item.kind](reader, { id: item.id, params: item.params ?? {} }, env);
  } catch (error) {
    const failure: ChatReadFailure = error instanceof ChatReadError ? error.failure : "unavailable";
    return { title: item.kind, data: { unavailable: failure }, outcome: { failure } };
  }
}
