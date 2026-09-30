"use client";

import {
  ArrowRight,
  Banknote,
  Boxes,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cog,
  DoorOpen,
  LifeBuoy,
  ListChecks,
  ShieldAlert,
  Wrench,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { LogContactForm } from "@/features/crm/contact-work-panel";
import type { TodayQueueData, TodayQueueItem, TodayQueueKind } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { translate } from "@/lib/i18n/dictionary";
import { en } from "@/lib/i18n/messages/en";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { todayActionLabel, todayItemDetail, todayItemTitle } from "./today-queue-copy";

const KIND_ICON: Record<TodayQueueKind, LucideIcon> = {
  follow_up: CalendarClock,
  at_risk: UserRoundSearch,
  renewal: ClipboardCheck,
  outstanding_balance: Banknote,
  access_denial: DoorOpen,
  approval: ShieldAlert,
  cash_variance: ListChecks,
  facility_task: Wrench,
  branch_checklist: ClipboardCheck,
  equipment_issue: Cog,
  low_stock: Boxes,
  support_case: LifeBuoy,
};

const defaultT: TFunction = (key, vars) => translate({ messages: en, fallback: en, locale: "en" }, key, vars);

/** The short label for a kind of work. Pass `t` to get it in the reader's language; without it the English label is returned. */
export function todayQueueKindLabel(kind: TodayQueueKind, t?: TFunction): string {
  return (t ?? defaultT)(`dashboard.today.kind.${kind}` as const);
}

/**
 * The queue's completion flow, shared with the operating brief so a
 * follow-up finished from either place records the same outcome: a
 * follow-up about a person asks what happened; other tasks complete
 * through the same permission-checked mutation.
 */
export function useTodayQueueCompletion(): { requestComplete: (item: TodayQueueItem) => void; isCompleting: (item: TodayQueueItem) => boolean; dialog: ReactNode } {
  const { t, locale, isolate } = useLocale();
  /** A follow-up about a person: "Done" asks what happened so the outcome is kept. */
  const [logging, setLogging] = useState<TodayQueueItem>();
  const invalidate = useInvalidate();
  const completeTask = useApiMutation(
    (api, taskId: string) => api.completeTask(taskId, { outcome: "Completed from Today" }),
    {
      successMessage: t("dashboard.today.doneToast"),
      onSuccess: async () => {
        setLogging(undefined);
        await invalidate();
      },
    },
  );
  const requestComplete = (item: TodayQueueItem) => {
    if (item.subject && item.kind === "follow_up") setLogging(item);
    else if (item.action.taskId) completeTask.mutate(item.action.taskId);
  };
  const dialog = (
    <Dialog open={Boolean(logging)} onOpenChange={(open) => { if (!open) setLogging(undefined); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dashboard.today.dialog.title")}</DialogTitle>
          <DialogDescription>{logging ? t("dashboard.today.dialog.description", { title: isolate(todayItemTitle({ t, locale, isolate }, logging)) }) : ""}</DialogDescription>
        </DialogHeader>
        {logging?.subject ? (
          <DialogBody>
            <LogContactForm
              subject={logging.subject.kind}
              leadId={logging.subject.kind === "lead" ? logging.subject.id : undefined}
              memberId={logging.subject.kind === "member" ? logging.subject.id : undefined}
              submitLabel={t("dashboard.today.dialog.saveAndFinish")}
              onLogged={() => setLogging(undefined)}
            />
          </DialogBody>
        ) : null}
        <DialogFooter className="justify-between">
          <Button type="button" variant="ghost" size="sm" loading={completeTask.isPending} onClick={() => { if (logging?.action.taskId) completeTask.mutate(logging.action.taskId); }}>
            {t("dashboard.today.dialog.doneNothingToRecord")}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setLogging(undefined)}>{t("common.action.cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { requestComplete, isCompleting: (item) => completeTask.isPending && completeTask.variables === item.action.taskId, dialog };
}

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
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const completion = useTodayQueueCompletion();
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
            <h2 id="today-queue-title" className="text-[15px] font-semibold tracking-[-0.01em]">{t("dashboard.today.title")}</h2>
          </div>
          <p className="mt-2 max-w-[56ch] text-[12.5px] leading-relaxed text-ink-3">
            {t("dashboard.today.intro")}
          </p>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-end" aria-live="polite">
            <p className="text-[18px] font-semibold leading-none tabular">{data?.totalItems ?? 0}</p>
            <p className="mt-1 text-[12px] text-ink-3">
              {(data?.urgentItems ?? 0) > 0 ? t("dashboard.today.urgent", { count: data?.urgentItems ?? 0 }) : t("dashboard.today.itemsLeft")}
            </p>
          </div>
        )}
      </header>

      {loading ? (
        <div className="space-y-3 p-4 sm:p-5" aria-label={t("dashboard.today.loadingAria")}>
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto size-5 text-success" aria-hidden />
          <p className="mt-3 text-[13px] font-semibold">{t("dashboard.today.emptyTitle")}</p>
          <p className="mx-auto mt-1 max-w-[42ch] text-[12.5px] leading-relaxed text-ink-3">
            {t("dashboard.today.emptyDescription")}
          </p>
        </div>
      ) : (
        <>
          <ol className="divide-y divide-line" aria-label={t("dashboard.today.listAria")}>
            {visibleItems.map((item, index) => (
              <TodayQueueRow
                key={item.id}
                item={item}
                first={index === 0}
                completing={completion.isCompleting(item)}
                onComplete={() => completion.requestComplete(item)}
              />
            ))}
          </ol>
          {hiddenItems > 0 ? (
            <div className="border-t border-line bg-sunken/25 px-4 py-2 text-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                {t("dashboard.today.showMore", { count: hiddenItems })} <ArrowRight />
              </Button>
            </div>
          ) : expanded && items.length > initialVisible ? (
            <div className="flex flex-wrap items-center justify-center gap-x-3 border-t border-line bg-sunken/25 px-4 py-2 text-center">
              {data && data.totalItems > data.items.length ? (
                <span className="text-[12px] text-ink-3">{t("dashboard.today.showingTop", { shown: data.items.length, total: data.totalItems })}</span>
              ) : null}
              <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                {t("dashboard.today.showLess")}
              </Button>
            </div>
          ) : data && data.totalItems > data.items.length ? (
            <p className="border-t border-line bg-sunken/25 px-4 py-2.5 text-center text-[12px] text-ink-3">
              {t("dashboard.today.showingMostImportant", { count: data.items.length })}
            </p>
          ) : null}
        </>
      )}
      {completion.dialog}
    </section>
  );
}

export function TodayQueueRow({
  item,
  first,
  completing,
  onComplete,
  extra,
  testId,
}: {
  item: TodayQueueItem;
  first: boolean;
  completing: boolean;
  onComplete: () => void;
  /** Feature-owned additions under the detail line (the brief's overdue-days, stale and related notes). */
  extra?: ReactNode;
  testId?: string;
}) {
  const { t, locale, isolate } = useLocale();
  const copy = { t, locale, isolate };
  const Icon = KIND_ICON[item.kind];
  const title = todayItemTitle(copy, item);
  const actionLabel = todayActionLabel(copy, item.action.label);
  const eventAt = item.dueAt ?? item.occurredAt;
  const urgent = item.priority === "urgent";

  return (
    <li className={cn("relative grid grid-cols-[20px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3.5 transition-colors sm:grid-cols-[20px_minmax(0,1fr)_auto] sm:px-5", first && urgent ? "bg-danger-bg/35" : "hover:bg-sunken/35")} data-testid={testId} data-item-id={item.id}>
      <Icon className={cn("size-4", urgent ? "text-danger" : item.priority === "high" ? "text-warning-deep" : "text-ink-3")} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {first ? <span className="text-[12.5px] font-semibold text-signal-deep">{t("dashboard.today.doFirst")}</span> : null}
          <span className="text-[12.5px] text-ink-3">{todayQueueKindLabel(item.kind, t)}</span>
          {item.branchName ? <bdi className="truncate text-[12px] text-ink-4">{item.branchName}</bdi> : null}
        </div>
        <Link href={item.href} className="mt-0.5 block break-words text-[13.5px] font-semibold text-ink outline-none hover:underline focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4 sm:truncate">
          {title}
        </Link>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
          <span className="truncate">{todayItemDetail(copy, item)}</span>
          {item.amount ? <MoneyText money={item.amount} signed={item.kind === "cash_variance"} className="font-medium text-ink-2" /> : null}
          {eventAt ? <span className={cn("shrink-0", urgent && "font-medium text-danger")}><RelativeText iso={eventAt} /></span> : null}
        </p>
        {extra}
      </div>
      <div className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
        {item.action.kind === "complete_task" && item.action.taskId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={completing}
            disabled={completing}
            onClick={onComplete}
            aria-label={t("dashboard.today.completeAria", { title: isolate(title) })}
          >
            <Check /> {actionLabel}
          </Button>
        ) : (
          <Button asChild variant={first && urgent ? "primary" : "secondary"} size="sm">
            <Link href={item.href} aria-label={t("dashboard.today.actionAria", { action: actionLabel, title: isolate(title) })}>
              {actionLabel} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
