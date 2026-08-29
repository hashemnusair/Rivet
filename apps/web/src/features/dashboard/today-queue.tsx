"use client";

import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  ListChecks,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import type { TodayQueueData, TodayQueueItem, TodayQueueKind } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";

const KIND_META: Record<TodayQueueKind, { icon: LucideIcon; label: string }> = {
  follow_up: { icon: CalendarClock, label: "Follow-up" },
  renewal: { icon: ClipboardCheck, label: "Renewal" },
  outstanding_balance: { icon: Banknote, label: "Balance" },
  access_denial: { icon: DoorOpen, label: "Entry" },
  approval: { icon: ShieldAlert, label: "Approval" },
  cash_variance: { icon: ListChecks, label: "Cash" },
  facility_task: { icon: Wrench, label: "Facility" },
};

export function TodayQueue({
  data,
  loading = false,
  initialVisible = 6,
  className,
}: {
  data?: TodayQueueData;
  loading?: boolean;
  initialVisible?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const invalidate = useInvalidate();
  const completeTask = useApiMutation(
    (api, taskId: string) => api.completeTask(taskId, { outcome: "Completed from Today" }),
    {
      successMessage: "Done. The next priority is ready.",
      onSuccess: async () => invalidate(),
    },
  );
  const items = data?.items ?? [];
  const visibleItems = expanded ? items : items.slice(0, initialVisible);
  const hiddenItems = Math.max(0, items.length - visibleItems.length);

  return (
    <section className={cn("panel overflow-hidden", className)} aria-labelledby="today-queue-title">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-ink text-paper" aria-hidden>
              <ListChecks className="size-3.5" />
            </span>
            <h2 id="today-queue-title" className="text-[15px] font-semibold tracking-[-0.01em]">Today</h2>
          </div>
          <p className="mt-2 max-w-[56ch] text-[11.5px] leading-relaxed text-ink-3">
            Start at the top. RIVET has already put the work in order.
          </p>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-end" aria-live="polite">
            <p className="text-[18px] font-semibold leading-none tabular">{data?.totalItems ?? 0}</p>
            <p className="mt-1 text-[10.5px] text-ink-3">
              {(data?.urgentItems ?? 0) > 0 ? `${data?.urgentItems} urgent` : "items left"}
            </p>
          </div>
        )}
      </header>

      {loading ? (
        <div className="space-y-3 p-4 sm:p-5" aria-label="Loading today's work">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto size-5 text-success" aria-hidden />
          <p className="mt-3 text-[13px] font-semibold">You&apos;re clear for now</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-[11.5px] leading-relaxed text-ink-3">
            New follow-ups, balances, entry problems, and approvals will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          <ol className="divide-y divide-line" aria-label="Prioritized work for today">
            {visibleItems.map((item, index) => (
              <TodayQueueRow
                key={item.id}
                item={item}
                first={index === 0}
                completing={completeTask.isPending && completeTask.variables === item.action.taskId}
                onComplete={(taskId) => completeTask.mutate(taskId)}
              />
            ))}
          </ol>
          {hiddenItems > 0 ? (
            <div className="border-t border-line bg-sunken/25 px-4 py-2 text-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                Show {hiddenItems} more <ArrowRight />
              </Button>
            </div>
          ) : expanded && items.length > initialVisible ? (
            <div className="flex flex-wrap items-center justify-center gap-x-3 border-t border-line bg-sunken/25 px-4 py-2 text-center">
              {data && data.totalItems > data.items.length ? (
                <span className="text-[10.5px] text-ink-3">Showing the top {data.items.length} of {data.totalItems}</span>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                Show less
              </Button>
            </div>
          ) : data && data.totalItems > data.items.length ? (
            <p className="border-t border-line bg-sunken/25 px-4 py-2.5 text-center text-[10.5px] text-ink-3">
              Showing the {data.items.length} highest-priority items.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function TodayQueueRow({
  item,
  first,
  completing,
  onComplete,
}: {
  item: TodayQueueItem;
  first: boolean;
  completing: boolean;
  onComplete: (taskId: string) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const eventAt = item.dueAt ?? item.occurredAt;
  const urgent = item.priority === "urgent";

  return (
    <li className={cn("relative grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors sm:grid-cols-[20px_minmax(0,1fr)_auto] sm:px-5", first && urgent ? "bg-danger-bg/35" : "hover:bg-sunken/35")}>
      <Icon className={cn("size-4", urgent ? "text-danger" : item.priority === "high" ? "text-warning-deep" : "text-ink-3")} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {first ? <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-signal-deep">Do this next</span> : null}
          <span className="text-[10.5px] text-ink-3">{meta.label}</span>
          {item.branchName ? <span className="truncate text-[10.5px] text-ink-4">{item.branchName}</span> : null}
        </div>
        <Link href={item.href} className="mt-0.5 block truncate text-[13px] font-semibold text-ink outline-none hover:underline focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4">
          {item.title}
        </Link>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
          <span className="truncate">{item.detail}</span>
          {item.amount ? <MoneyText money={item.amount} signed={item.kind === "cash_variance"} className="font-medium text-ink-2" /> : null}
          {eventAt ? <span className={cn("shrink-0", urgent && "font-medium text-danger")}><RelativeText iso={eventAt} /></span> : null}
        </p>
      </div>
      <div className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
        {item.action.kind === "complete_task" && item.action.taskId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={completing}
            disabled={completing}
            onClick={() => onComplete(item.action.taskId!)}
            aria-label={`Complete ${item.title}`}
          >
            <Check /> {item.action.label}
          </Button>
        ) : (
          <Button asChild variant={first && urgent ? "primary" : "secondary"} size="sm">
            <Link href={item.href} aria-label={`${item.action.label}: ${item.title}`}>
              {item.action.label} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
