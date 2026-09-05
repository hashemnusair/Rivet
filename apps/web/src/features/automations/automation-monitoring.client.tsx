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
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationActionDescription, automationNextRun, automationTriggerDescription } from "./monitoring-ui";

export default function AutomationMonitoringClient() {
  const [page, setPage] = useState(1);
  const executionInput = { page, pageSize: 15 };
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const rules = useApiQuery(qk.automationRules, (api) => api.listAutomationRules());
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));
  const firstError = summary.error ?? rules.error ?? executions.error;

  if ((summary.isError || rules.isError || executions.isError) && !summary.data && !rules.data && !executions.data) {
    return <QueryErrorState error={firstError} onRetry={() => { void summary.refetch(); void rules.refetch(); void executions.refetch(); }} forbiddenDescription="Automation monitoring requires the automations.manage permission." />;
  }

  const value = summary.data;
  const ruleItems = rules.data ?? [];
  const globallyPaused = Boolean(value?.globallyPaused);
  const needsAttention = Boolean(value && (value.failureCount > 0 || value.retryCount > 0));

  return (
    <div className="space-y-5">
      <PageHeader title="Automation monitoring" description="A read-only view of persisted rules, provider readiness, and execution history. Delivery controls remain unavailable while the global safety gate is active." actions={<Button asChild variant="secondary"><Link href="/audit?category=automations">Open audit history</Link></Button>} />

      {globallyPaused ? (
        <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
            <div><p className="text-[13px] font-semibold text-warning-deep">Global delivery pause is active</p><p className="mt-1 text-[12px] leading-5 text-ink-2">{value?.pauseReason} Persisted “enabled” flags below describe saved configuration, not a live delivery state.</p></div>
          </div>
        </section>
      ) : null}

      {/* Failures and retries first; the healthy counts follow. */}
      <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x xl:grid-cols-5" aria-label="Execution summary">
        <Stat className="p-4" label="Failed / retrying" value={value ? `${value.failureCount} / ${value.retryCount}` : "—"} tone={needsAttention ? "danger" : "default"} context={needsAttention ? "Needs operator attention" : "Nothing needs attention"} />
        <Stat className="p-4" label="Suppressed" value={value?.suppressedCount ?? "—"} tone={value && value.suppressedCount > 0 ? "warning" : "default"} context="Duplicates inside the dedupe window" />
        <Stat className="p-4" label="Successful" value={value?.successCount ?? "—"} tone="success" context="Completed actions" />
        <Stat className="p-4" label="Executions · 30d" value={value?.executionsLast30Days ?? "—"} context="All recorded outcomes" />
        <Stat className="p-4" label="Rules" value={value?.ruleCount ?? "—"} context={`${value?.persistedEnabledCount ?? 0} saved as enabled`} />
      </section>
      {needsAttention ? <p className="flex items-start gap-2 text-[12px] text-danger" role="status"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />Failed executions remain immutable in history. Review the audit log before provider activation.</p> : null}

      <section className="panel overflow-hidden" aria-label="Provider readiness">
        <header className="border-b border-line px-4 py-3"><p className="context-label">Delivery dependencies</p><h2 className="mt-1 text-[15px] font-semibold">Provider readiness</h2></header>
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {(value?.providers ?? []).map((provider) => <article key={provider.key} className="p-4"><div className="flex items-start justify-between gap-3"><span className="flex size-8 items-center justify-center rounded-md bg-sunken text-ink-2">{provider.live ? <CheckCircle2 className="size-4" aria-hidden /> : provider.configured ? <CircleOff className="size-4" aria-hidden /> : <PlugZap className="size-4" aria-hidden />}</span><Badge variant={provider.live ? "success" : provider.configured ? "warning" : "neutral"} dot>{provider.live ? "live" : provider.configured ? "held" : "not configured"}</Badge></div><h3 className="mt-3 text-[13px] font-semibold">{provider.label}</h3><p className="mt-1 text-[12px] leading-5 text-ink-3">{provider.detail}</p></article>)}
          {!value ? <div className="p-4 lg:col-span-3"><TableSkeleton rows={2} cols={3} /></div> : null}
        </div>
      </section>

      <section className="panel overflow-hidden" aria-label="Automation rules">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Saved configuration</p><h2 className="mt-1 text-[15px] font-semibold">Automation rules</h2></div><Badge variant="outline">read only</Badge></header>
        {rules.isLoading ? <div className="p-4"><TableSkeleton rows={5} cols={5} /></div> : ruleItems.length === 0 ? <EmptyState compact title="No automation rules" description="There is no saved configuration to monitor yet. Creation stays disabled until the global pause is lifted." className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label="Automation rules">
              {ruleItems.map((rule) => <li key={rule.id}><Link href={`/automations/${rule.id}`} className="block px-4 py-3 transition-colors hover:bg-sunken/40"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{rule.name}</p><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></div><p className="mt-1 text-[12px] text-ink-2">{automationTriggerDescription(rule)}</p><p className="mt-0.5 text-[12px] text-ink-3">{automationActionDescription(rule)} · {rule.executionsLast30Days} executions · {automationNextRun(rule, globallyPaused)}</p></Link></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>Rule</TableHead><TableHead>Trigger and audience</TableHead><TableHead>Actions</TableHead><TableHead>Saved state</TableHead><TableHead>Next run</TableHead><TableHead><span className="sr-only">View</span></TableHead></TableRow></TableHeader><TableBody>{ruleItems.map((rule) => <TableRow key={rule.id}><TableCell><p className="font-medium">{rule.name}</p><p className="mt-0.5 text-[12px] text-ink-3">{rule.executionsLast30Days} executions · last <DateTimeText iso={rule.lastRunAt} /></p></TableCell><TableCell className="max-w-72 text-[12px] text-ink-2">{automationTriggerDescription(rule)}</TableCell><TableCell className="text-[12px] text-ink-2">{automationActionDescription(rule)}</TableCell><TableCell><AutomationRuleStateBadge rule={rule} globallyPaused={globallyPaused} /></TableCell><TableCell className="text-[12px] text-ink-3">{automationNextRun(rule, globallyPaused)}</TableCell><TableCell className="text-end"><Button asChild size="icon-sm" variant="ghost" aria-label={`Inspect ${rule.name}`}><Link href={`/automations/${rule.id}`}><ArrowRight /></Link></Button></TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
      </section>

      <section className="panel overflow-hidden" aria-label="Recent executions">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Operations history</p><h2 className="mt-1 text-[15px] font-semibold">Recent executions</h2></div><Button variant="ghost" size="sm" onClick={() => { void executions.refetch(); }}><RotateCcw /> Refresh</Button></header>
        {executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.data?.items.length === 0 ? <EmptyState compact title="No execution history" description="Completed, suppressed, retried, and failed runs will appear here." className="m-4" /> : (
          <>
            <ul className="divide-y divide-line md:hidden" aria-label="Recent executions">
              {executions.data?.items.map((execution) => <li key={execution.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{execution.ruleName}</p><AutomationExecutionBadge status={execution.status} /></div><p className="mt-0.5 text-[12px] text-ink-2">{execution.subjectName} <span className="text-ink-3">· {execution.subjectType}</span></p><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={execution.executedAt} /> · {execution.suppressionReason ?? execution.detail ?? "No additional detail"}{execution.nextAttemptAt ? <> · retry <DateTimeText iso={execution.nextAttemptAt} /></> : null}</p></li>)}
            </ul>
            <Table className="hidden md:table"><TableHeader><TableRow><TableHead>Executed</TableHead><TableHead>Rule</TableHead><TableHead>Subject</TableHead><TableHead>Result</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader><TableBody>{executions.data?.items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[12px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell className="font-medium">{execution.ruleName}</TableCell><TableCell><p>{execution.subjectName}</p><p className="text-[12px] text-ink-3">{execution.subjectType} · <span className="font-mono text-[11px]">{execution.subjectId.slice(0, 8)}</span></p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell className="max-w-sm text-[12px] text-ink-3">{execution.suppressionReason ?? execution.detail ?? "No additional detail"}{execution.nextAttemptAt ? <> · retry <DateTimeText iso={execution.nextAttemptAt} /></> : null}</TableCell></TableRow>)}</TableBody></Table>
          </>
        )}
        {executions.data ? <div className="border-t border-line px-4 pb-3"><DataPagination page={executions.data} onPage={setPage} /></div> : null}
      </section>
    </div>
  );
}
