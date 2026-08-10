import { describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_PLANS, resolveApplicationPlans } from "./application-plans";

describe("public gym application plan availability", () => {
  it("keeps approved launch choices available when the live catalog is empty", () => {
    expect(resolveApplicationPlans([])).toEqual(DEFAULT_APPLICATION_PLANS);
  });

  it("prefers the live catalog when it is available", () => {
    const live = [{ ...DEFAULT_APPLICATION_PLANS[0]!, priceMinor: 81_000 }];
    expect(resolveApplicationPlans(live)).toEqual(live);
  });
});
