import { describe, expect, it } from "vitest";
import { INVALIDATE_ALL } from "./keys";

describe("central query invalidation", () => {
  it("refreshes ledger and statement projections after financial mutations", () => {
    expect(INVALIDATE_ALL).toEqual(expect.arrayContaining(["finance", "managementReports"]));
  });
});
