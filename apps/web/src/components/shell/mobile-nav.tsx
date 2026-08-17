"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Building2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { navIsActive } from "./sidebar";
import { NAV_SECTIONS } from "./nav-config";
import { useT } from "@/lib/i18n/provider";

/**
 * Off-canvas primary navigation for viewports below lg, where the fixed
 * sidebar is hidden. Built on the Dialog primitive for the focus trap,
 * Escape handling and scroll lock; styled as a drawer, not a modal.
 */
export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const pathname = usePathname();
  const { canAny } = usePermissions();
  const { session, setBranch } = useApp();

  // Close once a navigation lands (covers both drawer links and programmatic nav).
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      onOpenChange(false);
    }
  }, [pathname, onOpenChange]);

  const role = session?.roles[0];
  const canPickBranch = role === "owner" || role === "manager" || role === "auditor";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-night/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          className="night-surface fixed inset-y-0 start-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-night text-night-ink shadow-dialog outline-none data-[state=open]:animate-fade-in lg:hidden"
          aria-label={t("nav.chrome.navigationMenu")}
        >
          <VisuallyHidden>
            <DialogPrimitive.Title>{t("nav.chrome.navigationMenu")}</DialogPrimitive.Title>
          </VisuallyHidden>

          {/* Brand + close */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-night-line px-4">
            <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={110} height={28} style={{ height: "auto" }} priority />
            <DialogPrimitive.Close
              className="rounded-sm p-1.5 text-night-ink-3 transition-colors hover:bg-night-2 hover:text-night-ink cursor-pointer"
              aria-label={t("nav.chrome.closeNavigation")}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Nav — same sections and permission filtering as the desktop sidebar */}
          <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t("nav.aria.primary")}>
            {NAV_SECTIONS.map((section) => {
              const visible = section.items.filter((item) => !item.anyPermission || canAny(item.anyPermission));
              if (visible.length === 0) return null;
              return (
                <div key={section.labelKey} className="mb-4">
                  <p className="eyebrow-night px-2.5 pb-1.5">{t(`nav.section.${section.labelKey}`)}</p>
                  <ul className="space-y-0.5">
                    {visible.map((item) => {
                      const active = navIsActive(item.href, pathname);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13.5px] transition-colors duration-100",
                              active
                                ? "bg-night-3 text-night-ink font-medium"
                                : "text-night-ink-2 hover:bg-night-2 hover:text-night-ink",
                            )}
                          >
                            {active ? (
                              <span aria-hidden className="absolute start-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-signal" />
                            ) : null}
                            <item.icon
                              className={cn("size-4 shrink-0", active ? "text-night-ink" : "text-night-ink-3")}
                              aria-hidden
                            />
                            <span className="truncate">{t(`nav.item.${item.labelKey}`)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Branch picker — the topbar control is hidden below md, so phones
              would otherwise have no way to scope the workspace. */}
          {session ? (
            <div className="shrink-0 border-t border-night-line p-3 md:hidden">
              {canPickBranch ? (
                <Select
                  value={session.activeBranchId ?? "all"}
                  onValueChange={(v) => setBranch(v === "all" ? undefined : v)}
                >
                  <SelectTrigger sizeVariant="sm" className="w-full" aria-label={t("nav.aria.activeBranch")}>
                    <div className="flex items-center gap-2 truncate">
                      <Building2 className="size-3.5 text-ink-3 shrink-0" aria-hidden />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.label.allBranches")}</SelectItem>
                    {session.branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="flex items-center gap-2 px-1 text-[12.5px] text-night-ink-2">
                  <Building2 className="size-3.5 text-night-ink-3" aria-hidden />
                  {session.branches.find((b) => b.id === session.activeBranchId)?.name ?? session.branches[0]?.name}
                </p>
              )}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
