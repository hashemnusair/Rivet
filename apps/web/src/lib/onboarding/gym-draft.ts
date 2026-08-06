import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";

export const GYM_ONBOARDING_DRAFT_KEY = "rivet.gym-onboarding.draft";

export interface GymOnboardingDraft {
  ownerFullName: string;
  ownerPhone: string;
  gymName: string;
  city: string;
  branchName: string;
  currentActiveMembers: string;
  plan: PlatformSaasPlan["name"];
}

export const DEFAULT_GYM_ONBOARDING_DRAFT: GymOnboardingDraft = {
  ownerFullName: "",
  ownerPhone: "",
  gymName: "",
  city: "Amman",
  branchName: "Main branch",
  currentActiveMembers: "",
  plan: "Growth",
};
