import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRunView } from "@/lib/ai/contracts";
import { MockGymOSApi } from "./MockGymOSApi";

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

async function enable(mode: "prepare" | "execute" = "execute"): Promise<void> {
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
