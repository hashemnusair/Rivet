"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AgreementSection } from "@/features/settings/agreement-section";
import { Search } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContextLabel } from "@/components/ui/typography";

interface SettingsEntry {
  id: string;
  label: string;
  /** Extra search terms beyond the label, so "logo" finds Brand Kit. */
  keywords: string;
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
      { id: "organization", label: "Organization", keywords: "identity contact gym name timezone locale language phone country", component: OrganizationSection },
      { id: "brand", label: "Brand Kit", keywords: "identity sidebar logo palette primary color theme", component: BrandKitSection },
      { id: "profile", label: "Public profile", keywords: "page publish website directory photos banner cover tagline amenities category", component: GymPublicProfileSection },
      { id: "branches", label: "Branches", keywords: "locations address codes", component: BranchesSection },
      { id: "spaces", label: "Gym spaces", keywords: "zones areas rooms floors studios", component: GymSpacesSection },
      { id: "agreement", label: "Agreement", keywords: "legal contract subscription agreement signature signed terms privacy", component: AgreementSection },
    ],
  },
  {
    label: "People",
    entries: [
      { id: "users", label: "Users", keywords: "staff accounts invite deactivate branch access", component: UsersSection },
      { id: "roles", label: "Roles & permissions", keywords: "access matrix owner manager receptionist coach", component: RolesSection },
    ],
  },
  {
    label: "Money",
    entries: [
      { id: "payments", label: "Payments", keywords: "money methods cash card cliq bank transfer discount approval limits", component: PaymentsSection },
      { id: "receipts", label: "Receipts & tax", keywords: "invoice vat rate prefix numbering footer", component: ReceiptsSection },
    ],
  },
  {
    label: "Communication",
    entries: [
      { id: "notifications", label: "Notifications", keywords: "reminders templates manager alerts automation delivery whatsapp sms email renewals variance", component: NotificationsSection },
      { id: "email", label: "Operational email", keywords: "sender outbox delivery member service preferences mandatory notices", component: OperationalEmailSection },
    ],
  },
  {
    label: "Operations",
    entries: [
      { id: "operations", label: "Operational rules", keywords: "policies entry check-in scan freeze referral renewal lifecycle retention class booking", component: OperationalRulesSection },
      { id: "hours", label: "Hours & trials", keywords: "opening closing operating schedule free trial windows branch", component: HoursAndTrialsSection },
      { id: "checklists", label: "Daily checklists", keywords: "opening closing walkthrough morning night tasks", component: ChecklistsSection },
    ],
  },
];

const ALL_ENTRIES = SETTINGS_GROUPS.flatMap((group) => group.entries);
const DEFAULT_ENTRY = ALL_ENTRIES[0]!;

export function SettingsPageInner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const section = searchParams.get("section") ?? "organization";
  const initialSection = ALL_ENTRIES.some((entry) => entry.id === section) ? section : DEFAULT_ENTRY.id;
  const [activeSection, setActiveSection] = useState(initialSection);
  const [query, setQuery] = useState("");
  const { requestNavigation } = useUnsavedChanges();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return ALL_ENTRIES.filter((entry) => `${entry.label} ${entry.keywords}`.toLowerCase().includes(needle));
  }, [query]);

  const active = ALL_ENTRIES.find((entry) => entry.id === activeSection) ?? DEFAULT_ENTRY;
  const ActiveComponent = active.component;

  useEffect(() => {
    const next = ALL_ENTRIES.find((entry) => entry.id === section)?.id ?? DEFAULT_ENTRY.id;
    setActiveSection((current) => current === next ? current : next);
  }, [section]);

  const select = (id: string) =>
    requestNavigation(() => {
      setActiveSection(id);
      const nextSearch = new URLSearchParams(searchParams.toString());
      nextSearch.set("section", id);
      router.replace(`${pathname}?${nextSearch.toString()}`, { scroll: false });
    });

  const navButton = (entry: SettingsEntry) => {
    const isActive = entry.id === active.id;
    return (
      <button
        key={entry.id}
        type="button"
        role="tab"
        aria-selected={isActive}
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

  return (
    <div className="-mt-2 mx-auto max-w-[1480px] space-y-3 lg:-mt-3">
      <PageHeader
        title="Settings"
        description="Organization, branches, people, permissions and receipts. Everything sensitive here is audited."
        className="bg-paper py-0.5 lg:sticky lg:top-14 lg:z-20 lg:h-[72px] lg:border-b lg:border-line/80 lg:py-2"
      />
      <Gate permission={["settings.manage", "users.manage"]} fallback={<ForbiddenState description="Settings require owner-level permissions." />}>
        <div className="space-y-3 lg:grid lg:grid-cols-[224px_minmax(0,1fr)] lg:items-start lg:gap-5 lg:space-y-0">
          <div className="sticky top-14 z-20 -mx-4 border-y border-line/80 bg-paper px-4 py-2 sm:-mx-6 sm:px-6 lg:hidden">
            <div className="flex items-center gap-3">
              <label className="shrink-0 text-[12px] font-medium text-ink-2" htmlFor="mobile-settings-section">Settings section</label>
              <Select value={active.id} onValueChange={select}>
                <SelectTrigger id="mobile-settings-section" aria-label="Settings section" className="h-11 min-w-0 flex-1 bg-surface"><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ENTRIES.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>)}</SelectContent>
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
                  placeholder="Search settings…"
                  aria-label="Search settings"
                  className="h-9 ps-8"
                />
              </div>
            </div>
            <div role="tablist" aria-orientation="vertical" className="space-y-2.5 pb-1">
              {filtered ? (
                filtered.length > 0 ? (
                  <div className="space-y-0.5">{filtered.map(navButton)}</div>
                ) : (
                  <p className="px-3 py-2 text-[12px] text-ink-3">No settings match “{query.trim()}”.</p>
                )
              ) : (
                SETTINGS_GROUPS.map((group) => (
                  <div key={group.label}>
                    <ContextLabel className="mb-0.5 px-3">{group.label}</ContextLabel>
                    <div className="space-y-0.5">{group.entries.map(navButton)}</div>
                  </div>
                ))
              )}
            </div>
          </nav>
          <div className="min-w-0 scroll-mt-20" role="tabpanel" aria-label={active.label}>
            <ActiveComponent />
          </div>
        </div>
      </Gate>
    </div>
  );
}
