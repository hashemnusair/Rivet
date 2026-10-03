"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { AgreementSection } from "@/features/settings/agreement-section";
import { SubscriptionSection } from "@/features/settings/subscription-section";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shared/chrome";
import { ForbiddenState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { searchKey } from "@/lib/utils/text";
import { cn } from "@/lib/utils/cn";
import {
  BranchesSection,
  GymSpacesSection,
  NotificationsSection,
  OperationalRulesSection,
  HoursAndTrialsSection,
  OrganizationSection,
  PaymentsSection,
  ReceiptsSection,
  RolesSection,
  UsersSection,
} from "@/features/settings/settings-sections";
import { GymPublicProfileSection } from "@/features/settings/gym-public-profile-section";
import { OperationalEmailSection } from "@/features/settings/operational-email-section";
import { BrandKitSection } from "@/features/settings/brand-kit-section";
import { ChecklistsSection } from "@/features/settings/checklists-section";
import { MyProfileSection } from "@/features/settings/my-profile-section";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";
import { usePermissions } from "@/lib/providers/app-providers";
import type { Permission } from "@/lib/domain/permissions";
import { permissionCopy } from "@/lib/i18n/permissions";
import type { TFunction } from "@/lib/i18n/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextLabel } from "@/components/ui/typography";

interface SettingsEntry {
  id: string;
  label: string;
  /** Extra search terms beyond the label, so "logo" finds Brand Kit. */
  keywords: string;
  /** The permission the section's own mutations require on the server. */
  permission?: string;
  component: ComponentType;
}

interface SettingsGroup {
  label: string;
  entries: SettingsEntry[];
}

function settingsGroups(t: TFunction): SettingsGroup[] { return [
  {
    label: t("settingsCore.text177"),
    entries: [
      { id: "my-profile", label: t("settingsCore.text178"), keywords: t("settingsCore.text201"), component: MyProfileSection },
    ],
  },
  {
    label: t("settingsCore.text179"),
    entries: [
      { id: "organization", label: t("settingsCore.text008"), keywords: t("settingsCore.text202"), permission: "settings.manage", component: OrganizationSection },
      { id: "brand", label: t("settingsCore.text180"), keywords: t("settingsCore.text203"), permission: "settings.manage", component: BrandKitSection },
      { id: "profile", label: t("settingsCore.text181"), keywords: t("settingsCore.text204"), permission: "profiles.manage", component: GymPublicProfileSection },
      { id: "branches", label: t("settingsCore.text033"), keywords: t("settingsCore.text205"), permission: "settings.manage", component: BranchesSection },
      { id: "spaces", label: t("settingsCore.text058"), keywords: t("settingsCore.text206"), permission: "settings.manage", component: GymSpacesSection },
      { id: "agreement", label: t("settingsCore.text182"), keywords: t("settingsCore.text207"), permission: "settings.manage", component: AgreementSection },
      { id: "subscription", label: t("settingsCore.text183"), keywords: t("settingsCore.text208"), permission: "settings.manage", component: SubscriptionSection },
    ],
  },
  {
    label: t("settingsCore.text184"),
    entries: [
      { id: "users", label: t("settingsCore.text078"), keywords: t("settingsCore.text209"), permission: "users.manage", component: UsersSection },
      { id: "roles", label: t("settingsCore.text185"), keywords: t("settingsCore.text210"), permission: "users.manage", component: RolesSection },
    ],
  },
  {
    label: t("settingsCore.text186"),
    entries: [
      { id: "payments", label: t("settingsCore.text160"), keywords: t("settingsCore.text211"), permission: "settings.manage", component: PaymentsSection },
      { id: "receipts", label: t("settingsCore.text111"), keywords: t("settingsCore.text212"), permission: "settings.manage", component: ReceiptsSection },
    ],
  },
  {
    label: t("settingsCore.text187"),
    entries: [
      { id: "notifications", label: t("settingsCore.text188"), keywords: t("settingsCore.text213"), permission: "settings.manage", component: NotificationsSection },
      { id: "email", label: t("settingsCore.text189"), keywords: t("settingsCore.text214"), permission: "settings.manage", component: OperationalEmailSection },
    ],
  },
  {
    label: t("settingsCore.text190"),
    entries: [
      { id: "operations", label: t("settingsCore.text191"), keywords: t("settingsCore.text215"), permission: "settings.manage", component: OperationalRulesSection },
      { id: "hours", label: t("settingsCore.text192"), keywords: t("settingsCore.text216"), permission: "settings.manage", component: HoursAndTrialsSection },
      { id: "checklists", label: t("settingsCore.text193"), keywords: t("settingsCore.text217"), permission: "operations.manage", component: ChecklistsSection },
    ],
  },
]; }

/** The access is named exactly as it is on the Roles & access page, so the two never drift apart. */
const accessNeeded = (t: TFunction, permission: Permission, task: string) =>
  t("setup.accessNeeded", { task, permission: permissionCopy(t, permission).label });

export function SettingsPageInner() {
  const t = useT();
  const SETTINGS_GROUPS = useMemo(() => settingsGroups(t), [t]);
  const ALL_ENTRIES = useMemo(() => SETTINGS_GROUPS.flatMap(group => group.entries), [SETTINGS_GROUPS]);
  const PERMISSION_COPY: Record<string, string> = {
    "settings.manage": accessNeeded(t, "settings.manage", t("setup.changeSettings")),
    "users.manage": accessNeeded(t, "users.manage", t("setup.changeStaff")),
    "profiles.manage": accessNeeded(t, "profiles.manage", t("setup.changePublicPage")),
    "operations.manage": accessNeeded(t, "operations.manage", t("setup.changeChecklists")),
  };
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const { requestNavigation } = useUnsavedChanges();
  const railRef = useRef<HTMLDivElement>(null);

  // Sections the signed-in role can actually save. The server enforces every
  // permission; the rail only avoids offering a section that would refuse.
  const visibleGroups = useMemo(
    () => SETTINGS_GROUPS.map((group) => ({ ...group, entries: group.entries.filter((entry) => !entry.permission || can(entry.permission)) })).filter((group) => group.entries.length > 0),
    [can, SETTINGS_GROUPS],
  );
  const visibleEntries = useMemo(() => visibleGroups.flatMap((group) => group.entries), [visibleGroups]);
  // Keep the existing owner landing section stable while staff roles without
  // organization access land directly on their personal profile.
  const defaultEntry = visibleEntries.find((entry) => entry.id === "organization") ?? visibleEntries[0] ?? ALL_ENTRIES[0]!;

  const section = searchParams.get("section") ?? defaultEntry.id;
  const requested = ALL_ENTRIES.find((entry) => entry.id === section);
  const initialSection = requested ? requested.id : defaultEntry.id;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = searchKey(query);
    if (!needle) return null;
    return visibleEntries.filter((entry) => searchKey(`${entry.label} ${entry.keywords}`).includes(needle));
  }, [query, visibleEntries]);

  const active = ALL_ENTRIES.find((entry) => entry.id === activeSection) ?? defaultEntry;
  const allowed = !active.permission || can(active.permission);
  const ActiveComponent = active.component;

  useEffect(() => {
    const next = ALL_ENTRIES.find((entry) => entry.id === section)?.id ?? defaultEntry.id;
    setActiveSection((current) => current === next ? current : next);
  }, [ALL_ENTRIES, defaultEntry.id, section]);

  const select = (id: string) =>
    requestNavigation(() => {
      setActiveSection(id);
      const nextSearch = new URLSearchParams(searchParams.toString());
      nextSearch.set("section", id);
      router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
    });

  // Manual activation: arrows and Home/End move focus along the rail, Enter or
  // Space chooses, so an unsaved-changes prompt never fires while browsing.
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const tabs = Array.from(railRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    if (tabs.length === 0) return;
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowDown" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    event.preventDefault();
    tabs[next]?.focus();
  };

  const navButton = (entry: SettingsEntry) => {
    const isActive = entry.id === active.id;
    return (
      <button
        key={entry.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        data-state={isActive ? "active" : "inactive"}
        aria-current={isActive ? "page" : undefined}
        onClick={() => select(entry.id)}
        data-touch-target
        className={cn(
          "flex min-h-8 w-full cursor-pointer items-center rounded-md px-3 text-start text-[13px] transition-colors",
          isActive ? "bg-sunken font-semibold text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      </button>
    );
  };

  const focusRail = filtered ? filtered.some((entry) => entry.id === active.id) : true;

  return (
    <div className="-mt-2 mx-auto max-w-[1480px] space-y-3 lg:-mt-3">
      <PageHeader
        title={t("shell.account.settings")}
        description={t("settingsCore.text194")}
        className="bg-paper py-0.5 lg:sticky lg:top-14 lg:z-20 lg:h-[72px] lg:border-b lg:border-line/80 lg:py-2"
      />
      <div className="space-y-3 lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
          <div className="sticky top-14 z-20 -mx-4 border-y border-line/80 bg-paper px-4 py-2 sm:-mx-6 sm:px-6 lg:hidden">
            <div className="flex items-center gap-3">
              <label className="shrink-0 text-[12px] font-medium text-ink-2" htmlFor="mobile-settings-section">{t("settingsCore.text195")}</label>
              <Select value={active.id} onValueChange={select}>
                <SelectTrigger id="mobile-settings-section" aria-label={t("settingsCore.text195")} className="h-11 min-w-0 flex-1 bg-surface"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {visibleGroups.map((group) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <ContextLabel as="div" className="px-2 pb-1 pt-2">{group.label}</ContextLabel>
                      {group.entries.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>)}
                    </div>
                  ))}
                  {!allowed ? <SelectItem value={active.id}>{active.label}</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
          </div>
          <nav aria-label={t("settingsCore.text196")} className="sticky top-[140px] hidden max-h-[calc(100dvh-9.25rem)] overflow-y-auto border-e border-line/80 pe-3 [scrollbar-gutter:stable] lg:block">
            <div className="sticky top-0 z-10 bg-paper pb-2">
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }}
                  placeholder={t("settingsCore.text197")}
                  aria-label={t("settingsCore.text198")}
                  className={cn("h-9 ps-8", query && "pe-8")}
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label={t("settingsCore.text199")} className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-sunken hover:text-ink">
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              {filtered ? (
                <p className="sr-only" aria-live="polite">{t("settingsCore.matchCount", { count: filtered.length })}</p>
              ) : null}
            </div>
            <div ref={railRef} role="tablist" aria-orientation="vertical" aria-label={t("settingsCore.text196")} className="space-y-1.5 pb-1" onKeyDown={moveFocus}>
              {filtered ? (
                filtered.length > 0 ? (
                  <div className="space-y-0.5">
                    {filtered.map(navButton)}
                    {!focusRail ? <p className="px-3 pt-2 text-[12px] leading-5 text-ink-3">{t("settingsCore.showingSection", { section: active.label })}</p> : null}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-[12px] leading-5 text-ink-3">{t("settingsCore.noMatches", { query: query.trim() })}</p>
                )
              ) : (
                visibleGroups.map((group) => (
                  <div key={group.label}>
                    <ContextLabel className="mb-0.5 px-3">{group.label}</ContextLabel>
                    <div className="space-y-0.5">{group.entries.map(navButton)}</div>
                  </div>
                ))
              )}
            </div>
          </nav>
          <div className="min-w-0 scroll-mt-20" role="tabpanel" aria-label={active.label}>
            {allowed
              ? <ActiveComponent />
              : <ForbiddenState layout="page" description={active.permission ? PERMISSION_COPY[active.permission] ?? t("settingsCore.text200") : t("settingsCore.text200")} />}
          </div>
        </div>
      </div>
  );
}
