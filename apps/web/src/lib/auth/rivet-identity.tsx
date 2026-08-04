"use client";

import { useQuery } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { RoleKey } from "@/lib/domain/types";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { dataMode } from "@/lib/api/ConvexGymOSApi";
import { DEMO_AUTH_BYPASS } from "./demo-auth";

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
  status: "loading" | "anonymous" | "pending" | "ready" | "demo";
  userId?: string;
  email?: string;
  fullName?: string;
  platformAdmin: boolean;
  memberships: RivetMembership[];
}

/** Convex names the sales role `sales`; the app's permission model calls it `salesperson`. */
function toRoleKey(role: string): RoleKey {
  return role === "sales" ? "salesperson" : (role as RoleKey);
}

const DEMO_IDENTITY: RivetIdentity = { status: "demo", platformAdmin: false, memberships: [] };
const IdentityContext = createContext<RivetIdentity>({ status: "loading", platformAdmin: false, memberships: [] });

/**
 * The branch below is on module-level constants, never on state, so the
 * component tree shape is fixed for the lifetime of the bundle and the
 * conditional `useQuery` inside `ConvexIdentity` is never conditionally called.
 */
export function RivetIdentityProvider({ children }: { children: ReactNode }) {
  // Missing Convex configuration is a configuration failure, not permission
  // to open a seeded demo tenant. Only explicit mock mode can use demo data.
  if (DEMO_AUTH_BYPASS || dataMode() === "mock") {
    return <IdentityContext.Provider value={DEMO_IDENTITY}>{children}</IdentityContext.Provider>;
  }
  if (!CONVEX_ENABLED) {
    return <IdentityContext.Provider value={{ status: "anonymous", platformAdmin: false, memberships: [] }}>{children}</IdentityContext.Provider>;
  }
  return <ConvexIdentity>{children}</ConvexIdentity>;
}

function ConvexIdentity({ children }: { children: ReactNode }) {
  const result = useQuery(api.identity.current);

  let value: RivetIdentity;
  if (result === undefined) {
    value = { status: "loading", platformAdmin: false, memberships: [] };
  } else if (result === null) {
    value = { status: "anonymous", platformAdmin: false, memberships: [] };
  } else if (result.pending || !result.user) {
    value = { status: "pending", platformAdmin: false, memberships: [] };
  } else {
    value = {
      status: "ready",
      userId: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      platformAdmin: result.user.platformAdmin,
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

export type Destination = { area: "platform" | "gym" | "member"; href: string; role?: RoleKey };

/**
 * Where this person belongs. Platform administration outranks gym staff, which
 * outranks being a member — a member is simply someone with no gym role, which
 * is why it is the fallback rather than a checked condition.
 */
export function destinationFor(identity: RivetIdentity): Destination {
  if (identity.platformAdmin) return { area: "platform", href: "/platform" };

  const membership = identity.memberships[0];
  if (membership) {
    return {
      area: "gym",
      href: membership.role === "receptionist" ? "/reception" : "/dashboard",
      role: membership.role,
    };
  }

  return { area: "member", href: "/customer/my-gyms" };
}
