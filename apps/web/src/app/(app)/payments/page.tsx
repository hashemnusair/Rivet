"use client";

import { FilterX, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { TransactionListQuery } from "@/lib/api/GymOSApi";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
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
import { money } from "@/lib/utils/money";
import { receiptHref } from "@/lib/utils/receipt-links";

function TransactionsPageInner() {
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(search, 250);
  const method = params.get("method") ?? "all";
  const type = params.get("type") ?? "all";
  const range = params.get("range") ?? "30";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const collectOpen = params.get("collect") === "1";

  const replaceParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    if (!("page" in changes) && !("collect" in changes)) next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== debounced) replaceParams({ q: debounced || undefined });
    // Only settled search text drives this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

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
      <ForbiddenState description="Reading the branch transaction ledger needs financial-report permission. Reception can still collect payments and reconcile their own shift." />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Every payment, refund and void — the immutable money trail."
        actions={
          <Button onClick={() => replaceParams({ collect: "1" })}>
            <Plus /> Collect payment
          </Button>
        }
      />

      <FinanceNav />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Member or receipt number…" className="ps-8" aria-label="Search transactions" />
        </div>
        <Select value={method} onValueChange={(value) => replaceParams({ method: value === "all" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-40" aria-label="Method filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(value) => replaceParams({ type: value === "all" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-36" aria-label="Type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="payment">Payments</SelectItem>
            <SelectItem value="refund">Refunds</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(value) => replaceParams({ range: value === "30" ? undefined : value })}>
          <SelectTrigger sizeVariant="sm" className="w-36" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        {data ? (
          <span className="ms-auto text-[12px] text-ink-3 tabular">
            {data.totalItems} records · page net <MoneyText money={money(pageTotal)} />
          </span>
        ) : null}
        {["q", "method", "type", "range"].some((key) => params.has(key)) ? (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); replaceParams({ q: undefined, method: undefined, type: undefined, range: undefined }); }}>
            <FilterX /> Clear filters
          </Button>
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
          <EmptyState title="No transactions match" description="Try a wider date range or clear the filters." className="border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Receipt</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-end">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Branch</TableHead>
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
                  <TableCell className="text-[12.5px] capitalize">{p.type}</TableCell>
                  <TableCell className="text-[12.5px]">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
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
        )}
      </div>

      {data ? <DataPagination page={data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}

      <CollectPaymentMemberPicker open={collectOpen} onOpenChange={(open) => replaceParams({ collect: open ? "1" : undefined })} />
    </div>
  );
}

export default function TransactionsPage() {
  return <Suspense><TransactionsPageInner /></Suspense>;
}
