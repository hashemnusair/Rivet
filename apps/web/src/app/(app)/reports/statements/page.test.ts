import { describe, expect, it } from "vitest";
import { managementStatementsRedirectTarget } from "./legacy-statements-route";

describe("legacy management statements route", () => {
  it("redirects to the canonical ledger home while preserving report scope", () => {
    expect(managementStatementsRedirectTarget({ fromDate: "2026-08-01", toDate: "2026-08-20", branchId: "branch-abdoun" }))
      .toBe("/finance?fromDate=2026-08-01&toDate=2026-08-20&branchId=branch-abdoun");
  });

  it("drops unrelated query values from the compatibility route", () => {
    expect(managementStatementsRedirectTarget({ tab: "gm-analysis", from: "2026-08-01" }))
      .toBe("/finance?from=2026-08-01");
  });
});
