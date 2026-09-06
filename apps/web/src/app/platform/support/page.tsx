"use client";

import { Check, MessageSquareText, RefreshCcw, RotateCcw, Search, Send, UserCheck, UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { SupportPriorityBadge, SupportStatusBadge } from "@/components/platform/platform-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { StatePanel } from "@/components/ui/states";
import { getApi } from "@/lib/api/client";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

export default function SupportPage() {
  const { platformSnapshot, experienceStatus, retryExperience } = useExperience();
  const identity = useRivetIdentity();
  const searchParams = useSearchParams();
  const requestedCaseId = searchParams.get("case")?.trim() || undefined;
  const [localCases, setLocalCases] = useState<PlatformSupportCase[]>();
  const cases = useMemo(() => localCases ?? platformSnapshot?.supportCases ?? [], [localCases, platformSnapshot?.supportCases]);
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [saving, setSaving] = useState<"reply" | "resolve" | "reopen" | "assign">();
  const visibleCases = useMemo(() => cases.filter((item) => `${item.id} ${item.gym} ${item.subject} ${item.creatorName ?? ""} ${item.status}`.toLowerCase().includes(search.trim().toLowerCase())), [cases, search]);
  const selected = visibleCases.find((item) => item.id === selectedId) ?? visibleCases[0];
  const openCount = cases.filter((item) => item.status !== "resolved").length;
  const urgentCount = cases.filter((item) => item.priority === "urgent" && item.status !== "resolved").length;

  useEffect(() => {
    if (platformSnapshot) setLocalCases(platformSnapshot.supportCases);
  }, [platformSnapshot]);

  useEffect(() => {
    if (requestedCaseId && cases.some((item) => item.id === requestedCaseId)) {
      setSelectedId(requestedCaseId);
    } else if (!requestedCaseId) {
      setSelectedId(undefined);
    }
  }, [cases, requestedCaseId]);

  useEffect(() => {
    if (selectedId && !visibleCases.some((item) => item.id === selectedId)) setSelectedId(visibleCases[0]?.id);
  }, [selectedId, visibleCases]);

  useEffect(() => {
    setReplyBody("");
    setResolutionSummary("");
    setResolutionOpen(false);
  }, [selected?.id]);

  const run = async (kind: NonNullable<typeof saving>, action: () => Promise<PlatformSupportCase>, message: string) => {
    setSaving(kind);
    try {
      const updated = await action();
      setLocalCases((current) => {
        if (!current) return current;
        return current.map((item) => item.id === updated.id ? updated : item);
      });
      setSelectedId(updated.id);
      toast.success(message);
      return updated;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The support case could not be updated.");
    } finally {
      setSaving(undefined);
    }
  };

  const sendReply = async () => {
    if (!selected || !replyBody.trim()) return;
    const updated = await run("reply", () => getApi().replyToPlatformSupportCase(selected.id, replyBody.trim()), "Reply recorded on the support case.");
    if (updated) setReplyBody("");
  };

  if (experienceStatus === "loading" || !platformSnapshot) {
    return <PlatformPage><PageHeader title="Support inbox" /><div className="mt-5"><StatePanel layout="section" title="Loading support inbox" description="Connecting to the persisted platform support queue." /></div></PlatformPage>;
  }

  if (cases.length === 0) {
    return <PlatformPage><PageHeader title="Support inbox" description="Cases created inside gym workspaces, with assignments and resolution history." /><div className="mt-5"><StatePanel layout="page" icon={MessageSquareText} title="No support cases have been recorded" description="Cases created inside gym workspaces appear here in realtime." action={<Button variant="secondary" size="sm" onClick={retryExperience}><RefreshCcw /> Refresh</Button>} /></div></PlatformPage>;
  }

  return (
    <PlatformPage>
      <PageHeader
        title="Support inbox"
        description="Cases created inside gym workspaces, with assignments and resolution history."
        actions={<Badge variant={urgentCount > 0 ? "signal" : openCount > 0 ? "warning" : "success"} dot>{urgentCount > 0 ? `${urgentCount} urgent · ${openCount} open` : openCount > 0 ? `${openCount} open` : "All resolved"}</Badge>}
      />
      <PlatformPanel className="mt-5 grid min-h-[560px] overflow-hidden lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label="Support cases">
          <div className="border-b border-line p-3"><label className="relative block"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input className="ps-9" placeholder="Search cases" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search support cases" /></label></div>
          <div className="divide-y divide-line">
            {visibleCases.length ? visibleCases.map((item) => (
              <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={cn("w-full px-4 py-3.5 text-start transition-colors hover:bg-sunken/60", selected?.id === item.id && "bg-sunken")}>
                <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[12.5px] text-ink-3"><span className="font-mono text-[11.5px]">{item.id}</span> · {item.gym}</span>{relativeTime(item.updatedAt ?? item.createdAt) ? <span className="shrink-0 text-[12px] text-ink-3">{relativeTime(item.updatedAt ?? item.createdAt)}</span> : null}</div>
                <p className="mt-1.5 text-[13.5px] font-semibold text-ink">{item.subject}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><SupportPriorityBadge priority={item.priority} /><SupportStatusBadge status={item.status} />{item.assigneeName ? <span className="truncate text-[12px] text-ink-3">{item.assigneeName}</span> : null}</div>
              </button>
            )) : <div className="p-4"><StatePanel layout="section" title="No matching cases" description="Try a different gym, subject, status, or case ID." /></div>}
          </div>
        </aside>
        {selected ? (
          <article className="flex min-w-0 flex-col" aria-label={selected.subject}>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><SupportPriorityBadge priority={selected.priority} /><SupportStatusBadge status={selected.status} />{selected.requestType === "plan_upgrade" ? <Badge variant="neutral">Plan request</Badge> : null}<span className="font-mono text-[11.5px] text-ink-3">{selected.id}</span></div>
                <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-tight">{selected.subject}</h2>
                <p className="mt-1 text-[12.5px] text-ink-3">{selected.gym}{selected.branchName ? ` · ${selected.branchName}` : ""}{selected.creatorName || selected.creatorEmail ? ` · ${selected.creatorName ?? selected.creatorEmail}` : ""}{selected.gymId ? <> · <Link className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline" href={`/platform/gyms/${selected.gymId}`}>Open gym record</Link></> : null}</p>
                {selected.requestType === "plan_upgrade" ? <p className="mt-1 text-[12.5px] font-medium text-ink-2">Requested: {selected.requestedPlan ?? "Unspecified"} · {selected.billingInterval === "annual" ? "Annual billing" : "Monthly billing"}</p> : null}
                <p className="mt-1 text-[12.5px] text-ink-3">{selected.createdAt ? `Created ${formatDateTime(selected.createdAt)}` : "Creation time not recorded"} · First response {selected.firstResponseAt ? formatDuration(selected.createdAt, selected.firstResponseAt) : "not recorded"}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selected.assigneeId ? <Button variant="secondary" size="sm" loading={saving === "assign"} disabled={Boolean(saving)} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id), "Support case unassigned.")}><UserMinus /> Unassign</Button> : <Button variant="secondary" size="sm" disabled={!identity.userId || Boolean(saving)} loading={saving === "assign"} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id, identity.userId), "Support case assigned to you.")}><UserCheck /> Assign to me</Button>}
                {selected.status === "resolved" ? <Button size="sm" loading={saving === "reopen"} disabled={Boolean(saving)} onClick={() => void run("reopen", () => getApi().reopenPlatformSupportCase(selected.id), "Support case reopened.")}><RotateCcw /> Reopen</Button> : <Button size="sm" disabled={Boolean(saving)} onClick={() => setResolutionOpen(true)}><Check /> Resolve</Button>}
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-3 bg-paper/40 px-4 py-4 sm:px-5">
              {(selected.messages ?? []).length === 0 ? (
                <StatePanel layout="section" icon={MessageSquareText} title="Conversation history not available" description="This case predates append-only support messages; its status and assignment are still recorded." className="border-0 bg-transparent" />
              ) : selected.messages?.map((message) => (
                <div key={message.id} className={cn("max-w-[82%] rounded-md border p-3.5", message.authorType === "platform" ? "ms-auto border-line-2 bg-sunken" : "me-auto border-line bg-surface")}>
                  <div className="flex justify-between gap-5"><p className="text-[12.5px] font-semibold">{message.authorName}</p><time className="text-[12px] text-ink-3" dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time></div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{message.body}</p>
                </div>
              ))}
              {selected.resolutionSummary ? <div className="rounded-md border border-success/25 bg-success-bg p-3.5"><p className="text-[12px] font-medium text-success-deep">Resolution</p><p className="mt-1.5 text-[13px] text-ink-2">{selected.resolutionSummary}</p><p className="mt-1.5 text-[12px] text-ink-3">Resolved {formatDateTime(selected.resolvedAt)}</p></div> : null}
            </div>
            {selected.status !== "resolved" ? (
              <form className="border-t border-line bg-surface p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
                <Field label="Reply to this gym"><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Answer the gym's question or ask for what you need…" aria-label="Support reply" className="min-h-20" /></Field>
                <div className="mt-3 flex justify-end"><Button type="submit" loading={saving === "reply"} disabled={Boolean(saving) || !replyBody.trim()}><Send /> Send reply</Button></div>
              </form>
            ) : <div className="border-t border-line bg-surface px-4 py-3.5 text-[12.5px] text-ink-3 sm:px-5">This case is resolved. Reopen it to continue the conversation.</div>}
          </article>
        ) : <div className="flex min-w-0 items-center justify-center p-8"><StatePanel layout="section" title="No matching case selected" description="Clear the search to return to the support queue." /></div>}
      </PlatformPanel>

      <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve support case</DialogTitle><DialogDescription>The summary is required and remains on the case for the gym and platform team.</DialogDescription></DialogHeader>
          <DialogBody><Field label="Resolution summary" htmlFor="support-resolution-summary"><Textarea id="support-resolution-summary" value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} placeholder="What was resolved and what should happen next?" /></Field></DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setResolutionOpen(false)}>Cancel</Button><Button loading={saving === "resolve"} disabled={!selected || Boolean(saving) || !resolutionSummary.trim()} onClick={() => { if (!selected) return; void run("resolve", () => getApi().resolvePlatformSupportCase(selected.id, resolutionSummary.trim()), "Support case resolved.").then((updated) => { if (updated) { setResolutionSummary(""); setResolutionOpen(false); } }); }}>Resolve case</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformPage>
  );
}

function formatDateTime(value?: string) { if (!value) return "not recorded"; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value; }
function relativeTime(value?: string) { if (!value) return undefined; const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) return undefined; const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000)); if (minutes < 60) return `${minutes}m ago`; if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`; return `${Math.floor(minutes / 1_440)}d ago`; }
function formatDuration(start?: string, end?: string) { if (!start || !end) return "not recorded"; const elapsed = Date.parse(end) - Date.parse(start); if (!Number.isFinite(elapsed) || elapsed < 0) return "not recorded"; const minutes = Math.round(elapsed / 60_000); return minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
