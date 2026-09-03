"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { BadgeDollarSign, Building2, CircleHelp, ClipboardList, CreditCard, ExternalLink, FileSignature, LayoutDashboard, LogOut, Menu, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { AuthTransition } from "@/components/auth/auth-transition";
import { Input } from "@/components/ui/input";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { NotificationCenter } from "@/components/shell/notification-center";

const NAVIGATION = [
  { href: "/platform", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/platform/applications", label: "Applications", icon: ClipboardList },
  { href: "/platform/gyms", label: "Gyms", icon: Building2 },
  { href: "/platform/subscriptions", label: "Pricing & entitlements", icon: BadgeDollarSign },
  { href: "/platform/billing", label: "Billing", icon: CreditCard },
  { href: "/platform/agreements", label: "Agreements", icon: FileSignature },
  { href: "/platform/support", label: "Support", icon: CircleHelp },
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const { signOut: signOutClerk } = useClerk();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { platformAdminSignedIn, previewSessionReady, experienceReady, experienceError, experienceStatus, retryExperience, signOutPlatformAdmin } = useExperience();
  const identity = useRivetIdentity();
  const identityReady =
    DEMO_AUTH_BYPASS || (clerkLoaded && identity.status !== "loading" && identity.status !== "pending");
  const identitySignedIn = DEMO_AUTH_BYPASS || clerkSignedIn;
  // Authorization comes from the Convex record, so flipping the local
  // sessionStorage flag by hand does not open the console.
  const authorized = DEMO_AUTH_BYPASS || identity.platformAdmin;
  const administratorName = identity.fullName?.trim() || identity.email?.trim() || "Platform administrator";
  const administratorInitials = initialsOf(administratorName);

  // The console is reachable only through the hidden administrator sign-in.
  useEffect(() => {
    if (identityReady && previewSessionReady && experienceReady && (!identitySignedIn || !authorized || !platformAdminSignedIn))
      router.replace("/login");
  }, [authorized, experienceReady, identityReady, identitySignedIn, platformAdminSignedIn, previewSessionReady, router]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (!DEMO_AUTH_BYPASS) await signOutClerk({ redirectUrl: "/login" });
      signOutPlatformAdmin();
      router.replace("/login");
    } catch {
      setSigningOut(false);
    }
  };

  if (signingOut) return <AuthTransition title="Signing you out" detail="Returning to secure sign in…" />;

  if (experienceStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-5">
        <ErrorState title="The platform console could not load" description={experienceError} onRetry={retryExperience} className="w-full max-w-md" />
      </div>
    );
  }

  if (!identityReady || !previewSessionReady || !experienceReady || !identitySignedIn || !authorized || !platformAdminSignedIn) {
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
          <PlatformSearch />
          <div className="ms-auto flex items-center gap-3">
            <NotificationCenter />
            <div className="hidden text-end sm:block">
              <p className="text-[12px] font-semibold">{administratorName}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">Platform owner</p>
            </div>
            <span
              className="flex size-8 items-center justify-center rounded-full bg-ink font-mono text-[9px] text-paper"
              aria-label={`${administratorName} avatar`}
            >
              {administratorInitials}
            </span>
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
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink"
        >
          <ExternalLink className="size-4" /> Public site
        </Link>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-[12px] text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink"
        >
          <Building2 className="size-4" /> Gym workspace
        </Link>
      </div>
    </>
  );
}

type PlatformSearchResult = {
  id: string;
  label: string;
  detail: string;
  href: string;
};

