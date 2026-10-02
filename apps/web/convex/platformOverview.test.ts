import { describe, expect, it } from "vitest";
import { buildPlatformOverview } from "./platformOverview";

describe("buildPlatformOverview", () => {
  it("derives platform totals and queue items from persisted facts", () => {
    const overview = buildPlatformOverview({
      now: Date.parse("2026-08-10T00:00:00.000Z"),
      gyms: [
        { id: "gym-active", subscriptionStatus: "active", provisioned: true },
        { id: "gym-trial", subscriptionStatus: "trial", trialEndsAt: "2026-08-20T00:00:00.000Z", provisioned: true },
        { id: "gym-overdue", subscriptionStatus: "overdue", provisioned: true },
      ],
      organizations: [
        { id: "org-active", status: "active", subscriptionPlan: "Growth", provisioned: true },
        { id: "org-trial", status: "trial", subscriptionPlan: "Starter", provisioned: true },
        { id: "org-overdue", status: "past_due", subscriptionPlan: "Pro", provisioned: true },
      ],
      plans: [
        { name: "Starter", priceMinor: 79_000 },
        { name: "Growth", priceMinor: 149_000 },
        { name: "Pro", priceMinor: 249_000 },
      ],
      branches: [{ organizationId: "org-active", active: true, status: "active" }, { organizationId: "org-trial", active: false, status: "inactive" }],
      members: [{ organizationId: "org-active", status: "active" }, { organizationId: "org-active", status: "archived" }],
      staffMemberships: [{ organizationId: "org-active", active: true }, { organizationId: "org-overdue", active: false }],
      bookings: [{ gymId: "gym-active", status: "requested" }, { gymId: "gym-active", status: "converted" }],
      applications: [{ id: "app-1", gymName: "North Gym", plan: "Growth", status: "pending", updatedAt: "2026-08-10T10:00:00.000Z" }],
      invoices: [
        { id: "inv-paid", gymId: "gym-active", gym: "North Gym", amountMinor: 149_000, currency: "JOD", status: "paid", issuedAt: "2026-07-31T11:00:00.000Z" },
        { id: "inv-due", gymId: "gym-overdue", gym: "South Gym", amount: "JD 79.000", status: "past_due", issuedAt: "2026-08-10T11:00:00.000Z", occurredAt: "2026-08-10T11:00:00.000Z" },
      ],
      supportCases: [{ id: "case-1", gymId: "gym-active", gym: "North Gym", subject: "Access issue", priority: "urgent", status: "open", createdAt: "2026-08-10T12:00:00.000Z" }],
    });

    expect(overview.gymCounts).toEqual({ trial: 1, active: 1, past_due: 1, suspended: 0, cancelled: 0 });
    expect(overview.branchCount).toBe(1);
    expect(overview.memberCount).toBe(1);
    expect(overview.activeStaffCount).toBe(1);
    expect(overview.activeMrr).toEqual({ amount: 149_000, currency: "JOD" });
    expect(overview.invoiceTotals).toEqual({
      collected: { amount: 149_000, currency: "JOD" },
      outstanding: { amount: 79_000, currency: "JOD" },
      overdue: { amount: 79_000, currency: "JOD" },
    });
    expect(overview.billingCurrencyMismatches).toBe(0);
    expect(overview.trialRequests).toBe(2);
    expect(overview.trialConversions).toBe(1);
    expect(overview).toMatchObject({ pendingApplications: 1, provisioningFailures: 0, pastDueAccounts: 1, trialsExpiringSoon: 1, openSupportCases: 1, urgentSupportCases: 1 });
    expect(overview.billingHistory).toEqual([
      { month: "2026-08", issued: { amount: 79_000, currency: "JOD" }, collected: { amount: 0, currency: "JOD" }, outstanding: { amount: 79_000, currency: "JOD" } },
      { month: "2026-07", issued: { amount: 149_000, currency: "JOD" }, collected: { amount: 149_000, currency: "JOD" }, outstanding: { amount: 0, currency: "JOD" } },
    ]);
    expect(overview.operatorQueue.map((item) => item.id)).toEqual(["support:case-1", "invoice:inv-due", "application:app-1"]);
  });

  it("counts annual tenants at their discounted effective monthly rate", () => {
    const overview = buildPlatformOverview({
      gyms: [],
      organizations: [
        { id: "org-monthly", status: "active", subscriptionPlan: "Growth", billingInterval: "monthly", provisioned: true },
        { id: "org-annual", status: "active", subscriptionPlan: "Growth", billingInterval: "annual", provisioned: true },
      ],
      plans: [{ name: "Growth", priceMinor: 149_000 }],
      branches: [], members: [], staffMemberships: [], bookings: [], applications: [], invoices: [], supportCases: [],
    });

    // Annual = 12 months at the published 20% saving, so the effective
    // monthly rate is price × 0.8 — never the headline monthly price.
    expect(overview.activeMrr).toEqual({ amount: 149_000 + Math.round(149_000 * 0.8), currency: "JOD" });
  });

  it("does not manufacture totals or queue entries for an empty deployment", () => {
    const overview = buildPlatformOverview({
      gyms: [], organizations: [], plans: [], branches: [], members: [], staffMemberships: [], bookings: [], applications: [], invoices: [], supportCases: [],
    });

    expect(overview.activeMrr).toEqual({ amount: 0, currency: "JOD" });
    expect(overview.invoiceTotals.collected.amount).toBe(0);
    expect(overview.billingHistory).toEqual([]);
    expect(overview.operatorQueue).toEqual([]);
  });

  it("fails closed for unprovisioned records and ignores stale entitlement plans", () => {
    const overview = buildPlatformOverview({
      gyms: [
        { id: "gym-live", subscriptionStatus: "active", provisioned: true },
        { id: "gym-cleanup", subscriptionStatus: "suspended", provisioned: false },
      ],
      organizations: [
        { id: "org-live", status: "active", subscriptionPlan: "Pro", entitlementPlan: "Starter", provisioned: true },
        { id: "org-suspended", status: "suspended", subscriptionPlan: "Enterprise", provisioned: true },
      ],
      plans: [
        { name: "Starter", priceMinor: 79_000 },
        { name: "Pro", priceMinor: 249_000 },
        { name: "Enterprise", priceMinor: 500_000 },
      ],
      branches: [
        { organizationId: "org-live", active: true, status: "active" },
        { organizationId: "org-suspended", active: true, status: "active" },
        { active: true, status: "active" },
      ],
      members: [
        { organizationId: "org-live", status: "active" },
        { organizationId: "org-suspended", status: "active" },
        { status: "active" },
      ],
      staffMemberships: [
        { organizationId: "org-live", active: true },
        { organizationId: "org-suspended", active: true },
        { active: true },
      ],
      bookings: [
        { gymId: "gym-live", status: "requested" },
        { gymId: "gym-cleanup", status: "converted" },
        { status: "converted" },
      ],
      applications: [],
      invoices: [
        { id: "live", gymId: "gym-live", amountMinor: 249_000, currency: "JOD", status: "paid" },
        { id: "cleanup", gymId: "gym-cleanup", amountMinor: 500_000, currency: "JOD", status: "past_due" },
        { id: "unlinked", amountMinor: 500_000, currency: "JOD", status: "past_due" },
      ],
      supportCases: [
        { id: "live-case", gymId: "gym-live", status: "open", priority: "normal" },
        { id: "cleanup-case", gymId: "gym-cleanup", status: "open", priority: "urgent" },
        { id: "unlinked-case", status: "open", priority: "urgent" },
      ],
    });

    expect(overview.gymCounts).toEqual({ trial: 0, active: 1, past_due: 0, suspended: 0, cancelled: 0 });
    expect(overview.activeMrr).toEqual({ amount: 249_000, currency: "JOD" });
    expect(overview.branchCount).toBe(1);
    expect(overview.memberCount).toBe(1);
    expect(overview.activeStaffCount).toBe(1);
    expect(overview.trialRequests).toBe(1);
    expect(overview.trialConversions).toBe(0);
    expect(overview.invoiceTotals.collected).toEqual({ amount: 249_000, currency: "JOD" });
    expect(overview.invoiceTotals.overdue).toEqual({ amount: 0, currency: "JOD" });
    expect(overview.openSupportCases).toBe(1);
    expect(overview.urgentSupportCases).toBe(0);
    expect(overview.operatorQueue.map((item) => item.id)).toEqual(["support:live-case"]);
  });

  it("excludes non-JOD and ambiguous legacy invoices instead of relabeling them as JOD", () => {
    const overview = buildPlatformOverview({
      now: Date.parse("2026-08-10T00:00:00.000Z"),
      gyms: [{ id: "gym-active", subscriptionStatus: "active", provisioned: true }],
      organizations: [{ id: "org-active", status: "active", subscriptionPlan: "Starter", provisioned: true }],
      plans: [],
      branches: [],
      members: [],
      staffMemberships: [],
      bookings: [],
      applications: [],
      invoices: [
        { id: "jod-paid", gymId: "gym-active", amountMinor: 100_000, currency: "JOD", status: "paid", issuedAt: "2026-08-01T00:00:00.000Z" },
        { id: "legacy-jd", gymId: "gym-active", amount: "JD 10.000", status: "paid", issuedAt: "2026-08-02T00:00:00.000Z" },
        { id: "usd-paid", gymId: "gym-active", amountMinor: 50_000, currency: "USD", status: "paid", issuedAt: "2026-08-03T00:00:00.000Z" },
        { id: "legacy-usd", gymId: "gym-active", amount: "USD 75.00", status: "past_due", issuedAt: "2026-08-04T00:00:00.000Z" },
        { id: "ambiguous", gymId: "gym-active", amount: "75.00", status: "paid", issuedAt: "2026-08-05T00:00:00.000Z" },
      ],
      supportCases: [],
    });

    expect(overview.billingCurrencyMismatches).toBe(3);
    expect(overview.invoiceTotals).toEqual({
      collected: { amount: 110_000, currency: "JOD" },
      outstanding: { amount: 0, currency: "JOD" },
      overdue: { amount: 0, currency: "JOD" },
    });
    expect(overview.billingHistory.every((month) => month.issued.currency === "JOD")).toBe(true);
    expect(overview.operatorQueue).toEqual([]);
  });
});
