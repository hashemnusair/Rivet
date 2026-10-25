// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { callModel } from "../../../../convex/aiModelCall";
import { resolveAdapterConfig } from "../model";
import { formatReport } from "./harness";
import { formatLiveSummary, LIVE_EVAL_DEFAULT_MAX_COST_MICROS, runLiveEvaluation } from "./live";

/**
 * The live provider evaluation, run only by `pnpm ai:eval:live` and never in
 * CI: it spends money. The key comes from `RIVET_AI_API_KEY`, either in the
 * shell or in the git-ignored `apps/web/.env.ai-eval.local`; it is read by the
 * model call and never printed or written. Defaults: the native Claude
 * protocol and Claude Sonnet 5.5, a $1 spend limit, and the production
 * timeout, so the figures describe what staff would see.
 */
const LIVE = process.env.RIVET_AI_LIVE_EVAL === "1";

describe.skipIf(!LIVE)("assistance evaluation (live model, held-out)", () => {
  it("meets every reader minimum through the real model call, within the spend limit", async () => {
    try {
      process.loadEnvFile(".env.ai-eval.local");
    } catch {
      // No file: the key may already be in the shell.
    }
    const config = resolveAdapterConfig({
      ...process.env,
      RIVET_AI_MODE: "live",
      RIVET_AI_PROTOCOL: process.env.RIVET_AI_PROTOCOL || "anthropic_messages",
      RIVET_AI_MODEL: process.env.RIVET_AI_MODEL || "claude-sonnet-5-5",
    });
    expect(config.hasKey, "RIVET_AI_API_KEY is set (shell or apps/web/.env.ai-eval.local)").toBe(true);
    expect(config.ready, "the live model is configured: protocol, model with a known price, https base URL").toBe(true);
    const maxCostMicros = Number(process.env.RIVET_AI_EVAL_MAX_COST_MICROS) || LIVE_EVAL_DEFAULT_MAX_COST_MICROS;
    const report = await runLiveEvaluation((task) => callModel(task, config), config, { maxCostMicros });
    const target = process.env.AI_EVAL_REPORT || "test-results/ai-eval/live-report.json";
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${formatReport(report)}\n${formatLiveSummary(report)}\nReport: ${target}`);
    expect(report.live.stoppedAtCostLimit, "finished within the spend limit").toBe(false);
    for (const task of report.tasks) {
      expect(task.fabrications, `${task.task} fabrications`).toBe(0);
      expect(task.meetsMinimum, `${task.task} minimum`).toBe(true);
    }
  }, 15 * 60_000);
});
