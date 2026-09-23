import type { JevEvaluationInput } from "../convex/jevAdapter";
import type { JevEvaluationOutcome } from "../convex/jevAnswers";

/** Stop before the next request unless the preceding response explicitly cost zero. */
export async function runJevSmokeChecks(
  inputs: readonly JevEvaluationInput[],
  evaluate: (input: JevEvaluationInput) => Promise<JevEvaluationOutcome>,
  eligible: () => boolean,
): Promise<Array<Extract<JevEvaluationOutcome, { ok: true }>>> {
  const outcomes: Array<Extract<JevEvaluationOutcome, { ok: true }>> = [];
  for (const input of inputs) {
    if (!eligible()) throw new Error("Live smoke eligibility is not confirmed; no further request was sent.");
    const outcome = await evaluate(input);
    // Generic failures only: provider payloads may contain sensitive context.
    if (!outcome.ok) throw new Error("Live smoke evaluation failed; no further request was sent.");
    if (outcome.reportedCostUsd === undefined) throw new Error("Live smoke cost is unknown; no further request was sent.");
    if (outcome.reportedCostUsd !== 0) throw new Error("Live smoke did not report zero cost; no further request was sent.");
    outcomes.push(outcome);
  }
  return outcomes;
}
