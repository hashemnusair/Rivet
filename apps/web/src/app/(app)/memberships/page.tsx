"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { MembershipListQuery } from "@/lib/api/GymOSApi";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { DaysUntilText, MoneyText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip, PaymentStatusChip } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MembershipsPage() {
  const { session } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [page, setPage] = useState(1);

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
        eyebrow="Operations"
        title="Memberships"
        description="Every term ever sold — current, past, frozen and cancelled."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Member name or number…"
            className="ps-8"
            aria-label="Search memberships"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-40" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="frozen">Frozen</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="depleted">Visits used up</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentStatus} onValueChange={(v) => { setPaymentStatus(v); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-36" aria-label="Payment status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any payment</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        {data ? <span className="ms-auto text-[11.5px] text-ink-3 tabular">{data.totalItems} terms</span> : null}
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
          <EmptyState title="No memberships match" description="Try widening the filters or the search." className="border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-end">Balance</TableHead>
                <TableHead>Branch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((m) => (
                <TableRow key={m.id} interactive onClick={() => router.push(`/members/${m.memberId}`)}>
                  <TableCell>
                    <span className="block font-medium">{m.memberName}</span>
                    <span className="font-mono text-[11px] text-ink-3">{m.memberNumber}</span>
                  </TableCell>
                  <TableCell className="text-[12.5px]">
                    {m.planName}
                    {m.remainingVisits != null ? (
                      <span className="block text-[11px] text-ink-3 tabular">
                        {m.remainingVisits}/{m.totalVisits} visits
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="whitespace-nowrap text-[12px] tabular">
                      {m.startDate} → {m.endDate}
                    </span>
                    <DaysUntilText date={m.endDate} className="block text-[11px]" />
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
                    ) : (
                      <span className="text-[12px] tabular text-ink-4">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{m.branchName.split("— ")[1] ?? m.branchName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data ? <DataPagination page={data} onPage={setPage} /> : null}
    </div>
  );
}
