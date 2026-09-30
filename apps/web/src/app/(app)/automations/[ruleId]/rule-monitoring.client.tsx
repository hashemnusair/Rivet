"use client";

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
import { AutomationExecutionBadge, AutomationRuleStateBadge, automationActionDescription, automationActionResultLabel, automationNextRun, automationSubjectLabel, automationTriggerDescription } from "@/features/automations/monitoring-ui";

function actionResultVariant(status: string) {
  return status === "completed" ? "success" : status === "failed" ? "danger" : status === "suppressed" ? "warning" : status === "retrying" ? "signal" : "neutral";
}

export default function RuleMonitoringClient() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const rule = useApiQuery(qk.automationRule(ruleId), (api) => api.getAutomationRule(ruleId));
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const executionInput = { ruleId, pageSize: 50 };
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));

  if (rule.isLoading) return <div className="space-y-4"><TableSkeleton rows={2} cols={3} /><TableSkeleton rows={6} cols={5} /></div>;
  if (rule.isError || !rule.data) return <QueryErrorState error={rule.error} onRetry={() => { void rule.refetch(); }} notFoundTitle="Automation not found" />;
  const value = rule.data;
  const globallyPaused = Boolean(summary.data?.globallyPaused);
  const items = executions.data?.items ?? [];
  const failed = items.filter((execution) => execution.status === "failed" || execution.status === "retrying").length;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: "Automations", href: "/automations" }, { label: value.name }]} />
    <PageHeader sectionLabel="Automation" title={value.name} description="View only. It can't be changed here." actions={<AutomationRuleStateBadge rule={value} globallyPaused={globallyPaused} />} />
    {globallyPaused ? <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden /><div><p className="text-[13px] font-semibold text-warning-deep">This automation can&apos;t run right now</p><p className="mt-1 text-[12px] text-ink-2">{summary.data?.pauseReason}</p></div></div></section> : null}
    <section className="panel overflow-hidden" aria-label="How it works"><header className="border-b border-line px-4 py-3"><p className="context-label">Saved settings</p><h2 className="mt-1 text-[15px] font-semibold">How it works</h2></header><dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"><div className="p-4"><dt className="context-label">When it runs</dt><dd className="mt-2 text-[12.5px] leading-5">{automationTriggerDescription(value)}</dd></div><div className="p-4"><dt className="context-label">What it does</dt><dd className="mt-2 text-[12.5px] leading-5">{automationActionDescription(value)}</dd></div><div className="p-4"><dt className="context-label">Wait before repeating</dt><dd className="mt-2 text-[12.5px]">{value.dedupeWindowHours} hours</dd><dd className="mt-1 text-[12px] text-ink-3">It won&apos;t act on the same person again within this time.</dd></div><div className="p-4"><dt className="context-label">Activity</dt><dd className="mt-2 text-[12.5px]">{value.executionsLast30Days} runs in the last 30 days</dd><dd className="mt-1 text-[12px] text-ink-3">Last run: <DateTimeText iso={value.lastRunAt} /> · {automationNextRun(value, globallyPaused)}</dd></div></dl></section>
    <section className="panel overflow-hidden" aria-label="Runs for this automation">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">History</p><h2 className="mt-1 text-[15px] font-semibold">Runs for this automation</h2></div>{items.length > 0 ? <Badge variant={failed > 0 ? "danger" : "outline"}>{failed > 0 ? `${failed} need attention` : `${items.length} recorded`}</Badge> : null}</header>
      {executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.isError ? <QueryErrorState error={executions.error} onRetry={() => { void executions.refetch(); }} className="m-4" /> : items.length === 0 ? <EmptyState compact title="This automation has not run yet" className="m-4" /> : (
        <>
          <ul className="divide-y divide-line md:hidden" aria-label="Runs for this automation">
            {items.map((execution) => <li key={execution.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 text-[13px] font-medium">{execution.subjectName}</p><AutomationExecutionBadge status={execution.status} /></div><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={execution.executedAt} /> · {automationSubjectLabel(execution.subjectType)}</p><p className="mt-0.5 text-[12px] text-ink-3">{execution.suppressionReason ?? execution.detail ?? "No details"}{execution.nextAttemptAt ? <> · tries again <DateTimeText iso={execution.nextAttemptAt} /></> : null}</p>{execution.actionResults?.length ? <div className="mt-2 flex flex-wrap gap-1">{execution.actionResults.map((action, index) => <Badge key={`${execution.id}-${action.key}-${index}`} variant={actionResultVariant(action.status)}>{automationActionResultLabel(action)}</Badge>)}</div> : null}</li>)}
          </ul>
          <Table className="hidden md:table"><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Result</TableHead><TableHead>What happened</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>{items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[12px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell><p className="font-medium">{execution.subjectName}</p><p className="text-[12px] text-ink-3">{automationSubjectLabel(execution.subjectType)}</p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{execution.actionResults?.map((action, index) => <Badge key={`${execution.id}-${action.key}-${index}`} variant={actionResultVariant(action.status)}>{automationActionResultLabel(action)}</Badge>) ?? <span className="text-ink-3">—</span>}</div></TableCell><TableCell className="max-w-sm text-[12px] leading-5 text-ink-3">{execution.suppressionReason ?? execution.detail ?? "No details"}{execution.nextAttemptAt ? <p>Tries again: <DateTimeText iso={execution.nextAttemptAt} /></p> : null}</TableCell></TableRow>)}</TableBody></Table>
        </>
      )}
    </section>
  </div>;
}
