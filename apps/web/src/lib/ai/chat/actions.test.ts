import { describe, expect, it } from "vitest";
import { actionBasisHolds, actionOperation, actionResult, decidedActionLines, proposeAction, withAction } from "./actions";
import { chatActionOpen, CHAT_ACTION_TTL_MS, type ChatAction, type ChatPart } from "./contracts";
import { ChatReadError, type ChatEnv, type ChatReader, type ChatReadOperation } from "./sources";
import { runChatTool } from "./tools";

const ENV: ChatEnv = { today: "2026-10-27", timezone: "Asia/Amman", currency: "JOD", branchIds: ["br-main"], permissions: ["members.read", "memberships.sell", "memberships.freeze"] };
const PLAN = { id: "plan-m", name: "Monthly", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, status: "active" };
const TERM = { id: "ms-1", planId: "plan-m", planName: "Monthly", startDate: "2026-10-10", endDate: "2026-11-09", status: "active", frozenDaysUsed: 4, planFreezeAllowanceDays: 14 };

function reader(terms: unknown[] = [TERM], overrides: Partial<Record<ChatReadOperation, (input: Record<string, unknown>) => unknown>> = {}): ChatReader {
  const reads: Partial<Record<ChatReadOperation, (input: Record<string, unknown>) => unknown>> = {
    "members.get": (input) => {
      if (input.memberId !== "m-1") throw new ChatReadError("not_found");
      return { id: "m-1", fullName: "Ahmad Khalil" };
    },
    "memberships.list": () => ({ items: terms, totalItems: terms.length }),
    "plans.list": () => ({ items: [PLAN], totalItems: 1 }),
    ...overrides,
  };
  return { read: async (operation, input) => reads[operation]!(input) };
}

