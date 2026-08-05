import { describe, expect, it } from "vitest";
import { isQuietHours, triggerMatches } from "./automations";

describe("automation scheduling invariants", () => {
  it("handles quiet hours that cross midnight in the tenant timezone", () => {
    expect(isQuietHours("Asia/Amman", "22:00", "08:00", new Date("2026-08-04T20:30:00.000Z"))).toBe(true);
    expect(isQuietHours("Asia/Amman", "22:00", "08:00", new Date("2026-08-04T10:00:00.000Z"))).toBe(false);
  });

  it("matches expiry thresholds exactly, so the daily dedupe key is sufficient", () => {
    const rule = { trigger: "membership_expiring", triggerParams: { daysBefore: [7, 3] } };
    expect(triggerMatches(rule, { endDate: "2026-08-11" }, "2026-08-04")).toBe(true);
    expect(triggerMatches(rule, { endDate: "2026-08-10" }, "2026-08-04")).toBe(false);
  });
});
