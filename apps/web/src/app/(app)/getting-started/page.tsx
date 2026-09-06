"use client";

import { PageHeader } from "@/components/shared/chrome";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { useApp } from "@/lib/providers/app-providers";

export default function GettingStartedPage() {
  const { session } = useApp();
  const audience = session?.roles[0] === "owner" ? "owner" : "staff";
  return <div className="space-y-5"><PageHeader title={audience === "owner" ? "Open your gym with confidence" : "Learn your RIVET workspace"} description={audience === "owner" ? "A resumable readiness checklist separates what must be ready to operate from what can wait." : "A role-aware tour of navigation, member work, follow-ups, and audited actions."}/><OnboardingChecklist audience={audience} /></div>;
}
