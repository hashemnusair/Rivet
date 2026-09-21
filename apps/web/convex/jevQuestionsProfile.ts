import {
  PROFILE_NONE,
  buildGymProfileReviewContext,
  buildLanguageGapState,
  buildProfileClaimState,
  resolveLanguageGapFixture,
  resolveProfileClaimFixture,
  type GymProfileReviewContext,
} from "./profileAssist";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Public-page draft review for the gym's own editors. Both questions offer
 * the saved draft's passages as candidates and answer with passage ids the
 * editor can locate; the application decides what a finding means, never
 * rewrites copy, never translates and never publishes.
 */
export const PROFILE_FEATURE: JevFeature = {
  key: "profile",
  label: "Public page draft review",
  description: "Reviews the saved public-page draft on request: which passage the gym's own records contradict (branches, published trainers, plan terms, audience) and which passage says something the other language's text does not. Sends the draft text and counts from the gym's records only.",
};

const SYNTHETIC_CONTEXT: GymProfileReviewContext = buildGymProfileReviewContext({
  organizationId: "org-fixture",
  version: 3,
  status: "draft",
  updatedAt: "2026-09-20T12:00:00.000Z",
  now: "2026-09-21T09:00:00.000Z",
  draft: {
    taglineEn: "Strength and conditioning for everyone, across six branches.",
    taglineAr: "قوة ولياقة للجميع",
    descriptionEn: "Certified coaches, free weights and cardio. Freeze your membership any time you travel. Free parking at every branch.",
    descriptionAr: "مدربون معتمدون وأوزان حرة وكارديو. جمّد اشتراكك في أي وقت تسافر فيه.",
  },
  services: {
    branches: { count: 2, names: ["Abdoun", "Sweifieh"] },
    trainers: { publishedCount: 2, names: ["Coach A", "Coach B"], specialties: ["Strength"], languages: ["en", "ar"] },
    ptPackages: { count: 3, names: ["12 PT sessions", "20 PT sessions", "30 PT sessions"] },
    plans: { count: 2, names: ["Basic Monthly", "Flex Monthly"], freezeAvailable: true, multiBranchAccess: true, includedTraining: true },
    classes: { count: 4, names: ["Morning HIIT", "Ladies Strength"] },
    amenities: ["Free weights", "Cardio", "Showers"],
    audience: "All members",
    category: "Strength & conditioning",
  },
});

const claimFixture = buildProfileClaimState({ context: SYNTHETIC_CONTEXT });
const gapFixture = buildLanguageGapState({ context: SYNTHETIC_CONTEXT });

export const PROFILE_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "profile.claim_check",
    feature: "profile",
    version: 1,
    label: "Claim the records contradict",
    description: "Which passage of the saved draft the gym's recorded services contradict. Anything the records do not cover stays unknown, never false.",
    instructions: "A gym saved a draft of its public page and asked for a review. Its passages are offered together with what the gym's own records say: active branches, published trainer profiles, active PT packages, active plans and whether any allows freezing or grants every branch, scheduled classes, the chosen amenities and the audience. Choose the passage whose claim the records contradict, for example a branch count that differs, more coaches than published profiles, a women-only claim with an all-members audience, or freezing when no plan allows it. Choose none when nothing is contradicted. A facility, service or feature the records do not mention is unknown, not false: never choose a passage only because the records are silent about it.",
    maxCandidates: 60,
    permission: "profiles.manage",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveProfileClaimFixture,
    fixture: {
      state: claimFixture.state,
      candidates: claimFixture.candidates,
      judgment: resolveProfileClaimFixture({ state: claimFixture.state, candidates: claimFixture.candidates }) ?? { kind: "choice", choice: PROFILE_NONE, probabilities: { [PROFILE_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "profile.language_gap",
    feature: "profile",
    version: 1,
    label: "Difference between the languages",
    description: "Which passage states a service, number, price, restriction or audience that the other language's text does not. Paraphrases are not differences.",
    instructions: "A gym's public page has an English and an Arabic text that should say the same things. Both are offered as passages. Choose the passage that states a service, facility, number, price, restriction or audience the other language's text does not state, or states differently. Choose none when the two texts cover the same things even if the wording, order, tone or idiom differs. Do not translate and do not judge writing quality.",
    maxCandidates: 60,
    permission: "profiles.manage",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveLanguageGapFixture,
    fixture: {
      state: gapFixture.state,
      candidates: gapFixture.candidates,
      judgment: resolveLanguageGapFixture({ state: gapFixture.state, candidates: gapFixture.candidates }) ?? { kind: "choice", choice: PROFILE_NONE, probabilities: { [PROFILE_NONE]: 1 } },
    },
  },
];
