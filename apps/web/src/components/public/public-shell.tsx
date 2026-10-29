"use client";
import { useT } from "@/lib/i18n/provider";


import { useAuth, useClerk } from "@clerk/nextjs";
import { Home, ReceiptText, Search, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useState, type ReactNode } from "react";
import { AuthTransition } from "@/components/auth/auth-transition";
import { WorkspaceCurtain } from "@/components/motion/workspace-curtain";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { Monogram } from "@/components/ui/misc";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { MemberPwaManager } from "@/components/pwa/member-pwa";
import { MemberAppProvider, MemberAppReminder } from "@/components/pwa/member-app";
import { BetaBadge } from "@/components/shared/beta-badge";
import { MEMBER_ACCOUNT_HREF, MemberSignOutProvider } from "./member-account";
import { memberAppOpening } from "./member-launch";
import { useMemberTabs } from "./member-tabs";

// ---------------------------------------------------------------------------
// Member shell — the signed-in member area; signed out, the marketplace and a
// gym's page are public-site pages and wear the site's chrome instead.
// ---------------------------------------------------------------------------
const MEMBER_NAV = [
  { href: "/customer/my-gyms", labelKey: "publicCompletion.memberShell.home", shortLabelKey: "publicCompletion.memberShell.home", icon: Home, requiresAuth: true },
  { href: "/customer/finance", labelKey: "publicCompletion.memberShell.payments", shortLabelKey: "publicCompletion.memberShell.payments", icon: ReceiptText, requiresAuth: true },
  { href: "/customer/discover", labelKey: "publicCompletion.memberShell.exploreGyms", shortLabelKey: "publicCompletion.memberShell.explore", icon: Search, requiresAuth: false },
] as const;

/** The dock's last tab: the member's profile, with the rest of the account behind its ⋯. */
const ACCOUNT_TAB = { href: MEMBER_ACCOUNT_HREF, labelKey: "marketing.memberShell.account", shortLabelKey: "marketing.memberShell.account", icon: UserRound, requiresAuth: true } as const;

const PROTECTED_MEMBER_PREFIXES = ["/customer/my-gyms", "/customer/finance", "/customer/receipts", MEMBER_ACCOUNT_HREF, "/customer/getting-started"];

