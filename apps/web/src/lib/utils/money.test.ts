import { describe, expect, it } from "vitest";
import {
  addMoney,
  exponentFor,
  formatMoney,
  fromMajor,
  maxMoney,
  minMoney,
  money,
  negateMoney,
  parseMoneyInput,
  subMoney,
  toMajor,
  zeroMoney,
} from "./money";

describe("currency exponents", () => {
  it("uses three decimal places for JOD and the Gulf dinars", () => {
    expect(exponentFor("JOD")).toBe(3);
    expect(exponentFor("KWD")).toBe(3);
    expect(exponentFor("BHD")).toBe(3);
    expect(exponentFor("OMR")).toBe(3);
  });

  it("uses two decimal places for USD, EUR and the Gulf riyals", () => {
    expect(exponentFor("USD")).toBe(2);
    expect(exponentFor("SAR")).toBe(2);
    expect(exponentFor("AED")).toBe(2);
  });

  it("is case-insensitive and falls back to two places for unknown currencies", () => {
    expect(exponentFor("jod")).toBe(3);
    expect(exponentFor("XYZ")).toBe(2);
  });
});

describe("minor/major conversion", () => {
  it("treats JOD 40.000 as 40000 minor units", () => {
    expect(fromMajor(40, "JOD")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(toMajor(money(40_000))).toBe(40);
  });

  it("round-trips fractional dinars without drift", () => {
    expect(fromMajor(42.75, "JOD")).toEqual({ amount: 42_750, currency: "JOD" });
    expect(toMajor(money(42_750))).toBe(42.75);
  });

  it("rounds to whole minor units rather than storing fractions", () => {
    expect(fromMajor(10.0004, "JOD").amount).toBe(10_000);
    expect(fromMajor(10.0006, "JOD").amount).toBe(10_001);
    expect(fromMajor(1.006, "USD").amount).toBe(101);
    expect(fromMajor(1.004, "USD").amount).toBe(100);
  });

  it("stays exact for the amounts a gym actually charges", () => {
    // Prices are entered in major units but stored as integers, so no amount a
    // receptionist can type should drift. Half-minor-unit inputs are not
    // reachable from the UI (inputs are fixed to the currency's exponent).
    for (const major of [5, 10, 12.5, 25, 40, 42.75, 60, 105, 190, 1250.125]) {
      expect(toMajor(fromMajor(major, "JOD"))).toBe(major);
    }
  });

  it("respects a two-decimal currency", () => {
    expect(fromMajor(40, "USD")).toEqual({ amount: 4_000, currency: "USD" });
  });
});

describe("formatMoney", () => {
  it("prints all three JOD decimals with the currency code", () => {
    expect(formatMoney(money(40_000))).toContain("40.000");
    expect(formatMoney(money(40_000))).toContain("JOD");
  });

  it("can drop the currency code for use inside a labelled column", () => {
    expect(formatMoney(money(40_000), { hideCurrency: true })).toBe("40.000");
  });

  it("keeps trailing zeros so amounts stay column-aligned", () => {
    expect(formatMoney(money(5_000), { hideCurrency: true })).toBe("5.000");
    expect(formatMoney(money(5_500), { hideCurrency: true })).toBe("5.500");
  });

  it("compacts only above a thousand, for dashboards", () => {
    expect(formatMoney(money(12_500_000), { compact: true, hideCurrency: true })).toBe("12.5K");
    expect(formatMoney(money(999_000), { compact: true, hideCurrency: true })).toBe("999.000");
  });

  it("formats zero without a special case", () => {
    expect(formatMoney(zeroMoney(), { hideCurrency: true })).toBe("0.000");
  });
});

describe("parseMoneyInput", () => {
  it("accepts whole, one-decimal and three-decimal entry", () => {
    expect(parseMoneyInput("40")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("40.5")).toEqual({ amount: 40_500, currency: "JOD" });
    expect(parseMoneyInput("40.000")).toEqual({ amount: 40_000, currency: "JOD" });
  });

  it("strips currency symbols and thousands separators typed by staff", () => {
    expect(parseMoneyInput("JOD 1,250.000")).toEqual({ amount: 1_250_000, currency: "JOD" });
  });

  it("returns null for input that is not a number yet", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput(".")).toBeNull();
    expect(parseMoneyInput("-")).toBeNull();
  });
});

describe("arithmetic", () => {
  it("adds and subtracts within one currency", () => {
    expect(addMoney(money(1_000), money(2_500))).toEqual({ amount: 3_500, currency: "JOD" });
    expect(subMoney(money(2_500), money(1_000))).toEqual({ amount: 1_500, currency: "JOD" });
  });

  it("allows a negative result so refunds and shortages can be represented", () => {
    expect(subMoney(money(1_000), money(2_500)).amount).toBe(-1_500);
    expect(negateMoney(money(1_000)).amount).toBe(-1_000);
  });

  it("refuses to mix currencies instead of producing a wrong total", () => {
    expect(() => addMoney(money(1_000, "JOD"), money(1_000, "USD"))).toThrow(/currency mismatch/i);
    expect(() => subMoney(money(1_000, "JOD"), money(1_000, "USD"))).toThrow(/currency mismatch/i);
  });

  it("picks minimum and maximum for clamping collected amounts", () => {
    expect(minMoney(money(1_000), money(2_000)).amount).toBe(1_000);
    expect(maxMoney(money(1_000), money(2_000)).amount).toBe(2_000);
  });
});
