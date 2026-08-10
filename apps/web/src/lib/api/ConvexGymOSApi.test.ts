import { describe, expect, it, vi } from "vitest";
import { ConvexGymOSApi, type ConvexTransport, dataMode } from "./ConvexGymOSApi";
import { ApiError, ERR } from "./errors";
import type { CashShift, Session, ShiftTotals } from "@/lib/domain/types";

const session: Session = {
  user: { id: "10000000-0000-4a00-8a00-000000000010", name: "Omar Al-Khatib", email: "omar@example.com" },
  organization: { id: "10000000-0000-4a00-8a00-000000000001", name: "Forge Fitness", currency: "JOD", timezone: "Asia/Amman", locale: "en-JO" },
  branches: [{ id: "10000000-0000-4a00-8a00-000000000002", name: "Forge — Abdoun", code: "ABD" }],
  activeBranchId: "10000000-0000-4a00-8a00-000000000002",
  roles: ["owner"],
  permissions: ["members.read", "payments.collect"],
};

function transportFor(responses: { query?: unknown; mutation?: unknown; action?: unknown } = {}, onCall?: (kind: string, args: Record<string, unknown>) => void): ConvexTransport {
  return {
    query: async (_reference, args) => {
      onCall?.("query", args as unknown as Record<string, unknown>);
      if (responses.query instanceof Error) throw responses.query;
      return responses.query;
    },
    mutation: async (_reference, args) => {
      onCall?.("mutation", args as unknown as Record<string, unknown>);
      if (responses.mutation instanceof Error) throw responses.mutation;
      return responses.mutation;
    },
    action: async (_reference, args) => {
      onCall?.("action", args as unknown as Record<string, unknown>);
      if (responses.action instanceof Error) throw responses.action;
      return responses.action;
    },
  };
}