function platformSearchOptionId(resultId: string): string {
  return `platform-search-option-${resultId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Platform-wide search is intentionally small and deterministic: it searches
 * the records already present in the live platform snapshot and routes to the
 * owning operational surface. This keeps the header useful without inventing
 * a second search API or claiming results that are not loaded yet.
 */
function PlatformSearch() {
  const router = useRouter();
  const { platformSnapshot } = useExperience();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLowerCase();

  const results = useMemo<PlatformSearchResult[]>(() => {
    if (!normalized) return [];

    const navigation = NAVIGATION
      .filter((item) => `${item.label} ${item.href}`.toLowerCase().includes(normalized))
      .map((item) => ({ id: `navigation:${item.href}`, label: item.label, detail: "Platform section", href: item.href }));
    const gyms = (platformSnapshot?.gyms ?? [])
      .filter((gym) => `${gym.name} ${gym.shortName} ${gym.rivetPlan} ${gym.subscriptionStatus}`.toLowerCase().includes(normalized))
      .map((gym) => ({ id: `gym:${gym.id}`, label: gym.name, detail: `Gym · ${gym.subscriptionStatus.replaceAll("_", " ")}`, href: `/platform/gyms/${gym.id}` }));
    const applications = (platformSnapshot?.applications ?? [])
      .filter((application) => `${application.gymName} ${application.ownerName} ${application.email} ${application.plan} ${application.status}`.toLowerCase().includes(normalized))
      .map((application) => ({ id: `application:${application.id}`, label: application.gymName, detail: `Application · ${application.status.replaceAll("_", " ")}`, href: `/platform/applications?application=${application.id}` }));
    const invoices = (platformSnapshot?.invoices ?? [])
      .filter((invoice) => `${invoice.id} ${invoice.gym} ${invoice.status}`.toLowerCase().includes(normalized))
      .map((invoice) => ({ id: `invoice:${invoice.id}`, label: invoice.id, detail: `Invoice · ${invoice.gym} · ${invoice.status.replaceAll("_", " ")}`, href: `/platform/billing?invoice=${encodeURIComponent(invoice.id)}` }));
    const supportCases = (platformSnapshot?.supportCases ?? [])
      .filter((supportCase) => `${supportCase.id} ${supportCase.gym} ${supportCase.subject} ${supportCase.status}`.toLowerCase().includes(normalized))
      .map((supportCase) => ({ id: `support:${supportCase.id}`, label: supportCase.subject, detail: `Support · ${supportCase.gym} · ${supportCase.status}`, href: `/platform/support?case=${encodeURIComponent(supportCase.id)}` }));

    return [...navigation, ...gyms, ...applications, ...invoices, ...supportCases].slice(0, 8);
  }, [normalized, platformSnapshot]);

  useEffect(() => {
    if (!open || results.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((current) => current >= 0 && current < results.length ? current : 0);
  }, [open, results]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const navigate = (href: string) => {
    setOpen(false);
    setActiveIndex(-1);
    setQuery("");
    router.push(href);
  };

  const activeResult = activeIndex >= 0 ? results[activeIndex] : undefined;

  return (
    <div ref={rootRef} className="relative hidden max-w-md flex-1 md:block">
      <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
      <Input
        className="ps-9"
        placeholder="Search gyms, invoices, or support cases"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(Boolean(event.target.value.trim())); }}
        onFocus={() => setOpen(Boolean(normalized))}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (event.key === "ArrowDown" && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => current < results.length - 1 ? current + 1 : 0);
            return;
          }
          if (event.key === "ArrowUp" && results.length) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => current > 0 ? current - 1 : results.length - 1);
            return;
          }
          if (event.key === "Home" && results.length) {
            event.preventDefault();
            setActiveIndex(0);
            return;
          }
          if (event.key === "End" && results.length) {
            event.preventDefault();
            setActiveIndex(results.length - 1);
            return;
          }
          const selectedResult = activeResult ?? results[0];
          if (event.key === "Enter" && selectedResult) {
            event.preventDefault();
            navigate(selectedResult.href);
          }
        }}
        aria-label="Search platform records"
        role="combobox"
        aria-expanded={open}
        aria-controls="platform-search-results"
        aria-autocomplete="list"
        aria-activedescendant={activeResult ? platformSearchOptionId(activeResult.id) : undefined}
      />
      {open && normalized ? (
        <div id="platform-search-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-dialog">
          {platformSnapshot ? results.length ? results.map((result, index) => (
            <button
              key={result.id}
              type="button"
              role="option"
              id={platformSearchOptionId(result.id)}
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => navigate(result.href)}
              className={cn("w-full rounded-sm px-3 py-2.5 text-start transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none", index === activeIndex && "bg-sunken")}
            >
              <span className="block truncate text-[12px] font-medium">{result.label}</span>
              <span className="mt-0.5 block truncate text-[10px] text-ink-3">{result.detail}</span>
            </button>
          )) : <p className="px-3 py-3 text-[11px] text-ink-3" role="status">No matching platform records.</p> : <p className="px-3 py-3 text-[11px] text-ink-3" role="status">Loading platform records…</p>}
        </div>
      ) : null}
    </div>
  );
}
