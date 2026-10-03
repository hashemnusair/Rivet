"use client";
import { useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { DateTimeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationActionDescription, automationActionResultLabel, automationNextRun, automationPauseReasonLabel, automationSubjectLabel, automationTriggerDescription } from "@/features/automations/monitoring-ui";

function actionResultVariant(status: string) {
  return status === "completed" ? "success" : status === "failed" ? "danger" : status === "suppressed" ? "warning" : status === "retrying" ? "signal" : "neutral";
}

export default function RuleMonitoringClient() {
  const t = useT();
  const format = useFormat();
  const { ruleId } = useParams<{ ruleId: string }>();
  const rule = useApiQuery(qk.automationRule(ruleId), (api) => api.getAutomationRule(ruleId));
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const executionInput = { ruleId, pageSize: 50 };
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));

  if (rule.isLoading) return <div className="space-y-4"><TableSkeleton rows={2} cols={3} /><TableSkeleton rows={6} cols={5} /></div>;
  if (rule.isError || !rule.data) return <QueryErrorState error={rule.error} onRetry={() => { void rule.refetch(); }} notFoundTitle={t("staffTools.automations.editor.notFound")} forbiddenDescription={t("staffTools.automations.editor.forbidden")} />;
  const value = rule.data;
  const globallyPaused = Boolean(summary.data?.globallyPaused);
  const items = executions.data?.items ?? [];
  const failed = items.filter((execution) => execution.status === "failed" || execution.status === "retrying").length;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: t("palette.pages.automations"), href: "/automations" }, { label: value.name }]} />
    <PageHeader sectionLabel={t("staffTools.automations.editor.sectionLabel")} title={value.name} description={t("staffTools.automations.detail.viewOnly")} actions={<AutomationRuleStateBadge rule={value} globallyPaused={globallyPaused} />} />
    {globallyPaused ? <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden /><div><p className="text-[13px] font-semibold text-warning-deep">{t("staffTools.automations.detail.can'tRun")}</p><p className="mt-1 text-[12px] text-ink-2">{automationPauseReasonLabel(summary.data?.pauseReason, t)}</p></div></div></section> : null}
    <section className="panel overflow-hidden" aria-label={t("staffTools.automations.detail.howItWorks")}><header className="border-b border-line px-4 py-3"><p className="context-label">{t("staffTools.automations.savedSettings")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.automations.detail.howItWorks")}</h2></header><dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"><div className="p-4"><dt className="context-label">{t("staffTools.automations.whenRuns")}</dt><dd className="mt-2 text-[12.5px] leading-5">{automationTriggerDescription(value, t, format.number)}</dd></div><div className="p-4"><dt className="context-label">{t("staffTools.automations.whatItDoes")}</dt><dd className="mt-2 text-[12.5px] leading-5">{automationActionDescription(value, t)}</dd></div><div className="p-4"><dt className="context-label">{t("staffTools.automations.detail.waitRepeat")}</dt><dd className="mt-2 text-[12.5px]">{t("staffTools.automations.param.hours", { value: format.number(value.dedupeWindowHours) })}</dd><dd className="mt-1 text-[12px] text-ink-3">{t("staffTools.automations.detail.samePersonHint")}</dd></div><div className="p-4"><dt className="context-label">{t("staffTools.automations.detail.activity")}</dt><dd className="mt-2 text-[12.5px]">{t("staffTools.automations.detail.recorded", { count: value.executionsLast30Days, displayCount: format.number(value.executionsLast30Days) })}</dd><dd className="mt-1 text-[12px] text-ink-3">{t("staffTools.automations.lastRun")}: <DateTimeText iso={value.lastRunAt} /> · {automationNextRun(value, globallyPaused, t)}</dd></div></dl></section>
    <section className="panel overflow-hidden" aria-label={t("staffTools.automations.detail.runsFor")}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("staffTools.automations.detail.activity")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.automations.detail.runsFor")}</h2></div>{items.length > 0 ? <Badge variant={failed > 0 ? "danger" : "outline"}>{failed > 0 ? t("staffTools.automations.detail.needsAttention", { count: failed, displayCount: format.number(failed) }) : t("staffTools.automations.detail.recorded", { count: items.length, displayCount: format.number(items.length) })}</Badge> : null}</header>
      {executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.isError ? <QueryErrorState error={executions.error} onRetry={() => { void executions.refetch(); }} className="m-4" forbiddenDescription={t("staffTools.automations.editor.forbidden")} /> : items.length === 0 ? <EmptyState compact title={t("staffTools.automations.detail.noRuns")} className="m-4" /> : (
        <>
          <ul className="divide-y divide-line md:hidden" aria-label={t("staffTools.automations.detail.runsFor")}>
            {items.map((execution) => <li key={execution.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{execution.subjectName}</p><AutomationExecutionBadge status={execution.status} /></div><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={execution.executedAt} /> · {automationSubjectLabel(execution.subjectType, t)}</p><p className="mt-0.5 text-[12px] text-ink-3">{execution.suppressionReason ?? execution.detail ?? t("staffTools.automations.noDetails")}{execution.nextAttemptAt ? <> · {t("staffTools.automations.retryAt")} <DateTimeText iso={execution.nextAttemptAt} /></> : null}</p>{execution.actionResults?.length ? <div className="mt-2 flex flex-wrap gap-1">{execution.actionResults.map((action, index) => <Badge key={`${execution.id}-${action.key}-${index}`} variant={actionResultVariant(action.status)}>{automationActionResultLabel(action, t)}</Badge>)}</div> : null}</li>)}
          </ul>
          <Table className="hidden md:table"><TableHeader><TableRow><TableHead>{t("members.tabs.checkIns.when")}</TableHead><TableHead>{t("staffTools.automations.who")}</TableHead><TableHead>{t("memberProfile.checkIns.result")}</TableHead><TableHead>{t("staffTools.automations.whatHappened")}</TableHead><TableHead>{t("common.label.details")}</TableHead></TableRow></TableHeader><TableBody>{items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[12px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell><p className="font-medium">{execution.subjectName}</p><p className="text-[12px] text-ink-3">{automationSubjectLabel(execution.subjectType, t)}</p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{execution.actionResults?.map((action, index) => <Badge key={`${execution.id}-${action.key}-${index}`} variant={actionResultVariant(action.status)}>{automationActionResultLabel(action, t)}</Badge>) ?? <span className="text-ink-3">—</span>}</div></TableCell><TableCell className="max-w-sm text-[12px] leading-5 text-ink-3">{execution.suppressionReason ?? execution.detail ?? t("staffTools.automations.noDetails")}{execution.nextAttemptAt ? <p>{t("staffTools.automations.retryAt")}: <DateTimeText iso={execution.nextAttemptAt} /></p> : null}</TableCell></TableRow>)}</TableBody></Table>
        </>
      )}
    </section>
  </div>;
}
