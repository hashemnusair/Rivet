"use client";

import { CheckCircle2, MessageCircle, PhoneCall, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { LeadSummary, RenewalQueueItem, Task } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatDate, todayISODate } from "@/lib/utils/dates";
import { DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { LeadStageChip, MembershipStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { LogContactForm } from "@/features/crm/contact-work-panel";

type QueueKey = "overdue" | "today" | "expiring" | "expired";

const QUEUE_DEFS: Array<{ key: QueueKey; label: string; hint: string }> = [
  { key: "overdue", label: "Overdue follow-ups", hint: "Past their due time — work these first." },
  { key: "today", label: "Due today", hint: "Scheduled for today." },
  { key: "expiring", label: "Expiring ≤ 14 days", hint: "Members about to lapse — call before expiry." },
  { key: "expired", label: "Expired ≤ 45 days", hint: "Win-back territory." },
];

type SelectedWork =
  | { kind: "lead"; lead: LeadSummary; task?: Task }
  | { kind: "renewal"; item: RenewalQueueItem; task?: Task };

/**
 * The daily sales cockpit. One screen that answers: what do I do right now,
 * who is it, what happened last time, and what happens next.
 */
export default function QueuesPage() {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const role = session?.roles[0];
  const mineOnly = role === "salesperson";
  const [queue, setQueue] = useState<QueueKey>("overdue");
  const [selected, setSelected] = useState<SelectedWork | null>(null);
  const workPanelRef = useRef<HTMLElement | null>(null);

  // Below xl the work panel stacks under the list — bring it into view when
  // a row is picked, or the selection appears to do nothing on small screens.
  useEffect(() => {
    if (selected && window.innerWidth < 1280) {
      workPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  const tasksQuery = useApiQuery(qk.tasks({ queue: true }), (api) => api.listTasks({ status: "open", pageSize: 100 }));
  const leadsQuery = useApiQuery(qk.leads({ open: true }), (api) =>
    api.listLeads({ stage: ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"], pageSize: 100 }),
  );
  const expiringQuery = useApiQuery(qk.renewalQueue({ bucket: "expiring" }), (api) =>
    api.listRenewalQueue({ bucket: "expiring", branchId: session?.activeBranchId, pageSize: 50 }),
  );
  const expiredQuery = useApiQuery(qk.renewalQueue({ bucket: "expired" }), (api) =>
    api.listRenewalQueue({ bucket: "expired", branchId: session?.activeBranchId, pageSize: 50 }),
  );

  const completeTask = useApiMutation((api, taskId: string) => api.completeTask(taskId, { outcome: "Completed from queue" }), {
    onSuccess: async () => {
      toast.success("Task completed.");
      await invalidate();
      setSelected(null);
    },
  });

  const now = new Date().toISOString();
  const todayEnd = `${todayISODate()}T23:59:59.999Z`;

  const myTasks = useMemo(() => {
    const items = tasksQuery.data?.items ?? [];
    return mineOnly ? items.filter((t) => t.ownerId === session?.user.id) : items;
  }, [tasksQuery.data, mineOnly, session?.user.id]);

  const overdueTasks = myTasks.filter((t) => t.dueAt < now);
  const todayTasks = myTasks.filter((t) => t.dueAt >= now && t.dueAt <= todayEnd);

  const openLeads = useMemo(() => leadsQuery.data?.items ?? [], [leadsQuery.data]);
  const counts: Record<QueueKey, number> = {
    overdue: overdueTasks.length,
    today: todayTasks.length,
    expiring: expiringQuery.data?.totalItems ?? 0,
    expired: expiredQuery.data?.totalItems ?? 0,
  };

  const isLoading = tasksQuery.isLoading || leadsQuery.isLoading;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Growth"
        title="Follow-ups"
        description={mineOnly ? "Your follow-ups, your leads, your renewals." : "The whole team's follow-up load."}
      />

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Queue rail */}
        <nav aria-label="Queues" className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
          {QUEUE_DEFS.map((q) => (
            <button
              key={q.key}
              type="button"
              onClick={() => {
                setQueue(q.key);
                setSelected(null);
              }}
              aria-pressed={queue === q.key}
              className={cn(
                "flex shrink-0 items-center justify-between gap-3 rounded-md border px-3 py-2 text-start text-[13px] transition-colors cursor-pointer lg:w-full",
                queue === q.key ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-line-3",
              )}
            >
              <span className="font-medium">{q.label}</span>
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-[11px] tabular",
                  queue === q.key ? "bg-paper/15 text-paper" : counts[q.key] > 0 && (q.key === "overdue" || q.key === "expiring") ? "bg-signal-bg text-signal-deep" : "bg-sunken text-ink-2",
                )}
              >
                {counts[q.key]}
              </span>
            </button>
          ))}
        </nav>

        {/* Work surface */}
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <section className="panel min-h-[420px] overflow-hidden self-start">
            <header className="border-b border-line px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">{QUEUE_DEFS.find((q) => q.key === queue)?.label}</h2>
              <p className="text-[12px] text-ink-3">{QUEUE_DEFS.find((q) => q.key === queue)?.hint}</p>
            </header>
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <QueueItems
                queue={queue}
                overdueTasks={overdueTasks}
                todayTasks={todayTasks}
                leads={openLeads}
                expiring={expiringQuery.data?.items ?? []}
                expired={expiredQuery.data?.items ?? []}
                tasks={myTasks}
                selected={selected}
                onSelect={setSelected}
              />
            )}
          </section>

          {/* Work drawer */}
          {selected ? (
            <aside ref={workPanelRef} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="queue-work-panel">
              <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="eyebrow">{selected.kind === "lead" ? "Lead" : "Renewal call"}</p>
                  <h3 className="truncate font-display text-[16px] font-semibold">
                    {selected.kind === "lead" ? selected.lead.fullName : selected.item.member.fullName}
                  </h3>
                  <p className="font-mono text-[11.5px] text-ink-3" dir="ltr">
                    {selected.kind === "lead" ? selected.lead.phone : selected.item.member.phone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close work panel"
                  className="rounded-sm p-1 text-ink-3 hover:bg-sunken hover:text-ink cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </header>
              <div className="space-y-4 px-4 py-3.5">
                {selected.kind === "lead" ? (
                  <LeadContext lead={selected.lead} />
                ) : (
                  <RenewalContext item={selected.item} />
                )}

                <div className="border-t border-line pt-3.5">
                  <p className="eyebrow mb-2.5">Log contact</p>
                  <LogContactForm
                    subject={selected.kind === "lead" ? "lead" : "member"}
                    leadId={selected.kind === "lead" ? selected.lead.id : undefined}
                    memberId={selected.kind === "renewal" ? selected.item.member.id : undefined}
                    currentStage={selected.kind === "lead" ? selected.lead.stage : undefined}
                    compact
                    onLogged={() => setSelected(null)}
                  />
                </div>

                <div className="flex gap-2 border-t border-line pt-3">
                  {selected.task ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => completeTask.mutate(selected.task!.id)}
                      loading={completeTask.isPending}
                    >
                      <CheckCircle2 /> Complete task
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    disabled
                    title="WhatsApp delivery is not configured"
                  >
                    <MessageCircle /> WhatsApp unavailable
                  </Button>
                  {selected.kind === "lead" ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/crm/leads/${selected.lead.id}`}>Open</Link>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/members/${selected.item.member.id}`}>Open</Link>
                    </Button>
                  )}
                </div>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QueueItems({
  queue,
  overdueTasks,
  todayTasks,
  leads,
  expiring,
  expired,
  tasks,
  selected,
  onSelect,
}: {
  queue: QueueKey;
  overdueTasks: Task[];
  todayTasks: Task[];
  leads: LeadSummary[];
  expiring: RenewalQueueItem[];
  expired: RenewalQueueItem[];
  tasks: Task[];
  selected: SelectedWork | null;
  onSelect: (w: SelectedWork) => void;
}) {
  const taskFor = (leadId?: string, memberId?: string) =>
    tasks.find((t) => (leadId && t.leadId === leadId) || (memberId && t.memberId === memberId));

  if (queue === "overdue" || queue === "today") {
    const items = queue === "overdue" ? overdueTasks : todayTasks;
    if (items.length === 0) return <EmptyQueue text={queue === "overdue" ? "Nothing overdue. Good." : "Nothing else due today."} />;
    return (
      <ul className="divide-y divide-line">
        {items.map((task) => {
          const lead = task.leadId ? leads.find((l) => l.id === task.leadId) : undefined;
          return (
            <QueueRow
              key={task.id}
              name={task.subjectName}
              sub={task.title}
              rightTop={<RelativeText iso={task.dueAt} className={queue === "overdue" ? "font-medium text-danger" : ""} />}
              rightBottom={<span className="text-[11px] text-ink-3">{task.ownerName}</span>}
              selected={selected?.task?.id === task.id}
              onClick={lead ? () => onSelect({ kind: "lead", lead, task }) : undefined}
              memberHref={task.memberId ? `/members/${task.memberId}` : !lead && task.leadId ? `/crm/leads/${task.leadId}` : undefined}
            />
          );
        })}
      </ul>
    );
  }

  const items = queue === "expiring" ? expiring : expired;
  if (items.length === 0) return <EmptyQueue text={queue === "expiring" ? "Nothing expiring in the next two weeks." : "No recently expired members."} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <QueueRow
          key={item.membership.id}
          name={item.member.fullName}
          sub={
            <span className="flex items-center gap-2">
              <MembershipStatusChip status={item.membership.status} />
              <span className="text-[11.5px] text-ink-3">
                {item.membership.planName} · ends {formatDate(item.membership.endDate)}
              </span>
            </span>
          }
          rightTop={<DaysUntilText date={item.membership.endDate} />}
          rightBottom={
            item.lastContactAt ? (
              <span className="text-[11px] text-ink-3">
                called <RelativeText iso={item.lastContactAt} />
              </span>
            ) : (
              <span className="text-[11px] font-medium text-warning-deep">not contacted</span>
            )
          }
          selected={selected?.kind === "renewal" && selected.item.membership.id === item.membership.id}
          onClick={() => onSelect({ kind: "renewal", item, task: taskFor(undefined, item.member.id) })}
        />
      ))}
    </ul>
  );
}

