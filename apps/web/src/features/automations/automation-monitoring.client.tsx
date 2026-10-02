"use client";

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
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationActionDescription, automationNextRun, automationSubjectLabel, automationTriggerDescription } from "./monitoring-ui";

export default function AutomationMonitoringClient() {
  const [page, setPage] = useState(1);
  const executionInput = { page, pageSize: 15 };
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const rules = useApiQuery(qk.automationRules, (api) => api.listAutomationRules());
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));
  const firstError = summary.error ?? rules.error ?? executions.error;

  if ((summary.isError || rules.isError || executions.isError) && !summary.data && !rules.data && !executions.data) {
    return <QueryErrorState error={firstError} onRetry={() => { void summary.refetch(); void rules.refetch(); void executions.refetch(); }} forbiddenDescription="You don't have access to automations." />;
  }

  const value = summary.data;
  const ruleItems = rules.data ?? [];
  const globallyPaused = Boolean(value?.globallyPaused);
  const needsAttention = Boolean(value && (value.failureCount > 0 || value.retryCount > 0));

  return (
    <div className="space-y-5">
      <PageHeader title="Automations" description="What each automation does and what it did. View only." actions={<Button asChild variant="secondary"><Link href="/audit?category=automations">View history</Link></Button>} />

      {globallyPaused ? (
        <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
            <div><p className="text-[13px] font-semibold text-warning-deep">All automations are paused</p><p className="mt-1 text-[12px] leading-5 text-ink-2">{value?.pauseReason} “On” below means an automation is switched on. None of them run until the pause ends.</p></div>
          </div>
        </section>
      ) : null}

      {/* Failures and retries first; the healthy counts follow. */}
      <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x xl:grid-cols-5" aria-label="Summary of runs">
        <Stat className="p-4" label="Failed" value={value?.failureCount ?? "—"} tone={needsAttention ? "danger" : "default"} context={value && value.retryCount > 0 ? `${value.retryCount} trying again` : needsAttention ? "Needs attention" : "Nothing needs attention"} />
        <Stat className="p-4" label="Skipped" value={value?.suppressedCount ?? "—"} tone={value && value.suppressedCount > 0 ? "warning" : "default"} context="Not sent, or already done" />
        <Stat className="p-4" label="Done" value={value?.successCount ?? "—"} tone="success" context="Finished without problems" />
        <Stat className="p-4" label="Runs in the last 30 days" value={value?.executionsLast30Days ?? "—"} context="All results" />
        <Stat className="p-4" label="Automations" value={value?.ruleCount ?? "—"} context={`${value?.persistedEnabledCount ?? 0} switched on`} />
      </section>
      {needsAttention ? <p className="flex items-start gap-2 text-[12px] text-danger" role="status"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />Some runs failed. Check the recent runs below.</p> : null}

      <section className="panel overflow-hidden" aria-label="Connected services">
        <header className="border-b border-line px-4 py-3"><p className="context-label">What automations use</p><h2 className="mt-1 text-[15px] font-semibold">Connected services</h2></header>
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {(value?.providers ?? []).map((provider) => <article key={provider.key} className="p-4"><div className="flex items-start justify-between gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-sunken text-ink-2">{provider.live ? <CheckCircle2 className="size-4" aria-hidden /> : provider.configured ? <CircleOff className="size-4" aria-hidden /> : <PlugZap className="size-4" aria-hidden />}</span><Badge variant={provider.live ? "success" : provider.configured ? "warning" : "neutral"} dot>{provider.live ? "working" : provider.configured ? "on hold" : "not set up"}</Badge></div><h3 className="mt-3 text-[13px] font-semibold">{provider.label}</h3><p className="mt-1 text-[12px] leading-5 text-ink-3">{provider.detail}</p></article>)}
          {!value ? <div className="p-4 lg:col-span-3"><TableSkeleton rows={2} cols={3} /></div> : null}
        </div>
      </section>

      <section className="panel overflow-hidden" aria-label="Automations">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Saved settings</p><h2 className="mt-1 text-[15px] font-semibold">Automations</h2></div><Badge variant="outline">view only</Badge></header>
        {rules.isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={5} /></div> : ruleItems.length === 0 ? <EmptyState compact title="No automations yet" description="New automations can't be added while automations are paused." className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label="Automations">
              {ruleItems.map((rule) => <li key={rule.id}><Link href={`/automations/${rule.id}`} className="block px-4 py-3 transition-colors hover:bg-sunken/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{rule.name}</p><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></div><p className="mt-1 text-[12px] text-ink-2">{automationTriggerDescription(rule)}</p><p className="mt-0.5 text-[12px] text-ink-3">{automationActionDescription(rule)} · {rule.executionsLast30Days} runs in the last 30 days · {automationNextRun(rule, globallyPaused)}</p></Link></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>Automation</TableHead><TableHead>When it runs</TableHead><TableHead>What it does</TableHead><TableHead>On or off</TableHead><TableHead>Next run</TableHead><TableHead><span className="sr-only">View</span></TableHead></TableRow></TableHeader><TableBody>{ruleItems.map((rule) => <TableRow key={rule.id}><TableCell><p className="font-medium">{rule.name}</p><p className="mt-0.5 text-[12px] text-ink-3">{rule.executionsLast30Days} runs in the last 30 days · last run <DateTimeText iso={rule.lastRunAt} /></p></TableCell><TableCell className="max-w-72 text-[12px] text-ink-2">{automationTriggerDescription(rule)}</TableCell><TableCell className="text-[12px] text-ink-2">{automationActionDescription(rule)}</TableCell><TableCell><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></TableCell><TableCell className="text-[12px] text-ink-3">{automationNextRun(rule, globallyPaused)}</TableCell><TableCell className="text-end"><Button asChild size="icon-sm" variant="ghost" aria-label={`Open ${rule.name}`}><Link href={`/automations/${rule.id}`}><ArrowRight /></Link></Button></TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
      </section>

      <section className="panel overflow-hidden" aria-label="Recent runs">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">History</p><h2 className="mt-1 text-[15px] font-semibold">Recent runs</h2></div><Button variant="ghost" size="sm" onClick={() => { void executions.refetch(); }}><RotateCcw /> Refresh</Button></header>
        {executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.data?.items.length === 0 ? <EmptyState compact title="No runs yet" description="Each time an automation runs, it shows here." className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label="Recent runs">
              {executions.data?.items.map((execution) => <li key={execution.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{execution.ruleName}</p><AutomationExecutionBadge status={execution.status} /></div><p className="mt-0.5 text-[12px] text-ink-2">{execution.subjectName} <span className="text-ink-3">· {automationSubjectLabel(execution.subjectType)}</span></p><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={execution.executedAt} /> · {execution.suppressionReason ?? execution.detail ?? "No details"}{execution.nextAttemptAt ? <> · tries again <DateTimeText iso={execution.nextAttemptAt} /></> : null}</p></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Automation</TableHead><TableHead>Who</TableHead><TableHead>Result</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{executions.data?.items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[12px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell className="font-medium">{execution.ruleName}</TableCell><TableCell><p>{execution.subjectName}</p><p className="text-[12px] text-ink-3">{automationSubjectLabel(execution.subjectType)}</p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell className="max-w-sm text-[12px] text-ink-3">{execution.suppressionReason ?? execution.detail ?? "No details"}{execution.nextAttemptAt ? <> · tries again <DateTimeText iso={execution.nextAttemptAt} /></> : null}</TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
        {executions.data ? <div className="border-t border-line px-4 pb-3"><DataPagination page={executions.data} onPage={setPage} /></div> : null}
      </section>
    </div>
  );
}
