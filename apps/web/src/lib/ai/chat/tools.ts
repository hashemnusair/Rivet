import { z } from "zod";
import type { ChatAction, ChatContextItem, ChatScreenLink, ChatToolKey, ChatToolOutcome } from "./contracts";
import { serialize } from "./compact";
import { LEAD_STAGES, loadSource, PAYMENT_METHODS, REPORTS, type ChatEnv, type ChatReader } from "./sources";
import { isActionTool, proposeAction } from "./actions";

/**
 * The lookups the assistant may make while answering. Every tool is a read
 * over a named source (see sources.ts), run as the person asking; there is
 * no tool that changes a record or contacts anyone. `open_screen` only builds
 * a link to an existing RIVET screen for the person to follow, and the
 * `propose_*` tools only check a change and put a card in front of the
 * person (see actions.ts); their confirmation is what runs it.
 *
 * The list is fixed and ordered so the request prefix stays identical across
 * turns and can be cached.
 */

type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };

export interface ChatToolSpec {
  name: ChatToolKey;
  description: string;
  input_schema: JsonSchema;
}

const id = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const query = z.string().trim().max(120);
const membership = z.enum(["active", "expiring", "expired", "frozen", "outstanding", "scheduled", "cancelled"]);

const dateProp = (what: string) => ({ type: "string", description: `${what}, YYYY-MM-DD in the gym's calendar.` });

const SCREENS = ["member", "lead", "members", "leads", "renewals", "at_risk", "payments", "cash_shifts", "classes", "reports", "dashboard", "plans"] as const;

const INPUTS = {
  search_members: z.object({ query: query.optional(), membership: membership.optional(), plan_id: id.optional() }).strict(),
  get_member: z.object({ member_id: id, include: z.array(z.enum(["payments", "timeline"])).max(2).optional() }).strict(),
  search_leads: z.object({ query: query.optional(), stage: z.enum(LEAD_STAGES).optional(), overdue_only: z.boolean().optional() }).strict(),
  get_lead: z.object({ lead_id: id }).strict(),
  list_tasks: z.object({ overdue_only: z.boolean().optional() }).strict(),
  renewals_due: z.object({ bucket: z.enum(["expiring", "expired"]).optional(), days: z.number().int().min(1).max(90).optional() }).strict(),
  at_risk_members: z.object({}).strict(),
  today_overview: z.object({}).strict(),
  list_payments: z.object({ from: isoDate.optional(), to: isoDate.optional(), method: z.enum(PAYMENT_METHODS).optional(), member_id: id.optional() }).strict(),
  cash_shifts: z.object({}).strict(),
  class_schedule: z.object({ from: isoDate.optional(), to: isoDate.optional() }).strict(),
  gym_report: z.object({ report: z.enum(REPORTS), from: isoDate.optional(), to: isoDate.optional() }).strict(),
  list_plans: z.object({}).strict(),
  open_screen: z.object({ screen: z.enum(SCREENS), record_id: id.optional(), membership: membership.optional(), query: query.optional(), label: z.string().trim().min(1).max(80) }).strict(),
  propose_renewal: z.object({ member_id: id }).strict(),
  propose_freeze: z.object({ member_id: id, start_date: isoDate, end_date: isoDate, reason: z.string().trim().min(3).max(240) }).strict(),
  propose_unfreeze: z.object({ member_id: id, reason: z.string().trim().min(3).max(240) }).strict(),
} satisfies Record<ChatToolKey, z.ZodType>;

