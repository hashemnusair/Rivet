"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { NAV_SECTIONS } from "./nav-config";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/misc";

/** Active-route rule shared by the desktop sidebar and the mobile drawer. */
export function navIsActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (href === "/payments") return pathname === "/payments" || pathname.startsWith("/payments/receipts");
  // Match the route itself and descendants, but not similarly prefixed routes.
  // Without the segment boundary, `/members` also activates `/memberships`.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useApp();
  const { canAny } = usePermissions();

  return (
    <aside
      className={cn(
        // Below lg the primary nav lives in the topbar's drawer instead.
        "night-surface fixed inset-y-0 start-0 z-40 hidden flex-col bg-night text-night-ink transition-[width] duration-200 ease-out lg:flex",
        sidebarCollapsed ? "w-[60px]" : "w-[228px]",
      )}
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <div className="flex h-16 items-center border-b border-night-line px-4">
        {/* Keep the brand wrapper's left edge fixed and use the dedicated glyph
            when collapsed so the brand never jumps between sidebar states. */}
        <Link
          href="/dashboard"
          className={cn("flex h-7 shrink-0 items-center overflow-hidden", sidebarCollapsed ? "w-6" : "w-[110px]")}
          aria-label="RIVET home"
        >
          {sidebarCollapsed ? (
            <Image src="/brand/rivet-glyph-rev.png" alt="RIVET" width={18} height={28} className="shrink-0" priority />
          ) : (
            <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={110} height={28} style={{ height: "auto" }} className="shrink-0" priority />
          )}
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
                    const active = navIsActive(item.href, pathname);
                    const link = (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-md px-3.5 py-[7px] text-[13px] transition-colors duration-100",
                          active
                            ? "bg-night-3 text-night-ink font-medium"
                            : "text-night-ink-2 hover:bg-night-2 hover:text-night-ink",
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
          className="flex w-full items-center gap-2.5 rounded-md px-3.5 py-1.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-2 hover:text-night-ink-2 cursor-pointer"
        >
          {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!sidebarCollapsed ? "Collapse" : null}
        </button>
      </div>
    </aside>
  );
}
