import { addDays, diffDays } from "../../utils/dates";
import type { ChatAction, ChatActionKind, ChatMoney, ChatPart, ChatToolKey, ChatToolOutcome } from "./contracts";
import { isRecord, moneyText, num, str, type Row } from "./compact";
import { ChatReadError, type ChatEnv, type ChatReader } from "./sources";

/**
 * Membership changes the assistant may propose. Proposing only reads, as the
 * person asking, and checks what the change would do; the answer then shows
 * a card. Confirming the card runs the existing operation (see
 * `actionOperation`) as that same person, with its own permission checks,
 * validation and audit, so these checks are for an honest card, never the
 * authority for the change.
 */

export type ChatActionTool = Extract<ChatToolKey, "propose_renewal" | "propose_freeze" | "propose_unfreeze">;

export const ACTION_TOOLS: Record<ChatActionTool, { kind: ChatActionKind; permission: string }> = {
  propose_renewal: { kind: "renew_membership", permission: "memberships.sell" },
  propose_freeze: { kind: "freeze_membership", permission: "memberships.freeze" },
  propose_unfreeze: { kind: "unfreeze_membership", permission: "memberships.freeze" },
};

export function isActionTool(name: string): name is ChatActionTool {
  return name in ACTION_TOOLS;
}

export interface ProposalRun {
  /** What the assistant reads back. */
  content: string;
  isError: boolean;
  outcome: ChatToolOutcome;
  action?: ChatAction;
}

type Term = {
  id: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: string;
  frozenDaysUsed: number;
  planFreezeAllowanceDays?: number;
  activeFreeze?: { startDate: string; endDate: string; status: string };
};

function term(row: unknown): Term | undefined {
  if (!isRecord(row)) return undefined;
  const id = str(row.id);
  const endDate = str(row.endDate);
  const status = str(row.status);
  if (!id || !endDate || !status) return undefined;
  const freeze = isRecord(row.activeFreeze) && str(row.activeFreeze.startDate) && str(row.activeFreeze.endDate)
    ? { startDate: str(row.activeFreeze.startDate)!, endDate: str(row.activeFreeze.endDate)!, status: str(row.activeFreeze.status) ?? "active" }
    : undefined;
  return {
    id,
    planId: str(row.planId) ?? "",
    planName: str(row.planName) ?? "",
    startDate: str(row.startDate) ?? "",
    endDate,
    status,
    frozenDaysUsed: num(row.frozenDaysUsed) ?? 0,
    ...(num(row.planFreezeAllowanceDays) !== undefined ? { planFreezeAllowanceDays: num(row.planFreezeAllowanceDays) } : {}),
    ...(freeze ? { activeFreeze: freeze } : {}),
  };
}

/** The term a renewal chains from, ranked exactly as the member screen ranks it (lib/domain/status). */
function renewalTarget(terms: readonly Term[]): Term | undefined {
  return [...terms].filter((item) => item.status !== "cancelled").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}

const CURRENT_RANK: Record<string, number> = { active: 0, expiring: 0, frozen: 1, scheduled: 2, expired: 3, cancelled: 4 };

/** The term in force, ranked as the member screen ranks it. */
function currentTerm(terms: readonly Term[]): Term | undefined {
  return [...terms].filter((item) => item.status !== "expired" && item.status !== "cancelled").sort((a, b) => (CURRENT_RANK[a.status] ?? 5) - (CURRENT_RANK[b.status] ?? 5) || b.endDate.localeCompare(a.endDate))[0];
}

function money(value: unknown): ChatMoney | undefined {
  return isRecord(value) && typeof value.amount === "number" && Number.isFinite(value.amount) && typeof value.currency === "string" ? { amount: value.amount, currency: value.currency } : undefined;
}

const refused = (message: string): ProposalRun => ({ content: JSON.stringify({ error: message, changed: false }), isError: true, outcome: { failure: "refused" } });

async function memberTerms(reader: ChatReader, memberId: string): Promise<{ name: string; terms: Term[] }> {
  const member = await reader.read("members.get", { memberId });
  const name = isRecord(member) ? str(member.fullName) : undefined;
  if (!name) throw new ChatReadError("not_found");
  const page = await reader.read("memberships.list", { memberId, pageSize: 50, sort: "-endDate" });
  const items = isRecord(page) && Array.isArray(page.items) ? page.items : Array.isArray(page) ? page : [];
  return { name, terms: items.map(term).filter((item): item is Term => Boolean(item)) };
}

function proposed(action: ChatAction, summary: Row): ProposalRun {
  return {
    content: JSON.stringify({ proposed: true, changed: false, shown: "RIVET is showing the person a card to confirm or dismiss. Nothing has changed yet; do not say it is done.", ...summary }),
    isError: false,
    outcome: { subject: action.memberName },
    action,
  };
}

