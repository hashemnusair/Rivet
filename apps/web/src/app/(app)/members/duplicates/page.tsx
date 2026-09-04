"use client";

import { ArrowLeft, GitMerge, SearchX, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { DuplicateCase, DuplicateCaseStatus, DuplicateMemberSummary, MergeMemberInput } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";

const FIELD_ROWS: Array<{ key: keyof NonNullable<MergeMemberInput["fieldSourceMemberIds"]>; label: string }> = [
  { key: "fullName", label: "Full name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "homeBranchId", label: "Home branch" },
];

export default function DuplicateMembersPage() {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState<DuplicateCaseStatus>("open");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<DuplicateCase>();
  const [mode, setMode] = useState<"merge" | "ignore">("merge");
  const [survivorId, setSurvivorId] = useState("");
  const [fieldSources, setFieldSources] = useState<NonNullable<MergeMemberInput["fieldSourceMemberIds"]>>({});
  const [reason, setReason] = useState("");
  const query = useMemo(() => ({ status, page, pageSize: 20 }), [page, status]);
  const cases = useApiQuery(qk.duplicateCases(query), (api) => api.listDuplicateCases(query));
  useEffect(() => setPage(1), [status]);
  const branchName = (id: string) => session?.branches.find((branch) => branch.id === id)?.name ?? id;

  const merge = useApiMutation((api) => {
    if (!active) throw new Error("Choose a duplicate case.");
    const mergedMemberId = active.primary.id === survivorId ? active.candidate.id : active.primary.id;
    return api.mergeDuplicateMembers({ caseId: active.id, survivingMemberId: survivorId, mergedMemberId, primaryVersion: active.primary.version, candidateVersion: active.candidate.version, fieldSourceMemberIds: fieldSources, reason: reason.trim() });
  }, { onSuccess: async () => { await invalidate(); setActive(undefined); toast.success("Member records merged. Historical records were retained under their original IDs."); } });
  const ignore = useApiMutation((api) => { if (!active) throw new Error("Choose a duplicate case."); return api.ignoreDuplicateCase(active.id, reason.trim()); }, { onSuccess: async () => { await invalidate(); setActive(undefined); toast.success("Duplicate suggestion ignored."); } });

  const openCase = (item: DuplicateCase, nextMode: "merge" | "ignore") => {
    setActive(item); setMode(nextMode); setReason(""); setSurvivorId(item.primary.id);
    setFieldSources(Object.fromEntries(FIELD_ROWS.map((field) => [field.key, item.primary.id])) as NonNullable<MergeMemberInput["fieldSourceMemberIds"]>);
  };

  return <div className="space-y-5">
    <PageHeader title="Duplicate members" description="Resolve identity collisions without rewriting payments, visits, memberships, or audit history." actions={<Button asChild variant="secondary"><Link href="/members"><ArrowLeft /> Members</Link></Button>} />
    <div className="flex items-center gap-2"><Select value={status} onValueChange={(value) => setStatus(value as DuplicateCaseStatus)}><SelectTrigger sizeVariant="sm" className="w-44" aria-label="Duplicate case status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Needs review</SelectItem><SelectItem value="ignored">Ignored</SelectItem><SelectItem value="merged">Merged</SelectItem></SelectContent></Select><p className="text-[12px] text-ink-3">{cases.data?.totalItems ?? 0} cases</p></div>
    {cases.isLoading ? <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-64" />)}</div> : cases.isError ? <ErrorState onRetry={() => cases.refetch()} /> : !cases.data?.items.length ? <EmptyState icon={SearchX} title={status === "open" ? "No duplicate records need review" : `No ${status} duplicate cases`} description={status === "open" ? "New exact phone, email, or member-number matches will appear here." : "Change the status filter to review another queue."} /> : <><div className="grid gap-3 lg:grid-cols-2">{cases.data.items.map((item) => <article key={item.id} className="panel overflow-hidden"><div className="flex items-start justify-between gap-3 px-4 py-3.5"><div><p className="context-label">{item.confidence} match</p><h2 className="mt-1 text-[14px] font-semibold">{item.primary.fullName} ↔ {item.candidate.fullName}</h2><p className="mt-1 text-[12px] text-ink-3">Matched on {item.reasons.map((reason) => reason.replaceAll("_", " ")).join(", ")}</p></div><span className="rounded-full border border-line px-2 py-1 text-[12px] font-medium capitalize">{item.status}</span></div><div className="grid divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0"><MemberSummary member={item.primary} branchName={branchName(item.primary.homeBranchId)} /><MemberSummary member={item.candidate} branchName={branchName(item.candidate.homeBranchId)} /></div>{item.resolutionReason ? <p className="mx-4 mt-3 bg-sunken px-3 py-2 text-[12px] text-ink-2">Decision: {item.resolutionReason}</p> : null}{item.status === "open" ? <div className="flex flex-wrap justify-end gap-2 px-4 py-3.5"><Button size="sm" variant="ghost" onClick={() => openCase(item, "ignore")}>Not a duplicate</Button><Button size="sm" onClick={() => openCase(item, "merge")}><GitMerge /> Review merge</Button></div> : <div className="h-3" />}</article>)}</div><DataPagination page={cases.data} onPage={setPage} /></>}

    <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{mode === "merge" ? "Merge duplicate member records" : "Ignore duplicate suggestion"}</DialogTitle><DialogDescription>{mode === "merge" ? "Choose the surviving identity and the value to retain for each editable profile field. Operational history stays on its original immutable record and is combined when viewed." : "Explain why these are different people so the decision remains supportable."}</DialogDescription></DialogHeader>{active ? <DialogBody className="space-y-4">{mode === "merge" ? <><label className="grid gap-1.5 text-[12.5px] font-medium">Surviving member<Select value={survivorId} onValueChange={(value) => { setSurvivorId(value); setFieldSources(Object.fromEntries(FIELD_ROWS.map((field) => [field.key, value]))); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={active.primary.id}>{active.primary.fullName} · {active.primary.memberNumber}</SelectItem><SelectItem value={active.candidate.id}>{active.candidate.fullName} · {active.candidate.memberNumber}</SelectItem></SelectContent></Select></label><div className="overflow-hidden rounded-lg border border-line"><div className="hidden grid-cols-[130px_1fr_1fr] border-b border-line bg-sunken px-3 py-2 text-[12px] font-semibold text-ink-3 sm:grid"><span>Field</span><span>{active.primary.memberNumber}</span><span>{active.candidate.memberNumber}</span></div>{FIELD_ROWS.map((field) => <fieldset key={field.key} className="grid gap-2 border-b border-line px-3 py-3 last:border-0 sm:grid-cols-[130px_1fr_1fr] sm:items-center"><legend className="contents"><span className="text-[12px] font-medium">{field.label}</span></legend>{[active.primary, active.candidate].map((member) => <label key={member.id} className="flex min-w-0 items-center gap-2 text-[12.5px]"><input type="radio" name={field.key} checked={fieldSources[field.key] === member.id} onChange={() => setFieldSources((current) => ({ ...current, [field.key]: member.id }))} /><span className="min-w-0 truncate"><span className="me-1 text-ink-3 sm:hidden">{member.memberNumber}:</span>{fieldValue(member, field.key, branchName)}</span></label>)}</fieldset>)}</div><div className="grid gap-2 border border-signal/30 bg-signal-bg/20 p-3 text-[12px] text-ink-2 sm:grid-cols-3"><HistoryFact label="Memberships retained" value={active.primary.membershipCount + active.candidate.membershipCount} /><HistoryFact label="Visits retained" value={active.primary.visitCount + active.candidate.visitCount} /><HistoryFact label="Timeline events retained" value={active.primary.timelineCount + active.candidate.timelineCount} /></div><p className="flex gap-2 text-[12px] text-ink-2"><ShieldCheck className="size-4 shrink-0 text-signal-deep" />The archived identity keeps a link to the survivor. The merge audit keeps both snapshots and a recovery reference.</p></> : null}<label className="grid gap-1.5 text-[12.5px] font-medium">Decision reason<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === "merge" ? "How did you verify these records belong to one person?" : "Why are these two different people?"} /></label></DialogBody> : null}<DialogFooter><Button variant="secondary" onClick={() => setActive(undefined)}>Cancel</Button><Button variant={mode === "ignore" ? "secondary" : "primary"} disabled={reason.trim().length < 3 || (mode === "merge" && !survivorId)} loading={merge.isPending || ignore.isPending} onClick={() => mode === "merge" ? merge.mutate() : ignore.mutate()}>{mode === "merge" ? <GitMerge /> : null}{mode === "merge" ? "Merge records" : "Ignore suggestion"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function MemberSummary({ member, branchName }: { member: DuplicateMemberSummary; branchName: string }) { return <section className="min-w-0 px-4 py-3"><p className="font-mono text-[11px] text-ink-3">{member.memberNumber}</p><p className="mt-1 truncate text-[13.5px] font-semibold">{member.fullName}</p><p className="mt-1 text-[12px] text-ink-2" dir="ltr">{member.phone}</p><p className="mt-2 text-[12px] text-ink-3">{branchName} · {member.membershipCount} memberships · {member.visitCount} visits</p>{member.balance.amount ? <p className="mt-1 text-[12px] text-warning-deep">Balance <MoneyText money={member.balance} /></p> : null}</section>; }
function HistoryFact({ label, value }: { label: string; value: number }) { return <p><span className="block text-[16px] font-semibold tabular text-ink">{value}</span>{label}</p>; }
function fieldValue(member: DuplicateMemberSummary, key: keyof NonNullable<MergeMemberInput["fieldSourceMemberIds"]>, branchName: (id: string) => string) { if (key === "homeBranchId") return branchName(member.homeBranchId); const value = member[key as keyof DuplicateMemberSummary]; return typeof value === "string" && value ? value : "Not recorded"; }