describe("proposals", () => {
  it("renews the latest term on the same plan at its listed price, starting the day after it ends", async () => {
    const run = await proposeAction(reader(), ENV, "propose_renewal", { member_id: "m-1" });
    expect(run.isError).toBe(false);
    expect(run.action).toMatchObject({ kind: "renew_membership", memberName: "Ahmad Khalil", membershipId: "ms-1", startDate: "2026-11-10", endDate: "2026-12-10", price: { amount: 40_000, currency: "JOD" }, dueNow: false, basis: { endDate: "2026-11-09", status: "active" }, status: "proposed" });
    expect(JSON.parse(run.content)).toMatchObject({ proposed: true, changed: false, listedPrice: "JOD 40.000" });
    // An ended term renews from today.
    const ended = await proposeAction(reader([{ ...TERM, endDate: "2026-10-01", status: "expired" }]), ENV, "propose_renewal", { member_id: "m-1" });
    expect(ended.action).toMatchObject({ startDate: "2026-10-27", endDate: "2026-11-26", dueNow: true });
  });

  it("refuses what the person cannot do, or what RIVET would refuse, with a reason to explain", async () => {
    expect((await proposeAction(reader(), { ...ENV, permissions: ["members.read"] }, "propose_renewal", { member_id: "m-1" })).outcome.failure).toBe("forbidden");
    expect((await proposeAction(reader([]), ENV, "propose_renewal", { member_id: "m-1" })).outcome.failure).toBe("refused");
    expect((await proposeAction(reader([TERM, { ...TERM, id: "ms-2", startDate: "2026-11-10", endDate: "2026-12-10", status: "scheduled" }]), ENV, "propose_renewal", { member_id: "m-1" })).content).toContain("already has a renewal");
    expect((await proposeAction(reader(), ENV, "propose_renewal", { member_id: "m-9" })).outcome.failure).toBe("not_found");
    const retired = await proposeAction(reader([TERM], { "plans.list": () => ({ items: [] }) }), ENV, "propose_renewal", { member_id: "m-1" });
    expect(retired.content).toContain("no longer sold");
  });

  it("freezes within the term and the plan's remaining freeze days, moving the end date", async () => {
    const run = await proposeAction(reader(), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-10-28", end_date: "2026-11-03", reason: "Travel" });
    expect(run.action).toMatchObject({ kind: "freeze_membership", freezeStart: "2026-10-28", freezeEnd: "2026-11-03", days: 7, newEndDate: "2026-11-16", reason: "Travel" });
    const refusals = await Promise.all([
      proposeAction(reader(), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-10-20", end_date: "2026-10-30", reason: "Travel" }),
      proposeAction(reader(), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-11-20", end_date: "2026-11-25", reason: "Travel" }),
      proposeAction(reader(), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-10-28", end_date: "2026-11-15", reason: "Travel" }),
      proposeAction(reader([{ ...TERM, activeFreeze: { startDate: "2026-10-25", endDate: "2026-10-30", status: "active" } }]), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-11-01", end_date: "2026-11-02", reason: "Travel" }),
      proposeAction(reader([{ ...TERM, status: "expired", endDate: "2026-10-01" }]), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-10-28", end_date: "2026-10-30", reason: "Travel" }),
    ]);
    expect(refusals.map((item) => [item.outcome.failure, item.action])).toEqual(Array(5).fill(["refused", undefined]));
    expect(refusals[2]!.content).toContain("10 remain");
  });

  it("ends a freeze in progress, taking the unused days off the term", async () => {
    const frozen = { ...TERM, status: "frozen", endDate: "2026-11-19", activeFreeze: { startDate: "2026-10-25", endDate: "2026-11-03", status: "active" } };
    const run = await proposeAction(reader([frozen]), ENV, "propose_unfreeze", { member_id: "m-1", reason: "Back early" });
    // Planned 10 days, used 3 (25–27 Oct): 7 come off.
    expect(run.action).toMatchObject({ kind: "unfreeze_membership", newEndDate: "2026-11-12", reason: "Back early" });
    expect((await proposeAction(reader(), ENV, "propose_unfreeze", { member_id: "m-1", reason: "Back early" })).outcome.failure).toBe("refused");
  });

  it("validates tool input before reading, so a reason is never invented by the loop", async () => {
    const missing = await runChatTool(reader(), ENV, "propose_freeze", { member_id: "m-1", start_date: "2026-10-28", end_date: "2026-11-03" });
    expect(missing).toMatchObject({ isError: true, outcome: { failure: "invalid" } });
    const run = await runChatTool(reader(), ENV, "propose_renewal", { member_id: "m-1" });
    expect(run.action?.kind).toBe("renew_membership");
  });
});

describe("confirming", () => {
  const action: ChatAction = { kind: "freeze_membership", memberId: "m-1", memberName: "Ahmad Khalil", membershipId: "ms-1", planName: "Monthly", basis: { endDate: "2026-11-09", status: "active" }, freezeStart: "2026-10-28", freezeEnd: "2026-11-03", days: 7, newEndDate: "2026-11-16", reason: "Travel", status: "proposed" };

  it("runs only the existing operation, rebuilt from the stored card", () => {
    expect(actionOperation(action, "k")).toEqual({ operation: "memberships.freeze", input: { membershipId: "ms-1", startDate: "2026-10-28", endDate: "2026-11-03", reason: "Travel" } });
    expect(actionOperation({ ...action, kind: "renew_membership" }, "wazen:msg:part")).toEqual({ operation: "memberships.renew", input: { membershipId: "ms-1", idempotencyKey: "wazen:msg:part" } });
    expect(actionOperation({ ...action, kind: "unfreeze_membership" }, "k")).toEqual({ operation: "memberships.unfreeze", input: { membershipId: "ms-1", reason: "Travel" } });
  });

  it("is open for half an hour, and only while the term is unchanged", () => {
    const finished = "2026-10-27T17:00:00.000Z";
    expect(chatActionOpen(action, finished, Date.parse(finished) + CHAT_ACTION_TTL_MS - 1)).toBe(true);
    expect(chatActionOpen(action, finished, Date.parse(finished) + CHAT_ACTION_TTL_MS)).toBe(false);
    expect(chatActionOpen(action, undefined, Date.parse(finished))).toBe(false);
    expect(chatActionOpen({ ...action, status: "done" }, finished, Date.parse(finished))).toBe(false);
    expect(actionBasisHolds(action, { endDate: "2026-11-09", status: "active" })).toBe(true);
    expect(actionBasisHolds(action, { endDate: "2026-11-12", status: "active" })).toBe(false);
    expect(actionBasisHolds(action, undefined)).toBe(false);
  });

  it("reads back what was saved, and tells the next answer what was decided", () => {
    expect(actionResult({ ...action, kind: "renew_membership" }, { membership: { startDate: "2026-11-10", endDate: "2026-12-10" }, charge: { total: { amount: 40_000, currency: "JOD" } } })).toEqual({ startDate: "2026-11-10", endDate: "2026-12-10", amount: { amount: 40_000, currency: "JOD" } });
    expect(actionResult(action, { endDate: "2026-11-16" })).toEqual({ endDate: "2026-11-16" });
    const parts: ChatPart[] = [{ type: "tool", id: "p1", tool: "propose_freeze", input: {}, status: "done", action, startedAt: 0 }];
    const done = withAction(parts, "p1", { ...action, status: "done", result: { endDate: "2026-11-16" } });
    expect(parts[0]).toMatchObject({ action: { status: "proposed" } });
    expect(decidedActionLines([{ parts }, { parts: done }, { parts: withAction(parts, "p1", { ...action, status: "dismissed" }) }])).toEqual([
      "- freeze 2026-10-28 to 2026-11-03 for Ahmad Khalil (member m-1): confirmed and saved (term now ends 2026-11-16)",
      "- freeze 2026-10-28 to 2026-11-03 for Ahmad Khalil (member m-1): dismissed by the person; nothing changed",
    ]);
  });
});
