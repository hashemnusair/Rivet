import { automationRuleIds } from "@/lib/mock/prerender-ids";
import RuleEditorPageClient from "./rule-editor.client";

/**
 * Server shell. Exists only to hold `generateStaticParams()`, which a
 * "use client" file may not export — the whole view is client-rendered below.
 *
 * In mock mode the demo tenant is rebuilt from a deterministic seed on every
 * cold load, so prerendering the seeded ids covers every id that can resolve on
 * a fresh request. See lib/mock/prerender-ids.ts.
 */
export function generateStaticParams() {
  return automationRuleIds().map((ruleId) => ({ ruleId }));
}

export default function RuleEditorPage() {
  return <RuleEditorPageClient />;
}
