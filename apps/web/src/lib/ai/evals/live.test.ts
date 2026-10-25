import { describe, expect, it } from "vitest";
import { runFixtureTask, type ModelTask } from "../model";
import { runEvaluations } from "./harness";
import { runLiveEvaluation, type LiveCall } from "./live";

/** The live runner, checked without a provider: a stand-in call answers like the fixture reader. */
const config = { protocol: "anthropic_messages" as const, model: "claude-sonnet-5-5", timeoutMs: 8_000 };
const fixtureCall = (costMicros: number): LiveCall => async (task: ModelTask) => {
  const result = runFixtureTask(task);
  return { ...result, source: "live", usage: { inputTokens: 400, outputTokens: 60, costMicros }, latencyMs: 25 };
};

describe("live evaluation runner", () => {
  it("scores live answers exactly as the deterministic harness scores the same reader", async () => {
    const live = await runLiveEvaluation(fixtureCall(1_400), config);
    const deterministic = runEvaluations();
    for (const task of live.tasks) {
      const same = deterministic.tasks.find((item) => item.task === task.task)!;
      expect({ cases: task.cases, passed: task.passedCases, fields: task.fields, fabrications: task.fabrications }).toEqual({ cases: same.cases, passed: same.passedCases, fields: same.fields, fabrications: same.fabrications });
    }
    expect(live.live).toMatchObject({ answered: live.live.calls, failures: {}, stoppedAtCostLimit: false, latencyMs: { p50: 25, p95: 25 } });
    expect(live.live.costMicros).toBe(live.live.calls * 1_400);
  });

  it("stops calling at the spend limit, and a capped run cannot pass", async () => {
    let calls = 0;
    const report = await runLiveEvaluation(async (task) => { calls += 1; return fixtureCall(400_000)(task); }, config, { maxCostMicros: 1_000_000 });
    // No call starts once recorded spend reaches the limit; only calls already in flight (at most four) can pass it.
    expect(report.live.calls).toBe(calls);
    expect(report.live.costMicros).toBeGreaterThanOrEqual(1_000_000);
    expect(report.live.costMicros).toBeLessThan(1_000_000 + 4 * 400_000);
    expect(report.live.stoppedAtCostLimit).toBe(true);
    expect(report.meetsMinimums).toBe(false);
    expect(report.tasks.reduce((sum, task) => sum + (task.unanswered ?? 0), 0)).toBe(report.tasks.reduce((sum, task) => sum + task.cases, 0) - calls);
  });

  it("counts failed calls as unanswered, never as fabrications", async () => {
    const report = await runLiveEvaluation(async () => ({ ok: false, category: "model_timeout", promptVersion: "v", latencyMs: 8_000 }), config);
    expect(report.live.failures).toEqual({ model_timeout: report.live.calls });
    for (const task of report.tasks) {
      expect(task.fabrications).toBe(0);
      expect(task.unanswered).toBe(task.cases);
      expect(task.meetsMinimum).toBe(false);
    }
  });
});
