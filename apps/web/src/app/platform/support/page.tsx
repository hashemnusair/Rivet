"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

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
import { localizeApiError } from "@/lib/api/errors";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

export default function SupportPage() {
  const t = useT();
  const f = useFormat();
  const { locale, isolate } = useLocale();
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
      toast.error(localizeApiError(error, locale).message);
    } finally {
      setSaving(undefined);
    }
  };

  const sendReply = async () => {
    if (!selected || !replyBody.trim()) return;
    const updated = await run("reply", () => getApi().replyToPlatformSupportCase(selected.id, replyBody.trim()), t("platformConsole.support.replyRecorded"));
    if (updated) setReplyBody("");
  };

  if (experienceStatus === "loading" || !platformSnapshot) {
    return <PlatformPage><PageHeader title={t("platformConsole.support.title")} /><div className="mt-5"><StatePanel layout="section" title={t("platformConsole.support.loading")} description={t("platformConsole.support.loadingDescription")} /></div></PlatformPage>;
  }

  if (cases.length === 0) {
    return <PlatformPage><PageHeader title={t("platformConsole.support.title")} description={t("platformConsole.support.description")} /><div className="mt-5"><StatePanel layout="page" icon={MessageSquareText} title={t("platformConsole.support.noCases")} description={t("platformConsole.support.emptyDescription")} action={<Button variant="secondary" size="sm" onClick={retryExperience}><RefreshCcw />{" "}{t("common.action.refresh")}</Button>} /></div></PlatformPage>;
  }

  return (
    <PlatformPage>
      <PageHeader
        title={t("platformConsole.support.title")}
        description={t("platformConsole.support.description")}
        actions={<Badge variant={urgentCount > 0 ? "signal" : openCount > 0 ? "warning" : "success"} dot>{urgentCount > 0 ? `${t("platformConsole.support.urgentCount", { count: urgentCount })} · ${t("platformConsole.support.openCount", { count: openCount })}` : openCount > 0 ? t("platformConsole.support.openCount", { count: openCount }) : t("platformConsole.support.allResolved")}</Badge>}
      />
      <PlatformPanel className="mt-5 grid min-h-[560px] overflow-hidden lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-line lg:border-b-0 lg:border-e" aria-label={t("platformConsole.support.cases")}>
          <div className="border-b border-line p-3"><label className="relative block"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input className="ps-9" placeholder={t("platformConsole.support.search")} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t("platformConsole.support.searchLabel")} /></label></div>
          <div className="divide-y divide-line">
            {visibleCases.length ? visibleCases.map((item) => (
              <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedId(item.id)} className={cn("w-full px-4 py-3.5 text-start transition-colors hover:bg-sunken/60", selected?.id === item.id && "bg-sunken")}>
                <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[12.5px] text-ink-3" dir="auto"><span className="font-mono text-[11.5px]" dir="ltr">{item.id}</span> · {isolate(item.gym)}</span>{relativeTime(item.updatedAt ?? item.createdAt, f.relative) ? <span className="shrink-0 text-[12px] text-ink-3">{relativeTime(item.updatedAt ?? item.createdAt, f.relative)}</span> : null}</div>
                <p className="mt-1.5 text-[13.5px] font-semibold text-ink" dir="auto">{item.subject}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5"><SupportPriorityBadge priority={item.priority} /><SupportStatusBadge status={item.status} />{item.assigneeName ? <span className="truncate text-[12px] text-ink-3">{item.assigneeName}</span> : null}</div>
              </button>
            )) : <div className="p-4"><StatePanel layout="section" title={t("platformConsole.support.noMatches")} description={t("platformConsole.support.noMatchesDescription")} /></div>}
          </div>
        </aside>
        {selected ? (
          <article className="flex min-w-0 flex-col" aria-label={selected.subject}>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><SupportPriorityBadge priority={selected.priority} /><SupportStatusBadge status={selected.status} />{selected.requestType === "plan_upgrade" ? <Badge variant="neutral">{t("platformConsole.support.planRequest")}</Badge> : null}<span className="font-mono text-[11.5px] text-ink-3" dir="ltr">{selected.id}</span></div>
                <h2 className="mt-2 text-[20px] font-semibold leading-snug tracking-tight" dir="auto">{selected.subject}</h2>
                <p className="mt-1 text-[12.5px] text-ink-3" dir="auto">{isolate(selected.gym)}{selected.branchName ? ` · ${isolate(selected.branchName)}` : ""}{selected.creatorName || selected.creatorEmail ? ` · ${isolate(selected.creatorName ?? selected.creatorEmail ?? "")}` : ""}{selected.gymId ? <> · <Link className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline" href={`/platform/gyms/${selected.gymId}`}>{t("platformConsole.support.openGym")}</Link></> : null}</p>
                {selected.requestType === "plan_upgrade" ? <p className="mt-1 text-[12.5px] font-medium text-ink-2" dir="auto">{t("platformConsole.support.requested", { plan: isolate(selected.requestedPlan ?? t("platformConsole.support.unspecified")) })} · {t(selected.billingInterval === "annual" ? "platformConsole.support.annualBilling" : "platformConsole.support.monthlyBilling")}</p> : null}
                <p className="mt-1 text-[12.5px] text-ink-3">{selected.createdAt ? t("platformConsole.support.created", { date: f.dateTime(selected.createdAt) }) : t("platformConsole.support.creationNotRecorded")} · {t("platformConsole.support.firstResponse", { duration: selected.firstResponseAt ? formatDuration(selected.createdAt, selected.firstResponseAt, t) : t("platformConsole.support.notRecorded") })}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selected.assigneeId ? <Button variant="secondary" size="sm" loading={saving === "assign"} disabled={Boolean(saving)} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id), t("platformConsole.support.unassignedToast"))}><UserMinus /> {t("platformConsole.support.unassign")}</Button> : <Button variant="secondary" size="sm" disabled={!identity.userId || Boolean(saving)} loading={saving === "assign"} onClick={() => void run("assign", () => getApi().assignPlatformSupportCase(selected.id, identity.userId), t("platformConsole.support.assignedToast"))}><UserCheck /> {t("platformConsole.support.assignToMe")}</Button>}
                {selected.status === "resolved" ? <Button size="sm" loading={saving === "reopen"} disabled={Boolean(saving)} onClick={() => void run("reopen", () => getApi().reopenPlatformSupportCase(selected.id), t("platformConsole.support.reopenedToast"))}><RotateCcw /> {t("platformConsole.support.reopen")}</Button> : <Button size="sm" disabled={Boolean(saving)} onClick={() => setResolutionOpen(true)}><Check /> {t("platformConsole.support.resolve")}</Button>}
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-3 bg-paper/40 px-4 py-4 sm:px-5">
              {(selected.messages ?? []).length === 0 ? (
                <StatePanel layout="section" icon={MessageSquareText} title={t("platformConsole.support.conversationUnavailable")} description={t("platformConsole.support.legacyMessagesDescription")} className="border-0 bg-transparent" />
              ) : selected.messages?.map((message) => (
                <div key={message.id} className={cn("max-w-[82%] rounded-md border p-3.5", message.authorType === "platform" ? "ms-auto border-line-2 bg-sunken" : "me-auto border-line bg-surface")}>
                  <div className="flex justify-between gap-5"><p className="text-[12.5px] font-semibold" dir="auto">{message.authorName}</p><time className="text-[12px] text-ink-3" dateTime={message.createdAt}>{f.dateTime(message.createdAt)}</time></div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2" dir="auto">{message.body}</p>
                </div>
              ))}
              {selected.resolutionSummary ? <div className="rounded-md border border-success/25 bg-success-bg p-3.5"><p className="text-[12px] font-medium text-success-deep">{t("platformConsole.support.resolution")}</p><p className="mt-1.5 text-[13px] text-ink-2" dir="auto">{selected.resolutionSummary}</p><p className="mt-1.5 text-[12px] text-ink-3">{t("platformConsole.support.resolved", { date: selected.resolvedAt ? f.dateTime(selected.resolvedAt) : t("platformConsole.support.notRecorded") })}</p></div> : null}
            </div>
            {selected.status !== "resolved" ? (
              <form className="border-t border-line bg-surface p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
                <Field label={t("platformConsole.support.replyToGym")}><Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} placeholder={t("platformConsole.support.replyPlaceholder")} aria-label={t("platformConsole.support.replyLabel")} className="min-h-20" dir="auto" /></Field>
                <div className="mt-3 flex justify-end"><Button type="submit" loading={saving === "reply"} disabled={Boolean(saving) || !replyBody.trim()}><Send /> {t("platformConsole.support.sendReply")}</Button></div>
              </form>
            ) : <div className="border-t border-line bg-surface px-4 py-3.5 text-[12.5px] text-ink-3 sm:px-5">{t("platformConsole.support.resolvedNotice")}</div>}
          </article>
        ) : <div className="flex min-w-0 items-center justify-center p-8"><StatePanel layout="section" title={t("platformConsole.support.emptySelection")} description={t("platformConsole.support.clearSearch")} /></div>}
      </PlatformPanel>

      <Dialog open={resolutionOpen} onOpenChange={setResolutionOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("platformConsole.support.resolveDialogTitle")}</DialogTitle><DialogDescription>{t("platformConsole.support.resolveDialogDescription")}</DialogDescription></DialogHeader>
          <DialogBody className="space-y-4">
            <Field label={t("platformConsole.support.resolutionSummary")} htmlFor="support-resolution-summary"><Textarea id="support-resolution-summary" value={resolutionSummary} onChange={(event) => setResolutionSummary(event.target.value)} placeholder={t("platformConsole.support.resolutionPlaceholder")} dir="auto" /></Field>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setResolutionOpen(false)}>{t("common.action.cancel")}</Button><Button loading={saving === "resolve"} disabled={!selected || Boolean(saving) || !resolutionSummary.trim()} onClick={() => { if (!selected) return; void run("resolve", () => getApi().resolvePlatformSupportCase(selected.id, resolutionSummary.trim()), t("platformConsole.support.resolvedToast")).then((updated) => { if (updated) { setResolutionSummary(""); setResolutionOpen(false); } }); }}>{t("platformConsole.support.resolveCase")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PlatformPage>
  );
}

function relativeTime(value: string | undefined, relative: (iso: string) => string) {
  return value && Number.isFinite(Date.parse(value)) ? relative(value) : undefined;
}

function formatDuration(start: string | undefined, end: string, t: ReturnType<typeof useT>) {
  if (!start) return t("platformConsole.support.notRecorded");
  const elapsed = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(elapsed) || elapsed < 0) return t("platformConsole.support.notRecorded");
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 60) return t("platformConsole.support.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hoursLabel = t("platformConsole.support.hours", { count: hours });
  return remainingMinutes ? t("platformConsole.support.hoursMinutes", { hours: hoursLabel, minutes: t("platformConsole.support.minutes", { count: remainingMinutes }) }) : hoursLabel;
}
