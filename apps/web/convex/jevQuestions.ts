import { FOUNDATION_FEATURE, FOUNDATION_QUESTIONS } from "./jevQuestionsFoundation";
import { IMPORT_FEATURE, IMPORT_QUESTIONS } from "./jevQuestionsImport";
import { NAVIGATION_FEATURE, NAVIGATION_QUESTIONS } from "./jevQuestionsNavigation";
import { FOLLOWUP_FEATURE, FOLLOWUP_QUESTIONS } from "./jevQuestionsFollowup";
import { RESOLUTION_FEATURE, RESOLUTION_QUESTIONS } from "./jevQuestionsResolution";
import { SUPPORT_FEATURE, SUPPORT_QUESTIONS } from "./jevQuestionsSupport";
import { PROFILE_FEATURE, PROFILE_QUESTIONS } from "./jevQuestionsProfile";
import { BRANCHOPS_FEATURE, BRANCHOPS_QUESTIONS } from "./jevQuestionsBranchOps";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * The aggregated registry. Add a feature's question module here; keep the
 * question definitions inside that module so each feature owns its wording,
 * versions and fixtures. `jevRegistry.test.ts` validates the whole list.
 */
export const JEV_FEATURES: readonly JevFeature[] = [FOUNDATION_FEATURE, IMPORT_FEATURE, NAVIGATION_FEATURE, FOLLOWUP_FEATURE, RESOLUTION_FEATURE, SUPPORT_FEATURE, PROFILE_FEATURE, BRANCHOPS_FEATURE];

export const JEV_QUESTIONS: readonly JevQuestion[] = [...FOUNDATION_QUESTIONS, ...IMPORT_QUESTIONS, ...NAVIGATION_QUESTIONS, ...FOLLOWUP_QUESTIONS, ...RESOLUTION_QUESTIONS, ...SUPPORT_QUESTIONS, ...PROFILE_QUESTIONS, ...BRANCHOPS_QUESTIONS];

const BY_KEY = new Map(JEV_QUESTIONS.map((question) => [question.key, question] as const));

export function getJevQuestion(key: string): JevQuestion | undefined {
  return BY_KEY.get(key);
}

export function jevQuestionsForFeature(feature: string): JevQuestion[] {
  return JEV_QUESTIONS.filter((question) => question.feature === feature);
}
