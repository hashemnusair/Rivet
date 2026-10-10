"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Gauge,
  LogOut,
  QrCode,
  ScanLine,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { safeInternalRedirect } from "@/lib/routing/host-routing";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/misc";
import { useLocale, useT } from "@/lib/i18n/provider";
import { roleLabel } from "@/lib/i18n/labels";
import type { RoleKey } from "@/lib/domain/types";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { IdentityPanel, UnavailableGymEntry } from "./identity-panels.client";
import { DoorLink, LoginLayout, LoginLoading, PortalHeading } from "./login-chrome";
import { PasswordSignIn } from "./password-sign-in.client";
import { PORTALS, type Audience } from "./portals";
import loginStyles from "./login.module.css";
import { withArt } from "./sign-in-art";
import { ProfileCompletionGate } from "./profile-completion.client";

type StaffRole = "owner" | "manager" | "salesperson" | "receptionist";

/** Seeded preview people. Their names are demo data and are not translated. */
const STAFF_ROLES: Array<{ role: StaffRole; icon: LucideIcon; name: string }> = [
  { role: "owner", icon: Gauge, name: "Omar Al-Khatib" },
  { role: "manager", icon: ClipboardCheck, name: "Layla Haddad" },
  { role: "salesperson", icon: TrendingUp, name: "Sara Abuhamdan" },
  { role: "receptionist", icon: ScanLine, name: "Hala Qasem" },
];


export type AuthMode = "sign-in" | "sign-up";

/**
 * Shows the Clerk account actually in use. Without this the portal jumps
 * straight to seeded preview accounts, so there is no way to tell who you are
 * signed in as — or to switch.
 */
function SignedInIdentity() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { t } = useLocale();
  if (!user) return null;

  const label = user.primaryEmailAddress?.emailAddress ?? user.fullName ?? t("auth.signedInIdentity.fallbackLabel");

  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg border border-line-2 bg-surface p-3">
      <Monogram name={user.fullName ?? label} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-ink-3">{t("auth.signedInIdentity.signedInAs")}</span>
        <span className="block truncate text-[13px] font-medium text-ink"><bdi>{label}</bdi></span>
      </span>
      <Button variant="ghost" size="sm" onClick={() => void signOut({ redirectUrl: "/login" })}>
        <LogOut /> {t("common.action.signOut")}
      </Button>
    </div>
  );
}

/**
 * The frame (and its drawing) renders once, outside the suspense boundary: the
 * server's HTML already carries it, and the form arriving after hydration
 * replaces only the column's contents, so the drawing is never torn down.
 */
export function PortalSignIn({ audience, mode = "sign-in" }: { audience: Audience; mode?: AuthMode }) {
  const { t } = useLocale();
  const portal = PORTALS[audience];
  return (
    <LoginLayout
      portal={portal}
      mode={mode}
      footer={
        <p className="text-center text-[12px] text-ink-3">
          {portal.id === "admin" ? t("auth.chrome.staffOnly") : t("auth.chrome.secureSignIn")}
        </p>
      }
    >
      <Suspense fallback={<LoginLoading />}>
        <PortalSignInContent audience={audience} mode={mode} />
      </Suspense>
    </LoginLayout>
  );
}

