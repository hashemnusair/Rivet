import { describe, expect, it } from "vitest";
import { checkpointForDays, consentForRenewalChannel, isRenewalQuietHours, nextRenewalQuietHoursEnd, renewalDedupeKey, renewalMessageSuppressionReason, renewalStopReason } from "./renewalPolicy";

describe("renewal policy", () => {
  it("selects only the exact approved checkpoints", () => {
    expect(checkpointForDays(14)?.key).toBe("14_day");
    expect(checkpointForDays(7)?.key).toBe("7_day");
    expect(checkpointForDays(3)?.key).toBe("3_day");
    expect(checkpointForDays(1)?.key).toBe("1_day_call");
    expect(checkpointForDays(2)).toBeUndefined();
  });

  it("requires attributable opt-in and preserves an explicit opt-out", () => {
    expect(consentForRenewalChannel({ marketingOptIn: true }, "whatsapp").status).toBe("unknown");
    expect(consentForRenewalChannel({ marketingPreference: { optedIn: true, source: "member_selected" } }, "whatsapp").status).toBe("explicit_opt_in");
    expect(consentForRenewalChannel({ marketingPreferenceStatus: "explicit_opt_out" }, "sms").channelOptedOut).toBe(true);
    expect(consentForRenewalChannel({ marketingPreference: { optedIn: true, source: "member_selected" }, smsOptedOut: true }, "sms").status).toBe("explicit_opt_out");
  });

  it("returns safe message suppression reasons", () => {
    expect(renewalMessageSuppressionReason("explicit_opt_in", undefined)).toContain("phone");
    expect(renewalMessageSuppressionReason("unknown", "+962790000000")).toContain("consent");
    expect(renewalMessageSuppressionReason("explicit_opt_out", "+962790000000")).toContain("opted out");
    expect(renewalMessageSuppressionReason("explicit_opt_in", "+962790000000")).toBeUndefined();
  });

  it("deduplicates by tenant, membership term, checkpoint, channel, and policy", () => {
    const key = renewalDedupeKey({ organizationId: "org-a", membershipId: "membership-a", membershipEndDate: "2026-08-26", checkpoint: "14_day", channel: "whatsapp" });
    expect(key).toBe("renewal:org-a:membership-a:2026-08-26:14_day:whatsapp:renewal-policy-v1");
    expect(key).toBe(renewalDedupeKey({ organizationId: "org-a", membershipId: "membership-a", membershipEndDate: "2026-08-26", checkpoint: "14_day", channel: "whatsapp" }));
    expect(key).not.toBe(renewalDedupeKey({ organizationId: "org-a", membershipId: "membership-a", membershipEndDate: "2026-09-26", checkpoint: "14_day", channel: "whatsapp" }));
    expect(key).not.toBe(renewalDedupeKey({ organizationId: "org-b", membershipId: "membership-a", membershipEndDate: "2026-08-26", checkpoint: "14_day", channel: "whatsapp" }));
  });

  it("defers during tenant quiet hours and returns the next safe minute", () => {
    const quietNow = new Date("2026-08-12T23:30:00.000Z");
    expect(isRenewalQuietHours("UTC", "22:00", "08:00", quietNow)).toBe(true);
    const deferredUntil = nextRenewalQuietHoursEnd(quietNow.getTime(), "UTC", "22:00", "08:00");
    expect(new Date(deferredUntil).toISOString()).toBe("2026-08-13T08:00:00.000Z");
    expect(isRenewalQuietHours("UTC", "22:00", "08:00", new Date(deferredUntil))).toBe(false);
  });

  it("stops a journey for renewals, cancellation, freeze, archive, and expiry", () => {
    const base = { startDate: "2026-08-01", endDate: "2026-08-20" };
    const member = { status: "active" };
    expect(renewalStopReason({ membership: base, member, today: "2026-08-06", hasSuccessor: true })).toBe("membership_renewed");
    expect(renewalStopReason({ membership: { ...base, cancelledAt: "2026-08-06T10:00:00Z" }, member, today: "2026-08-06" })).toBe("membership_cancelled");
    expect(renewalStopReason({ membership: { ...base, activeFreeze: { status: "active", startDate: "2026-08-06", endDate: "2026-08-09" } }, member, today: "2026-08-07" })).toBe("membership_frozen");
    expect(renewalStopReason({ membership: base, member: { status: "archived" }, today: "2026-08-06" })).toBe("member_not_active");
    expect(renewalStopReason({ membership: base, member, today: "2026-08-21" })).toBe("membership_expired");
  });
});
