"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useExperience } from "@/lib/providers/experience-provider";

const demoAuthBypass = process.env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1";

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

  const identityReady = demoAuthBypass || isLoaded;
  const identitySignedIn = demoAuthBypass || isSignedIn;

  useEffect(() => {
    if (identityReady && !identitySignedIn) router.replace("/login/member");
  }, [identityReady, identitySignedIn, router]);

  return {
    ready: identityReady && experienceReady,
    identitySignedIn,
    profileSelected: customerSignedIn,
  };
}