describe("ConvexGymOSApi contract boundary", () => {
  it("maps session calls and carries the selected tenant and branch", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ query: session }, (_kind, args) => calls.push(args)));

    await expect(api.getSession()).resolves.toEqual(session);
    await api.listMembers({ page: 1, pageSize: 20 });

    expect(calls[0]).toMatchObject({ operation: "session", correlationId: expect.any(String) });
    expect(calls[1]).toMatchObject({ operation: "members.list", organizationId: session.organization.id, activeBranchId: session.activeBranchId });
  });

  it("routes member marketing preferences through the authenticated mutation boundary", async () => {
    let mutationArgs: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: { id: "customer-1" } }, (_kind, args) => { mutationArgs = args; }));

    await expect(api.updateCustomerMarketingPreference({ optedIn: false, customerId: "customer-1" })).resolves.toEqual({ id: "customer-1" });
    expect(mutationArgs).toMatchObject({ operation: "customer.marketingPreference.update", input: { optedIn: false, customerId: "customer-1" } });
  });

  it("keeps idempotency keys inside the payment mutation boundary", async () => {
    let mutationArgs: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: {} }, (_kind, args) => { mutationArgs = args; }));

    await api.createPayment({ memberId: session.user.id, amount: { amount: 12_500, currency: "JOD" }, method: "card" }, "payment-key-1");

    expect(mutationArgs).toMatchObject({ operation: "payments.create", input: { idempotencyKey: "payment-key-1" } });
  });

  it("keeps offer drafting and delivery confirmation as separate mutations", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const offer = { id: "offer-1", leadId: "lead-1", planId: "plan-1", planName: "Growth", price: { amount: 149_000, currency: "JOD" as const }, status: "draft" as const, createdById: session.user.id, createdAt: "2026-08-09T18:00:00.000Z" };
    const delivered = { ...offer, status: "sent" as const, deliveryChannel: "email" as const, deliveredAt: "2026-08-09T18:01:00.000Z" };
    const api = new ConvexGymOSApi(transportFor({ mutation: delivered }, (_kind, args) => calls.push(args)));

    await expect(api.createOffer({ leadId: "lead-1", planId: "plan-1", price: offer.price, expiresInDays: 7 })).resolves.toBe(delivered);
    await expect(api.markOfferDelivered("offer-1", { channel: "email", reference: "manual-email-1" })).resolves.toBe(delivered);
    expect(calls[0]).toMatchObject({ operation: "offers.create", input: { leadId: "lead-1", planId: "plan-1" } });
    expect(calls[1]).toMatchObject({ operation: "offers.deliver", input: { offerId: "offer-1", channel: "email", reference: "manual-email-1" } });
  });

  it("unwraps the current-shift envelope for the cash-shift view", async () => {
    const shift: CashShift = {
      id: "50000000-0000-4a00-8a00-000000000001",
      organizationId: session.organization.id,
      branchId: session.activeBranchId!,
      openedById: session.user.id,
      openedByName: session.user.name,
      openedAt: "2026-08-09T18:12:00.000Z",
      openingFloat: { amount: 50_000, currency: "JOD" },
      varianceApprovalStatus: "none",
      status: "open",
    };
    const totals: ShiftTotals = {
      cashPayments: { amount: 0, currency: "JOD" },
      cashRefunds: { amount: 0, currency: "JOD" },
      cardPayments: { amount: 0, currency: "JOD" },
      transferPayments: { amount: 0, currency: "JOD" },
      otherPayments: { amount: 0, currency: "JOD" },
      paymentCount: 0,
      refundCount: 0,
      discountsTotal: { amount: 0, currency: "JOD" },
    };
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ query: { shift, totals } }, (_kind, args) => calls.push(args)));

    await expect(api.getCurrentCashShift(shift.branchId)).resolves.toEqual(shift);
    expect(calls[0]).toMatchObject({ operation: "shifts.current", input: { branchId: shift.branchId } });
  });

  it("returns no current shift when the current-shift envelope is empty", async () => {
    const api = new ConvexGymOSApi(transportFor({ query: null }));

    await expect(api.getCurrentCashShift(session.activeBranchId!)).resolves.toBeNull();
  });

  it("passes the selected gym ID through the platform detail boundary", async () => {
    const detail = {
      id: "gym-a",
      name: "Alpha Gym",
      shortName: "ALPHA",
      accent: "#111111",
      controls: { status: "active" as const, plan: "Growth" as const, isPublic: true },
      organization: { state: "available" as const, value: { id: "org-a", name: "Alpha Gym", status: "active" as const, currency: "JOD", timezone: "Asia/Amman" } },
      joinedAt: { state: "not_available" as const },
      branches: { state: "available" as const, value: [{ id: "branch-a", name: "Alpha Main", code: "MAIN", status: "active" as const }] },
      owner: { state: "available" as const, value: { name: "Alpha Owner", email: "owner@alpha.example" } },
      usage: {
        memberCount: { state: "available" as const, value: 7 },
        activeStaffCount: { state: "available" as const, value: 2 },
        staffLimit: { state: "not_configured" as const },
        automationRuleCount: { state: "available" as const, value: 3 },
        paymentTransactionCount: { state: "available" as const, value: 11 },
        storage: { state: "not_configured" as const },
      },
      subscription: {
        plan: { state: "available" as const, value: "Growth" as const },
        status: { state: "available" as const, value: "active" as const },
        startedAt: { state: "not_available" as const },
        recurringAmount: { state: "not_configured" as const },
        renewalDate: { state: "not_configured" as const },
        paymentMethod: { state: "not_configured" as const },
        invoices: { state: "not_configured" as const },
      },
      health: { state: "not_configured" as const },
      activity: { state: "available" as const, value: [] },
    };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ query: detail }, (_kind, args) => { call = args; }));

    await expect(api.getPlatformGymDetail("gym-a")).resolves.toEqual(detail);
    expect(call).toMatchObject({ operation: "platform.gym.detail", input: { gymId: "gym-a" } });
    expect(JSON.stringify(detail)).not.toContain("Beta");
  });

  it("routes operational policies and branch transfers through audited domain mutations", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ mutation: {} }, (_kind, args) => calls.push(args)));
    const days = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { enabled: true, opensAt: "06:00", closesAt: "23:00" }])) as import("@/lib/domain/types").OperationalPolicies["operatingHours"][number]["days"];

    await api.updateOperationalPolicies({
      entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: true },
      membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 },
      operatingHours: [{ branchId: session.activeBranchId!, days }],
    });
    await api.transferMembership("membership-1", { branchId: "branch-2", reason: "Member relocated" });

    expect(calls[0]).toMatchObject({ operation: "settings.operationalPolicies", input: { operationalPolicies: { entry: { enforceOperatingHours: true } } } });
    expect(calls[1]).toMatchObject({ operation: "memberships.transfer", input: { membershipId: "membership-1", branchId: "branch-2", reason: "Member relocated" } });
  });

  it("routes explicit membership plan changes with the effective-date policy", async () => {
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: {} }, (_kind, args) => { call = args; }));

    await api.changeMembershipPlan("membership-1", { planId: "plan-2", effectiveDate: "next_renewal", reason: "Member selected a different tier." });

    expect(call).toMatchObject({ operation: "memberships.plan_change", input: { membershipId: "membership-1", planId: "plan-2", effectiveDate: "next_renewal", reason: "Member selected a different tier." } });
  });

  it("keeps platform application review behind the platform query/action boundary", async () => {
    const application = {
      id: "20000000-0000-4a00-8a00-000000000001",
      gymName: "Northline Strength",
      ownerName: "Karim Haddad",
      email: "karim@northline.example",
      contactNumber: "+962 79 555 0144",
      plan: "Growth" as const,
      status: "approved" as const,
      notificationStatus: "sent" as const,
      reviewNotificationStatus: "sent" as const,
      submittedAt: "2026-08-06T08:42:00.000Z",
      updatedAt: "2026-08-06T09:00:00.000Z",
      reviewNotes: "Verified.",
    };
    const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
    const api = new ConvexGymOSApi(transportFor({ query: [], mutation: { ...application, reviewNotes: "Follow up." }, action: application }, (kind, args) => calls.push({ kind, args })));

    await expect(api.listGymApplications({ status: "pending" })).resolves.toEqual([]);
    await expect(api.reviewGymApplication({ applicationId: application.id, decision: "approved", note: "Verified." })).resolves.toEqual(application);
    expect(calls[0]).toMatchObject({ kind: "query", args: { operation: "platform.applications", input: { status: "pending" } } });
    expect(calls[1]).toMatchObject({ kind: "action", args: { applicationId: application.id, decision: "approved", note: "Verified.", correlationId: expect.any(String) } });
    await expect(api.saveGymApplicationReviewNote({ applicationId: application.id, note: "Follow up." })).resolves.toMatchObject({ id: application.id, reviewNotes: "Follow up." });
    expect(calls[2]).toMatchObject({ kind: "mutation", args: { operation: "platform.application.note", input: { applicationId: application.id, note: "Follow up." } } });
  });

  it("keeps gym provisioning behind the protected action boundary", async () => {
    const result = {
      applicationId: "20000000-0000-4a00-8a00-000000000001",
      status: "completed" as const,
      organizationId: "30000000-0000-4a00-8a00-000000000001",
      organizationName: "Northline Strength",
      branchId: "40000000-0000-4a00-8a00-000000000001",
      branchName: "Northline Strength — Main branch",
      plan: "Growth" as const,
      ownerName: "Karim Haddad",
      ownerEmail: "karim@northline.example",
      clerkOrganizationId: "org_clerk_1",
      clerkInvitationId: "inv_clerk_1",
    };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ action: result }, (_kind, args) => { call = args; }));

    await expect(api.provisionGym({ applicationId: result.applicationId })).resolves.toEqual(result);
    expect(call).toMatchObject({ applicationId: result.applicationId, correlationId: expect.any(String) });
  });

  it("keeps platform tenant controls behind the platform mutation boundary", async () => {
    const gym = {
      id: "marketplace-gym-1",
      name: "Northline Strength",
      shortName: "NORTHLINE",
      tagline: "",
      description: "",
      city: "Amman",
      areas: [],
      category: "Gym",
      audience: "All members",
      rating: 0,
      reviewCount: 0,
      memberCount: 0,
      branchCount: 1,
      fromPriceMinor: 0,
      amenities: [],
      accent: "#000",
      featured: false,
      subscriptionStatus: "suspended" as const,
      rivetPlan: "Growth" as const,
      joinedAt: "2026-08-08",
      lastActiveAt: "2026-08-08T00:00:00.000Z",
      monthlyRevenueMinor: 0,
      isPublic: true,
      branches: [],
    };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: gym }, (_kind, args) => { call = args; }));

    await expect(api.updatePlatformGym({ gymId: gym.id, status: "suspended", plan: "Growth", isPublic: false })).resolves.toEqual(gym);
    expect(call).toMatchObject({ operation: "platform.gym.update", input: { gymId: gym.id, status: "suspended", plan: "Growth", isPublic: false } });
  });

  it("keeps SaaS catalog edits behind the platform mutation boundary", async () => {
    const plan = { name: "Growth" as const, priceMinor: 159_000, branches: 4, staff: 30, members: 3_000, tone: "signal" as const };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: plan }, (_kind, args) => { call = args; }));

    await expect(api.updatePlatformPlan({ name: "Growth", priceMinor: 159_000, branches: 4, staff: 30, members: 3_000 })).resolves.toEqual(plan);
    expect(call).toMatchObject({ operation: "platform.plan.update", input: { name: "Growth", priceMinor: 159_000 } });
  });

  it("converts structured Convex errors into stable ApiErrors", async () => {
    const error = Object.assign(new Error("wrapped failure"), { data: { code: ERR.FORBIDDEN, message: "Branch access denied.", requestId: "cor-test-1" } });
    const api = new ConvexGymOSApi(transportFor({ query: error }));

    await expect(api.getSession()).rejects.toSatisfy((value: unknown) => value instanceof ApiError && value.code === ERR.FORBIDDEN && value.requestId === "cor-test-1");
  });

  it("selects mock or Convex only through explicit mode configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "convex");
    expect(dataMode()).toBe("convex");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    expect(dataMode()).toBe("mock");
    vi.unstubAllEnvs();
  });

  it("honors an explicit mock mode in a production-mode Preview build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");

    expect(dataMode()).toBe("mock");

    vi.unstubAllEnvs();
  });
});
