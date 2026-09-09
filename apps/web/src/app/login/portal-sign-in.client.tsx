"use client";

import { Show, useAuth, useClerk, useUser } from "@clerk/nextjs";
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
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import type { RoleKey } from "@/lib/domain/types";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { IdentityPanel, UnavailableGymEntry } from "./identity-panels.client";
import { LoginLayout, LoginLoading, PortalHeading } from "./login-chrome";
import { PasswordSignIn } from "./password-sign-in.client";
import { PORTALS, type Audience } from "./portals";
import { ProfileCompletionGate } from "./profile-completion.client";

const STAFF_ROLES: Array<{ role: RoleKey; icon: LucideIcon; name: string; scope: string }> = [
  { role: "owner", icon: Gauge, name: "Omar Al-Khatib", scope: "Revenue, branches, staff, audit" },
  { role: "manager", icon: ClipboardCheck, name: "Layla Haddad", scope: "Approvals, reconciliation, queues" },
  { role: "salesperson", icon: TrendingUp, name: "Sara Abuhamdan", scope: "Pipeline, follow-ups, conversions" },
  { role: "receptionist", icon: ScanLine, name: "Hala Qasem", scope: "Lookup, check-in, collect, renew" },
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
  if (!user) return null;

  const label = user.primaryEmailAddress?.emailAddress ?? user.fullName ?? "your account";

  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg border border-line-2 bg-surface p-3">
      <Monogram name={user.fullName ?? label} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-ink-3">Signed in as</span>
        <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={() => void signOut({ redirectUrl: "/login" })}>
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

export function PortalSignIn(props: { audience: Audience; mode?: AuthMode }) {
  return (
    <Suspense fallback={<PortalSignInFallback {...props} />}>
      <PortalSignInContent {...props} />
    </Suspense>
  );
}

function PortalSignInFallback({ audience, mode = "sign-in" }: { audience: Audience; mode?: AuthMode }) {
  const portal = PORTALS[audience];
  return (
    <LoginLayout
      portal={portal}
      mode={mode}
      footer={
        <p className="text-center text-[12px] text-ink-3">
          {portal.id === "admin" ? "RIVET internal · restricted access" : "Secure identity by Clerk · application data by Convex"}
        </p>
      }
    >
      <LoginLoading />
    </LoginLayout>
  );
}

function PortalSignInContent({ audience, mode = "sign-in" }: { audience: Audience; mode?: AuthMode }) {
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
  const identityReady = (DEMO_AUTH_BYPASS || clerkLoaded) && previewReady;
  const redirectUrl = safeInternalRedirect(searchParams.get("next"), portal.href);

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
      toast.error("Could not open that workspace.");
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
    <LoginLayout
      portal={portal}
      mode={mode}
      footer={
        <p className="text-center text-[12px] text-ink-3">
          {portal.id === "admin" ? "RIVET internal · restricted access" : "Secure identity by Clerk · application data by Convex"}
        </p>
      }
    >
      <div className="animate-fade-up">
        {/* A signed-in visitor has no business on a door; the resolver at
            /login reads the role instead, so only demo personas leave it. */}
        <SignedInGuard demoOnly={audience === "account"} />
        {audience !== "account" ? (
          <Link href="/login" className="flex min-h-8 w-fit items-center gap-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
          </Link>
        ) : null}

        <div className={audience === "account" ? undefined : "mt-6"}>
          <PortalHeading portal={portal} mode={mode} />
        </div>

        {!identityReady && audience !== "account" ? <LoginLoading /> : null}

        {identityReady && DEMO_AUTH_BYPASS ? unavailablePreview ? <UnavailableGymEntry /> : accounts : null}

        {!DEMO_AUTH_BYPASS && audience === "account" ? (
          !clerkLoaded || !clerkSignedIn ? (
            <DoorChooser next={searchParams.get("next")} />
          ) : (
            <ProfileCompletionGate>
              {CONVEX_ENABLED ? <IdentityPanel audience={audience} /> : <NoRoleSource>{accounts}</NoRoleSource>}
            </ProfileCompletionGate>
          )
        ) : null}

        {identityReady && !DEMO_AUTH_BYPASS && audience !== "account" ? (
          <>
            <Show when="signed-out">
              <ClerkPanel audience={audience} mode={mode} redirectUrl={redirectUrl} />
            </Show>
            <Show when="signed-in">
              <SignedInIdentity />
              <ProfileCompletionGate>
                {CONVEX_ENABLED ? <IdentityPanel audience={audience} /> : <NoRoleSource>{accounts}</NoRoleSource>}
              </ProfileCompletionGate>
            </Show>
          </>
        ) : null}
      </div>
    </LoginLayout>
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
  const query = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <div className="mt-7 grid gap-3">
      {(["staff", "member"] as const).map((id) => {
        const portal = PORTALS[id];
        return (
          <Link
            key={id}
            href={`${portal.href}${query}`}
            className="group flex items-center gap-4 rounded-lg border border-line-2 bg-surface p-4 transition-colors hover:border-ink"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper" aria-hidden>
              <portal.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-ink">{portal.title}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{portal.blurb}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        );
      })}
      <p className="mt-2 text-center text-[12px] text-ink-3">
        RIVET staff:{" "}
        <Link href={`/login/admin${query}`} className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
          Platform administration
        </Link>
      </p>
    </div>
  );
}

function safeInternalRedirect(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/** The real build has one Clerk form; these links exist only in mock preview mode. */
function PreviewAccountOptions() {
  return (
    <div className="mt-7 grid gap-2">
      <p className="context-label mb-1">Preview an account</p>
      <Button asChild variant="secondary"><Link href="/login/member">Member preview</Link></Button>
      <Button asChild variant="secondary"><Link href="/login/gym">Gym team preview</Link></Button>
      <Button asChild variant="secondary"><Link href="/login/admin">Platform admin preview</Link></Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Each portal lists only its own accounts.
// ---------------------------------------------------------------------------

function StaffRoles({ loading, onEnter }: { loading: boolean; onEnter: (role: RoleKey) => void }) {
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
      <p className="context-label">Open the workspace as</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Staff role">
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
                <span className="text-[12px] font-medium text-ink-3">{ROLE_LABELS[item.role]}</span>
              </span>
              <span className="text-[13.5px] font-medium text-ink">{item.name}</span>
              <span className="text-[12px] leading-snug text-ink-3">{item.scope}</span>
            </button>
          );
        })}
      </div>

      <Button type="submit" className="mt-5 w-full" size="lg" loading={loading} data-testid="sign-in-button">
        Open {selected.name.split(" ")[0]}&rsquo;s workspace
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
      <p className="context-label">Continue as</p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Member account">
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
                <span className="block text-[14px] font-medium text-ink">{persona.name}</span>
                <span className="block truncate text-[12px] text-ink-3">{persona.context}</span>
              </span>
              <QrCode className={cn("size-4 shrink-0", active ? "text-signal" : "text-ink-4")} aria-hidden />
            </button>
          );
        })}
      </div>

      <Button type="submit" className="mt-5 w-full" size="lg" data-testid="member-continue">
        Continue as {selected?.name.split(" ")[0] ?? "member"}
        <ArrowRight className="size-4" />
      </Button>

      <p className="mt-4 text-center text-[12px] text-ink-3">
        No membership yet?{" "}
        <Link href="/login/member/create" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
          Create a member account
        </Link>
      </p>
    </form>
  );
}

function AdminEntry({ onEnter }: { onEnter: () => void }) {
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
          <ShieldCheck className="size-4 text-ink-3" aria-hidden /> Restricted console
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          Tenant management, subscriptions, billing and support across every gym on RIVET. Opening the preview does not
          grant your account a real platform role.
        </p>
      </div>
      <Button type="submit" variant="signal" className="mt-5 w-full" size="lg" data-testid="admin-continue">
        Open platform console <ArrowRight className="size-4" />
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
  return (
    <div>
      <div className="mt-6 rounded-lg border border-warning/30 bg-warning-bg p-3">
        <p className="text-[12px] leading-relaxed text-warning-deep">
          No Convex deployment is configured for this build, so RIVET cannot read your role. These are seeded preview
          accounts, not yours.
        </p>
      </div>
      {children}
    </div>
  );
}
