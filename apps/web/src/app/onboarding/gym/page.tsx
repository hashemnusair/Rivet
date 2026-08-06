import { redirect } from "next/navigation";

/**
 * Legacy links from the previous self-serve onboarding flow now return to the
 * reviewed application form. Gym workspaces are provisioned by RIVET only.
 */
export default function LegacyGymOnboardingPage() {
  redirect("/signup");
}
