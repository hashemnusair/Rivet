"use client";

import { publicSiteHref } from "@/lib/routing/host-routing";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity, type RivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { RESOLVER_PATH } from "@/lib/routing/signed-in-routing";

export type ViewerArea = "gym" | "reception" | "member" | "platform" | "resolving";

/** Where a signed-in visitor's one button leads, and how the site names it. */
export interface ViewerDestination {
  area: ViewerArea;
  href: string;
  /** The noun on the bar: Dashboard, Reception, My gyms, Platform. */
  label: string;
  /** The verb on a call to action: Open your dashboard, Open your gyms. */
  verb: string;
}

export type PublicViewer =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; destination: ViewerDestination; signOut: () => Promise<void> };

const DESTINATIONS: Record<ViewerArea, ViewerDestination> = {
  gym: { area: "gym", href: "/dashboard", label: "Dashboard", verb: "Open your dashboard" },
  reception: { area: "reception", href: "/reception", label: "Reception", verb: "Open reception" },
  member: { area: "member", href: "/customer/my-gyms", label: "My gyms", verb: "Open your gyms" },
  platform: { area: "platform", href: "/platform", label: "Platform", verb: "Open the platform" },
  // The role is still being read: the resolver finishes the job.
  resolving: { area: "resolving", href: RESOLVER_PATH, label: "Dashboard", verb: "Open your dashboard" },
};

/** The destination for a Clerk account, from what Convex says about it so far. */
export function destinationForIdentity(identity: RivetIdentity): ViewerDestination {
  if (identity.status !== "ready") return DESTINATIONS.resolving;
  const destination = destinationFor(identity);
  switch (destination.area) {
    case "platform":
      return DESTINATIONS.platform;
    case "gym":
      return destination.role === "receptionist" ? DESTINATIONS.reception : DESTINATIONS.gym;
    case "member":
      return DESTINATIONS.member;
    default:
      // Organization selection and an unavailable gym are both handled on the resolver.
      return { ...DESTINATIONS.resolving, href: destination.href };
  }
}

/** The destination for a preview persona in demo mode. */
export function destinationForDemo(input: { platformAdmin: boolean; gymRole?: string; member: boolean }): ViewerDestination | null {
  if (input.platformAdmin) return DESTINATIONS.platform;
  if (input.gymRole) return input.gymRole === "receptionist" ? DESTINATIONS.reception : DESTINATIONS.gym;
  if (input.member) return DESTINATIONS.member;
  return null;
}

/**
 * Who is looking at the public site. Merges the Clerk session and the Convex
 * role in a real build with the seeded personas in demo mode, so the bar, the
 * menu, the footer and the landing's calls to action can all answer the same
 * question: is this visitor signed in, and where is their own area?
 */
export function usePublicViewer(): PublicViewer {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const identity = useRivetIdentity();
  const { session, sessionLoading, signOut: signOutGym } = useApp();
  const { customerSignedIn, platformAdminSignedIn, experienceReady, signOutCustomer, signOutPlatformAdmin } = useExperience();

  return useMemo<PublicViewer>(() => {
    if (DEMO_AUTH_BYPASS) {
      if (sessionLoading || !experienceReady) return { status: "loading" };
      const destination = destinationForDemo({ platformAdmin: platformAdminSignedIn, gymRole: session?.roles[0], member: customerSignedIn });
      if (!destination) return { status: "signed-out" };
      return {
        status: "signed-in",
        destination,
        signOut: async () => {
          if (platformAdminSignedIn) signOutPlatformAdmin();
          if (customerSignedIn) signOutCustomer();
          if (session) await signOutGym();
          router.replace("/");
        },
      };
    }

    if (!isLoaded) return { status: "loading" };
    if (!isSignedIn) return { status: "signed-out" };
    return {
      status: "signed-in",
      destination: destinationForIdentity(identity),
      signOut: () => clerkSignOut({ redirectUrl: publicSiteHref(window.location.hostname) }),
    };
  }, [clerkSignOut, customerSignedIn, experienceReady, identity, isLoaded, isSignedIn, platformAdminSignedIn, router, session, sessionLoading, signOutCustomer, signOutGym, signOutPlatformAdmin]);
}
