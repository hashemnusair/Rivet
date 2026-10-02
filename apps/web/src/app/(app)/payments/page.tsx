"use client";
import { useT } from "@/lib/i18n/provider";


import { FilterX, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { qk } from "@/lib/api/keys";
import type { TransactionListQuery } from "@/lib/api/GymOSApi";
import type { TransactionSummary } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { choiceFromParams, pageFromParams, useReplaceSearchParams, useUrlSearchText } from "@/lib/hooks/use-url-state";
import { todayISODate, addDays } from "@/lib/utils/dates";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CollectPaymentMemberPicker } from "@/features/finance/collect-payment-picker";
import { FinanceNav } from "@/features/finance/finance-nav";
import { paymentMethodLabel, transactionTypeLabel } from "@/lib/i18n/labels";
import { useFormat } from "@/lib/i18n/format";
import { isolate } from "@/lib/i18n/bidi";
import { money } from "@/lib/utils/money";
import { receiptHref } from "@/lib/utils/receipt-links";

const METHOD_FILTERS: readonly string[] = ["all", ...Object.keys(PAYMENT_METHOD_LABELS)];
const TYPE_FILTERS = ["all", "payment", "refund"] as const;
const RANGE_FILTERS = ["1", "7", "30", "all"] as const;

function TransactionsPageInner() {
  const t = useT();
  const { session } = useApp();
  const f = useFormat(session?.organization.timezone);
  const { can } = usePermissions();
  const params = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  // The ledger view is fully URL-backed: search, method, type, range and page
  // survive a refresh and Back/Forward. Unknown URL values fall back to the
  // defaults instead of reaching the query.
  const { text: search, setText: setSearch, settled: debounced } = useUrlSearchText();
  const method = choiceFromParams(params, "method", METHOD_FILTERS, "all");
  const type = choiceFromParams(params, "type", TYPE_FILTERS, "all");
  const range = choiceFromParams(params, "range", RANGE_FILTERS, "30");
  const page = pageFromParams(params);
  const collectOpen = params.get("collect") === "1";

  const query: TransactionListQuery = useMemo(
    () => ({
      search: debounced || undefined,
      method: method === "all" ? undefined : (method as TransactionListQuery["method"]),
      type: type === "all" ? undefined : (type as TransactionListQuery["type"]),
      branchId: session?.activeBranchId,
      from: range === "all" ? undefined : addDays(todayISODate(session?.organization.timezone), -(Number(range) - 1)),
      page,
      pageSize: 20,
    }),
    [debounced, method, type, session?.activeBranchId, session?.organization.timezone, range, page],
  );

  const { data, isLoading, isError, refetch } = useApiQuery(qk.transactions(query), (api) => api.listTransactions(query));

  const pageTotal = useMemo(
    () => (data?.items ?? []).filter((p) => p.status !== "voided").reduce((s, p) => s + p.amount.amount, 0),
    [data],
  );

  // The branch ledger is a financial report: being able to collect a payment
  // does not entitle you to read everyone else's. The API enforces this too —
  // without the guard, reception hitting this URL gets a misleading "try again"
  // error instead of being told they lack permission.
  if (!can("reports.financial.read")) {
    return (
      <ForbiddenState description={t("salesWorkspace.ledgerForbidden")} />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.item.payments")}
        description={t("salesWorkspace.ledgerHint")}
        actions={
          <Button onClick={() => replaceParams({ collect: "1" }, { keepPage: true })}>
            <Plus />{" "}{t("renewFlow.payment.collectPlain")}</Button>
        }
      />

      <FinanceNav />

      <div className="grid gap-2 sm:grid-cols-3 lg:flex lg:items-center">
        <div className="relative sm:col-span-3 lg:w-full lg:max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("salesWorkspace.searchPaymentsPlaceholder")} className="ps-8" aria-label={t("salesWorkspace.searchPayments")} data-touch-target />
        </div>
        <Select value={method} onValueChange={(value) => replaceParams({ method: value === "all" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-full lg:w-40" aria-label={t("renewFlow.shared.paymentMethodAria")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("salesWorkspace.allMethods")}</SelectItem>
            {Object.keys(PAYMENT_METHOD_LABELS).map((k) => (
              <SelectItem key={k} value={k}>{paymentMethodLabel(t, k)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(value) => replaceParams({ type: value === "all" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-full lg:w-36" aria-label={t("salesWorkspace.paymentOrRefund")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("salesWorkspace.allTypes")}</SelectItem>
            <SelectItem value="payment">{t("nav.item.payments")}</SelectItem>
            <SelectItem value="refund">{t("salesWorkspace.refunds")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(value) => replaceParams({ range: value === "30" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-full lg:w-36" aria-label={t("salesWorkspace.dateRange")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t("common.time.today")}</SelectItem>
            <SelectItem value="7">{t("common.time.last7Days")}</SelectItem>
            <SelectItem value="30">{t("common.time.last30Days")}</SelectItem>
            <SelectItem value="all">{t("salesWorkspace.allTime")}</SelectItem>
          </SelectContent>
        </Select>
        {data ? (
          <span className="text-[12px] text-ink-3 tabular sm:col-span-2 lg:ms-auto lg:whitespace-nowrap">
            {t("salesWorkspace.resultsTotal", { results: t("salesWorkspace.resultCount", { count: data.totalItems }), amount: isolate(f.money(money(pageTotal, session?.organization.currency ?? "JOD"))) })}
          </span>
        ) : null}
        {["q", "method", "type", "range"].some((key) => params.has(key)) ? (
          <Button variant="ghost" size="sm" className="justify-self-end" onClick={() => { setSearch(""); replaceParams({ q: undefined, method: undefined, type: undefined, range: undefined }); }}>
            <FilterX />{" "}{t("common.action.clearFilters")}</Button>
        ) : null}
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
          <EmptyState title={t("salesWorkspace.noPayments")} description={t("salesWorkspace.widenFilters")} className="border-0" />
        ) : (
          <>
          <ul className="divide-y divide-line lg:hidden" aria-label={t("nav.item.payments")}>
            {data.items.map((transaction) => <TransactionCompactRow key={transaction.id} transaction={transaction} />)}
          </ul>
          <Table className="hidden lg:table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("members.tabs.payments.receipt")}</TableHead>
                <TableHead>{t("members.tabs.checkIns.when")}</TableHead>
                <TableHead>{t("crm.lead.member")}</TableHead>
                <TableHead>{t("common.label.type")}</TableHead>
                <TableHead>{t("members.tabs.payments.method")}</TableHead>
                <TableHead className="text-end">{t("common.label.amount")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead>{t("salesWorkspace.staff")}</TableHead>
                <TableHead>{t("common.label.branch")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((p) => {
                const memberId = "memberId" in p ? p.memberId : p.customer?.memberId;
                return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={receiptHref(p.receiptId)} className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink" data-testid="receipt-link">
                      {p.receiptNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">
                    <DateTimeText iso={p.occurredAt} />
                  </TableCell>
                  <TableCell>
                    {memberId ? (
                      <Link href={`/members/${memberId}`} className="text-[13px] font-medium hover:underline underline-offset-2">
                        {p.memberName}
                      </Link>
                    ) : (
                      <span className="text-[13px] font-medium">{p.memberName}</span>
                    )}
                    <span className="block font-mono text-[11px] text-ink-3">{p.memberNumber}</span>
                  </TableCell>
                  <TableCell className="text-[12.5px]">{transactionTypeLabel(t, p.type)}</TableCell>
                  <TableCell className="text-[12.5px]">{paymentMethodLabel(t, p.method)}</TableCell>
                  <TableCell className="text-end">
                    <MoneyText money={p.amount} />
                  </TableCell>
                  <TableCell>
                    <TransactionStatusChip status={p.status} />
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{p.collectedByName}</TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{p.branchName.split("— ")[1] ?? p.branchName}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </>
        )}
      </div>

      {data ? <DataPagination page={data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}

      <CollectPaymentMemberPicker open={collectOpen} onOpenChange={(open) => replaceParams({ collect: open ? "1" : undefined }, { keepPage: true })} />
    </div>
  );
}

function TransactionCompactRow({ transaction }: { transaction: TransactionSummary }) {
  const t = useT();
  const memberId = "memberId" in transaction ? transaction.memberId : transaction.customer?.memberId;
  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {memberId ? <Link href={`/members/${memberId}`} className="truncate text-[13.5px] font-semibold text-ink hover:underline">{transaction.memberName}</Link> : <p className="truncate text-[13.5px] font-semibold text-ink">{transaction.memberName}</p>}
          <p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={transaction.occurredAt} /> · {transaction.branchName.split("— ")[1] ?? transaction.branchName}</p>
        </div>
        <MoneyText money={transaction.amount} className="shrink-0 text-[13.5px] font-semibold" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-[12.5px] text-ink-2">
        <TransactionStatusChip status={transaction.status} />
        <span>{transactionTypeLabel(t, transaction.type)}</span>
        <span>{paymentMethodLabel(t, transaction.method)}</span>
        <span>{t("salesWorkspace.by")}{" "}{transaction.collectedByName}</span>
        <Link href={receiptHref(transaction.receiptId)} className="ms-auto font-mono text-[12px] font-medium underline decoration-line-3 underline-offset-2 hover:text-ink" data-testid="receipt-link">{transaction.receiptNumber}</Link>
      </div>
    </li>
  );
}

export default function TransactionsPage() {
  return <Suspense><TransactionsPageInner /></Suspense>;
}
