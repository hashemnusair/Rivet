"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

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
      {children}
    </ConvexProviderWithClerk>
  );
}
