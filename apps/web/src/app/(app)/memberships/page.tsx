"use client";
import { useLocale } from "@/lib/i18n/provider";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { MembershipListQuery } from "@/lib/api/GymOSApi";
import type { MembershipSummary } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { money } from "@/lib/utils/money";
import { useFormat } from "@/lib/i18n/format";
import { choiceFromParams, pageFromParams, useReplaceSearchParams, useUrlSearchText } from "@/lib/hooks/use-url-state";
import { DaysUntilText, MoneyText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip, PaymentStatusChip } from "@/components/shared/status-chip";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton, TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";

const STATUS_FILTERS = ["all", "active", "expiring", "expired", "frozen", "cancelled", "depleted", "scheduled"] as const;
const PAYMENT_FILTERS = ["all", "paid", "partial", "unpaid", "refunded"] as const;

export default function MembershipsPage() {
  return <Suspense><WorkspaceModuleBoundary moduleKey="revenue"><MembershipsWorkspace /></WorkspaceModuleBoundary></Suspense>;
}

function MembershipsWorkspace() {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const { session } = useApp();
  const router = useRouter();
  // Filters and the page live in the URL so a refresh, Back/Forward or a
  // shared link reopen the same slice of the ledger. Unknown values fall
  // back to the default instead of reaching the query.
  const params = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  const { text: search, setText: setSearch, settled: debounced } = useUrlSearchText();
  const status = choiceFromParams(params, "status", STATUS_FILTERS, "all");
  const paymentStatus = choiceFromParams(params, "payment", PAYMENT_FILTERS, "all");
  const page = pageFromParams(params);
  const filtersActive = Boolean(debounced) || status !== "all" || paymentStatus !== "all";
  const clearFilters = () => {
    setSearch("");
    replaceParams({ q: undefined, status: undefined, payment: undefined });
  };

  const query: MembershipListQuery = useMemo(
    () => ({
      search: debounced || undefined,
      status: status === "all" ? undefined : (status as MembershipListQuery["status"]),
      paymentStatus: paymentStatus === "all" ? undefined : (paymentStatus as MembershipListQuery["paymentStatus"]),
      branchId: session?.activeBranchId,
      page,
      pageSize: 20,
      sort: "-endDate",
    }),
    [debounced, status, paymentStatus, session?.activeBranchId, page],
  );

  const { data, isLoading, isError, refetch } = useApiQuery(qk.memberships(query), (api) => api.listMemberships(query));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("memberProfile.tabs.memberships")}
        description={t("memberEnrollment.membershipsHint")}
      />

      <FreezeRequestsPanel />

      <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-center">
        <div className="relative sm:col-span-2 lg:w-full lg:max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("memberEnrollment.memberSearchPlaceholder")}
            className="ps-8"
            aria-label={t("memberEnrollment.searchMemberships")}
            data-touch-target
          />
        </div>
        <Select value={status} onValueChange={(v) => replaceParams({ status: v === "all" ? undefined : v })}>
          <SelectTrigger sizeVariant="sm" className="w-full lg:w-40" aria-label={t("memberEnrollment.statusFilter")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("members.list.filters.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("renewFlow.adjust.membershipStatus.active")}</SelectItem>
            <SelectItem value="expiring">{t("members.list.filters.expiring")}</SelectItem>
            <SelectItem value="expired">{t("renewFlow.adjust.membershipStatus.expired")}</SelectItem>
            <SelectItem value="frozen">{t("renewFlow.adjust.membershipStatus.frozen")}</SelectItem>
            <SelectItem value="cancelled">{t("renewFlow.adjust.membershipStatus.cancelled")}</SelectItem>
            <SelectItem value="depleted">{t("renewFlow.adjust.membershipStatus.depleted")}</SelectItem>
            <SelectItem value="scheduled">{t("renewFlow.adjust.membershipStatus.scheduled")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentStatus} onValueChange={(v) => replaceParams({ payment: v === "all" ? undefined : v })}>
          <SelectTrigger sizeVariant="sm" className="w-full lg:w-36" aria-label={t("memberEnrollment.paymentFilter")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("memberEnrollment.anyPayment")}</SelectItem>
            <SelectItem value="paid">{t("domain.paymentStatus.paid")}</SelectItem>
            <SelectItem value="partial">{t("domain.paymentStatus.partial")}</SelectItem>
            <SelectItem value="unpaid">{t("domain.paymentStatus.unpaid")}</SelectItem>
            <SelectItem value="refunded">{t("memberProfile.pt.orderStatus.refunded")}</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive ? <Button variant="ghost" size="sm" className="justify-self-start lg:ms-1" onClick={clearFilters}>{t("common.action.clearFilters")}</Button> : null}
        {data ? <span className="justify-self-end text-[12px] text-ink-3 tabular lg:ms-auto">{data.totalItems} {data.totalItems === 1 ? "membership" : t("dashboard.owner.memberships")}</span> : null}
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={10} cols={7} />
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          filtersActive ? (
            <EmptyState title={t("memberEnrollment.noMembershipMatches")} description={t("memberEnrollment.tryOtherFilters")} className="border-0" action={<Button variant="secondary" size="sm" onClick={clearFilters}>{t("common.action.clearFilters")}</Button>} />
          ) : (
            <EmptyState title={t("memberEnrollment.noMemberships")} description={t("memberEnrollment.noMembershipsHint")} className="border-0" />
          )
        ) : (
          <>
          <ul className="divide-y divide-line lg:hidden" aria-label={t("memberProfile.tabs.memberships")}>
            {data.items.map((membership) => <MembershipCompactRow key={membership.id} membership={membership} onOpen={() => router.push(`/members/${membership.memberId}`)} />)}
          </ul>
          <Table className="hidden lg:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("palette.kind.member")}</TableHead>
                <TableHead>{t("renewFlow.adjust.planChange.rowPlan")}</TableHead>
                <TableHead>{t("renewFlow.sale.rowDates")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead>{t("members.tabs.membershipColumns.payment")}</TableHead>
                <TableHead className="text-end">{t("members.list.columns.balance")}</TableHead>
                <TableHead>{t("common.label.branch")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((m) => (
                <TableRow key={m.id} interactive onClick={() => router.push(`/members/${m.memberId}`)}>
                  <TableCell>
                    <span className="block font-medium">{m.memberName}</span>
                    <span className="font-mono text-[11px] text-ink-3"><bdi dir="ltr">{m.memberNumber}</bdi></span>
                  </TableCell>
                  <TableCell className="text-[12.5px]">
                    {m.planName}
                    {m.remainingVisits != null ? (
                      <span className="block text-[12px] text-ink-3 tabular">
                        {t("memberEnrollment.visitsLeft", { remaining: f.number(m.remainingVisits), total: f.number(m.totalVisits ?? 0) })}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-[12px] tabular">
                      {t("memberEnrollment.dateRange", { start: isolate(f.date(m.startDate)), end: isolate(f.date(m.endDate)) })}
                    </span>
                    <DaysUntilText date={m.endDate} className="block text-[12px]" />
                  </TableCell>
                  <TableCell>
                    <MembershipStatusChip status={m.status} />
                  </TableCell>
                  <TableCell>
                    <PaymentStatusChip status={m.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-end">
                    {m.outstanding.amount > 0 ? (
                      <MoneyText money={m.outstanding} className="text-warning-deep" />
                    ) : (m.upcomingAmount?.amount ?? 0) > 0 ? (
                      <span className="text-[12px] text-ink-3">{t("memberEnrollment.dueOn", { amount: isolate(f.money(m.upcomingAmount!)), date: isolate(f.date(m.startDate)) })}</span>
                    ) : (
                      <span className="text-[12px] tabular text-ink-4">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{m.branchName.split("— ")[1] ?? m.branchName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </>
        )}
      </div>

      {data ? <DataPagination page={data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}
    </div>
  );
}

function MembershipCompactRow({ membership, onOpen }: { membership: MembershipSummary; onOpen: () => void }) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  return (
    <li>
      <button type="button" className="block w-full px-4 py-3.5 text-start hover:bg-sunken/60" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-semibold text-ink">{membership.memberName}</p>
            <p className="mt-0.5 text-[12px] text-ink-3"><span className="font-mono"><bdi dir="ltr">{membership.memberNumber}</bdi></span> · {membership.branchName.split("— ")[1] ?? membership.branchName}</p>
          </div>
          <MembershipStatusChip status={membership.status} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
          <div><p className="text-ink-3">{t("renewFlow.adjust.planChange.rowPlan")}</p><p className="mt-0.5 font-medium text-ink">{membership.planName}</p></div>
          <div><p className="text-ink-3">{t("members.tabs.membershipColumns.payment")}</p><div className="mt-0.5"><PaymentStatusChip status={membership.paymentStatus} /></div></div>
          <div><p className="text-ink-3">{t("renewFlow.sale.rowDates")}</p><p className="mt-0.5 tabular text-ink">{t("memberEnrollment.dateRange", { start: isolate(f.date(membership.startDate)), end: isolate(f.date(membership.endDate)) })}</p><DaysUntilText date={membership.endDate} className="mt-0.5 block text-[12px]" /></div>
          <div><p className="text-ink-3">{t("members.list.columns.balance")}</p><p className={`mt-0.5 font-medium ${membership.outstanding.amount > 0 ? "text-warning-deep" : "text-ink-3"}`}>{membership.outstanding.amount > 0 ? <MoneyText money={membership.outstanding} /> : t("memberEnrollment.nothing")}</p></div>
        </div>
      </button>
    </li>
  );
}

function FreezeRequestsPanel() {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const requestsQuery = useApiQuery(["freezeRequests", "pending"] as const, (api) => api.listFreezeRequests({ status: "pending" }));
  const [denyId, setDenyId] = useState<string>();
  const [note, setNote] = useState("");

  const decide = useApiMutation((api, input: { requestId: string; decision: "approved" | "denied"; note?: string }) => api.decideFreezeRequest(input), {
    onSuccess: async () => {
      setDenyId(undefined);
      setNote("");
      await invalidate([["freezeRequests", "pending"], ["memberships"]]);
    },
    successMessage: t("memberEnrollment.freezeAnswered"),
  });

  if (requestsQuery.isLoading) return <Skeleton className="h-24 w-full" />;
  if (requestsQuery.isError) {
    return <section className="rounded-lg border border-line bg-surface p-4" aria-label={t("memberEnrollment.freezeRequests")}><ErrorState title={t("memberEnrollment.freezeRequestsFailed")} description={t("memberEnrollment.freezeRetryHint")} onRetry={() => requestsQuery.refetch()} /></section>;
  }
  const pending = requestsQuery.data ?? [];
  if (pending.length === 0) return null;
  return (
    <section className="rounded-lg border border-warning/40 bg-warning-bg/30 p-4" aria-label={t("memberEnrollment.freezeRequests")}>
      <h2 className="text-[15px] font-semibold">{t("memberEnrollment.freezeWaiting", { count: pending.length })}</h2>
      <p className="mt-1 text-[12px] text-ink-3">{t("memberEnrollment.freezeFeeHint")}</p>
      <div className="mt-3 grid gap-2">
        {pending.map((request) => (
          <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5">
            <div className="min-w-0 text-[12.5px]">
              <p className="font-semibold">{request.memberName}</p>
              <p className="text-ink-3">{t("memberEnrollment.freezeDetails", { days: t("memberEnrollment.days", { count: request.days }), date: isolate(f.date(request.startDate)), reason: isolate(request.reason), fee: request.expectedFeeMinor > 0 ? t("memberEnrollment.feeAmount", { amount: isolate(f.money(money(request.expectedFeeMinor, session?.organization.currency ?? "JOD"))) }) : t("memberEnrollment.noFee") })}</p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ requestId: request.id, decision: "approved" })}>{t("memberEnrollment.approve")}</Button>
              <Button size="sm" variant="secondary" onClick={() => { setDenyId(request.id); setNote(""); }}>{t("memberEnrollment.decline")}</Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={Boolean(denyId)} onOpenChange={(open) => { if (!open) setDenyId(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("memberEnrollment.declineFreeze")}</DialogTitle></DialogHeader>
          <DialogBody>
            <label className="grid gap-1.5 text-[12px] font-medium">{t("memberEnrollment.memberSeesReason")}<Textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDenyId(undefined)}>{t("common.action.cancel")}</Button>
            <Button variant="danger" loading={decide.isPending} disabled={!note.trim()} onClick={() => decide.mutate({ requestId: denyId!, decision: "denied", note: note.trim() })}>{t("memberEnrollment.declineRequest")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
