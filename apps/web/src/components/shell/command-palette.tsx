"use client";

import { Command } from "cmdk";
import { ArrowLeftRight, ArrowRight, CircleHelp, Clock3, Dumbbell, Gauge, KanbanSquare, ListFilter, Plus, ReceiptText, ScanLine, ScrollText, Settings, ShieldCheck, Star, StarOff, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { RecentWorkspaceItem, WorkspaceSearchResult } from "@/lib/domain/qol";
import type { Session } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { workspacePageTitle } from "./workspace-recent-tracker";
import { Badge } from "@/components/ui/badge";
import { navigationAccessFromSession } from "@/features/navigation/navigation-assist";
import { keywordSearchNavigation, permittedNavigationEntries, type NavigationEntry } from "../../../convex/navigationCatalogue";

type PaletteTarget = Pick<WorkspaceSearchResult, "kind" | "id" | "title" | "subtitle" | "href">;

/** Plain names for the record and place kinds; the raw keys are storage identifiers. */
const KIND_LABEL_KEYS: Record<string, TKey> = { member: "palette.kind.member", lead: "palette.kind.lead", receipt: "palette.kind.receipt", page: "palette.kind.page", action: "palette.kind.action", destination: "palette.kind.page", report: "palette.kind.report", form: "palette.kind.form", settings: "palette.kind.setting" };
const kindLabel = (t: TFunction, kind: string) => { const key = KIND_LABEL_KEYS[kind]; return key ? t(key) : kind; };

const GROUP_LABEL_KEYS: Record<string, TKey> = { member: "palette.groups.members", lead: "palette.groups.leads", receipt: "palette.groups.receipts", page: "palette.groups.pages", action: "palette.groups.actions" };

/** The quick actions; ids are also the stored target keys of pinned actions. */
const QUICK_ACTIONS = {
  "new-member": { title: "palette.actions.newMember.title", subtitle: "palette.actions.newMember.subtitle" },
  "new-lead": { title: "palette.actions.newLead.title", subtitle: "palette.actions.newLead.subtitle" },
  "collect-payment": { title: "palette.actions.collectPayment.title", subtitle: "palette.actions.collectPayment.subtitle" },
  "start-checkin": { title: "palette.actions.startCheckin.title", subtitle: "palette.actions.startCheckin.subtitle" },
} satisfies Record<string, { title: TKey; subtitle: TKey }>;
type QuickActionId = keyof typeof QUICK_ACTIONS;
const isQuickActionId = (id: string): id is QuickActionId => Object.prototype.hasOwnProperty.call(QUICK_ACTIONS, id);

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const { t, dir, isolate } = useLocale();
  const invalidate = useInvalidate();
  const { canAny } = usePermissions();
  const { signedIn, session } = useApp();
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query.trim(), 200);
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

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const canOpenManagementLedger = canOpenManagementLedgerFromSession(session) && canAny(["reports.financial.read"]);
  const pages = useMemo(() => [
    { id: "dashboard", href: "/dashboard", title: workspacePageTitle(t, "dashboard") ?? "", subtitle: t("palette.pages.dashboardSubtitle"), icon: Gauge },
    { id: "leads", href: "/crm/pipeline", title: workspacePageTitle(t, "leads") ?? "", subtitle: t("palette.pages.leadsSubtitle"), icon: KanbanSquare, perm: ["crm.read"] },
    { id: "followups", href: "/crm/queues", title: workspacePageTitle(t, "followups") ?? "", subtitle: t("palette.pages.followUpsSubtitle"), icon: ListFilter, perm: ["crm.read"] },
    { id: "members", href: "/members", title: workspacePageTitle(t, "members") ?? "", subtitle: t("palette.pages.membersSubtitle"), icon: Users, perm: ["members.read"] },
    { id: "reception", href: "/reception", title: workspacePageTitle(t, "reception") ?? "", subtitle: t("palette.pages.receptionSubtitle"), icon: ShieldCheck },
    { id: "pt", href: "/pt", title: workspacePageTitle(t, "pt") ?? "", subtitle: t("palette.pages.personalTrainingSubtitle"), icon: Dumbbell, perm: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
    { id: "payments", href: "/payments", title: workspacePageTitle(t, "payments") ?? "", subtitle: t("palette.pages.paymentsSubtitle"), icon: ArrowLeftRight, perm: ["reports.financial.read"] },
    ...(canOpenManagementLedger ? [{ id: "finance", href: "/finance", title: workspacePageTitle(t, "finance") ?? "", subtitle: t("palette.pages.managementLedgerSubtitle"), icon: ScrollText }] : []),
    { id: "support", href: "/support", title: workspacePageTitle(t, "support") ?? "", subtitle: t("palette.pages.supportSubtitle"), icon: CircleHelp },
    { id: "settings", href: "/settings", title: workspacePageTitle(t, "settings") ?? "", subtitle: t("palette.pages.settingsSubtitle"), icon: Settings },
  ].filter((page) => !page.perm || canAny(page.perm)), [canAny, canOpenManagementLedger, t]);
  const quickActions = useMemo(() => [
    canAny(["members.write"]) ? { id: "new-member" as const, href: "/members/new", icon: Plus } : null,
    canAny(["crm.write"]) ? { id: "new-lead" as const, href: "/crm/pipeline?new=1", icon: UserPlus } : null,
    canAny(["payments.collect"]) ? { id: "collect-payment" as const, href: "/payments?collect=1", icon: ReceiptText } : null,
    canAny(["members.read"]) ? { id: "start-checkin" as const, href: "/reception", icon: ScanLine } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => ({ ...item, title: t(QUICK_ACTIONS[item.id].title), subtitle: t(QUICK_ACTIONS[item.id].subtitle) })), [canAny, t]);
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
  const groupLabel = (kind: string) => { const key = GROUP_LABEL_KEYS[kind]; return key ? t(key) : kind; };
  /** Pinned and recent items were stored in the language they were saved in; known ones are shown in the current language. */
  const pinnedTitle = (item: { targetKey: string; label: string }) => (isQuickActionId(item.targetKey) ? t(QUICK_ACTIONS[item.targetKey].title) : item.label);
  const recentTitle = (item: RecentWorkspaceItem) => (item.kind === "page" ? workspacePageTitle(t, item.id) ?? item.title : item.title);

  return <Command.Dialog open={open} onOpenChange={onOpenChange} label={t("palette.search.dialogLabel")} className="fixed inset-0 z-[90]" shouldFilter={false}>
    <button type="button" tabIndex={-1} aria-label={t("palette.search.closeLabel")} className="fixed inset-0 bg-night/45 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
    <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] flex max-h-[calc(100dvh-2rem-env(safe-area-inset-top))] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-dialog animate-scale-in sm:top-[10vh] sm:max-h-[80dvh]">
      <div className="flex items-center gap-2 border-b border-line px-4"><ArrowRight className="size-4 text-ink-3" aria-hidden /><Command.Input value={query} onValueChange={setQuery} dir={query ? "auto" : dir} placeholder={t("palette.search.placeholder")} aria-label={t("palette.search.inputLabel")} className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-ink-4" autoFocus /></div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
        {settledQuery.length >= 2 ? <>
          {search.isLoading ? <p className="px-3 py-2 text-[12.5px] text-ink-3">{t("palette.search.searching")}</p> : null}
          {search.isError ? <div role="alert" className="mx-1 rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-3 text-[12.5px] text-danger"><p>{t("palette.search.errorMessage")}</p><button type="button" className="mt-2 font-medium underline underline-offset-2" onClick={() => { void search.refetch(); }}>{t("palette.search.errorRetry")}</button></div> : null}
          {!search.isLoading && !search.isError && search.data?.length === 0 && catalogueMatches.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-ink-3">{t("palette.search.noMatches", { query: isolate(settledQuery) })}</p> : null}
          {Object.entries(grouped).map(([kind, results]) => <Command.Group key={kind} heading={<GroupHeading>{groupLabel(kind)}</GroupHeading>}>{results.map((result) => <PaletteItem key={`${result.kind}-${result.id}`} onSelect={() => go(result)} icon={result.kind === "receipt" ? ReceiptText : result.kind === "lead" ? UserPlus : result.kind === "member" ? Users : result.kind === "action" ? Star : ArrowRight} title={result.title} subtitle={result.subtitle} trailing={<Badge variant="outline">{kindLabel(t, result.kind)}</Badge>} />)}</Command.Group>)}
          {catalogueMatches.length ? <Command.Group heading={<GroupHeading>{t("palette.groups.places")}</GroupHeading>}>{catalogueMatches.map((entry) => <PaletteItem key={entry.id} onSelect={() => openEntry(entry)} icon={ArrowRight} title={entry.label} subtitle={entry.description} trailing={<Badge variant="outline">{kindLabel(t, entry.kind)}</Badge>} />)}</Command.Group> : null}
        </> : <>
          {pins.isError || recents.isError ? <div role="alert" className="mx-1 mb-2 border-s-2 border-danger ps-3 text-[12.5px] text-danger"><p>{t("palette.pinned.loadError")}</p><button type="button" className="mt-1 font-medium underline underline-offset-2" onClick={() => { void pins.refetch(); void recents.refetch(); }}>{t("common.action.retry")}</button></div> : null}
          {(pins.data?.length ?? 0) > 0 ? <Command.Group heading={<GroupHeading>{t("palette.groups.pinned")}</GroupHeading>}>{pins.data?.map((item) => <PaletteItem key={item.id} onSelect={() => go({ kind: "action", id: item.targetKey, title: pinnedTitle(item), href: item.href })} icon={Star} title={pinnedTitle(item)} subtitle={t("palette.pinned.subtitle")} trailing={<button type="button" className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t("palette.pinned.unpin", { name: isolate(pinnedTitle(item)) })} onClick={(event) => { event.stopPropagation(); unpin.mutate(item.id); }}><StarOff className="size-3.5" /></button>} />)}</Command.Group> : null}
          <Command.Group heading={<GroupHeading>{t("palette.groups.quickActions")}</GroupHeading>}>{quickActions.map((item) => { const pinned = pinnedByTarget.get(item.id); return <PaletteItem key={item.id} onSelect={() => go({ kind: "action", ...item })} icon={item.icon} title={item.title} subtitle={item.subtitle} trailing={<button type="button" className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={t(pinned ? "palette.pinned.unpin" : "palette.pinned.pin", { name: isolate(item.title) })} onClick={(event) => { event.stopPropagation(); if (pinned) unpin.mutate(pinned.id); else pin.mutate({ targetKey: item.id, kind: "action", label: item.title, href: item.href }); }}>{pinned ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />}</button>} />; })}</Command.Group>
          {(recents.data?.length ?? 0) > 0 ? <Command.Group heading={<div className="flex items-center justify-between"><GroupHeading>{t("palette.groups.recent")}</GroupHeading><button type="button" className="px-2 pt-2 text-[12px] text-ink-3 hover:text-ink" onClick={() => clearRecents.mutate()}>{t("palette.groups.clearRecent")}</button></div>}>{recents.data?.map((item) => <PaletteItem key={`${item.kind}-${item.id}`} onSelect={() => go(item)} icon={Clock3} title={recentTitle(item)} subtitle={item.subtitle} trailing={<Badge variant="outline">{kindLabel(t, item.kind)}</Badge>} />)}</Command.Group> : null}
          <Command.Group heading={<GroupHeading>{t("palette.groups.goTo")}</GroupHeading>}>{pages.map((page) => <PaletteItem key={page.href} onSelect={() => go({ kind: "page", ...page })} icon={page.icon} title={page.title} subtitle={page.subtitle} />)}</Command.Group>
        </>}
      </Command.List>
      <div className="hidden items-center gap-4 border-t border-line bg-paper/70 px-4 py-2 text-[12px] text-ink-3 sm:flex"><span><kbd dir="ltr" className="rounded-sm border border-line bg-surface px-1 font-mono">↑↓</kbd> {t("palette.hints.move")}</span><span><kbd dir="ltr" className="rounded-sm border border-line bg-surface px-1 font-mono">⏎</kbd> {t("palette.hints.open")}</span><span><kbd dir="ltr" className="rounded-sm border border-line bg-surface px-1 font-mono">esc</kbd> {t("palette.hints.close")}</span></div>
    </div>
  </Command.Dialog>;
}

export function canOpenManagementLedgerFromSession(session: Pick<Session, "permissions" | "workspace"> | undefined): boolean {
  return Boolean(session?.permissions.includes("reports.financial.read") && session.workspace?.modules.some((module) => module.key === "reporting" && module.entitled && module.enabled));
}

function GroupHeading({ children }: { children: React.ReactNode }) { return <span className="context-label block px-2 pb-1 pt-2">{children}</span>; }

function PaletteItem({ icon: Icon, title, subtitle, trailing, onSelect }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; trailing?: React.ReactNode; onSelect: () => void }) {
  return <Command.Item onSelect={onSelect} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink outline-none data-[selected=true]:bg-sunken"><Icon className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1"><span className="block truncate font-medium"><bdi>{title}</bdi></span>{subtitle ? <span className="block truncate text-[12px] text-ink-3"><bdi>{subtitle}</bdi></span> : null}</span>{trailing}</Command.Item>;
}
