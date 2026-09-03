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
import { AutomationExecutionBadge, automationActionDescription, automationTriggerDescription } from "@/features/automations/monitoring-ui";

export default function RuleMonitoringClient() {
  const { ruleId } = useParams<{ ruleId: string }>();
  const rule = useApiQuery(qk.automationRule(ruleId), (api) => api.getAutomationRule(ruleId));
  const summary = useApiQuery(qk.automationMonitoring, (api) => api.getAutomationMonitoringSummary());
  const executionInput = { ruleId, pageSize: 50 };
  const executions = useApiQuery(qk.automationExecutions(executionInput), (api) => api.listAutomationExecutions(executionInput));

  if (rule.isLoading) return <div className="space-y-4"><TableSkeleton rows={2} cols={3} /><TableSkeleton rows={6} cols={5} /></div>;
  if (rule.isError || !rule.data) return <QueryErrorState error={rule.error} onRetry={() => { void rule.refetch(); }} notFoundTitle="Automation rule not found" />;
  const value = rule.data;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: "Automations", href: "/automations" }, { label: value.name }]} />
    <PageHeader sectionLabel="Read-only automation rule" title={value.name} description="Inspect the saved trigger, actions, deduplication policy, and immutable execution history." actions={<Badge variant={value.enabled ? "warning" : "neutral"} dot>{value.enabled ? "enabled · held" : "paused"}</Badge>} />
    {summary.data?.globallyPaused ? <section className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3" role="status"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-deep" /><div><p className="text-[13px] font-semibold text-warning-deep">This rule cannot run</p><p className="mt-1 text-[12px] text-ink-2">{summary.data.pauseReason}</p></div></div></section> : null}
    <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="context-label">Persisted definition</p><h2 className="mt-1 text-[15px] font-semibold">Configuration</h2></header><dl className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4"><div className="p-4"><dt className="context-label">Trigger and audience</dt><dd className="mt-2 text-[12.5px] leading-5">{automationTriggerDescription(value)}</dd></div><div className="p-4"><dt className="context-label">Actions</dt><dd className="mt-2 text-[12.5px] leading-5">{automationActionDescription(value)}</dd></div><div className="p-4"><dt className="context-label">Deduplication</dt><dd className="mt-2 text-[12.5px]">{value.dedupeWindowHours} hours</dd><dd className="mt-1 text-[11px] text-ink-3">Repeated subjects are suppressed within this window.</dd></div><div className="p-4"><dt className="context-label">Observed activity</dt><dd className="mt-2 text-[12.5px]">{value.executionsLast30Days} executions in 30 days</dd><dd className="mt-1 text-[11px] text-ink-3">Last run: <DateTimeText iso={value.lastRunAt} /></dd></div></dl></section>
    <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="context-label">Immutable history</p><h2 className="mt-1 text-[15px] font-semibold">Executions for this rule</h2></header>{executions.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : executions.isError ? <QueryErrorState error={executions.error} onRetry={() => { void executions.refetch(); }} className="m-4" /> : executions.data?.items.length === 0 ? <EmptyState compact title="This rule has never run" description="No execution records exist for this rule." className="m-4" /> : <Table><TableHeader><TableRow><TableHead>Executed</TableHead><TableHead>Subject</TableHead><TableHead>Result</TableHead><TableHead>Action outcomes</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader><TableBody>{executions.data?.items.map((execution) => <TableRow key={execution.id}><TableCell className="whitespace-nowrap text-[11px]"><DateTimeText iso={execution.executedAt} /></TableCell><TableCell><p className="font-medium">{execution.subjectName}</p><p className="font-mono text-[10.5px] text-ink-3">{execution.subjectType} · {execution.subjectId.slice(0, 8)}</p></TableCell><TableCell><AutomationExecutionBadge status={execution.status} /></TableCell><TableCell><div className="flex flex-wrap gap-1">{execution.actionResults?.map((action, index) => <Badge key={`${execution.id}-${action.key}-${index}`} variant={action.status === "completed" ? "success" : action.status === "failed" ? "danger" : action.status === "suppressed" ? "warning" : "neutral"}>{action.key.replaceAll("_", " ")} · {action.status}</Badge>) ?? <span className="text-ink-3">—</span>}</div></TableCell><TableCell className="max-w-sm text-[11.5px] leading-5 text-ink-3">{execution.suppressionReason ?? execution.detail ?? "No additional detail"}{execution.nextAttemptAt ? <p>Next attempt: <DateTimeText iso={execution.nextAttemptAt} /></p> : null}</TableCell></TableRow>)}</TableBody></Table>}</section>
  </div>;
}
