"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import type { AiRunRevision, AiRunView } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAiErrorText, useAiMessage } from "./ai-message";
import { isRunWorking, useAiRun } from "./use-assist";

function statusVariant(status: AiRunView["status"]): "neutral" | "success" | "warning" | "danger" | "outline" {
  if (status === "completed") return "success";
  if (status === "partially_completed" || status === "cancelled") return "warning";
  if (status === "failed") return "danger";
  return "outline";
}

function RevisionPreview({ revision }: { revision: AiRunRevision }) {
  const { t } = useLocale();
  if (revision.kind === "time_of_day") return <>{t("aiWork.revise.timeOfDay", { time: t(`aiWork.timeOfDay.${revision.value}` as TKey) })}</>;
  if (revision.kind === "exclude_member") return <>{t("aiWork.revise.excludeMember", { name: revision.memberName })}</>;
  if (revision.kind === "owner") return <>{t("aiWork.revise.owner", { name: revision.ownerName })}</>;
  return <>{t(revision.messageKey as TKey)}</>;
}

function ReviseRun({ run }: { run: AiRunView }) {
  const { t } = useLocale();
  const errorText = useAiErrorText();
  const invalidate = useInvalidate();
  const [text, setText] = useState("");
  const [interpreted, setInterpreted] = useState<AiRunRevision | undefined>();
  const interpret = useApiMutation((api, value: string) => api.interpretRunRevision({ runId: run.id, text: value }), {
    onSuccess: (result) => {
      if (result.ok) setInterpreted(result.revision);
      else toast.error(errorText(result.reason));
    },
  });
  const apply = useApiMutation((api, revision: AiRunRevision) => api.reviseAiRun({ runId: run.id, text, revision }), {
    successMessage: t("aiWork.revise.applied"),
    onSuccess: async () => {
      setText("");
      setInterpreted(undefined);
      await invalidate([qk.aiRun(run.id)]);
    },
  });
  return (
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) interpret.mutate(text.trim()); }} data-testid="ai-run-revise">
      <label htmlFor={`revise-${run.id}`} className="context-label block">{t("aiWork.revise.label")}</label>
      <div className="flex flex-wrap gap-2">
        <Input id={`revise-${run.id}`} value={text} onChange={(event) => { setText(event.target.value); setInterpreted(undefined); }} placeholder={t("aiWork.revise.placeholder")} dir="auto" className="min-w-0 flex-1" maxLength={300} />
        <Button type="submit" variant="secondary" size="sm" loading={interpret.isPending} disabled={!text.trim()}>{t("aiWork.revise.check")}</Button>
      </div>
      {interpreted ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12.5px]" data-testid="ai-run-revise-understood">
          <span className="text-ink-3">{t("aiWork.revise.understood")}</span>
          <span className="font-medium text-ink"><RevisionPreview revision={interpreted} /></span>
          {interpreted.kind !== "unsupported" ? <Button type="button" size="xs" loading={apply.isPending} onClick={() => apply.mutate(interpreted)} data-testid="ai-run-revise-apply">{t("aiWork.revise.apply")}</Button> : null}
        </div>
      ) : null}
    </form>
  );
}

