// @vitest-environment node
import type { Experimental_EvaluationModel } from "ai";
import { Experimental_EvaluationMockModelV4 as MockEvaluationModel } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { JEV_QUESTION_ID } from "./jevAnswers";
import { classifyJevError, isJevModelId, runJevEvaluation } from "./jevAdapter";
import { getJevQuestion } from "./jevQuestions";
import type { JevChoiceQuestion } from "./jevRegistry";

const refund = getJevQuestion("foundation.refund_detected")!;
const planFit = getJevQuestion("foundation.plan_fit") as JevChoiceQuestion;
const noteUrgency = getJevQuestion("foundation.note_urgency")!;

type EvaluationModelV4 = Exclude<Experimental_EvaluationModel, string>;
type DoEvaluate = EvaluationModelV4["doEvaluate"];
type EvaluateOptions = Parameters<DoEvaluate>[0];
/** Test doubles return loosely typed answers on purpose: the adapter must survive shapes the SDK types would never allow. */
type LooseEvaluate = (options: EvaluateOptions) => Promise<unknown>;

function jev(doEvaluate: LooseEvaluate, modelId = "typesafe-ai/jev") {
  return new MockEvaluationModel({ provider: "typesafe-ai", modelId, supportedQuestionTypes: ["choice", "score", "boolean"], doEvaluate: doEvaluate as unknown as DoEvaluate });
}

const metadata = (extra: Record<string, unknown> = {}) => ({
  gateway: { cost: "0.00001155", routing: { resolvedProvider: "typesafe-ai" }, ...extra },
  typesafe: { confidence: { [JEV_QUESTION_ID]: 0.9 } },
});

