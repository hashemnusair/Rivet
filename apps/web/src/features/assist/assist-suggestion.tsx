"use client";

import { RefreshCw, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextLabel } from "@/components/ui/typography";
import { cn } from "@/lib/utils/cn";
import { confidenceBand, describeJudgment, judgmentDistribution, percent } from "./assist-judgment";
import type { AssistReadyResult, UseAssistJudgmentResult } from "./use-assist-judgment";

/**
 * The reusable suggestion surface. It renders nothing while suggestions are
 * off, a quiet line while one is on its way, an inline note when the model
 * is unavailable, and a card with the judgment, its confidence and the
 * feature's own actions when one is ready. It never blocks the workflow
 * around it: the record stays editable and every action goes through the
 * feature's normal, permission-checked mutation.
 */
export function AssistSuggestion({
  suggestion,
  title,
  render,
  actions,
  fallback = null,
  className,
  testId = "assist-suggestion",
}: {
  suggestion: UseAssistJudgmentResult;
  title: string;
  render: (result: AssistReadyResult) => ReactNode;
  /** Feature-owned actions, for example an "Apply" button that runs the normal mutation. */
  actions?: ReactNode | ((result: AssistReadyResult) => ReactNode);
  /** What to show when suggestions are off; usually nothing. */
  fallback?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const { state } = suggestion;
  if (state.status === "disabled" && state.requested && state.message) {
    // A person pressed the button and the server refused (cap reached, breaker
    // tripped, the gym switched off meanwhile): say so instead of going quiet.
    return (
      <div role="status" data-testid={`${testId}-blocked`} className={cn("rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink-2", className)}>
        {state.message} Continue as usual; nothing here depends on it.
      </div>
    );
  }
  if (state.status === "idle" || state.status === "disabled") return <>{fallback}</>;

  if (state.status === "loading") {
    return (
      <div role="status" aria-busy="true" data-testid={`${testId}-loading`} className={cn("flex items-center gap-2 rounded-md border border-dashed border-line-2 bg-surface/55 px-3 py-2 text-[12.5px] text-ink-3", className)}>
        <Sparkles className="size-3.5 animate-pulse" aria-hidden />
        <span>Checking with Jev…</span>
      </div>
    );
  }

  if (state.status === "unavailable" || state.status === "stale") {
    const retryable = state.status === "stale" || state.retryable;
    return (
      <div role="status" data-testid={`${testId}-unavailable`} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink-2", className)}>
        <span className="min-w-0 flex-1">{state.message} Continue as usual; nothing here depends on it.</span>
        {retryable ? (
          <Button type="button" variant="secondary" size="xs" onClick={suggestion.request}>
            <RefreshCw /> Try again
          </Button>
        ) : null}
      </div>
    );
  }

  const { result } = state;
  const band = confidenceBand(result.judgment);
  return (
    <section aria-label={title} data-testid={testId} className={cn("rounded-md border border-line bg-surface p-3 sm:p-4", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-ink-3" aria-hidden />
          <ContextLabel as="span">Jev suggestion</ContextLabel>
          <Badge variant={band.tone} dot>{band.label} · {percent(band.value)}</Badge>
          {result.source === "fixture" ? <Badge variant="outline">Preview answer</Badge> : null}
          {result.source === "cache" ? <Badge variant="outline">Recent answer</Badge> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={suggestion.dismiss} aria-label="Dismiss suggestion">
          <X />
        </Button>
      </header>
      <h3 className="mt-2 text-[14px] font-semibold text-ink">{title}</h3>
      <div className="mt-1 text-[13px] leading-5 text-ink-2">{render(result)}</div>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{typeof actions === "function" ? actions(result) : actions}</div> : null}
      <p className="mt-3 text-[11.5px] leading-4 text-ink-3">Suggestion only. Nothing changes until you act, and RIVET checks your permissions for every action.</p>
      {result.warning ? <p className="mt-1 text-[11.5px] leading-4 text-warning-deep">{result.warning}</p> : null}
    </section>
  );
}

/** A generic reading of any judgment: the sentence plus the distribution behind it. */
export function JudgmentSummary({ result, maxRows = 4 }: { result: AssistReadyResult; maxRows?: number }) {
  const rows = judgmentDistribution(result.questionKey, result.judgment).slice(0, maxRows);
  return (
    <div data-testid="assist-judgment-summary">
      <p className="font-medium text-ink">{describeJudgment(result.questionKey, result.judgment)}</p>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-10 shrink-0 text-end tabular text-ink-3">{percent(row.probability)}</span>
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-sunken" aria-hidden>
              <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.round(row.probability * 100)}%` }} />
            </span>
            <span className="min-w-0 truncate text-ink-2">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
