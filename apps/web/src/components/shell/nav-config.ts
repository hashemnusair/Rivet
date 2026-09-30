import {
  ArrowLeftRight,
  CalendarDays,
  ClipboardCheck,
  Boxes,
  Gauge,
  KanbanSquare,
  ListFilter,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  CircleHelp,
  Dumbbell,
  Download,
  FileBarChart,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Session, WorkspaceModuleKey } from "@/lib/domain/types";
import type { TKey } from "@/lib/i18n/provider";

export interface NavItem {
  href: string;
  /** English label; `labelKey` is the translated one shown in the sidebar and drawer. */
  label: string;
  labelKey: TKey;
  icon: LucideIcon;
  /** any-of permissions required to see the item */
  anyPermission?: string[];
  /** Optional server-owned workspace capability required by this route. */
  moduleKey?: WorkspaceModuleKey;
  /** roles this item is emphasized for (not a filter) */
  forRoles?: string[];
}

export interface NavSection {
  label: string;
  labelKey: TKey;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    labelKey: "nav.section.overview",
    items: [{ href: "/dashboard", label: "Dashboard", labelKey: "nav.item.dashboard", icon: Gauge }],
  },
  {
    label: "Daily work",
    labelKey: "nav.section.dailyWork",
    items: [
      { href: "/reception", label: "Reception", labelKey: "nav.item.reception", icon: ShieldCheck },
      { href: "/checkout", label: "Checkout", labelKey: "nav.item.checkout", icon: ShoppingCart, anyPermission: ["payments.collect"], moduleKey: "operations" },
      { href: "/checklists", label: "Daily checklist", labelKey: "nav.item.checklists", icon: ClipboardCheck, anyPermission: ["members.read"] },
      { href: "/members", label: "Members", labelKey: "nav.item.members", icon: Users, anyPermission: ["members.read"] },
      { href: "/classes", label: "Classes", labelKey: "nav.item.classes", icon: CalendarDays, anyPermission: ["members.read"] },
      { href: "/pt", label: "Personal training", labelKey: "nav.item.personalTraining", icon: Dumbbell, anyPermission: ["pt.reports.read", "pt.schedule.self", "pt.book_for_member"] },
      { href: "/operations", label: "Stock & purchasing", labelKey: "nav.item.operations", icon: Boxes, anyPermission: ["members.read"], moduleKey: "operations" },
    ],
  },
  {
    label: "Sales",
    labelKey: "nav.section.sales",
    items: [
      { href: "/crm/pipeline", label: "Leads", labelKey: "nav.item.leads", icon: KanbanSquare, anyPermission: ["crm.read"], moduleKey: "revenue" },
      { href: "/crm/queues", label: "Follow-ups", labelKey: "nav.item.followUps", icon: ListFilter, anyPermission: ["crm.read"], moduleKey: "revenue" },
    ],
  },
  {
    label: "Finance",
    labelKey: "nav.section.finance",
    items: [
      { href: "/payments", label: "Payments", labelKey: "nav.item.payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
      { href: "/reports", label: "Reports", labelKey: "nav.item.reports", icon: FileBarChart, anyPermission: ["reports.financial.read"] },
    ],
  },
  {
    label: "Management ledger",
    labelKey: "nav.section.managementLedger",
    items: [
      { href: "/finance", label: "Statements", labelKey: "nav.item.statements", icon: ScrollText, anyPermission: ["reports.financial.read"], moduleKey: "reporting" },
    ],
  },
  {
    label: "Admin",
    labelKey: "nav.section.admin",
    items: [
      { href: "/audit", label: "Activity log", labelKey: "nav.item.activityLog", icon: ScrollText, anyPermission: ["audit.read"] },
      { href: "/exports", label: "Downloads", labelKey: "nav.item.downloads", icon: Download, anyPermission: ["members.read", "crm.read", "reports.financial.read", "audit.read", "pt.reports.read", "operations.manage"] },
      { href: "/support", label: "Support", labelKey: "nav.item.support", icon: CircleHelp },
      { href: "/settings", label: "Settings", labelKey: "nav.item.settings", icon: Settings },
    ],
  },
];

/**
 * A role permission alone is not enough to advertise a workspace route.
 * Subscription entitlements and owner-selected module preferences are a
 * separate, server-owned capability boundary. Keep the fallback permissive
 * for legacy/session-bootstrap callers that predate the workspace contract.
 */
export function navItemIsVisible(item: NavItem, session: Pick<Session, "permissions" | "workspace"> | undefined): boolean {
  if (item.anyPermission && !item.anyPermission.some((permission) => session?.permissions.includes(permission))) return false;
  if (!item.moduleKey || !session?.workspace) return true;
  const moduleStatus = session.workspace.modules.find((candidate) => candidate.key === item.moduleKey);
  return Boolean(moduleStatus?.entitled && moduleStatus.enabled);
}
