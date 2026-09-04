"use client";

import { Archive, Columns3, FileUp, GitMerge, Plus, Search, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { SavedViewControls } from "@/components/shared/saved-view-controls";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Monogram, TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Checkbox } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qk } from "@/lib/api/keys";
import type { MemberListQuery } from "@/lib/api/GymOSApi";
import type { MemberSummary } from "@/lib/domain/types";
import type { BulkOperationKind } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp } from "@/lib/providers/app-providers";

type MemberColumn = "phone" | "branch" | "plan" | "status" | "expiry" | "balance" | "last_check_in";
const ALL_COLUMNS: Array<{ key: MemberColumn; label: string }> = [
  { key: "phone", label: "Phone" }, { key: "branch", label: "Branch" }, { key: "plan", label: "Plan" }, { key: "status", label: "Status" },
  { key: "expiry", label: "Expiry" }, { key: "balance", label: "Balance" }, { key: "last_check_in", label: "Last check-in" },
];

function MembersPageInner() {
  const { session } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebouncedValue(search, 250);
  const [columns, setColumns] = useState<MemberColumn[]>(() => {
    const requested = params.get("columns")?.split(",").filter((item): item is MemberColumn => ALL_COLUMNS.some((column) => column.key === item));
    return requested?.length ? requested : ALL_COLUMNS.map((column) => column.key);
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<BulkOperationKind>("members_add_tags");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkReason, setBulkReason] = useState("");

  const recordStatus = params.get("record") === "archived" ? "archived" : "active";
  const membershipStatus = params.get("membership") ?? "all";
  const planId = params.get("plan") ?? "all";
  const sort = params.get("sort") ?? "fullName";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const replaceParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    if (!("page" in changes)) next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  useEffect(() => {
    if ((params.get("q") ?? "") !== debounced) replaceParams({ q: debounced || undefined });
    // Only settled search text drives this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const plansQuery = useApiQuery(qk.plans({}), (api) => api.listPlans({ pageSize: 50 }));
  const query: MemberListQuery = useMemo(() => ({ search: debounced || undefined, membershipStatus: membershipStatus === "all" ? undefined : membershipStatus as MemberListQuery["membershipStatus"], planId: planId === "all" ? undefined : planId, branchId: session?.activeBranchId, status: recordStatus, sort, page, pageSize: 20 }), [debounced, membershipStatus, page, planId, recordStatus, session?.activeBranchId, sort]);
  const members = useApiQuery(qk.members(query), (api) => api.listMembers(query));
  const branches = (session?.branches ?? []).map((branch) => ({ ...branch, status: "active" as const }));
  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.code ?? "—";
  const visible = (key: MemberColumn) => columns.includes(key);

  const runBulk = useApiMutation((api) => api.runBulkOperation({
    kind: bulkKind,
    recordIds: [...selected],
    idempotencyKey: crypto.randomUUID(),
    tags: bulkKind.includes("tags") ? bulkValue.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined,
    branchId: bulkKind === "members_assign_branch" ? bulkValue : undefined,
    dueAt: bulkKind === "members_create_follow_up" ? new Date(bulkValue).toISOString() : undefined,
    reason: bulkKind === "members_archive" ? bulkReason.trim() : undefined,
  }), { onSuccess: async (job) => { await invalidate(); setBulkOpen(false); setSelected(new Set()); setBulkValue(""); setBulkReason(""); toast.success(`${job.succeededCount} updated${job.skippedCount ? `, ${job.skippedCount} skipped` : ""}${job.failedCount ? `, ${job.failedCount} failed` : ""}.`); } });

  const viewState = { q: debounced || undefined, record: recordStatus, membership: membershipStatus, plan: planId, sort, columns };
  const applyView = (state: Record<string, unknown>) => {
    const nextColumns = Array.isArray(state.columns) ? state.columns.map(String).filter((item): item is MemberColumn => ALL_COLUMNS.some((column) => column.key === item)) : columns;
    setColumns(nextColumns.length ? nextColumns : columns);
    setSearch(typeof state.q === "string" ? state.q : "");
    replaceParams({ q: typeof state.q === "string" ? state.q : undefined, record: state.record === "archived" ? "archived" : undefined, membership: typeof state.membership === "string" && state.membership !== "all" ? state.membership : undefined, plan: typeof state.plan === "string" && state.plan !== "all" ? state.plan : undefined, sort: typeof state.sort === "string" && state.sort !== "fullName" ? state.sort : undefined, columns: nextColumns.join(",") });
  };
  const pageIds = members.data?.items.map((member) => member.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = () => setSelected((current) => { const next = new Set(current); if (allPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id)); return next; });
  const validBulk = selected.size > 0 && (bulkKind === "members_archive" ? bulkReason.trim().length >= 3 : bulkValue.trim().length > 0);

  return <div className="space-y-4">
    <PageHeader title="Members" description="Every person who trains with you — search, filter, and finish repeat work in batches." actions={<><Button asChild variant="secondary" size="sm"><Link href="/members/duplicates"><GitMerge /> Duplicates</Link></Button><Gate permission="members.write"><Button asChild variant="secondary" size="sm"><Link href="/members/import"><FileUp /> Import CSV</Link></Button><Button asChild size="sm" data-testid="add-member"><Link href="/members/new"><Plus /> Add member</Link></Button></Gate></>} />
    <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-3 min-[1180px]:flex min-[1180px]:flex-nowrap" data-testid="member-filters">
      <div className="relative col-span-2 min-w-0 sm:col-span-3 min-[1180px]:col-span-1 min-[1180px]:min-w-32 min-[1180px]:flex-1"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, member number…" className="h-11 ps-8 min-[1180px]:h-8" aria-label="Search members" data-testid="member-search" /></div>
      <Select value={recordStatus} onValueChange={(value) => replaceParams({ record: value === "active" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-28" aria-label="Record status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select>
      <Select value={membershipStatus} onValueChange={(value) => replaceParams({ membership: value === "all" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-32" aria-label="Membership status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active membership</SelectItem><SelectItem value="expiring">Expiring ≤ 14d</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="frozen">Frozen</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem><SelectItem value="depleted">Visits used up</SelectItem><SelectItem value="outstanding">Has balance due</SelectItem></SelectContent></Select>
      <Select value={planId} onValueChange={(value) => replaceParams({ plan: value === "all" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-24" aria-label="Plan filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All plans</SelectItem>{(plansQuery.data?.items ?? []).map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select>
      <Select value={sort} onValueChange={(value) => replaceParams({ sort: value === "fullName" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-28" aria-label="Sort members"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fullName">Name A–Z</SelectItem><SelectItem value="-createdAt">Newest first</SelectItem><SelectItem value="membershipEndDate">Expiry soonest</SelectItem><SelectItem value="-outstanding">Highest balance</SelectItem><SelectItem value="-lastCheckInAt">Recent check-in</SelectItem></SelectContent></Select>
      <Button size="sm" variant="secondary" className="h-11 w-full min-[1180px]:h-8 min-[1180px]:w-auto" onClick={() => setColumnsOpen(true)}><Columns3 /> Columns</Button>
      <SavedViewControls compact className="col-span-2 sm:col-span-2 min-[1180px]:col-span-1 min-[1180px]:shrink-0" surface="members" state={viewState} onApply={applyView} hasExplicitState={["q", "record", "membership", "plan", "sort", "columns"].some((key) => params.has(key))} />
    </div>

    {selected.size ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink bg-ink px-3 py-2 text-paper"><span className="text-[12.5px] font-semibold">{selected.size} selected</span><Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}><Tags /> Bulk action</Button><button type="button" className="text-[11.5px] underline underline-offset-4" onClick={() => setSelected(new Set())}>Clear selection</button></div> : null}

    <div className="panel overflow-hidden">
      {members.isLoading ? (
        <div className="p-4"><TableSkeleton rows={10} cols={columns.length + 2} /></div>
      ) : members.isError ? (
        <div className="p-4"><ErrorState layout="section" onRetry={() => members.refetch()} /></div>
      ) : !members.data?.items.length ? (
        <EmptyState layout="section" title="No members match" description={debounced ? `Nothing found for “${debounced}”. Check the spelling or filters.` : "Try widening the filters."} className="m-4" />
      ) : (
        <>
          <ul className="divide-y divide-line xl:hidden" aria-label="Members">
            {members.data.items.map((member) => (
              <MemberCompactRow
                key={member.id}
                member={member}
                branch={branchName(member.homeBranchId)}
                visible={visible}
                selected={selected.has(member.id)}
                onSelected={(checked) => setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(member.id); else next.delete(member.id);
                  return next;
                })}
              />
            ))}
          </ul>
          <div className="hidden xl:block">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={togglePage} aria-label="Select all members on this page" /></TableHead><TableHead>Member</TableHead>{visible("phone") ? <TableHead>Phone</TableHead> : null}{visible("branch") ? <TableHead>Branch</TableHead> : null}{visible("plan") ? <TableHead>Plan</TableHead> : null}{visible("status") ? <TableHead>Status</TableHead> : null}{visible("expiry") ? <TableHead>Expiry</TableHead> : null}{visible("balance") ? <TableHead className="text-end">Balance</TableHead> : null}{visible("last_check_in") ? <TableHead>Last check-in</TableHead> : null}</TableRow></TableHeader>
              <TableBody>{members.data.items.map((member) => <TableRow key={member.id} interactive onClick={() => router.push(`/members/${member.id}`)} data-testid="member-row"><TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={selected.has(member.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(member.id); else next.delete(member.id); return next; })} aria-label={`Select ${member.fullName}`} /></TableCell><TableCell><div className="flex items-center gap-2.5"><Monogram name={member.fullName} size="sm" /><div className="min-w-0"><p className="truncate font-medium text-ink">{member.fullName}</p><p className="font-mono text-[11px] text-ink-3">{member.memberNumber}</p></div></div></TableCell>{visible("phone") ? <TableCell className="whitespace-nowrap font-mono text-[12px] text-ink-2" dir="ltr">{member.phone}</TableCell> : null}{visible("branch") ? <TableCell className="text-ink-2">{branchName(member.homeBranchId)}</TableCell> : null}{visible("plan") ? <TableCell className="text-ink-2">{member.currentPlanName ?? "—"}</TableCell> : null}{visible("status") ? <TableCell>{member.status === "archived" ? <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep">Archived</span> : <MembershipStatusChip status={member.membershipStatus} />}</TableCell> : null}{visible("expiry") ? <TableCell className="whitespace-nowrap">{member.membershipEndDate ? <span className="flex items-baseline gap-1.5"><span className="text-[12px] tabular">{member.membershipEndDate}</span><DaysUntilText date={member.membershipEndDate} className="text-[11px]" /></span> : "—"}</TableCell> : null}{visible("balance") ? <TableCell className="text-end">{member.outstanding.amount > 0 ? <MoneyText money={member.outstanding} className="font-medium text-warning-deep" /> : <span className="text-[12px] tabular text-ink-4">0.000</span>}</TableCell> : null}{visible("last_check_in") ? <TableCell className="whitespace-nowrap text-[12px] text-ink-3"><RelativeText iso={member.lastCheckInAt} /></TableCell> : null}</TableRow>)}</TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
    {members.data ? <DataPagination page={members.data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}

    <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}><DialogContent><DialogHeader><DialogTitle>Choose table columns</DialogTitle><DialogDescription>These choices can be included in a saved view.</DialogDescription></DialogHeader><DialogBody className="grid gap-2 sm:grid-cols-2">{ALL_COLUMNS.map((column) => <label key={column.key} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12.5px]"><Checkbox checked={columns.includes(column.key)} onCheckedChange={(checked) => setColumns((current) => checked ? [...new Set([...current, column.key])] : current.length > 1 ? current.filter((item) => item !== column.key) : current)} />{column.label}</label>)}</DialogBody><DialogFooter><Button onClick={() => { replaceParams({ columns: columns.join(",") }); setColumnsOpen(false); }}>Apply columns</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={bulkOpen} onOpenChange={setBulkOpen}><DialogContent><DialogHeader><DialogTitle>Update {selected.size} members</DialogTitle><DialogDescription>Each record is permission-checked. The result and sensitive changes are written to the audit history.</DialogDescription></DialogHeader><DialogBody className="space-y-4"><label className="grid gap-1.5 text-[12.5px] font-medium">Action<Select value={bulkKind} onValueChange={(value) => { setBulkKind(value as BulkOperationKind); setBulkValue(""); setBulkReason(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="members_add_tags">Add tags</SelectItem><SelectItem value="members_remove_tags">Remove tags</SelectItem><SelectItem value="members_assign_branch">Assign home branch</SelectItem><SelectItem value="members_create_follow_up">Create follow-up</SelectItem><SelectItem value="members_archive">Archive members</SelectItem></SelectContent></Select></label>{bulkKind.includes("tags") ? <label className="grid gap-1.5 text-[12.5px] font-medium">Tags<Input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder="vip, morning" /></label> : bulkKind === "members_assign_branch" ? <label className="grid gap-1.5 text-[12.5px] font-medium">Home branch<Select value={bulkValue || "none"} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger><SelectContent><SelectItem value="none" disabled>Choose branch</SelectItem>{branches.filter((branch) => branch.status === "active").map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></label> : bulkKind === "members_create_follow_up" ? <label className="grid gap-1.5 text-[12.5px] font-medium">Due date and time<Input type="datetime-local" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} /></label> : <label className="grid gap-1.5 text-[12.5px] font-medium">Archive reason<Textarea value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder="Why are these records being archived?" /></label>}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button variant={bulkKind === "members_archive" ? "danger" : "primary"} disabled={!validBulk} loading={runBulk.isPending} onClick={() => runBulk.mutate()}>{bulkKind === "members_archive" ? <Archive /> : <Tags />} Apply to {selected.size}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export default function MembersPage() { return <Suspense><MembersPageInner /></Suspense>; }

function MemberCompactRow({ member, branch, visible, selected, onSelected }: {
  member: MemberSummary;
  branch: string;
  visible: (column: MemberColumn) => boolean;
  selected: boolean;
  onSelected: (checked: boolean) => void;
}) {
  const facts: Array<{ label: string; value: React.ReactNode }> = [];
  if (visible("plan")) facts.push({ label: "Plan", value: member.currentPlanName ?? "No active plan" });
  if (visible("expiry")) facts.push({ label: "Expiry", value: member.membershipEndDate ? <span className="flex flex-wrap items-baseline gap-1.5"><span className="tabular">{member.membershipEndDate}</span><DaysUntilText date={member.membershipEndDate} /></span> : "—" });
  if (visible("balance")) facts.push({ label: "Balance", value: member.outstanding.amount > 0 ? <MoneyText money={member.outstanding} className="font-medium text-warning-deep" /> : <span className="tabular text-ink-3">0.000</span> });
  if (visible("last_check_in")) facts.push({ label: "Last check-in", value: <RelativeText iso={member.lastCheckInAt} /> });

  return (
    <li className="px-4 py-3.5" data-testid="member-card">
      <div className="flex items-start gap-3">
        <Checkbox className="mt-1" checked={selected} onCheckedChange={onSelected} aria-label={`Select ${member.fullName}`} />
        <Monogram name={member.fullName} size="sm" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <Link href={`/members/${member.id}`} className="block min-h-6 truncate text-[14px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:underline">{member.fullName}</Link>
              <p className="font-mono text-[11px] text-ink-3">{member.memberNumber}</p>
            </div>
            {visible("status") ? member.status === "archived" ? <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep">Archived</span> : <MembershipStatusChip status={member.membershipStatus} /> : null}
          </div>
          {(visible("phone") || visible("branch")) ? <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-2">{visible("phone") ? <span dir="ltr">{member.phone}</span> : null}{visible("branch") ? <span>{branch}</span> : null}</p> : null}
          {facts.length ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-4">{facts.map((fact) => <div key={fact.label} className="min-w-0"><dt className="text-[12px] text-ink-3">{fact.label}</dt><dd className="mt-0.5 truncate text-[12.5px] text-ink-2">{fact.value}</dd></div>)}</dl> : null}
        </div>
      </div>
    </li>
  );
}
