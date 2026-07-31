"use client";

import { useAuth } from "@clerk/nextjs";
import { Authenticated, ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : undefined;

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
  const ensureCurrentUser = useMutation(api.users.ensureCurrent);

  useEffect(() => {
    void ensureCurrentUser().catch(() => undefined);
  }, [ensureCurrentUser]);

  return null;
}
