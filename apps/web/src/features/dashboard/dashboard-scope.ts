import { useMemo } from "react";
import { translate } from "@/lib/i18n/dictionary";
import { useLocale } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/messages/en";

export interface DashboardBranchScope {
  id: string;
  name: string;
}

/**
 * Which branches the dashboard is showing. Returns a catalogue key and its
 * variables rather than a sentence, so the same decision serves both languages:
 * the branch name is data and travels as a variable, while the wording around
 * it is translated at render.
 */
export type DashboardScope =
  | { key: "selectedNamed"; vars: { branch: string } }
  | { key: "selectedUnnamed"; vars?: undefined }
  | { key: "loading"; vars?: undefined }
  | { key: "single"; vars: { branch: string } }
  | { key: "consolidated"; vars: { count: number } };

export function dashboardScope(branches: readonly DashboardBranchScope[], activeBranchId?: string): DashboardScope {
  if (activeBranchId) {
    const branch = branches.find((item) => item.id === activeBranchId);
    return branch ? { key: "selectedNamed", vars: { branch: branch.name } } : { key: "selectedUnnamed" };
  }
  if (branches.length === 0) return { key: "loading" };
  if (branches.length === 1) return { key: "single", vars: { branch: branches[0]!.name } };
  return { key: "consolidated", vars: { count: branches.length } };
}

/** The scope sentence in the reader's language (branch names isolated so Arabic cannot reorder them). */
export function useDashboardScopeText(branches: readonly DashboardBranchScope[], activeBranchId?: string): string {
  const { t, isolate, isolateLtr } = useLocale();
  const scope = dashboardScope(branches, activeBranchId);
  const branch = scope.vars && "branch" in scope.vars ? isolate(scope.vars.branch) : undefined;
  const count = scope.vars && "count" in scope.vars ? isolateLtr(scope.vars.count) : undefined;
  return t(`dashboard.scope.${scope.key}`, { ...(branch !== undefined ? { branch } : {}), ...(count !== undefined ? { count } : {}) });
}

/** English only. Kept for dashboards that have not moved to `useDashboardScopeText` yet. */
export function dashboardScopeDescription(branches: readonly DashboardBranchScope[], activeBranchId?: string): string {
  const scope = dashboardScope(branches, activeBranchId);
  return translate({ messages: en, fallback: en, locale: "en" }, `dashboard.scope.${scope.key}`, scope.vars);
}

export type DayPart = "morning" | "afternoon" | "evening";

export function timeOfDayPart(now: Date = new Date()): DayPart {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** English only. Kept for dashboards that have not moved to `useGreeting` yet. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  return translate({ messages: en, fallback: en, locale: "en" }, `dashboard.greeting.${timeOfDayPart(now)}`);
}

/** "Good morning, Dana" in the reader's language; the name is isolated so it cannot reorder the sentence. */
export function useGreeting(firstName: string, now?: Date): string {
  const { t, isolate } = useLocale();
  const part = timeOfDayPart(now);
  return useMemo(() => t("dashboard.greeting.withName", { greeting: t(`dashboard.greeting.${part}`), name: isolate(firstName) }), [t, isolate, part, firstName]);
}
