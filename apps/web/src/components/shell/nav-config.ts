import {
  ArrowLeftRight,
  Gauge,
  KanbanSquare,
  ListFilter,
  ScrollText,
  Settings,
  ShieldCheck,
  CircleHelp,
  Dumbbell,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Catalogue key under `nav.item.*` — the label is resolved at render. */
  labelKey: NavItemKey;
  icon: LucideIcon;
  /** any-of permissions required to see the item */
  anyPermission?: string[];
  /** roles this item is emphasized for (not a filter) */
  forRoles?: string[];
}

export interface NavSection {
  /** Catalogue key under `nav.section.*`. */
  labelKey: NavSectionKey;
  items: NavItem[];
}

export type NavSectionKey = "overview" | "workspace" | "sales" | "finance" | "system";

export type NavItemKey =
  | "dashboard"
  | "reception"
  | "members"
  | "personalTraining"
  | "leads"
  | "followUps"
  | "payments"
  | "auditLog"
  | "support"
  | "settings";

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: "overview",
    items: [{ href: "/dashboard", labelKey: "dashboard", icon: Gauge }],
  },
  {
    labelKey: "workspace",
    items: [
      { href: "/reception", labelKey: "reception", icon: ShieldCheck },
      { href: "/members", labelKey: "members", icon: Users, anyPermission: ["members.read"] },
      { href: "/pt", labelKey: "personalTraining", icon: Dumbbell, anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
    ],
  },
  {
    labelKey: "sales",
    items: [
      { href: "/crm/pipeline", labelKey: "leads", icon: KanbanSquare, anyPermission: ["crm.read"] },
      { href: "/crm/queues", labelKey: "followUps", icon: ListFilter, anyPermission: ["crm.read"] },
    ],
  },
  {
    labelKey: "finance",
    items: [{ href: "/payments", labelKey: "payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] }],
  },
  {
    labelKey: "system",
    items: [
      { href: "/audit", labelKey: "auditLog", icon: ScrollText, anyPermission: ["audit.read"] },
      { href: "/support", labelKey: "support", icon: CircleHelp },
      { href: "/settings", labelKey: "settings", icon: Settings, anyPermission: ["settings.manage", "users.manage"] },
    ],
  },
];
