"use client";

import { useClerk } from "@clerk/nextjs";
import { Beaker, Building2, Check, ChevronDown, ExternalLink, Languages, LogOut, Menu, RotateCcw, Search, UserRound, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { useApp } from "@/lib/providers/app-providers";
import type { RoleKey } from "@/lib/domain/types";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Monogram } from "@/components/ui/misc";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { CommandPalette } from "./command-palette";

const DEMO_ROLES: Array<{ role: RoleKey; blurb: string }> = [
  { role: "owner", blurb: "Full visibility — every branch, finance, audit, settings." },
  { role: "manager", blurb: "Operations control — approvals, reconciliation, teams." },
  { role: "salesperson", blurb: "Pipeline, queues, follow-ups and conversions." },
  { role: "receptionist", blurb: "Front desk console — lookup, check-in, collect." },
];

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { session, setBranch, toggleDir, dir, signOut, switchRole, behavior, setBehavior, resetDemo } = useApp();
  const { signOut: signOutClerk } = useClerk();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const router = useRouter();

  const role = session?.roles[0];
  const canPickBranch = role === "owner" || role === "manager" || role === "auditor";
  const demoControlsEnabled = DEMO_AUTH_BYPASS || !CONVEX_ENABLED;

  const handleSignOut = async () => {
    await signOut();
    if (!DEMO_AUTH_BYPASS) await signOutClerk({ redirectUrl: "/" });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper/90 px-3 backdrop-blur-sm sm:gap-3 sm:px-4">
      {/* Navigation drawer — below lg the sidebar is hidden */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobileNav}
        className="-ms-1.5 lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu />
      </Button>

      {/* Search */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-8 w-full max-w-72 min-w-0 items-center gap-2 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] text-ink-3 transition-colors hover:border-line-3 hover:text-ink-2 cursor-pointer"
        aria-label="Search members, leads and pages"
      >
        <Search className="size-3.5" aria-hidden />
        <span className="flex-1 text-start truncate">Search…</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded-sm border border-line bg-paper px-1 font-mono text-[10px] text-ink-3">
          ⌘K
        </kbd>
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Branch picker */}
      {session ? (
        canPickBranch ? (
          <Select
            value={session.activeBranchId ?? "all"}
            onValueChange={(v) => setBranch(v === "all" ? undefined : v)}
          >
            <SelectTrigger sizeVariant="sm" className="w-44 hidden md:flex" aria-label="Active branch">
              <div className="flex items-center gap-2 truncate">
                <Building2 className="size-3.5 text-ink-3 shrink-0" aria-hidden />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {session.branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="hidden md:inline-flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 h-8 text-[12.5px] text-ink-2">
            <Building2 className="size-3.5 text-ink-3" aria-hidden />
            {session.branches.find((b) => b.id === session.activeBranchId)?.name ??
              session.branches[0]?.name}
          </span>
        )
      ) : null}

      <div className="flex-1" />

      {/* RTL toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={toggleDir}
        aria-label={dir === "rtl" ? "Switch to left-to-right" : "Preview right-to-left (Arabic)"}
        aria-pressed={dir === "rtl"}
        className={cn(dir === "rtl" && "bg-sunken text-ink")}
      >
        <Languages />
      </Button>

      {/* Preview-only controls never appear in a real Clerk + Convex deployment. */}
      {demoControlsEnabled ? <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Demo controls"
            className={cn((behavior.failNextRequest || behavior.forceEmptyLists || behavior.latencyMs !== 120) && "text-signal")}
          >
            <Beaker />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="border-b border-line px-4 py-3">
            <p className="font-display text-[14px] font-semibold">Demo controls</p>
            <p className="text-[12px] text-ink-3">Preview states a real deployment would show.</p>
          </div>
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium">Simulated latency</p>
                <p className="text-[12px] text-ink-3">How slow the network feels.</p>
              </div>
              <Select
                value={String(behavior.latencyMs)}
                onValueChange={(v) => setBehavior({ latencyMs: Number(v) })}
              >
                <SelectTrigger sizeVariant="sm" className="w-24" aria-label="Latency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  <SelectItem value="120">Normal</SelectItem>
                  <SelectItem value="700">Slow</SelectItem>
                  <SelectItem value="1600">Painful</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-[13px] font-medium">Fail next request</p>
                <p className="text-[12px] text-ink-3">The next API call returns an error.</p>
              </div>
              <Switch
                checked={behavior.failNextRequest}
                onCheckedChange={(v) => setBehavior({ failNextRequest: v })}
                aria-label="Fail next request"
              />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-[13px] font-medium">Force empty lists</p>
                <p className="text-[12px] text-ink-3">Every list renders its empty state.</p>
              </div>
              <Switch
                checked={behavior.forceEmptyLists}
                onCheckedChange={(v) => setBehavior({ forceEmptyLists: v })}
                aria-label="Force empty lists"
              />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-[13px] font-medium">RTL preview (Arabic)</p>
                <p className="text-[12px] text-ink-3">Flip layout direction.</p>
              </div>
              <Switch checked={dir === "rtl"} onCheckedChange={toggleDir} aria-label="RTL preview" />
            </label>
          </div>
          <div className="border-t border-line px-4 py-3">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              loading={resetting}
              onClick={async () => {
                setResetting(true);
                await resetDemo();
                setResetting(false);
                toast.success("Demo data reset to the canonical seed.");
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset demo data
            </Button>
          </div>
        </PopoverContent>
      </Popover> : null}

      {/* User */}
      {session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sunken cursor-pointer"
              aria-label="Account menu"
            >
              <Monogram name={session.user.name} size="sm" />
              <span className="hidden lg:block text-start leading-tight">
                <span className="block text-[13px] font-medium text-ink">{session.user.name}</span>
                <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  {role ? ROLE_LABELS[role] : ""}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-ink-3 hidden lg:block" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Signed in as {session.user.email}</DropdownMenuLabel>
            {demoControlsEnabled ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <UsersRound className="size-3" /> Switch demo role
                </DropdownMenuLabel>
                {DEMO_ROLES.map((d) => (
                  <DropdownMenuItem key={d.role} onClick={() => switchRole(d.role)} className="flex items-start gap-2">
                    <span className="mt-0.5 size-4 shrink-0">
                      {role === d.role ? <Check className="size-3.5 text-success" /> : <UserRound className="size-3.5" />}
                    </span>
                    <span>
                      <span className="block font-medium">{ROLE_LABELS[d.role]}</span>
                      <span className="block text-[11.5px] text-ink-3">{d.blurb}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Building2 /> Organization settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/")}>
              <ExternalLink /> Public site
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              <LogOut /> {demoControlsEnabled ? "Sign out of demo" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}
