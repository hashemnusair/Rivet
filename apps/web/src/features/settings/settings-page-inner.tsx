"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Gate, PageHeader } from "@/components/shared/chrome";
import { ForbiddenState } from "@/components/ui/states";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  BranchesSection,
  GymSpacesSection,
  NotificationsSection,
  OperationalRulesSection,
  OrganizationSection,
  PaymentsSection,
  ReceiptsSection,
  RolesSection,
  UsersSection,
} from "@/features/settings/settings-sections";
import { GymPublicProfileSection } from "@/features/settings/gym-public-profile-section";
import { OperationalEmailSection } from "@/features/settings/operational-email-section";
import { BrandKitSection } from "@/features/settings/brand-kit-section";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";

interface SettingsEntry {
  id: string;
  label: string;
  /** Extra search terms beyond the label, so "logo" finds Brand kit. */
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
      { id: "organization", label: "Organization", keywords: "name currency timezone contact", component: OrganizationSection },
      { id: "brand", label: "Brand Kit", keywords: "logo colors identity sidebar", component: BrandKitSection },
      { id: "profile", label: "Public profile", keywords: "page photos banner publish description website", component: GymPublicProfileSection },
      { id: "branches", label: "Branches", keywords: "locations codes address", component: BranchesSection },
      { id: "spaces", label: "Gym spaces", keywords: "zones rooms floor studio areas", component: GymSpacesSection },
    ],
  },
  {
    label: "People",
    entries: [
      { id: "users", label: "Users", keywords: "staff invite accounts deactivate", component: UsersSection },
      { id: "roles", label: "Roles & permissions", keywords: "access owner manager receptionist coach", component: RolesSection },
    ],
  },
  {
    label: "Money",
    entries: [
      { id: "payments", label: "Payments", keywords: "methods cash card cliq bank", component: PaymentsSection },
      { id: "receipts", label: "Receipts & tax", keywords: "vat numbering invoice footer", component: ReceiptsSection },
    ],
  },
  {
    label: "Communication",
    entries: [
      { id: "notifications", label: "Notifications", keywords: "whatsapp sms email reminders renewals templates", component: NotificationsSection },
      { id: "email", label: "Operational email", keywords: "sender outbox delivery", component: OperationalEmailSection },
    ],
  },
  {
    label: "Operations",
    entries: [
      { id: "operations", label: "Rules & hours", keywords: "operating hours entry freeze referral trial policies", component: OperationalRulesSection },
    ],
  },
];

const ALL_ENTRIES = SETTINGS_GROUPS.flatMap((group) => group.entries);
const DEFAULT_ENTRY = ALL_ENTRIES[0]!;

export function SettingsPageInner() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "organization";
  const [activeSection, setActiveSection] = useState(section);
  const [query, setQuery] = useState("");
  const { requestNavigation } = useUnsavedChanges();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return ALL_ENTRIES.filter((entry) => `${entry.label} ${entry.keywords}`.toLowerCase().includes(needle));
  }, [query]);

  const active = ALL_ENTRIES.find((entry) => entry.id === activeSection) ?? DEFAULT_ENTRY;
  const ActiveComponent = active.component;

  const select = (id: string) => requestNavigation(() => setActiveSection(id));

  const navButton = (entry: SettingsEntry) => {
    const isActive = entry.id === active.id;
    return (
      <button
        key={entry.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        data-state={isActive ? "active" : "inactive"}
        onClick={() => select(entry.id)}
        className={cn(
          "flex w-full items-center rounded-md px-2.5 py-1.5 text-start text-[13px] transition-colors",
          isActive ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {isActive ? <span aria-hidden className="ms-2 h-3.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: "var(--tenant-brand-primary)" }} /> : null}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Organization, branches, people, permissions and receipts. Everything sensitive here is audited."
      />
      <Gate permission={["settings.manage", "users.manage"]} fallback={<ForbiddenState description="Settings require owner-level permissions." />}>
        <div className="grid items-start gap-5 lg:grid-cols-[218px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="lg:sticky lg:top-20">
            <div className="relative mb-3">
              <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings…"
                aria-label="Search settings"
                className="h-9 ps-8"
              />
            </div>
            <div role="tablist" aria-orientation="vertical" className="space-y-4">
              {filtered ? (
                filtered.length > 0 ? (
                  <div className="space-y-0.5">{filtered.map(navButton)}</div>
                ) : (
                  <p className="px-2.5 py-1.5 text-[12px] text-ink-3">No settings match “{query.trim()}”.</p>
                )
              ) : (
                SETTINGS_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="eyebrow mb-1 px-2.5">{group.label}</p>
                    <div className="space-y-0.5">{group.entries.map(navButton)}</div>
                  </div>
                ))
              )}
            </div>
          </nav>
          <div className="min-w-0" role="tabpanel" aria-label={active.label}>
            <ActiveComponent />
          </div>
        </div>
      </Gate>
    </div>
  );
}
