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
import type { Session, WorkspaceModuleKey } from "@/lib/domain/types";

export interface NavItem {
  href: string;
  label: string;
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
      { href: "/operations", label: "Operations", icon: Boxes, anyPermission: ["members.read"], moduleKey: "operations" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/crm/pipeline", label: "Leads", icon: KanbanSquare, anyPermission: ["crm.read"], moduleKey: "revenue" },
      { href: "/crm/queues", label: "Follow-ups", icon: ListFilter, anyPermission: ["crm.read"], moduleKey: "revenue" },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/payments", label: "Payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
      { href: "/finance", label: "Management ledger", icon: ScrollText, anyPermission: ["reports.financial.read"], moduleKey: "reporting" },
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
