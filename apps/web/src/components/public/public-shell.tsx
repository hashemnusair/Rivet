"use client";

import { useClerk } from "@clerk/nextjs";
import { ChevronDown, GraduationCap, Home, LogOut, MessageSquare, ReceiptText, Search, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthTransition } from "@/components/auth/auth-transition";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Monogram } from "@/components/ui/misc";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { MemberPwaManager } from "@/components/pwa/member-pwa";

// ---------------------------------------------------------------------------
// Member shell — the signed-in member area; signed out, the marketplace and a
// gym's page are public-site pages and wear the site's chrome instead.
// ---------------------------------------------------------------------------
const MEMBER_NAV = [
  { href: "/customer/my-gyms", label: "Home", shortLabel: "Home", icon: Home, requiresAuth: true },
  { href: "/customer/finance", label: "Payments", shortLabel: "Payments", icon: ReceiptText, requiresAuth: true },
  { href: "/customer/discover", label: "Explore gyms", shortLabel: "Explore", icon: Search, requiresAuth: false },
];

const PROTECTED_MEMBER_PREFIXES = ["/customer/my-gyms", "/customer/finance", "/customer/receipts", "/customer/profile", "/customer/getting-started"];

function isProtectedMemberRoute(pathname: string) {
  return PROTECTED_MEMBER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * One account menu for the desktop header and the phone dock. Everything the
 * navigation already offers stays out of it, so the menu is only what a member
 * cannot reach elsewhere: profile, the guide, communication choices, sign out.
 */
function AccountMenuItems({ name, email, onSignOut, touch = false }: { name: string; email: string; onSignOut: () => void; touch?: boolean }) {
  const itemClass = touch ? "min-h-11 py-2.5 text-[13.5px]" : undefined;
  return (
    <>
      <DropdownMenuLabel>
        <span className="block text-[13px] font-semibold text-ink">{name}</span>
        <span className="mt-0.5 block truncate text-[12px] font-normal text-ink-3">{email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className={itemClass}>
        <Link href="/customer/profile"><UserRound /> Profile</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={itemClass}>
        <Link href="/customer/getting-started"><GraduationCap /> Getting started</Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={itemClass}>
        <Link href="/customer/profile#communication"><MessageSquare /> Communication settings</Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className={itemClass} onClick={onSignOut}>
        <LogOut /> Sign out
      </DropdownMenuItem>
    </>
  );
}

export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useApp();
  const { customerSignedIn, platformAdminSignedIn, signOutCustomer } = useExperience();
  const identity = useRivetIdentity();
  const { signOut: signOutClerk } = useClerk();
  const customer = useCustomerPersona();
  const [signingOut, setSigningOut] = useState(false);
  const nav = MEMBER_NAV.filter((item) => customerSignedIn || !item.requiresAuth);

  const protectedMemberRoute = isProtectedMemberRoute(pathname);
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

  if (signingOut) return <AuthTransition title="Signing you out" detail="Returning to secure sign in…" />;
  if (elevatedDestination) return <AuthTransition title="Opening your workspace" detail="Taking you to the right RIVET area…" />;

  // A visitor who is not signed in as a member is on the public site: the
  // marketplace and a gym's page wear the site's own bar and footer, with the
  // member door and account creation where the site otherwise offers the
  // gym application.
  if (!customerSignedIn) {
    return (
      <PublicDocumentPage path={pathname} audience="member">
        {children}
      </PublicDocumentPage>
    );
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="member-app-shell flex min-h-dvh flex-col bg-paper sm:pb-0">
      <MemberPwaManager />
      <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/customer/my-gyms" className="flex shrink-0 items-center gap-3" aria-label="RIVET">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={112} height={29} priority />
            <span className="hidden border-s border-line-2 ps-3 text-[12px] font-medium text-ink-3 sm:block">
              Member
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Member navigation">
            {nav.map((item) => {
              const active = isActive(item.href);
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
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-2">
            {customer ? (
              <div className="hidden sm:block">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sunken"
                      aria-label="Open account menu"
                    >
                      <Monogram name={customer.name} size="sm" />
                      <span className="hidden text-[13px] font-medium text-ink md:block">{customer.name}</span>
                      <ChevronDown className="hidden size-3.5 text-ink-3 md:block" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <AccountMenuItems name={customer.name} email={customer.email} onSignOut={() => void handleSignOut()} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {customer ? <OnboardingBanner audience="member" /> : null}

      <div className="flex-1">{children}</div>

      {customer ? (
        <nav
          className="member-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-line bg-paper/95 backdrop-blur-sm sm:hidden"
          aria-label="Member navigation"
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-4 px-3">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-md text-[12px] font-medium transition-colors",
                    active ? "text-ink" : "text-ink-3",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={cn("flex h-8 w-11 items-center justify-center rounded-md", active && "bg-sunken")}>
                    <item.icon className="size-[18px]" aria-hidden />
                  </span>
                  <span>{item.shortLabel}</span>
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn("flex flex-col items-center justify-center gap-1 rounded-md text-[12px] font-medium transition-colors", isActive("/customer/profile") || isActive("/customer/getting-started") ? "text-ink" : "text-ink-3")}
                  aria-label="Open account menu"
                >
                  <span className={cn("flex h-8 w-11 items-center justify-center rounded-md", (isActive("/customer/profile") || isActive("/customer/getting-started")) && "bg-sunken")}>
                    <UserRound className="size-[18px]" aria-hidden />
                  </span>
                  <span>Account</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" sideOffset={10} className="w-64">
                <AccountMenuItems name={customer.name} email={customer.email} onSignOut={() => void handleSignOut()} touch />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
