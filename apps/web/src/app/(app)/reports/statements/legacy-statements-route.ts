type LegacySearchParams = Record<string, string | string[] | undefined>;

/** Keep old statement bookmarks useful while making /finance canonical. */
export function managementStatementsRedirectTarget(searchParams: LegacySearchParams): string {
  const query = new URLSearchParams();
  for (const key of ["from", "to", "fromDate", "toDate", "branchId"]) {
    const value = searchParams[key];
    if (typeof value === "string" && value) query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }
  const suffix = query.toString();
  return suffix ? `/finance?${suffix}` : "/finance";
}
