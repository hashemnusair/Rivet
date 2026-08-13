import { describe, expect, it } from "vitest";
import { normalizeOperationalPolicies } from "./settings-sections";

describe("normalizeOperationalPolicies", () => {
  it("provides a safe canonical policy when the backend has no nested policy record", () => {
    expect(normalizeOperationalPolicies()).toEqual({
      entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: false },
      membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 },
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
      operatingHours: [],
      trialSchedules: [],
    });
  });

  it("fills missing weekdays while preserving legacy trial slots", () => {
    const policies = normalizeOperationalPolicies({
      entry: { outstandingBalance: "block", expiryWarningDays: 3, duplicateScanWindowMinutes: 4, enforceOperatingHours: true },
      membership: { allowOverlappingMemberships: true, renewalWindowDays: 10, minimumFreezeDays: 2, maximumExtensionDays: 60 },
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 14, cancellationCutoffHours: 6 },
      operatingHours: [{ branchId: "branch-1", days: { mon: { enabled: true, opensAt: "06:00", closesAt: "22:00" } } as never }],
      trialSchedules: [{ branchId: "branch-1", days: { mon: { slots: ["09:00"] } } as never }],
    });

    expect(policies.operatingHours[0]?.days.sun.enabled).toBe(true);
    expect(policies.operatingHours[0]?.days.mon.closesAt).toBe("22:00");
    expect(policies.trialSchedules[0]?.days.mon).toMatchObject({ enabled: true, opensAt: "09:00", closesAt: "10:00" });
  });
});
