"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { ChevronRight, CornerDownRight, Search } from "lucide-react";
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

interface SettingsItem {
  label: string;
  /** Extra search terms beyond the label. */
  keywords?: string;
  /** Exact heading text of the card this item lives in, when scroll-to makes sense. */
  heading?: string;
}

interface SettingsEntry {
  id: string;
  label: string;
  /** Extra search terms beyond the label, so "logo" finds Brand Kit. */
  keywords: string;
  component: ComponentType;
  /** What the section contains — shown in the rail dropdown and searched. */
  contents: SettingsItem[];
}

interface SettingsGroup {
  label: string;
  entries: SettingsEntry[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Gym",
    entries: [
      {
        id: "organization", label: "Organization", keywords: "identity contact", component: OrganizationSection,
        contents: [
          { label: "Organization name", keywords: "gym name" },
          { label: "Timezone", keywords: "clock amman" },
          { label: "Locale & language", keywords: "arabic english" },
          { label: "Default phone country", keywords: "dialing code 962" },
        ],
      },
      {
        id: "brand", label: "Brand Kit", keywords: "identity sidebar", component: BrandKitSection,
        contents: [
          { label: "Workspace palette", keywords: "colors theme" },
          { label: "Primary color", keywords: "hex accent" },
          { label: "Workspace logo", keywords: "logo image sidebar" },
        ],
      },
      {
        id: "profile", label: "Public profile", keywords: "page publish website directory", component: GymPublicProfileSection,
        contents: [
          { label: "Draft and publication", keywords: "publish review", heading: "Draft and publication" },
          { label: "Logo & cover photos", keywords: "banner images media" },
          { label: "Tagline & amenities", keywords: "description category audience" },
        ],
      },
      {
        id: "branches", label: "Branches", keywords: "locations address", component: BranchesSection,
        contents: [
          { label: "Branch names & codes", keywords: "location" },
          { label: "Add branch", keywords: "new location" },
        ],
      },
      {
        id: "spaces", label: "Gym spaces", keywords: "zones areas", component: GymSpacesSection,
        contents: [
          { label: "Rooms, floors & studios", keywords: "zone area" },
          { label: "Add gym space", keywords: "new room" },
        ],
      },
    ],
  },
  {
    label: "People",
    entries: [
      {
        id: "users", label: "Users", keywords: "staff accounts", component: UsersSection,
        contents: [
          { label: "Staff accounts", keywords: "team deactivate" },
          { label: "Invite user", keywords: "add staff email" },
          { label: "Branch access", keywords: "scope" },
        ],
      },
      {
        id: "roles", label: "Roles & permissions", keywords: "access owner manager receptionist coach", component: RolesSection,
        contents: [
          { label: "Permission matrix", keywords: "grant capability", heading: "Permission matrix" },
        ],
      },
    ],
  },
  {
    label: "Money",
    entries: [
      {
        id: "payments", label: "Payments", keywords: "money", component: PaymentsSection,
        contents: [
          { label: "Payment methods", keywords: "cash card cliq bank transfer", heading: "Payment methods" },
          { label: "Discount approval limits", keywords: "percent manager override", heading: "Discount approval limits" },
        ],
      },
      {
        id: "receipts", label: "Receipts & tax", keywords: "invoice", component: ReceiptsSection,
        contents: [
          { label: "Receipt prefix", keywords: "numbering" },
          { label: "Sales tax (%)", keywords: "vat rate" },
          { label: "Receipt footer", keywords: "note text" },
        ],
      },
    ],
  },
  {
    label: "Communication",
    entries: [
      {
        id: "notifications", label: "Notifications", keywords: "reminders templates", component: NotificationsSection,
        contents: [
          { label: "Manager alerts", keywords: "variance refunds voids", heading: "Manager alerts" },
          { label: "Automation delivery", keywords: "whatsapp sms email renewals", heading: "Automation delivery" },
        ],
      },
      {
        id: "email", label: "Operational email", keywords: "sender outbox delivery", component: OperationalEmailSection,
        contents: [
          { label: "Member service email", keywords: "categories preferences", heading: "Member service email" },
          { label: "Mandatory platform notices", keywords: "invoices suspension" },
        ],
      },
    ],
  },
  {
    label: "Operations",
    entries: [
      {
        id: "operations", label: "Rules & hours", keywords: "policies", component: OperationalRulesSection,
        contents: [
          { label: "Entry rules", keywords: "check-in scan balance", heading: "Entry rules" },
          { label: "Membership lifecycle", keywords: "renewal overlap extension", heading: "Membership lifecycle" },
          { label: "Referral rewards", keywords: "refer friend days cap", heading: "Referral rewards" },
          { label: "Member freeze requests", keywords: "pause fee allowance", heading: "Member freeze requests" },
          { label: "Branch hours and free trials", keywords: "operating hours trial window", heading: "Branch hours and free trials" },
        ],
      },
    ],
  },
];

