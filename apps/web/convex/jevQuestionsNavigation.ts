import {
  NAVIGATION_NO_MATCH,
  ONBOARDING_NO_STEP,
  buildNavigationIntentState,
  buildOnboardingNextStepState,
  buildReportFinderState,
  permittedClarifications,
  permittedNavigationEntries,
  resolveNavigationIntentFixture,
  resolveOnboardingNextStepFixture,
  resolveReportFinderFixture,
  type NavigationAccess,
} from "./navigationCatalogue";
import { PERMISSIONS } from "./permissions";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Intent-aware navigation: three candidate-based choices whose options are
 * always built server-side from the catalogue the caller is permitted to
 * open. The model never sees a route it could not be shown, and it can only
 * name an offered id, a prepared clarification or no-match.
 */
export const NAVIGATION_FEATURE: JevFeature = {
  key: "navigation",
  label: "Intent-aware navigation",
  description: "Turns a typed request into a permitted destination, report view or form entry point, suggests the next setup step, and finds the report that answers a question. Sends the request text and the permitted catalogue only.",
};

const FULL_ACCESS: NavigationAccess = {
  permissions: [...PERMISSIONS],
  role: "owner",
  modules: [
    { key: "revenue", entitled: true, enabled: true },
    { key: "operations", entitled: true, enabled: true },
    { key: "finance", entitled: true, enabled: true },
    { key: "reporting", entitled: true, enabled: true },
  ],
};

const fullEntries = permittedNavigationEntries(FULL_ACCESS);
const intentFixture = buildNavigationIntentState({ query: "Where do I change who can refund?", currentPath: "/dashboard", entries: fullEntries, clarifications: permittedClarifications(fullEntries), role: "owner" });
const nextStepFixture = buildOnboardingNextStepState({
  audience: "owner",
  organizationName: "Sample Gym",
  tasks: [
    { key: "owner_identity", title: "Confirm organization identity", description: "Review the gym name, timezone, currency, and receipt identity.", category: "required", href: "/settings?section=organization", complete: true },
    { key: "owner_plan", title: "Create a membership plan", description: "Publish at least one plan the sales team can sell.", category: "required", href: "/plans", complete: false },
    { key: "owner_members", title: "Add or import members", description: "Start with CSV import or create the first live member.", category: "required", href: "/members/import", complete: false },
    { key: "owner_public_profile", title: "Publish the gym profile", description: "Review what prospective members see in discovery.", category: "recommended", href: "/settings?section=profile", complete: false },
  ],
  facts: { branches: 1, plans: 0, members: 0, staff: 1 },
});
const reportFixture = buildReportFinderState({ question: "Which classes are half empty?", entries: fullEntries });

export const NAVIGATION_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "navigation.intent",
    feature: "navigation",
    version: 1,
    label: "Where to go",
    description: "Which permitted page, report view, form or setting a typed request most plausibly means, or a prepared clarification, or no match.",
    instructions: "A member of gym staff typed a request into RIVET's workspace search. Choose the one offered place they most plausibly want to open. Choose a clarification option when the request fits more than one offered place. Choose no_match when nothing offered fits or the request is not about going somewhere in RIVET. Never assume a place exists that is not offered.",
    maxCandidates: 120,
    permission: "members.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveNavigationIntentFixture,
    fixture: {
      state: intentFixture.state,
      candidates: intentFixture.candidates,
      judgment: resolveNavigationIntentFixture({ state: intentFixture.state, candidates: intentFixture.candidates }) ?? { kind: "choice", choice: NAVIGATION_NO_MATCH, probabilities: { [NAVIGATION_NO_MATCH]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "navigation.next_step",
    feature: "navigation",
    version: 1,
    label: "Next setup step",
    description: "Which open setup step most unblocks day-to-day operation next. Every step stays listed; this only highlights one.",
    instructions: "A gym is setting up RIVET. From the open steps offered, pick the single step that most unblocks day-to-day operation next, taking into account what is already complete. Required steps come before recommended and optional ones unless a recommended step is needed for the daily work the gym is about to do. Choose no_step when nothing stands out.",
    maxCandidates: 20,
    permission: "members.read",
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveOnboardingNextStepFixture,
    fixture: {
      state: nextStepFixture.state,
      candidates: nextStepFixture.candidates,
      judgment: resolveOnboardingNextStepFixture({ state: nextStepFixture.state, candidates: nextStepFixture.candidates }) ?? { kind: "choice", choice: ONBOARDING_NO_STEP, probabilities: { [ONBOARDING_NO_STEP]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "navigation.report_view",
    feature: "navigation",
    version: 1,
    label: "Report for a question",
    description: "Which report view answers a question about the gym. Dates and branch filters are chosen on the page, never by the suggestion.",
    instructions: "A gym owner or manager asked a question about their gym. Choose the offered report view that answers it, or no_match when none does. Do not infer dates, branches or calculations; the page chooses those.",
    maxCandidates: 20,
    permission: "reports.financial.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveReportFinderFixture,
    fixture: {
      state: reportFixture.state,
      candidates: reportFixture.candidates,
      judgment: resolveReportFinderFixture({ state: reportFixture.state, candidates: reportFixture.candidates }) ?? { kind: "choice", choice: NAVIGATION_NO_MATCH, probabilities: { [NAVIGATION_NO_MATCH]: 1 } },
    },
  },
];
