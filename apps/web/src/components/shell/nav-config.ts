import {
  ArrowLeftRight,
  Gauge,
  KanbanSquare,
  ListFilter,
  Settings,
  ShieldCheck,
  CircleHelp,
  Dumbbell,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** any-of permissions required to see the item */
  anyPermission?: string[];
  /** roles this item is emphasized for (not a filter) */
  forRoles?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: Gauge }],
  },
  {
    label: "Workspace",
    items: [
      { href: "/crm/pipeline", label: "Leads", icon: KanbanSquare, anyPermission: ["crm.read"] },
      { href: "/crm/queues", label: "Follow-ups", icon: ListFilter, anyPermission: ["crm.read"] },
      { href: "/members", label: "Members", icon: Users, anyPermission: ["members.read"] },
      { href: "/reception", label: "Reception", icon: ShieldCheck },
      { href: "/pt", label: "Personal training", icon: Dumbbell, anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
    ],
  },
  {
    label: "Finance",
    items: [{ href: "/payments", label: "Payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] }],
  },
  {
    label: "System",
    items: [
      { href: "/support", label: "Support", icon: CircleHelp },
      { href: "/settings", label: "Settings", icon: Settings, anyPermission: ["settings.manage", "users.manage"] },
    ],
  },
];
