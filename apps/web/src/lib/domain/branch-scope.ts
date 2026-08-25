/**
 * Branch selection helpers shared by branch-scoped workspaces.
 *
 * `undefined` is the intentional representation of the organization-wide
 * read-only scope. Mutating surfaces must call `visibleBranchId` and refuse to
 * submit when it returns undefined; they must never substitute the first
 * branch in the session.
 */

export type BranchRef = { id: string };

/** Return a branch only when it is a concrete, currently visible option. */
export function visibleBranchId(
  branches: readonly BranchRef[] | undefined,
  branchId: string | undefined | null,
): string | undefined {
  const candidate = branchId?.trim();
  if (!candidate || !branches?.some((branch) => branch.id === candidate)) return undefined;
  return candidate;
}

export function hasVisibleBranch(
  branches: readonly BranchRef[] | undefined,
  branchId: string | undefined | null,
): boolean {
  return visibleBranchId(branches, branchId) !== undefined;
}
