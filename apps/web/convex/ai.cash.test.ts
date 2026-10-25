import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { delegatedRequest } from "./security";
import { executeDomainMutation } from "./domain";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Thursday 22 October 2026, 21:30 in Amman.
const NOW = new Date("2026-10-22T18:30:00.000Z");
const ORG = "cash-org";
const MAIN = "cash-main";
const op = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-cash-${operation}`, organizationId: ORG, activeBranchId: MAIN });

type Run = { id: string; status: string; errorCategory?: string; results: Array<{ kind: string; id: string }> };
type Artifact = { kind: string; sections: Array<{ key: string; items: Array<{ key: string; message: { key: string; params?: Record<string, unknown> } }> }>; verification: { verified: boolean } };
type Proposal = { id: string; status: string; changes: Array<{ field: string; from?: string; to: string }>; changesetHash: string; requiredPermissionKey: string; allowed: { approve: boolean; reject: boolean }; invalidationReason?: string; decidedByName?: string };
type Shift = { varianceApprovalStatus: string };

interface Ids { org: Id<"organizations">; owner: Id<"users"> }

/**
 * A closed drawer that is JOD 5.000 over: 10.000 float + 20.000 cash
 * payment = 30.000 expected, 35.000 counted. A 5.000 card payment in the
 * same shift is the only recorded movement that matches the difference.
 */
async function seed(t: TestConvex<typeof schema>, options: { cardAmount?: number } = {}): Promise<Ids> {
  return await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Cash Gym", slug: "cash-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const person = async (publicId: string, role: "owner" | "manager" | "receptionist") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@cash.example`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds: [main], branchScope: role === "receptionist" ? "selected" : "all", active: true, createdAt: now, updatedAt: now });
      return id;
    };
    const owner = await person("cash-owner", "owner");
    await person("cash-manager", "manager");
    await person("cash-desk", "receptionist");
    const rec = (entityType: string, publicId: string, value: Record<string, unknown>) => ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId: main, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value } });
    await rec("settings", "settings", { operationalPolicies: {} });
    await rec("shift", "cash-shift", { branchId: MAIN, openedById: "cash-desk", openedByName: "cash-desk", openedAt: "2026-10-22T05:00:00.000Z", openingFloat: { amount: 10_000, currency: "JOD" }, status: "closed", closedAt: "2026-10-22T17:00:00.000Z", closedById: "cash-desk", expectedCash: { amount: 30_000, currency: "JOD" }, countedCash: { amount: 35_000, currency: "JOD" }, variance: { amount: 5_000, currency: "JOD" }, varianceExplanation: "Counted twice", varianceApprovalStatus: "pending" });
    await rec("shift", "cash-open", { branchId: MAIN, openedById: "cash-desk", openedByName: "cash-desk", openedAt: "2026-10-22T17:30:00.000Z", openingFloat: { amount: 10_000, currency: "JOD" }, status: "open", varianceApprovalStatus: "none" });
    await rec("payment", "cash-pay-1", { branchId: MAIN, shiftId: "cash-shift", type: "payment", status: "completed", method: "cash", amount: { amount: 20_000, currency: "JOD" }, receiptId: "cash-receipt-1", receiptNumber: "R-0001", occurredAt: "2026-10-22T08:00:00.000Z" });
    await rec("payment", "cash-pay-2", { branchId: MAIN, shiftId: "cash-shift", type: "payment", status: "completed", method: "card", amount: { amount: options.cardAmount ?? 5_000, currency: "JOD" }, receiptId: "cash-receipt-2", receiptNumber: "R-0002", occurredAt: "2026-10-22T09:15:00.000Z" });
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: "execute", externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
    // RIVET has made assistance available for this gym; without it every gate reads as off.
    const platformOperator = await ctx.db.insert("users", { publicId: "cash-platform-operator", authSubject: "clerk-cash-platform-operator", email: "operator@cash.example", fullName: "Platform Operator", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("aiAvailability", { organizationId: org, available: true, reason: "Test gym", changedByUserId: platformOperator, changedAt: now });
    return { org, owner };
  });
}

async function investigate(t: TestConvex<typeof schema>, subject: string, shiftId: string, requestKey: string): Promise<Run> {
  const started = await t.withIdentity({ subject }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "cash_difference", params: { shiftId }, requestKey })) as Run;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.run.get", { runId: started.id })) as Run;
}

async function proposalsFor(t: TestConvex<typeof schema>, subject: string, runId: string): Promise<Proposal[]> {
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.proposals.list", { runId })) as Proposal[];
}

