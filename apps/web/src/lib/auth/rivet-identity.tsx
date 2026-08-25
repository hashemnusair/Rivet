"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { RoleKey } from "@/lib/domain/types";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { dataMode } from "@/lib/api/ConvexGymOSApi";
import { DEMO_AUTH_BYPASS } from "./demo-auth";

/** Emitted by the ticket flow after a provider-verified invitation claim. */
export const INVITATION_CLAIMED_EVENT = "rivet:invitation-claimed";

function invitationErrorCode(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; data?: { code?: unknown }; message?: unknown };
    return [record.code, record.data?.code, record.message].filter((value): value is string => typeof value === "string").join(" ");
  }
  return String(error);
}

/** Invitation placeholders are recoverable only through Clerk verification. */
export function isInvitationBootstrapError(error: unknown): boolean {
  return /INVITATION_NOT_ACCEPTED|invitation has not been accepted/i.test(invitationErrorCode(error));
}

/**
 * A Clerk session can become visible before the invitation claim mutation has
 * committed. Retry the user bootstrap only after the server-side claim action
 * proves the ticket; all other errors remain closed and are surfaced.
 */
export async function ensureCurrentUserWithInvitationRecovery(input: {
  ensureCurrentUser: () => Promise<unknown>;
  claimInvitation: () => Promise<{ claimed: boolean }>;
}): Promise<void> {
  try {
    await input.ensureCurrentUser();
  } catch (error) {
    if (!isInvitationBootstrapError(error)) throw error;
    const claim = await input.claimInvitation();
    if (!claim.claimed) throw error;
    await input.ensureCurrentUser();
  }
}

export interface RivetMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: RoleKey;
  branches: Array<{ id: string; name: string; code: string }>;
}

export interface RivetIdentity {
  /**
   * `demo` short-circuits everything for browser tests and for builds with no
   * Convex deployment; `pending` is the brief window where Clerk has a session
   * but the Convex user row is still being written on a first-ever sign-in.
   */
  status: "loading" | "anonymous" | "pending" | "ready" | "error" | "demo";
  errorMessage?: string;
  userId?: string;
  email?: string;
  fullName?: string;
  platformAdmin: boolean;
  /** The account has an active gym-team row, but that gym cannot be entered. */
  gymAccessUnavailable: boolean;
  /** More than one routable gym is available and a user choice is required. */
  organizationSelectionRequired?: boolean;
  memberships: RivetMembership[];
}

/** Convex names the sales role `sales`; the app's permission model calls it `salesperson`. */
function toRoleKey(role: string): RoleKey {
  return role === "sales" ? "salesperson" : (role as RoleKey);
}

/**
 * The deterministic mock seed uses the same operator for its default session.
 * Keeping this ID aligned lets preview-only actions (for example, assigning a
 * support case to yourself) exercise the mock API without inventing a second
 * user that the adapter cannot resolve. This value is never used by the
 * Convex/Clerk branch below.
 */
export const DEMO_IDENTITY: RivetIdentity = {
  status: "demo",
  userId: "10000000-0000-4a00-8a00-000000000010",
  email: "omar@forgefitness.jo",
  fullName: "Omar Al-Khatib",
  // The mock operator is the seeded gym owner, not a production platform
  // administrator. Keep this false so customer and gym preview routes cannot
  // be elevated merely because they share the deterministic demo identity.
  platformAdmin: false,
  gymAccessUnavailable: false,
  organizationSelectionRequired: false,
  memberships: [],
};
const IdentityContext = createContext<RivetIdentity>({ status: "loading", platformAdmin: false, gymAccessUnavailable: false, memberships: [] });

/**
 * The branch below is on module-level constants, never on state, so the
 * component tree shape is fixed for the lifetime of the bundle and the
 * conditional `useQuery` inside `ConvexIdentity` is never conditionally called.
 */
export function RivetIdentityProvider({ children }: { children: ReactNode }) {
  // Resolve the data mode before choosing the identity provider. In a
  // production runtime ConvexGymOSApi throws if mock mode is configured, so a
  // stale demo flag cannot silently downgrade this provider to seeded data.
  const mode = dataMode();
  // Missing Convex configuration is a configuration failure, not permission
  // to open a seeded demo tenant. Only explicit mock mode can use demo data.
  if (DEMO_AUTH_BYPASS || mode === "mock") {
    return <IdentityContext.Provider value={DEMO_IDENTITY}>{children}</IdentityContext.Provider>;
  }
  if (!CONVEX_ENABLED) {
    return <IdentityContext.Provider value={{ status: "anonymous", platformAdmin: false, gymAccessUnavailable: false, memberships: [] }}>{children}</IdentityContext.Provider>;
  }
  return <ConvexIdentity>{children}</ConvexIdentity>;
}

