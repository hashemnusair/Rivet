import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { adapterConfig } from "./aiPolicy";
import { callModel } from "./aiModelCall";
import { LIVE_EVAL_DEFAULT_MAX_COST_MICROS, runLiveEvaluation, type LiveEvalReport } from "../src/lib/ai/evals/live";
import { NOTE_CASES_V2, NOTE_CASES_V2_MIXED } from "../src/lib/ai/evals/cases";
import type { AiAdapterMode, AiErrorCategory } from "../src/lib/ai/contracts";

/**
 * The live provider evaluation (AI-5.2) run inside the deployment, where the
 * key lives. It sends only the held-out evaluation cases (written for the
 * evaluation, no gym's data) through the same model call and adapter
 * configuration staff use, and scores them with the deterministic harness.
 *
 * Internal: no page or browser can call it; someone with access to the
 * deployment runs it with `npx convex run aiEvaluation:runLive`. Spend stops at
 * the evaluation's own limit ($1 by default, never above $5); it is not
 * charged to any gym's monthly budget. The result carries scores, counts,
 * timings and cost only: never the key, the prompts or the case notes.
 */

/** The most one evaluation run may spend, in micro-dollars, whatever is asked. */
export const LIVE_EVAL_MAX_COST_CEILING_MICROS = 5_000_000;

export type ServerLiveEvalResult =
  | { ran: false; mode: AiAdapterMode; reason: AiErrorCategory }
  | { ran: true; report: LiveEvalReport };

const NOTE_TEXTS = [...NOTE_CASES_V2, ...NOTE_CASES_V2_MIXED].map((item) => item.note);

/** Failure details describe fields and values; anything that repeats a case note is withheld. */
function withoutNoteText(report: LiveEvalReport): LiveEvalReport {
  const scrub = (detail: string) => (NOTE_TEXTS.some((note) => detail.includes(note)) ? "detail withheld" : detail);
  return {
    ...report,
    tasks: report.tasks.map((task) => ({ ...task, failures: task.failures.map((failure) => ({ id: failure.id, detail: scrub(failure.detail) })) })),
    development: [],
  };
}

export const runLive = internalAction({
  args: { maxCostMicros: v.optional(v.number()) },
  handler: async (_ctx, args): Promise<ServerLiveEvalResult> => {
    const config = adapterConfig();
    // Only an approved, fully configured live provider is evaluated; nothing is sent otherwise.
    if (config.mode !== "live" || !config.ready) return { ran: false, mode: config.mode, reason: config.mode === "off" ? "ai_off" : config.reason ?? "model_unavailable" };
    const requested = Number.isFinite(args.maxCostMicros) && (args.maxCostMicros ?? 0) > 0 ? Math.floor(args.maxCostMicros!) : LIVE_EVAL_DEFAULT_MAX_COST_MICROS;
    const maxCostMicros = Math.min(requested, LIVE_EVAL_MAX_COST_CEILING_MICROS);
    const report = await runLiveEvaluation((task) => callModel(task, config), config, { maxCostMicros });
    return { ran: true, report: withoutNoteText(report) };
  },
});
