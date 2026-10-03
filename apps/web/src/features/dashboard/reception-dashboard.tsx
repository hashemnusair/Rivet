"use client";

import { ArrowRight, Banknote, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { qk } from "@/lib/api/keys";
import { checkInDecisionLabel } from "@/lib/i18n/labels";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { visibleBranchId } from "@/lib/domain/branch-scope";

import { useGreeting } from "./dashboard-scope";
import { TodayQueue } from "./today-queue";

export function ReceptionDashboard() {
  const { session } = useApp();
  const { t, isolate } = useLocale();
  const format = useFormat(session?.organization.timezone);
  const branchId = visibleBranchId(session?.branches, session?.activeBranchId);
  const today = todayISODate(session?.organization.timezone);
  const dashboardInput = { branchId, from: addDays(today, -29), to: today };
  const dashboard = useRealtimeApiQuery({
    queryKey: qk.dashboard(branchId),
    query: (api) => api.getDashboard(dashboardInput),
    subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardInput, onValue, onError),
    enabled: Boolean(session),
  });
  const shift = useRealtimeApiQuery({
    queryKey: qk.shiftTotals(branchId ?? ""),
    query: (api) => api.getCurrentShiftTotals(branchId!),
    subscribe: (api, onValue, onError) => api.subscribeCurrentShiftTotals(branchId!, onValue, onError),
    enabled: Boolean(branchId),
  });
  const occupancy = useRealtimeApiQuery({
    queryKey: qk.occupancy(branchId ?? ""),
    query: (api) => api.getOccupancy(branchId!),
    subscribe: (api, onValue, onError) => api.subscribeOccupancy(branchId!, onValue, onError),
    enabled: Boolean(branchId),
  });
  const checkInsInput = { branchId, date: today, acceptedOnly: true, pageSize: 8 };
  const checkIns = useRealtimeApiQuery({
    queryKey: qk.checkIns({ dashboard: true, branchId }),
    query: (api) => api.listRecentCheckIns(checkInsInput),
    subscribe: (api, onValue, onError) => api.subscribeRecentCheckIns(checkInsInput, onValue, onError),
    enabled: Boolean(branchId),
  });
  const outstanding = useApiQuery(
    qk.members({ dashboard: "outstanding", branchId }),
    (api) => api.listMembers({ branchId, membershipStatus: "outstanding", pageSize: 50 }),
    { enabled: Boolean(branchId) },
  );
  const trialLeads = useApiQuery(
    qk.leads({ dashboard: "trials", branchId }),
    (api) => api.listLeads({ branchId, stage: ["trial_booked"], pageSize: 50 }),
    { enabled: Boolean(branchId) },
  );

  const loading = dashboard.isLoading || shift.isLoading || occupancy.isLoading || checkIns.isLoading || outstanding.isLoading || trialLeads.isLoading;
  const branchName = session?.branches.find((branch) => branch.id === branchId)?.name ?? "Your branch";
  const greeting = useGreeting(session?.user.name.split(" ")[0] ?? "", undefined, session?.organization.timezone);
  const expectedCash = shift.data
    ? money(
        shift.data.shift.openingFloat.amount +
          shift.data.totals.cashPayments.amount -
          shift.data.totals.cashRefunds.amount,
        shift.data.shift.openingFloat.currency,
      )
    : money(0);

  const outstandingCount = outstanding.data?.totalItems ?? 0;
  const trialCount = trialLeads.data?.totalItems ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        sectionLabel={isolate(branchName)}
        title={greeting}
        description={t("deskCompletion.dashboard.reception.description")}
        actions={
          <Button asChild>
            <Link href="/reception">
              <ShieldCheck />{" "}{t("dashboard.manager.openReception")}
            </Link>
          </Button>
        }
      />

      <section
        className="panel grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x"
        aria-label={t("dashboard.manager.checkInsToday")}
      >
        <Metric label={t("dashboard.manager.checkInsToday")} loading={loading}>
          {format.number(occupancy.data?.checkInsToday ?? 0)}
        </Metric>
        <Metric label={t("deskCompletion.dashboard.reception.busiestHour")} loading={loading}>
          {format.clock(occupancy.data?.peakHour)}
        </Metric>
        <Metric label={t("deskCompletion.dashboard.reception.cashShift")} loading={loading}>
          {shift.data ? t("dashboard.today.action.open") : t("deskCompletion.dashboard.reception.shiftNotOpen")}
        </Metric>
        <Metric label={t("deskCompletion.dashboard.reception.expectedCash")} loading={loading}>
          <MoneyText money={expectedCash} />
        </Metric>
        <Metric label={t("dashboard.reception.outstandingMembers")} loading={loading} warning={outstandingCount > 0}>
          {format.number(outstandingCount)}
        </Metric>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <TodayQueue data={dashboard.data?.todayQueue} loading={dashboard.isLoading} />
        <section className="panel overflow-hidden" aria-labelledby="reception-dashboard-checkins">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 id="reception-dashboard-checkins" className="text-[13px] font-semibold">
              {t("dashboard.manager.checkInsToday")}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reception">
                {t("marketing.ops.reception.label")}{" "}
                <ArrowRight className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          </header>
          {(checkIns.data?.items.length ?? 0) === 0 ? (
            <p className="px-5 py-12 text-center text-[12px] text-ink-3">
              {t("deskCompletion.dashboard.reception.checkInsEmpty")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {checkIns.data?.items.map((checkIn) => (
                <li key={checkIn.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={checkIn.decision === "allowed" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-warning"}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <bdi className="block truncate text-[12px] font-medium">{checkIn.memberName}</bdi>
                    <span className="block text-[12px] text-ink-3">
                      {checkInDecisionLabel(t, checkIn.decision)}
                    </span>
                  </span>
                  <time dateTime={checkIn.occurredAt} className="font-mono text-[10.5px] text-ink-3">
                    {format.time(checkIn.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="reception-dashboard-actions">
        <header className="border-b border-line px-4 py-3">
          <h2 id="reception-dashboard-actions" className="text-[13px] font-semibold">
            {t("palette.groups.quickActions")}
          </h2>
        </header>
        <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <Action
            href="/reception"
            icon={<Search />}
            label={t("deskCompletion.dashboard.reception.findOrScan")}
            detail={t("deskCompletion.dashboard.reception.checkInAction")}
          />
          <Action
            href="/payments"
            icon={<Banknote />}
            label={t("deskCompletion.dashboard.reception.takePayment")}
            detail={t("deskCompletion.dashboard.reception.membersOweMoney", { count: outstandingCount })}
          />
          <Action
            href="/crm/pipeline"
            icon={<Users />}
            label={t("deskCompletion.dashboard.reception.trialFollowUps")}
            detail={t("deskCompletion.dashboard.reception.trialCount", { count: trialCount })}
          />
          <Action
            href="/payments/shifts"
            icon={<Banknote />}
            label={shift.data
              ? t("deskCompletion.dashboard.reception.checkCashShift")
              : t("deskCompletion.dashboard.reception.openCashShift")}
            detail={shift.data
              ? t("deskCompletion.dashboard.reception.shiftOpenedBy", { actor: isolate(shift.data.shift.openedByName) })
              : t("deskCompletion.dashboard.reception.needOpenShift")}
          />
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  children,
  loading,
  warning,
}: {
  label: string;
  children: ReactNode;
  loading: boolean;
  warning?: boolean;
}) {
  return (
    <div className="px-4 py-3.5">
      <p className="context-label">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-14" />
      ) : (
        <p className={warning ? "mt-1 text-[21px] font-medium text-warning" : "mt-1 text-[21px] font-medium"}>
          {children}
        </p>
      )}
    </div>
  );
}

function Action({ href, icon, label, detail }: { href: string; icon: ReactNode; label: string; detail: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-sunken">
      <span className="text-ink-3 [&_svg]:size-4" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium">{label}</span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-3">{detail}</span>
      </span>
      <ArrowRight className="size-3.5 text-ink-3 rtl:rotate-180" aria-hidden />
    </Link>
  );
}
