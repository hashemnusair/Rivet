import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRunView } from "@/lib/ai/contracts";
import { MockGymOSApi } from "./MockGymOSApi";
import type { MockDb } from "./store";

/**
 * The preview adapter simulates RIVET assistance with the same shared
 * decision code as Convex. These tests pin its meaningful states and
 * consequences; they are not evidence about the real backend, which has its
 * own tests in convex/ai.delegation.test.ts.
 */
let api: MockGymOSApi;

beforeEach(async () => {
  window.sessionStorage.clear();
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

afterEach(async () => {
  await api.resetDemo();
});

/** A platform admin makes the preview gym available first; until then its owner cannot turn assistance on. */
async function makeAvailable(): Promise<void> {
  const session = await api.getSession();
  await api.setPlatformAiAvailability({ organizationId: session.organization.id, available: true, reason: "Test gym" });
}

async function enable(mode: "prepare" | "execute" = "execute"): Promise<void> {
  await makeAvailable();
  const settings = await api.getAiSettings();
  await api.updateAiSettings({ tenantMode: mode, expectedRevision: settings.revision });
}

async function settled(runId: string): Promise<AiRunView> {
  let run = await api.getAiRun(runId);
  await vi.waitFor(async () => {
    run = await api.getAiRun(runId);
    expect(["completed", "partially_completed", "failed", "cancelled"]).toContain(run.status);
  }, { timeout: 5_000, interval: 5 });
  return run;
}

describe("preview assistance", () => {
  it("starts off, and preparation mode cannot create records", async () => {
    expect((await api.getAiSettings()).tenantMode).toBe("off");
    await expect(api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0001" })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
    await enable("prepare");
    await expect(api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0002" })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
  });

  it("keeps assistance off until RIVET makes the gym available, and removing it stops running work", async () => {
    expect(await api.getAiSettings()).toMatchObject({ platformAvailable: false, tenantMode: "off" });
    let settings = await api.getAiSettings();
    await expect(api.updateAiSettings({ tenantMode: "prepare", expectedRevision: settings.revision })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
    await expect(api.updateAiSettings({ externalProcessing: true, expectedRevision: settings.revision })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
    const session = await api.getSession();
    await expect(api.setPlatformAiAvailability({ organizationId: session.organization.id, available: true, reason: " " })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await api.setPlatformAiAvailability({ organizationId: session.organization.id, available: true, reason: "Pilot gym" })).toMatchObject({ available: true, reason: "Pilot gym" });
    settings = await api.getAiSettings();
    await api.updateAiSettings({ tenantMode: "execute", expectedRevision: settings.revision });
    api.setBehavior({ latencyMs: 1 });
    const started = await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-availability" });
    await api.setPlatformAiAvailability({ organizationId: session.organization.id, available: false, reason: "Incident drill" });
    expect((await settled(started.id)).status).toBe("cancelled");
    // The gym's own choice is kept, but nothing can run and the settings say why.
    expect(await api.getAiSettings()).toMatchObject({ platformAvailable: false, tenantMode: "execute" });
    expect((await api.getAiSettings()).capabilities.every((item) => !item.available)).toBe(true);
    await expect(api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-availability-2" })).rejects.toMatchObject({ code: "FEATURE_NOT_AVAILABLE" });
  });

  it("prepares follow-ups, verifies saved tasks and never duplicates them", async () => {
    await enable();
    const started = await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0003" });
    expect((await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0003" })).id).toBe(started.id);
    const run = await settled(started.id);
    expect(run.status).toBe("completed");
    expect(run.counts.considered).toBeGreaterThan(0);
    expect(run.counts.created).toBeGreaterThan(0);
    expect(run.counts.created + run.counts.linked + run.counts.skipped).toBe(run.steps.length);
    const tasks = (await api.listTasks({ status: "open", pageSize: 500 })).items;
    for (const result of run.results) expect(tasks.some((task) => task.id === result.id)).toBe(true);
    const created = tasks.filter((task) => task.origin?.runId === run.id);
    expect(created).toHaveLength(run.counts.created);
    const second = await settled((await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0004" })).id);
    expect(second.counts.created).toBe(0);
    expect((await api.listTasks({ status: "open", pageSize: 500 })).items.filter((task) => task.origin)).toHaveLength(run.counts.created);
  });

  it("stops pending writes when the person's role loses the access", async () => {
    await enable();
    // Keep the simulated step delay so the role changes before the first step runs.
    api.setBehavior({ latencyMs: 1 });
    const started = await api.startAiRun({ playbook: "renewal_followups", params: { bucket: "expiring" }, requestKey: "request-0005" });
    await api.switchDemoRole("receptionist");
    const run = await settled(started.id);
    expect(run).toMatchObject({ status: "failed", errorCategory: "authority_revoked" });
    expect(run.counts.created).toBe(0);
  });

  it("records bounded staff statements and shows them in the member brief", async () => {
    await enable();
    const members = await api.listMembers({ status: "active", pageSize: 5 });
    const member = members.items[0]!;
    const session = await api.getSession();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.organization.timezone }).format(new Date());
    const until = new Date(Date.parse(`${today}T12:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    await api.recordMemberMemory({ memberId: member.id, topic: "travel", effectiveUntil: until, text: "Travelling" });
    const brief = await api.getMemberBrief(member.id);
    expect(brief.available).toBe(true);
    if (brief.available) expect(brief.brief.activeStatements.map((statement) => statement.effectiveUntil)).toEqual([until]);
    await expect(api.recordMemberMemory({ memberId: member.id, topic: "travel", effectiveUntil: "2099-01-01" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("reads a note into fields with the fixture reader and labels the source", async () => {
    await enable();
    const member = (await api.listMembers({ status: "active", pageSize: 1 })).items[0]!;
    const result = await api.extractContactNote({ memberId: member.id, note: "No answer, try again tomorrow evening" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extraction.outcome?.value).toBe("no_answer");
      expect(result.extraction.followUp?.value.time).toBe("18:00");
      expect(result.extraction.source).toBe("fixture");
    }
  });
});

describe("preview report and handover jobs", () => {
  it("saves a report artifact with checked totals and a handover the next person can read", async () => {
    await enable();
    const session = await api.getSession();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.organization.timezone }).format(new Date());
    const report = await settled((await api.startAiRun({ playbook: "management_report", params: { from: `${today.slice(0, 8)}01`, to: today, includeExport: true }, requestKey: "report-preview-1" })).id);
    expect(report.status).toBe("completed");
    const artifactRef = report.results.find((ref) => ref.kind === "artifact")!;
    const artifact = await api.getAiArtifact(artifactRef.id);
    expect(artifact.kind).toBe("management_report");
    expect(artifact.verification.verified).toBe(true);
    expect(report.results.some((ref) => ref.kind === "export")).toBe(true);
    const branchId = session.activeBranchId ?? session.branches[0]!.id;
    const handover = await settled((await api.startAiRun({ playbook: "shift_handover", branchId, params: {}, requestKey: "handover-preview-1" })).id);
    expect(handover.status).toBe("completed");
    const handoverArtifact = await api.getAiArtifact(handover.results[0]!.id);
    expect(handoverArtifact.sections.map((section) => section.key)).toEqual(expect.arrayContaining(["checks", "followUps"]));
    await api.switchDemoRole("trainer");
    await expect(api.getAiArtifact(artifactRef.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("preview cash-difference investigation", () => {
  /** A closed drawer 4.250 over, with one card payment of exactly that amount in the shift. */
  function seedOverDrawer(suffix = ""): { shiftId: string } {
    const db = (api as unknown as { db: MockDb }).db;
    const branchId = db.branches[0]!.id;
    const member = db.members[0]!;
    const shiftId = `preview-cash-shift${suffix}`;
    const payment = (id: string, method: "cash" | "card", amount: number) => ({ id, organizationId: db.organization.id, branchId, memberId: member.id, type: "payment" as const, amount: { amount, currency: db.organization.currency }, method, status: "completed" as const, receiptId: `${id}-receipt`, receiptNumber: id.toUpperCase(), collectedById: db.users[0]!.id, collectedByName: db.users[0]!.name, shiftId, idempotencyKey: id, occurredAt: "2026-10-22T08:00:00.000Z" });
    db.payments.push(payment(`pv-cash${suffix}`, "cash", 20_000), payment(`pv-card${suffix}`, "card", 4_250));
    db.shifts.push({ id: shiftId, organizationId: db.organization.id, branchId, openedById: db.users[0]!.id, openedByName: db.users[0]!.name, openedAt: "2026-10-22T05:00:00.000Z", openingFloat: { amount: 10_000, currency: db.organization.currency }, closedAt: "2026-10-22T17:00:00.000Z", closedById: db.users[0]!.id, expectedCash: { amount: 30_000, currency: db.organization.currency }, countedCash: { amount: 34_250, currency: db.organization.currency }, variance: { amount: 4_250, currency: db.organization.currency }, varianceExplanation: "Counted twice", varianceApprovalStatus: "pending", status: "closed" });
    return { shiftId };
  }

  it("approves several prepared changes in one run in one step, rechecking each and reporting what happened", async () => {
    await enable();
    const first = seedOverDrawer();
    const second = seedOverDrawer("-2");
    const runA = await settled((await api.startAiRun({ playbook: "cash_difference", params: { shiftId: first.shiftId }, requestKey: "cash-group-a" })).id);
    const runB = await settled((await api.startAiRun({ playbook: "cash_difference", params: { shiftId: second.shiftId }, requestKey: "cash-group-b" })).id);
    // Group the second drawer's prepared approval under the first run.
    for (const proposal of (api as unknown as { ai: { proposals: Map<string, { runId: string }> } }).ai.proposals.values()) if (proposal.runId === runB.id) proposal.runId = runA.id;
    const proposals = await api.listAiProposals({ runId: runA.id });
    expect(proposals).toHaveLength(2);
    (api as unknown as { db: MockDb }).db.payments.find((item) => item.id === "pv-card-2")!.method = "cash";
    const result = await api.approveAiProposals({ runId: runA.id, proposals: proposals.map((item) => ({ proposalId: item.id, changesetHash: item.changesetHash })) });
    expect(result.approved).toBe(1);
    expect(result.results.map((item) => item.outcome).sort()).toEqual(["approved", "no_longer_matched"]);
    const shifts = (await api.listCashShifts({ pageSize: 200 })).items;
    expect(shifts.find((shift) => shift.id === first.shiftId)?.varianceApprovalStatus).toBe("approved");
    expect(shifts.find((shift) => shift.id === second.shiftId)?.varianceApprovalStatus).toBe("pending");
    const again = await api.approveAiProposals({ runId: runA.id, proposals: proposals.map((item) => ({ proposalId: item.id, changesetHash: item.changesetHash })) });
    expect(again.results.map((item) => item.outcome)).toEqual(["already_decided", "already_decided"]);
  });

  it("prepares a bound approval that a manager approves through the usual review", async () => {
    await enable();
    const { shiftId } = seedOverDrawer();
    const run = await settled((await api.startAiRun({ playbook: "cash_difference", params: { shiftId }, requestKey: "cash-preview-1" })).id);
    expect(run.status).toBe("completed");
    expect(run.results.map((ref) => ref.kind)).toEqual(["artifact", "proposal"]);
    const [proposal] = await api.listAiProposals({ runId: run.id });
    expect(proposal).toMatchObject({ status: "pending", allowed: { approve: true, reject: true } });
    // It waits on the approver's Today list, in place of the drawer's own item.
    const day = new Date().toISOString().slice(0, 10);
    const today = async () => (await api.getDashboard({ from: day, to: day })).todayQueue!.items;
    expect((await today()).find((item) => item.id === `ai-proposal:${proposal!.id}`)).toMatchObject({ kind: "approval", href: `/payments/shifts?run=${run.id}` });
    expect((await today()).some((item) => item.id === `variance:${shiftId}`)).toBe(false);
    const decided = await api.decideAiProposal({ proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash });
    expect(decided.status).toBe("executed");
    expect((await today()).some((item) => item.id.startsWith("ai-proposal:"))).toBe(false);
    const shifts = await api.listCashShifts({ pageSize: 200 });
    expect(shifts.items.find((shift) => shift.id === shiftId)?.varianceApprovalStatus).toBe("approved");
  });

  it("invalidates the approval when the matched payment changes, and refuses staff without approval access", async () => {
    await enable();
    const { shiftId } = seedOverDrawer();
    const run = await settled((await api.startAiRun({ playbook: "cash_difference", params: { shiftId }, requestKey: "cash-preview-2" })).id);
    const [proposal] = await api.listAiProposals({ runId: run.id });
    const db = (api as unknown as { db: MockDb }).db;
    db.payments.find((item) => item.id === "pv-card")!.method = "cash";
    const decided = await api.decideAiProposal({ proposalId: proposal!.id, decision: "approve", changesetHash: proposal!.changesetHash });
    expect(decided).toMatchObject({ status: "invalidated", invalidationReason: "source_changed" });
    expect((await api.listCashShifts({ pageSize: 200 })).items.find((shift) => shift.id === shiftId)?.varianceApprovalStatus).toBe("pending");
    await api.switchDemoRole("receptionist");
    await expect(api.startAiRun({ playbook: "cash_difference", params: { shiftId }, requestKey: "cash-preview-3" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("preview lead follow-ups", () => {
  it("prepares call tasks for leads due today without duplicating them", async () => {
    await enable();
    const first = await settled((await api.startAiRun({ playbook: "sales_followups", params: {}, requestKey: "sales-preview-1" })).id);
    expect(first.status).toBe("completed");
    expect(first.counts.created + first.counts.linked).toBeGreaterThan(0);
    const created = (await api.listTasks({ status: "open", pageSize: 200 })).items.filter((task) => task.origin?.runId === first.id);
    expect(created.length).toBe(first.counts.created);
    expect(created.every((task) => task.leadId && task.title.startsWith("Follow up with "))).toBe(true);
    const again = await settled((await api.startAiRun({ playbook: "sales_followups", params: {}, requestKey: "sales-preview-2" })).id);
    expect(again.counts.created).toBe(0);
  });
});
