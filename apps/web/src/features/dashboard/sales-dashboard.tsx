"use client";

import { ArrowRight, CheckCircle2, PhoneCall } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { todayISODate, formatDate, formatTime } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { LeadStageChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";

/**
 * The salesperson's cockpit: what needs action now, how the month is going,
 * and a direct line into each follow-up.
 */
export function SalesDashboard() {
  const { session } = useApp();
  const today = todayISODate();
  const invalidate = useInvalidate();

  const tasksQuery = useApiQuery(qk.tasks({ mine: true }), (api) =>
    api.listTasks({ ownerId: session?.user.id, status: "open", pageSize: 10 }),
  );
  const leadsQuery = useApiQuery(qk.leads({ mine: true, open: true }), (api) =>
    api.listLeads({ ownerId: session?.user.id, stage: ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"], pageSize: 8, sort: "nextFollowUpAt" }),
  );
  const dashQuery = useApiQuery(qk.dashboard(session?.activeBranchId), (api) =>
    api.getDashboard({ branchId: session?.activeBranchId, from: today, to: today }),
  );

  const completeTask = useApiMutation((api, v: { taskId: string; outcome: string }) => api.completeTask(v.taskId, { outcome: v.outcome }), {
    onSuccess: async () => {
      toast.success("Follow-up completed.");
      await invalidate();
    },
  });

  if (tasksQuery.isError) return <ErrorState onRetry={() => tasksQuery.refetch()} />;

  const me = dashQuery.data?.leaderboard.find((r) => r.userId === session?.user.id);
  const tasks = tasksQuery.data?.items ?? [];
  const overdue = tasks.filter((t) => t.dueAt < new Date().toISOString());

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={formatDate(today)}
        title={`Your day, ${session?.user.name.split(" ")[0] ?? ""}`}
        description="Everything due now, then everything that makes this month count."
        actions={
          <Button asChild>
            <Link href="/crm/queues">
              Open work queues <ArrowRight />
            </Link>
          </Button>
        }
      />

      <section aria-label="Your numbers" className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        {[
          { label: "Overdue follow-ups", value: overdue.length, danger: overdue.length > 0 },
          { label: "Due today", value: tasks.length - overdue.length, danger: false },
          { label: "Collected this month", value: <MoneyText money={me?.revenueCollected ?? money(0)} compact />, danger: false },
          { label: "Leads converted", value: me?.leadsConverted ?? 0, danger: false },
        ].map((cell) => (
          <div key={cell.label} className="px-4 py-3.5">
            <p className="eyebrow">{cell.label}</p>
            <div className={cn("mt-1 text-[22px] font-medium leading-none tabular", cell.danger && "text-danger")}>
              {tasksQuery.isLoading ? <Skeleton className="h-6 w-10" /> : cell.value}
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Task list */}
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Follow-ups</h2>
            <Link href="/crm/queues" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              All queues <ArrowRight className="size-3" />
            </Link>
          </header>
          {tasksQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">
              Nothing due. New leads and renewal calls will land here.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((task) => {
                const isOverdue = task.dueAt < new Date().toISOString();
                const href = task.leadId ? `/crm/leads/${task.leadId}` : task.memberId ? `/members/${task.memberId}` : "/crm/queues";
                return (
                  <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      type="button"
                      aria-label={`Complete: ${task.title}`}
                      onClick={() =>
                        completeTask.mutate({ taskId: task.id, outcome: "Completed from dashboard" })
                      }
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-3 text-transparent transition-colors hover:border-success hover:text-success cursor-pointer"
                    >
                      <CheckCircle2 className="size-4" />
                    </button>
                    <Link href={href} className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium hover:underline underline-offset-2">{task.subjectName}</span>
                      <span className="block truncate text-[12px] text-ink-3">{task.title}</span>
                    </Link>
                    <span className={cn("shrink-0 text-[11.5px] tabular", isOverdue ? "font-medium text-danger" : "text-ink-3")}>
                      {isOverdue ? <RelativeText iso={task.dueAt} /> : formatTime(task.dueAt)}
                    </span>
                    <Button asChild variant="secondary" size="icon-sm" aria-label="Open contact">
                      <Link href={href}>
                        <PhoneCall />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* My pipeline */}
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Your open leads</h2>
            <Link href="/crm/pipeline" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Pipeline <ArrowRight className="size-3" />
            </Link>
          </header>
          {leadsQuery.isLoading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (leadsQuery.data?.items.length ?? 0) === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-ink-3">No open leads assigned to you right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {leadsQuery.data!.items.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/crm/leads/${lead.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{lead.fullName}</span>
                      <span className="block font-mono text-[11.5px] text-ink-3">{lead.phone}</span>
                    </span>
                    {lead.expectedValue ? <MoneyText money={lead.expectedValue} className="shrink-0 text-[12px] text-ink-2" /> : null}
                    <LeadStageChip stage={lead.stage} />
                    <span className={cn("w-16 shrink-0 text-end text-[11.5px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
                      {lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} /> : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