async function shiftStatus(t: TestConvex<typeof schema>): Promise<string> {
  const page = await t.withIdentity({ subject: "clerk-cash-owner" }).query(api.domain.query, op("shifts.list", { branchId: MAIN })) as { items: Array<Shift & { id: string }> };
  return page.items.find((shift) => shift.id === "cash-shift")!.varianceApprovalStatus;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("RIVET_AI_MODE", "fixture");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cash-difference investigation", () => {
  it("lists the recorded movement that matches the difference and prepares one bound approval", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-1");
    expect(run.status).toBe("completed");
    expect(run.results.map((ref) => ref.kind).sort()).toEqual(["artifact", "proposal"]);
    const artifact = await t.withIdentity({ subject: "clerk-cash-owner" }).query(api.domain.query, op("ai.artifact.get", { artifactId: run.results.find((ref) => ref.kind === "artifact")!.id })) as Artifact;
    expect(artifact.kind).toBe("cash_difference");
    expect(artifact.verification.verified).toBe(true);
    const candidates = artifact.sections.find((section) => section.key === "candidates")!.items;
    expect(candidates[0]!.message).toMatchObject({ key: "aiWork.cash.candidateNonCashPayment", params: { receipt: "R-0002", method: { enum: "paymentMethod", value: "card" }, amount: { amountMinor: 5_000, currency: "JOD" } } });
    expect(candidates.at(-1)!.message.key).toBe("aiWork.cash.personConfirms");

    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    expect(proposal).toMatchObject({ status: "pending", requiredPermissionKey: "reconciliation.approve_variance", allowed: { approve: true, reject: true } });
    expect(proposal!.changes[0]).toEqual({ field: "cashDifference", from: "pending", to: "approved" });
    expect(proposal!.changes[1]!.to).toContain("R-0002");
    // The drawer is untouched until a person approves.
    expect(await shiftStatus(t)).toBe("pending");
    // Managers hear that a decision is waiting; the requester gets the run notice instead.
    const notices = await t.run(async (ctx) => await ctx.db.query("operationalNotifications").collect());
    const managerId = await t.run(async (ctx) => (await ctx.db.query("users").collect()).find((user) => user.publicId === "cash-manager")!._id);
    expect(notices.filter((row) => row.kind === "ai_proposal").map((row) => row.recipientUserId)).toEqual([managerId]);
  });

  it("puts the waiting approval on the approver's Today list in place of the drawer's own item", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-today");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    type Today = { todayQueue: { items: Array<{ id: string; kind: string; href: string; title: string; detail: string; amount?: { amount: number } }> } };
    const today = async (subject: string) => (await t.withIdentity({ subject }).query(api.domain.query, op("dashboard", {})) as Today).todayQueue.items;
    const managerItems = await today("clerk-cash-manager");
    expect(managerItems.find((item) => item.id === `ai-proposal:${proposal!.id}`)).toMatchObject({ kind: "approval", href: `/payments/shifts?run=${run.id}`, title: "A prepared change is waiting for approval", detail: "Prepared by RIVET for cash-owner", amount: { amount: 5_000 } });
    // One item for one situation: the drawer's "check the difference" item gives way to the prepared approval.
    expect(managerItems.some((item) => item.id === "variance:cash-shift")).toBe(false);
    // Someone who cannot approve it never sees it there.
    expect((await today("clerk-cash-desk")).some((item) => item.id.startsWith("ai-proposal:"))).toBe(false);
    // With assistance off the approval cannot be shown, so the drawer's own item comes back.
    await t.withIdentity({ subject: "clerk-cash-owner" }).mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "off", expectedRevision: 1 }));
    expect((await today("clerk-cash-manager")).map((item) => item.id)).toContain("variance:cash-shift");
    await t.withIdentity({ subject: "clerk-cash-owner" }).mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "execute", expectedRevision: 2 }));
    await t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash }));
    const after = await today("clerk-cash-manager");
    expect(after.some((item) => item.id.startsWith("ai-proposal:") || item.id === "variance:cash-shift")).toBe(false);
  });

  it("approves through the existing review as the manager, with the prepared note as the reason", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-2");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    const decided = await t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash })) as Proposal;
    expect(decided).toMatchObject({ status: "executed", decidedByName: "cash-manager", allowed: { approve: false, reject: false } });
    expect(await shiftStatus(t)).toBe("approved");
    const audits = await t.run(async (ctx) => await ctx.db.query("auditEvents").collect());
    const review = audits.find((event) => event.action === "shift.variance.approved");
    expect(review?.reason).toContain("R-0002");
    expect(audits.some((event) => event.action === "ai.proposal.approve")).toBe(true);
    // Once decided it cannot be decided again.
    await expect(t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
  });

  it("invalidates the approval when a bound record changes after it was prepared", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-3");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    // Someone corrects the matched payment after RIVET prepared the approval.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").collect()).find((item) => item.publicId === "cash-pay-2")!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Record<string, unknown>), method: "cash" }, updatedAt: row.updatedAt + 1 });
    });
    const decided = await t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash })) as Proposal;
    expect(decided).toMatchObject({ status: "invalidated", invalidationReason: "source_changed" });
    expect(await shiftStatus(t)).toBe("pending");
  });

  it("invalidates it when another movement in the same shift changes the expected cash", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-3b");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    // The cash payment is not bound to the proposal, but voiding it changes what the drawer should hold.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").collect()).find((item) => item.publicId === "cash-pay-1")!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Record<string, unknown>), status: "voided" }, updatedAt: row.updatedAt + 1 });
    });
    const decided = await t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash })) as Proposal;
    expect(decided).toMatchObject({ status: "invalidated", invalidationReason: "source_changed" });
    expect(await shiftStatus(t)).toBe("pending");
  });

  it("refuses a changed changeset, an expired proposal and anyone without the approval access", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-4");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    await expect(t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: "not-what-was-shown" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    await expect(t.withIdentity({ subject: "clerk-cash-desk" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash }))).rejects.toMatchObject({ data: expect.objectContaining({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) }) });
    vi.setSystemTime(NOW.getTime() + 25 * 3_600_000);
    expect((await proposalsFor(t, "clerk-cash-manager", run.id))[0]!.status).toBe("expired");
    await expect(t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    expect(await shiftStatus(t)).toBe("pending");
  });

  it("never lets delegated work decide a proposal, even with the approval access on its grant", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-5");
    const [proposal] = await proposalsFor(t, "clerk-cash-owner", run.id);
    await expect(t.run(async (ctx) => {
      const request = delegatedRequest({ organizationId: ORG, activeBranchId: MAIN, correlationId: "cor-cash-agent" }, { userId: ids.owner, organizationId: ids.org, allowedPermissions: ["reconciliation.read", "reconciliation.approve_variance"], runPublicId: run.id, grantPublicId: "grant-cash", tool: "shift.propose_variance_review" });
      await executeDomainMutation(ctx, "ai.proposal.decide", { proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash }, request);
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    expect(await shiftStatus(t)).toBe("pending");
  });

  it("rejecting leaves the drawer for the ordinary review", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-6");
    const [proposal] = await proposalsFor(t, "clerk-cash-manager", run.id);
    const decided = await t.withIdentity({ subject: "clerk-cash-manager" }).mutation(api.domain.mutate, op("ai.proposal.decide", { proposalId: proposal!.id, decision: "reject", changesetHash: proposal!.changesetHash })) as Proposal;
    expect(decided.status).toBe("rejected");
    expect(await shiftStatus(t)).toBe("pending");
  });

  it("says plainly when nothing matches and prepares no approval", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { cardAmount: 4_000 });
    const run = await investigate(t, "clerk-cash-owner", "cash-shift", "cash-request-7");
    expect(run.status).toBe("completed");
    expect(run.results.map((ref) => ref.kind)).toEqual(["artifact"]);
    const artifact = await t.withIdentity({ subject: "clerk-cash-owner" }).query(api.domain.query, op("ai.artifact.get", { artifactId: run.results[0]!.id })) as Artifact;
    expect(artifact.sections.find((section) => section.key === "candidates")!.items.map((item) => item.message.key)).toEqual(["aiWork.cash.noMatch", "aiWork.cash.personConfirms"]);
    expect(await proposalsFor(t, "clerk-cash-owner", run.id)).toEqual([]);
  });

  it("does not investigate an open drawer and is refused to staff without reconciliation access", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const open = await investigate(t, "clerk-cash-owner", "cash-open", "cash-request-8");
    expect(open).toMatchObject({ status: "failed", errorCategory: "validation" });
    await expect(t.withIdentity({ subject: "clerk-cash-desk" }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "cash_difference", params: { shiftId: "cash-shift" }, requestKey: "cash-request-9" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });
});
