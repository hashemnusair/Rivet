"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { money } from "@/lib/utils/money";

export default function TransactionsPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [method, setMethod] = useState("all");
  const [type, setType] = useState("all");
  const [range, setRange] = useState("30");
  const [page, setPage] = useState(1);
  const [collectOpen, setCollectOpen] = useState(false);

  const query: TransactionListQuery = useMemo(
    () => ({
      search: debounced || undefined,
      method: method === "all" ? undefined : (method as TransactionListQuery["method"]),
      type: type === "all" ? undefined : (type as TransactionListQuery["type"]),
      branchId: session?.activeBranchId,
      from: range === "all" ? undefined : addDays(todayISODate(), -Number(range)),
      page,
      pageSize: 20,
    }),
    [debounced, method, type, session?.activeBranchId, range, page],
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Finance"
        title="Transactions"
        description="Every payment, refund and void — the immutable money trail."
        actions={
          <Button onClick={() => setCollectOpen(true)}>
            <Plus /> Collect payment
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Member or receipt #…" className="ps-8" aria-label="Search transactions" />
        </div>
        <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
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
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-36" aria-label="Type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="payment">Payments</SelectItem>
            <SelectItem value="refund">Refunds</SelectItem>
          </SelectContent>
        </Select>
        <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
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
          <span className="ms-auto text-[11.5px] text-ink-3 tabular">
            {data.totalItems} records · page net <MoneyText money={money(pageTotal)} />
          </span>
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
              {data.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/payments/receipts/${p.receiptId}`} className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink" data-testid="receipt-link">
                      {p.receiptNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">
                    <DateTimeText iso={p.occurredAt} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/members/${p.memberId}`} className="text-[13px] font-medium hover:underline underline-offset-2">
                      {p.memberName}
                    </Link>
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
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data ? <DataPagination page={data} onPage={setPage} /> : null}

      <CollectPaymentMemberPicker open={collectOpen} onOpenChange={setCollectOpen} />
    </div>
  );
}
