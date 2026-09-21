"use client";

import { Command } from "cmdk";
import { ArrowLeftRight, ArrowRight, CircleHelp, Clock3, Dumbbell, Gauge, KanbanSquare, ListFilter, Plus, ReceiptText, ScanLine, ScrollText, Settings, ShieldCheck, Sparkles, Star, StarOff, UserPlus, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { RecentWorkspaceItem, WorkspaceSearchResult } from "@/lib/domain/qol";
import type { Session } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Badge } from "@/components/ui/badge";
import { confidenceBand } from "@/features/assist/assist-judgment";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { intentOutcomeForSession, navigationAccessFromSession, useNavigationAssist } from "@/features/navigation/navigation-assist";
import { keywordSearchNavigation, permittedNavigationEntries, type NavigationEntry } from "../../../convex/navigationCatalogue";

type PaletteTarget = Pick<WorkspaceSearchResult, "kind" | "id" | "title" | "subtitle" | "href">;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const invalidate = useInvalidate();
  const { canAny } = usePermissions();
  const { signedIn, session } = useApp();
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query.trim(), 200);
  // Semantic help is asked for on purpose: the typed query is submitted as a
  // whole, never per keystroke, and the draft in the input is left alone.
  const assist = useNavigationAssist(open);
  const [askedQuery, setAskedQuery] = useState("");
  const intent = useAssistJudgment({ questionKey: "navigation.intent", subject: { query: askedQuery, path: pathname ?? "/" }, enabled: open && Boolean(askedQuery), auto: true });
  const catalogue = useMemo(() => permittedNavigationEntries(navigationAccessFromSession(session)), [session]);
  const places = useMemo(() => (settledQuery.length >= 2 ? keywordSearchNavigation(catalogue, settledQuery, 6) : []), [catalogue, settledQuery]);
  const search = useApiQuery(qk.workspaceSearch(settledQuery), (api) => api.searchWorkspace(settledQuery), { enabled: open && settledQuery.length >= 2, retry: false });
  const recents = useApiQuery(qk.workspaceRecents, (api) => api.listRecentWorkspaceItems(), { enabled: open });
  const pins = useApiQuery(qk.workspacePins, (api) => api.listPinnedWorkspaceItems(), { enabled: open });
  const recordRecent = useApiMutation((api, item: Omit<RecentWorkspaceItem, "viewedAt">) => api.recordRecentWorkspaceItem(item), { onSuccess: async () => invalidate([qk.workspaceRecents]) });
  const pin = useApiMutation((api, item: { targetKey: string; kind: "action"; label: string; href: string }) => api.pinWorkspaceItem(item), { onSuccess: async () => invalidate([qk.workspacePins]) });
  const unpin = useApiMutation((api, id: string) => api.unpinWorkspaceItem(id), { onSuccess: async () => invalidate([qk.workspacePins]) });
  const clearRecents = useApiMutation((api) => api.clearRecentWorkspaceItems(), { onSuccess: async () => invalidate([qk.workspaceRecents]) });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => { if (!open) { setQuery(""); setAskedQuery(""); } }, [open]);

  const canOpenManagementLedger = canOpenManagementLedgerFromSession(session) && canAny(["reports.financial.read"]);
  const pages = useMemo(() => [
    { id: "dashboard", href: "/dashboard", title: "Dashboard", subtitle: "Today and operating queue", icon: Gauge },
    { id: "leads", href: "/crm/pipeline", title: "Leads", subtitle: "CRM pipeline", icon: KanbanSquare, perm: ["crm.read"] },
    { id: "followups", href: "/crm/queues", title: "Follow-ups", subtitle: "Due CRM work", icon: ListFilter, perm: ["crm.read"] },
    { id: "members", href: "/members", title: "Members", subtitle: "Directory", icon: Users, perm: ["members.read"] },
    { id: "reception", href: "/reception", title: "Reception", subtitle: "Check-ins", icon: ShieldCheck },
    { id: "pt", href: "/pt", title: "Personal training", subtitle: "Schedule and packages", icon: Dumbbell, perm: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
    { id: "payments", href: "/payments", title: "Payments", subtitle: "Transactions and receipts", icon: ArrowLeftRight, perm: ["reports.financial.read"] },
    ...(canOpenManagementLedger ? [{ id: "finance", href: "/finance", title: "Management ledger", subtitle: "Statements", icon: ScrollText }] : []),
    { id: "support", href: "/support", title: "Support", subtitle: "Cases", icon: CircleHelp },
    { id: "settings", href: "/settings", title: "Settings", subtitle: "Organization and team", icon: Settings, perm: ["settings.manage", "users.manage"] },
  ].filter((page) => !page.perm || canAny(page.perm)), [canAny, canOpenManagementLedger]);
  const quickActions = useMemo(() => [
    canAny(["members.write"]) ? { id: "new-member", title: "Create member", subtitle: "Open a new member record", href: "/members/new", icon: Plus } : null,
    canAny(["crm.write"]) ? { id: "new-lead", title: "Create lead", subtitle: "Add to the pipeline", href: "/crm/pipeline?new=1", icon: UserPlus } : null,
    canAny(["payments.collect"]) ? { id: "collect-payment", title: "Collect payment", subtitle: "Record a member payment", href: "/payments?collect=1", icon: ReceiptText } : null,
    canAny(["members.read"]) ? { id: "start-checkin", title: "Start check-in", subtitle: "Open reception lookup", href: "/reception", icon: ScanLine } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)), [canAny]);
  const pinnedByTarget = new Map((pins.data ?? []).map((item) => [item.targetKey, item]));

  if (!signedIn) return null;
  const go = (target: PaletteTarget) => {
    onOpenChange(false);
    if (target.kind !== "action") recordRecent.mutate({ kind: target.kind, id: target.id, title: target.title, subtitle: target.subtitle, href: target.href });
    router.push(target.href);
  };
  const grouped = (search.data ?? []).reduce<Record<string, WorkspaceSearchResult[]>>((groups, result) => { (groups[result.kind] ??= []).push(result); return groups; }, {});
  const serverHrefs = new Set((search.data ?? []).map((result) => result.href));
  const catalogueMatches = places.filter((entry) => !serverHrefs.has(entry.href));
  const openEntry = (entry: NavigationEntry) => go({ kind: "page", id: entry.id, title: entry.label, subtitle: entry.description, href: entry.href });
  const intentOutcome = intent.state.status === "ready" ? intentOutcomeForSession(intent.state.result, session) : undefined;
  const intentBand = intent.state.status === "ready" ? confidenceBand(intent.state.result.judgment) : undefined;
  const hasKeywordMatches = (search.data?.length ?? 0) > 0 || catalogueMatches.length > 0;
  const groupLabels: Record<string, string> = { member: "Members", lead: "Leads", receipt: "Receipts", page: "Pages", action: "Actions" };

  return <Command.Dialog open={open} onOpenChange={onOpenChange} label="Global search" className="fixed inset-0 z-[90]" shouldFilter={false}>
    <button type="button" tabIndex={-1} aria-label="Close workspace search" className="fixed inset-0 bg-night/45 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
    <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top))] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-dialog animate-scale-in sm:top-[10vh] sm:max-h-[80dvh]">
      <div className="flex items-center gap-2 border-b border-line px-4"><ArrowRight className="size-4 text-ink-3" aria-hidden /><Command.Input value={query} onValueChange={setQuery} placeholder="Member, phone, receipt, reference, page or action…" aria-label="Search RIVET" className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-4" autoFocus /></div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
        {settledQuery.length >= 2 ? <>
          {search.isLoading ? <p className="px-3 py-2 text-[12.5px] text-ink-3">Searching across your workspace…</p> : null}
          {search.isError ? <div role="alert" className="mx-1 rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-3 text-[12.5px] text-danger"><p>Workspace search is unavailable.</p><button type="button" className="mt-2 font-medium underline underline-offset-2" onClick={() => { void search.refetch(); }}>Retry search</button></div> : null}
          {!search.isLoading && !search.isError && search.data?.length === 0 && catalogueMatches.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-ink-3">No records, receipts, pages, or actions match “{settledQuery}”.</p> : null}
          {Object.entries(grouped).map(([kind, results]) => <Command.Group key={kind} heading={<GroupHeading>{groupLabels[kind] ?? kind}</GroupHeading>}>{results.map((result) => <PaletteItem key={`${result.kind}-${result.id}`} onSelect={() => go(result)} icon={result.kind === "receipt" ? ReceiptText : result.kind === "lead" ? UserPlus : result.kind === "member" ? Users : result.kind === "action" ? Star : ArrowRight} title={result.title} subtitle={result.subtitle} trailing={<Badge variant="outline">{result.kind}</Badge>} />)}</Command.Group>)}
          {catalogueMatches.length ? <Command.Group heading={<GroupHeading>Places</GroupHeading>}>{catalogueMatches.map((entry) => <PaletteItem key={entry.id} onSelect={() => openEntry(entry)} icon={ArrowRight} title={entry.label} subtitle={entry.description} trailing={<Badge variant="outline">{entry.kind}</Badge>} />)}</Command.Group> : null}
          {assist.ready && settledQuery.length >= 3 ? <Command.Group heading={<GroupHeading>Ask Jev</GroupHeading>}>
            {askedQuery !== settledQuery ? <PaletteItem onSelect={() => setAskedQuery(settledQuery)} icon={Sparkles} title={hasKeywordMatches ? `Not what you meant? Ask where to go for “${settledQuery}”` : `Ask where to go for “${settledQuery}”`} subtitle="Jev picks a page, report, form or setting you already have access to. You decide whether to open it." /> : null}
            {askedQuery === settledQuery && intent.state.status === "loading" ? <p role="status" className="px-3 py-2 text-[12.5px] text-ink-3">Asking Jev where to go…</p> : null}
            {askedQuery === settledQuery && (intent.state.status === "unavailable" || intent.state.status === "stale") ? <><p role="status" className="px-3 py-2 text-[12.5px] text-ink-3">{intent.state.message} Keyword results still work.</p><PaletteItem onSelect={intent.request} icon={Sparkles} title="Ask again" /></> : null}
            {askedQuery === settledQuery && intent.state.status === "disabled" && intent.state.message ? <p role="status" className="px-3 py-2 text-[12.5px] text-ink-3">{intent.state.message}</p> : null}
            {askedQuery === settledQuery && intentOutcome?.kind === "destination" ? <PaletteItem onSelect={() => openEntry(intentOutcome.entry)} icon={Sparkles} title={`Open ${intentOutcome.entry.label}`} subtitle={`${intentOutcome.entry.description}${intentOutcome.entry.opensForm ? " Opens a form; nothing is submitted." : ""}`} trailing={<Badge variant={intentBand?.tone ?? "neutral"} dot>{intentBand?.label ?? "Suggestion"}</Badge>} /> : null}
            {askedQuery === settledQuery && intentOutcome?.kind === "clarify" ? <><p role="status" className="px-3 py-2 text-[12.5px] text-ink-2">{intentOutcome.clarification.question}</p>{intentOutcome.options.map((entry) => <PaletteItem key={entry.id} onSelect={() => openEntry(entry)} icon={ArrowRight} title={entry.label} subtitle={entry.description} trailing={<Badge variant="outline">{entry.kind}</Badge>} />)}</> : null}
            {askedQuery === settledQuery && intentOutcome?.kind === "no_match" ? <p role="status" className="px-3 py-2 text-[12.5px] text-ink-3">No page, report, form or setting in RIVET matches that request. Try other words, or open the sidebar.</p> : null}
          </Command.Group> : null}
        </> : <>
          {pins.isError || recents.isError ? <div role="alert" className="mx-1 mb-2 border-s-2 border-danger ps-3 text-[12.5px] text-danger"><p>Saved shortcuts could not be loaded.</p><button type="button" className="mt-1 font-medium underline underline-offset-2" onClick={() => { void pins.refetch(); void recents.refetch(); }}>Retry</button></div> : null}
          {(pins.data?.length ?? 0) > 0 ? <Command.Group heading={<GroupHeading>Pinned</GroupHeading>}>{pins.data?.map((item) => <PaletteItem key={item.id} onSelect={() => go({ kind: "action", id: item.targetKey, title: item.label, href: item.href })} icon={Star} title={item.label} subtitle="Pinned action" trailing={<button type="button" className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={`Unpin ${item.label}`} onClick={(event) => { event.stopPropagation(); unpin.mutate(item.id); }}><StarOff className="size-3.5" /></button>} />)}</Command.Group> : null}
          <Command.Group heading={<GroupHeading>Quick actions</GroupHeading>}>{quickActions.map((item) => { const pinned = pinnedByTarget.get(item.id); return <PaletteItem key={item.id} onSelect={() => go({ kind: "action", ...item })} icon={item.icon} title={item.title} subtitle={item.subtitle} trailing={<button type="button" className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={pinned ? `Unpin ${item.title}` : `Pin ${item.title}`} onClick={(event) => { event.stopPropagation(); if (pinned) unpin.mutate(pinned.id); else pin.mutate({ targetKey: item.id, kind: "action", label: item.title, href: item.href }); }}>{pinned ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />}</button>} />; })}</Command.Group>
          {(recents.data?.length ?? 0) > 0 ? <Command.Group heading={<div className="flex items-center justify-between"><GroupHeading>Recent</GroupHeading><button type="button" className="px-2 pt-2 text-[12px] text-ink-3 hover:text-ink" onClick={() => clearRecents.mutate()}>Clear</button></div>}>{recents.data?.map((item) => <PaletteItem key={`${item.kind}-${item.id}`} onSelect={() => go(item)} icon={Clock3} title={item.title} subtitle={item.subtitle} trailing={<Badge variant="outline">{item.kind}</Badge>} />)}</Command.Group> : null}
          <Command.Group heading={<GroupHeading>Go to</GroupHeading>}>{pages.map((page) => <PaletteItem key={page.href} onSelect={() => go({ kind: "page", ...page })} icon={page.icon} title={page.title} subtitle={page.subtitle} />)}</Command.Group>
        </>}
      </Command.List>
      <div className="hidden items-center gap-4 border-t border-line bg-paper/70 px-4 py-2 text-[11px] text-ink-3 sm:flex"><span><kbd className="rounded-sm border border-line bg-surface px-1 font-mono">↑↓</kbd> navigate</span><span><kbd className="rounded-sm border border-line bg-surface px-1 font-mono">⏎</kbd> open</span><span><kbd className="rounded-sm border border-line bg-surface px-1 font-mono">esc</kbd> close</span></div>
    </div>
  </Command.Dialog>;
}

export function canOpenManagementLedgerFromSession(session: Pick<Session, "permissions" | "workspace"> | undefined): boolean {
  return Boolean(session?.permissions.includes("reports.financial.read") && session.workspace?.modules.some((module) => module.key === "reporting" && module.entitled && module.enabled));
}

function GroupHeading({ children }: { children: React.ReactNode }) { return <span className="context-label block px-2 pb-1 pt-2">{children}</span>; }

function PaletteItem({ icon: Icon, title, subtitle, trailing, onSelect }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; trailing?: React.ReactNode; onSelect: () => void }) {
  return <Command.Item onSelect={onSelect} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink outline-none data-[selected=true]:bg-sunken"><Icon className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1"><span className="block truncate font-medium">{title}</span>{subtitle ? <span className="block truncate text-[12px] text-ink-3">{subtitle}</span> : null}</span>{trailing}</Command.Item>;
}
