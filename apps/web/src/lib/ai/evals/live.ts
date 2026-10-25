import type { AiNoteExtraction, AiRunRevision, MemberFilterInterpretation } from "../contracts";
import type { AiAdapterConfig, ModelTask, ModelTaskFailure, ModelTaskResult } from "../model";
import { EVAL_BRANCHES, FILTER_CASES_V2, HELD_OUT_SET_VERSION, EVAL_SET_VERSION, NOTE_AT, NOTE_CASES_V2, NOTE_CASES_V2_MIXED, REVISION_CANDIDATES, REVISION_CASES_V2, TIMEZONE } from "./cases";
import { evaluateFilters, evaluateNotes, evaluateRevisions, type EvalReport } from "./harness";

/**
 * Live provider evaluation (AI-5.2): the held-out reader cases sent through
 * the production model call, scored by the same harness as the deterministic
 * reader. The cases are written for the evaluation and hold no real member
 * data. Spend is capped: once the cap is reached no further call is made and
 * the remaining cases count as unanswered, so a capped run cannot pass.
 */

export type LiveCall = (task: ModelTask) => Promise<(ModelTaskResult | ModelTaskFailure) & { latencyMs: number }>;

export interface LiveEvalReport extends EvalReport {
  live: {
    protocol?: string;
    model?: string;
    timeoutMs: number;
    calls: number;
    answered: number;
    failures: Record<string, number>;
    costMicros: number;
    maxCostMicros: number;
    stoppedAtCostLimit: boolean;
    latencyMs: { p50: number; p95: number; max: number };
  };
}

export const LIVE_EVAL_DEFAULT_MAX_COST_MICROS = 1_000_000;
const CONCURRENCY = 4;

function percentile(sorted: number[], share: number): number {
  return sorted.length ? sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)]! : 0;
}

export async function runLiveEvaluation(call: LiveCall, config: Pick<AiAdapterConfig, "protocol" | "model" | "timeoutMs">, options: { maxCostMicros?: number; now?: Date } = {}): Promise<LiveEvalReport> {
  const maxCostMicros = options.maxCostMicros ?? LIVE_EVAL_DEFAULT_MAX_COST_MICROS;
  const notes = [...NOTE_CASES_V2, ...NOTE_CASES_V2_MIXED];
  const jobs: Array<{ id: string; task: ModelTask }> = [
    ...notes.map((item) => ({ id: item.id, task: { kind: "extract_contact_note", note: item.note, noteAt: NOTE_AT, timezone: TIMEZONE, subject: "member" } as ModelTask })),
    ...FILTER_CASES_V2.map((item) => ({ id: item.id, task: { kind: "interpret_filters", surface: "members", text: item.text, branches: EVAL_BRANCHES } as ModelTask })),
    ...REVISION_CASES_V2.map((item) => ({ id: item.id, task: { kind: "interpret_revision", text: item.text, candidates: REVISION_CANDIDATES, today: "2026-10-22" } as ModelTask })),
  ];
  const answers = new Map<string, ModelTaskResult["output"]>();
  const failures: Record<string, number> = {};
  const latencies: number[] = [];
  let costMicros = 0;
  let calls = 0;
  let stoppedAtCostLimit = false;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      if (costMicros >= maxCostMicros) { stoppedAtCostLimit = true; continue; }
      calls += 1;
      const outcome = await call(job.task);
      latencies.push(outcome.latencyMs);
      costMicros += outcome.usage?.costMicros ?? 0;
      if (outcome.ok) answers.set(job.id, outcome.output);
      else failures[outcome.category] = (failures[outcome.category] ?? 0) + 1;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
  const answer = <K extends ModelTaskResult["output"]["kind"]>(id: string, kind: K) => {
    const output = answers.get(id);
    return output?.kind === kind ? (output as Extract<ModelTaskResult["output"], { kind: K }>) : undefined;
  };
  const tasks = [
    evaluateNotes(notes, (item): AiNoteExtraction | undefined => answer(item.id, "extract_contact_note")?.extraction),
    evaluateFilters(FILTER_CASES_V2, (item): MemberFilterInterpretation | undefined => answer(item.id, "interpret_filters")?.filters),
    evaluateRevisions(REVISION_CASES_V2, (item): AiRunRevision | undefined => answer(item.id, "interpret_revision")?.revision),
  ];
  const sorted = [...latencies].sort((left, right) => left - right);
  return {
    set: HELD_OUT_SET_VERSION,
    developmentSet: EVAL_SET_VERSION,
    reader: "live",
    ranAt: (options.now ?? new Date()).toISOString(),
    tasks,
    development: [],
    meetsMinimums: tasks.every((task) => task.meetsMinimum),
    live: {
      ...(config.protocol ? { protocol: config.protocol } : {}),
      ...(config.model ? { model: config.model } : {}),
      timeoutMs: config.timeoutMs,
      calls,
      answered: answers.size,
      failures,
      costMicros,
      maxCostMicros,
      stoppedAtCostLimit,
      latencyMs: { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), max: sorted.at(-1) ?? 0 },
    },
  };
}

export function formatLiveSummary(report: LiveEvalReport): string {
  const { live } = report;
  const failures = Object.entries(live.failures).map(([category, count]) => `${category} ${count}`).join(", ") || "none";
  return [
    `Live reader: ${live.protocol ?? "?"} · ${live.model ?? "?"} · timeout ${live.timeoutMs} ms`,
    `Calls ${live.calls}, answered ${live.answered}, failed: ${failures}`,
    `Cost $${(live.costMicros / 1_000_000).toFixed(4)} of a $${(live.maxCostMicros / 1_000_000).toFixed(2)} limit${live.stoppedAtCostLimit ? " (stopped at the limit; remaining cases unanswered)" : ""}`,
    `Latency p50 ${live.latencyMs.p50} ms, p95 ${live.latencyMs.p95} ms, max ${live.latencyMs.max} ms`,
  ].join("\n");
}
