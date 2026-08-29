"use client";

import { OnboardingChecklist } from "./onboarding-checklist";
import type { OnboardingAudience } from "@/lib/domain/qol";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";

export function OnboardingBanner({ audience }: { audience: OnboardingAudience }) {
  const experience = useApiQuery(qk.onboarding(audience), (api) => api.getOnboardingExperience(audience));
  if (!experience.data || experience.data.progress.dismissedAt || experience.data.progress.completedAt) return null;
  return <OnboardingChecklist audience={audience} compact />;
}
