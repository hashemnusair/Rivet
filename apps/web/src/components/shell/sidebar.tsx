"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { NAV_SECTIONS } from "./nav-config";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/misc";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useApp();
  const { canAny } = usePermissions();

  return (
    <aside
      className={cn(
        "night-surface fixed inset-y-0 start-0 z-40 flex flex-col bg-night text-night-ink transition-[width] duration-200 ease-out",
        sidebarCollapsed ? "w-[60px]" : "w-[228px]",
      )}
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <div className={cn("flex h-16 items-center border-b border-night-line", sidebarCollapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" aria-label="RIVET home">
          <Image
            src="/brand/rivet-glyph-rev.png"
            alt=""
            width={22}
            height={34}
            className="shrink-0"
            priority
          />
          {!sidebarCollapsed ? (
            <Image
              src="/brand/rivet-lockup-rev.png"
              alt="RIVET"
              width={92}
              height={24}
              className="shrink-0 translate-y-px"
              priority
            />
          ) : null}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <TooltipProvider delayDuration={200}>
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((item) => !item.anyPermission || canAny(item.anyPermission));
            if (visible.length === 0) return null;
            return (
              <div key={section.label} className="mb-4">
                {!sidebarCollapsed ? <p className="eyebrow-night px-2.5 pb-1.5">{section.label}</p> : <div className="mb-1.5 h-px bg-night-line mx-2" />}
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const active =
                      item.href === "/dashboard"
                        ? pathname === "/dashboard" || pathname === "/"
                        : item.href === "/payments"
                          ? pathname === "/payments" || pathname.startsWith("/payments/receipts")
                          : pathname.startsWith(item.href);
                    const link = (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors duration-100",
                          active
                            ? "bg-night-3 text-night-ink font-medium"
                            : "text-night-ink-2 hover:bg-night-2 hover:text-night-ink",
                          sidebarCollapsed && "justify-center px-0",
                        )}
                      >
                        {active ? (
                          <span aria-hidden className="absolute start-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-signal" />
                        ) : null}
                        <item.icon className={cn("size-4 shrink-0", active ? "text-night-ink" : "text-night-ink-3 group-hover:text-night-ink-2")} aria-hidden />
                        {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                      </Link>
                    );
                    return (
                      <li key={item.href}>
                        {sidebarCollapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* Footer */}
      <div className="border-t border-night-line p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-2 hover:text-night-ink-2 cursor-pointer"
        >
          {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!sidebarCollapsed ? "Collapse" : null}
        </button>
      </div>
    </aside>
  );
}
