import type { AssistJudgment } from "@/lib/domain/types";
import { getJevQuestion } from "../../../convex/jevQuestions";

/**
 * Reading a judgment for people. A judgment is a distribution, not a verdict:
 * these helpers turn it into a label, a confidence band and a sentence, and
 * leave the decision about what to do with it to the feature.
 */
export interface ConfidenceBand {
  label: "High confidence" | "Medium confidence" | "Low confidence";
  tone: "success" | "warning" | "neutral";
  value: number;
}

/** How decisive the answer is on its own terms, in [0, 1]. */
export function judgmentStrength(judgment: AssistJudgment): number {
  if (judgment.kind === "boolean") return Math.abs(judgment.probability - 0.5) * 2;
  if (judgment.kind === "choice") return judgment.probabilities[judgment.choice] ?? 0;
  return judgment.probabilities[String(judgment.level)] ?? 0;
}

/**
 * The model's own confidence when the gateway reports one, otherwise the
 * decisiveness of the distribution. Thresholds follow the vendor guidance:
 * read-only surfaces can act around 0.7, anything consequential closer to 0.9.
 */
export function confidenceBand(judgment: AssistJudgment): ConfidenceBand {
  const value = judgment.confidence ?? judgmentStrength(judgment);
  if (value >= 0.85) return { label: "High confidence", tone: "success", value };
  if (value >= 0.6) return { label: "Medium confidence", tone: "warning", value };
  return { label: "Low confidence", tone: "neutral", value };
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Plain-language summary, using the registered question's wording when it exists. */
export function describeJudgment(questionKey: string, judgment: AssistJudgment): string {
  const question = getJevQuestion(questionKey);
  if (judgment.kind === "boolean") {
    const yes = judgment.probability >= 0.5;
    return `${yes ? "Likely yes" : "Likely no"} (${percent(yes ? judgment.probability : 1 - judgment.probability)})`;
  }
  if (judgment.kind === "choice") {
    const description = question?.kind === "choice" && question.options ? question.options[judgment.choice] : undefined;
    return `${description ? `${judgment.choice}: ${description}` : judgment.choice} (${percent(judgment.probabilities[judgment.choice] ?? 0)})`;
  }
  const levels = question?.kind === "score" ? question.levels : undefined;
  const label = levels?.[judgment.level] ?? `Level ${judgment.level + 1} of ${judgment.levelCount}`;
  return `${label} (score ${judgment.score.toFixed(2)} of ${judgment.levelCount - 1})`;
}

/** The distribution behind the answer, largest first, for a compact list. */
export function judgmentDistribution(questionKey: string, judgment: AssistJudgment): Array<{ key: string; label: string; probability: number }> {
  const question = getJevQuestion(questionKey);
  if (judgment.kind === "boolean") {
    return [
      { key: "true", label: "Yes", probability: judgment.probability },
      { key: "false", label: "No", probability: 1 - judgment.probability },
    ].sort((left, right) => right.probability - left.probability);
  }
  const labelFor = (key: string): string => {
    if (judgment.kind === "score") return (question?.kind === "score" ? question.levels[Number(key)] : undefined) ?? `Level ${Number(key) + 1}`;
    return (question?.kind === "choice" && question.options ? question.options[key] : undefined) ?? key;
  };
  return Object.entries(judgment.probabilities)
    .map(([key, probability]) => ({ key, label: labelFor(key), probability }))
    .sort((left, right) => right.probability - left.probability);
}
