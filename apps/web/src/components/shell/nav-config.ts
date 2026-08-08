import {
  ArrowLeftRight,
  Banknote,
  ClipboardList,
  FileBarChart,
  Gauge,
  KanbanSquare,
  ListFilter,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  Zap,
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
    label: "Operations",
    items: [
      { href: "/reception", label: "Reception", icon: ShieldCheck },
      { href: "/members", label: "Members", icon: Users, anyPermission: ["members.read"] },
      { href: "/memberships", label: "Memberships", icon: WalletCards, anyPermission: ["members.read"] },
      { href: "/plans", label: "Plans", icon: ClipboardList, anyPermission: ["members.read"] },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/crm/pipeline", label: "Pipeline", icon: KanbanSquare, anyPermission: ["crm.read"] },
      { href: "/crm/queues", label: "Queues", icon: ListFilter, anyPermission: ["crm.read"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/payments", label: "Transactions", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
      { href: "/payments/shifts", label: "Shifts & cash", icon: Banknote, anyPermission: ["reports.financial.read", "reconciliation.open_shift"] },
      { href: "/reports", label: "Reports", icon: FileBarChart, anyPermission: ["reports.financial.read"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/automations", label: "Automations", icon: Zap, anyPermission: ["automations.manage"] },
      { href: "/audit", label: "Audit log", icon: ScrollText, anyPermission: ["audit.read"] },
      { href: "/settings", label: "Settings", icon: Settings, anyPermission: ["settings.manage", "users.manage"] },
    ],
  },
];
