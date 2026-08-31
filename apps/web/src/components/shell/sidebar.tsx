"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useApp } from "@/lib/providers/app-providers";
import { NAV_SECTIONS, navItemIsVisible } from "./nav-config";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/misc";

/** Active-route rule shared by the desktop sidebar and the mobile drawer. */
export function navIsActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (href === "/payments") return pathname === "/payments" || pathname.startsWith("/payments/");
  // Lead detail pages live under /crm/leads but belong to the pipeline entry.
  if (href === "/crm/pipeline") return pathname === "/crm/pipeline" || pathname.startsWith("/crm/pipeline/") || pathname.startsWith("/crm/leads");
  // Match the route itself and descendants, but not similarly prefixed routes.
  // Without the segment boundary, `/members` also activates `/memberships`.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, session } = useApp();
  const brandLogo = session?.organization.brand?.logoUrl;
  const brandName = session?.organization.name ?? "RIVET";

  return (
    <aside
      className={cn(
        // Below lg the primary nav lives in the topbar's drawer instead.
        "night-surface fixed inset-y-0 start-0 z-40 hidden flex-col bg-night text-night-ink transition-[width] duration-200 ease-out lg:flex",
        sidebarCollapsed ? "w-[60px]" : "w-[228px]",
      )}
      aria-label="Primary navigation"
    >
      {/* Brand — the workspace wears the gym's own logo when a brand kit sets
          one, with a quiet "Operated by RIVET" credit underneath. */}
      <div className="flex h-16 items-center border-b border-night-line px-4">
        {/* Keep the brand wrapper's left edge fixed and use the dedicated glyph
            when collapsed so the brand never jumps between sidebar states. */}
        <Link
          href="/dashboard"
          className={cn("flex h-full shrink-0 flex-col justify-center overflow-hidden", sidebarCollapsed ? "w-6" : "w-[140px]")}
          aria-label={`${brandName} home`}
        >
          {sidebarCollapsed ? (
            <Image src={brandLogo ?? "/brand/rivet-glyph-rev.png"} alt={brandLogo ? brandName : "RIVET"} width={18} height={28} className="shrink-0" priority unoptimized={Boolean(brandLogo)} />
          ) : (
            <>
              <Image src={brandLogo ?? "/brand/rivet-lockup-rev.png"} alt={brandLogo ? brandName : "RIVET"} width={110} height={28} style={brandLogo ? { height: "auto", maxHeight: 30, width: "auto", maxWidth: 132 } : undefined} className="shrink-0" priority unoptimized={Boolean(brandLogo)} />
              {brandLogo ? <span className="mt-1 whitespace-nowrap text-[9px] uppercase tracking-[0.14em] text-night-ink-3">Operated by RIVET™</span> : null}
            </>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <TooltipProvider delayDuration={200}>
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((item) => navItemIsVisible(item, session ? { permissions: session.permissions, workspace: session.workspace } : undefined));
            if (visible.length === 0) return null;
            return (
              <div key={section.label} className="mb-4">
                <div className="relative h-5">
                  {!sidebarCollapsed ? (
                    <p className="eyebrow-night truncate whitespace-nowrap px-3.5 leading-4">{section.label}</p>
                  ) : (
                    <div aria-hidden className="absolute inset-x-2 top-2 h-px bg-night-line" />
                  )}
                </div>
                <ul className="space-y-0.5">
                  {visible.map((item) => {
                    const active = navIsActive(item.href, pathname);
                    const link = (
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex h-8 min-w-0 items-center gap-2.5 rounded-md px-3.5 text-[13px] transition-colors duration-100",
                          active
                            ? "bg-night-3 text-night-ink font-medium"
                            : "text-night-ink-2 hover:bg-night-2 hover:text-night-ink",
                        )}
                      >
                        {active ? (
                          <span aria-hidden className="absolute start-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full" style={{ backgroundColor: "var(--tenant-brand-primary)" }} />
                        ) : null}
                        <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                          <item.icon className={cn("size-4", active ? "text-night-ink" : "text-night-ink-3 group-hover:text-night-ink-2")} />
                        </span>
                        {!sidebarCollapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
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
          className="flex h-8 min-w-0 w-full items-center gap-2.5 rounded-md px-3.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-2 hover:text-night-ink-2 cursor-pointer"
        >
          <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
            {sidebarCollapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </span>
          {!sidebarCollapsed ? <span className="min-w-0 flex-1 truncate">Collapse</span> : null}
        </button>
      </div>
    </aside>
  );
}
