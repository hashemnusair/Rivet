"use client";

import { ArrowLeftRight, Banknote, FileBarChart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
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
  { href: "/reports", label: "Reports", icon: FileBarChart, anyPermission: ["reports.financial.read"] },
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
  if (href === "/reports") return pathname === "/reports";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** One small secondary switcher keeps finance routes discoverable without three primary nav entries. */
export function FinanceNav() {
  const pathname = usePathname();
  const { session } = useApp();
  const links = FINANCE_LINKS.filter((item) => financeLinkIsVisible(item, session ? { permissions: session.permissions, workspace: session.workspace } : undefined));

  return (
    <nav aria-label="Finance views" className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
      {links.map((item) => {
        const active = financeLinkIsActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
              active ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken hover:text-ink",
            )}
          >
            <item.icon className="size-3.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
