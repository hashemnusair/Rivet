import { describe, expect, it } from "vitest";
import { readSettingsNumber } from "./settings-number";

describe("settings numeric drafts", () => {
  it("normalizes both Arabic digit sets before enforcing whole-number limits", () => {
    expect(readSettingsNumber("١٢٠", { min: 1, max: 120 })).toBe(120);
    expect(readSettingsNumber("۱۲۱", { min: 1, max: 120 })).toBeNull();
    for (const raw of ["", " ", "1.5", "١٫٥", "1e2", "1,2", "-1", "Infinity", "9007199254740992"]) {
      expect(readSettingsNumber(raw, { min: 0 }), raw).toBeNull();
    }
  });
  it("keeps currency precision exact and accepts Arabic decimal separators", () => {
    expect(readSettingsNumber("٢٥٫١٢٥", { min: 0, max: 1000, decimalPlaces: 3 })).toBe(25.125);
    expect(readSettingsNumber("٢٥٫١٢٥١", { min: 0, max: 1000, decimalPlaces: 3 })).toBeNull();
    expect(readSettingsNumber("٢٥٫١٢٥", { min: 0, max: 1000, decimalPlaces: 2 })).toBeNull();
    expect(readSettingsNumber("۳۱", { min: 0, max: 30, decimalPlaces: "any" })).toBeNull();
    expect(readSettingsNumber("١٦٫٢٥", { min: 0, max: 30, decimalPlaces: "any" })).toBe(16.25);
  });
});
