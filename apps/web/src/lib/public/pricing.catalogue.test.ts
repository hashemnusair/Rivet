import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_PRICING_PLANS, calculatePlanPrice } from "./pricing";
import { entitledModulesForPlan } from "@/lib/domain/workspace-modules";
import { PLAN_CATALOGUE, PLAN_TONE, termPriceMinor } from "../../../convex/planCatalogue";

/**
 * The public list is written out because its module is reached through the
 * mock's import cycle, where calling into another module at evaluation time
 * crashes the app. This holds it to the catalogue instead, so a price is still
 * only ever changed in one file.
 */
describe("public pricing follows the plan catalogue", () => {
  it("carries the same plans, prices, limits, tones and modules", () => {
    expect(DEFAULT_PUBLIC_PRICING_PLANS).toEqual(PLAN_CATALOGUE.map((plan) => ({
      ...plan,
      tone: PLAN_TONE[plan.name],
      entitledModules: entitledModulesForPlan(plan.name),
    })));
  });

  it("quotes the year at the same figure the invoice bills", () => {
    for (const plan of DEFAULT_PUBLIC_PRICING_PLANS) {
      expect(calculatePlanPrice(plan, "annual").annualTotalMinor).toBe(termPriceMinor(plan.priceMinor, "annual"));
    }
  });
});
