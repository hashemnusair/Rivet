export interface DashboardBranchScope {
  id: string;
  name: string;
}

/**
 * Describe the dashboard scope from the authenticated branch access instead
 * of assuming the two-branch Forge preview tenant.
 */
export function dashboardScopeDescription(branches: readonly DashboardBranchScope[], activeBranchId?: string): string {
  if (activeBranchId) {
    const branch = branches.find((item) => item.id === activeBranchId);
    return branch ? `Showing ${branch.name} only.` : "Showing selected branch only.";
  }
  if (branches.length === 0) return "Loading your branch access.";
  if (branches.length === 1) return `Showing ${branches[0]!.name}.`;
  return `All ${branches.length} branches, consolidated.`;
}
