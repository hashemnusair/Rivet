"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import {
  BadgeDollarSign,
  Building2,
  CircleHelp,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const NAVIGATION = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform/gyms", label: "Gyms", icon: Building2 },
  { href: "/platform/subscriptions", label: "Subscriptions", icon: BadgeDollarSign },
  { href: "/platform/billing", label: "Billing", icon: CreditCard },
  { href: "/platform/support", label: "Support", icon: CircleHelp },
];

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const { signOut: signOutClerk } = useClerk();
  const [open, setOpen] = useState(false);
  const { platformAdminSignedIn, experienceReady, signOutPlatformAdmin } = useExperience();
  const identity = useRivetIdentity();
  const identityReady =
    DEMO_AUTH_BYPASS || (clerkLoaded && identity.status !== "loading" && identity.status !== "pending");
  const identitySignedIn = DEMO_AUTH_BYPASS || clerkSignedIn;
  // Authorization comes from the Convex record, so flipping the local
  // sessionStorage flag by hand does not open the console.
  const authorized = DEMO_AUTH_BYPASS || identity.platformAdmin;

  // The console is reachable only through the hidden administrator sign-in.
  useEffect(() => {
    if (identityReady && experienceReady && (!identitySignedIn || !authorized || !platformAdminSignedIn))
      router.replace("/login/admin");
  }, [authorized, experienceReady, identityReady, identitySignedIn, platformAdminSignedIn, router]);

  const signOut = async () => {
    signOutPlatformAdmin();
    if (!DEMO_AUTH_BYPASS) await signOutClerk({ redirectUrl: "/" });
    else router.push("/");
  };

  if (!identityReady || !experienceReady || !identitySignedIn || !authorized || !platformAdminSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper" role="status" aria-label="Checking access">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sunken lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="night-surface fixed inset-y-0 start-0 z-50 hidden w-[236px] flex-col border-e border-night-line bg-night text-night-ink lg:flex">
        <PlatformSidebar pathname={pathname} onNavigate={() => setOpen(false)} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/45 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="night-surface flex h-full w-[278px] flex-col bg-night text-night-ink" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end p-3">
              <Button variant="night-ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close navigation">
                <X />
              </Button>
            </div>
            <PlatformSidebar pathname={pathname} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:col-start-2">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
            <Input className="ps-9" placeholder="Search gyms, invoices, or support cases" />
          </div>
          <div className="ms-auto flex items-center gap-3">
            <div className="hidden text-end sm:block">
              <p className="text-[12px] font-semibold">Elias Hreish</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">Platform owner</p>
            </div>
            <span className="flex size-8 items-center justify-center rounded-full bg-ink font-mono text-[9px] text-paper">EH</span>
            <Button variant="ghost" size="icon-sm" onClick={() => void signOut()} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function PlatformSidebar({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <>
      <div className="px-5 pb-7 pt-5">
        <Link href="/platform" onClick={onNavigate} className="flex items-center gap-3">
          <Image src="/brand/rivet-lockup-rev.png" width={122} height={31} alt="RIVET" />
          <span className="border-s border-night-line ps-3 font-mono text-[8px] uppercase tracking-[0.14em] text-night-ink-3">Platform</span>
        </Link>
      </div>
      <nav className="flex-1 px-3" aria-label="Platform navigation">
        <p className="px-3 pb-2 font-mono text-[8px] uppercase tracking-[0.18em] text-night-ink-3">Network control</p>
        <div className="grid gap-1">
          {NAVIGATION.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-[12.5px] text-night-ink-2 transition-colors hover:bg-night-3 hover:text-night-ink",
                  active && "bg-night-3 text-night-ink",
                )}
              >
                <item.icon className={cn("size-4", active && "text-signal")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="border-t border-night-line p-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink"
        >
          <ExternalLink className="size-4" /> Public site
        </Link>
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink"
        >
          <Building2 className="size-4" /> Gym workspace
        </Link>
      </div>
    </>
  );
}
