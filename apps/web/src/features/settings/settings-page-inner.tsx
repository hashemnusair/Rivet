"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { AgreementSection } from "@/features/settings/agreement-section";
import { SubscriptionSection } from "@/features/settings/subscription-section";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gate, PageHeader } from "@/components/shared/chrome";
import { ForbiddenState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
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
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";
import { usePermissions } from "@/lib/providers/app-providers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextLabel } from "@/components/ui/typography";

interface SettingsEntry {
  id: string;
  label: string;
  /** Extra search terms beyond the label, so "logo" finds Brand Kit. */
  keywords: string;
  /** The permission the section's own mutations require on the server. */
  permission: string;
  component: ComponentType;
}

interface SettingsGroup {
  label: string;
  entries: SettingsEntry[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Gym",
    entries: [
      { id: "organization", label: "Organization", keywords: "identity contact gym name timezone locale language phone country", permission: "settings.manage", component: OrganizationSection },
      { id: "brand", label: "Brand Kit", keywords: "identity sidebar logo palette primary color theme", permission: "settings.manage", component: BrandKitSection },
      { id: "profile", label: "Public profile", keywords: "page publish website directory photos banner cover tagline amenities category", permission: "profiles.manage", component: GymPublicProfileSection },
      { id: "branches", label: "Branches", keywords: "locations address codes", permission: "settings.manage", component: BranchesSection },
      { id: "spaces", label: "Gym spaces", keywords: "zones areas rooms floors studios", permission: "settings.manage", component: GymSpacesSection },
      { id: "agreement", label: "Agreement", keywords: "legal contract subscription agreement signature signed terms privacy", permission: "settings.manage", component: AgreementSection },
      { id: "subscription", label: "Subscription & invoices", keywords: "billing invoice invoices pdf plan rivet fees paid past due receipt", permission: "settings.manage", component: SubscriptionSection },
    ],
  },
  {
    label: "People",
    entries: [
      { id: "users", label: "Users", keywords: "staff accounts invite deactivate branch access", permission: "users.manage", component: UsersSection },
      { id: "roles", label: "Roles & permissions", keywords: "access matrix owner manager receptionist coach", permission: "users.manage", component: RolesSection },
    ],
  },
  {
    label: "Money",
    entries: [
      { id: "payments", label: "Payments", keywords: "money methods cash card cliq bank transfer discount approval limits", permission: "settings.manage", component: PaymentsSection },
      { id: "receipts", label: "Receipts & tax", keywords: "invoice vat rate prefix numbering footer", permission: "settings.manage", component: ReceiptsSection },
    ],
  },
  {
    label: "Communication",
    entries: [
      { id: "notifications", label: "Notifications", keywords: "reminders templates manager alerts automation delivery whatsapp sms email renewals variance quiet hours", permission: "settings.manage", component: NotificationsSection },
      { id: "email", label: "Operational email", keywords: "sender outbox delivery member service preferences mandatory notices", permission: "settings.manage", component: OperationalEmailSection },
    ],
  },
  {
    label: "Operations",
    entries: [
      { id: "operations", label: "Operational rules", keywords: "policies entry check-in scan freeze referral renewal lifecycle retention class booking waitlist", permission: "settings.manage", component: OperationalRulesSection },
      { id: "hours", label: "Hours & trials", keywords: "opening closing operating schedule free trial windows branch", permission: "settings.manage", component: HoursAndTrialsSection },
      { id: "checklists", label: "Daily checklists", keywords: "opening closing walkthrough morning night tasks", permission: "operations.manage", component: ChecklistsSection },
    ],
  },
];

const ALL_ENTRIES = SETTINGS_GROUPS.flatMap((group) => group.entries);

const PERMISSION_COPY: Record<string, string> = {
  "settings.manage": "This section changes gym-wide settings and needs the Manage settings permission.",
  "users.manage": "This section changes who can sign in and what each role may do, and needs the Manage staff permission.",
  "profiles.manage": "This section edits the public gym page and needs the Manage gym profile permission.",
  "operations.manage": "This section edits branch checklists and needs the Manage stock and purchasing permission.",
};

export function SettingsPageInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { can } = usePermissions();
  const { requestNavigation } = useUnsavedChanges();
  const railRef = useRef<HTMLDivElement>(null);

  // Sections the signed-in role can actually save. The server enforces every
  // permission; the rail only avoids offering a section that would refuse.
  const visibleGroups = useMemo(
    () => SETTINGS_GROUPS.map((group) => ({ ...group, entries: group.entries.filter((entry) => can(entry.permission)) })).filter((group) => group.entries.length > 0),
    [can],
  );
  const visibleEntries = useMemo(() => visibleGroups.flatMap((group) => group.entries), [visibleGroups]);
  const defaultEntry = visibleEntries[0] ?? ALL_ENTRIES[0]!;

  const section = searchParams.get("section") ?? defaultEntry.id;
  const requested = ALL_ENTRIES.find((entry) => entry.id === section);
  const initialSection = requested ? requested.id : defaultEntry.id;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return visibleEntries.filter((entry) => `${entry.label} ${entry.keywords}`.toLowerCase().includes(needle));
  }, [query, visibleEntries]);

  const active = ALL_ENTRIES.find((entry) => entry.id === activeSection) ?? defaultEntry;
  const allowed = can(active.permission);
  const ActiveComponent = active.component;

  useEffect(() => {
    const next = ALL_ENTRIES.find((entry) => entry.id === section)?.id ?? defaultEntry.id;
    setActiveSection((current) => current === next ? current : next);
  }, [defaultEntry.id, section]);

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
        title="Settings"
        description="Identity, people, money, messaging and daily operations. Sensitive changes are audited."
        className="bg-paper py-0.5 lg:sticky lg:top-14 lg:z-20 lg:h-[72px] lg:border-b lg:border-line/80 lg:py-2"
      />
      <Gate permission={["settings.manage", "users.manage"]} fallback={<ForbiddenState description="Settings require owner-level permissions." />}>
        <div className="space-y-3 lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
          <div className="sticky top-14 z-20 -mx-4 border-y border-line/80 bg-paper px-4 py-2 sm:-mx-6 sm:px-6 lg:hidden">
            <div className="flex items-center gap-3">
              <label className="shrink-0 text-[12px] font-medium text-ink-2" htmlFor="mobile-settings-section">Settings section</label>
              <Select value={active.id} onValueChange={select}>
                <SelectTrigger id="mobile-settings-section" aria-label="Settings section" className="h-11 min-w-0 flex-1 bg-surface"><SelectValue /></SelectTrigger>
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
          <nav aria-label="Settings sections" className="sticky top-[140px] hidden max-h-[calc(100dvh-9.25rem)] overflow-y-auto border-e border-line/80 pe-3 [scrollbar-gutter:stable] lg:block">
            <div className="sticky top-0 z-10 bg-paper pb-2">
              <div className="relative">
                <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }}
                  placeholder="Search settings…"
                  aria-label="Search settings"
                  className={cn("h-9 ps-8", query && "pe-8")}
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute end-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-sunken hover:text-ink">
                    <X className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              {filtered ? (
                <p className="sr-only" aria-live="polite">{filtered.length === 1 ? "1 section matches" : `${filtered.length} sections match`}</p>
              ) : null}
            </div>
            <div ref={railRef} role="tablist" aria-orientation="vertical" aria-label="Settings sections" className="space-y-2.5 pb-1" onKeyDown={moveFocus}>
              {filtered ? (
                filtered.length > 0 ? (
                  <div className="space-y-0.5">
                    {filtered.map(navButton)}
                    {!focusRail ? <p className="px-3 pt-2 text-[12px] leading-5 text-ink-3">Showing {active.label}. Choose a match to change section.</p> : null}
                  </div>
                ) : (
                  <p className="px-3 py-2 text-[12px] leading-5 text-ink-3">No settings match “{query.trim()}”. Try a word from the section, such as “freeze” or “logo”.</p>
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
              : <ForbiddenState layout="page" description={PERMISSION_COPY[active.permission] ?? "Your role cannot change this section."} />}
          </div>
        </div>
      </Gate>
    </div>
  );
}
