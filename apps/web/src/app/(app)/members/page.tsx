"use client";

import { FileUp, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { MemberListQuery } from "@/lib/api/GymOSApi";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monogram, TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MembersPage() {
  const { session } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [recordStatus, setRecordStatus] = useState<"active" | "archived">("active");
  const [membershipStatus, setMembershipStatus] = useState<string>("all");
  const [planId, setPlanId] = useState<string>("all");
  const [page, setPage] = useState(1);

  const plansQuery = useApiQuery(qk.plans({}), (api) => api.listPlans({ pageSize: 50 }));

  const query: MemberListQuery = useMemo(
    () => ({
      search: debounced || undefined,
      membershipStatus: membershipStatus === "all" ? undefined : (membershipStatus as MemberListQuery["membershipStatus"]),
      planId: planId === "all" ? undefined : planId,
      branchId: session?.activeBranchId,
      status: recordStatus,
      page,
      pageSize: 20,
    }),
    [debounced, membershipStatus, planId, recordStatus, session?.activeBranchId, page],
  );

  const { data, isLoading, isError, refetch } = useApiQuery(qk.members(query), (api) => api.listMembers(query));

  const branches = session?.branches ?? [];
  const branchName = (id: string) => branches.find((b) => b.id === id)?.code ?? "—";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operations"
        title="Members"
        description="Every person who trains with you — search, filter, act."
        actions={
          <>
            <Gate permission="members.write">
              <Button asChild variant="secondary">
                <Link href="/members/import">
                  <FileUp /> Import CSV
                </Link>
              </Button>
              <Button asChild data-testid="add-member">
                <Link href="/members/new">
                  <Plus /> Add member
                </Link>
              </Button>
            </Gate>
          </>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name, phone, member number…"
            className="ps-8"
            aria-label="Search members"
            data-testid="member-search"
          />
        </div>
        <Select
          value={recordStatus}
          onValueChange={(value: "active" | "archived") => {
            setRecordStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger sizeVariant="sm" className="w-32" aria-label="Record status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active members</SelectItem>
            <SelectItem value="archived">Archived members</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={membershipStatus}
          onValueChange={(v) => {
            setMembershipStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger sizeVariant="sm" className="w-40" aria-label="Membership status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All membership statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring ≤ 14d</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="frozen">Frozen</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="depleted">Visits used up</SelectItem>
            <SelectItem value="outstanding">Has balance due</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={planId}
          onValueChange={(v) => {
            setPlanId(v);
            setPage(1);
          }}
        >
          <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Plan filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {(plansQuery.data?.items ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data ? (
          <span className="ms-auto text-[11.5px] text-ink-3 tabular">{data.totalItems} members</span>
        ) : null}
      </div>

      {/* Table */}
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
          <EmptyState
            title="No members match"
            description={debounced ? `Nothing found for “${debounced}”. Check the spelling or filters.` : "Try widening the filters."}
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-end">Balance</TableHead>
                <TableHead>Last check-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((m) => (
                <TableRow key={m.id} interactive onClick={() => router.push(`/members/${m.id}`)} data-testid="member-row">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Monogram name={m.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{m.fullName}</p>
                        <p className="font-mono text-[11px] text-ink-3">{m.memberNumber}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px] text-ink-2" dir="ltr">{m.phone}</TableCell>
                  <TableCell className="text-ink-2">{branchName(m.homeBranchId)}</TableCell>
                  <TableCell className="text-ink-2">{m.currentPlanName ?? "—"}</TableCell>
                  <TableCell>
                    {m.status === "archived" ? (
                      <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep">Archived</span>
                    ) : (
                      <MembershipStatusChip status={m.membershipStatus} />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.membershipEndDate ? (
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[12px] tabular">{m.membershipEndDate}</span>
                        <DaysUntilText date={m.membershipEndDate} className="text-[11px]" />
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    {m.outstanding.amount > 0 ? (
                      <MoneyText money={m.outstanding} className="font-medium text-warning-deep" />
                    ) : (
                      <span className="text-[12px] tabular text-ink-4">0.000</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-ink-3">
                    <RelativeText iso={m.lastCheckInAt} />
                  </TableCell>
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
