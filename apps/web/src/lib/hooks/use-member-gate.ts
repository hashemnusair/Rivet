"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
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
  const { customerSignedIn, experienceReady } = useExperience();

  const identityReady = DEMO_AUTH_BYPASS || isLoaded;
  const identitySignedIn = DEMO_AUTH_BYPASS || isSignedIn;

  useEffect(() => {
    if (identityReady && !identitySignedIn) router.replace("/login/member");
  }, [identityReady, identitySignedIn, router]);

  return {
    ready: identityReady && experienceReady,
    identitySignedIn,
    profileSelected: customerSignedIn,
  };
}
