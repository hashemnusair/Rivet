"use client";

import { Plus, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { AutomationAction, AutomationActionKey, AutomationTriggerKey } from "@/lib/domain/types";
import { DateTimeText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTION_LABELS, TRIGGER_LABELS } from "@/features/automations/labels";

export default function AutomationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System"
        title="Automations"
        description="Rules that never forget: expiry reminders, win-backs, inactivity nudges and overdue follow-ups. Delivery runs in sandbox mode for the demo."
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
  const create = useApiMutation((api) => {
    const numeric = threshold.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
    const triggerParams: Record<string, number | number[] | string> = trigger === "membership_expiring" ? { daysBefore: numeric } : trigger === "membership_expired" ? { daysAfter: numeric[0] ?? 1 } : trigger === "member_inactive" || trigger === "payment_outstanding" ? { days: numeric[0] ?? 7 } : { hours: numeric[0] ?? 24 };
    const builtActions: AutomationAction[] = actions.map((key) => key === "create_task" ? { key, taskOwnerRole: "salesperson", taskTitle: name.trim() || "Follow up with member" } : key === "queue_message" ? { key, channel: "whatsapp" } : { key });
    return api.createAutomationRule({ name: name.trim(), trigger, triggerParams, actions: builtActions, enabled: true, dedupeWindowHours: Math.max(1, Number(dedupe) || 24) });
  }, {
    onSuccess: async () => {
      toast.success("Automation rule created.");
      setOpen(false);
      setName("");
      await invalidate([qk.automationRules]);
    },
  });
  const toggleAction = (key: AutomationActionKey, checked: boolean) => setActions((current) => checked ? [...new Set([...current, key])] : current.filter((item) => item !== key));

  return <>
    <Button onClick={() => setOpen(true)}><Plus /> New rule</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>New automation rule</DialogTitle><DialogDescription>Start with a durable task or sandbox message. Every run is deduplicated and auditable.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Rule name" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Renewals — 7 days" /></Field>
          <Field label="When this happens"><Select value={trigger} onValueChange={(value) => setTrigger(value as AutomationTriggerKey)}><SelectTrigger aria-label="Automation trigger"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TRIGGER_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={trigger === "membership_expiring" ? "Days before expiry" : trigger.includes("lead") || trigger === "follow_up_overdue" ? "Hours" : "Days"} hint={trigger === "membership_expiring" ? "Use commas for multiple checkpoints." : undefined}><Input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="numeric" /></Field><Field label="Deduplication window (hours)"><Input value={dedupe} onChange={(event) => setDedupe(event.target.value)} inputMode="numeric" /></Field></div>
          <Field label="Actions"><div className="space-y-2">{(["create_task", "queue_message", "notify_manager"] as AutomationActionKey[]).map((key) => <label key={key} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-[13px]"><span>{ACTION_LABELS[key]}</span><Switch checked={actions.includes(key)} onCheckedChange={(checked) => toggleAction(key, checked)} aria-label={ACTION_LABELS[key]} /></label>)}</div></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim() || actions.length === 0}>Create rule</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function AutomationContent() {
  const invalidate = useInvalidate();
  const [execPage, setExecPage] = useState(1);
  const rulesQuery = useApiQuery(qk.automationRules, (api) => api.listAutomationRules());
  const executionsQuery = useApiQuery(qk.automationExecutions({ page: execPage }), (api) =>
    api.listAutomationExecutions({ page: execPage, pageSize: 15 }),
  );

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
                    <TableRow key={e.id}>
                      <TableCell className="text-[12px] text-ink-2 whitespace-nowrap">
                        <DateTimeText iso={e.executedAt} />
                      </TableCell>
                      <TableCell className="max-w-52">
                        <Link href={`/automations/${e.ruleId}`} className="block truncate text-[12.5px] font-medium hover:underline underline-offset-2">
                          {e.ruleName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-[12.5px]">{e.subjectName}</TableCell>
                      <TableCell className="text-[12.5px] text-ink-2">{ACTION_LABELS[e.action]}</TableCell>
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
    </Tabs>
  );
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
