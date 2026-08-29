import { describe, expect, it, vi } from "vitest";
import { ConvexGymOSApi, type ConvexTransport, dataMode } from "./ConvexGymOSApi";
import { ApiError, ERR } from "./errors";
import type { CashShift, Session, ShiftTotals } from "@/lib/domain/types";
import type { MarketplaceGym } from "@/lib/public/experience-data";

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

  it("does not retain a stale organization or branch after a scope selection fails", async () => {
    const scopeErrors: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi({
      ...transportFor({ query: session }),
      query: async (_reference, args) => {
        const request = args as unknown as Record<string, unknown>;
        scopeErrors.push(request);
        if (request.organizationId === "stale-org") throw Object.assign(new Error("Organization not found"), { data: { code: ERR.NOT_FOUND, message: "Organization not found.", requestId: "scope-1" } });
        if (request.activeBranchId === "stale-branch") throw Object.assign(new Error("Branch not found"), { data: { code: ERR.NOT_FOUND, message: "Branch not found.", requestId: "scope-2" } });
        return session;
      },
    });

    await api.getSession();
    await expect(api.selectOrganization("stale-org")).rejects.toBeInstanceOf(ApiError);
    await api.listMembers({ page: 1, pageSize: 1 });
    expect(scopeErrors.at(-1)).toMatchObject({ organizationId: session.organization.id, activeBranchId: session.activeBranchId });

    await expect(api.setActiveBranch("stale-branch")).rejects.toBeInstanceOf(ApiError);
    await api.listMembers({ page: 1, pageSize: 1 });
    expect(scopeErrors.at(-1)).toMatchObject({ organizationId: session.organization.id, activeBranchId: session.activeBranchId });
  });

  it("routes member marketing preferences through the authenticated mutation boundary", async () => {
    let mutationArgs: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: { id: "customer-1" } }, (_kind, args) => { mutationArgs = args; }));

    await expect(api.updateCustomerMarketingPreference({ optedIn: false, customerId: "customer-1" })).resolves.toEqual({ id: "customer-1" });
    expect(mutationArgs).toMatchObject({ operation: "customer.marketingPreference.update", input: { optedIn: false, customerId: "customer-1" } });
  });

  it("exposes member experience updates through a disposable subscription seam", async () => {
    const values: unknown[] = [];
    const errors: unknown[] = [];
    const stop = vi.fn();
    const calls: Array<Record<string, unknown>> = [];
    const experience = { customer: undefined, memberships: [], bookings: [] };
    const base = transportFor();
    const transport: ConvexTransport = {
      ...base,
      subscribe: (_reference, args, onValue, onError) => {
        calls.push(args as unknown as Record<string, unknown>);
        try {
          onValue(experience);
        } catch (error) {
          onError(error);
        }
        return stop;
      },
    };
    const api = new ConvexGymOSApi(transport);

    const unsubscribe = await api.subscribeCustomerExperience((value) => values.push(value), (error) => errors.push(error));

    expect(values).toEqual([experience]);
    expect(errors).toHaveLength(0);
    expect(calls[0]).toMatchObject({ operation: "customer.experience", input: {}, correlationId: expect.any(String) });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("exposes realtime workspace entitlement updates through the same transport seam", async () => {
    const values: unknown[] = [];
    const stop = vi.fn();
    const access = { entitlements: { subscriptionPlan: "Growth", entitledModules: ["foundation", "revenue", "operations"] } };
    const api = new ConvexGymOSApi({
      ...transportFor(),
      subscribe: (_reference, args, onValue) => {
        expect(args).toMatchObject({ operation: "workspace.access", input: {} });
        onValue(access);
        return stop;
      },
    });

    const unsubscribe = await api.subscribeWorkspaceAccess((value) => values.push(value));
    expect(values).toEqual([access]);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps dashboard reads safe while the Today projection is deployed separately", async () => {
    const legacyDashboard = {
      kpis: {},
      revenueSeries: [],
      branchRevenue: [],
      funnel: [],
      leaderboard: [],
      alerts: [],
      recentActivity: [],
    };
    const api = new ConvexGymOSApi(transportFor({ query: legacyDashboard }));

    await expect(api.getDashboard({ from: "2026-08-29", to: "2026-08-29" })).resolves.toMatchObject({
      todayQueue: {
        items: [],
        totalItems: 0,
        urgentItems: 0,
        highPriorityItems: 0,
        kindCounts: {},
        overdueItems: 0,
        overdueKindCounts: {},
      },
    });

    const values: unknown[] = [];
    const stop = vi.fn();
    const subscribedApi = new ConvexGymOSApi({
      ...transportFor(),
      subscribe: (_reference, _args, onValue) => {
        onValue(legacyDashboard);
        return stop;
      },
    });

    const unsubscribe = await subscribedApi.subscribeDashboard(
      { from: "2026-08-29", to: "2026-08-29" },
      (dashboard) => values.push(dashboard.todayQueue),
    );
    expect(values).toEqual([expect.objectContaining({ items: [], totalItems: 0 })]);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("normalizes the public Convex projection without reviving non-operational rows", async () => {
    const publicRow = {
      id: "live-gym",
      name: "Live Gym",
      shortName: "LIVE",
      tagline: "",
      description: "",
      city: "Amman",
      areas: [],
      category: "Gym",
      audience: "All members",
      memberCount: 1,
      branchCount: 1,
      fromPriceMinor: 0,
      amenities: [],
      accent: "#000000",
      featured: false,
      subscriptionStatus: "active" as const,
      rivetPlan: "Starter" as const,
      joinedAt: "2026-08-01",
      lastActiveAt: "2026-08-01T00:00:00.000Z",
      monthlyRevenueMinor: 0,
      branches: [],
    };
    const suspendedRow = { ...publicRow, id: "suspended-gym", subscriptionStatus: "suspended" as const };
    const hiddenRow = { ...publicRow, id: "hidden-gym", isPublic: false };
    const api = new ConvexGymOSApi(transportFor({ query: [{ ...publicRow, logoUrl: "https://cdn.example/logo.png", isProvisioned: false, isArchived: true, archivedAt: "2026-08-20T00:00:00.000Z", archiveReason: "retained" }, suspendedRow, hiddenRow] }));

    const gyms = await api.listMarketplaceGyms();
    expect(gyms).toEqual([expect.objectContaining({ id: "live-gym", isPublic: true })]);
    expect(gyms[0]).not.toHaveProperty("isProvisioned");
    expect(gyms[0]).not.toHaveProperty("isArchived");
    expect(gyms[0]).not.toHaveProperty("archivedAt");
    expect(gyms[0]).not.toHaveProperty("archiveReason");
    expect(gyms[0]).not.toHaveProperty("logoUrl");
  });

  it("keeps provisioning metadata on platform snapshots while stripping it from public rows", async () => {
    const platformSnapshot = { gyms: [{ id: "legacy-gym", isProvisioned: false, logoUrl: "https://cdn.example/logo.png" }], bookings: [], invoices: [], supportCases: [], plans: [], applications: [], auditEvents: [], overview: {} };
    const api = new ConvexGymOSApi(transportFor({ query: platformSnapshot }));

    await expect(api.getPlatformSnapshot()).resolves.toMatchObject({ gyms: [{ id: "legacy-gym", isProvisioned: false, logoUrl: "https://cdn.example/logo.png" }] });
  });

  it("applies the same visibility contract to live marketplace updates", async () => {
    const values: MarketplaceGym[][] = [];
    const stop = vi.fn();
    const row = {
      id: "live-gym",
      name: "Live Gym",
      shortName: "LIVE",
      tagline: "",
      description: "",
      city: "Amman",
      areas: [],
      category: "Gym",
      audience: "All members",
      memberCount: 1,
      branchCount: 1,
      fromPriceMinor: 0,
      amenities: [],
      accent: "#000000",
      featured: false,
      subscriptionStatus: "trial" as const,
      rivetPlan: "Starter" as const,
      joinedAt: "2026-08-01",
      lastActiveAt: "2026-08-01T00:00:00.000Z",
      monthlyRevenueMinor: 0,
      branches: [],
    };
    const api = new ConvexGymOSApi({
      ...transportFor(),
      subscribe: (_reference, _args, onValue) => {
        onValue([row]);
        return stop;
      },
    });

    const unsubscribe = await api.subscribeMarketplaceGyms((gyms) => values.push(gyms));
    expect(values).toEqual([[expect.objectContaining({ id: "live-gym", isPublic: true })]]);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("uses the same subscription boundary for the platform application queue", async () => {
    const values: unknown[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const stop = vi.fn();
    const base = transportFor();
    const transport: ConvexTransport = {
      ...base,
      subscribe: (_reference, args, onValue) => {
        calls.push(args as unknown as Record<string, unknown>);
        onValue([]);
        return stop;
      },
    };
    const api = new ConvexGymOSApi(transport);

    const unsubscribe = await api.subscribePlatformApplications((value) => values.push(value));

    expect(values).toEqual([[]]);
    expect(calls[0]).toMatchObject({ operation: "platform.applications", input: {}, correlationId: expect.any(String) });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("subscribes to the complete platform operations projection", async () => {
    const values: unknown[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const stop = vi.fn();
    const snapshot = { gyms: [], bookings: [], invoices: [], supportCases: [], plans: [], applications: [], overview: {} };
    const base = transportFor();
    const api = new ConvexGymOSApi({
      ...base,
      subscribe: (_reference, args, onValue) => {
        calls.push(args as unknown as Record<string, unknown>);
        onValue(snapshot);
        return stop;
      },
    });

    const unsubscribe = await api.subscribePlatformSnapshot((value) => values.push(value));
    expect(values).toEqual([snapshot]);
    expect(calls[0]).toMatchObject({ operation: "platform.snapshot", input: {}, correlationId: expect.any(String) });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("subscribes to the public pricing catalog used by the landing page", async () => {
    const values: unknown[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const stop = vi.fn();
    const plans = [{ name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" }];
    const api = new ConvexGymOSApi({
      ...transportFor(),
      subscribe: (_reference, args, onValue) => {
        calls.push(args as unknown as Record<string, unknown>);
        onValue(plans);
        return stop;
      },
    });

    const unsubscribe = await api.subscribePublicSaasPlans((value) => values.push(value));
    expect(values).toEqual([plans]);
    expect(calls[0]).toMatchObject({ operation: "public.catalog", input: {}, correlationId: expect.any(String) });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("maps the manual platform invoice lifecycle without a payment retry shortcut", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ mutation: { id: "INV-1" } }, (_kind, args) => calls.push(args)));

    await api.createPlatformInvoice({ gymId: "gym-1", amountMinor: 149_000, currency: "JOD", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueAt: "2026-09-07" });
    await api.issuePlatformInvoice("INV-1");
    await api.recordPlatformInvoicePayment({ invoiceId: "INV-1", reference: "BANK-123", reason: "Transfer confirmed." });
    await api.voidPlatformInvoice("INV-2", "Duplicate draft.");

    expect(calls.map((call) => call.operation)).toEqual(["platform.invoice.create", "platform.invoice.issue", "platform.invoice.payment", "platform.invoice.void"]);
    expect(calls[2]).toMatchObject({ input: { invoiceId: "INV-1", reference: "BANK-123", reason: "Transfer confirmed." } });
  });

  it("carries CRM lead filters through the realtime subscription boundary", async () => {
    const values: unknown[] = [];
    const calls: Array<Record<string, unknown>> = [];
    const stop = vi.fn();
    const page = { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };
    const base = transportFor();
    const transport: ConvexTransport = {
      ...base,
      subscribe: (_reference, args, onValue) => {
        calls.push(args as unknown as Record<string, unknown>);
        onValue(page);
        return stop;
      },
    };
    const api = new ConvexGymOSApi(transport);

    const unsubscribe = await api.subscribeLeads({ branchId: session.activeBranchId, stage: ["trial_booked"], pageSize: 20 }, (value) => values.push(value));

    expect(values).toEqual([page]);
    expect(calls[0]).toMatchObject({ operation: "leads.list", input: { branchId: session.activeBranchId, stage: ["trial_booked"], pageSize: 20 } });
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("keeps idempotency keys inside the payment mutation boundary", async () => {
    let mutationArgs: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: {} }, (_kind, args) => { mutationArgs = args; }));

    await api.createPayment({ memberId: session.user.id, amount: { amount: 12_500, currency: "JOD" }, method: "card" }, "payment-key-1");

    expect(mutationArgs).toMatchObject({ operation: "payments.create", input: { idempotencyKey: "payment-key-1" } });
  });

  it("maps the atomic trial-to-membership sale through one mutation", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const result = { member: { id: "member-1" }, plan: { id: "plan-1" }, membership: { id: "membership-1" }, charge: { id: "charge-1" } };
    const api = new ConvexGymOSApi(transportFor({ mutation: result }, (_kind, args) => calls.push(args)));

    await expect(api.completeLeadSale("lead-1", {
      homeBranchId: session.activeBranchId!,
      preferredLanguage: "en",
      startDate: "2026-08-13",
      idempotencyKey: "lead-sale-1",
      membership: { mode: "existing", planId: "plan-1" },
    })).resolves.toBe(result);

    expect(calls[0]).toMatchObject({
      operation: "leads.complete_sale",
      input: { leadId: "lead-1", idempotencyKey: "lead-sale-1", membership: { mode: "existing", planId: "plan-1" } },
    });
  });

  it("keeps offer drafting, delivery confirmation, and the lead response as separate mutations", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const offer = { id: "offer-1", leadId: "lead-1", planId: "plan-1", planName: "Growth", price: { amount: 149_000, currency: "JOD" as const }, status: "draft" as const, createdById: session.user.id, createdAt: "2026-08-09T18:00:00.000Z" };
    const delivered = { ...offer, status: "sent" as const, deliveryChannel: "email" as const, deliveredAt: "2026-08-09T18:01:00.000Z" };
    const api = new ConvexGymOSApi(transportFor({ mutation: delivered }, (_kind, args) => calls.push(args)));

    await expect(api.createOffer({ leadId: "lead-1", planId: "plan-1", price: offer.price, expiresInDays: 7 })).resolves.toBe(delivered);
    await expect(api.markOfferDelivered("offer-1", { channel: "email", reference: "manual-email-1" })).resolves.toBe(delivered);
    await expect(api.recordOfferOutcome("offer-1", { outcome: "accepted", reason: "Confirmed by the lead" })).resolves.toBe(delivered);
    expect(calls[0]).toMatchObject({ operation: "offers.create", input: { leadId: "lead-1", planId: "plan-1" } });
    expect(calls[1]).toMatchObject({ operation: "offers.deliver", input: { offerId: "offer-1", channel: "email", reference: "manual-email-1" } });
    expect(calls[2]).toMatchObject({ operation: "offers.respond", input: { offerId: "offer-1", outcome: "accepted", reason: "Confirmed by the lead" } });
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
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
      operatingHours: [{ branchId: session.activeBranchId!, days }],
      trialSchedules: [{ branchId: session.activeBranchId!, days: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { enabled: true, opensAt: "09:00", closesAt: "20:00" }])) as import("@/lib/domain/types").OperationalPolicies["trialSchedules"][number]["days"] }],
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

    await expect(api.updatePlatformGym({ gymId: gym.id, status: "suspended", plan: "Growth", billingInterval: "annual", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", isPublic: false, reason: "Account requested a temporary pause." })).resolves.toEqual(gym);
    expect(call).toMatchObject({ operation: "platform.gym.update", input: { gymId: gym.id, status: "suspended", plan: "Growth", billingInterval: "annual", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", isPublic: false } });
  });

  it("keeps SaaS catalog edits behind the platform mutation boundary", async () => {
    const plan = { name: "Growth" as const, priceMinor: 159_000, branches: 4, staff: 30, members: 3_000, tone: "signal" as const };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: plan }, (_kind, args) => { call = args; }));

    await expect(api.updatePlatformPlan({ name: "Growth", priceMinor: 159_000, branches: 4, staff: 30, members: 3_000, reason: "Annual pricing review approved." })).resolves.toEqual(plan);
    expect(call).toMatchObject({ operation: "platform.plan.update", input: { name: "Growth", priceMinor: 159_000 } });
  });

  it("routes archive-only gym removal with exact confirmation and reason", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const api = new ConvexGymOSApi(transportFor({ query: session, mutation: undefined }, (_kind, args) => calls.push(args)));

    // Simulate an operator who opened a gym workspace before returning to the
    // platform console. Archive must remain tenant-independent in that case.
    await api.selectOrganization(session.organization.id);

    await expect(api.archivePlatformGym({ gymId: "gym-archive", confirmation: "Northline Strength", reason: "Customer requested account closure." })).resolves.toBeUndefined();
    const archiveCall = calls.find((call) => call.operation === "platform.gym.archive");
    expect(archiveCall).toMatchObject({ operation: "platform.gym.archive", input: { gymId: "gym-archive", confirmation: "Northline Strength", reason: "Customer requested account closure." } });
    expect(archiveCall).not.toHaveProperty("organizationId");
    expect(archiveCall).not.toHaveProperty("activeBranchId");
  });

  it("carries the Enterprise tier through the live adapter boundary", async () => {
    const enterprise = { name: "Enterprise" as const, priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" as const };
    const gym = { id: "enterprise-gym", rivetPlan: "Enterprise" as const };
    let call: Record<string, unknown> | undefined;
    const api = new ConvexGymOSApi(transportFor({ mutation: gym }, (_kind, args) => { call = args; }));

    await expect(api.updatePlatformGym({ gymId: gym.id, plan: "Enterprise", status: "active", reason: "Enable the Enterprise workspace tier." })).resolves.toEqual(gym);
    expect(call).toMatchObject({ operation: "platform.gym.update", input: { gymId: gym.id, plan: "Enterprise" } });
    const catalogApi = new ConvexGymOSApi(transportFor({ mutation: enterprise }, (_kind, args) => { call = args; }));
    await expect(catalogApi.updatePlatformPlan({ name: enterprise.name, priceMinor: enterprise.priceMinor, branches: enterprise.branches, staff: enterprise.staff, members: enterprise.members, reason: "Publish the Enterprise catalog price." })).resolves.toEqual(enterprise);
    expect(call).toMatchObject({ operation: "platform.plan.update", input: { name: "Enterprise", priceMinor: 500_000 } });
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

  it("rejects mock mode in a production runtime outside the test harness", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");

    vi.stubEnv("VITEST", "");
    vi.stubEnv("VITEST_WORKER_ID", "");
    expect(() => dataMode()).toThrowError("RIVET production runtime cannot use mock data mode.");

    vi.unstubAllEnvs();
  });

  it("allows mock mode only for an explicitly marked preview deployment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS", "preview");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITEST", "");
    vi.stubEnv("VITEST_WORKER_ID", "");
    expect(dataMode()).toBe("mock");

    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => dataMode()).toThrowError("RIVET production runtime cannot use mock data mode.");
    vi.unstubAllEnvs();
  });

  it("fails closed when production hosting is reported with a development Node runtime", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "mock");
    vi.stubEnv("VITEST", "");
    vi.stubEnv("VITEST_WORKER_ID", "");
    expect(() => dataMode()).toThrowError("RIVET production runtime cannot use mock data mode.");
    vi.unstubAllEnvs();
  });
});
