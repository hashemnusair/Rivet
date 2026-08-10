import { describe, expect, it } from "vitest";
import { buildPlatformOverview } from "./platformOverview";

describe("buildPlatformOverview", () => {
  it("derives platform totals and queue items from persisted facts", () => {
    const overview = buildPlatformOverview({
      now: Date.parse("2026-08-10T00:00:00.000Z"),
      gyms: [
        { id: "gym-active", subscriptionStatus: "active" },
        { id: "gym-trial", subscriptionStatus: "trial", trialEndsAt: "2026-08-20T00:00:00.000Z" },
        { id: "gym-overdue", subscriptionStatus: "overdue" },
      ],
      organizations: [
        { status: "active", subscriptionPlan: "Growth" },
        { status: "trial", subscriptionPlan: "Starter" },
        { status: "past_due", subscriptionPlan: "Pro" },
      ],
      plans: [
        { name: "Starter", priceMinor: 79_000 },
        { name: "Growth", priceMinor: 149_000 },
        { name: "Pro", priceMinor: 249_000 },
      ],
      branches: [{ active: true, status: "active" }, { active: false, status: "inactive" }],
      members: [{ status: "active" }, { status: "archived" }],
      staffMemberships: [{ active: true }, { active: false }],
      bookings: [{ status: "requested" }, { status: "converted" }],
      applications: [{ id: "app-1", gymName: "North Gym", plan: "Growth", status: "pending", updatedAt: "2026-08-10T10:00:00.000Z" }],
      invoices: [
        { id: "inv-paid", gymId: "gym-active", gym: "North Gym", amountMinor: 149_000, currency: "JOD", status: "paid", issuedAt: "2026-07-31T11:00:00.000Z" },
        { id: "inv-due", gymId: "gym-overdue", gym: "South Gym", amount: "JD 79.000", status: "past_due", issuedAt: "2026-08-10T11:00:00.000Z", occurredAt: "2026-08-10T11:00:00.000Z" },
      ],
      supportCases: [{ id: "case-1", gym: "North Gym", subject: "Access issue", priority: "urgent", status: "open", createdAt: "2026-08-10T12:00:00.000Z" }],
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
    expect(overview.trialRequests).toBe(2);
    expect(overview.trialConversions).toBe(1);
    expect(overview).toMatchObject({ pendingApplications: 1, provisioningFailures: 0, pastDueAccounts: 1, trialsExpiringSoon: 1, openSupportCases: 1, urgentSupportCases: 1 });
    expect(overview.billingHistory).toEqual([
      { month: "2026-08", issued: { amount: 79_000, currency: "JOD" }, collected: { amount: 0, currency: "JOD" }, outstanding: { amount: 79_000, currency: "JOD" } },
      { month: "2026-07", issued: { amount: 149_000, currency: "JOD" }, collected: { amount: 149_000, currency: "JOD" }, outstanding: { amount: 0, currency: "JOD" } },
    ]);
    expect(overview.operatorQueue.map((item) => item.id)).toEqual(["support:case-1", "invoice:inv-due", "application:app-1"]);
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
});
