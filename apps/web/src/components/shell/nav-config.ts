import {
  ArrowLeftRight,
  Boxes,
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
      { href: "/reception", label: "Reception", icon: ShieldCheck },
      { href: "/members", label: "Members", icon: Users, anyPermission: ["members.read"] },
      { href: "/pt", label: "Personal training", icon: Dumbbell, anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
      { href: "/operations", label: "Operations", icon: Boxes, anyPermission: ["members.read"] },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/crm/pipeline", label: "Leads", icon: KanbanSquare, anyPermission: ["crm.read"] },
      { href: "/crm/queues", label: "Follow-ups", icon: ListFilter, anyPermission: ["crm.read"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
      { href: "/finance", label: "Management ledger", icon: ScrollText, anyPermission: ["reports.financial.read"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/audit", label: "Audit log", icon: ScrollText, anyPermission: ["audit.read"] },
      { href: "/support", label: "Support", icon: CircleHelp },
      { href: "/settings", label: "Settings", icon: Settings, anyPermission: ["settings.manage", "users.manage"] },
    ],
  },
];
