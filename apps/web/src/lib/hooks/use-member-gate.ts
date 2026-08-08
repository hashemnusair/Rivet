"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useExperience } from "@/lib/providers/experience-provider";


/**
 * A member's own pages need a real identity, exactly like the gym workspace and
 * the platform console — only the marketplace (`/customer/discover`, gym
 * profiles) stays open to visitors who have not signed in.
 *
 * Two separate things have to be true, and the caller needs to tell them apart:
 * `identitySignedIn` is Clerk, `profileSelected` is the RIVET member the portal
 * picked afterwards.
 */
export function useMemberGate() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const { customerSignedIn, experienceReady, signInAsIdentity } = useExperience();
  const identity = useRivetIdentity();

  // A Clerk session is not automatically a member session. Platform admins
  // and gym staff can still have an old customer profile from the previous
  // member bootstrap, so checking `customerSignedIn` alone would let them
  // render this area. Once the authoritative identity is ready, its elevated
  // destination always wins and this hook keeps the member page behind the
  // redirect while the router completes it.
  const elevatedDestination = identity.status === "ready" && destinationFor(identity).area !== "member"
    ? destinationFor(identity).href
    : undefined;

  const identityReady = DEMO_AUTH_BYPASS || isLoaded;
  const identitySignedIn = DEMO_AUTH_BYPASS || isSignedIn;

  useEffect(() => {
    if (identityReady && !identitySignedIn) router.replace("/login");
  }, [identityReady, identitySignedIn, router]);

  useEffect(() => {
    if (!identityReady || !identitySignedIn || !elevatedDestination) return;
    router.replace(elevatedDestination);
  }, [elevatedDestination, identityReady, identitySignedIn, router]);

  // Arriving straight at a member page with a real session should not send you
  // back to the portal to state who you are — you already did that with Clerk.
  useEffect(() => {
    if (identity.status !== "ready" || elevatedDestination || customerSignedIn || !identity.email) return;
    signInAsIdentity({ email: identity.email, fullName: identity.fullName ?? "" });
  }, [elevatedDestination, identity.status, identity.email, identity.fullName, customerSignedIn, signInAsIdentity]);

  return {
    ready: identityReady && experienceReady && !elevatedDestination,
    identitySignedIn,
    profileSelected: customerSignedIn && !elevatedDestination,
  };
}
