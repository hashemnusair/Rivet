"use client";

import { Check, MessageSquareText, RotateCcw, Search, Send, UserCheck, UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

export default function SupportPage() {
  const { platformSnapshot } = useExperience();
  const identity = useRivetIdentity();
  const cases = useMemo(() => platformSnapshot?.supportCases ?? [], [platformSnapshot?.supportCases]);
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [saving, setSaving] = useState<"reply" | "resolve" | "reopen" | "assign">();
  const visibleCases = useMemo(() => cases.filter((item) => `${item.id} ${item.gym} ${item.subject} ${item.creatorName ?? ""} ${item.status}`.toLowerCase().includes(search.trim().toLowerCase())), [cases, search]);
  const selected = cases.find((item) => item.id === selectedId) ?? visibleCases[0] ?? cases[0];

  useEffect(() => {
    if (selectedId && !cases.some((item) => item.id === selectedId)) setSelectedId(undefined);
  }, [cases, selectedId]);

  const run = async (kind: NonNullable<typeof saving>, action: () => Promise<PlatformSupportCase>, message: string) => {
    setSaving(kind);
    try {
      const updated = await action();
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

  if (!selected) return <div className="px-4 py-24 text-center text-[13px] text-ink-3"><p>No support cases have been recorded.</p><p className="mt-2 text-[10.5px]">Cases created inside gym workspaces will appear here in realtime.</p></div>;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div><p className="eyebrow">Customer success</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Support inbox</h1><p className="mt-2 text-[12.5px] text-ink-2">Persisted tenant conversations, assignments, and resolution history.</p></div>
        <section className="mt-7 grid min-h-[620px] overflow-hidden border border-line bg-surface lg:grid-cols-[350px_1fr]">
          <aside className="border-b border-line lg:border-b-0 lg:border-e">
            <div className="border-b border-line p-4"><label className="relative"><Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" /><Input className="ps-9" placeholder="Search cases" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search support cases" /></label></div>
            <div className="divide-y divide-line">{visibleCases.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={cn("w-full p-4 text-start transition-colors hover:bg-sunken", selected.id === item.id && "bg-sunken shadow-[inset_3px_0_0_#d9232b]")}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{item.id} · {item.gym}</span><span className="shrink-0 text-[9px] text-ink-3">{relativeTime(item.updatedAt ?? item.createdAt)}</span></div><p className="mt-2 text-[12.5px] font-semibold">{item.subject}</p><div className="mt-2 flex items-center gap-2"><span className={item.priority === "urgent" ? "size-1.5 rounded-full bg-danger" : "size-1.5 rounded-full bg-info"} /><span className="text-[9.5px] capitalize text-ink-3">{item.status}</span>{item.assigneeName ? <span className="truncate text-[9.5px] text-ink-3">· {item.assigneeName}</span> : null}</div></button>)}</div>
          </aside>
          <article className="flex min-w-0 flex-col">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
              <div><div className="flex items-center gap-2"><span className={selected.priority === "urgent" ? "rounded-full bg-danger-bg px-2 py-1 font-mono text-[7.5px] uppercase text-danger" : "rounded-full bg-info-bg px-2 py-1 font-mono text-[7.5px] uppercase text-info"}>{selected.priority}</span><span className="font-mono text-[8px] text-ink-3">{selected.id}</span></div><h2 className="mt-3 text-[19px] font-semibold">{selected.subject}</h2><p className="mt-1 text-[10.5px] text-ink-3">{selected.gym}{selected.branchName ? ` · ${selected.branchName}` : ""} · {selected.creatorName ?? selected.creatorEmail ?? "Creator unavailable"}</p><p className="mt-1 text-[9.5px] text-ink-3">Created {formatDateTime(selected.createdAt)} · First response {selected.firstResponseAt ? formatDuration(selected.createdAt, selected.firstResponseAt) : "not recorded"}</p></div>
              <div className="flex flex-wrap justify-end gap-2">{selected.assigneeId ? <Button variant="secondary" size="sm" loading={saving === "assign"} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id), "Support case unassigned.")}><UserMinus /> Unassign</Button> : <Button variant="secondary" size="sm" disabled={!identity.userId} loading={saving === "assign"} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id, identity.userId), "Support case assigned to you.")}><UserCheck /> Assign to me</Button>}{selected.status === "resolved" ? <Button size="sm" loading={saving === "reopen"} onClick={() => void run("reopen", () => getApi().reopenPlatformSupportCase(selected.id), "Support case reopened.")}><RotateCcw /> Reopen</Button> : <Button size="sm" onClick={() => setResolutionOpen(true)}><Check /> Resolve</Button>}</div>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-paper/30 p-5 sm:p-6">
              {(selected.messages ?? []).length === 0 ? <div className="m-auto max-w-md text-center"><MessageSquareText className="mx-auto size-6 text-ink-3" /><h3 className="mt-3 text-[14px] font-semibold">Conversation history not available</h3><p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">This legacy case contains persisted status data but predates append-only support messages.</p></div> : selected.messages?.map((message) => <div key={message.id} className={cn("max-w-[78%] border p-4", message.authorType === "platform" ? "ms-auto border-info/20 bg-info-bg" : "me-auto border-line bg-surface")}><div className="flex items-center justify-between gap-5"><p className="text-[10.5px] font-semibold">{message.authorName}</p><time className="font-mono text-[8px] text-ink-3">{formatDateTime(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-2">{message.body}</p></div>)}
              {selected.resolutionSummary ? <div className="border border-success/25 bg-success-bg p-4"><p className="font-mono text-[8px] uppercase tracking-[.1em] text-success">Resolution</p><p className="mt-2 text-[12px] text-ink-2">{selected.resolutionSummary}</p><p className="mt-2 text-[9px] text-ink-3">Resolved {formatDateTime(selected.resolvedAt)}</p></div> : null}
            </div>
            {selected.status !== "resolved" ? <div className="border-t border-line bg-sunken p-4 sm:p-5"><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder="Write a factual reply to this gym" aria-label="Support reply" /><div className="mt-3 flex justify-end"><Button variant="signal" onClick={() => void sendReply()} loading={saving === "reply"} disabled={Boolean(saving) || !replyBody.trim()}><Send /> Record reply</Button></div></div> : null}
          </article>
        </section>
      </div>

      <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}><DialogContent><DialogHeader><DialogTitle>Resolve support case</DialogTitle><DialogDescription>The summary is required and remains on the case for the gym and platform team.</DialogDescription></DialogHeader><DialogBody><label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>Resolution summary</span><Textarea value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} placeholder="What was resolved and what should happen next?" /></label></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setResolutionOpen(false)}>Cancel</Button><Button loading={saving === "resolve"} disabled={!resolutionSummary.trim()} onClick={() => void run("resolve", () => getApi().resolvePlatformSupportCase(selected.id, resolutionSummary.trim()), "Support case resolved.").then((updated) => { if (updated) { setResolutionSummary(""); setResolutionOpen(false); } })}>Resolve case</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function formatDateTime(value?: string) { if (!value) return "not recorded"; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : value; }
function relativeTime(value?: string) { if (!value) return "—"; const timestamp = Date.parse(value); if (!Number.isFinite(timestamp)) return "—"; const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000)); if (minutes < 60) return `${minutes}m`; if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`; return `${Math.floor(minutes / 1_440)}d`; }
function formatDuration(start?: string, end?: string) { if (!start || !end) return "not recorded"; const elapsed = Date.parse(end) - Date.parse(start); if (!Number.isFinite(elapsed) || elapsed < 0) return "not recorded"; const minutes = Math.round(elapsed / 60_000); return minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }
