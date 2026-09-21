// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runJevEvaluation } from "./jevAdapter";
import { getJevQuestion } from "./jevQuestions";
import { resolveJevMode } from "./jevMode";
import type { JevChoiceQuestion } from "./jevRegistry";

/**
 * Live connectivity smoke against Vercel AI Gateway with the synthetic
 * foundation fixtures only. It runs solely when an operator opts in with
 * RIVET_JEV_LIVE_SMOKE=1, a securely configured AI_GATEWAY_API_KEY is present
 * in the shell, and RIVET_JEV_FREE_UNTIL confirms zero-cost terms for today.
 * It never runs in CI, never sends gym data, and prints only token usage and
 * the reported cost. A reported cost above zero fails the run: that is the
 * signal to stop live use and re-check the account.
 *
 *   RIVET_JEV_LIVE_SMOKE=1 RIVET_JEV_FREE_UNTIL=YYYY-MM-DD pnpm --filter web exec vitest run convex/jev.smoke.live.test.ts
 */
const resolution = resolveJevMode(process.env);
const optedIn = process.env.RIVET_JEV_LIVE_SMOKE === "1";
const eligible = optedIn && resolution.keyConfigured && resolution.freeTerms === "confirmed";
const skipReason = !optedIn
  ? "RIVET_JEV_LIVE_SMOKE is not 1"
  : !resolution.keyConfigured
    ? "AI_GATEWAY_API_KEY is not configured in this shell"
    : `free terms are ${resolution.freeTerms} (RIVET_JEV_FREE_UNTIL)`;

describe.skipIf(!eligible)(`live Jev smoke (skipped: ${skipReason})`, () => {
  it("answers the synthetic boolean, candidate and score fixtures at zero reported cost", async () => {
    const refund = getJevQuestion("foundation.refund_detected")!;
    const planFit = getJevQuestion("foundation.plan_fit") as JevChoiceQuestion;
    const urgency = getJevQuestion("foundation.note_urgency")!;
    const outcomes = [
      await runJevEvaluation({ question: refund, state: refund.fixture.state, timeoutMs: 15_000 }),
      await runJevEvaluation({ question: planFit, state: planFit.fixture.state, candidates: planFit.fixture.candidates, timeoutMs: 15_000 }),
      await runJevEvaluation({ question: urgency, state: urgency.fixture.state, timeoutMs: 15_000 }),
    ];
    for (const outcome of outcomes) {
      expect(outcome.ok, JSON.stringify(outcome)).toBe(true);
      if (!outcome.ok) continue;
      console.info("[jev.smoke]", JSON.stringify({ kind: outcome.judgment.kind, modelVersion: outcome.modelVersion, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, reportedCostUsd: outcome.reportedCostUsd, latencyMs: outcome.latencyMs }));
      expect(outcome.reportedCostUsd ?? 0, "a reported cost means the account is being billed; stop live use").toBe(0);
    }
    const [refundOutcome, planOutcome, urgencyOutcome] = outcomes;
    if (refundOutcome?.ok && refundOutcome.judgment.kind === "boolean") expect(refundOutcome.judgment.probability).toBeGreaterThan(0.5);
    if (planOutcome?.ok && planOutcome.judgment.kind === "choice") expect(["plan_a", "plan_b", "plan_c"]).toContain(planOutcome.judgment.choice);
    if (urgencyOutcome?.ok && urgencyOutcome.judgment.kind === "score") expect(urgencyOutcome.judgment.levelCount).toBe(4);
  }, 60_000);
});