export const CHAT_TOOLS: readonly ChatToolSpec[] = [
  { name: "search_members", description: "Find members by name, phone or member number, or list members by membership state (expiring soon, expired, frozen, owing money). Returns up to 25 rows and the total that matched.", input_schema: { type: "object", properties: { query: { type: "string", description: "Name, phone or member number." }, membership: { type: "string", enum: [...membership.options] }, plan_id: { type: "string" } }, additionalProperties: false } },
  { name: "get_member", description: "One member's profile: membership, balance, attendance, open tasks and recent timeline. Add payments or the full timeline when needed.", input_schema: { type: "object", properties: { member_id: { type: "string" }, include: { type: "array", items: { type: "string", enum: ["payments", "timeline"] } } }, required: ["member_id"], additionalProperties: false } },
  { name: "search_leads", description: "Find sales leads by name or phone, or list them by stage or overdue follow-up.", input_schema: { type: "object", properties: { query: { type: "string" }, stage: { type: "string", enum: [...LEAD_STAGES] }, overdue_only: { type: "boolean" } }, additionalProperties: false } },
  { name: "get_lead", description: "One lead with contact history, offers and trial booking.", input_schema: { type: "object", properties: { lead_id: { type: "string" } }, required: ["lead_id"], additionalProperties: false } },
  { name: "list_tasks", description: "Open follow-up tasks the person can see, or only overdue ones.", input_schema: { type: "object", properties: { overdue_only: { type: "boolean" } }, additionalProperties: false } },
  { name: "renewals_due", description: "Memberships ending soon (expiring, default 14 days ahead) or recently ended (expired, default 30 days back), with last contact.", input_schema: { type: "object", properties: { bucket: { type: "string", enum: ["expiring", "expired"] }, days: { type: "integer", minimum: 1, maximum: 90 } }, additionalProperties: false } },
  { name: "at_risk_members", description: "Members at risk of leaving (inactive, ending soon, recently ended) with reasons and priority.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "today_overview", description: "Today's numbers (revenue today and this month, outstanding balances, check-ins, renewals due, overdue follow-ups) and the prioritised work queue.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_payments", description: "Payments in a date range (default the last 30 days, at most 92) with totals by method and refunds, and the latest rows.", input_schema: { type: "object", properties: { from: dateProp("First day"), to: dateProp("Last day"), method: { type: "string", enum: [...PAYMENT_METHODS] }, member_id: { type: "string" } }, additionalProperties: false } },
  { name: "cash_shifts", description: "Recent cash drawer shifts with expected and counted cash and any difference.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "class_schedule", description: "Class sessions in the active branch for a date range (default the next 7 days, at most 14) with bookings and spots left.", input_schema: { type: "object", properties: { from: dateProp("First day"), to: dateProp("Last day") }, additionalProperties: false } },
  { name: "gym_report", description: "A management report: peak_hours, class_utilization, collections or crm_funnel for a date range (default the last 30 days); retention or renewal_forecast as of today.", input_schema: { type: "object", properties: { report: { type: "string", enum: [...REPORTS] }, from: dateProp("First day"), to: dateProp("Last day") }, required: ["report"], additionalProperties: false } },
  { name: "list_plans", description: "Active membership plans with prices and subscriber counts.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "open_screen", description: "Offer the person a link to a RIVET screen where they can see or act on something (a member, a lead, a filtered member list, payments, classes, reports). Use it when the next step happens in RIVET; it does not change anything.", input_schema: { type: "object", properties: { screen: { type: "string", enum: [...SCREENS] }, record_id: { type: "string", description: "For member or lead." }, membership: { type: "string", enum: [...membership.options], description: "For members: a list filter." }, query: { type: "string", description: "For members: a search." }, label: { type: "string", description: "Short link text, in the person's language." } }, required: ["screen", "label"], additionalProperties: false } },
  { name: "propose_renewal", description: "Propose renewing one member's membership: the same plan at its listed price, starting the day after the current term ends (or today if it has ended). Only when the person asks for the renewal. RIVET checks it and shows the person a card to confirm; nothing changes until they do. The price is charged to the member, due when the new term starts; no payment is taken.", input_schema: { type: "object", properties: { member_id: { type: "string" } }, required: ["member_id"], additionalProperties: false } },
  { name: "propose_freeze", description: "Propose freezing one member's current membership between two dates, with the reason the person gave. The term's end moves later by the frozen days. Only when the person asks for the freeze; ask for the dates or the reason first if they did not say them. RIVET checks it and shows a card to confirm; nothing changes until they do.", input_schema: { type: "object", properties: { member_id: { type: "string" }, start_date: dateProp("First frozen day, today or later"), end_date: dateProp("Last frozen day"), reason: { type: "string", description: "The reason in the person's own words; never invented." } }, required: ["member_id", "start_date", "end_date", "reason"], additionalProperties: false } },
  { name: "propose_unfreeze", description: "Propose ending a member's freeze that is in progress today, early. Unused frozen days come off the term. Only when the person asks; ask for the reason first if they did not give one. RIVET shows a card to confirm; nothing changes until they do.", input_schema: { type: "object", properties: { member_id: { type: "string" }, reason: { type: "string", description: "The reason in the person's own words; never invented." } }, required: ["member_id", "reason"], additionalProperties: false } },
];

export function isChatToolKey(name: string): name is ChatToolKey {
  return name in INPUTS;
}

/** Builds a link to an existing screen; anything that cannot be built safely is refused. */
export function screenLink(input: z.infer<(typeof INPUTS)["open_screen"]>): ChatScreenLink | undefined {
  const params = new URLSearchParams();
  let path: string;
  switch (input.screen) {
    case "member": if (!input.record_id) return undefined; path = `/members/${encodeURIComponent(input.record_id)}`; break;
    case "lead": if (!input.record_id) return undefined; path = `/crm/leads/${encodeURIComponent(input.record_id)}`; break;
    case "members":
      path = "/members";
      if (input.membership) params.set("membership", input.membership);
      if (input.query) params.set("q", input.query);
      break;
    case "leads": path = "/crm/pipeline"; break;
    case "renewals": path = "/crm/queues"; params.set("view", "renewals"); break;
    case "at_risk": path = "/crm/queues"; break;
    case "payments": path = "/payments"; break;
    case "cash_shifts": path = "/payments/shifts"; break;
    case "classes": path = "/classes"; break;
    case "reports": path = "/reports"; break;
    case "dashboard": path = "/dashboard"; break;
    case "plans": path = "/plans"; break;
  }
  const search = params.toString();
  return { href: search ? `${path}?${search}` : path, screen: input.screen, label: input.label };
}

/** Where a record link the assistant wrote points: `rivet://member/<id>` and `rivet://lead/<id>`. */
export function recordHref(url: string): { href: string; kind: "member" | "lead" } | undefined {
  const match = /^rivet:\/\/(member|lead)\/([A-Za-z0-9_.:-]{1,120})$/.exec(url.trim());
  if (!match) return undefined;
  const kind = match[1] as "member" | "lead";
  return { kind, href: kind === "member" ? `/members/${encodeURIComponent(match[2]!)}` : `/crm/leads/${encodeURIComponent(match[2]!)}` };
}

export interface ToolRun {
  /** What the assistant reads back. */
  content: string;
  isError: boolean;
  /** The validated input, kept for the step's label. */
  input: Record<string, string | number | boolean>;
  outcome: ChatToolOutcome;
  link?: ChatScreenLink;
  action?: ChatAction;
}

function flatInput(value: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") out[key] = item;
    else if (Array.isArray(item)) out[key] = item.join(",");
  }
  return out;
}

function sourcesFor(name: Exclude<ChatToolKey, "open_screen" | "propose_renewal" | "propose_freeze" | "propose_unfreeze">, input: Record<string, unknown>): Array<Pick<ChatContextItem, "kind" | "id" | "params">> {
  const defined = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Record<string, string | number | boolean>;
  switch (name) {
    case "search_members": return [{ kind: "member_list", params: defined({ search: input.query || undefined, membershipStatus: input.membership, planId: input.plan_id }) }];
    case "get_member": {
      const include = (input.include as string[] | undefined) ?? [];
      const memberId = String(input.member_id);
      return [{ kind: "member", id: memberId }, ...(include.includes("payments") ? [{ kind: "member_payments" as const, id: memberId }] : []), ...(include.includes("timeline") ? [{ kind: "member_timeline" as const, id: memberId }] : [])];
    }
    case "search_leads": return [{ kind: "lead_list", params: defined({ search: input.query || undefined, stage: input.stage, overdueOnly: input.overdue_only }) }];
    case "get_lead": return [{ kind: "lead", id: String(input.lead_id) }];
    case "list_tasks": return [{ kind: "tasks", params: defined({ overdueOnly: input.overdue_only }) }];
    case "renewals_due": return [{ kind: "renewals", params: defined({ bucket: input.bucket, days: input.days }) }];
    case "at_risk_members": return [{ kind: "at_risk" }];
    case "today_overview": return [{ kind: "today" }];
    case "list_payments": return [{ kind: "payments", params: defined({ from: input.from, to: input.to, method: input.method, memberId: input.member_id }) }];
    case "cash_shifts": return [{ kind: "shifts" }];
    case "class_schedule": return [{ kind: "classes", params: defined({ from: input.from, to: input.to }) }];
    case "gym_report": return [{ kind: "report", params: defined({ report: input.report, from: input.from, to: input.to }) }];
    case "list_plans": return [{ kind: "plans" }];
  }
}

/** Validates and runs one tool call. Malformed input and refusals come back as error results the assistant can explain. */
export async function runChatTool(reader: ChatReader, env: ChatEnv, name: string, rawInput: unknown): Promise<ToolRun> {
  if (!isChatToolKey(name)) return { content: JSON.stringify({ error: "unknown tool" }), isError: true, input: {}, outcome: { failure: "invalid" } };
  const parsed = (INPUTS[name] as z.ZodType<Record<string, unknown>>).safeParse(rawInput ?? {});
  if (!parsed.success) return { content: JSON.stringify({ error: "invalid input", issues: parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`) }), isError: true, input: {}, outcome: { failure: "invalid" } };
  const input = flatInput(parsed.data);
  if (name === "open_screen") {
    const link = screenLink(parsed.data as z.infer<(typeof INPUTS)["open_screen"]>);
    if (!link) return { content: JSON.stringify({ error: "member and lead links need record_id" }), isError: true, input, outcome: { failure: "invalid" } };
    return { content: JSON.stringify({ shown: true, href: link.href }), isError: false, input, outcome: {}, link };
  }
  if (isActionTool(name)) {
    const run = await proposeAction(reader, env, name, parsed.data);
    return { content: run.content, isError: run.isError, input, outcome: run.outcome, ...(run.action ? { action: run.action } : {}) };
  }
  const results = await Promise.all(sourcesFor(name, parsed.data).map((item) => loadSource(reader, item, env)));
  const primary = results[0]!;
  const failure = primary.outcome.failure;
  if (failure) {
    const message = failure === "forbidden" ? "The person asking does not have access to this in RIVET." : failure === "not_found" ? "No such record in this gym, or it is outside the person's branches." : failure === "invalid" ? "RIVET could not read this with that input." : "RIVET could not read this right now.";
    return { content: JSON.stringify({ error: message }), isError: true, input, outcome: primary.outcome };
  }
  const body = results.length === 1 ? { source: primary.title, ...asObject(primary.data) } : { sources: results.map((result) => ({ source: result.title, ...asObject(result.data) })) };
  return { content: serialize(body), isError: false, input, outcome: primary.outcome };
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { data: value };
}