function ConvexIdentity({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const { user } = useUser();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const ensureCurrentUser = useMutation(api.users.ensureCurrent);
  const claimInvitation = useAction(api.users.claimInvitation);
  const userId = user?.id;
  const fullName = [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" ") || undefined;
  const syncKey = userId ? `${userId}:${fullName ?? ""}` : undefined;
  const [claimNonce, setClaimNonce] = useState(0);
  const [sync, setSync] = useState<{ key?: string; status: "idle" | "syncing" | "ready" | "error"; message?: string }>({
    status: "idle",
  });

  useEffect(() => {
    const onClaimed = () => setClaimNonce((current) => current + 1);
    window.addEventListener(INVITATION_CLAIMED_EVENT, onClaimed);
    return () => window.removeEventListener(INVITATION_CLAIMED_EVENT, onClaimed);
  }, []);

  // A Clerk session and a Convex-authenticated websocket become ready at
  // different moments. Synchronize the user row first, then start the identity
  // query. This removes the brief `null` result that previously painted a
  // scary role error during every successful sign-in.
  useEffect(() => {
    if (!clerkLoaded || !clerkSignedIn || !isAuthenticated || !syncKey) {
      setSync((current) => current.status === "idle" && !current.key ? current : { status: "idle" });
      return;
    }

    let cancelled = false;
    setSync((current) => current.key === syncKey && current.status === "ready" ? current : { key: syncKey, status: "syncing" });
    void ensureCurrentUserWithInvitationRecovery({
      ensureCurrentUser: () => ensureCurrentUser({ fullName }),
      claimInvitation: () => claimInvitation({}),
    })
      .then(() => {
        if (!cancelled) setSync({ key: syncKey, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) {
          setSync({
            key: syncKey,
            status: "error",
            message: "RIVET could not synchronize this account with its workspace.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [claimInvitation, claimNonce, clerkLoaded, clerkSignedIn, ensureCurrentUser, fullName, isAuthenticated, syncKey]);

  const canQueryIdentity = Boolean(isAuthenticated && syncKey && sync.key === syncKey && sync.status === "ready");
  const result = useQuery(api.identity.current, canQueryIdentity ? {} : "skip");

  let value: RivetIdentity;
  if (!clerkLoaded || authLoading) {
    value = { status: "loading", platformAdmin: false, gymAccessUnavailable: false, organizationSelectionRequired: false, memberships: [] };
  } else if (!clerkSignedIn) {
    value = { status: "anonymous", platformAdmin: false, gymAccessUnavailable: false, organizationSelectionRequired: false, memberships: [] };
  } else if (!isAuthenticated || sync.status === "idle" || sync.status === "syncing") {
    value = { status: "loading", platformAdmin: false, gymAccessUnavailable: false, organizationSelectionRequired: false, memberships: [] };
  } else if (sync.status === "error") {
    value = {
      status: "error",
      errorMessage: sync.message,
      platformAdmin: false,
      gymAccessUnavailable: false,
      organizationSelectionRequired: false,
      memberships: [],
    };
  } else if (result === undefined) {
    value = { status: "loading", platformAdmin: false, gymAccessUnavailable: false, organizationSelectionRequired: false, memberships: [] };
  } else if (result === null) {
    value = {
      status: "error",
      errorMessage: "RIVET could not verify this account with Convex.",
      platformAdmin: false,
      gymAccessUnavailable: false,
      organizationSelectionRequired: false,
      memberships: [],
    };
  } else if (result.pending || !result.user) {
    value = { status: "pending", platformAdmin: false, gymAccessUnavailable: false, memberships: [] };
  } else {
    value = {
      status: "ready",
      userId: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      platformAdmin: result.user.platformAdmin,
      gymAccessUnavailable: result.gymAccessUnavailable,
      organizationSelectionRequired: result.organizationSelectionRequired,
      memberships: result.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organizationName,
        organizationSlug: m.organizationSlug,
        role: toRoleKey(m.role),
        branches: m.branches,
      })),
    };
  }

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useRivetIdentity() {
  return useContext(IdentityContext);
}

export type Destination = { area: "platform" | "gym" | "member" | "unavailable" | "organization-selection"; href: string; role?: RoleKey };

/**
 * Where this person belongs. Platform administration outranks gym staff, which
 * outranks being a member — a member is simply someone with no gym role, which
 * is why it is the fallback rather than a checked condition.
 */
export function destinationFor(identity: RivetIdentity): Destination {
  if (identity.platformAdmin) return { area: "platform", href: "/platform" };

  if (identity.organizationSelectionRequired || identity.memberships.length > 1) {
    return { area: "organization-selection", href: "/login?reason=organization-selection" };
  }

  const membership = identity.memberships[0];
  if (membership) {
    return {
      area: "gym",
      href: membership.role === "receptionist" ? "/reception" : membership.role === "auditor" ? "/reports" : "/dashboard",
      role: membership.role,
    };
  }

  if (identity.gymAccessUnavailable) return { area: "unavailable", href: "/login" };

  return { area: "member", href: "/customer/my-gyms" };
}
