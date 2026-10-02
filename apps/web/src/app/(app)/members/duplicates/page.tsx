"use client";
import { useT } from "@/lib/i18n/provider";

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
import type { DuplicateCase, DuplicateCaseStatus, DuplicateMatchReason, DuplicateMemberSummary, MergeMemberInput } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";

const FIELD_ROWS: Array<{ key: keyof NonNullable<MergeMemberInput["fieldSourceMemberIds"]>; label: string }> = [
  { key: "fullName", label: "Full name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "homeBranchId", label: "Home branch" },
];
const STATUS_LABELS: Record<DuplicateCaseStatus, string> = { open: "Needs review", ignored: "Not a duplicate", merged: "Combined", no_longer_matching: "No longer a match" };
const EMPTY_TITLES: Record<DuplicateCaseStatus, string> = { open: "No possible duplicates to check", ignored: "Nothing marked as not a duplicate", merged: "No records combined yet", no_longer_matching: "Nothing here" };
const CONFIDENCE_LABELS: Record<DuplicateCase["confidence"], string> = { strong: "Strong match", possible: "Possible match" };
const MATCH_REASON_LABELS: Record<DuplicateMatchReason, string> = { phone: "same phone", email: "same email", member_number: "same member number", name_and_contact: "same name and contact details" };

export default function DuplicateMembersPage() {
  const t = useT();
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
    if (!active) throw new Error("Choose a possible duplicate first.");
    const mergedMemberId = active.primary.id === survivorId ? active.candidate.id : active.primary.id;
    return api.mergeDuplicateMembers({ caseId: active.id, survivingMemberId: survivorId, mergedMemberId, primaryVersion: active.primary.version, candidateVersion: active.candidate.version, fieldSourceMemberIds: fieldSources, reason: reason.trim() });
  }, { onSuccess: async () => { await invalidate(); setActive(undefined); toast.success("Records combined. History from both records is kept."); } });
  const ignore = useApiMutation((api) => { if (!active) throw new Error("Choose a possible duplicate first."); return api.ignoreDuplicateCase(active.id, reason.trim()); }, { onSuccess: async () => { await invalidate(); setActive(undefined); toast.success("Marked as not a duplicate."); } });

  const openCase = (item: DuplicateCase, nextMode: "merge" | "ignore") => {
    setActive(item); setMode(nextMode); setReason(""); setSurvivorId(item.primary.id);
    setFieldSources(Object.fromEntries(FIELD_ROWS.map((field) => [field.key, item.primary.id])) as NonNullable<MergeMemberInput["fieldSourceMemberIds"]>);
  };

  return <div className="space-y-5">
    <PageHeader title={t("members.list.actions.duplicates")} description="Members who may be the same person. Combine their records, or mark them as different people." actions={<Button asChild variant="secondary"><Link href="/members"><ArrowLeft />{" "}{t("palette.groups.members")}</Link></Button>} />
    <div className="flex items-center gap-2"><Select value={status} onValueChange={(value) => setStatus(value as DuplicateCaseStatus)}><SelectTrigger sizeVariant="sm" className="w-44" aria-label="Show possible duplicates"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Needs review</SelectItem><SelectItem value="ignored">Not duplicates</SelectItem><SelectItem value="merged">Combined</SelectItem></SelectContent></Select><p className="text-[12px] text-ink-3">{cases.data?.totalItems ?? 0} {(cases.data?.totalItems ?? 0) === 1 ? "pair" : "pairs"}</p></div>
    {cases.isLoading ? <div className="grid gap-3 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-64" />)}</div> : cases.isError ? <ErrorState onRetry={() => cases.refetch()} /> : !cases.data?.items.length ? <EmptyState icon={SearchX} title={EMPTY_TITLES[status]} description={status === "open" ? "Members who share a phone, email or member number will show here." : "Change the filter to see other pairs."} /> : <><div className="grid gap-3 lg:grid-cols-2">{cases.data.items.map((item) => <article key={item.id} className="panel overflow-hidden"><div className="flex items-start justify-between gap-3 px-4 py-3.5"><div><p className="context-label">{CONFIDENCE_LABELS[item.confidence]}</p><h2 className="mt-1 text-[14px] font-semibold">{item.primary.fullName} and {item.candidate.fullName}</h2><p className="mt-1 text-[12px] text-ink-3">Why they match: {item.reasons.map((reason) => MATCH_REASON_LABELS[reason]).join(", ")}</p></div><span className="rounded-full border border-line px-2 py-1 text-[12px] font-medium">{STATUS_LABELS[item.status]}</span></div><div className="grid divide-y divide-line border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0"><MemberSummary member={item.primary} branchName={branchName(item.primary.homeBranchId)} /><MemberSummary member={item.candidate} branchName={branchName(item.candidate.homeBranchId)} /></div>{item.resolutionReason ? <p className="mx-4 mt-3 bg-sunken px-3 py-2 text-[12px] text-ink-2">Reason: {item.resolutionReason}</p> : null}{item.status === "open" ? <div className="flex flex-wrap justify-end gap-2 px-4 py-3.5"><Button size="sm" variant="ghost" onClick={() => openCase(item, "ignore")}>Not a duplicate</Button><Button size="sm" onClick={() => openCase(item, "merge")}><GitMerge /> Review and combine</Button></div> : <div className="h-3" />}</article>)}</div><DataPagination page={cases.data} onPage={setPage} /></>}

    <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(undefined); }}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{mode === "merge" ? "Combine member records" : "Mark as not a duplicate"}</DialogTitle><DialogDescription>{mode === "merge" ? "Choose the record to keep, and which details to keep from each. History from both records is kept." : "Say why these are two different people."}</DialogDescription></DialogHeader>{active ? <DialogBody className="space-y-4">{mode === "merge" ? <><label className="grid gap-1.5 text-[12.5px] font-medium">Record to keep<Select value={survivorId} onValueChange={(value) => { setSurvivorId(value); setFieldSources(Object.fromEntries(FIELD_ROWS.map((field) => [field.key, value]))); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={active.primary.id}>{active.primary.fullName} · {active.primary.memberNumber}</SelectItem><SelectItem value={active.candidate.id}>{active.candidate.fullName} · {active.candidate.memberNumber}</SelectItem></SelectContent></Select></label><div className="overflow-hidden rounded-lg border border-line"><div className="hidden grid-cols-[130px_1fr_1fr] border-b border-line bg-sunken px-3 py-2 text-[12px] font-semibold text-ink-3 sm:grid"><span>Detail</span><span>{active.primary.memberNumber}</span><span>{active.candidate.memberNumber}</span></div>{FIELD_ROWS.map((field) => <fieldset key={field.key} className="grid gap-2 border-b border-line px-3 py-3 last:border-0 sm:grid-cols-[130px_1fr_1fr] sm:items-center"><legend className="contents"><span className="text-[12px] font-medium">{field.label}</span></legend>{[active.primary, active.candidate].map((member) => <label key={member.id} className="flex min-w-0 items-center gap-2 text-[12.5px]"><input type="radio" name={field.key} checked={fieldSources[field.key] === member.id} onChange={() => setFieldSources((current) => ({ ...current, [field.key]: member.id }))} /><span className="min-w-0 truncate"><span className="me-1 text-ink-3 sm:hidden">{member.memberNumber}:</span>{fieldValue(member, field.key, branchName)}</span></label>)}</fieldset>)}</div><div className="grid gap-2 border border-signal/30 bg-signal-bg/20 p-3 text-[12px] text-ink-2 sm:grid-cols-3"><HistoryFact label="Memberships kept" value={active.primary.membershipCount + active.candidate.membershipCount} /><HistoryFact label="Visits kept" value={active.primary.visitCount + active.candidate.visitCount} /><HistoryFact label="Timeline entries kept" value={active.primary.timelineCount + active.candidate.timelineCount} /></div><p className="flex gap-2 text-[12px] text-ink-2"><ShieldCheck className="size-4 shrink-0 text-signal-deep" />The other record will be archived and linked to the one you keep.</p></> : null}<label className="grid gap-1.5 text-[12.5px] font-medium">{t("common.label.reason")}<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={mode === "merge" ? "How do you know this is the same person?" : "Why are these two different people?"} /></label></DialogBody> : null}<DialogFooter><Button variant="secondary" onClick={() => setActive(undefined)}>{t("common.action.cancel")}</Button><Button variant={mode === "ignore" ? "secondary" : "primary"} disabled={reason.trim().length < 3 || (mode === "merge" && !survivorId)} loading={merge.isPending || ignore.isPending} onClick={() => mode === "merge" ? merge.mutate() : ignore.mutate()}>{mode === "merge" ? <GitMerge /> : null}{mode === "merge" ? "Combine records" : "Mark as not a duplicate"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function MemberSummary({ member, branchName }: { member: DuplicateMemberSummary; branchName: string }) {
  const t = useT(); return <section className="min-w-0 px-4 py-3"><p className="font-mono text-[11px] text-ink-3">{member.memberNumber}</p><p className="mt-1 truncate text-[13.5px] font-semibold">{member.fullName}</p><p className="mt-1 text-[12px] text-ink-2" dir="ltr">{member.phone}</p><p className="mt-2 text-[12px] text-ink-3">{branchName} · {member.membershipCount} memberships · {member.visitCount} visits</p>{member.balance.amount ? <p className="mt-1 text-[12px] text-warning-deep">{t("members.list.columns.balance")}{" "}<MoneyText money={member.balance} /></p> : null}</section>; }
function HistoryFact({ label, value }: { label: string; value: number }) { return <p><span className="block text-[16px] font-semibold tabular text-ink">{value}</span>{label}</p>; }
function fieldValue(member: DuplicateMemberSummary, key: keyof NonNullable<MergeMemberInput["fieldSourceMemberIds"]>, branchName: (id: string) => string) { if (key === "homeBranchId") return branchName(member.homeBranchId); const value = member[key as keyof DuplicateMemberSummary]; return typeof value === "string" && value ? value : "Not recorded"; }
