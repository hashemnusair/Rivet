"use client";

import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { ArrowRight, ChevronDown, Home, LogOut, Menu, MessageSquare, Search, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AuthTransition } from "@/components/auth/auth-transition";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Monogram } from "@/components/ui/misc";
import { LanguageToggle } from "@/components/shared/language-toggle";
import { useT } from "@/lib/i18n/provider";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const MARKETING_NAV = [
  { href: "/#product", key: "product" },
  { href: "/#member", key: "forMembers" },
  { href: "/#pricing", key: "pricing" },
  { href: "/customer/discover", key: "findGym" },
] as const;

// ---------------------------------------------------------------------------
// Marketing header — the public site
// ---------------------------------------------------------------------------
export function PublicHeader() {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center" aria-label={t("marketing.nav.home")}>
          <Image src="/brand/rivet-lockup.png" alt="RIVET" width={132} height={34} style={{ height: "auto" }} priority />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label={t("marketing.nav.primary")}>
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-[13.5px] font-medium text-ink-2 transition-colors hover:text-ink",
                pathname === item.href && "text-ink",
              )}
            >
              {t(`marketing.nav.${item.key}`)}
            </Link>
          ))}
        </nav>

        {/* Sign-in lives at /login and nowhere else — no modal, so there is one
            place to authenticate and one place that decides which portal. */}
        <div className="hidden min-w-[246px] items-center justify-end gap-2 lg:flex">
          <LanguageToggle />
          {DEMO_AUTH_BYPASS ? <PreviewMarketingSignedOutActions /> : <ClerkMarketingActions />}
        </div>

        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((value) => !value)} aria-label={t("marketing.nav.toggleNav")}>
          {open ? <X /> : <Menu />}
        </Button>
      </div>

      {open ? (
        <div className="border-t border-line bg-paper px-5 py-4 lg:hidden">
          <nav className="grid gap-0.5" aria-label={t("marketing.nav.mobile")}>
            {MARKETING_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-[14px] font-medium hover:bg-sunken"
              >
                {t(`marketing.nav.${item.key}`)}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid gap-2 border-t border-line pt-3">
            <LanguageToggle variant="secondary" className="w-full justify-center" />
            {DEMO_AUTH_BYPASS ? <PreviewMarketingSignedOutActions mobile onClose={() => setOpen(false)} /> : <ClerkMarketingActions mobile onClose={() => setOpen(false)} />}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function PreviewMarketingSignedOutActions({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const t = useT();
  return (
    <>
      <Button asChild variant={mobile ? "secondary" : "ghost"} size={mobile ? "default" : "sm"} onClick={onClose}>
        <Link href="/login">{t("marketing.actions.signIn")}</Link>
      </Button>
      <Button asChild variant="signal" size={mobile ? "default" : "sm"} onClick={onClose}>
        <Link href="/signup">{mobile ? t("marketing.actions.applyShort") : <>{t("marketing.actions.applyShort")} <ArrowRight /></>}</Link>
      </Button>
    </>
  );
}

function ClerkMarketingActions({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const t = useT();
  const { isLoaded, isSignedIn } = useAuth();
  const identity = useRivetIdentity();

  // Paint the public actions on the server and first client frame. Clerk's
  // previous <Show> boundary painted nothing until hydration, which pulled the
  // entire navbar sideways on every refresh.
  if (!isLoaded || !isSignedIn) {
    return <MarketingSignedOutActions mobile={mobile} onClose={onClose} />;
  }

  const resolving = identity.status === "loading" || identity.status === "pending";
  const destination = identity.status === "ready" ? destinationFor(identity).href : "/login";

  if (mobile) {
    return (
      <>
        <Button asChild={!resolving} variant="signal" onClick={onClose} disabled={resolving}>
          {resolving ? <span>{t("marketing.actions.preparingAccountLong")}</span> : <Link href={destination}>{t("marketing.actions.openRivet")}</Link>}
        </Button>
        <div className="flex justify-center py-2">
          <UserButton />
        </div>
      </>
    );
  }

  return (
    <>
      <Button asChild={!resolving} variant="signal" size="sm" disabled={resolving}>
        {resolving ? (
          <span>{t("marketing.actions.preparingAccount")}</span>
        ) : (
          <Link href={destination}>
            {t("marketing.actions.openRivet")} <ArrowRight />
          </Link>
        )}
      </Button>
      <UserButton />
    </>
  );
}

function MarketingSignedOutActions({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const t = useT();
  return (
    <>
      <Button asChild variant={mobile ? "secondary" : "ghost"} size={mobile ? "default" : "sm"} onClick={onClose}>
        <Link href="/login">{t("marketing.actions.signIn")}</Link>
      </Button>
      <Button asChild variant="signal" size={mobile ? "default" : "sm"} onClick={onClose}>
        <Link href="/signup">{mobile ? t("marketing.actions.applyShort") : <>{t("marketing.actions.applyShort")} <ArrowRight /></>}</Link>
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Marketing footer — the site map lives here, so every area is one click away
// ---------------------------------------------------------------------------
export function PublicFooter() {
  const t = useT();
  return (
    <footer className="night-surface bg-night text-night-ink">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-12">
        <div>
            <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={140} height={35} style={{ height: "auto" }} />
          <p className="mt-5 max-w-xs text-[13.5px] leading-relaxed text-night-ink-2">
            {t("marketing.footer.blurb")}
          </p>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-night-ink-3">{t("marketing.footer.madeIn")}</p>
        </div>
        <FooterColumn
          title={t("marketing.footer.product")}
          links={[
            [t("marketing.footer.overview"), "/#product"],
            [t("marketing.nav.forMembers"), "/#member"],
            [t("marketing.nav.pricing"), "/#pricing"],
            [t("marketing.actions.applyShort"), "/signup"],
          ]}
        />
        <FooterColumn
          title={t("marketing.footer.members")}
          links={[
            [t("marketing.nav.findGym"), "/customer/discover"],
            [t("marketing.footer.createMemberAccount"), "/login/member/create"],
            [t("marketing.footer.myDashboard"), "/customer/my-gyms"],
          ]}
        />
        <FooterColumn
          title={t("marketing.footer.signIn")}
          links={[
            [t("marketing.actions.signInToRivet"), "/login"],
          ]}
        />
      </div>
      <div className="border-t border-night-line px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-night-ink-3">
          <span>{t("marketing.footer.copyright")}</span>
          <span>{t("common.brand.tagline")}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <nav>
      <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-night-ink-3">{title}</p>
      <div className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <Link key={href + label} href={href} className="text-[13px] text-night-ink-2 transition-colors hover:text-night-ink">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Member shell — the signed-in member area and the gym marketplace
// ---------------------------------------------------------------------------
const MEMBER_NAV = [
  { href: "/customer/my-gyms", key: "home", icon: Home, requiresAuth: true },
  { href: "/customer/discover", key: "exploreGyms", icon: Search, requiresAuth: false },
] as const;

export function CustomerShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useApp();
  const { customerSignedIn, platformAdminSignedIn, signOutCustomer } = useExperience();
  const identity = useRivetIdentity();
  const { signOut: signOutClerk } = useClerk();
  const customer = useCustomerPersona();
  const [signingOut, setSigningOut] = useState(false);
  const nav = MEMBER_NAV.filter((item) => customerSignedIn || !item.requiresAuth);

  const protectedMemberRoute = pathname === "/customer/my-gyms" || pathname.startsWith("/customer/my-gyms/") || pathname === "/customer/profile";
  const identityDestination = identity.status === "ready" ? destinationFor(identity) : undefined;
  const mockGymRole = DEMO_AUTH_BYPASS ? session?.roles[0] : undefined;
  const elevatedDestination = protectedMemberRoute
    ? platformAdminSignedIn || identity.platformAdmin
      ? "/platform"
      : identityDestination?.area === "gym"
        ? identityDestination.href
        : mockGymRole
          ? mockGymRole === "receptionist" ? "/reception" : "/dashboard"
          : undefined
    : undefined;

  // Keep the member shell from painting an administrator's old customer
  // profile for even one route transition. The protected page has its own
  // guard as well; this outer guard covers the header/footer and deep links.
  useEffect(() => {
    if (!elevatedDestination) return;
    router.replace(elevatedDestination);
  }, [elevatedDestination, router]);

  // The member shell maintains a small preview persona in sessionStorage, but
  // a deployed account is authenticated by Clerk. Clearing only the preview
  // state left the Clerk session alive, which immediately made a member appear
  // signed in again on the next guarded render.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (!DEMO_AUTH_BYPASS) await signOutClerk({ redirectUrl: "/login" });
      signOutCustomer();
      router.replace("/login");
    } catch {
      setSigningOut(false);
    }
  };

  if (signingOut) return <AuthTransition title={t("marketing.memberShell.signingOut")} detail={t("marketing.memberShell.signingOutDetail")} />;
  if (elevatedDestination) return <AuthTransition title={t("marketing.memberShell.openingWorkspace")} detail={t("marketing.memberShell.openingWorkspaceDetail")} />;

  return (
    <div className={cn("flex min-h-dvh flex-col bg-paper", customerSignedIn && "member-app-shell sm:pb-0")}>
      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link href={customerSignedIn ? "/customer/my-gyms" : "/"} className="flex shrink-0 items-center gap-3" aria-label="RIVET">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={112} height={29} style={{ height: "auto" }} priority />
            {customerSignedIn ? (
              <span className="hidden border-s border-line-2 ps-3 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-ink-3 sm:block">
                {t("marketing.memberShell.member")}
              </span>
            ) : null}
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label={t("marketing.memberShell.navigation")}>
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                    active ? "bg-sunken text-ink" : "text-ink-3 hover:bg-sunken/60 hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="size-3.5" aria-hidden />
                  <span>{t(`marketing.memberShell.${item.key}`)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle showLabel={false} />
            {customerSignedIn && customer ? (
              <div className="hidden sm:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sunken"
                      aria-label={t("marketing.memberShell.accountMenu")}
                    >
                      <Monogram name={customer.name} size="sm" />
                      <span className="hidden text-[13px] font-medium text-ink md:block">{customer.name}</span>
                      <ChevronDown className="hidden size-3.5 text-ink-3 md:block" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuLabel>
                      <span className="block text-[12.5px] font-semibold text-ink">{customer.name}</span>
                      <span className="mt-0.5 block truncate text-[10.5px] font-normal text-ink-3">{customer.email}</span>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/customer/profile">
                        <UserRound /> {t("marketing.memberShell.profile")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/customer/my-gyms#communication">
                        <MessageSquare /> {t("marketing.memberShell.communicationSettings")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void handleSignOut()}>
                      <LogOut /> {t("common.action.signOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">{t("marketing.actions.signIn")}</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/login/member/create">{t("marketing.actions.createAccount")}</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {!customerSignedIn ? (
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-5 text-[12px] text-ink-3 sm:px-6 lg:px-8">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em]">{t("marketing.footer.copyrightShort")}</span>
            <nav className="flex flex-wrap items-center gap-5">
              <Link href="/" className="transition-colors hover:text-ink">{t("marketing.footer.rivetForGyms")}</Link>
              <Link href="/customer/discover" className="transition-colors hover:text-ink">{t("marketing.nav.findGym")}</Link>
            </nav>
          </div>
        </footer>
      ) : null}

      {customerSignedIn && customer ? (
        <nav
          className="member-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/95 backdrop-blur-md sm:hidden"
          aria-label={t("marketing.memberShell.navigation")}
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-3 px-3">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors",
                    active ? "text-ink" : "text-ink-3",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={cn("flex size-8 items-center justify-center rounded-md", active && "bg-sunken")}>
                    <item.icon className="size-[17px]" aria-hidden />
                  </span>
                  <span>{item.key === "exploreGyms" ? t("marketing.memberShell.explore") : t("marketing.memberShell.home")}</span>
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-ink-3" aria-label={t("marketing.memberShell.accountMenu")}>
                  <span className="flex size-8 items-center justify-center rounded-md">
                    <UserRound className="size-[17px]" aria-hidden />
                  </span>
                  <span>{t("marketing.memberShell.account")}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-64">
                <DropdownMenuLabel>
                  <span className="block text-[12.5px] font-semibold text-ink">{customer.name}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-normal text-ink-3">{customer.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/customer/profile">
                    <UserRound /> {t("marketing.memberShell.profile")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/customer/my-gyms#communication">
                    <MessageSquare /> {t("marketing.memberShell.communicationSettings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleSignOut()}>
                  <LogOut /> {t("common.action.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
