"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { LeadListQuery } from "@/lib/api/GymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, todayISODate, formatDate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { LeadStageChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import { TodayQueue } from "./today-queue";

/**
 * The salesperson's cockpit: what needs action now, how the month is going,
 * and a direct line into each follow-up.
 */
export function SalesDashboard() {
  const { session } = useApp();
  const today = todayISODate();

  const leadInput: LeadListQuery = { ownerId: session?.user.id, stage: ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"], pageSize: 8, sort: "nextFollowUpAt" };
  const leadsQuery = useRealtimeApiQuery({ queryKey: qk.leads({ mine: true, open: true }), query: (api) => api.listLeads(leadInput), subscribe: (api, onValue, onError) => api.subscribeLeads(leadInput, onValue, onError), enabled: Boolean(session) });
  const dashboardInput = { branchId: session?.activeBranchId, from: addDays(today, -29), to: today };
  const dashQuery = useRealtimeApiQuery({ queryKey: qk.dashboard(session?.activeBranchId), query: (api) => api.getDashboard(dashboardInput), subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardInput, onValue, onError), enabled: Boolean(session) });

  if (dashQuery.isError) return <ErrorState onRetry={() => dashQuery.refetch()} />;

  const me = dashQuery.data?.leaderboard.find((r) => r.userId === session?.user.id);
  const dueFollowUps = dashQuery.data?.todayQueue.kindCounts.follow_up ?? 0;
  const overdueFollowUps = dashQuery.data?.kpis.overdueFollowUps ?? 0;

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
          { label: "Overdue follow-ups", value: overdueFollowUps, danger: overdueFollowUps > 0 },
          { label: "Due today", value: Math.max(0, dueFollowUps - overdueFollowUps), danger: false },
          { label: "Collected this month", value: <MoneyText money={me?.revenueCollected ?? money(0)} compact />, danger: false },
          { label: "Leads converted", value: me?.leadsConverted ?? 0, danger: false },
        ].map((cell) => (
          <div key={cell.label} className="px-4 py-3.5">
            <p className="eyebrow">{cell.label}</p>
            <div className={cn("mt-1 text-[22px] font-medium leading-none tabular", cell.danger && "text-danger")}>
              {dashQuery.isLoading ? <Skeleton className="h-6 w-10" /> : cell.value}
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <TodayQueue data={dashQuery.data?.todayQueue} loading={dashQuery.isLoading} />

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
