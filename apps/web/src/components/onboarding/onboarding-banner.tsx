"use client";

import { OnboardingChecklist } from "./onboarding-checklist";
import type { OnboardingAudience } from "@/lib/domain/qol";

export function OnboardingBanner({ audience }: { audience: OnboardingAudience }) {
  return <OnboardingChecklist audience={audience} compact />;
}
