"use client";

import { Show, SignIn, SignUp, useAuth, useClerk, useUser } from "@clerk/nextjs";
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
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import type { RoleKey } from "@/lib/domain/types";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { IdentityPanel } from "./identity-panels.client";
import { LoginLayout, LoginLoading, PortalHeading } from "./login-chrome";
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
        <span className="block font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">Signed in as</span>
        <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
      </span>
      <Button variant="ghost" size="sm" onClick={() => void signOut({ redirectUrl: "/login" })}>
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

export function PortalSignIn({ audience, mode = "sign-in" }: { audience: Audience; mode?: AuthMode }) {
  const portal = PORTALS[audience];
  const router = useRouter();
  const { isLoaded: clerkLoaded } = useAuth();
  const { signIn } = useApp();
  const { customers, signInCustomer, signInPlatformAdmin } = useExperience();
  const [loading, setLoading] = useState(false);

  const identityReady = DEMO_AUTH_BYPASS || clerkLoaded;

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
    audience === "staff" ? (
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
        <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
          {portal.id === "admin" ? "RIVET internal · restricted access" : "Secure identity by Clerk · data by Convex"}
        </p>
      }
    >
      <div className="animate-fade-up">
        <Link href="/login" className="flex w-fit items-center gap-2 text-[12px] text-ink-3 transition-colors hover:text-ink">
          <ArrowLeft className="size-3.5" /> All sign-in options
        </Link>

        <div className="mt-6">
          <PortalHeading portal={portal} mode={mode} />
        </div>

        {!identityReady ? <LoginLoading /> : null}

        {identityReady && DEMO_AUTH_BYPASS ? accounts : null}

        {identityReady && !DEMO_AUTH_BYPASS ? (
          <>
            <Show when="signed-out">
              <ClerkPanel audience={audience} mode={mode} />
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
 * Clerk ships its own stylesheet, so the overrides that fight it need `!` to win
 * the cascade. The portal already states who is signing in, so Clerk's header is
 * removed rather than duplicated.
 */
const CLERK_APPEARANCE = {
  // Clerk 7 renamed several appearance variables, so the palette is applied
  // through element classes; only the stable ones are set here.
  variables: {
    colorPrimary: "#1b1a15",
    colorBackground: "#f5f4ef",
    colorDanger: "#b3261e",
    borderRadius: "0.375rem",
    fontFamily: "var(--font-manrope)",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full !border-none !bg-transparent !shadow-none",
    card: "w-full !bg-transparent !px-0 !py-0 !shadow-none !border-none",
    header: "!hidden",
    main: "!gap-4",
    socialButtonsBlockButton: "!border-line-2 !bg-surface !text-ink !shadow-none hover:!bg-sunken !transition-colors",
    socialButtonsBlockButtonText: "!text-[13.5px] !font-medium !text-ink",
    dividerLine: "!bg-line-2",
    dividerText: "!text-ink-3 !font-mono !text-[10px] !uppercase !tracking-[0.12em]",
    formFieldLabel: "!text-ink-2 !text-[13px] !font-medium",
    formFieldInput: "!border-line-2 !bg-surface !text-ink !shadow-none !h-9 !rounded-md",
    // Clerk paints a gradient sheen through ::after on its primary button.
    formButtonPrimary:
      "!bg-ink !bg-none !text-paper !shadow-none hover:!bg-[#33312a] !text-[13.5px] !normal-case !font-medium !h-9 !rounded-md [&::after]:!hidden",
    // The footer's grey comes from a background-image, not a colour.
    footer: "!bg-transparent !bg-none !border-none !shadow-none",
    footerItem: "!bg-transparent",
    footerAction: "!bg-transparent",
    footerActionText: "!text-ink-3 !text-[12px]",
    footerActionLink: "!text-ink !font-semibold !text-[12px]",
    identityPreviewText: "!text-ink",
    formResendCodeLink: "!text-ink",
  },
} as const;

function ClerkPanel({ audience, mode }: { audience: Audience; mode: AuthMode }) {
  const portal = PORTALS[audience];

  // Each portal owns a route, so Clerk is free to use the hash for its own
  // multi-step flow (factor-one, verify-email, reset password, …).
  if (mode === "sign-up") {
    return (
      <div className="mt-6">
        <SignUp
          routing="hash"
          signInUrl={portal.href}
          forceRedirectUrl={portal.href}
          fallbackRedirectUrl={portal.href}
          appearance={CLERK_APPEARANCE}
        />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <SignIn
        routing="hash"
        signUpUrl={portal.signUpUrl}
        forceRedirectUrl={portal.href}
        fallbackRedirectUrl={portal.href}
        appearance={CLERK_APPEARANCE}
      />
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
      <p className="eyebrow">Open the workspace as</p>
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
                <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">{ROLE_LABELS[item.role]}</span>
              </span>
              <span className="text-[13.5px] font-medium text-ink">{item.name}</span>
              <span className="text-[11.5px] leading-snug text-ink-3">{item.scope}</span>
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
      <p className="eyebrow">Continue as</p>
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
          <ShieldCheck className="size-4 text-signal" /> Restricted console
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
