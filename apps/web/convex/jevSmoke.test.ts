// @vitest-environment node
import { expect, it, vi } from "vitest";
import { runJevSmokeChecks } from "../scripts/jev-smoke";
import { getJevQuestion } from "./jevQuestions";
import type { JevEvaluationOutcome } from "./jevAnswers";
const question = getJevQuestion("foundation.refund_detected")!;
const input = { question, state: question.fixture.state, timeoutMs: 100 };
const success = (cost?: number): JevEvaluationOutcome => ({ ok: true, judgment: { kind: "boolean", probability: 0.9 }, modelId: "typesafe-ai/jev", latencyMs: 1, warnings: [], reportedCostUsd: cost });
it.each([undefined, 0.001, NaN])("stops after the first unconfirmed zero-cost response (%s)", async (cost) => {
  const evaluate = vi.fn().mockResolvedValue(success(cost));
  await expect(runJevSmokeChecks([input, input, input], evaluate, () => true)).rejects.toThrow(/cost/);
  expect(evaluate).toHaveBeenCalledTimes(1);
});
it("stops on a failed evaluation without revealing provider detail", async () => {
  const evaluate = vi.fn().mockResolvedValue({ ok: false, detail: "private-provider-payload" });
  await expect(runJevSmokeChecks([input, input], evaluate, () => true)).rejects.toThrow("Live smoke evaluation failed; no further request was sent.");
  expect(evaluate).toHaveBeenCalledTimes(1);
});
it("checks eligibility again before each request", async () => {
  const evaluate = vi.fn().mockResolvedValue(success(0));
  const eligible = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
  await expect(runJevSmokeChecks([input, input], evaluate, eligible)).rejects.toThrow(/eligibility/);
  expect(evaluate).toHaveBeenCalledTimes(1);
});
it("makes no request when ineligible and completes only explicit zero-cost responses", async () => {
  const evaluate = vi.fn().mockResolvedValue(success(0));
  await expect(runJevSmokeChecks([input], evaluate, () => false)).rejects.toThrow(/eligibility/);
  expect(evaluate).not.toHaveBeenCalled();
  await expect(runJevSmokeChecks([input, input, input], evaluate, () => true)).resolves.toHaveLength(3);
});