function PortalSignInContent({ audience, mode = "sign-in" }: { audience: Audience; mode?: AuthMode }) {
  const { t } = useLocale();
  const portal = PORTALS[audience];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const { signIn, sessionLoading } = useApp();
  const { customers, experienceReady, signInCustomer, signInPlatformAdmin } = useExperience();
  const [loading, setLoading] = useState(false);
  const unavailablePreview = DEMO_AUTH_BYPASS && audience === "staff" && searchParams.get("preview") === "unavailable-gym";

  // Preview controls must not be interactive before the client providers have
  // restored their browser state. Otherwise a cold server-rendered page can
  // submit its form before React attaches the handlers.
  const previewReady = !DEMO_AUTH_BYPASS || (!sessionLoading && experienceReady);
  const redirectUrl = safeInternalRedirect(searchParams.get("next"), portal.href);
  // On the resolver a signed-in account is being opened, not asked to sign
  // in: no heading and no doors until Clerk has said who this is.
  const accountResolver = !DEMO_AUTH_BYPASS && audience === "account";
  const resolvingAccount = accountResolver && (!clerkLoaded || clerkSignedIn);

  useEffect(() => {
    if (DEMO_AUTH_BYPASS || mode !== "sign-up" || redirectUrl === portal.href || !clerkLoaded || !clerkSignedIn) return;
    router.replace(redirectUrl);
  }, [clerkLoaded, clerkSignedIn, mode, portal.href, redirectUrl, router]);

  const enterStaff = async (role: RoleKey) => {
    setLoading(true);
    try {
      await signIn(role);
      router.push(role === "receptionist" ? "/reception" : "/dashboard");
    } catch {
      toast.error(t("auth.preview.couldNotSignIn"));
    } finally {
      setLoading(false);
    }
  };

  const enterMember = (customerId: string) => {
    signInCustomer(customerId);
    router.push(customerId === "customer-lina" ? "/customer/my-gyms" : "/customer/discover");
  };

  const enterAdmin = () => {
    signInPlatformAdmin();
    router.push("/platform");
  };

  const accounts =
    audience === "account" ? (
      <PreviewAccountOptions />
    ) : audience === "staff" ? (
      <StaffRoles loading={loading} onEnter={enterStaff} />
    ) : audience === "member" ? (
      <MemberAccounts customers={customers} onEnter={enterMember} />
    ) : (
      <AdminEntry onEnter={enterAdmin} />
    );

  return (
    <div className="relative">
      {/* A signed-in visitor has no business on a door; the resolver at
          /login reads the role instead, so only demo personas leave it. */}
      <SignedInGuard demoOnly={audience === "account"} />
      {/* Above the heading, out of the flow: every sign-in page's heading
          starts at the same height, so a door opens with its name where the
          chooser's was. */}
      {audience !== "account" ? (
        <DoorLink href={withArt("/login", audience)} className={cn(loginStyles.back, "flex min-h-8 w-fit items-center gap-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink")}>
          <ArrowLeft className="size-3.5" aria-hidden /> {t("auth.chrome.backToSignIn")}
        </DoorLink>
      ) : null}

      {resolvingAccount ? null : (
        <div>
          <PortalHeading portal={portal} mode={mode} />
        </div>
      )}

      {DEMO_AUTH_BYPASS && !previewReady && audience !== "account" ? <LoginLoading /> : null}

      {previewReady && DEMO_AUTH_BYPASS ? unavailablePreview ? <UnavailableGymEntry /> : accounts : null}

      {accountResolver ? (
        !clerkLoaded ? (
          <LoginLoading />
        ) : !clerkSignedIn ? (
          <DoorChooser next={searchParams.get("next")} />
        ) : (
          <ProfileCompletionGate>
            {CONVEX_ENABLED ? <IdentityPanel audience={audience} /> : <NoRoleSource>{accounts}</NoRoleSource>}
          </ProfileCompletionGate>
        )
      ) : null}

      {/* The form is on the page from the server's first paint, before Clerk
          has loaded; its submit waits for Clerk. A signed-in visitor is sent
          on by the middleware first, so it gives way only in the rare case
          Clerk reports a session here, keeping whatever was typed otherwise. */}
      {!DEMO_AUTH_BYPASS && audience !== "account" ? (
        clerkLoaded && clerkSignedIn ? (
          <>
            <SignedInIdentity />
            <ProfileCompletionGate>
              {CONVEX_ENABLED ? <IdentityPanel audience={audience} /> : <NoRoleSource>{accounts}</NoRoleSource>}
            </ProfileCompletionGate>
          </>
        ) : (
          <ClerkPanel audience={audience} mode={mode} redirectUrl={redirectUrl} />
        )
      ) : null}
    </div>
  );
}

/**
 * Each door carries RIVET's own email-and-password form rather than Clerk's
 * boxed, adaptive widget, so both fields are always on screen with their
 * placeholders and nothing is cut off. The role read after sign-in still
 * decides where the account lands. Only the member door offers account
 * creation.
 */
function ClerkPanel({ audience, redirectUrl }: { audience: Audience; mode: AuthMode; redirectUrl: string }) {
  return <PasswordSignIn redirectUrl={redirectUrl} signUp={audience === "member"} />;
}

/**
 * The two doors. A gym team and a member never share a sign-in page: each
 * door carries its own form and its own words, and the account's role still
 * decides where it lands once it is through.
 */
function DoorChooser({ next }: { next: string | null }) {
  const t = useT();
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  // The doors' drawings grow out of this page's weight stack.
  const door = (href: string) => withArt(`${href}${query}`, "account");
  return (
    <div className="mt-7 grid gap-3">
      {(["staff", "member"] as const).map((id) => {
        const portal = PORTALS[id];
        return (
          <DoorLink
            key={id}
            href={door(portal.href)}
            className={cn("group", loginStyles.door)}
          >
            <portal.icon className="size-5 shrink-0 text-ink-3 transition-colors group-hover:text-ink" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium text-ink">{t(`auth.portal.${id}.title` as const)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{t(`auth.portal.${id}.blurb` as const)}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-ink rtl:rotate-180 rtl:group-hover:-translate-x-1" aria-hidden />
          </DoorLink>
        );
      })}
      <p className="mt-2 text-center text-[12px] text-ink-3">
        {t("auth.doors.staffPrefix")}{" "}
        <DoorLink href={door("/login/admin")} className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
          {t("auth.portal.admin.title")}
        </DoorLink>
      </p>
    </div>
  );
}