export function AiRunDetails({ run, onClose }: { run: AiRunView; onClose?: () => void }) {
  const { t } = useLocale();
  const present = useAiMessage();
  const errorText = useAiErrorText();
  const invalidate = useInvalidate();
  const [showSteps, setShowSteps] = useState(false);
  const working = isRunWorking(run);
  const control = useApiMutation((api, action: "cancel" | "takeOver" | "retry") => action === "cancel" ? api.cancelAiRun(run.id) : action === "takeOver" ? api.takeOverAiRun(run.id) : api.retryAiRun(run.id), {
    onSuccess: async () => { await invalidate([qk.aiRun(run.id)]); },
  });
  const drafts = run.steps.filter((step) => step.draft && step.resultRef);
  return (
    <section className="panel overflow-hidden" aria-labelledby={`ai-run-${run.id}-title`} data-testid="ai-run-panel" data-status={run.status}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="context-label">{t("aiWork.run.title")}</p>
          <h2 id={`ai-run-${run.id}-title`} className="mt-1 text-[15px] font-semibold">{present(run.goal)}{run.branchName ? <span className="font-normal text-ink-3"> · <bdi>{run.branchName}</bdi></span> : null}</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">{t("aiWork.run.requestedBy", { name: run.requestedByName })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusVariant(run.status)} data-testid="ai-run-stage">{t(run.stageKey as TKey)}</Badge>
          {onClose ? <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("common.action.close")}><X className="size-3.5" /></Button> : null}
        </div>
      </header>
      <div className="space-y-3 px-4 py-3">
        <p className="text-[12.5px] text-ink-2" role="status" aria-live="polite" data-testid="ai-run-counts">{t("aiWork.run.counts", { created: run.counts.created, linked: run.counts.linked, skipped: run.counts.skipped })}{run.counts.failed ? <> · <span className="text-danger">{t("aiWork.run.failedCount", { count: run.counts.failed })}</span></> : null}</p>
        {run.cancelRequested && working ? <p className="text-[12.5px] text-ink-3">{t("aiWork.run.cancelling")}</p> : null}
        {run.errorCategory ? <p className="text-[12.5px] text-danger" data-testid="ai-run-error">{errorText(run.errorCategory)}</p> : null}
        {(run.status === "cancelled" || run.status === "partially_completed" || run.status === "failed") && run.committedEffects > 0 ? <p className="text-[12.5px] text-ink-2" data-testid="ai-run-saved-before-stop">{t("aiWork.run.savedBeforeStop", { count: run.committedEffects })}</p> : null}
        {run.takenOverByName ? <p className="text-[12.5px] text-ink-2">{t("aiWork.run.takenOverBy", { name: run.takenOverByName })}</p> : null}
        {run.source === "fixture" ? <p className="text-[12px] text-ink-3">{t("aiWork.run.testMode")}</p> : null}

        {run.results.length ? (
          <div data-testid="ai-run-results">
            <p className="context-label">{t("aiWork.run.results")}</p>
            <ul className="mt-1 space-y-1.5">
              {run.results.map((result) => {
                const draft = drafts.find((step) => step.resultRef?.id === result.id)?.draft;
                return (
                  <li key={`${result.kind}-${result.id}`} className="text-[12.5px]">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-ink" dir="auto">{result.subjectName ?? result.label}</span>
                      <span className="text-ink-3" dir="auto">{result.label}</span>
                      {result.href ? <Link href={result.href} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{t("aiWork.run.open")}</Link> : null}
                    </div>
                    {draft ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[12px] text-ink-3">{t("aiWork.run.draft")}</summary>
                        <p className="mt-1 rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-2" dir={draft.language === "ar" ? "rtl" : "ltr"} lang={draft.language}>{draft.text}</p>
                        <Button type="button" variant="ghost" size="xs" className="mt-1" onClick={() => { void navigator.clipboard?.writeText(draft.text).then(() => toast.success(t("aiWork.run.copied")), () => undefined); }}>{t("aiWork.run.copyDraft")}</Button>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {run.exclusions.length ? (
          <div data-testid="ai-run-exclusions">
            <p className="context-label">{t("aiWork.run.exclusions")}</p>
            <ul className="mt-1 space-y-1">
              {run.exclusions.map((item) => (
                <li key={item.subjectId} className="flex flex-wrap gap-x-2 text-[12.5px]"><span className="text-ink" dir="auto">{item.subjectName}</span><span className="text-ink-3">{t(`aiWork.exclusion.${item.reason}` as TKey)}</span></li>
              ))}
            </ul>
          </div>
        ) : null}

        {run.revisions.length ? (
          <div>
            <p className="context-label">{t("aiWork.run.revisions")}</p>
            <ul className="mt-1 space-y-1">{run.revisions.map((revision) => <li key={revision.id} className="text-[12.5px] text-ink-2" dir="auto">{t("aiWork.run.revisionBy", { name: revision.byName, text: revision.text })}</li>)}</ul>
          </div>
        ) : null}

        {run.steps.some((step) => step.status === "handed_over" || step.status === "failed") ? (
          <div>
            <Button type="button" variant="link" size="xs" onClick={() => setShowSteps((value) => !value)} aria-expanded={showSteps}>{showSteps ? t("aiWork.run.hide") : t("aiWork.run.viewAll")}</Button>
            {showSteps ? (
              <ul className="mt-1 space-y-1">
                {run.steps.filter((step) => step.subjectName).map((step) => <li key={step.id} className={cn("flex flex-wrap gap-x-2 text-[12.5px]", step.status === "failed" && "text-danger")}><span dir="auto">{step.subjectName}</span><span className="text-ink-3">{t(`aiWork.run.stepStatus.${step.status}` as TKey)}</span></li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {run.allowed.revise ? <ReviseRun run={run} /> : null}
      </div>
      {run.allowed.cancel || run.allowed.takeOver || run.allowed.retry ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {run.allowed.cancel ? <Button type="button" variant="secondary" size="sm" disabled={run.cancelRequested} loading={control.isPending && control.variables === "cancel"} onClick={() => control.mutate("cancel")} data-testid="ai-run-cancel">{t("aiWork.run.cancel")}</Button> : null}
          {run.allowed.takeOver ? <Button type="button" variant="ghost" size="sm" loading={control.isPending && control.variables === "takeOver"} onClick={() => control.mutate("takeOver")} data-testid="ai-run-take-over">{t("aiWork.run.takeOver")}</Button> : null}
          {run.allowed.retry ? <Button type="button" variant="secondary" size="sm" loading={control.isPending && control.variables === "retry"} onClick={() => control.mutate("retry")} data-testid="ai-run-retry">{t("aiWork.run.retry")}</Button> : null}
        </footer>
      ) : null}
    </section>
  );
}

/** A run by id, live while it works. Leaving the page and coming back shows the same run. */
export function AiRunPanel({ runId, onClose, className }: { runId: string; onClose?: () => void; className?: string }) {
  const { t } = useLocale();
  const { data, isLoading, isError } = useAiRun(runId);
  if (isLoading && !data) return <Skeleton className={cn("h-32 w-full", className)} aria-label={t("aiWork.stage.starting")} />;
  if (isError || !data) return <p className={cn("text-[12.5px] text-ink-3", className)} role="status">{t("aiWork.error.internal")}</p>;
  return <div className={className}><AiRunDetails run={data} onClose={onClose} /></div>;
}
