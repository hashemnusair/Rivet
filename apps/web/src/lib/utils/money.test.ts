import { describe, expect, it } from "vitest";
import {
  addMoney,
  exponentFor,
  formatMoney,
  fromMajor,
  maxMoney,
  minMoney,
  money,
  moneyInputError,
  negateMoney,
  parseMoneyInput,
  readMoneyInput,
  subMoney,
  toMajor,
  toMajorString,
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

describe("toMajorString", () => {
  it("prints the currency's own precision without grouping", () => {
    expect(toMajorString(money(40_000))).toBe("40.000");
    expect(toMajorString(money(1_250_125))).toBe("1250.125");
    expect(toMajorString(money(4_050, "USD"))).toBe("40.50");
    expect(toMajorString(money(5))).toBe("0.005");
    expect(toMajorString(money(-40_000))).toBe("-40.000");
  });
});

describe("readMoneyInput policy", () => {
  it("translates Arabic-Indic digits and separators one-to-one", () => {
    expect(readMoneyInput("٤٠٫٥٠٠")).toEqual({ ok: true, money: { amount: 40_500, currency: "JOD" } });
    expect(readMoneyInput("١٬٢٥٠")).toEqual({ ok: true, money: { amount: 1_250_000, currency: "JOD" } });
    expect(readMoneyInput("۴۰")).toEqual({ ok: true, money: { amount: 40_000, currency: "JOD" } });
  });

  it("strips the gym's own currency however it was typed", () => {
    expect(parseMoneyInput("JD 40")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("JOD40")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("40JOD")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("40 jod")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("40 د.ا")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("$ 40", "USD")).toEqual({ amount: 4_000, currency: "USD" });
  });

  it("rejects another currency instead of treating its number as ours", () => {
    const result = readMoneyInput("USD 40");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem).toBe("currency_mismatch");
      expect(result.message).toMatch(/JOD, not USD/);
    }
    expect(parseMoneyInput("$40")).toBeNull();
  });

  it("reads the complete US dollar alias as one currency label", () => {
    expect(parseMoneyInput("US$40.50", "USD")).toEqual({ amount: 4_050, currency: "USD" });
    expect(parseMoneyInput("40.50 us$", "USD")).toEqual({ amount: 4_050, currency: "USD" });
    expect(readMoneyInput("US$40.50", "JOD")).toMatchObject({ ok: false, problem: "currency_mismatch" });
  });

  it.each(["1JOD250", "1 JOD 250", "١د.ا٢٥٠", "40JOD.500", "1$250", "1US$250"])(
    "rejects a currency label inside the number: %s",
    (raw) => {
      expect(readMoneyInput(raw, raw.includes("$") ? "USD" : "JOD")).toMatchObject({ ok: false, problem: "not_a_number" });
    },
  );

  it("refuses the separators it cannot read rather than guessing", () => {
    for (const raw of ["1,2", "1.250,000", "1,2500", "1.250.000", "1 25"]) {
      const result = readMoneyInput(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(result.problem, raw).toBe("ambiguous_separator");
    }
    expect(parseMoneyInput("1 250.000")).toEqual({ amount: 1_250_000, currency: "JOD" });
  });

  it("does not silently reinterpret exponent notation or stray characters", () => {
    for (const raw of ["1e3", "1_000", "4o", "40 dollars"]) {
      const result = readMoneyInput(raw);
      expect(result.ok, raw).toBe(false);
      if (!result.ok) expect(["not_a_number", "currency_mismatch"]).toContain(result.problem);
    }
  });

  it("rejects negatives for amounts that must be paid, not credited", () => {
    const result = readMoneyInput("-40");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem).toBe("negative");
    expect(readMoneyInput("−40").ok).toBe(false);
  });

  it("rejects more decimals than the currency carries instead of rounding", () => {
    const jod = readMoneyInput("40.0005");
    expect(jod.ok).toBe(false);
    if (!jod.ok) expect(jod.problem).toBe("too_precise");
    const usd = readMoneyInput("1.006", "USD");
    expect(usd.ok).toBe(false);
    if (!usd.ok) expect(usd.message).toMatch(/2 decimal places/);
    // Trailing zeros lose nothing and are accepted.
    expect(parseMoneyInput("40.0000")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput("40.", "JOD")).toEqual({ amount: 40_000, currency: "JOD" });
    expect(parseMoneyInput(".5")).toEqual({ amount: 500, currency: "JOD" });
  });

  it("names the empty case separately so forms can say 'required'", () => {
    expect(readMoneyInput("")).toEqual({ ok: false, problem: "empty", message: "Enter an amount." });
    expect(readMoneyInput("   ")).toMatchObject({ ok: false, problem: "empty" });
    expect(moneyInputError("40")).toBeUndefined();
    expect(moneyInputError("abc")).toMatch(/as a number/);
  });

  it("keeps exact integers for the amounts the desk actually keys", () => {
    expect(parseMoneyInput("0.1")).toEqual({ amount: 100, currency: "JOD" });
    expect(parseMoneyInput("0.3")).toEqual({ amount: 300, currency: "JOD" });
    expect(parseMoneyInput("12.5")).toEqual({ amount: 12_500, currency: "JOD" });
    expect(parseMoneyInput("1250.125")).toEqual({ amount: 1_250_125, currency: "JOD" });
  });
});
