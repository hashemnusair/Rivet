import { describe, expect, it } from "vitest";
import { budgetBlocked } from "./model";

describe("model spend gate", () => {
  it("never blocks fixture or off modes, which cost nothing", () => {
    expect(budgetBlocked({ mode: "fixture" }, { monthMicros: 10 ** 12 })).toBeUndefined();
    expect(budgetBlocked({ mode: "off" }, { monthMicros: 0 })).toBeUndefined();
  });

  it("spends nothing live without an approved monthly budget", () => {
    expect(budgetBlocked({ mode: "live" }, { monthMicros: 0 })).toBe("budget_exhausted");
  });

  it("stops at the gym's monthly cap and at the run's cap", () => {
    const config = { mode: "live" as const, maxMonthlyCostMicros: 1_000_000, maxRunCostMicros: 50_000 };
    expect(budgetBlocked(config, { monthMicros: 999_999, runMicros: 49_999 })).toBeUndefined();
    expect(budgetBlocked(config, { monthMicros: 1_000_000 })).toBe("budget_exhausted");
    expect(budgetBlocked(config, { monthMicros: 10, runMicros: 50_000 })).toBe("budget_exhausted");
  });
});
