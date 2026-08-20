"use client";

import { ArrowLeftRight, Banknote, FileBarChart, LineChart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { usePermissions } from "@/lib/providers/app-providers";

const FINANCE_LINKS = [
  { href: "/payments", label: "Payments", icon: ArrowLeftRight, anyPermission: ["reports.financial.read"] },
  { href: "/payments/shifts", label: "Shifts & cash", icon: Banknote, anyPermission: ["reports.financial.read", "reconciliation.open_shift"] },
  { href: "/reports", label: "Reports", icon: FileBarChart, anyPermission: ["reports.financial.read"] },
  { href: "/reports/statements", label: "Management statements", icon: LineChart, anyPermission: ["reports.financial.read"] },
] as const;

function financeLinkIsActive(href: string, pathname: string) {
  if (href === "/payments") return pathname === "/payments" || pathname.startsWith("/payments/receipts");
  if (href === "/reports") return pathname === "/reports";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** One small secondary switcher keeps finance routes discoverable without three primary nav entries. */
export function FinanceNav() {
  const pathname = usePathname();
  const { canAny } = usePermissions();
  const links = FINANCE_LINKS.filter((item) => canAny([...item.anyPermission]));

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
