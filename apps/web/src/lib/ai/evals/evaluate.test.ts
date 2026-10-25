import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { formatReport, runEvaluations } from "./harness";

/**
 * The deterministic assistance evaluation, run in CI with the unit tests and
 * on its own with `pnpm ai:eval`, which also writes the JSON report. Only the
 * held-out set gates; the development set is reported for comparison.
 */
describe("assistance evaluation (deterministic, held-out)", () => {
  it("meets every release minimum with no fabricated values", () => {
    const report = runEvaluations();
    const target = process.env.AI_EVAL_REPORT;
    if (target) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    }
    if (process.env.AI_EVAL_PRINT) console.log(formatReport(report));
    for (const task of report.tasks) {
      expect(task.cases, `${task.task} has cases`).toBeGreaterThan(0);
      expect(task.fabrications, `${task.task} fabrications`).toBe(0);
      expect(task.meetsMinimum, `${task.task} minimum`).toBe(true);
    }
    // Both languages are measured for every language reader.
    for (const task of report.tasks.filter((item) => item.kind === "reader")) {
      expect(Object.keys(task.byLanguage).sort()).toEqual(["ar", "en"]);
    }
  });
});