function QueueRow({
  name,
  sub,
  rightTop,
  rightBottom,
  selected,
  onClick,
  disabled,
  memberHref,
}: {
  name: string;
  sub: React.ReactNode;
  rightTop?: React.ReactNode;
  rightBottom?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  memberHref?: string;
}) {
  const inner = (
    <>
      <Monogram name={name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate text-[12px] text-ink-3">{sub}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="block text-[12px]">{rightTop}</span>
        {rightBottom}
      </span>
      <PhoneCall className="size-3.5 shrink-0 text-ink-4" aria-hidden />
    </>
  );
  if (memberHref) {
    return (
      <li>
        <Link href={memberHref} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/40">
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors cursor-pointer",
          selected ? "bg-sunken/70" : "hover:bg-sunken/40",
          disabled && "cursor-default opacity-80",
        )}
      >
        {inner}
      </button>
    </li>
  );
}

function EmptyQueue({ text }: { text: string }) {
  return <EmptyState title={text} compact className="m-4" icon={UserPlus} />;
}

function LeadContext({ lead }: { lead: LeadSummary }) {
  return (
    <dl className="space-y-1.5 text-[12.5px]">
      <ContextRow label="Stage"><LeadStageChip stage={lead.stage} /></ContextRow>
      <ContextRow label="Owner">{lead.ownerName ?? "Unassigned"}</ContextRow>
      <ContextRow label="Branch">{lead.branchName}</ContextRow>
      {lead.expectedValue ? <ContextRow label="Expected"><MoneyText money={lead.expectedValue} /></ContextRow> : null}
      {lead.lastContactAt ? (
        <ContextRow label="Last contact">
          <RelativeText iso={lead.lastContactAt} /> {lead.lastContactOutcome ? `· ${lead.lastContactOutcome.replace(/_/g, " ")}` : ""}
        </ContextRow>
      ) : (
        <ContextRow label="Last contact"><span className="text-warning-deep font-medium">never contacted</span></ContextRow>
      )}
    </dl>
  );
}

function RenewalContext({ item }: { item: RenewalQueueItem }) {
  return (
    <dl className="space-y-1.5 text-[12.5px]">
      <ContextRow label="Plan">{item.membership.planName}</ContextRow>
      <ContextRow label="Ends">
        <span className="tabular">{item.membership.endDate}</span> <DaysUntilText date={item.membership.endDate} />
      </ContextRow>
      {item.membership.outstanding.amount > 0 ? (
        <ContextRow label="Balance">
          <MoneyText money={item.membership.outstanding} className="text-warning-deep" />
        </ContextRow>
      ) : null}
      {item.lastContactAt ? (
        <ContextRow label="Last contact">
          <RelativeText iso={item.lastContactAt} /> {item.lastContactOutcome ? `· ${item.lastContactOutcome.replace(/_/g, " ")}` : ""}
        </ContextRow>
      ) : (
        <ContextRow label="Last contact"><span className="text-warning-deep font-medium">never contacted</span></ContextRow>
      )}
    </dl>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}