async function proposeRenewal(reader: ChatReader, env: ChatEnv, memberId: string): Promise<ProposalRun> {
  const { name, terms } = await memberTerms(reader, memberId);
  const target = renewalTarget(terms);
  if (!target) return refused(`${name} has no membership to renew. A first membership is sold at Checkout.`);
  if (target.status === "scheduled") return refused(`${name} already has a renewal that starts ${target.startDate}. Nothing to renew yet.`);
  const plans = await reader.read("plans.list", { status: "active", pageSize: 100 });
  const plan = (isRecord(plans) && Array.isArray(plans.items) ? plans.items : []).find((item) => isRecord(item) && item.id === target.planId);
  if (!isRecord(plan)) return refused(`The ${target.planName || "current"} plan is no longer sold. Renew on ${name}'s page and choose a plan there.`);
  const startDate = target.endDate >= env.today ? addDays(target.endDate, 1) : env.today;
  // The server's own term length (createMembershipMutation): visit passes use their validity window.
  const length = str(plan.kind) === "visits" ? num(plan.visitValidityDays) ?? 90 : num(plan.durationDays) ?? 30;
  const endDate = addDays(startDate, length);
  const price = money(plan.basePrice);
  // The charge falls due when the term starts (createMembershipMutation), so only a renewal starting today is owed at once.
  const dueNow = startDate <= env.today;
  const action: ChatAction = { kind: "renew_membership", memberId, memberName: name, membershipId: target.id, planName: target.planName || str(plan.name) || "", basis: { endDate: target.endDate, status: target.status }, startDate, endDate, ...(price ? { price } : {}), dueNow, status: "proposed" };
  return proposed(action, { member: name, plan: action.planName, currentTermEnds: target.endDate, newTerm: { startDate, endDate }, listedPrice: moneyText(price), payment: dueNow ? "The price is added to what the member owes now; no payment is taken." : `The price is charged to the member and falls due on ${startDate}, when the new term starts; no payment is taken.` });
}

async function proposeFreeze(reader: ChatReader, env: ChatEnv, input: { member_id: string; start_date: string; end_date: string; reason: string }): Promise<ProposalRun> {
  const { name, terms } = await memberTerms(reader, input.member_id);
  const current = currentTerm(terms);
  if (!current || (current.status !== "active" && current.status !== "expiring")) return refused(`${name} has no active membership to freeze.`);
  if (current.activeFreeze?.status === "active" && current.activeFreeze.endDate >= env.today) return refused(`${name}'s membership already has a freeze from ${current.activeFreeze.startDate} to ${current.activeFreeze.endDate}.`);
  if (input.start_date < env.today) return refused("A freeze cannot begin before today.");
  if (input.start_date > current.endDate) return refused(`A freeze must begin during the current term, which ends ${current.endDate}.`);
  if (input.end_date < input.start_date) return refused("The freeze must end on or after the day it starts.");
  const days = diffDays(input.start_date, input.end_date) + 1;
  if (current.planFreezeAllowanceDays !== undefined) {
    const left = Math.max(0, current.planFreezeAllowanceDays - current.frozenDaysUsed);
    if (days > left) return refused(`This plan allows ${current.planFreezeAllowanceDays} freeze days in total and ${left} remain; ${days} were asked for.`);
  }
  const newEndDate = addDays(current.endDate, days);
  const action: ChatAction = { kind: "freeze_membership", memberId: input.member_id, memberName: name, membershipId: current.id, planName: current.planName, basis: { endDate: current.endDate, status: current.status }, freezeStart: input.start_date, freezeEnd: input.end_date, days, newEndDate, reason: input.reason, status: "proposed" };
  return proposed(action, { member: name, plan: current.planName, freeze: { from: input.start_date, to: input.end_date, days }, termEndsNow: current.endDate, termWouldEnd: newEndDate, reason: input.reason });
}

async function proposeUnfreeze(reader: ChatReader, env: ChatEnv, input: { member_id: string; reason: string }): Promise<ProposalRun> {
  const { name, terms } = await memberTerms(reader, input.member_id);
  const frozen = terms.find((item) => item.activeFreeze?.status === "active");
  const freeze = frozen?.activeFreeze;
  if (!frozen || !freeze || freeze.startDate > env.today || freeze.endDate < env.today) return refused(`${name} has no freeze in progress today. Only a freeze in progress can be ended early.`);
  // The server's own arithmetic (memberships.unfreeze): unused days come off the term.
  const planned = diffDays(freeze.startDate, freeze.endDate) + 1;
  const used = Math.max(1, diffDays(freeze.startDate, env.today) + 1);
  const newEndDate = addDays(frozen.endDate, -Math.max(0, planned - used));
  const action: ChatAction = { kind: "unfreeze_membership", memberId: input.member_id, memberName: name, membershipId: frozen.id, planName: frozen.planName, basis: { endDate: frozen.endDate, status: frozen.status }, freezeStart: freeze.startDate, freezeEnd: freeze.endDate, newEndDate, reason: input.reason, status: "proposed" };
  return proposed(action, { member: name, plan: frozen.planName, freeze: { from: freeze.startDate, to: freeze.endDate }, termEndsNow: frozen.endDate, termWouldEnd: newEndDate, reason: input.reason });
}

