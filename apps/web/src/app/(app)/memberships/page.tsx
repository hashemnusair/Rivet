"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { MembershipListQuery } from "@/lib/api/GymOSApi";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { DaysUntilText, MoneyText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip, PaymentStatusChip } from "@/components/shared/status-chip";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton, TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";

export default function MembershipsPage() {
  return <WorkspaceModuleBoundary moduleKey="revenue"><MembershipsWorkspace /></WorkspaceModuleBoundary>;
}

function MembershipsWorkspace() {
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
        title="Memberships"
        description="Every term ever sold — current, past, frozen and cancelled."
      />

      <FreezeRequestsPanel />

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
                    ) : (m.upcomingAmount?.amount ?? 0) > 0 ? (
                      <span className="text-[11px] text-info"><MoneyText money={m.upcomingAmount!} /> upcoming · {m.startDate}</span>
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

function FreezeRequestsPanel() {
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
    successMessage: "Freeze request decided and audited.",
  });

  if (requestsQuery.isLoading) return <Skeleton className="h-24 w-full" />;
  if (requestsQuery.isError) {
    return <section className="rounded-lg border border-line bg-surface p-4" aria-label="Freeze requests"><ErrorState title="Freeze requests could not be loaded" description="No request has been approved or denied. Retry before handling member requests." onRetry={() => requestsQuery.refetch()} /></section>;
  }
  const pending = requestsQuery.data ?? [];
  if (pending.length === 0) return null;
  return (
    <section className="rounded-lg border border-warning/40 bg-warning-bg/30 p-4" aria-label="Freeze requests">
      <p className="context-label">Member requests</p>
      <h2 className="mt-1 text-[15px] font-semibold">{pending.length} freeze request{pending.length === 1 ? "" : "s"} waiting</h2>
      <p className="mt-1 text-[11.5px] text-ink-3">RIVET recalculates any fee when you approve, using the gym&apos;s current policy.</p>
      <div className="mt-3 grid gap-2">
        {pending.map((request) => (
          <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2.5">
            <div className="min-w-0 text-[12.5px]">
              <p className="font-semibold">{request.memberName}</p>
              <p className="text-ink-3">{request.days} days from {request.startDate} · “{request.reason}” · {request.expectedFeeMinor > 0 ? `fee JOD ${(request.expectedFeeMinor / 1000).toFixed(3)}` : "free under policy"}</p>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="signal" loading={decide.isPending} onClick={() => decide.mutate({ requestId: request.id, decision: "approved" })}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => { setDenyId(request.id); setNote(""); }}>Deny</Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={Boolean(denyId)} onOpenChange={(open) => { if (!open) setDenyId(undefined); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Deny this freeze request?</DialogTitle></DialogHeader>
          <DialogBody>
            <label className="grid gap-1.5 text-[12px] font-medium">Reason the member will see<Textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDenyId(undefined)}>Cancel</Button>
            <Button variant="danger" loading={decide.isPending} disabled={!note.trim()} onClick={() => decide.mutate({ requestId: denyId!, decision: "denied", note: note.trim() })}>Deny request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
