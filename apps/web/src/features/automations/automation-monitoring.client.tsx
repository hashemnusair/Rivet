"use client";
import { useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { AlertTriangle, ArrowRight, CheckCircle2, CircleOff, PlugZap, RotateCcw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DataPagination, PageHeader, Stat } from "@/components/shared/chrome";
import { DateTimeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationActionDescription, automationNextRun, automationPauseReasonLabel, automationProviderDetail, automationProviderLabel, automationSubjectLabel, automationTriggerDescription } from "./monitoring-ui";

export default function AutomationMonitoringClient() {
  const t = useT();
  const format = useFormat();
  const [page, setPage] = useState(1);
  const executionInput = { page, pageSize: 15 };
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const rules = useApiQuery(qk.automationRules, (api) => api.listAutomationRules());
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));
  const value = summary.data;
  const ruleItems = rules.data ?? [];
  const globallyPaused = Boolean(value?.globallyPaused);
  const needsAttention = Boolean(value && (value.failureCount > 0 || value.retryCount > 0));

  return (
    <div className="space-y-5">
      <PageHeader title={t("staffTools.automations.title")} description={t("staffTools.automations.description")} actions={<Button asChild variant="secondary"><Link href="/audit?category=automations">{t("staffTools.automations.viewHistory")}</Link></Button>} />

      {globallyPaused ? (
        <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
            <div><p className="text-[13px] font-semibold text-warning-deep">{t("staffTools.automations.globalPaused")}</p><p className="mt-1 text-[12px] leading-5 text-ink-2">{automationPauseReasonLabel(value?.pauseReason, t)} {t("staffTools.automations.globalPauseExplanation")}</p></div>
          </div>
        </section>
      ) : null}

      {/* Failures and retries first; the healthy counts follow. */}
      <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x xl:grid-cols-5" aria-label={t("staffTools.automations.runsSummary")}>
        <Stat className="p-4" label={t("staffTools.automations.failed")} value={value ? format.number(value.failureCount) : "—"} tone={needsAttention ? "danger" : "default"} context={value && value.retryCount > 0 ? t("staffTools.automations.tryingAgain") : needsAttention ? t("marketing.device.needsAttention") : t("staffTools.automations.nothingNeedsAttention")} />
        <Stat className="p-4" label={t("staffTools.automations.skipped")} value={value ? format.number(value.suppressedCount) : "—"} tone={value && value.suppressedCount > 0 ? "warning" : "default"} context={t("staffTools.automations.skippedContext")} />
        <Stat className="p-4" label={t("common.action.done")} value={value ? format.number(value.successCount) : "—"} tone="success" context={t("staffTools.automations.finishedWithoutProblems")} />
        <Stat className="p-4" label={t("staffTools.automations.runsPeriodLabel")} value={value ? format.number(value.executionsLast30Days) : "—"} context={t("staffTools.automations.allResults")} />
        <Stat className="p-4" label={t("staffTools.automations.title")} value={value ? format.number(value.ruleCount) : "—"} context={t("staffTools.automations.switchedOn", { count: value?.persistedEnabledCount ?? 0, displayCount: format.number(value?.persistedEnabledCount ?? 0) })} />
      </section>
      {summary.isError ? <QueryErrorState error={summary.error} onRetry={() => { void summary.refetch(); }} forbiddenDescription={t("staffTools.automations.editor.forbidden")} /> : null}
      {needsAttention ? <p className="flex items-start gap-2 text-[12px] text-danger" role="status"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("staffTools.automations.failuresNotice")}</p> : null}

      <section className="panel overflow-hidden" aria-label={t("staffTools.automations.connectedServices")}>
        <header className="border-b border-line px-4 py-3"><p className="context-label">{t("staffTools.automations.connectedServicesLabel")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.automations.connectedServices")}</h2></header>
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {(value?.providers ?? []).map((provider) => <article key={provider.key} className="p-4"><div className="flex items-start justify-between gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-sunken text-ink-2">{provider.live ? <CheckCircle2 className="size-4" aria-hidden /> : provider.configured ? <CircleOff className="size-4" aria-hidden /> : <PlugZap className="size-4" aria-hidden />}</span><Badge variant={provider.live ? "success" : provider.configured ? "warning" : "neutral"} dot>{t(provider.live ? "staffTools.automations.providerState.working" : provider.configured ? "staffTools.automations.providerState.onHold" : "staffTools.automations.providerState.notSetUp")}</Badge></div><h3 className="mt-3 text-[13px] font-semibold">{automationProviderLabel(provider, t)}</h3><p className="mt-1 text-[12px] leading-5 text-ink-3">{automationProviderDetail(provider, globallyPaused, t)}</p></article>)}
          {!value && summary.isLoading ? <div className="p-4 lg:col-span-3"><TableSkeleton rows={2} cols={3} /></div> : null}
          {!value && summary.isError ? <div className="p-4 lg:col-span-3"><QueryErrorState error={summary.error} onRetry={() => { void summary.refetch(); }} forbiddenDescription={t("staffTools.automations.editor.forbidden")} /></div> : null}
        </div>
      </section>

      <section className="panel overflow-hidden" aria-label={t("staffTools.automations.title")}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("staffTools.automations.savedSettings")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.automations.title")}</h2></div><Badge variant="outline">{t("staffTools.automations.viewOnly")}</Badge></header>
        {rules.isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={5} /></div> : rules.isError ? <QueryErrorState error={rules.error} onRetry={() => { void rules.refetch(); }} className="m-4" forbiddenDescription={t("staffTools.automations.editor.forbidden")} /> : ruleItems.length === 0 ? <EmptyState compact title={t("staffTools.automations.noAutomations")} description={t("staffTools.automations.noAutomationsPaused")} className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label={t("palette.pages.automations")}>
              {ruleItems.map((rule) => <li key={rule.id}><Link href={`/automations/${rule.id}`} className="block px-4 py-3 transition-colors hover:bg-sunken/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{rule.name}</p><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></div><p className="mt-1 text-[12px] text-ink-2">{automationTriggerDescription(rule, t, format.number)}</p><p className="mt-0.5 text-[12px] text-ink-3">{automationActionDescription(rule, t)} · {t("staffTools.automations.runsLast30Days", { count: rule.executionsLast30Days, displayCount: format.number(rule.executionsLast30Days) })} · {automationNextRun(rule, globallyPaused, t)}</p></Link></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>{t("staffTools.automations.title")}</TableHead><TableHead>{t("staffTools.automations.whenRuns")}</TableHead><TableHead>{t("staffTools.automations.whatItDoes")}</TableHead><TableHead>{t("staffTools.automations.onOrOff")}</TableHead><TableHead>{t("staffTools.automations.nextRun")}</TableHead><TableHead><span className="sr-only">{t("staffTools.automations.view")}</span></TableHead></TableRow></TableHeader><TableBody>{ruleItems.map((rule) => <TableRow key={rule.id}><TableCell><p className="font-medium">{rule.name}</p><p className="mt-0.5 text-[12px] text-ink-3">{t("staffTools.automations.runsLast30Days", { count: rule.executionsLast30Days, displayCount: format.number(rule.executionsLast30Days) })} · {t("staffTools.automations.lastRun")} <DateTimeText iso={rule.lastRunAt} /></p></TableCell><TableCell className="max-w-72 text-[12px] text-ink-2">{automationTriggerDescription(rule, t, format.number)}</TableCell><TableCell className="text-[12px] text-ink-2">{automationActionDescription(rule, t)}</TableCell><TableCell><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></TableCell><TableCell className="text-[12px] text-ink-3">{automationNextRun(rule, globallyPaused, t)}</TableCell><TableCell className="text-end"><Button asChild size="icon-sm" variant="ghost" aria-label={t("staffTools.automations.openRule", { name: rule.name })}><Link href={`/automations/${rule.id}`}><ArrowRight /></Link></Button></TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
      </section>

      <section className="panel overflow-hidden" aria-label={t("staffTools.automations.recentRuns")}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("staffTools.automations.detail.activity")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.automations.recentRuns")}</h2></div><Button variant="ghost" size="sm" onClick={() => { void executions.refetch(); }}><RotateCcw />{" "}{t("common.action.refresh")}</Button></header>
        {executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.isError ? <QueryErrorState error={executions.error} onRetry={() => { void executions.refetch(); }} className="m-4" forbiddenDescription={t("staffTools.automations.editor.forbidden")} /> : executions.data?.items.length === 0 ? <EmptyState compact title={t("staffTools.automations.noRuns")} description={t("staffTools.automations.eachRunAppears")} className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label={t("staffTools.automations.recentRuns")}>
              {executions.data?.items.map((execution) => <li key={execution.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{execution.ruleName}</p><AutomationExecutionBadge status={execution.status} /></div><p className="mt-0.5 text-[12px] text-ink-2">{execution.subjectName} <span className="text-ink-3">· {automationSubjectLabel(execution.subjectType, t)}</span></p><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={execution.executedAt} /> · {execution.suppressionReason ?? execution.detail ?? t("staffTools.automations.noDetails")}{execution.nextAttemptAt ? <> · {t("staffTools.automations.triesAgain")} <DateTimeText iso={execution.nextAttemptAt} /></> : null}</p></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>{t("members.tabs.checkIns.when")}</TableHead><TableHead>{t("staffTools.automations.title")}</TableHead><TableHead>{t("staffTools.automations.who")}</TableHead><TableHead>{t("memberProfile.checkIns.result")}</TableHead><TableHead>{t("common.label.details")}</TableHead></TableRow></TableHeader><TableBody>{executions.data?.items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[12px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell className="font-medium">{execution.ruleName}</TableCell><TableCell><p>{execution.subjectName}</p><p className="text-[12px] text-ink-3">{automationSubjectLabel(execution.subjectType, t)}</p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell className="max-w-sm text-[12px] text-ink-3">{execution.suppressionReason ?? execution.detail ?? t("staffTools.automations.noDetails")}{execution.nextAttemptAt ? <> · {t("staffTools.automations.triesAgain")} <DateTimeText iso={execution.nextAttemptAt} /></> : null}</TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
        {executions.data ? <div className="border-t border-line px-4 pb-3"><DataPagination page={executions.data} onPage={setPage} /></div> : null}
      </section>
    </div>
  );
}