describe("runJevEvaluation", () => {
  it("sends one bounded question, restricts the gateway to TypeSafe and returns a validated judgment", async () => {
    const doEvaluate = vi.fn(async (_options: EvaluateOptions) => ({ answers: { [JEV_QUESTION_ID]: { type: "boolean" as const, probability: 0.97 } }, warnings: [], usage: { inputTokens: 120, outputTokens: 0 }, providerMetadata: metadata(), response: { modelId: "typesafe-ai/jev" } }));
    const outcome = await runJevEvaluation({ question: refund, state: refund.fixture.state, timeoutMs: 2_000, model: jev(doEvaluate) });
    expect(outcome).toEqual({ ok: true, judgment: { kind: "boolean", probability: 0.97, confidence: 0.9 }, modelId: "typesafe-ai/jev", modelVersion: "typesafe-ai/jev", inputTokens: 120, outputTokens: 0, reportedCostUsd: 0.00001155, latencyMs: expect.any(Number), warnings: [] });
    const options = doEvaluate.mock.calls[0]![0];
    expect(Object.keys(options.questions)).toEqual([JEV_QUESTION_ID]);
    expect(options.questions[JEV_QUESTION_ID]).toMatchObject({ type: "boolean", instructions: refund.instructions });
    expect(options.providerOptions).toEqual({ gateway: { only: ["typesafe-ai"] } });
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(options.state).toBe(refund.fixture.state);
  });

  it("scopes candidates so the model only ever sees option keys, and maps the choice back", async () => {
    const doEvaluate = vi.fn(async (_options: EvaluateOptions) => ({ answers: { [JEV_QUESTION_ID]: { type: "choice" as const, choice: "option_02", probabilities: { option_01: 0.05, option_02: 0.86, option_03: 0.09 } } }, warnings: [], providerMetadata: metadata(), response: { modelId: "typesafe-ai/jev" } }));
    const outcome = await runJevEvaluation({ question: planFit, state: planFit.fixture.state, candidates: planFit.fixture.candidates, timeoutMs: 2_000, model: jev(doEvaluate) });
    expect(outcome).toMatchObject({ ok: true, judgment: { kind: "choice", choice: "plan_b", probabilities: { plan_a: 0.05, plan_b: 0.86, plan_c: 0.09 } } });
    expect(JSON.stringify(doEvaluate.mock.calls[0]![0].questions)).not.toContain("plan_b");
  });

  it("asks for zero data retention only when configured", async () => {
    const doEvaluate = vi.fn(async (_options: EvaluateOptions) => ({ answers: { [JEV_QUESTION_ID]: { type: "score" as const, score: 2.9, probabilities: { "0": 0, "1": 0.01, "2": 0.08, "3": 0.91 } } }, warnings: [], providerMetadata: metadata(), response: { modelId: "typesafe-ai/jev" } }));
    const outcome = await runJevEvaluation({ question: noteUrgency, state: noteUrgency.fixture.state, timeoutMs: 2_000, zeroDataRetention: true, model: jev(doEvaluate) });
    expect(outcome).toMatchObject({ ok: true, judgment: { kind: "score", level: 3, levelCount: 4 } });
    expect(doEvaluate.mock.calls[0]![0].providerOptions).toEqual({ gateway: { only: ["typesafe-ai"], zeroDataRetention: true } });
  });

  it("rejects an answer that names an option it was not offered", async () => {
    const outcome = await runJevEvaluation({ question: planFit, state: planFit.fixture.state, candidates: planFit.fixture.candidates, timeoutMs: 2_000, model: jev(async () => ({ answers: { [JEV_QUESTION_ID]: { type: "choice", choice: "option_09" } }, warnings: [], providerMetadata: metadata(), response: { modelId: "typesafe-ai/jev" } })) });
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: false, reason: "invalid_output", retryable: false });
  });

  it("discards an answer served by any model other than Jev", async () => {
    const outcome = await runJevEvaluation({ question: refund, state: refund.fixture.state, timeoutMs: 2_000, model: jev(async () => ({ answers: { [JEV_QUESTION_ID]: { type: "boolean", probability: 0.9 } }, warnings: [], providerMetadata: metadata({ routing: { resolvedProvider: "openai" } }), response: { modelId: "openai/gpt-5.6" } }), "openai/gpt-5.6") });
    expect(outcome).toMatchObject({ ok: false, reason: "unexpected_model" });
  });

  it("keeps the gateway's usage and cost on an answer it rejects, so a billed failure still counts", async () => {
    // The gateway served (and may have billed) a response that RIVET then discards because another provider answered.
    const outcome = await runJevEvaluation({ question: refund, state: refund.fixture.state, timeoutMs: 2_000, model: jev(async () => ({ answers: { [JEV_QUESTION_ID]: { type: "boolean", probability: 0.9 } }, warnings: [], usage: { inputTokens: 80, outputTokens: 0 }, providerMetadata: metadata({ routing: { resolvedProvider: "openai" } }), response: { modelId: "typesafe-ai/jev" } })) });
    expect(outcome).toMatchObject({ ok: false, reason: "unexpected_model", inputTokens: 80, outputTokens: 0, reportedCostUsd: 0.00001155 });
    expect((outcome as { detail?: string }).detail).toMatch(/via openai/);
  });

  it("accepts only Jev's own model ids", () => {
    expect(isJevModelId("typesafe-ai/jev")).toBe(true);
    expect(isJevModelId("jev")).toBe(true);
    expect(isJevModelId("typesafe-ai/jev-1")).toBe(true);
    expect(isJevModelId("openai/gpt-4o")).toBe(false);
    expect(isJevModelId("some-vendor/jevelin")).toBe(false);
    expect(isJevModelId("jevelin")).toBe(false);
  });

  it("times out through the abort signal and reports it as retryable", async () => {
    const outcome = await runJevEvaluation({
      question: refund,
      state: refund.fixture.state,
      timeoutMs: 1_000,
      model: jev((options: EvaluateOptions) => new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })),
    });
    expect(outcome).toMatchObject({ ok: false, reason: "timeout", retryable: true });
    expect((outcome as { latencyMs: number }).latencyMs).toBeGreaterThanOrEqual(900);
  }, 10_000);

  it("classifies gateway and transport failures without exposing their text", async () => {
    const outcome = await runJevEvaluation({ question: refund, state: refund.fixture.state, timeoutMs: 2_000, model: jev(async () => { throw Object.assign(new Error("secret response body"), { name: "GatewayRateLimitError", statusCode: 429 }); }) });
    expect(outcome).toMatchObject({ ok: false, reason: "rate_limited", retryable: true });
    expect(JSON.stringify(outcome)).not.toContain("secret response body");
    expect(classifyJevError(Object.assign(new Error("x"), { statusCode: 402 }), false, 1000)).toMatchObject({ reason: "payment_required", retryable: false });
    expect(classifyJevError(Object.assign(new Error("x"), { name: "GatewayAuthenticationError", statusCode: 401 }), false, 1000)).toMatchObject({ reason: "auth_error" });
    expect(classifyJevError(Object.assign(new Error("x"), { statusCode: 403 }), false, 1000)).toMatchObject({ reason: "auth_error" });
    expect(classifyJevError(Object.assign(new Error("x"), { name: "InvalidResponseDataError" }), false, 1000)).toMatchObject({ reason: "invalid_output" });
    expect(classifyJevError(new TypeError("fetch failed"), false, 1000)).toMatchObject({ reason: "provider_error", retryable: true });
  });
});

it("disables SDK retries so each outbound attempt requires a new guarded request", async () => {
  let calls = 0;
  const result = await runJevEvaluation({
    question: refund, state: refund.fixture.state, timeoutMs: 100,
    evaluate: async (options) => {
      calls += 1;
      expect(options.maxRetries).toBe(0);
      throw new Error("simulated transport failure");
    },
  });
  expect(calls).toBe(1);
  expect(result.ok).toBe(false);
});