function isProtectedMemberRoute(pathname: string) {
  return PROTECTED_MEMBER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useApp();
  const { customerSignedIn, experienceStatus, platformAdminSignedIn, previewSessionReady, signOutCustomer } = useExperience();
  const identity = useRivetIdentity();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const { signOut: signOutClerk } = useClerk();
  const customer = useCustomerPersona();
  const [signingOut, setSigningOut] = useState(false);
  const nav = MEMBER_NAV.filter((item) => customerSignedIn || !item.requiresAuth);
  const tabs = useMemberTabs(pathname, Boolean(customerSignedIn && customer));

  const protectedMemberRoute = isProtectedMemberRoute(pathname);
  const signedOut = !DEMO_AUTH_BYPASS && clerkLoaded && !clerkSignedIn;
  const opening = memberAppOpening({ protectedRoute: protectedMemberRoute, previewSessionReady, customerSignedIn, signedOut, identity, experienceStatus });
  const identityDestination = identity.status === "ready" ? destinationFor(identity) : undefined;
  const mockGymRole = DEMO_AUTH_BYPASS ? session?.roles[0] : undefined;
  const elevatedDestination = protectedMemberRoute
    ? platformAdminSignedIn || identity.platformAdmin
      ? "/platform"
      : identityDestination && identityDestination.area !== "member"
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

  // The member's own pages are not mounted while the app opens, so their own
  // sign-in redirect cannot run; the shell sends a signed-out visitor on.
  useEffect(() => {
    if (protectedMemberRoute && signedOut && !customerSignedIn) router.replace("/login");
  }, [customerSignedIn, protectedMemberRoute, router, signedOut]);

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

  if (signingOut) return <AuthTransition title={t("marketing.memberShell.signingOut")} detail={t("publicCompletion.memberShell.returningToSignIn")} />;
  if (elevatedDestination) return <AuthTransition title={t("publicCompletion.memberShell.openingAccount")} detail={t("publicCompletion.memberShell.openingDetail")} />;

  // Opening the app (from the home screen, or a cold load of a member page):
  // the mark on plain paper until the member is known, then the paper fades
  // off the page. The curtain stays the second child throughout, so React
  // keeps it and it lifts off whatever replaced the wait. Nothing under it is
  // mounted while it waits: a cold preview restores its member after
  // hydration, and mounting the public layout first would replace the page
  // then, discarding an early tap or input focus along with its subtree.
  const curtain = <WorkspaceCurtain ready={!opening} label={t("publicCompletion.memberShell.loading")} launch />;
  if (opening) return <>{null}{curtain}</>;

  // A visitor who is not signed in as a member is on the public site: the
  // marketplace and a gym's page wear the site's own bar and footer, with the
  // member door and account creation where the site otherwise offers the
  // gym application.
  if (!customerSignedIn) {
    return (
      <>
        <MemberAppProvider>
          <PublicDocumentPage path={pathname} audience="member">
            {children}
          </PublicDocumentPage>
        </MemberAppProvider>
        {curtain}
      </>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // The guide is reached from the account's menu, so it stays under Account.
  const dockActive = tabs.activeHref ?? (isActive("/customer/getting-started") ? MEMBER_ACCOUNT_HREF : undefined);
  const dock = customer ? [...nav, ACCOUNT_TAB] : nav;

  return (
    <>
    <MemberSignOutProvider value={() => void handleSignOut()}>
    <MemberAppProvider>
    <div className="member-app-shell flex min-h-dvh flex-col bg-paper sm:pb-0">
      <MemberPwaManager />
      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/customer/my-gyms" className="flex shrink-0 items-center gap-3" aria-label={t("common.brand.name")}>
            <span className="flex items-center gap-2">
              <Image src="/brand/rivet-lockup-488.png" alt={t("common.brand.name")} width={112} height={29} priority />
              <BetaBadge />
            </span>
            <span className="hidden border-s border-line-2 ps-3 text-[12px] font-medium text-ink-3 sm:block">{t("marketing.memberShell.member")}</span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label={t("marketing.memberShell.navigation")}>
            {nav.map((item) => {
              const active = tabs.activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  scroll={false}
                  onClick={(event) => tabs.press(item.href, event)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                    active ? "bg-sunken text-ink" : "text-ink-3 hover:bg-sunken/60 hover:text-ink",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="size-3.5" aria-hidden />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {customer ? (
              <Link
                href={MEMBER_ACCOUNT_HREF}
                prefetch
                className={cn(
                  "hidden items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sunken sm:flex",
                  dockActive === MEMBER_ACCOUNT_HREF && "bg-sunken",
                )}
                aria-current={isActive(MEMBER_ACCOUNT_HREF) ? "page" : undefined}
              >
                <span className="sr-only">{t("marketing.memberShell.account")}</span>
                <Monogram name={customer.name} size="sm" />
                <span className="hidden text-[13px] font-medium text-ink md:block">{customer.name}</span>
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {customer ? <MemberAppReminder /> : null}
      {customer ? <OnboardingBanner audience="member" /> : null}

      <div className="flex-1">{children}</div>

      {customer ? (
        <nav
          className="member-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/95 backdrop-blur-sm sm:hidden"
          aria-label={t("marketing.memberShell.navigation")}
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-4 px-3">
            {dock.map((item) => {
              // Lit the moment it is tapped; aria-current follows the page itself.
              const active = dockActive === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  scroll={false}
                  onClick={(event) => tabs.press(item.href, event)}
                  data-active={active}
                  data-pop={tabs.pressed === item.href}
                  className={cn("member-tab flex flex-col items-center justify-center gap-1 text-[12px]", active ? "font-semibold text-ink" : "font-medium text-ink-3")}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  <item.icon className="member-tab-icon size-[22px]" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  <span>{t(item.shortLabelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
    </MemberAppProvider>
    </MemberSignOutProvider>
    {curtain}
    </>
  );
}
