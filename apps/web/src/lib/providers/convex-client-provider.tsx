"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { Authenticated, ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : undefined;

/** Whether a Convex deployment is configured; consumers must not call Convex hooks without one. */
export const CONVEX_ENABLED = Boolean(convexUrl);

/**
 * Keeps the approved mock frontend buildable without environment variables
 * while enabling Convex automatically in linked development and deployments.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convexClient) return children;
  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      <Authenticated>
        <ClerkUserSync />
      </Authenticated>
      {children}
    </ConvexProviderWithClerk>
  );
}

function ClerkUserSync() {
  const { user } = useUser();
  const ensureCurrentUser = useMutation(api.users.ensureCurrent);
  const userId = user?.id;
  const fullName = [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" ") || undefined;

  useEffect(() => {
    if (!userId) return;
    void ensureCurrentUser({ fullName }).catch(() => undefined);
  }, [ensureCurrentUser, fullName, userId]);

  return null;
}