/** Checks and builds one proposal. Validated input arrives from tools.ts. */
export async function proposeAction(reader: ChatReader, env: ChatEnv, name: ChatActionTool, input: Record<string, unknown>): Promise<ProposalRun> {
  if (env.permissions && !env.permissions.includes(ACTION_TOOLS[name].permission)) {
    return { content: JSON.stringify({ error: "The person asking cannot make this change in RIVET. Their gym owner can give them access.", changed: false }), isError: true, outcome: { failure: "forbidden" } };
  }
  try {
    if (name === "propose_renewal") return await proposeRenewal(reader, env, String(input.member_id));
    if (name === "propose_freeze") return await proposeFreeze(reader, env, input as { member_id: string; start_date: string; end_date: string; reason: string });
    return await proposeUnfreeze(reader, env, input as { member_id: string; reason: string });
  } catch (error) {
    const failure = error instanceof ChatReadError ? error.failure : "unavailable";
    const message = failure === "forbidden" ? "The person asking does not have access to this member's memberships." : failure === "not_found" ? "No such member in this gym, or they are outside the person's branches." : "RIVET could not check this right now.";
    return { content: JSON.stringify({ error: message, changed: false }), isError: true, outcome: { failure } };
  }
}

/** The existing operation a confirmed card runs, with input rebuilt from the stored proposal only. */
export function actionOperation(action: ChatAction, idempotencyKey: string): { operation: "memberships.renew" | "memberships.freeze" | "memberships.unfreeze"; input: Record<string, unknown> } {
  switch (action.kind) {
    case "renew_membership": return { operation: "memberships.renew", input: { membershipId: action.membershipId, idempotencyKey } };
    case "freeze_membership": return { operation: "memberships.freeze", input: { membershipId: action.membershipId, startDate: action.freezeStart, endDate: action.freezeEnd, reason: action.reason } };
    case "unfreeze_membership": return { operation: "memberships.unfreeze", input: { membershipId: action.membershipId, reason: action.reason } };
  }
}

/** What the operation saved, for the card: the new term and its charge, or the term's new end. */
export function actionResult(action: ChatAction, value: unknown): NonNullable<ChatAction["result"]> {
  if (!isRecord(value)) return {};
  if (action.kind === "renew_membership") {
    const membership = isRecord(value.membership) ? value.membership : {};
    const charge = isRecord(value.charge) ? value.charge : {};
    const amount = money(charge.total);
    return { ...(str(membership.startDate) ? { startDate: str(membership.startDate) } : {}), ...(str(membership.endDate) ? { endDate: str(membership.endDate) } : {}), ...(amount ? { amount } : {}) };
  }
  return str(value.endDate) ? { endDate: str(value.endDate) } : {};
}

/** Whether the term still matches what the card was built from. */
export function actionBasisHolds(action: ChatAction, current: { endDate: string; status: string } | undefined): boolean {
  return Boolean(current && current.endDate === action.basis.endDate && current.status === action.basis.status);
}

/** Returns the parts with one action replaced; the original array is never changed. */
export function withAction(parts: readonly ChatPart[], partId: string, next: ChatAction): ChatPart[] {
  return parts.map((part) => (part.type === "tool" && part.id === partId ? { ...part, action: next } : part));
}

/**
 * Decisions on earlier proposals, for the next message's context, so the
 * assistant never re-proposes a change that was already made or declined.
 */
export function decidedActionLines(answers: ReadonlyArray<{ parts: readonly ChatPart[] }>, limit = 6): string[] {
  const lines: string[] = [];
  for (const answer of answers) {
    for (const part of answer.parts) {
      if (part.type !== "tool" || !part.action || part.action.status === "proposed") continue;
      const action = part.action;
      const what = action.kind === "renew_membership" ? "renew" : action.kind === "freeze_membership" ? `freeze ${action.freezeStart} to ${action.freezeEnd}` : "end the freeze early";
      const outcome = action.status === "done"
        ? `confirmed and saved${action.result?.endDate ? ` (term ${action.result.startDate ? `${action.result.startDate} to ` : "now ends "}${action.result.endDate}${action.result.amount ? `, ${moneyText(action.result.amount)} owed` : ""})` : ""}`
        : "dismissed by the person; nothing changed";
      lines.push(`- ${what} for ${action.memberName} (member ${action.memberId}): ${outcome}`);
    }
  }
  return lines.slice(-limit);
}
