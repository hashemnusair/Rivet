"use client";

import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";

import { ArrowLeftRight, Banknote } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/providers/app-providers";
import type { Session, WorkspaceModuleKey } from "@/lib/domain/types";

interface FinanceLink {
  href: string;
  label: string;
  icon: typeof ArrowLeftRight;
  anyPermission: readonly string[];
  /** Optional subscription capability in addition to role permission. */
  moduleKey?: WorkspaceModuleKey;
}

export const FINANCE_LINKS: readonly FinanceLink[] = [
  { href: "/payments", label: "Payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
  { href: "/payments/shifts", label: "Shifts & cash", icon: Banknote, anyPermission: ["reports.financial.read", "reconciliation.open_shift"] },
];

export function financeLinkIsVisible(
  item: Pick<FinanceLink, "anyPermission" | "moduleKey">,
  session: Pick<Session, "permissions" | "workspace"> | undefined,
): boolean {
  if (!item.anyPermission.some((permission) => session?.permissions.includes(permission))) return false;
  if (!item.moduleKey || !session?.workspace) return true;
  const moduleStatus = session.workspace.modules.find((module) => module.key === item.moduleKey);
  return Boolean(moduleStatus?.entitled && moduleStatus.enabled);
}

function financeLinkIsActive(href: string, pathname: string) {
  if (href === "/payments") return pathname === "/payments" || pathname.startsWith("/payments/receipts");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Payments and cash shifts share one compact switcher. Reports live in the primary sidebar. */
export function FinanceNav() {
  const pathname = usePathname();
  const { session } = useApp();
  const links = FINANCE_LINKS.filter((item) => financeLinkIsVisible(item, session ? { permissions: session.permissions, workspace: session.workspace } : undefined));

  return (
    <nav aria-label="Finance views" className={tabListClassName}>
      {links.map((item) => {
        const active = financeLinkIsActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={tabTriggerClassName}
          >
            <item.icon className="size-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
