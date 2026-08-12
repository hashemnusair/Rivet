import { describe, expect, it } from "vitest";
import { ptAvailableCredits, ptBookingCreditConsequence, ptCancellationResult, ptIntervalsOverlap, ptPackageLadderIsValid, ptRefundMinor, selectPtEntitlement } from "./personal-training";
import type { PtEntitlement, PtPackage } from "./types";

const money = (amount: number) => ({ amount, currency: "JOD" });
const pkg = (sessionCount: 12 | 20 | 30, amount: number): PtPackage => ({ id: String(sessionCount), organizationId: "org", name: `${sessionCount} sessions`, sessionCount, totalPrice: money(amount), validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" });
const entitlement = (overrides: Partial<PtEntitlement>): PtEntitlement => ({ id: crypto.randomUUID(), organizationId: "org", memberId: "member", source: "package", granted: 12, reserved: 0, consumed: 0, revoked: 0, available: 12, expiresAt: "2026-12-31T23:59:59.999Z", status: "active", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z", ...overrides });

describe("personal training commercial rules", () => {
  it("derives available credits without allowing a negative balance", () => {
    expect(ptAvailableCredits({ granted: 12, reserved: 2, consumed: 7, revoked: 1 })).toBe(2);
    expect(ptAvailableCredits({ granted: 2, reserved: 2, consumed: 2, revoked: 0 })).toBe(0);
  });

  it("requires larger packages to have an equal or lower unit price", () => {
    expect(ptPackageLadderIsValid([pkg(12, 240_000), pkg(20, 360_000), pkg(30, 480_000)])).toBe(true);
    expect(ptPackageLadderIsValid([pkg(12, 120_000), pkg(20, 220_000)])).toBe(false);
  });

  it("allocates proportional integer refunds without losing the final remainder", () => {
    const first = ptRefundMinor({ packageTotalMinor: 100_000, totalSessions: 12, alreadyRefundedSessions: 0, sessionsToRefund: 1 });
    const rest = ptRefundMinor({ packageTotalMinor: 100_000, totalSessions: 12, alreadyRefundedSessions: 1, sessionsToRefund: 11 });
    expect(first + rest).toBe(100_000);
  });

  it("restores timely and gym cancellations while consuming late cancellations", () => {
    const startsAt = Date.parse("2026-08-12T12:00:00.000Z");
    expect(ptCancellationResult({ startsAt, cancelledAt: Date.parse("2026-08-11T20:00:00.000Z"), cutoffHours: 12, cancelledByGym: false })).toEqual({ status: "cancelled", restoreCredit: true });
    expect(ptCancellationResult({ startsAt, cancelledAt: Date.parse("2026-08-12T06:00:00.000Z"), cutoffHours: 12, cancelledByGym: false })).toEqual({ status: "late_cancelled", restoreCredit: false });
    expect(ptCancellationResult({ startsAt, cancelledAt: startsAt, cutoffHours: 12, cancelledByGym: true })).toEqual({ status: "gym_cancelled", restoreCredit: true });
  });

  it("states the credit consequence before each booking outcome", () => {
    const startsAt = "2026-08-12T12:00:00.000Z";
    expect(ptBookingCreditConsequence({ action: "completed", startsAt })).toMatchObject({ effect: "consume" });
    expect(ptBookingCreditConsequence({ action: "no_show", startsAt })).toMatchObject({ effect: "consume" });
    expect(ptBookingCreditConsequence({ action: "cancelled", startsAt, cancelledAt: "2026-08-11T20:00:00.000Z" })).toMatchObject({ effect: "return" });
    expect(ptBookingCreditConsequence({ action: "cancelled", startsAt, cancelledAt: "2026-08-12T06:00:00.000Z" })).toMatchObject({ effect: "consume" });
  });

  it("detects overlap and selects the soonest-expiring eligible credit", () => {
    expect(ptIntervalsOverlap({ startsAt: 10, endsAt: 20 }, { startsAt: 19, endsAt: 30 })).toBe(true);
    expect(ptIntervalsOverlap({ startsAt: 10, endsAt: 20 }, { startsAt: 20, endsAt: 30 })).toBe(false);
    const later = entitlement({ source: "included", expiresAt: "2026-12-31T23:59:59.999Z" });
    const sooner = entitlement({ source: "package", expiresAt: "2026-10-01T23:59:59.999Z" });
    expect(selectPtEntitlement([later, sooner], Date.parse("2026-09-01T12:00:00.000Z"))).toBe(sooner);
  });

  it("does not expose credits scheduled for a future membership term", () => {
    const current = entitlement({ startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-08-31T23:59:59.999Z" });
    const future = entitlement({ source: "included", startsAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-30T23:59:59.999Z" });

    expect(selectPtEntitlement([future, current], Date.parse("2026-08-15T12:00:00.000Z"))).toBe(current);
    expect(selectPtEntitlement([future], Date.parse("2026-08-15T12:00:00.000Z"))).toBeUndefined();
    expect(selectPtEntitlement([future], Date.parse("2026-09-15T12:00:00.000Z"))).toBe(future);
  });
});