/** The real build has one Clerk form; these links exist only in mock preview mode. */
function PreviewAccountOptions() {
  const t = useT();
  return (
    <div className="mt-7 grid gap-2">
      <p className="context-label mb-1">{t("auth.preview.heading")}</p>
      <Button asChild variant="secondary"><Link href="/login/member">{t("auth.preview.member")}</Link></Button>
      <Button asChild variant="secondary"><Link href="/login/gym">{t("auth.preview.gym")}</Link></Button>
      <Button asChild variant="secondary"><Link href="/login/admin">{t("auth.preview.admin")}</Link></Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Each portal lists only its own accounts.
// ---------------------------------------------------------------------------

function StaffRoles({ loading, onEnter }: { loading: boolean; onEnter: (role: RoleKey) => void }) {
  const { t, isolate } = useLocale();
  const [role, setRole] = useState<RoleKey>("owner");
  const selected = STAFF_ROLES.find((item) => item.role === role)!;

  return (
    <form
      className="mt-7"
      onSubmit={(event) => {
        event.preventDefault();
        void onEnter(role);
      }}
    >
      <p className="context-label">{t("auth.preview.signInAs")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("auth.preview.staffRoleGroup")}>
        {STAFF_ROLES.map((item) => {
          const active = role === item.role;
          return (
            <button
              key={item.role}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setRole(item.role)}
              className={cn(
                "flex cursor-pointer flex-col gap-2 rounded-lg border bg-surface p-3 text-start transition-colors",
                active ? "border-ink" : "border-line-2 hover:border-line-3",
              )}
            >
              <span className="flex items-center justify-between">
                <item.icon className={cn("size-4", active ? "text-signal" : "text-ink-3")} aria-hidden />
                <span className="text-[12px] font-medium text-ink-3">{roleLabel(t, item.role)}</span>
              </span>
              <span className="text-[13.5px] font-medium text-ink"><bdi>{item.name}</bdi></span>
              <span className="text-[12px] leading-snug text-ink-3">{t(`auth.preview.staffScope.${item.role}` as const)}</span>
            </button>
          );
        })}
      </div>

      <Button type="submit" className="mt-5 w-full" size="lg" loading={loading} data-testid="sign-in-button">
        {t("auth.preview.signInAsName", { name: isolate(selected.name.split(" ")[0] ?? "") })}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

function MemberAccounts({
  customers,
  onEnter,
}: {
  customers: Array<{ id: string; name: string; context: string }>;
  onEnter: (customerId: string) => void;
}) {
  const { t, isolate } = useLocale();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const selected = customers.find((item) => item.id === customerId) ?? customers[0];

  return (
    <form
      className="mt-7"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) onEnter(selected.id);
      }}
    >
      <p className="context-label">{t("auth.preview.continueAs")}</p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={t("auth.preview.memberGroup")}>
        {customers.map((persona) => {
          const active = selected?.id === persona.id;
          return (
            <button
              key={persona.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCustomerId(persona.id)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-surface p-3 text-start transition-colors",
                active ? "border-ink" : "border-line-2 hover:border-line-3",
              )}
            >
              <Monogram name={persona.name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink"><bdi>{persona.name}</bdi></span>
                <span className="block truncate text-[12px] text-ink-3">{persona.context}</span>
              </span>
              <QrCode className={cn("size-4 shrink-0", active ? "text-signal" : "text-ink-4")} aria-hidden />
            </button>
          );
        })}
      </div>

      <Button type="submit" className="mt-5 w-full" size="lg" data-testid="member-continue">
        {t("auth.preview.continueAsName", { name: selected?.name.split(" ")[0] ? isolate(selected.name.split(" ")[0] as string) : t("auth.preview.memberFallback") })}
        <ArrowRight className="size-4" />
      </Button>

      <p className="mt-4 text-center text-[12px] text-ink-3">
        {t("auth.preview.newToRivet")}{" "}
        <Link href="/login/member/create" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
          {t("auth.chrome.createMemberAccount")}
        </Link>
      </p>
    </form>
  );
}

function AdminEntry({ onEnter }: { onEnter: () => void }) {
  const t = useT();
  return (
    <form
      className="mt-7"
      onSubmit={(event) => {
        event.preventDefault();
        onEnter();
      }}
    >
      <div className="rounded-lg border border-line-2 bg-surface p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <ShieldCheck className="size-4 text-ink-3" aria-hidden /> {t("auth.chrome.staffOnly")}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          {t("auth.preview.adminNote")}
        </p>
      </div>
      <Button type="submit" variant="signal" className="mt-5 w-full" size="lg" data-testid="admin-continue">
        {t("auth.preview.openConsole")} <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}

/**
 * Roles live in Convex. A build with no `NEXT_PUBLIC_CONVEX_URL` has no way to
 * know who anyone is, so the seeded accounts stand in — labelled, so nobody
 * mistakes them for their own.
 */
function NoRoleSource({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div>
      <div className="mt-6 rounded-lg border border-warning/30 bg-warning-bg p-3">
        <p className="text-[12px] leading-relaxed text-warning-deep">
          {t("auth.preview.noRoleSource")}
        </p>
      </div>
      {children}
    </div>
  );
}
