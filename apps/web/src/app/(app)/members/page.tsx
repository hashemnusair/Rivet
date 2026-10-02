"use client";

import { Archive, Columns3, FileUp, FilterX, GitMerge, Plus, Search, Tags } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { DateText, DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
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
import { pageFromParams, useReplaceSearchParams, useUrlSearchText } from "@/lib/hooks/use-url-state";
import { useApp } from "@/lib/providers/app-providers";
import { useLocale, type TKey } from "@/lib/i18n/provider";

type MemberColumn = "phone" | "branch" | "plan" | "status" | "expiry" | "balance" | "last_check_in";
const ALL_COLUMNS: Array<{ key: MemberColumn; label: TKey }> = [
  { key: "phone", label: "members.list.columns.phone" }, { key: "branch", label: "members.list.columns.branch" }, { key: "plan", label: "members.list.columns.plan" }, { key: "status", label: "members.list.columns.status" },
  { key: "expiry", label: "members.list.columns.expiry" }, { key: "balance", label: "members.list.columns.balance" }, { key: "last_check_in", label: "members.list.columns.lastCheckIn" },
];

function MembersPageInner() {
  const { session } = useApp();
  const { t, isolate } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  const invalidate = useInvalidate();
  // Settled search text lives in the URL with the other filters; Back/Forward
  // and a shared link refill the box instead of being overwritten by it.
  const { text: search, setText: setSearch, settled: debounced } = useUrlSearchText();
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
  const page = pageFromParams(params);
  const filtersActive = Boolean(debounced) || recordStatus !== "active" || membershipStatus !== "all" || planId !== "all";
  const clearFilters = () => {
    setSearch("");
    replaceParams({ q: undefined, record: undefined, membership: undefined, plan: undefined });
  };

  const plansQuery = useApiQuery(qk.plans({}), (api) => api.listPlans({ pageSize: 50 }));
  const query: MemberListQuery = useMemo(() => ({ search: debounced || undefined, membershipStatus: membershipStatus === "all" ? undefined : membershipStatus as MemberListQuery["membershipStatus"], planId: planId === "all" ? undefined : planId, branchId: session?.activeBranchId, status: recordStatus, sort, page, pageSize: 20 }), [debounced, membershipStatus, page, planId, recordStatus, session?.activeBranchId, sort]);
  const members = useApiQuery(qk.members(query), (api) => api.listMembers(query));
  const branches = (session?.branches ?? []).map((branch) => ({ ...branch, status: "active" as const }));
  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.code ?? "—";
  const visible = (key: MemberColumn) => columns.includes(key);

  const bulkSummary = (job: { succeededCount: number; skippedCount: number; failedCount: number }) => {
    const parts = [t("members.bulk.toast.updated", { count: job.succeededCount })];
    if (job.skippedCount) parts.push(t("members.bulk.toast.skipped", { count: job.skippedCount }));
    if (job.failedCount) parts.push(t("members.bulk.toast.failed", { count: job.failedCount }));
    return `${parts.join(t("members.bulk.toast.separator"))}${t("members.bulk.toast.end")}`;
  };

  const runBulk = useApiMutation((api) => api.runBulkOperation({
    kind: bulkKind,
    recordIds: [...selected],
    idempotencyKey: crypto.randomUUID(),
    tags: bulkKind.includes("tags") ? bulkValue.split(/[,،]/).map((tag) => tag.trim()).filter(Boolean) : undefined,
    branchId: bulkKind === "members_assign_branch" ? bulkValue : undefined,
    dueAt: bulkKind === "members_create_follow_up" ? new Date(bulkValue).toISOString() : undefined,
    reason: bulkKind === "members_archive" ? bulkReason.trim() : undefined,
  }), { onSuccess: async (job) => { await invalidate(); setBulkOpen(false); setSelected(new Set()); setBulkValue(""); setBulkReason(""); toast.success(bulkSummary(job)); } });

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
    <PageHeader title={t("members.list.title")} description={t("members.list.description")} actions={<><Button asChild variant="secondary" size="sm"><Link href="/members/duplicates"><GitMerge /> {t("members.list.actions.duplicates")}</Link></Button><Gate permission="members.write"><Button asChild variant="secondary" size="sm"><Link href="/members/import"><FileUp /> {t("members.list.actions.import")}</Link></Button><Button asChild size="sm" data-testid="add-member"><Link href="/members/new"><Plus /> {t("members.list.actions.add")}</Link></Button></Gate></>} />
    <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-3 min-[1180px]:flex min-[1180px]:flex-nowrap" data-testid="member-filters">
      <div className="relative col-span-2 min-w-0 sm:col-span-3 min-[1180px]:col-span-1 min-[1180px]:min-w-32 min-[1180px]:flex-1"><Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("members.list.search.placeholder")} className="h-11 ps-8 min-[1180px]:h-8" aria-label={t("members.list.search.label")} dir="auto" data-testid="member-search" /></div>
      <Select value={recordStatus} onValueChange={(value) => replaceParams({ record: value === "active" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-28" aria-label={t("members.list.filters.recordLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{t("members.list.filters.recordActive")}</SelectItem><SelectItem value="archived">{t("members.list.filters.recordArchived")}</SelectItem></SelectContent></Select>
      <Select value={membershipStatus} onValueChange={(value) => replaceParams({ membership: value === "all" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-32" aria-label={t("members.list.filters.membershipLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("members.list.filters.allStatuses")}</SelectItem><SelectItem value="active">{t("members.list.filters.membershipActive")}</SelectItem><SelectItem value="expiring">{t("members.list.filters.expiring")}</SelectItem><SelectItem value="expired">{t("members.list.filters.expired")}</SelectItem><SelectItem value="frozen">{t("members.list.filters.frozen")}</SelectItem><SelectItem value="cancelled">{t("members.list.filters.cancelled")}</SelectItem><SelectItem value="depleted">{t("members.list.filters.depleted")}</SelectItem><SelectItem value="outstanding">{t("members.list.filters.outstanding")}</SelectItem></SelectContent></Select>
      <Select value={planId} onValueChange={(value) => replaceParams({ plan: value === "all" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-24" aria-label={t("members.list.filters.planLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("members.list.filters.allPlans")}</SelectItem>{(plansQuery.data?.items ?? []).map((plan) => <SelectItem key={plan.id} value={plan.id}><bdi>{plan.name}</bdi></SelectItem>)}</SelectContent></Select>
      <Select value={sort} onValueChange={(value) => replaceParams({ sort: value === "fullName" ? undefined : value })}><SelectTrigger sizeVariant="sm" className="h-11 min-[1180px]:h-8 min-[1180px]:w-28" aria-label={t("members.list.filters.sortLabel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fullName">{t("members.list.filters.sortName")}</SelectItem><SelectItem value="-createdAt">{t("members.list.filters.sortNewest")}</SelectItem><SelectItem value="membershipEndDate">{t("members.list.filters.sortEndsSoonest")}</SelectItem><SelectItem value="-outstanding">{t("members.list.filters.sortOwesMost")}</SelectItem><SelectItem value="-lastCheckInAt">{t("members.list.filters.sortRecentCheckIn")}</SelectItem></SelectContent></Select>
      <Button size="sm" variant="secondary" className="h-11 w-full min-[1180px]:h-8 min-[1180px]:w-auto" onClick={() => setColumnsOpen(true)}><Columns3 /> {t("members.list.filters.columns")}</Button>
      {filtersActive ? <Button size="sm" variant="ghost" className="h-11 w-full min-[1180px]:h-8 min-[1180px]:w-auto" onClick={clearFilters} data-testid="member-clear-filters"><FilterX /> {t("common.action.clearFilters")}</Button> : null}
      <SavedViewControls compact className="col-span-2 sm:col-span-2 min-[1180px]:col-span-1 min-[1180px]:shrink-0" surface="members" state={viewState} onApply={applyView} hasExplicitState={["q", "record", "membership", "plan", "sort", "columns"].some((key) => params.has(key))} />
    </div>

    {selected.size ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink bg-ink px-3 py-2 text-paper"><span className="text-[12.5px] font-semibold">{t("members.list.selected", { count: selected.size })}</span><Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}><Tags /> {t("members.list.updateSelected")}</Button><button type="button" className="text-[12px] underline underline-offset-4" onClick={() => setSelected(new Set())}>{t("members.list.clearSelection")}</button></div> : null}

    <div className="panel overflow-hidden">
      {members.isLoading ? (
        <div className="p-4"><TableSkeleton rows={10} cols={columns.length + 2} /></div>
      ) : members.isError ? (
        <div className="p-4"><ErrorState layout="section" onRetry={() => members.refetch()} /></div>
      ) : !members.data?.items.length ? (
        filtersActive ? (
          <EmptyState layout="section" title={t("members.list.empty.noMatchTitle")} description={debounced ? t("members.list.empty.noMatchSearch", { query: isolate(debounced) }) : t("members.list.empty.noMatchFilters")} className="m-4" action={<Button variant="secondary" size="sm" onClick={clearFilters}>{t("common.action.clearFilters")}</Button>} />
        ) : (
          <EmptyState layout="section" title={t("members.list.empty.noneTitle")} description={session?.activeBranchId ? t("members.list.empty.noneBranch") : t("members.list.empty.noneAll")} className="m-4" action={<Gate permission="members.write"><Button asChild size="sm"><Link href="/members/new"><Plus /> {t("members.list.actions.add")}</Link></Button></Gate>} />
        )
      ) : (
        <>
          <ul className="divide-y divide-line xl:hidden" aria-label={t("members.list.listLabel")}>
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
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-10"><Checkbox checked={allPageSelected} onCheckedChange={togglePage} aria-label={t("members.list.selectAll")} /></TableHead><TableHead>{t("members.list.columns.member")}</TableHead>{visible("phone") ? <TableHead>{t("members.list.columns.phone")}</TableHead> : null}{visible("branch") ? <TableHead>{t("members.list.columns.branch")}</TableHead> : null}{visible("plan") ? <TableHead>{t("members.list.columns.plan")}</TableHead> : null}{visible("status") ? <TableHead>{t("members.list.columns.status")}</TableHead> : null}{visible("expiry") ? <TableHead>{t("members.list.columns.expiry")}</TableHead> : null}{visible("balance") ? <TableHead className="text-end">{t("members.list.columns.balance")}</TableHead> : null}{visible("last_check_in") ? <TableHead>{t("members.list.columns.lastCheckIn")}</TableHead> : null}</TableRow></TableHeader>
              <TableBody>{members.data.items.map((member) => <TableRow key={member.id} interactive onClick={() => router.push(`/members/${member.id}`)} data-testid="member-row"><TableCell onClick={(event) => event.stopPropagation()}><Checkbox checked={selected.has(member.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(member.id); else next.delete(member.id); return next; })} aria-label={t("members.list.selectMember", { name: isolate(member.fullName) })} /></TableCell><TableCell><div className="flex items-center gap-2.5"><Monogram name={member.fullName} size="sm" /><div className="min-w-0"><p className="truncate font-medium text-ink"><bdi>{member.fullName}</bdi></p><p className="font-mono text-[11px] text-ink-3"><bdi dir="ltr">{member.memberNumber}</bdi></p></div></div></TableCell>{visible("phone") ? <TableCell className="whitespace-nowrap text-start font-mono text-[12px] text-ink-2"><bdi dir="ltr">{member.phone}</bdi></TableCell> : null}{visible("branch") ? <TableCell className="text-ink-2"><bdi>{branchName(member.homeBranchId)}</bdi></TableCell> : null}{visible("plan") ? <TableCell className="text-ink-2">{member.currentPlanName ? <bdi>{member.currentPlanName}</bdi> : "—"}</TableCell> : null}{visible("status") ? <TableCell>{member.status === "archived" ? <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[12px] font-medium text-signal-deep">{t("members.list.archivedChip")}</span> : <MembershipStatusChip status={member.membershipStatus} />}</TableCell> : null}{visible("expiry") ? <TableCell className="whitespace-nowrap">{member.membershipEndDate ? <span className="flex items-baseline gap-1.5"><DateText iso={member.membershipEndDate} className="text-[12px] tabular" /><DaysUntilText date={member.membershipEndDate} className="text-[12px]" /></span> : "—"}</TableCell> : null}{visible("balance") ? <TableCell className="text-end">{member.outstanding.amount > 0 ? <MoneyText money={member.outstanding} className="font-medium text-warning-deep" /> : <span className="text-[12px] tabular text-ink-4" dir="ltr">0.000</span>}</TableCell> : null}{visible("last_check_in") ? <TableCell className="whitespace-nowrap text-[12px] text-ink-3"><RelativeText iso={member.lastCheckInAt} /></TableCell> : null}</TableRow>)}</TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
    {members.data ? <DataPagination page={members.data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}

    <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}><DialogContent><DialogHeader><DialogTitle>{t("members.columnsDialog.title")}</DialogTitle><DialogDescription>{t("members.columnsDialog.description")}</DialogDescription></DialogHeader><DialogBody className="grid gap-2 sm:grid-cols-2">{ALL_COLUMNS.map((column) => <label key={column.key} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12.5px]"><Checkbox checked={columns.includes(column.key)} onCheckedChange={(checked) => setColumns((current) => checked ? [...new Set([...current, column.key])] : current.length > 1 ? current.filter((item) => item !== column.key) : current)} />{t(column.label)}</label>)}</DialogBody><DialogFooter><Button onClick={() => { replaceParams({ columns: columns.join(",") }); setColumnsOpen(false); }}>{t("members.columnsDialog.confirm")}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={bulkOpen} onOpenChange={setBulkOpen}><DialogContent><DialogHeader><DialogTitle>{t("members.bulk.title", { count: selected.size })}</DialogTitle><DialogDescription>{bulkKind === "members_archive" ? t("members.bulk.archiveDescription") : t("members.bulk.description")}</DialogDescription></DialogHeader><DialogBody className="space-y-4"><label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.action")}<Select value={bulkKind} onValueChange={(value) => { setBulkKind(value as BulkOperationKind); setBulkValue(""); setBulkReason(""); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="members_add_tags">{t("members.bulk.addTags")}</SelectItem><SelectItem value="members_remove_tags">{t("members.bulk.removeTags")}</SelectItem><SelectItem value="members_assign_branch">{t("members.bulk.assignBranch")}</SelectItem><SelectItem value="members_create_follow_up">{t("members.bulk.createFollowUp")}</SelectItem><SelectItem value="members_archive">{t("members.bulk.archive")}</SelectItem></SelectContent></Select></label>{bulkKind.includes("tags") ? <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.tags")}<Input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} placeholder={t("members.bulk.tagsPlaceholder")} dir="auto" /></label> : bulkKind === "members_assign_branch" ? <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.homeBranch")}<Select value={bulkValue || "none"} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder={t("members.bulk.chooseBranch")} /></SelectTrigger><SelectContent><SelectItem value="none" disabled>{t("members.bulk.chooseBranch")}</SelectItem>{branches.filter((branch) => branch.status === "active").map((branch) => <SelectItem key={branch.id} value={branch.id}><bdi>{branch.name}</bdi></SelectItem>)}</SelectContent></Select></label> : bulkKind === "members_create_follow_up" ? <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.dueAt")}<Input type="datetime-local" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} dir="ltr" /></label> : <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.archiveReason")}<Textarea value={bulkReason} onChange={(event) => setBulkReason(event.target.value)} placeholder={t("members.bulk.archiveReasonPlaceholder")} dir="auto" /></label>}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => setBulkOpen(false)}>{t("common.action.cancel")}</Button><Button variant={bulkKind === "members_archive" ? "danger" : "primary"} disabled={!validBulk} loading={runBulk.isPending} onClick={() => runBulk.mutate()}>{bulkKind === "members_archive" ? <Archive /> : <Tags />} {bulkKind === "members_archive" ? t("members.bulk.archiveTitle", { count: selected.size }) : t("members.bulk.title", { count: selected.size })}</Button></DialogFooter></DialogContent></Dialog>
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
  const { t, isolate } = useLocale();
  const facts: Array<{ label: string; value: React.ReactNode }> = [];
  if (visible("plan")) facts.push({ label: t("members.list.columns.plan"), value: member.currentPlanName ? <bdi>{member.currentPlanName}</bdi> : t("members.list.noActivePlan") });
  if (visible("expiry")) facts.push({ label: t("members.list.columns.expiry"), value: member.membershipEndDate ? <span className="flex flex-wrap items-baseline gap-1.5"><DateText iso={member.membershipEndDate} className="tabular" /><DaysUntilText date={member.membershipEndDate} /></span> : "—" });
  if (visible("balance")) facts.push({ label: t("members.list.columns.balance"), value: member.outstanding.amount > 0 ? <MoneyText money={member.outstanding} className="font-medium text-warning-deep" /> : <span className="tabular text-ink-3" dir="ltr">0.000</span> });
  if (visible("last_check_in")) facts.push({ label: t("members.list.columns.lastCheckIn"), value: <RelativeText iso={member.lastCheckInAt} /> });

  return (
    <li className="px-4 py-3.5" data-testid="member-card">
      <div className="flex items-start gap-3">
        <Checkbox className="mt-1" checked={selected} onCheckedChange={onSelected} aria-label={t("members.list.selectMember", { name: isolate(member.fullName) })} />
        <Monogram name={member.fullName} size="sm" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <Link href={`/members/${member.id}`} className="block min-h-6 truncate text-[14px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:underline"><bdi>{member.fullName}</bdi></Link>
              <p className="font-mono text-[11px] text-ink-3"><bdi dir="ltr">{member.memberNumber}</bdi></p>
            </div>
            {visible("status") ? member.status === "archived" ? <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[12px] font-medium text-signal-deep">{t("members.list.archivedChip")}</span> : <MembershipStatusChip status={member.membershipStatus} /> : null}
          </div>
          {(visible("phone") || visible("branch")) ? <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-2">{visible("phone") ? <bdi dir="ltr">{member.phone}</bdi> : null}{visible("branch") ? <bdi>{branch}</bdi> : null}</p> : null}
          {facts.length ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-4">{facts.map((fact) => <div key={fact.label} className="min-w-0"><dt className="text-[12px] text-ink-3">{fact.label}</dt><dd className="mt-0.5 truncate text-[12.5px] text-ink-2">{fact.value}</dd></div>)}</dl> : null}
        </div>
      </div>
    </li>
  );
}
