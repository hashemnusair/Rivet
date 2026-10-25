"use client";

import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";

/**
 * "This month" in Settings → Assistance: what RIVET prepared and what people
 * did with it, so an owner can judge whether it helps. Counts only.
 */
export function OutcomeSummary() {
  const { t } = useLocale();
  const format = useFormat();
  const summary = useApiQuery(qk.aiOutcomes, (api) => api.getAiOutcomeSummary());
  const value = summary.data;
  if (!value) return null;
  const rows: Array<[string, string]> = [
    [t("aiWork.outcomes.runs"), t("aiWork.outcomes.runsValue", { total: value.runs.total, completed: value.runs.completed, partly: value.runs.partly, failed: value.runs.failed, cancelled: value.runs.cancelled })],
    [t("aiWork.outcomes.tasks"), t("aiWork.outcomes.tasksValue", { prepared: value.tasks.prepared, done: value.tasks.done, open: value.tasks.open, other: value.tasks.closedOther })],
    [t("aiWork.outcomes.proposals"), t("aiWork.outcomes.proposalsValue", { prepared: value.proposals.prepared, approved: value.proposals.approved, rejected: value.proposals.rejected, invalidated: value.proposals.invalidated, expired: value.proposals.expired, pending: value.proposals.pending })],
    [t("aiWork.outcomes.corrections"), format.number(value.revisions)],
    [t("aiWork.outcomes.model"), value.model.liveCalls ? t("aiWork.outcomes.modelLive", { calls: value.model.liveCalls, latency: format.number(value.model.averageLatencyMs ?? 0), failures: value.model.failures }) : t("aiWork.outcomes.modelNone", { calls: value.model.testCalls })],
    [t("aiWork.outcomes.feedback"), t("aiWork.outcomes.feedbackValue", { useful: value.feedback.useful, notUseful: value.feedback.notUseful })],
    [t("aiWork.outcomes.dismissals"), format.number(value.dismissals)],
    [t("aiWork.outcomes.unnecessaryContacts"), format.number(value.unnecessaryContacts)],
  ];
  return (
    <details className="mt-2 text-[12.5px]" data-testid="assistance-outcomes">
      <summary className="cursor-pointer font-medium text-ink-2">{t("aiWork.outcomes.title")}</summary>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        {rows.map(([label, text]) => <div key={label} className="contents"><dt className="text-ink-3">{label}</dt><dd className="text-ink">{text}</dd></div>)}
      </dl>
    </details>
  );
}