const ALL_ENTRIES = SETTINGS_GROUPS.flatMap((group) => group.entries);
const DEFAULT_ENTRY = ALL_ENTRIES[0]!;

const matches = (needle: string, ...haystacks: Array<string | undefined>) =>
  haystacks.some((value) => value?.toLowerCase().includes(needle));

export function SettingsPageInner() {
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "organization";
  const [activeSection, setActiveSection] = useState(section);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([section]));
  const [query, setQuery] = useState("");
  const [pendingHeading, setPendingHeading] = useState<string | undefined>();
  const { requestNavigation } = useUnsavedChanges();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return ALL_ENTRIES.map((entry) => {
      const items = entry.contents.filter((item) => matches(needle, item.label, item.keywords));
      const entryMatched = matches(needle, entry.label, entry.keywords);
      return entryMatched || items.length > 0 ? { entry, items: entryMatched && items.length === 0 ? entry.contents : items } : null;
    }).filter((result): result is { entry: SettingsEntry; items: SettingsItem[] } => result !== null);
  }, [query]);

  const active = ALL_ENTRIES.find((entry) => entry.id === activeSection) ?? DEFAULT_ENTRY;
  const ActiveComponent = active.component;

  // After a sub-item selects its section, glide to that card once it exists.
  useEffect(() => {
    if (!pendingHeading) return;
    const frame = requestAnimationFrame(() => {
      const panel = document.querySelector('[role="tabpanel"]');
      const heading = panel
        ? [...panel.querySelectorAll("h2, h3")].find((node) => node.textContent?.trim() === pendingHeading)
        : undefined;
      if (heading instanceof HTMLElement) {
        heading.style.scrollMarginTop = "84px";
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setPendingHeading(undefined);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSection, pendingHeading]);

  const select = (id: string, heading?: string) =>
    requestNavigation(() => {
      setActiveSection(id);
      setExpanded((current) => new Set(current).add(id));
      if (heading) setPendingHeading(heading);
      else try { window.scrollTo({ top: 0 }); } catch { /* jsdom */ }
    });

  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const itemButton = (entry: SettingsEntry, item: SettingsItem) => (
    <button
      key={item.label}
      type="button"
      // Namespaced so a rail item never shares an accessible name with the
      // section's own action buttons (e.g. "Add gym space").
      aria-label={`${entry.label} — ${item.label}`}
      onClick={() => select(entry.id, item.heading)}
      className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pe-2 ps-7 text-start text-[12px] text-ink-3 transition-colors hover:bg-sunken/60 hover:text-ink"
    >
      <CornerDownRight aria-hidden className="size-3 shrink-0 text-ink-4" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );

  const sectionButton = (entry: SettingsEntry, options?: { forceOpen?: boolean; items?: SettingsItem[] }) => {
    const isActive = entry.id === active.id;
    const isOpen = options?.forceOpen ?? expanded.has(entry.id);
    const items = options?.items ?? entry.contents;
    return (
      <div key={entry.id}>
        <button
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-expanded={isOpen}
          data-state={isActive ? "active" : "inactive"}
          onClick={() => {
            if (isActive) toggleExpanded(entry.id);
            select(entry.id);
          }}
          className={cn(
            "flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pe-2 ps-1.5 text-start text-[13px] transition-colors",
            isActive ? "bg-sunken font-medium text-ink" : "text-ink-2 hover:bg-sunken/60 hover:text-ink",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3.5 shrink-0 text-ink-4 transition-transform duration-150", isOpen ? "rotate-90" : "rtl:rotate-180")}
          />
          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          {isActive ? <span aria-hidden className="ms-1 h-3.5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: "var(--tenant-brand-primary)" }} /> : null}
        </button>
        {/* 0fr→1fr grid keeps the reveal smooth without measuring heights. */}
        <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="space-y-px pb-1 pt-0.5">{items.map((item) => itemButton(entry, item))}</div>
          </div>
        </div>
      </div>
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
        <div className="grid items-start gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6.5rem)] lg:flex-col">
            <div className="relative mb-3 shrink-0">
              <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search settings…"
                aria-label="Search settings"
                className="h-9 ps-8"
              />
            </div>
            <div
              role="tablist"
              aria-orientation="vertical"
              className="space-y-4 pe-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-2 [scrollbar-width:thin]"
            >
              {filtered ? (
                filtered.length > 0 ? (
                  <div className="space-y-1">
                    {filtered.map(({ entry, items }) => sectionButton(entry, { forceOpen: true, items }))}
                  </div>
                ) : (
                  <p className="px-2.5 py-1.5 text-[12px] text-ink-3">No settings match “{query.trim()}”.</p>
                )
              ) : (
                SETTINGS_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="eyebrow mb-1 px-2">{group.label}</p>
                    <div className="space-y-px">{group.entries.map((entry) => sectionButton(entry))}</div>
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
