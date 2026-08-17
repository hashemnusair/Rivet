export interface DashboardBranchScope {
  id: string;
  name: string;
}

/**
 * Which branches the dashboard is showing. Returns a catalogue key and its
 * variables rather than a sentence, so the same decision serves both languages
 * — the branch name is data and travels as a variable, while the wording around
 * it is translated at render.
 */
export type DashboardScope =
  | { key: "selectedNamed"; vars: { branch: string } }
  | { key: "selectedUnnamed"; vars?: undefined }
  | { key: "loading"; vars?: undefined }
  | { key: "single"; vars: { branch: string } }
  | { key: "consolidated"; vars: { count: number } };

export function dashboardScope(
  branches: readonly DashboardBranchScope[],
  activeBranchId?: string,
): DashboardScope {
  if (activeBranchId) {
    const branch = branches.find((item) => item.id === activeBranchId);
    return branch ? { key: "selectedNamed", vars: { branch: branch.name } } : { key: "selectedUnnamed" };
  }
  if (branches.length === 0) return { key: "loading" };
  if (branches.length === 1) return { key: "single", vars: { branch: branches[0]!.name } };
  return { key: "consolidated", vars: { count: branches.length } };
}
