"use client";

import { Plus, RefreshCw, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { AutomationAction, AutomationActionKey, AutomationExecution, AutomationTriggerKey } from "@/lib/domain/types";
import { DateTimeText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTION_LABELS, TRIGGER_LABELS } from "@/features/automations/labels";
import { automationTriggerParameterLabel, automationTriggerParams, hasValidAutomationTriggerParams } from "@/features/automations/form";

export default function AutomationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System"
        title="Automations"
        description="Expiry, win-back, inactivity and overdue-follow-up rules with persisted execution history. Outbound delivery remains sandboxed by default."
        actions={<NewRuleDialog />}
      />
      <Gate
        permission="automations.manage"
        fallback={
          <EmptyState
            icon={Zap}
            title="Automations are managed by owner and manager roles"
            description="Switch to the owner or manager persona to review and edit rules."
          />
        }
      >
        <AutomationContent />
      </Gate>
    </div>
  );
}

function NewRuleDialog() {
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTriggerKey>("membership_expiring");
  const [threshold, setThreshold] = useState("7");
  const [dedupe, setDedupe] = useState("24");
  const [actions, setActions] = useState<AutomationActionKey[]>(["create_task"]);
  const [messageTemplateId, setMessageTemplateId] = useState("");
  const templatesQuery = useApiQuery(qk.templates, (api) => api.listMessageTemplates());
  const selectedTemplate = templatesQuery.data?.find((template) => template.id === messageTemplateId);
  const queueMessageActive = actions.includes("queue_message");
  const create = useApiMutation((api) => {
    const triggerParams = automationTriggerParams(trigger, threshold);
    const builtActions: AutomationAction[] = actions.map((key) => key === "create_task" ? { key, taskOwnerRole: "salesperson", taskTitle: name.trim() || "Follow up with member" } : key === "queue_message" ? { key, templateId: messageTemplateId || undefined, channel: selectedTemplate?.channel ?? "whatsapp" } : { key });
    return api.createAutomationRule({ name: name.trim(), trigger, triggerParams, actions: builtActions, enabled: true, dedupeWindowHours: Math.max(1, Number(dedupe) || 24) });
  }, {
    onSuccess: async () => {
      toast.success("Automation rule created.");
      setOpen(false);
      setName("");
      setTrigger("membership_expiring");
      setThreshold("7");
      setDedupe("24");
      setActions(["create_task"]);
      setMessageTemplateId("");
      await invalidate([qk.automationRules]);
    },
  });
  const toggleAction = (key: AutomationActionKey, checked: boolean) => {
    setActions((current) => checked ? [...new Set([...current, key])] : current.filter((item) => item !== key));
    if (key === "queue_message" && checked && !messageTemplateId) setMessageTemplateId(templatesQuery.data?.[0]?.id ?? "");
  };
  const canCreate = Boolean(name.trim()) && actions.length > 0 && hasValidAutomationTriggerParams(trigger, threshold) && (!queueMessageActive || Boolean(messageTemplateId));

  return <>
    <Button onClick={() => setOpen(true)}><Plus /> New rule</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New automation rule</DialogTitle><DialogDescription>Start with a durable task or sandbox message. Every run is deduplicated and auditable.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Rule name" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Renewals — 7 days" /></Field>
          <Field label="When this happens"><Select value={trigger} onValueChange={(value) => setTrigger(value as AutomationTriggerKey)}><SelectTrigger aria-label="Automation trigger"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TRIGGER_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={automationTriggerParameterLabel(trigger)} hint={trigger === "membership_expiring" ? "Use commas for multiple checkpoints." : trigger === "membership_expired" ? "Use 0 for memberships that expired today." : undefined}><Input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="numeric" min={trigger === "membership_expired" ? 0 : 1} /></Field><Field label="Deduplication window (hours)"><Input value={dedupe} onChange={(event) => setDedupe(event.target.value)} inputMode="numeric" min={1} /></Field></div>
          <Field label="Actions"><div className="space-y-2">{(["create_task", "queue_message", "notify_manager"] as AutomationActionKey[]).map((key) => <label key={key} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-[13px]"><span>{ACTION_LABELS[key]}</span><Switch checked={actions.includes(key)} onCheckedChange={(checked) => toggleAction(key, checked)} aria-label={ACTION_LABELS[key]} /></label>)}</div></Field>
          {queueMessageActive ? <div className="rounded-md border border-line bg-sunken/40 p-3"><Field label="Message template" required hint="Marketing messages remain suppressed unless the member has an explicit opt-in.">{templatesQuery.isLoading ? <p className="text-[12px] text-ink-3">Loading templates…</p> : templatesQuery.isError ? <p className="text-[12px] text-danger">Message templates could not be loaded.</p> : templatesQuery.data?.length ? <Select value={messageTemplateId} onValueChange={setMessageTemplateId}><SelectTrigger aria-label="Message template"><SelectValue placeholder="Choose a template" /></SelectTrigger><SelectContent>{templatesQuery.data.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {template.channel}</SelectItem>)}</SelectContent></Select> : <p className="text-[12px] text-ink-3">Create a message template before enabling this action.</p>}</Field></div> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={!canCreate}>Create rule</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function AutomationContent() {
  const invalidate = useInvalidate();
  const [execPage, setExecPage] = useState(1);
  const [emailPage, setEmailPage] = useState(1);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>();
  const rulesQuery = useApiQuery(qk.automationRules, (api) => api.listAutomationRules());
  const executionInput = { page: execPage, pageSize: 15 };
  const executionsQuery = useRealtimeApiQuery({ queryKey: qk.automationExecutions({ page: execPage }), query: (api) => api.listAutomationExecutions(executionInput), subscribe: (api, onValue, onError) => api.subscribeAutomationExecutions(executionInput, onValue, onError) });
  const operationalEmailInput = { page: emailPage, pageSize: 15 };
  const operationalEmailsQuery = useRealtimeApiQuery({ queryKey: qk.operationalEmails({ page: emailPage }), query: (api) => api.listOperationalEmailDeliveries(operationalEmailInput), subscribe: (api, onValue, onError) => api.subscribeOperationalEmailDeliveries(operationalEmailInput, onValue, onError) });

  const toggle = useApiMutation((api, v: { id: string; enabled: boolean }) => api.updateAutomationRule(v.id, { enabled: v.enabled }), {
    onSuccess: async (_d, v) => {
      toast.success(v.enabled ? "Rule enabled." : "Rule paused.");
      await invalidate([qk.automationRules]);
    },
  });

  const executions = executionsQuery.data?.items ?? [];
  const sent30 = (rulesQuery.data ?? []).reduce((s, r) => s + r.executionsLast30Days, 0);
  const failed = executions.filter((e) => e.status === "failed").length;

  return (
    <Tabs defaultValue="rules">
      <TabsList>
        <TabsTrigger value="rules">Rules</TabsTrigger>
        <TabsTrigger value="activity">Activity log</TabsTrigger>
        <TabsTrigger value="email">Operational email</TabsTrigger>
      </TabsList>

      <TabsContent value="rules" className="space-y-4">
        {/* Outcome summary */}
        <section className="panel grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
          <Cell label="Actions this month" value={sent30} />
          <Cell label="Active rules" value={(rulesQuery.data ?? []).filter((r) => r.enabled).length} />
          <Cell label="Delivery mode" value="Sandbox" mono />
          <Cell label="Failures (page)" value={failed} tone={failed > 0 ? "warn" : undefined} />
        </section>

        <section className="panel overflow-hidden">
          {rulesQuery.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} cols={5} />
            </div>
          ) : rulesQuery.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => rulesQuery.refetch()} />
            </div>
          ) : (rulesQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No rules" className="border-0" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Rule</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead className="text-end">Runs · 30d</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="text-end">Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rulesQuery.data!.map((rule) => (
                  <TableRow key={rule.id} interactive onClick={() => (window.location.href = `/automations/${rule.id}`)}>
                    <TableCell>
                      <Link href={`/automations/${rule.id}`} className="font-medium hover:underline underline-offset-2">
                        {rule.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{TRIGGER_LABELS[rule.trigger]}</Badge>
                    </TableCell>
                    <TableCell className="text-[12.5px] text-ink-2">
                      {rule.actions.map((a) => ACTION_LABELS[a.key] ?? a.key).join(" · ")}
                    </TableCell>
                    <TableCell className="text-end tabular">{rule.executionsLast30Days}</TableCell>
                    <TableCell className="text-[12px] text-ink-3">
                      <RelativeText iso={rule.lastRunAt} />
                    </TableCell>
                    <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(v) => toggle.mutate({ id: rule.id, enabled: v })}
                        aria-label={`Enable ${rule.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </TabsContent>

      <TabsContent value="activity">
        <section className="panel overflow-hidden">
          {executionsQuery.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} cols={5} />
            </div>
          ) : executions.length === 0 ? (
            <EmptyState title="No executions yet" description="Rule runs will appear here with their delivery status." className="border-0" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>When</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.map((e) => (
                    <TableRow key={e.id} interactive onClick={() => setSelectedExecutionId(e.id)}>
                      <TableCell className="text-[12px] text-ink-2 whitespace-nowrap">
                        <DateTimeText iso={e.executedAt} />
                      </TableCell>
                      <TableCell className="max-w-52">
                        <Link href={`/automations/${e.ruleId}`} className="block truncate text-[12.5px] font-medium hover:underline underline-offset-2">
                          {e.ruleName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[12.5px]">{e.subjectName}</TableCell>
                      <TableCell className="text-[12.5px] text-ink-2">{e.action ? ACTION_LABELS[e.action] : `${e.actionResults?.length ?? 0} actions`}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "success" ? "success" : e.status === "failed" ? "signal" : "neutral"}>
                          {e.status === "skipped_duplicate" ? "skipped" : e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate text-[12px] text-ink-3" title={e.detail}>
                          {e.detail}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 pb-2">
                <DataPagination page={executionsQuery.data!} onPage={setExecPage} />
              </div>
            </>
          )}
        </section>
      </TabsContent>
      <TabsContent value="email">
        <section className="panel overflow-hidden">
          <header className="border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">Operational email ledger</h2><p className="mt-1 text-[10.5px] text-ink-3">Sandbox is the default. A suppressed record proves the trigger was captured without claiming provider delivery.</p></header>
          {operationalEmailsQuery.isLoading ? <div className="p-4"><TableSkeleton rows={8} cols={5} /></div> : operationalEmailsQuery.isError ? <div className="p-4"><ErrorState onRetry={() => operationalEmailsQuery.refetch()} /></div> : (operationalEmailsQuery.data?.items.length ?? 0) === 0 ? <EmptyState title="No operational email records" description="Trial, receipt, support, invoice, and subscription events will appear here when they occur." className="border-0" /> : <><Table><TableHeader><TableRow><TableHead>Queued</TableHead><TableHead>Message kind</TableHead><TableHead>Recipient</TableHead><TableHead>Template</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead></TableRow></TableHeader><TableBody>{operationalEmailsQuery.data!.items.map((delivery) => <TableRow key={delivery.id}><TableCell className="text-[11px]"><DateTimeText iso={delivery.queuedAt} /></TableCell><TableCell className="text-[12px] font-medium">{delivery.kind.replaceAll("_", " ")}</TableCell><TableCell className="max-w-56 truncate text-[11px] text-ink-2" title={delivery.recipientEmail ?? delivery.recipientReference}>{delivery.recipientEmail ?? delivery.recipientReference}</TableCell><TableCell><p className="font-mono text-[9px]">{delivery.templateVersion}</p><p className="mt-1 text-[9px] uppercase text-ink-3">{delivery.language}</p></TableCell><TableCell><Badge variant={delivery.status === "failed" ? "signal" : delivery.status === "delivered" ? "success" : "neutral"}>{delivery.status.replaceAll("_", " ")}</Badge>{delivery.suppressionReason ? <p className="mt-1 max-w-64 text-[9px] text-ink-3">{delivery.suppressionReason}</p> : null}</TableCell><TableCell className="text-[11px] tabular">{delivery.attempts.length} / {delivery.retryPolicy.maxAttempts}</TableCell></TableRow>)}</TableBody></Table><div className="px-4 pb-2"><DataPagination page={operationalEmailsQuery.data!} onPage={setEmailPage} /></div></>}
        </section>
      </TabsContent>
      <ExecutionDialog executionId={selectedExecutionId} onOpenChange={(open) => { if (!open) setSelectedExecutionId(undefined); }} />
    </Tabs>
  );
}

function statusLabel(status: AutomationExecution["status"]): string {
  if (status === "success") return "completed";
  if (status === "skipped_duplicate") return "duplicate";
  return status;
}

function ExecutionDialog({ executionId, onOpenChange }: { executionId?: string; onOpenChange: (open: boolean) => void }) {
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  const detailQuery = useApiQuery(
    qk.automationExecution(executionId ?? "closed"),
    (api) => api.getAutomationExecution(executionId!),
    { enabled: Boolean(executionId) },
  );
  const retry = useApiMutation((api) => api.retryAutomationExecution(executionId!, reason.trim()), {
    onSuccess: async () => {
      toast.success("Retry queued in the sandbox execution pipeline.");
      setReason("");
      await invalidate([["automationExecutions"]]);
    },
  });
  const execution = detailQuery.data;
  const canRetry = execution?.status === "failed" || execution?.actionResults.some((item) => item.status === "failed");
  return <Dialog open={Boolean(executionId)} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Automation execution</DialogTitle><DialogDescription>Persisted action and attempt history. Provider errors are redacted before display.</DialogDescription></DialogHeader><DialogBody className="space-y-4">{detailQuery.isLoading ? <TableSkeleton rows={4} cols={3} /> : detailQuery.isError || !execution ? <ErrorState onRetry={() => detailQuery.refetch()} /> : <>
    <div className="grid gap-3 rounded-md border border-line bg-sunken/40 p-3 sm:grid-cols-2"><div><p className="eyebrow">Rule</p><p className="mt-1 text-[13px] font-medium">{execution.ruleName}</p></div><div><p className="eyebrow">Status</p><Badge className="mt-1" variant={execution.status === "failed" ? "signal" : execution.status === "completed" || execution.status === "success" ? "success" : "neutral"}>{statusLabel(execution.status)}</Badge></div><div><p className="eyebrow">Subject</p><p className="mt-1 text-[13px]">{execution.subjectName}</p></div><div><p className="eyebrow">Executed</p><p className="mt-1 text-[12px]"><DateTimeText iso={execution.executedAt} /></p></div>{execution.dedupeKey ? <div className="sm:col-span-2"><p className="eyebrow">Dedupe key</p><p className="mt-1 break-all font-mono text-[11px] text-ink-2">{execution.dedupeKey}</p></div> : null}{execution.suppressionReason ? <div className="sm:col-span-2"><p className="eyebrow">Suppression</p><p className="mt-1 text-[12px] text-ink-2">{execution.suppressionReason}</p></div> : null}</div>
    <div><p className="eyebrow mb-2">Attempts</p><div className="overflow-hidden rounded-md border border-line"><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Attempt</TableHead><TableHead>Status</TableHead><TableHead>When / next attempt</TableHead></TableRow></TableHeader><TableBody>{execution.attemptHistory.map((attempt, index) => <TableRow key={`${attempt.action}:${attempt.attempt}:${index}`}><TableCell>{ACTION_LABELS[attempt.action]}</TableCell><TableCell>{attempt.attempt} / {execution.retryPolicy.maxAttempts}</TableCell><TableCell><Badge variant={attempt.status === "failed" ? "signal" : attempt.status === "completed" ? "success" : "neutral"}>{attempt.status}</Badge></TableCell><TableCell className="text-[11px] text-ink-3"><DateTimeText iso={attempt.occurredAt} />{attempt.nextAttemptAt ? <> · next <DateTimeText iso={attempt.nextAttemptAt} /></> : null}{attempt.reason ? <p className="mt-1 max-w-72 truncate" title={attempt.reason}>{attempt.reason}</p> : null}</TableCell></TableRow>)}</TableBody></Table></div></div>
    {canRetry ? <Field label="Retry reason" required hint="Manual retries are audited and remain sandboxed."><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why should this failed execution be retried?" /></Field> : null}
  </>}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>{canRetry ? <Button onClick={() => retry.mutate()} loading={retry.isPending} disabled={!reason.trim()}><RefreshCw /> Retry failed actions</Button> : null}</DialogFooter></DialogContent></Dialog>;
}

function Cell({ label, value, mono, tone }: { label: string; value: React.ReactNode; mono?: boolean; tone?: "warn" }) {
  return (
    <div className="px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <div className={`mt-1 text-[18px] leading-none ${mono ? "font-mono" : "tabular"} ${tone === "warn" ? "text-warning-deep" : ""}`}>
        {value}
      </div>
    </div>
  );
}
