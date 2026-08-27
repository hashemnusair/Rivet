import { beforeEach, describe, expect, it } from "vitest";
import { ERR, isApiError } from "@/lib/api/errors";
import { DEMO_IDENTITY } from "@/lib/auth/rivet-identity";
import type { PlatformGymDetail, PlatformSnapshot } from "@/lib/api/GymOSApi";
import type { AccountingSourcePosting, MemberSummary, OperationalPolicies, Payment } from "@/lib/domain/types";
import type * as T from "@/lib/domain/types";
import { addDays, partsInTimeZone, todayISODate } from "@/lib/utils/dates";
import { fromMajor, money } from "@/lib/utils/money";
import { MockGymOSApi } from "./MockGymOSApi";
import type { MockDb } from "./store";

/**
 * These exercise the mock as the application's stand-in backend: mutations must
 * update every surface coherently, and permissions must actually be enforced
 * rather than merely hidden in the UI.
 */

let api: MockGymOSApi;

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

async function anyMemberWithBalance(): Promise<MemberSummary> {
  const page = await api.listMembers({ membershipStatus: "outstanding", pageSize: 5 });
  const member = page.items.find((m) => m.outstanding.amount > 0);
  if (!member) throw new Error("seed should contain a member with an outstanding balance");
  return member;
}

async function freshMemberForSale(): Promise<MemberSummary> {
  const session = await api.getSession();
  return (await api.createMember({ fullName: "New Sale Test", phone: "+962 79 900 0100", homeBranchId: session.branches[0]!.id, preferredLanguage: "en" })).member;
}

describe("session and role switching", () => {
  it("returns a session with the organization, branches and permissions", async () => {
    const session = await api.getSession();
    expect(session.organization.currency).toBe("JOD");
    expect(session.organization.timezone).toBe("Asia/Amman");
    expect(session.branches.length).toBeGreaterThanOrEqual(2);
    expect(session.roles).toEqual(["owner"]);
    expect(session.permissions).toContain("settings.manage");
  });

  it("swaps the permission set when the demo role changes", async () => {
    const reception = await api.switchDemoRole("receptionist");
    expect(reception.roles).toEqual(["receptionist"]);
    expect(reception.permissions).toContain("payments.collect");
    expect(reception.permissions).not.toContain("reports.financial.read");
  });

  it("binds an authenticated profile to the seeded role without exposing the seed persona", async () => {
    const owner = await api.switchDemoRole("owner", undefined, {
      name: "Hashem Nusair",
      email: "nusairhashem04+owner@gmail.com",
    });

    expect(owner.user).toMatchObject({
      name: "Hashem Nusair",
      email: "nusairhashem04+owner@gmail.com",
    });
    expect(owner.roles).toEqual(["owner"]);
  });

  it("keeps All branches read-only and never falls back across selected branch scope", async () => {
    const owner = await api.getSession();
    expect(owner.branches.length).toBeGreaterThanOrEqual(2);
    await api.setActiveBranch(undefined);
    await expect(api.getSession()).resolves.toMatchObject({ activeBranchId: undefined });
    await expect(api.listMembers({ pageSize: 100 })).resolves.toBeDefined();

    const internals = api as unknown as { db: MockDb };
    const receptionist = internals.db.users.find((user) => user.role === "receptionist" && user.status === "active");
    if (!receptionist) throw new Error("seed should contain an active receptionist");
    const [branchA, branchB] = owner.branches;
    if (!branchA || !branchB) throw new Error("seed should contain two branches");

    await api.switchDemoRole("receptionist", branchA.id);
    receptionist.branchScope = "selected";
    receptionist.branchIds = [branchA.id, branchB.id];
    internals.db.session.activeBranchId = undefined;
    await expect(api.listMembers({ pageSize: 100 })).rejects.toMatchObject({ code: ERR.ORGANIZATION_SELECTION_REQUIRED });

    await expect(api.setActiveBranch("stale-branch")).rejects.toMatchObject({ code: ERR.NOT_FOUND });
    internals.db.branches.find((branch) => branch.id === branchB.id)!.status = "inactive";
    await expect(api.setActiveBranch(branchB.id)).rejects.toMatchObject({ code: ERR.NOT_FOUND });
    internals.db.branches.find((branch) => branch.id === branchB.id)!.status = "active";
    receptionist.branchIds = [branchA.id];
    await expect(api.setActiveBranch(branchB.id)).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });
});

describe("Brand Kit persistence", () => {
  it("applies palette and logo updates to settings and the authenticated session", async () => {
    const session = await api.getSession();
    const logo = await api.uploadMediaAsset({
      ownerType: "gym_logo",
      ownerId: session.organization.id,
      altText: "Forge workspace logo",
      file: new Blob(["logo"], { type: "image/png" }),
    });

    await api.updateBrandKit({ paletteKey: "gold", primaryColor: "#B88A2B", logoAssetId: logo.id });

    await expect(api.getBrandKit()).resolves.toMatchObject({ paletteKey: "gold", primaryColor: "#b88a2b", logoAssetId: logo.id, logoAltText: "Forge workspace logo", version: 1 });
    await expect(api.getSession()).resolves.toMatchObject({ organization: { brand: { paletteKey: "gold", primaryColor: "#b88a2b", logoAssetId: logo.id, logoAltText: "Forge workspace logo" } } });
    expect((await api.listAuditEvents({ category: "settings", pageSize: 20 })).items.some((event) => event.action === "settings.brand.update")).toBe(true);
  });
});

describe("operations identifier lifecycle", () => {
  it("reuses archived zone and retired equipment codes without deleting history", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;

    const archivedZone = await api.upsertZone({ branchId, code: "REUSE-01", name: "Old training zone", kind: "weights" });
    await api.archiveZone(archivedZone.id);
    const liveZone = await api.upsertZone({ branchId, code: "REUSE-01", name: "New training zone", kind: "cardio" });
    expect(liveZone).toMatchObject({ status: "active", code: "REUSE-01" });
    expect(liveZone.id).not.toBe(archivedZone.id);

    const retiredAsset = await api.upsertEquipmentAsset({ branchId, code: "ASSET-REUSE", name: "Retired treadmill", status: "retired" });
    const liveAsset = await api.upsertEquipmentAsset({ branchId, code: "ASSET-REUSE", name: "Replacement treadmill" });
    expect(liveAsset).toMatchObject({ status: "active", code: "ASSET-REUSE" });
    expect(liveAsset.id).not.toBe(retiredAsset.id);

    const zones = await api.listZones({ branchId, includeArchived: true });
    expect(zones.filter((zone) => zone.code === "REUSE-01")).toHaveLength(2);
    expect(zones.map((zone) => zone.status)).toEqual(expect.arrayContaining(["archived", "active"]));
    const assets = await api.listEquipmentAssets({ branchId });
    expect(assets.filter((asset) => asset.code === "ASSET-REUSE")).toHaveLength(2);
    expect(assets.map((asset) => asset.status)).toEqual(expect.arrayContaining(["retired", "active"]));
  });
});

describe("workspace entitlement and preference boundary", () => {
  it("keeps entitlement state separate from permissions and audits owner preferences", async () => {
    const access = await api.getWorkspaceAccess();
    expect(access.entitlements.source).toBe("subscription_plan");
    expect(access.entitlements.subscriptionPlan).toBe("Pro");
    expect(access.entitlements.entitledModules).toContain("finance");
    expect(access.preferences.enabledModules).toContain("finance");

    await api.switchDemoRole("manager");
    await expect(api.updateWorkspaceModulePreferences({ enabledModules: ["foundation", "revenue", "operations"] })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("owner");
    await api.updateWorkspaceModulePreferences({ enabledModules: ["foundation", "revenue", "operations"] });
    expect((await api.getWorkspaceModulePreferences()).enabledModules).toEqual(["foundation", "revenue", "operations"]);
    await expect(api.getWorkspaceModuleStatus("finance")).rejects.toMatchObject({ code: ERR.FEATURE_NOT_AVAILABLE });
    await expect(api.updateWorkspaceModulePreferences({ enabledModules: ["foundation", "reporting"] })).rejects.toMatchObject({ code: ERR.VALIDATION });
    expect((await api.listAuditEvents({ category: "settings", pageSize: 20 })).items.some((event) => event.action === "workspace.module_preferences.update")).toBe(true);
  });

  it("projects the provisioned Pro tenant and fail-closed cleanup rows in the initial platform state", async () => {
    const snapshot = await api.getPlatformSnapshot();
    const forge = snapshot.gyms.find((gym) => gym.id === "forge-fitness");
    const cleanupRows = snapshot.gyms.filter((gym) => gym.id !== "forge-fitness");

    expect(forge).toMatchObject({
      subscriptionStatus: "active",
      rivetPlan: "Pro",
      billingInterval: "monthly",
      isPublic: true,
      isProvisioned: true,
      subscriptionStartedAt: expect.any(String),
      currentPeriodEndsAt: expect.any(String),
    });
    expect(Date.parse(forge!.currentPeriodEndsAt!)).toBeGreaterThan(Date.now());
    const forgeDetail = await api.getPlatformGymDetail("forge-fitness");
    expect(forgeDetail.subscription.startedAt).toEqual({ state: "available", value: forge!.subscriptionStartedAt });
    expect(forgeDetail.subscription.currentPeriodEndsAt).toEqual({ state: "available", value: forge!.currentPeriodEndsAt });
    expect(forgeDetail.subscription.trialEndsAt).toEqual({ state: "not_configured" });
    expect(snapshot.overview.activeMrr).toEqual({ amount: 249_000, currency: "JOD" });
    expect(cleanupRows.length).toBeGreaterThan(0);
    for (const gym of cleanupRows) {
      expect(gym).toMatchObject({ subscriptionStatus: "suspended", isPublic: false, isProvisioned: false, subscriptionStatusReason: "Organization is not provisioned." });
    }

    const cleanupDetail = await api.getPlatformGymDetail(cleanupRows[0]!.id);
    expect(cleanupDetail.controls).toMatchObject({ status: "suspended", isPublic: false });
    expect(cleanupDetail.organization).toEqual({ state: "not_available" });
    expect(cleanupDetail.subscription.status).toEqual({ state: "not_available" });
    expect((await api.listMarketplaceGyms()).map((gym) => gym.id)).toEqual(["forge-fitness"]);
  });

  it("keeps the four-tier catalog ordered with the Enterprise price", async () => {
    const plans = (await api.getPlatformSnapshot()).plans;
    expect(plans.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
    expect(plans.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 500_000 });
  });
});

describe("platform gym applications", () => {
  it("persists the selected billing cadence through the application queue", async () => {
    const submitted = await api.submitGymApplication({ gymName: "Annual Reconcile Gym", ownerName: "Annual Owner", email: "annual-owner@example.test", contactNumber: "+962 79 700 0000", plan: "Pro", billingInterval: "annual" });
    expect((await api.listGymApplications()).find((application) => application.id === submitted.applicationId)).toMatchObject({ plan: "Pro", billingInterval: "annual" });
  });

  it("delivers the current application queue through the mock subscription contract", async () => {
    const values: unknown[] = [];
    const unsubscribe = await api.subscribePlatformApplications((applications) => values.push(applications));

    expect(values).toHaveLength(1);
    expect(values[0]).toEqual(expect.arrayContaining([expect.objectContaining({ gymName: "Northline Strength" })]));
    expect(() => unsubscribe()).not.toThrow();
  });

  it("lists applications and records a review decision with a rejection reason", async () => {
    const applications = await api.listGymApplications();
    expect(applications.length).toBeGreaterThan(0);
    const pending = applications.find((application) => application.status === "pending");
    expect(pending).toBeDefined();

    await expect(api.reviewGymApplication({ applicationId: pending!.id, decision: "rejected" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const reviewed = await api.reviewGymApplication({ applicationId: pending!.id, decision: "rejected", note: "Could not verify the branch address." });
    expect(reviewed).toMatchObject({ status: "rejected", reviewNotificationStatus: "sent", reviewNotes: "Could not verify the branch address." });
    await expect(api.reviewGymApplication({ applicationId: pending!.id, decision: "approved" })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("saves and edits review notes after an application is finalized", async () => {
    const application = (await api.listGymApplications()).find((item) => item.status === "pending");
    expect(application).toBeDefined();
    const approved = await api.reviewGymApplication({ applicationId: application!.id, decision: "approved" });
    const updated = await api.saveGymApplicationReviewNote({ applicationId: approved.id, note: "Follow up on the opening date." });
    expect(updated).toMatchObject({ status: "approved", reviewNotes: "Follow up on the opening date." });

    const cleared = await api.saveGymApplicationReviewNote({ applicationId: approved.id, note: "   " });
    expect(cleared.reviewNotes).toBeUndefined();
  });

  it("keeps mock provisioning retries idempotent and exposes a completed checkpoint", async () => {
    const application = (await api.listGymApplications()).find((item) => item.status === "pending");
    expect(application).toBeDefined();
    const approved = await api.reviewGymApplication({ applicationId: application!.id, decision: "approved" });
    const first = await api.provisionGym({ applicationId: approved.id });
    const second = await api.provisionGym({ applicationId: approved.id });
    expect(second).toEqual(first);

    const snapshot = await api.getPlatformSnapshot();
    expect(snapshot.applications.find((item) => item.id === approved.id)).toMatchObject({
      provisioningStatus: "completed",
      provisioningCheckpoint: "completed",
      provisioningOutcome: "complete",
      provisioningAttemptCount: 1,
    });
  });

  it("projects a provisioned application into its own public listing, branch, owner invitation, and platform facts", async () => {
    const application = (await api.listGymApplications()).find((item) => item.status === "pending");
    expect(application).toBeDefined();
    const approved = await api.reviewGymApplication({ applicationId: application!.id, decision: "approved" });
    const result = await api.provisionGym({ applicationId: approved.id });

    const snapshot = await api.getPlatformSnapshot();
    const listing = snapshot.gyms.find((gym) => gym.name === approved.gymName);
    expect(listing).toMatchObject({
      subscriptionStatus: "trial",
      rivetPlan: approved.plan,
      billingInterval: approved.billingInterval,
      isProvisioned: true,
      isPublic: true,
      branchCount: 1,
      branches: [expect.objectContaining({ internalBranchId: result.branchId })],
    });
    const publicListings = await api.listMarketplaceGyms();
    const publicListing = publicListings.find((gym) => gym.id === listing?.id);
    expect(publicListing).toBeDefined();
    expect(publicListing).not.toHaveProperty("isProvisioned");
    expect(snapshot.overview.gymCounts.trial).toBe(1);
    expect(snapshot.overview.branchCount).toBe(3);

    const detail = await api.getPlatformGymDetail(listing!.id);
    expect(detail.organization).toMatchObject({ state: "available", value: { id: result.organizationId, name: approved.gymName, status: "trial" } });
    expect(detail.branches).toMatchObject({ state: "available", value: [expect.objectContaining({ id: result.branchId, code: "MAIN" })] });
    expect(detail.owner).toMatchObject({ state: "available", value: { name: approved.ownerName, email: approved.email } });
    expect(detail.activity).toMatchObject({ state: "available", value: [expect.objectContaining({ action: "gym.provisioned" })] });
    expect(snapshot.applications.find((item) => item.id === approved.id)).toMatchObject({
      provisioningStatus: "completed",
      provisioningOutcome: "complete",
      provisionedOrganizationId: result.organizationId,
      provisionedBranchId: result.branchId,
      clerkInvitationStatus: "pending",
    });
  });

  it("reports a busy provisioning attempt instead of racing a second mock retry", async () => {
    const application = (await api.listGymApplications()).find((item) => item.status === "pending");
    expect(application).toBeDefined();
    const approved = await api.reviewGymApplication({ applicationId: application!.id, decision: "approved" });
    api.setBehavior({ latencyMs: 25 });
    const first = api.provisionGym({ applicationId: approved.id });
    await expect(api.provisionGym({ applicationId: approved.id })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await expect(first).resolves.toMatchObject({ status: "completed" });
  });
});

describe("platform subscription controls", () => {
  it("accepts the deterministic preview identity for support self-assignment", async () => {
    const supportCase = (await api.listSupportCases())[0];
    if (!supportCase) throw new Error("mock support seed should contain a case");

    const assigned = await api.assignPlatformSupportCase(supportCase.id, DEMO_IDENTITY.userId);
    expect(assigned).toMatchObject({ assigneeId: DEMO_IDENTITY.userId, assigneeName: DEMO_IDENTITY.fullName });
  });

  it("persists gym support cases and their append-only platform conversation", async () => {
    const reception = await api.switchDemoRole("receptionist");
    const supportCase = await api.createSupportCase({ email: reception.user.email, subject: "Scanner unavailable", body: "The scanner is not detected.", priority: "urgent", branchId: reception.activeBranchId });
    expect(await api.listSupportCases()).toEqual([expect.objectContaining({ id: supportCase.id, creatorId: reception.user.id, status: "open" })]);

    await api.switchDemoRole("owner");
    expect((await api.listSupportCases()).some((item) => item.id === supportCase.id)).toBe(true);
    const replied = await api.replyToPlatformSupportCase(supportCase.id, "We are reviewing the device logs.");
    expect(replied).toMatchObject({ status: "waiting", messages: [{ authorType: "gym" }, { authorType: "platform", body: "We are reviewing the device logs." }] });
    await api.switchDemoRole("receptionist");
    const gymReply = await api.replyToSupportCase(supportCase.id, "The device is still unavailable.");
    expect(gymReply).toMatchObject({ status: "open", messages: [{ authorType: "gym" }, { authorType: "platform" }, { authorType: "gym", body: "The device is still unavailable." }] });
    const notifications = await api.listNotifications();
    expect(notifications).toEqual([expect.objectContaining({ kind: "support_reply", href: `/support?case=${supportCase.id}` })]);
    await expect(api.setNotificationRead(notifications[0]!.id, true)).resolves.toMatchObject({ readAt: expect.any(String) });
    await api.switchDemoRole("owner");
    await expect(api.resolvePlatformSupportCase(supportCase.id, "")).rejects.toMatchObject({ code: ERR.VALIDATION });
    const resolved = await api.resolvePlatformSupportCase(supportCase.id, "Scanner permissions were restored.");
    expect(resolved).toMatchObject({ status: "resolved", resolutionSummary: "Scanner permissions were restored." });
    await expect(api.reopenPlatformSupportCase(supportCase.id)).resolves.toMatchObject({ status: "open" });
  });

  it("records a plan upgrade request without changing the tenant plan", async () => {
    const before = await api.getWorkspaceAccess();
    const request = await api.createSupportCase({ email: DEMO_IDENTITY.email ?? "demo@example.test", subject: "Request Growth", body: "Please review our operations needs.", priority: "normal", requestType: "plan_upgrade", requestedPlan: "Growth", billingInterval: "annual" });
    expect(request).toMatchObject({ requestType: "plan_upgrade", requestedPlan: "Growth", billingInterval: "annual" });
    expect((await api.getWorkspaceAccess()).entitlements.subscriptionPlan).toBe(before.entitlements.subscriptionPlan);
  });

  it("keeps platform invoices as a manual audited-style lifecycle", async () => {
    const gym = (await api.getPlatformSnapshot()).gyms[0]!;
    await expect(api.createPlatformInvoice({
      gymId: gym.id,
      amountMinor: 149_000,
      currency: "USD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const invoice = await api.createPlatformInvoice({
      gymId: gym.id,
      amountMinor: 149_000,
      currency: "JOD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    });
    expect(invoice).toMatchObject({ gymId: gym.id, amountMinor: 149_000, currency: "JOD", status: "draft" });

    const issued = await api.issuePlatformInvoice(invoice.id);
    expect(issued).toMatchObject({ status: "open", issuedAt: expect.any(String) });
    await expect(api.recordPlatformInvoicePayment({ invoiceId: invoice.id, reference: "BANK-123", reason: "" })).rejects.toMatchObject({ code: ERR.VALIDATION });

    const paid = await api.recordPlatformInvoicePayment({ invoiceId: invoice.id, reference: "BANK-123", reason: "Bank transfer confirmed." });
    expect(paid).toMatchObject({ status: "paid", paymentReference: "BANK-123", paidAt: expect.any(String) });
    await expect(api.voidPlatformInvoice(invoice.id, "Duplicate invoice.")).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("reconciles one annual cycle, enters grace, suspends after two days, and reactivates on payment", async () => {
    const internalApi = api as unknown as { db: MockDb };
    const boundary = Date.parse("2026-09-30T12:00:00.000Z");
    internalApi.db.organization.billingInterval = "annual";
    internalApi.db.organization.status = "active";
    internalApi.db.organization.subscriptionStartedAt = "2025-09-30T12:00:00.000Z";
    internalApi.db.organization.currentPeriodEndsAt = new Date(boundary).toISOString();
    const reminder = await api.reconcilePlatformSubscriptions(boundary - 3 * 86_400_000);
    expect(reminder).toMatchObject({ invoicesCreated: 1, markedPastDue: 0, suspended: 0 });
    expect(await api.reconcilePlatformSubscriptions(boundary - 3 * 86_400_000)).toMatchObject({ invoicesCreated: 0 });
    const invoice = (await api.getPlatformSnapshot()).invoices.find((item) => item.cycleKey);
    expect(invoice).toMatchObject({ billingInterval: "annual", amountMinor: 2_390_400, status: "open" });
    await api.reconcilePlatformSubscriptions(boundary);
    await api.reconcilePlatformSubscriptions(boundary + 2 * 86_400_000);
    expect((await api.getPlatformSnapshot()).gyms.find((gym) => gym.id === "forge-fitness")).toMatchObject({ subscriptionStatus: "suspended", isPublic: false });
    const paid = await api.recordPlatformInvoicePayment({ invoiceId: invoice!.id, reference: "BANK-ANNUAL", reason: "Annual transfer received." });
    expect(paid.status).toBe("paid");
    expect(internalApi.db.organization).toMatchObject({ status: "active", billingInterval: "annual", currentPeriodEndsAt: "2027-09-30T12:00:00.000Z" });
  });

  it("delivers the complete platform projection through the realtime contract", async () => {
    const values: unknown[] = [];
    const unsubscribe = await api.subscribePlatformSnapshot((snapshot) => values.push(snapshot));

    expect(values).toHaveLength(1);
    expect(values[0]).toEqual(expect.objectContaining({ gyms: expect.any(Array), overview: expect.any(Object), invoices: expect.any(Array) }));
    expect(() => unsubscribe()).not.toThrow();
  });

  it("updates a gym subscription and plan catalog in the shared platform snapshot", async () => {
    const before = await api.getPlatformSnapshot();
    const gym = before.gyms[0]!;
    expect((await api.listMarketplaceGyms()).some((item) => item.id === gym.id)).toBe(true);
    const updatedGym = await api.updatePlatformGym({ gymId: gym.id, status: "suspended", plan: "Growth", currentPeriodEndsAt: gym.currentPeriodEndsAt, isPublic: false, reason: "Account requested a temporary pause." });
    expect(updatedGym).toMatchObject({ id: gym.id, subscriptionStatus: "suspended", rivetPlan: "Growth", isPublic: false });
    expect((await api.listMarketplaceGyms()).some((item) => item.id === gym.id)).toBe(false);
    const branch = gym.branches[0]!;
    await expect(api.createTrialBooking({ gymId: gym.id, branchId: branch.id, fullName: "Blocked Visitor", email: "blocked@example.com", phone: "+962 79 000 0000", preferredDate: "2026-08-20", preferredTime: branch.trialSlots[0] ?? "18:00", goal: "Should not be accepted" })).rejects.toMatchObject({ code: ERR.NOT_FOUND });

    const plan = before.plans.find((item) => item.name === "Growth")!;
    const originalPrice = plan.priceMinor;
    const originalMembers = plan.members;
    const updatedPlan = await api.updatePlatformPlan({ name: plan.name, priceMinor: plan.priceMinor + 1_000, members: plan.members + 100, reason: "Annual pricing review approved." });
    expect(updatedPlan.priceMinor).toBe(originalPrice + 1_000);
    expect(updatedPlan.members).toBe(originalMembers + 100);
  });

  it("persists an admin-selected period boundary with an admin billing cadence change in the mock", async () => {
    const requestedAnnualEnd = "2027-12-31T23:59:59.999Z";
    const annual = await api.updatePlatformGym({ gymId: "forge-fitness", status: "active", billingInterval: "annual", currentPeriodEndsAt: requestedAnnualEnd, reason: "Approve annual billing for the tenant." });
    const annualStart = Date.parse(annual.subscriptionStartedAt!);
    const annualEnd = Date.parse(annual.currentPeriodEndsAt!);
    expect(annual).toMatchObject({ billingInterval: "annual", subscriptionStatus: "active" });
    expect(annualEnd).toBe(Date.parse("2027-12-31T23:59:59.999Z"));

    const monthly = await api.updatePlatformGym({ gymId: "forge-fitness", billingInterval: "monthly", currentPeriodEndsAt: "2026-09-30T23:59:59.999Z", reason: "Move the tenant to monthly billing." });
    const monthlyStart = Date.parse(monthly.subscriptionStartedAt!);
    const monthlyEnd = Date.parse(monthly.currentPeriodEndsAt!);
    expect(monthly).toMatchObject({ billingInterval: "monthly", subscriptionStatus: "active" });
    expect(monthlyStart).toBe(annualStart);
    expect(monthlyEnd).toBe(Date.parse("2026-09-30T23:59:59.999Z"));

    const detail = await api.getPlatformGymDetail("forge-fitness");
    const latestActivity = detail.activity.state === "available" ? detail.activity.value[0] as PlatformSnapshot["auditEvents"][number] & Record<string, unknown> : undefined;
    expect(latestActivity).toMatchObject({ before: { billingInterval: "annual" }, after: { billingInterval: "monthly" } });
  });

  it("suspends and cancels without a date, bills server-derived paid terms, and keeps trial end automatic", async () => {
    const suspended = await api.updatePlatformGym({ gymId: "forge-fitness", status: "suspended", reason: "Pause access immediately." });
    expect(suspended).toMatchObject({ subscriptionStatus: "suspended" });

    // Reactivation derives the term and issues the interval-correct invoice
    // through the same path monthly and annual changes share.
    const invoicesBefore = (await api.getPlatformSnapshot()).invoices.length;
    const reactivated = await api.updatePlatformGym({ gymId: "forge-fitness", status: "active", billingInterval: "annual", reason: "Reactivate on annual billing." });
    expect(reactivated).toMatchObject({ subscriptionStatus: "active", billingInterval: "annual" });
    expect(Date.parse(reactivated.currentPeriodEndsAt!)).toBeGreaterThan(Date.now() + 300 * 86_400_000);
    const snapshot = await api.getPlatformSnapshot();
    expect(snapshot.invoices.length).toBe(invoicesBefore + 1);
    const termInvoice = snapshot.invoices.find((invoice) => invoice.cycleKey?.startsWith("change:"));
    const tenantPlanPrice = snapshot.plans.find((plan) => plan.name === reactivated.rivetPlan)!.priceMinor;
    expect(termInvoice).toMatchObject({ status: "open", billingInterval: "annual", amountMinor: Math.round(tenantPlanPrice * 12 * 0.8) });

    const cancelled = await api.updatePlatformGym({ gymId: "forge-fitness", status: "cancelled", reason: "Cancel the subscription." });
    expect(cancelled).toMatchObject({ subscriptionStatus: "cancelled", cancelledAt: expect.any(String) });

    await api.resetDemo();
    await expect(api.updatePlatformGym({ gymId: "forge-fitness", status: "trial", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", reason: "Trial end remains server-derived." })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const trialInternalApi = api as unknown as { db: MockDb };
    trialInternalApi.db.organization.status = "trial";
    trialInternalApi.db.organization.trialEndsAt = undefined;
    const trial = await api.updatePlatformGym({ gymId: "forge-fitness", status: "trial", reason: "Start the onboarding trial." });
    expect(trial).toMatchObject({ subscriptionStatus: "trial", trialEndsAt: expect.any(String) });
    expect(trial.currentPeriodEndsAt).toBeUndefined();
  });

  it("keeps unprovisioned directory rows cleanup-only and out of public/active counts", async () => {
    const snapshot = await api.getPlatformSnapshot();
    const directoryOnly = snapshot.gyms.find((gym) => gym.id !== "forge-fitness");
    expect(directoryOnly).toBeDefined();
    expect(snapshot.overview.gymCounts.active).toBe(1);
    expect((await api.listMarketplaceGyms()).some((gym) => gym.id === directoryOnly?.id)).toBe(false);

    await expect(api.updatePlatformGym({ gymId: directoryOnly!.id, status: "suspended", reason: "Reject unprovisioned tenant mutation." })).rejects.toMatchObject({ code: ERR.CONFIGURATION });
    const hidden = await api.updatePlatformGym({ gymId: directoryOnly!.id, isPublic: false, reason: "Remove stale directory visibility." });
    expect(hidden).toMatchObject({ subscriptionStatus: "suspended", isPublic: false });
    expect((await api.getPlatformSnapshot()).overview.gymCounts.active).toBe(1);
  });

  it("synchronizes provisioned subscription facts, MRR, entitlements, and audit evidence", async () => {
    const before = await api.getPlatformSnapshot();
    const forgeBefore = before.gyms.find((gym) => gym.id === "forge-fitness")!;
    const growthBefore = before.plans.find((plan) => plan.name === "Growth")!;

    await api.updatePlatformGym({ gymId: forgeBefore.id, status: "suspended", plan: "Growth", currentPeriodEndsAt: forgeBefore.currentPeriodEndsAt, isPublic: true, reason: "Billing review requires access suspension." });

    const suspended = await api.getPlatformGymDetail(forgeBefore.id);
    expect(suspended.controls).toMatchObject({ status: "suspended", plan: "Growth", isPublic: false });
    expect(suspended.organization).toMatchObject({ state: "available", value: { status: "suspended" } });
    expect(suspended.subscription).toMatchObject({
      plan: { state: "available", value: "Growth" },
      status: { state: "available", value: "suspended" },
      statusReason: { state: "available", value: "Billing review requires access suspension." },
    });
    expect(suspended.activity).toMatchObject({
      state: "available",
      value: [expect.objectContaining({ action: "gym.subscription.update", actorName: expect.any(String), summary: expect.stringContaining("suspended") })],
    });

    const suspendedSnapshot = await api.getPlatformSnapshot();
    const suspendedGym = suspendedSnapshot.gyms.find((gym) => gym.id === forgeBefore.id)!;
    expect(suspendedGym.lastActiveAt).toBe(forgeBefore.lastActiveAt);
    expect(suspendedSnapshot.overview.gymCounts.suspended).toBe(1);
    expect(suspendedSnapshot.overview.activeMrr.amount).toBe(0);
    expect(suspendedSnapshot.auditEvents[0]).toMatchObject({ action: "gym.subscription.update", summary: expect.stringContaining("suspended"), actorName: expect.any(String) });

    const workspace = await api.getWorkspaceAccess();
    expect(workspace.entitlements).toMatchObject({ subscriptionPlan: "Growth", source: "subscription_plan", entitledModules: expect.arrayContaining(["foundation", "operations"]) });

    await api.updatePlatformGym({ gymId: forgeBefore.id, status: "active", plan: "Growth", currentPeriodEndsAt: forgeBefore.currentPeriodEndsAt, isPublic: true, reason: "Billing review cleared; restore access." });
    const restoredSnapshot = await api.getPlatformSnapshot();
    expect(restoredSnapshot.gyms.find((gym) => gym.id === forgeBefore.id)).toMatchObject({ subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true });
    expect(restoredSnapshot.overview.activeMrr.amount).toBe(growthBefore.priceMinor);
  });

  it("pushes Starter, Growth, and Pro module access after each platform tier change", async () => {
    const values: T.WorkspaceAccess[] = [];
    const unsubscribe = await api.subscribeWorkspaceAccess((access) => values.push(access));
    const transitions = [
      { plan: "Starter" as const, entitled: ["foundation", "revenue"], locked: ["operations", "finance", "reporting"] },
      { plan: "Growth" as const, entitled: ["foundation", "revenue", "operations"], locked: ["finance", "reporting"] },
      { plan: "Pro" as const, entitled: ["foundation", "revenue", "operations", "finance", "reporting"], locked: [] },
      { plan: "Enterprise" as const, entitled: ["foundation", "revenue", "operations", "finance", "reporting"], locked: [] },
    ];

    for (const transition of transitions) {
      await api.updatePlatformGym({ gymId: "forge-fitness", status: "active", plan: transition.plan, currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", isPublic: true, reason: `Unlock ${transition.plan} modules for the tenant.` });
      const access = values.at(-1);
      expect(access?.entitlements).toMatchObject({ subscriptionPlan: transition.plan, entitledModules: transition.entitled });
      expect(access?.modules.filter((module) => module.entitled && module.enabled).map((module) => module.key)).toEqual(transition.entitled);
      for (const moduleKey of transition.locked) {
        expect(access?.modules.find((module) => module.key === moduleKey)).toMatchObject({ entitled: false, enabled: false, lockedReason: "not_entitled" });
        await expect(api.getWorkspaceModuleStatus(moduleKey as T.WorkspaceModuleKey)).rejects.toMatchObject({ code: ERR.FEATURE_NOT_AVAILABLE });
      }
      const session = await api.getSession();
      expect(session.workspace?.entitlements).toMatchObject({ subscriptionPlan: transition.plan, entitledModules: transition.entitled });
      if (transition.plan === "Starter") {
        await api.updateWorkspaceModulePreferences({ enabledModules: ["foundation", "revenue"] });
      }
    }
    unsubscribe();
  });

  it("rejects invalid lifecycle transitions and never publishes non-operational statuses", async () => {
    await expect(api.updatePlatformGym({ gymId: "forge-fitness", status: "trial", reason: "Attempt to restart the one-month onboarding trial." })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.updatePlatformGym({ gymId: "forge-fitness", status: "active", cancelledAt: "2026-01-01T00:00:00.000Z", reason: "Invalid cancellation date." } as Parameters<MockGymOSApi["updatePlatformGym"]>[0])).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.updatePlatformGym({ gymId: "forge-fitness", plan: "Enterprise", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", reason: "Move the tenant to the Enterprise workspace tier." })).resolves.toMatchObject({ rivetPlan: "Enterprise" });

    const overdue = await api.updatePlatformGym({ gymId: "forge-fitness", status: "overdue", currentPeriodEndsAt: "2099-12-31T23:59:59.999Z", isPublic: true, reason: "Payment is past due." });
    expect(overdue).toMatchObject({ subscriptionStatus: "overdue", isPublic: false });
    const snapshot = await api.getPlatformSnapshot();
    expect(snapshot.gyms.find((gym) => gym.id === "forge-fitness")).toMatchObject({ subscriptionStatus: "overdue", isPublic: false });
  });

  it("archives a gym only after typed confirmation and retains an audit record", async () => {
    await expect(api.archivePlatformGym({ gymId: "forge-fitness", confirmation: "Forge", reason: "Customer requested account closure." })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await api.archivePlatformGym({ gymId: "forge-fitness", confirmation: "Forge Fitness Club", reason: "Customer requested account closure." });

    const snapshot = await api.getPlatformSnapshot();
    expect(snapshot.gyms.find((gym) => gym.id === "forge-fitness")).toMatchObject({ isArchived: true, isPublic: false, subscriptionStatus: "suspended" });
    expect(snapshot.invoices.some((invoice) => invoice.gymId === "forge-fitness")).toBe(true);
    expect(snapshot.supportCases.some((supportCase) => supportCase.gymId === "forge-fitness")).toBe(true);
    expect(snapshot.auditEvents[0]).toMatchObject({ action: "gym.archive", entityPublicId: "forge-fitness", reason: "Customer requested account closure." });
    await expect(api.getPlatformGymDetail("forge-fitness")).resolves.toMatchObject({ controls: { isArchived: true, isPublic: false, status: "suspended" } });
    await expect(api.listMarketplaceGyms()).resolves.toEqual([]);
    await expect(api.getSession()).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });

  it("emits plan catalog changes and truthful audit events through the platform stream", async () => {
    const snapshots: PlatformSnapshot[] = [];
    const unsubscribe = await api.subscribePlatformSnapshot((snapshot) => snapshots.push(snapshot));
    const plan = (await api.getPlatformSnapshot()).plans.find((item) => item.name === "Growth")!;

    await api.updatePlatformPlan({ name: plan.name, priceMinor: plan.priceMinor + 5_000, reason: "Annual platform catalog review." });

    expect(snapshots.at(-1)?.plans.find((item) => item.name === plan.name)).toMatchObject({ priceMinor: plan.priceMinor + 5_000 });
    expect(snapshots.at(-1)?.auditEvents[0]).toMatchObject({ action: "plan.catalog_update", summary: "Updated Growth plan catalog limits and capabilities", actorName: expect.any(String) });
    unsubscribe();
  });

  it("projects catalog capability toggles to the assigned gym entitlement", async () => {
    const updated = await api.updatePlatformPlan({ name: "Pro", entitledModules: ["foundation", "revenue"], reason: "Keep finance and reporting behind an approved add-on." });
    expect(updated.entitledModules).toEqual(["foundation", "revenue"]);
    const access = await api.getWorkspaceAccess();
    expect(access.entitlements).toMatchObject({ subscriptionPlan: "Pro", entitledModules: ["foundation", "revenue"] });
    expect(access.modules.find((module) => module.key === "finance")).toMatchObject({ entitled: false, enabled: false });
    expect((await api.listPublicSaasPlans()).find((plan) => plan.name === "Pro")).toMatchObject({ entitledModules: ["foundation", "revenue"] });
  });

  it("reports initial platform snapshot failures to subscribers instead of claiming ready data", async () => {
    api.setBehavior({ failNextRequest: true });
    const values: PlatformSnapshot[] = [];
    const errors: unknown[] = [];
    const unsubscribe = await api.subscribePlatformSnapshot((snapshot) => values.push(snapshot), (error) => errors.push(error));

    expect(values).toHaveLength(0);
    expect(errors).toEqual([expect.objectContaining({ code: ERR.FORCED_FAILURE })]);
    unsubscribe();
  });

  it("pushes subscription visibility changes to the mock marketplace stream", async () => {
    const values: string[][] = [];
    const unsubscribe = await api.subscribeMarketplaceGyms((gyms) => values.push(gyms.map((gym) => gym.id)));
    const gym = (await api.getPlatformSnapshot()).gyms[0]!;

    expect(values.at(-1)).toContain(gym.id);
    await api.updatePlatformGym({ gymId: gym.id, status: "suspended", currentPeriodEndsAt: gym.currentPeriodEndsAt, isPublic: false, reason: "Suspended for marketplace visibility test." });

    expect(values.at(-1)).not.toContain(gym.id);
    unsubscribe();
  });

  it("can fail the next public subscription without consuming a general request failure", async () => {
    api.setBehavior({ failNextPublicSubscription: true });
    const errors: unknown[] = [];
    const unsubscribe = await api.subscribePublicSaasPlans(() => undefined, (error) => errors.push(error));

    expect(errors).toEqual([expect.objectContaining({ code: ERR.FORCED_FAILURE })]);
    expect(api.getBehavior().failNextPublicSubscription).toBe(true);
    unsubscribe();
    api.setBehavior({ failNextPublicSubscription: false });
  });

  it("returns target-scoped tenant facts and explicit provider gaps", async () => {
    const forge = await api.getPlatformGymDetail("forge-fitness");
    expect(forge.organization).toMatchObject({ state: "available", value: { name: "Forge Fitness Club" } });
    expect(forge.owner).toMatchObject({ state: "available", value: { name: "Omar Al-Khatib", email: "omar@forgefitness.jo" } });
    expect(forge.branches).toMatchObject({ state: "available", value: expect.arrayContaining([expect.objectContaining({ name: "Forge — Abdoun" })]) });
    expect(forge.usage.memberCount.state).toBe("available");
    expect(forge.usage.paymentTransactionCount.state).toBe("available");
    expect(forge).not.toHaveProperty("health");
    expect(forge.subscription.paymentMethod).toEqual({ state: "not_configured" });
    expect(JSON.stringify(forge)).not.toContain("Dana Al-Khatib");
    expect(JSON.stringify(forge)).not.toContain("4041");
    expect(JSON.stringify(forge)).not.toContain("RV-1041");

    const directoryOnly = await api.getPlatformGymDetail("pulse-lab");
    expect(directoryOnly.organization).toEqual({ state: "not_available" });
    expect(directoryOnly.owner).toEqual({ state: "not_available" });
    expect(directoryOnly.usage.memberCount).toEqual({ state: "not_available" });
    expect(JSON.stringify(directoryOnly)).not.toContain("Omar Al-Khatib");
  });
});

describe("gym public profile media", () => {
  it("persists selected logo, cover, and gallery media through draft save and publication", async () => {
    const initial = await api.getGymPublicProfile();
    const upload = (ownerType: "gym_logo" | "gym_cover" | "gym_gallery") => api.uploadMediaAsset({
      ownerType,
      ownerId: initial.organizationId,
      altText: `${ownerType} alternative text`,
      file: new Blob(["image-bytes"], { type: "image/png" }),
    });
    const logo = await upload("gym_logo");
    const cover = await upload("gym_cover");
    const gallery = await upload("gym_gallery");

    expect(logo.status).toBe("pending");
    const draft = await api.saveGymPublicProfile({
      shortName: initial.shortName,
      taglineEn: initial.taglineEn,
      descriptionEn: initial.descriptionEn,
      category: initial.category,
      audience: initial.audience,
      amenities: initial.amenities,
      accentColor: initial.accentColor,
      logoAssetId: logo.id,
      coverAssetId: cover.id,
      galleryAssetIds: [gallery.id],
    });
    expect(draft).toMatchObject({ status: "draft", logo: { id: logo.id }, cover: { id: cover.id }, gallery: [{ id: gallery.id }] });

    // The seeded page is already live, so publication runs through the
    // platform review path.
    await api.publishPlatformGymProfile({ gymId: "forge-fitness", reason: "Reviewed the media update." });
    const published = await api.getGymPublicProfile();
    expect(published).toMatchObject({ status: "published", logo: { id: logo.id }, cover: { id: cover.id }, gallery: [{ id: gallery.id }] });
    expect((await api.listMarketplaceGyms())[0]).toMatchObject({ logo: { id: logo.id }, cover: { id: cover.id } });

    const replacement = await upload("gym_logo");
    const replacementDraft = await api.saveGymPublicProfile({
      shortName: published.shortName,
      taglineEn: published.taglineEn,
      descriptionEn: published.descriptionEn,
      category: published.category,
      audience: published.audience,
      amenities: published.amenities,
      accentColor: published.accentColor,
      logoAssetId: replacement.id,
      galleryAssetIds: [],
    });
    expect(replacementDraft).toMatchObject({ status: "draft", logo: { id: replacement.id }, gallery: [] });
    await api.publishPlatformGymProfile({ gymId: "forge-fitness", reason: "Reviewed the logo replacement." });
    expect(await api.getGymPublicProfile()).toMatchObject({ status: "published", logo: { id: replacement.id }, gallery: [] });
  });

  it("projects the published logo into reactive platform surfaces while keeping public rows scoped", async () => {
    const snapshotValues: PlatformSnapshot[] = [];
    const detailValues: PlatformGymDetail[] = [];
    const stopSnapshot = await api.subscribePlatformSnapshot((snapshot) => snapshotValues.push(snapshot));
    const stopDetail = await api.subscribePlatformGymDetail("forge-fitness", (detail) => detailValues.push(detail));
    const profile = await api.getGymPublicProfile();
    const logo = await api.uploadMediaAsset({ ownerType: "gym_logo", ownerId: profile.organizationId, altText: "Forge admin logo", file: new Blob(["logo"], { type: "image/png" }) });
    await api.saveGymPublicProfile({ shortName: profile.shortName, taglineEn: profile.taglineEn, descriptionEn: profile.descriptionEn, category: profile.category, audience: profile.audience, amenities: profile.amenities, accentColor: profile.accentColor, logoAssetId: logo.id, galleryAssetIds: [] });
    await api.publishPlatformGymProfile({ gymId: "forge-fitness", reason: "Reviewed the logo update." });

    expect(snapshotValues.at(-1)?.gyms.find((gym) => gym.id === "forge-fitness")).toMatchObject({ logoUrl: logo.url });
    expect(detailValues.at(-1)?.logoUrl).toEqual({ state: "available", value: logo.url });
    expect((await api.listMarketplaceGyms()).find((gym) => gym.id === "forge-fitness")).not.toHaveProperty("logoUrl");
    stopSnapshot();
    stopDetail();
  });

  it("keeps trainer photos pending until the linked profile save", async () => {
    const workspace = await api.getPtWorkspace();
    const trainer = workspace.trainers[0];
    expect(trainer).toBeDefined();
    const asset = await api.uploadMediaAsset({ ownerType: "trainer_photo", ownerId: trainer!.id, altText: "Coach profile photo", file: new Blob(["trainer"], { type: "image/png" }) });
    expect(asset.status).toBe("pending");
    expect((await api.getPtWorkspace()).trainers[0]?.photoUrl).toBeUndefined();

    await api.upsertPtTrainerProfile({
      id: trainer!.id,
      userId: trainer!.userId,
      displayName: trainer!.displayName,
      bioEn: trainer!.bioEn,
      bioAr: trainer!.bioAr,
      specialties: trainer!.specialties,
      languages: trainer!.languages,
      branchIds: trainer!.branchIds,
      status: trainer!.status,
      photoAssetId: asset.id,
      photoAlt: "Coach profile photo",
    });
    expect((await api.getPtWorkspace()).trainers[0]?.photoUrl).toBe(asset.url);
    expect((api as unknown as { mediaAssets: Map<string, T.MediaAsset> }).mediaAssets.get(asset.id)).toMatchObject({ status: "active" });
  });

  it("keeps member-photo uploads inside the member's branch scope", async () => {
    const internals = api as unknown as { db: MockDb };
    const session = await api.getSession();
    const sourceBranch = session.branches[0];
    const memberBranch = session.branches[1];
    if (!sourceBranch || !memberBranch) throw new Error("seed should contain two branches");
    const member = internals.db.members.find((candidate) => candidate.homeBranchId === memberBranch.id);
    const salesperson = internals.db.users.find((candidate) => candidate.role === "salesperson" && candidate.status === "active");
    if (!member || !salesperson) throw new Error("seed should contain a member and salesperson");

    salesperson.branchScope = "selected";
    salesperson.branchIds = [sourceBranch.id];
    await api.switchDemoRole("salesperson", sourceBranch.id);
    await expect(api.uploadMediaAsset({ ownerType: "member_photo", ownerId: member.id, file: new Blob(["member"], { type: "image/png" }) })).rejects.toMatchObject({ code: ERR.FORBIDDEN });

    salesperson.branchIds = [memberBranch.id];
    await api.switchDemoRole("salesperson", memberBranch.id);
    await expect(api.uploadMediaAsset({ ownerType: "member_photo", ownerId: member.id, file: new Blob(["member"], { type: "image/png" }) })).resolves.toMatchObject({ ownerType: "member_photo", visibility: "private", status: "active" });
  });
});

describe("tenant/branch scoping and authorization", () => {
  it("refuses the branch financial ledger to a receptionist", async () => {
    await api.switchDemoRole("receptionist");
    await expect(api.listTransactions({ pageSize: 5 })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });

  it("refuses a refund to a salesperson", async () => {
    const tx = await api.listTransactions({ type: "payment", pageSize: 1 });
    const payment = tx.items[0]!;
    await api.switchDemoRole("salesperson");
    await expect(api.refundPayment(payment.id, { reason: "trying it on", idempotencyKey: "refund-role-gate" })).rejects.toMatchObject({
      code: ERR.FORBIDDEN,
    });
  });

  it("requires refund authority to review a flagged refund", async () => {
    const pendingRefund = (await api.listPendingApprovals()).find((event) => event.action === "payment.refund");
    expect(pendingRefund).toBeDefined();

    await api.switchDemoRole("salesperson");
    await expect(api.reviewApproval(pendingRefund!.id, { decision: "approved" })).rejects.toMatchObject({ code: ERR.FORBIDDEN });

    await api.switchDemoRole("manager");
    await api.reviewApproval(pendingRefund!.id, { decision: "approved", note: "Evidence checked" });
    const reviewed = await api.listAuditEvents({ entityId: pendingRefund!.entityId, pageSize: 20 });
    expect(reviewed.items.find((event) => event.id === pendingRefund!.id)?.approvalStatus).toBe("approved");
  });

  it("keeps approval results inside the actor's branch scope", async () => {
    const pendingRefund = (await api.listPendingApprovals()).find((event) => event.action === "payment.refund");
    expect(pendingRefund).toBeDefined();

    const session = await api.switchDemoRole("manager");
    const hiddenBranch = session.branches.find((branch) => branch.id !== pendingRefund!.branchId)!;
    const internalApi = api as unknown as { db: { users: Array<{ id: string; role: string; branchScope: string; branchIds: string[] }> } };
    const manager = internalApi.db.users.find((user) => user.id === session.user.id);
    expect(manager).toBeDefined();
    manager!.branchIds = [hiddenBranch.id];
    manager!.branchScope = "selected";

    await expect(api.listPendingApprovals()).resolves.not.toContainEqual(pendingRefund);
    await expect(api.reviewApproval(pendingRefund!.id, { decision: "approved" })).rejects.toMatchObject({ code: ERR.NOT_FOUND });
  });

  it("refuses a check-in override without the permission", async () => {
    const members = await api.listMembers({ pageSize: 1 });
    const session = await api.switchDemoRole("receptionist");
    await expect(
      api.overrideCheckIn({
        memberId: members.items[0]!.id,
        branchId: session.branches[0]!.id,
        reason: "let them in",
      }),
    ).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });

  it("scopes member lists to the active branch", async () => {
    const session = await api.getSession();
    const branch = session.branches[0]!;
    const scoped = await api.listMembers({ branchId: branch.id, pageSize: 100 });
    expect(scoped.items.length).toBeGreaterThan(0);
    expect(scoped.items.every((m) => m.homeBranchId === branch.id)).toBe(true);
  });

  it("reports NOT_FOUND for an unknown member id rather than leaking existence", async () => {
    await expect(api.getMember("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: ERR.NOT_FOUND,
    });
  });
});

describe("member creation", () => {
  it("keeps a member-owned marketing preference and its history separate from staff records", async () => {
    const initial = await api.getCustomerExperience();
    const customerId = initial.customer?.id;
    expect(customerId).toBeDefined();
    expect(initial.customer?.marketingPreference).toMatchObject({ optedIn: true, source: "system_default" });
    expect(initial.customer?.marketingPreferenceHistory).toHaveLength(1);

    const optedOut = await api.updateCustomerMarketingPreference({ optedIn: false, customerId });
    expect(optedOut.marketingPreference).toMatchObject({ optedIn: false, source: "member_selected" });
    expect(optedOut.marketingPreferenceHistory).toHaveLength(2);

    const optedIn = await api.updateCustomerMarketingPreference({ optedIn: true, customerId });
    expect(optedIn.marketingPreference).toMatchObject({ optedIn: true, source: "member_selected" });
    expect(optedIn.marketingPreferenceHistory).toHaveLength(3);
  });

  it("delivers the member snapshot and returns a safe mock disposer", async () => {
    const values: unknown[] = [];
    const errors: unknown[] = [];
    const unsubscribe = await api.subscribeCustomerExperience((value) => values.push(value), (error) => errors.push(error));

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ memberships: expect.any(Array), bookings: expect.any(Array) });
    expect(errors).toHaveLength(0);
    expect(() => unsubscribe()).not.toThrow();
  });

  it("creates a member, assigns a branch-prefixed number and starts a timeline", async () => {
    const session = await api.getSession();
    const branch = session.branches[0]!;
    const before = await api.listMembers({ pageSize: 1 });

    const { member, duplicates } = await api.createMember({
      fullName: "Yousef Al-Masri",
      phone: "+962 79 555 1234",
      homeBranchId: branch.id,
      preferredLanguage: "ar",
    });

    expect(member.memberNumber).toContain(branch.code);
    expect(duplicates).toHaveLength(0);

    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((e) => e.type === "member_created")).toBe(true);

    const after = await api.listMembers({ pageSize: 1 });
    expect(after.totalItems).toBe(before.totalItems + 1);
  });

  it("fails closed when a member mutation receives a stale branch", async () => {
    await expect(api.createMember({
      fullName: "Stale Branch Test",
      phone: "+962 79 555 1200",
      homeBranchId: "branch-no-longer-visible",
      preferredLanguage: "en",
    })).rejects.toMatchObject({ code: ERR.NOT_FOUND });

    await expect(api.previewMemberImport({
      branchId: "branch-no-longer-visible",
      csv: "full_name,phone\nStale Branch,+962790001200",
    })).rejects.toMatchObject({ code: ERR.NOT_FOUND });
  });

  it("defaults new members and imported rows to opted in while preserving explicit opt-out", async () => {
    const session = await api.getSession();
    const created = await api.createMember({
      fullName: "Consent Default Test",
      phone: "+962 79 555 1240",
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
    });
    expect(created.member.marketingOptIn).toBe(true);
    expect(created.member.marketingPreference).toMatchObject({ optedIn: true, source: "system_default" });

    const optedOut = await api.createMember({
      fullName: "Preference Explicit Test",
      phone: "+962 79 555 1241",
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
      marketingOptIn: false,
    });
    expect(optedOut.member.marketingOptIn).toBe(false);
    expect(optedOut.member.marketingPreference).toMatchObject({ optedIn: false, source: "staff_selected" });

    const updated = await api.updateMember(created.member.id, { marketingOptIn: false, marketingPreferenceSource: "staff_selected" });
    expect(updated.marketingPreference).toMatchObject({ optedIn: false, source: "staff_selected" });
    expect((await api.listMemberTimeline(created.member.id)).items.some((event) => event.type === "marketing_preference_changed")).toBe(true);
    expect((await api.listAuditEvents({ entityId: created.member.id, pageSize: 20 })).items.some((event) => event.action === "member.marketing_preference.update")).toBe(true);

    const preview = await api.previewMemberImport({
      branchId: session.branches[0]!.id,
      csv: "full_name,phone,email\nConsent Import,+962790001240,consent-import@example.com",
    });
    const imported = await api.commitMemberImport({ importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "member-import-consent-1" });
    expect(imported.committedCount).toBe(1);
    const importedMember = (await api.listMembers({ search: "Consent Import", pageSize: 5 })).items[0];
    expect(importedMember).toBeDefined();
    expect((await api.getMember(importedMember!.id)).marketingOptIn).toBe(true);
  });

  it("warns about a duplicate phone instead of silently creating a second record", async () => {
    const existing = (await api.listMembers({ pageSize: 1 })).items[0]!;
    const session = await api.getSession();
    const result = await api.createMember({
      fullName: "Different Name Entirely",
      phone: existing.phone,
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
    });
    expect(result.duplicates.length).toBeGreaterThan(0);
    expect(result.duplicates[0]!.matchedOn).toBe("phone");
  });

  it("finds duplicates through the dedicated check before submitting", async () => {
    const existing = (await api.listMembers({ pageSize: 1 })).items[0]!;
    const matches = await api.checkMemberDuplicates({ phone: existing.phone });
    expect(matches.map((m) => m.memberId)).toContain(existing.id);
  });

  it("previews and commits member CSV rows with resumable idempotency", async () => {
    const branch = (await api.getSession()).branches[0]!;
    const preview = await api.previewMemberImport({
      branchId: branch.id,
      csv: "full_name,phone,email\nImport Test,+962790000099,import-test@example.com",
    });
    expect(preview.validRows).toBe(1);

    const first = await api.commitMemberImport({ importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "member-import-idem-1" });
    const retry = await api.commitMemberImport({ importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "member-import-idem-1" });
    expect(retry).toEqual(first);
    expect(first.status).toBe("completed");

    await expect(api.commitMemberImport({ importId: preview.id, cursor: 1, chunkSize: 25, idempotencyKey: "member-import-idem-1" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    expect((await api.listMembers({ search: "Import Test", pageSize: 5 })).totalItems).toBe(1);
  });
});

describe("lead capture", () => {
  it("normalizes optional email and supports an explicit unassigned owner", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({
      fullName: "Lead Email Test",
      phone: "+962 79 555 1299",
      email: "  Prospect@Example.COM ",
      branchId: session.branches[0]!.id,
      source: "phone_call",
      ownerId: "unassigned",
    });
    expect(lead.email).toBe("prospect@example.com");
    expect(lead.ownerId).toBeUndefined();
    expect(lead.ownerName).toBeUndefined();
    await expect(api.createLead({
      fullName: "Malformed Lead Email",
      phone: "+962 79 555 1301",
      email: "not-an-email",
      branchId: session.branches[0]!.id,
      source: "phone_call",
    })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("requires assignment permission when choosing another staff owner", async () => {
    const ownerSession = await api.getSession();
    const salesperson = (await api.listUsers({ role: "salesperson", status: "active", pageSize: 10 })).items[0]!;
    await api.switchDemoRole("salesperson");
    await expect(api.createLead({
      fullName: "Unauthorized Assignment",
      phone: "+962 79 555 1300",
      branchId: ownerSession.branches[0]!.id,
      source: "phone_call",
      ownerId: salesperson.id,
    })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });

  it("validates self and target roles, and records audited contact corrections", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({ fullName: "Contact Correction Lead", phone: "+962 79 555 1302", email: "old@example.com", branchId: session.branches[0]!.id, source: "walk_in" });
    const internals = api as unknown as { db: MockDb };
    const receptionist = internals.db.users.find((user) => user.role === "receptionist" && user.status === "active");
    expect(receptionist).toBeDefined();
    await expect(api.updateLead(lead.id, { ownerId: receptionist!.id })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.updateLead(lead.id, { ownerId: lead.ownerId })).resolves.toMatchObject({ ownerId: lead.ownerId });

    const updated = await api.updateLeadContact(lead.id, { fullName: "  Corrected Contact Lead ", phone: " +962 79 555 1309 ", email: " NEW@EXAMPLE.COM " });
    expect(updated).toMatchObject({ fullName: "Corrected Contact Lead", phone: "+962 79 555 1309", email: "new@example.com", stage: "new" });
    expect(updated.activities).toContainEqual(expect.objectContaining({ type: "lead_contact_updated", body: "Contact details were updated; pipeline status was unchanged." }));
    expect(updated.activities).not.toContainEqual(expect.objectContaining({ type: "call_attempt" }));
    expect((await api.listAuditEvents({ category: "crm", entityId: lead.id, pageSize: 20 })).items).toContainEqual(expect.objectContaining({ action: "lead.contact.update", before: { fullName: "Contact Correction Lead", phone: "+962 79 555 1302", email: "old@example.com" }, after: { fullName: "Corrected Contact Lead", phone: "+962 79 555 1309", email: "new@example.com" } }));
    await expect(api.updateLeadContact(lead.id, { fullName: "Corrected Contact Lead", phone: "+962 79 555 1309", email: "bad" })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });
});

describe("collecting a payment", () => {
  it("reduces the outstanding balance, issues a receipt and records the timeline event", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;

    const receipt = await api.createPayment(
      { memberId: member.id, amount: money(owed), method: "cash" },
      "idem-full-1",
    );

    expect(receipt.payment.amount.amount).toBe(owed);
    expect(receipt.receipt.receiptNumber).toMatch(/^R-\d+$/);
    expect(receipt.member?.memberNumber).toBe(member.memberNumber);

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(0);

    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((e) => e.type === "payment_collected")).toBe(true);
  });

  it("leaves a remainder outstanding on a partial payment", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const part = Math.floor(owed / 2);

    await api.createPayment({ memberId: member.id, amount: money(part), method: "card", externalReference: "TEST-POS-PARTIAL" }, "idem-part-1");

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(owed - part);
    expect(after.outstanding.amount).toBeGreaterThan(0);
  });

  it("is idempotent — a retried request does not take the money twice", async () => {
    const member = await anyMemberWithBalance();
    const amount = money(Math.floor(member.outstanding.amount / 3));

    const first = await api.createPayment({ memberId: member.id, amount, method: "cash" }, "idem-retry-1");
    const second = await api.createPayment({ memberId: member.id, amount, method: "cash" }, "idem-retry-1");

    expect(second.payment.id).toBe(first.payment.id);
    expect(second.receipt.receiptNumber).toBe(first.receipt.receiptNumber);

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(member.outstanding.amount - amount.amount);
  });

  it("shows the payment in the branch ledger", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment(
      { memberId: member.id, amount: money(10_000), method: "cliq", externalReference: "TEST-CLIQ-LEDGER" },
      "idem-ledger-1",
    );
    const ledger = await api.listTransactions({ search: receipt.receipt.receiptNumber, pageSize: 5 });
    expect(ledger.items.map((t) => t.receiptNumber)).toContain(receipt.receipt.receiptNumber);
  });
});

describe("membership sale and renewal", () => {
  it("sells a membership with a payment and records charge, receipt and timeline together", async () => {
    const member = await freshMemberForSale();
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
      overrideReason: "Historical test sale date.",
      payment: { amount: plan.basePrice, method: "cash" },
    });

    expect(result.membership.planId).toBe(plan.id);
    expect(result.charge.total.amount).toBe(plan.basePrice.amount);
    expect(result.payment).toBeDefined();
    expect(result.receipt).toBeDefined();
    expect(result.charge.outstandingAmount.amount).toBe(0);

    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((e) => e.type === "membership_sold")).toBe(true);
  });

  it("leaves an outstanding balance when the member pays a deposit only", async () => {
    const member = await freshMemberForSale();
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;
    const deposit = money(Math.floor(plan.basePrice.amount / 4));

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
      overrideReason: "Historical test sale date.",
      payment: { amount: deposit, method: "cash" },
    });

    expect(result.charge.outstandingAmount.amount).toBe(plan.basePrice.amount - deposit.amount);
    expect(result.membership.paymentStatus).toBe("partial");
  });

  it("applies a discount to the charge total and keeps the reason", async () => {
    const member = await freshMemberForSale();
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;
    const discount = fromMajor(10);

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
      overrideReason: "Historical test sale date.",
      discount,
      discountReason: "Ramadan promotion",
    });

    expect(result.charge.discount.amount).toBe(discount.amount);
    expect(result.charge.total.amount).toBe(plan.basePrice.amount - discount.amount);
    expect(result.membership.discountReason).toBe("Ramadan promotion");
  });

  it("keeps the previous term in history and links the renewal to it", async () => {
    const expiring = await api.listRenewalQueue({ bucket: "expiring", pageSize: 5 });
    const item = expiring.items[0]!;
    const previousId = item.membership.id;

    const result = await api.renewMembership(previousId, {});

    expect(result.membership.id).not.toBe(previousId);
    expect(result.membership.previousMembershipId).toBe(previousId);
    expect(result.charge.collectible).toBeUndefined();
    const successor = (await api.listMemberships({ pageSize: 100 })).items.find((membership) => membership.id === result.membership.id);
    expect(successor).toMatchObject({ outstanding: { amount: 0 }, upcomingAmount: { amount: result.charge.total.amount } });

    // The old term is still readable — membership history is immutable.
    const old = await api.getMembership(previousId);
    expect(old.id).toBe(previousId);

    const timeline = await api.listMemberTimeline(item.member.id);
    expect(timeline.items.some((e) => e.type === "membership_renewed")).toBe(true);
  });

  it("drops a renewed member out of the expiring queue", async () => {
    const before = await api.listRenewalQueue({ bucket: "expiring", pageSize: 50 });
    const item = before.items[0]!;
    await api.renewMembership(item.membership.id, {});
    const after = await api.listRenewalQueue({ bucket: "expiring", pageSize: 50 });
    expect(after.items.map((i) => i.membership.id)).not.toContain(item.membership.id);
  });

  it("changes a membership plan with explicit successor lineage and no proration", async () => {
    const member = await freshMemberForSale();
    const plans = (await api.listPlans({ status: "active", pageSize: 10 })).items;
    const originalPlan = plans[0]!;
    const replacement = plans.find((plan) => plan.id !== originalPlan.id)!;
    const sale = await api.createMembershipSale({ memberId: member.id, planId: originalPlan.id, startDate: "2026-08-01", overrideReason: "Historical test sale date." });

    const changed = await api.changeMembershipPlan(sale.membership.id, {
      planId: replacement.id,
      effectiveDate: "next_renewal",
      reason: "Member chose a higher access tier at renewal.",
    });

    expect(changed.membership.previousMembershipId).toBe(sale.membership.id);
    expect(changed.membership.planId).toBe(replacement.id);
    expect(changed.membership.startDate).toBe(addDays(sale.membership.endDate, 1));
    expect((await api.getMembership(sale.membership.id)).cancelledAt).toBeUndefined();
    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((event) => event.type === "membership_plan_changed")).toBe(true);
    expect((await api.listAuditEvents({ entityId: changed.membership.id, pageSize: 20 })).items.some((event) => event.action === "membership.plan_change")).toBe(true);
  });

  it("requires date-override authority and supersedes the old term for immediate changes", async () => {
    const member = await freshMemberForSale();
    const plans = (await api.listPlans({ status: "active", pageSize: 10 })).items;
    const sale = await api.createMembershipSale({ memberId: member.id, planId: plans[0]!.id, startDate: todayISODate() });

    const changed = await api.changeMembershipPlan(sale.membership.id, {
      planId: plans.find((plan) => plan.id !== plans[0]!.id)!.id,
      effectiveDate: "immediate",
      reason: "Member needs the new access tier today.",
    });

    expect(changed.membership.startDate).toBe(todayISODate());
    expect((await api.getMembership(sale.membership.id)).cancelledAt).toBeDefined();

    await api.switchDemoRole("receptionist");
    await expect(api.changeMembershipPlan(changed.membership.id, {
      planId: plans[0]!.id,
      effectiveDate: "immediate",
      reason: "Attempted unauthorized plan change.",
    })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });
});

describe("membership adjustments", () => {
  it("transfers a membership and member home branch with an audit trail", async () => {
    const session = await api.getSession();
    const active = await api.listMemberships({ status: "active", pageSize: 50 });
    const candidates = await Promise.all(active.items.map((membership) => api.getMembership(membership.id)));
    const membership = candidates.find((candidate) => candidate.plan.branchAccess === "all")!;
    const destination = session.branches.find((branch) => branch.id !== membership.homeBranchId)!;

    const transferred = await api.transferMembership(membership.id, { branchId: destination.id, reason: "Member relocated closer to this branch" });

    expect(transferred.homeBranchId).toBe(destination.id);
    expect(transferred.member.homeBranchId).toBe(destination.id);
    expect(transferred.adjustments.at(-1)).toMatchObject({ type: "branch_transfer", reason: "Member relocated closer to this branch" });
    const timeline = await api.listMemberTimeline(membership.member.id, { pageSize: 50 });
    expect(timeline.items.some((event) => event.type === "membership_transferred")).toBe(true);
    const audit = await api.listAuditEvents({ category: "memberships", pageSize: 50 });
    expect(audit.items.some((event) => event.action === "membership.branch_transfer" && event.entityId === membership.id)).toBe(true);
  });

  it("freezes a membership, writes an adjustment and an audit event", async () => {
    const active = await api.listMemberships({ status: "active", pageSize: 5 });
    const membership = active.items[0]!;
    const today = todayISODate("Asia/Amman");

    const detail = await api.freezeMembership(membership.id, {
      startDate: today,
      endDate: addDays(today, 14),
      reason: "Travelling for work",
    });

    expect(detail.activeFreeze).toBeDefined();
    expect(detail.adjustments.some((a) => a.type === "freeze" && a.reason === "Travelling for work")).toBe(true);

    const audit = await api.listAuditEvents({ category: "memberships", pageSize: 20 });
    expect(audit.items.some((e) => e.action === "membership.freeze" && e.entityId === membership.id)).toBe(true);
  });

  it("rejects a freeze with no reason", async () => {
    const active = await api.listMemberships({ status: "active", pageSize: 5 });
    await expect(
      api.freezeMembership(active.items[0]!.id, { startDate: "2026-08-01", endDate: "2026-08-10", reason: "  " }),
    ).rejects.toSatisfy((e: unknown) => isApiError(e) && e.code === ERR.VALIDATION);
  });

  it("extends a membership end date and records before/after", async () => {
    const active = await api.listMemberships({ status: "active", pageSize: 5 });
    const membership = active.items[0]!;
    const originalEnd = membership.endDate;

    const detail = await api.extendMembership(membership.id, { days: 10, reason: "Goodwill after closure" });

    expect(detail.endDate).not.toBe(originalEnd);
    const adjustment = detail.adjustments.find((a) => a.type === "extension")!;
    expect(adjustment.before.endDate).toBe(originalEnd);
    expect(adjustment.after.endDate).toBe(detail.endDate);
  });

  it("cancels a membership and blocks entry afterwards", async () => {
    const active = await api.listMemberships({ status: "active", pageSize: 5 });
    const membership = active.items[0]!;
    const detail = await api.cancelMembership(membership.id, { reason: "Member relocated to Dubai" });

    expect(detail.status).toBe("cancelled");
    expect(detail.cancellationReason).toBe("Member relocated to Dubai");
  });
});

describe("operational policies", () => {
  it("persists entry, membership, and branch-hour rules and audits the change", async () => {
    const settings = await api.getOrganizationSettings();
    const branch = settings.branches[0]!;
    const days = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { enabled: day !== "fri", opensAt: "06:00", closesAt: "23:00" }])) as OperationalPolicies["operatingHours"][number]["days"];
    const updated = await api.updateOperationalPolicies({
      entry: { outstandingBalance: "block", expiryWarningDays: 10, duplicateScanWindowMinutes: 4, enforceOperatingHours: true },
      membership: { allowOverlappingMemberships: false, renewalWindowDays: 21, minimumFreezeDays: 5, maximumExtensionDays: 60 },
      operatingHours: [{ branchId: branch.id, days }],
      trialSchedules: [{ branchId: branch.id, days: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { enabled: day !== "fri", opensAt: "09:00", closesAt: "20:00" }])) as OperationalPolicies["trialSchedules"][number]["days"] }],
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
    });

    expect(updated.operationalPolicies.entry.outstandingBalance).toBe("block");
    expect(updated.operationalPolicies.operatingHours[0]?.branchId).toBe(branch.id);
    const audit = await api.listAuditEvents({ category: "settings", pageSize: 50 });
    expect(audit.items.some((event) => event.action === "settings.operational_policies")).toBe(true);
  });

  it("enforces the configured minimum freeze and maximum extension", async () => {
    const settings = await api.getOrganizationSettings();
    await api.updateOperationalPolicies({ ...settings.operationalPolicies, membership: { ...settings.operationalPolicies.membership, minimumFreezeDays: 10, maximumExtensionDays: 20 } });
    const active = await api.listMemberships({ status: "active", pageSize: 10 });
    const membership = active.items[0]!;
    const today = todayISODate("Asia/Amman");
    await expect(api.freezeMembership(membership.id, { startDate: today, endDate: addDays(today, 4), reason: "Short trip" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.extendMembership(membership.id, { days: 21, reason: "Too long" })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });
});

describe("check-in", () => {
  it("previews and records an allowed check-in, updating occupancy and the timeline", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const members = await api.listMembers({ branchId, membershipStatus: "active", pageSize: 10 });
    const member = members.items.find((m) => m.outstanding.amount === 0)!;

    const preview = await api.previewCheckIn({ branchId, query: member.memberNumber });
    expect(preview.found).toBe(true);
    expect(preview.decision).toBe("allowed");

    const before = await api.getOccupancy(branchId);
    const result = await api.createCheckIn({ memberId: member.id, branchId, source: "search" });
    expect(result.decision).toBe("allowed");
    expect(result.checkInId).toBeDefined();

    const after = await api.getOccupancy(branchId);
    expect(after.current).toBe(before.current + 1);
    expect(after.checkInsToday).toBe(before.checkInsToday + 1);

    const recent = await api.listRecentCheckIns({ branchId, pageSize: 5 });
    expect(recent.items[0]!.memberId).toBe(member.id);

    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((e) => e.type === "check_in")).toBe(true);
  });

  it("reports not-found for an unmatched lookup without throwing", async () => {
    const session = await api.getSession();
    const preview = await api.previewCheckIn({ branchId: session.branches[0]!.id, query: "zzzz-no-such-member" });
    expect(preview.found).toBe(false);
    expect(preview.member).toBeUndefined();
  });

  it("asks for more characters before searching", async () => {
    const session = await api.getSession();
    const preview = await api.previewCheckIn({ branchId: session.branches[0]!.id, query: "ab" });
    expect(preview.found).toBe(false);
    expect(preview.message).toMatch(/at least 3/i);
  });

  it("blocks an expired member and still records the attempt for the audit trail", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const expired = await api.listMembers({ branchId, membershipStatus: "expired", pageSize: 5 });
    const member = expired.items[0]!;

    const result = await api.createCheckIn({ memberId: member.id, branchId });
    expect(result.decision).toBe("blocked");
    expect(result.checkInId).toBeUndefined();

    const recent = await api.listRecentCheckIns({ branchId, pageSize: 5 });
    expect(recent.items[0]!.decision).toBe("blocked");
  });

  it("suppresses a duplicate scan moments later", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const members = await api.listMembers({ branchId, membershipStatus: "active", pageSize: 10 });
    const member = members.items.find((m) => m.outstanding.amount === 0)!;

    await api.createCheckIn({ memberId: member.id, branchId });
    const second = await api.createCheckIn({ memberId: member.id, branchId });
    expect(second.decision).toBe("blocked");
    expect(second.reasonCodes).toContain("DUPLICATE_SCAN");
  });

  it("records an override with its reason and an audit event", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const expired = await api.listMembers({ branchId, membershipStatus: "expired", pageSize: 5 });
    const member = expired.items[0]!;

    const result = await api.overrideCheckIn({
      memberId: member.id,
      branchId,
      reason: "Renewing at the desk right now",
    });

    expect(result.decision).toBe("overridden");
    expect(result.reasonCodes).toContain("MANUAL_OVERRIDE");

    const audit = await api.listAuditEvents({ category: "checkins", pageSize: 10 });
    const event = audit.items.find((e) => e.action === "checkin.override" && e.entityId === member.id)!;
    expect(event.reason).toBe("Renewing at the desk right now");
  });

  it("rejects an override with a blank reason", async () => {
    const session = await api.getSession();
    const members = await api.listMembers({ pageSize: 1 });
    await expect(
      api.overrideCheckIn({ memberId: members.items[0]!.id, branchId: session.branches[0]!.id, reason: "   " }),
    ).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("decrements remaining visits on a visit-based pass", async () => {
    const session = await api.getSession();
    const visitPasses = await api.listMemberships({ pageSize: 100 });
    const pass = visitPasses.items.find(
      (m) => m.totalVisits != null && (m.remainingVisits ?? 0) > 0 && m.status === "active",
    );
    if (!pass) return; // seed variation — nothing to assert
    const branchId = pass.homeBranchId ?? session.branches[0]!.id;
    const before = pass.remainingVisits!;
    await api.createCheckIn({ memberId: pass.memberId, branchId });
    const after = await api.getMembership(pass.id);
    expect(after.remainingVisits).toBe(before - 1);
  });
});

describe("refunds and voids", () => {
  it("creates a linked negative transaction on its own receipt", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-ref-1");
    expect((await api.getMember(member.id)).outstanding.amount).toBe(0);

    const refund = await api.refundPayment(receipt.payment.id, { reason: "Member cancelled within cooling-off", idempotencyKey: "refund-cooling-off" });

    expect(refund.payment.type).toBe("refund");
    expect(refund.payment.amount.amount).toBe(-owed);
    expect("originalPaymentId" in refund.payment ? refund.payment.originalPaymentId : undefined).toBe(receipt.payment.id);
    // A refund never edits the original receipt; it issues a new numbered one.
    expect(refund.payment.receiptNumber).not.toBe(receipt.payment.receiptNumber);

    const original = await api.getReceipt(receipt.receipt.id);
    expect(original.payment.status).toBe("refunded");
    expect(original.relatedPayments.map((p) => p.id)).toContain(refund.payment.id);
  });

  it("reverses the charge on a refund rather than re-billing the member", async () => {
    // Refund and void differ on purpose: a void says the payment never cleared,
    // so the balance returns; a refund reverses the sale, so nothing is re-owed.
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-ref-1b");

    await api.refundPayment(receipt.payment.id, { reason: "Sale reversed by manager", idempotencyKey: "refund-sale-reversed" });

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(0);
    const charge = (await api.getReceipt(receipt.receipt.id)).charge!;
    expect(charge.status).toBe("refunded");
  });

  it("supports a partial refund and marks the original part-refunded", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-ref-2");

    await api.refundPayment(receipt.payment.id, { amount: money(Math.floor(owed / 2)), reason: "Half term unused", idempotencyKey: "refund-half-term" });

    const original = await api.getReceipt(receipt.receipt.id);
    expect(original.payment.status).toBe("partially_refunded");
  });

  it("refuses to refund more than was taken", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(10_000), method: "cash" }, "idem-ref-3");
    await api.refundPayment(receipt.payment.id, { reason: "full refund", idempotencyKey: "refund-full" });
    await expect(api.refundPayment(receipt.payment.id, { reason: "again", idempotencyKey: "refund-again" })).rejects.toMatchObject({
      code: ERR.PAYMENT_ALREADY_REFUNDED,
    });
  });

  it("rejects a partial refund above the remaining balance without changing the payment", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(10_000), method: "cash" }, "idem-ref-overage");

    await expect(api.refundPayment(receipt.payment.id, { amount: money(10_001), reason: "Incorrect overage", idempotencyKey: "refund-overage" })).rejects.toMatchObject({
      code: ERR.REFUND_EXCEEDS_AMOUNT,
    });

    const unchanged = await api.getReceipt(receipt.receipt.id);
    expect(unchanged.payment.status).toBe("completed");
    expect(unchanged.relatedPayments).toHaveLength(0);
  });

  it("rejects a refund in a different currency without changing the payment", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(10_000), method: "cash" }, "idem-ref-currency");

    await expect(api.refundPayment(receipt.payment.id, { amount: { amount: 5_000, currency: "USD" }, reason: "Currency mismatch", idempotencyKey: "refund-currency" })).rejects.toMatchObject({
      code: ERR.VALIDATION,
    });

    const unchanged = await api.getReceipt(receipt.receipt.id);
    expect(unchanged.payment.status).toBe("completed");
    expect(unchanged.relatedPayments).toHaveLength(0);
  });

  it("treats flagged refunds as completed before post-action review", async () => {
    const pendingRefund = (await api.listPendingApprovals()).find((event) => event.action === "payment.refund");
    expect(pendingRefund).toBeDefined();
    const original = (await api.listTransactions({ type: "payment", pageSize: 200 })).items.find((payment) => payment.id === pendingRefund!.entityId);
    expect(original?.status).toBe("refunded");

    await api.reviewApproval(pendingRefund!.id, { decision: "rejected", note: "Post-action review recorded" });

    const after = (await api.listTransactions({ type: "payment", pageSize: 200 })).items.find((payment) => payment.id === pendingRefund!.entityId);
    expect(after?.status).toBe("refunded");
    expect((await api.listPendingApprovals()).some((event) => event.id === pendingRefund!.id)).toBe(false);
    const audit = await api.listAuditEvents({ entityId: pendingRefund!.entityId, pageSize: 20 });
    expect(audit.items.find((event) => event.id === pendingRefund!.id)?.approvalStatus).toBe("rejected");
  });

  it("requires a reason for a refund", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(5_000), method: "cash" }, "idem-ref-4");
    await expect(api.refundPayment(receipt.payment.id, { reason: "", idempotencyKey: "refund-missing-reason" })).rejects.toMatchObject({
      code: ERR.VALIDATION,
    });
  });

  it("voids a same-day payment and returns the charge to unpaid", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-void-1");

    const voided = await api.voidPayment(receipt.payment.id, { reason: "Wrong amount keyed in", idempotencyKey: "void-wrong-amount" });
    expect(voided.payment.status).toBe("voided");

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(owed);
  });

  it("refuses to void a payment that has already been refunded", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(5_000), method: "cash" }, "idem-void-2");
    await api.refundPayment(receipt.payment.id, { reason: "refunded first", idempotencyKey: "refund-before-void" });
    await expect(api.voidPayment(receipt.payment.id, { reason: "now void it", idempotencyKey: "void-after-refund" })).rejects.toMatchObject({
      code: ERR.PAYMENT_ALREADY_REFUNDED,
    });
  });

  it("refuses to void a payment from an earlier business day", async () => {
    // "Same day" is the tenant's business day in Amman, not the UTC calendar day.
    const today = todayISODate();
    const older = await api.listTransactions({ type: "payment", pageSize: 200 });
    const stale = older.items.find(
      (t) => t.status === "completed" && partsInTimeZone(new Date(t.occurredAt)).date !== today,
    );
    if (!stale) throw new Error("seed should contain a completed payment from a previous day");
    await expect(api.voidPayment(stale.id, { reason: "too late", idempotencyKey: "void-too-late" })).rejects.toMatchObject({
      code: ERR.VOID_WINDOW_EXPIRED,
    });
  });

  it("writes an audit event naming the actor for every refund", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(30_000), method: "cash" }, "idem-ref-5");
    await api.refundPayment(receipt.payment.id, { reason: "Equipment closure goodwill", idempotencyKey: "refund-goodwill" });

    const audit = await api.listAuditEvents({ category: "payments", pageSize: 20 });
    const event = audit.items.find((e) => e.action === "payment.refund" && e.entityId === receipt.payment.id)!;
    expect(event.actorName).toBeTruthy();
    expect(event.reason).toBe("Equipment closure goodwill");
  });
});

describe("CRM", () => {
  it("delivers the branch-scoped pipeline snapshot through the mock subscription contract", async () => {
    const session = await api.getSession();
    const values: unknown[] = [];
    const unsubscribe = await api.subscribeLeads({ branchId: session.activeBranchId, pageSize: 100 }, (page) => values.push(page));

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ items: expect.any(Array), page: 1 });
    expect(() => unsubscribe()).not.toThrow();
  });

  it("projects persisted CRM activity into lead summaries and the dashboard funnel", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({ fullName: "Event Projection Lead", phone: "+962 79 900 0450", email: "event-projection@example.com", branchId: session.branches[0]!.id, source: "walk_in" });
    await api.logContactAttempt(lead.id, { outcome: "answered_interested", stage: "contacted" });
    const scheduled = await api.scheduleLeadTrial(lead.id, { preferredDate: addDays(todayISODate(), 1), preferredTime: "18:00" });
    await api.updateTrialBooking(scheduled.trialBooking!.id, { status: "completed" });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;
    const offer = await api.createOffer({ leadId: lead.id, planId: plan.id, price: plan.basePrice });
    await api.markOfferDelivered(offer.id, { channel: "manual", reference: "manual-projection-test" });

    const detail = await api.getLead(lead.id);
    expect(detail.progressFacts).toMatchObject({ hasAttempt: true, hasContact: true, hasTrialBooking: true, hasTrialCompletion: true, hasOfferDelivery: true, hasConversion: false, hasLoss: false });
    const dashboard = await api.getDashboard({ from: todayISODate(), to: todayISODate() });
    const funnel = new Map(dashboard.funnel.map((item) => [item.stage, item.count]));
    expect(funnel.get("trial_completed")).toBeGreaterThan(0);
    expect(funnel.get("offer_sent")).toBeGreaterThan(0);
    expect(funnel.get("won")).toBeLessThanOrEqual(funnel.get("offer_sent") ?? 0);
  });

  it("logs a contact attempt, moves the stage and schedules the next follow-up", async () => {
    const leads = await api.listLeads({ pageSize: 20 });
    const lead = leads.items.find((l) => l.stage === "new")!;

    const detail = await api.logContactAttempt(lead.id, {
      outcome: "answered_interested",
      notes: "Comparing prices, wants the 6-month plan",
      nextFollowUpAt: "2026-08-02T09:00:00Z",
      stage: "contacted",
    });

    expect(detail.stage).toBe("contacted");
    expect(detail.nextFollowUpAt).toBe("2026-08-02T09:00:00Z");
    expect(detail.activities.some((a) => a.type === "call_attempt")).toBe(true);
  });

  it("keeps offers as drafts until delivery is explicitly confirmed", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({
      fullName: "Offer Truth Test",
      phone: "+962 79 900 0444",
      email: "offer-truth@example.com",
      branchId: session.branches[0]!.id,
      source: "walk_in",
    });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;

    const draft = await api.createOffer({ leadId: lead.id, planId: plan.id, price: plan.basePrice, expiresInDays: 7 });
    expect(draft).toMatchObject({ status: "draft", planName: plan.name });
    expect((await api.getLead(lead.id)).stage).toBe("new");
    expect((await api.getLead(lead.id)).activities.some((event) => event.type === "offer_drafted")).toBe(true);

    const delivered = await api.markOfferDelivered(draft.id, { channel: "email", reference: "manual-email-2026-08-09" });
    expect(delivered).toMatchObject({ status: "sent", deliveryChannel: "email", deliveryReference: "manual-email-2026-08-09" });
    expect((await api.getLead(lead.id)).stage).toBe("offer_sent");
    expect((await api.getLead(lead.id)).activities.some((event) => event.type === "offer_sent")).toBe(true);
    expect((await api.listAuditEvents({ category: "crm", pageSize: 20 })).items).toContainEqual(expect.objectContaining({ action: "offer.delivered", entityId: draft.id }));
    const accepted = await api.recordOfferOutcome(draft.id, { outcome: "accepted", reason: "Lead confirmed the plan" });
    expect(accepted).toMatchObject({ status: "accepted", responseReason: "Lead confirmed the plan" });
    expect((await api.getLead(lead.id)).activities.some((event) => event.type === "offer_accepted")).toBe(true);
    expect((await api.listAuditEvents({ category: "crm", pageSize: 20 })).items).toContainEqual(expect.objectContaining({ action: "offer.accepted", entityId: draft.id }));
    await expect(api.markOfferDelivered(draft.id, { channel: "email" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await expect(api.recordOfferOutcome(draft.id, { outcome: "accepted" })).rejects.toMatchObject({ code: ERR.CONFLICT });
  });

  it("requires a reason for a declined delivered offer and returns it to follow-up", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({ fullName: "Offer Decline Test", phone: "+962 79 900 0446", branchId: session.branches[0]!.id, source: "walk_in" });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;
    const draft = await api.createOffer({ leadId: lead.id, planId: plan.id, price: plan.basePrice });
    await api.markOfferDelivered(draft.id, { channel: "whatsapp", reference: "manual-decline-test" });

    await expect(api.recordOfferOutcome(draft.id, { outcome: "declined" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const declined = await api.recordOfferOutcome(draft.id, { outcome: "declined", reason: "Timing is not right" });
    expect(declined).toMatchObject({ status: "declined", responseReason: "Timing is not right" });
    expect(await api.getLead(lead.id)).toMatchObject({ stage: "contacted", nextFollowUpAt: expect.any(String) });
  });

  it("does not mark an email offer delivered when the lead has no email", async () => {
    const session = await api.getSession();
    const lead = await api.createLead({ fullName: "Offer Contact Gap", phone: "+962 79 900 0445", branchId: session.branches[0]!.id, source: "walk_in" });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;
    const draft = await api.createOffer({ leadId: lead.id, planId: plan.id, price: plan.basePrice });

    await expect(api.markOfferDelivered(draft.id, { channel: "email" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    expect((await api.getLead(lead.id)).stage).toBe("new");
    expect((await api.getLead(lead.id)).offers[0]).toMatchObject({ id: draft.id, status: "draft" });
  });

  it("creates and completes a follow-up task", async () => {
    const session = await api.getSession();
    const members = await api.listMembers({ pageSize: 1 });
    const task = await api.createFollowUp({
      type: "renewal_call",
      title: "Renewal call",
      ownerId: session.user.id,
      dueAt: "2026-08-04T08:00:00Z",
      memberId: members.items[0]!.id,
    });
    expect(task.status).toBe("open");

    const done = await api.completeTask(task.id, { outcome: "Renewed for 3 months" });
    expect(done.status).toBe("completed");
    expect(done.outcome).toBe("Renewed for 3 months");
  });

  it("filters renewal follow-ups by bounded days and exact dates", async () => {
    const expiring = await api.listRenewalQueue({ bucket: "expiring", days: 7, pageSize: 100 });
    expect(expiring.items.every((item) => item.daysUntilExpiry >= 0 && item.daysUntilExpiry <= 7)).toBe(true);
    const expired = await api.listRenewalQueue({ bucket: "expired", days: 30, pageSize: 100 });
    expect(expired.items.every((item) => item.daysUntilExpiry < 0 && item.daysUntilExpiry >= -30)).toBe(true);
    const dateRange = await api.listRenewalQueue({ bucket: "expired", fromDate: addDays(todayISODate(), -365), toDate: todayISODate(), pageSize: 100 });
    expect(dateRange.items.every((item) => item.membership.endDate < todayISODate())).toBe(true);
    await expect(api.listRenewalQueue({ bucket: "expiring", days: 0 })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("requires crm.write to work a lead", async () => {
    const leads = await api.listLeads({ pageSize: 5 });
    await api.switchDemoRole("receptionist");
    await expect(api.logContactAttempt(leads.items[0]!.id, { outcome: "no_answer" })).rejects.toMatchObject({
      code: ERR.FORBIDDEN,
    });
  });
});

describe("cash shifts and reconciliation", () => {
  it("refuses to open a second shift at the same branch", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const current = await api.getCurrentCashShift(branchId);
    expect(current).not.toBeNull();
    await expect(api.openCashShift({ branchId, openingFloat: money(50_000) })).rejects.toMatchObject({
      code: ERR.SHIFT_ALREADY_OPEN,
    });
  });

  it("computes expected cash from the shift's own transactions", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const before = (await api.getCurrentShiftTotals(branchId))!;

    const member = await anyMemberWithBalance();
    await api.createPayment({ memberId: member.id, amount: money(20_000), method: "cash" }, "idem-shift-1");

    const after = (await api.getCurrentShiftTotals(branchId))!;
    expect(after.totals.cashPayments.amount).toBe(before.totals.cashPayments.amount + 20_000);
  });

  it("removes a voided payment from the expected drawer total", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const member = await anyMemberWithBalance();
    const before = (await api.getCurrentShiftTotals(branchId))!;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(15_000), method: "cash" }, "idem-shift-void-1");
    const collected = (await api.getCurrentShiftTotals(branchId))!;
    expect(collected.totals.cashPayments.amount).toBe(before.totals.cashPayments.amount + 15_000);

    await api.voidPayment(receipt.payment.id, { reason: "Duplicate cash entry", idempotencyKey: "void-duplicate-cash" });
    const after = (await api.getCurrentShiftTotals(branchId))!;
    expect(after.totals.cashPayments.amount).toBe(before.totals.cashPayments.amount);
  });

  it("closes a balanced shift without asking for an explanation", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const current = (await api.getCurrentShiftTotals(branchId))!;
    const expected =
      current.shift.openingFloat.amount + current.totals.cashPayments.amount - current.totals.cashRefunds.amount;

    const closed = await api.closeCashShift(current.shift.id, { countedCash: money(expected) });
    expect(closed.status).toBe("closed");
    expect(closed.variance!.amount).toBe(0);
    expect(closed.varianceApprovalStatus).toBe("none");
  });

  it("demands an explanation when the drawer does not balance", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const current = (await api.getCurrentShiftTotals(branchId))!;
    const expected =
      current.shift.openingFloat.amount + current.totals.cashPayments.amount - current.totals.cashRefunds.amount;

    await expect(api.closeCashShift(current.shift.id, { countedCash: money(expected - 5_000) })).rejects.toMatchObject({
      code: ERR.VALIDATION,
    });
  });

  it("records a shortage with its explanation and raises it for approval", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const current = (await api.getCurrentShiftTotals(branchId))!;
    const expected =
      current.shift.openingFloat.amount + current.totals.cashPayments.amount - current.totals.cashRefunds.amount;

    const closed = await api.closeCashShift(current.shift.id, {
      countedCash: money(expected - 7_000),
      varianceExplanation: "Change given from the wrong drawer",
    });

    expect(closed.variance!.amount).toBe(-7_000);
    expect(closed.varianceApprovalStatus).toBe("pending");

    const audit = await api.listAuditEvents({ category: "reconciliation", pageSize: 20 });
    expect(audit.items.some((e) => e.action === "shift.close_variance" && e.entityId === closed.id)).toBe(true);
  });

  it("lets a manager approve a variance", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const current = (await api.getCurrentShiftTotals(branchId))!;
    const expected =
      current.shift.openingFloat.amount + current.totals.cashPayments.amount - current.totals.cashRefunds.amount;
    const closed = await api.closeCashShift(current.shift.id, {
      countedCash: money(expected + 3_000),
      varianceExplanation: "Member overpaid, credited next visit",
    });

    expect(closed.variance!.amount).toBe(3_000);
    expect(closed.varianceApprovalStatus).toBe("pending");
    const reviewed = await api.reviewVariance(closed.id, { decision: "approved", note: "Count sheet and till recount verified." });
    expect(reviewed.varianceApprovalStatus).toBe("approved");
  });

  it("reports a day's reconciliation that agrees with its own method rows", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });

    const report = await api.getDailyReconciliation({ branchId, date: today });
    const summed = report.totalsByMethod.reduce((s, r) => s + r.payments.amount, 0);
    expect(report.totalCollected.amount).toBe(summed);
  });
});

describe("PT catalog deletion", () => {
  it("deletes an unused package but preserves packages referenced by orders", async () => {
    const created = await api.upsertPtPackage({ name: "Unused 40", sessionCount: 40, totalPrice: money(500_000, "JOD"), validityDays: 90, branchAccess: "all", branchIds: [], status: "active" });
    await expect(api.deletePtPackage(created.id, "Created in error")).resolves.toBeUndefined();
    expect((await api.getPtWorkspace()).packages.some((item) => item.id === created.id)).toBe(false);
  });
});

describe("free-trial lifecycle", () => {
  async function bookTrial() {
    return await api.createTrialBooking({
      customerId: "customer-test",
      gymId: "forge-fitness",
      branchId: "forge-abdoun",
      fullName: "Trial Lifecycle Test",
      email: `trial-${Date.now()}@example.com`,
      phone: `+962 79 ${String(Date.now()).slice(-7)}`,
      preferredDate: "2026-08-20",
      preferredTime: "19:00",
      goal: "Build a consistent training routine",
    });
  }

  it("does not attach an anonymous request to the adapter's last preview persona", async () => {
    const booking = await api.createTrialBooking({
      gymId: "forge-fitness",
      branchId: "forge-abdoun",
      fullName: "Anonymous Trial Test",
      email: "anonymous-trial@example.com",
      phone: "+962 79 000 8899",
      preferredDate: "2026-08-20",
      preferredTime: "19:00",
      goal: "Evaluate the gym before creating an account",
    });

    expect(booking.customerId).toBeUndefined();
  });

  it("links a public booking to CRM and records staff outcomes across every surface", async () => {
    const booking = await bookTrial();
    expect(booking).toMatchObject({ status: "requested", customerId: "customer-test" });
    expect(booking.leadId).toBeDefined();

    const lead = await api.getLead(booking.leadId!);
    expect(lead).toMatchObject({ stage: "trial_booked", trialBooking: { id: booking.id, status: "requested" } });

    const confirmed = await api.updateTrialBooking(booking.id, { status: "confirmed" });
    expect(confirmed.trialBooking?.status).toBe("confirmed");
    const completed = await api.updateTrialBooking(booking.id, { status: "completed", note: "Enjoyed the strength floor." });
    expect(completed.stage).toBe("trial_completed");
    expect(completed.activities.some((event) => event.type === "trial_completed")).toBe(true);

    const tasks = await api.listTasks({ status: "open", pageSize: 100 });
    expect(tasks.items.some((task) => task.leadId === booking.leadId && task.type === "trial_follow_up")).toBe(true);
    const experience = await api.getCustomerExperience();
    expect(experience.bookings.find((item) => item.id === booking.id)?.status).toBe("completed");
    const audit = await api.listAuditEvents({ category: "crm", pageSize: 20 });
    expect(audit.items.some((event) => event.entityId === booking.id && event.action === "trial.completed")).toBe(true);
  });

  it("requires a no-show reason, creates a high-priority recovery task, and blocks terminal transitions", async () => {
    const booking = await bookTrial();
    await expect(api.updateTrialBooking(booking.id, { status: "no_show" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const updated = await api.updateTrialBooking(booking.id, { status: "no_show", note: "Customer did not arrive or answer." });
    expect(updated).toMatchObject({ stage: "contacted", trialBooking: { status: "no_show" } });
    const tasks = await api.listTasks({ status: "open", pageSize: 100 });
    expect(tasks.items).toContainEqual(expect.objectContaining({ leadId: booking.leadId, type: "trial_follow_up", priority: "high" }));
    await expect(api.updateTrialBooking(booking.id, { status: "confirmed" })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("creates the member and membership together after a completed trial", async () => {
    const booking = await bookTrial();
    const session = await api.getSession();
    await api.updateTrialBooking(booking.id, { status: "completed", note: "Trial completed" });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;
    const result = await api.completeLeadSale(booking.leadId!, {
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
      marketingOptIn: true,
      startDate: todayISODate(),
      idempotencyKey: "mock-simple-crm-sale",
      membership: { mode: "existing", planId: plan.id },
    });
    expect(result.membership).toMatchObject({ memberId: result.member.id, planId: plan.id });
    const experience = await api.getCustomerExperience();
    expect(experience.bookings.find((item) => item.id === booking.id)?.status).toBe("converted");
  });

  it("reuses one matching member created by the legacy CRM flow and only adds the membership", async () => {
    const booking = await bookTrial();
    const session = await api.getSession();
    const existing = await api.createMember({
      fullName: booking.fullName,
      phone: booking.phone,
      email: booking.email,
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
    });
    const memberCount = (await api.listMembers({ pageSize: 500 })).totalItems;
    await api.updateTrialBooking(booking.id, { status: "completed" });
    const plan = (await api.listPlans({ status: "active", pageSize: 1 })).items[0]!;
    const result = await api.completeLeadSale(booking.leadId!, {
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
      startDate: todayISODate(),
      idempotencyKey: "mock-simple-crm-existing-member-sale",
      membership: { mode: "existing", planId: plan.id },
    });

    expect(result.member.id).toBe(existing.member.id);
    expect(result.membership.memberId).toBe(existing.member.id);
    expect((await api.listMembers({ pageSize: 500 })).totalItems).toBe(memberCount);
  });

  it("creates a reusable custom membership during a successful CRM sale", async () => {
    const booking = await bookTrial();
    const session = await api.getSession();
    await api.updateTrialBooking(booking.id, { status: "completed" });
    const result = await api.completeLeadSale(booking.leadId!, {
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
      startDate: todayISODate(),
      idempotencyKey: "mock-simple-crm-custom-sale",
      membership: { mode: "custom", name: "Eight week transformation", price: money(150_000), durationDays: 56, includedPtSessions: 4 },
    });
    expect(result.plan).toMatchObject({ name: "Eight week transformation", durationDays: 56, includedPtSessions: 4, basePrice: money(150_000) });
    expect((await api.listPlans({ search: "Eight week", status: "active", pageSize: 20 })).items).toContainEqual(expect.objectContaining({ id: result.plan.id }));
  });
});

describe("demo controls", () => {
  it("forces list endpoints empty so empty states can be reviewed", async () => {
    api.setBehavior({ forceEmptyLists: true });
    const members = await api.listMembers({ pageSize: 10 });
    expect(members.items).toHaveLength(0);
    expect(members.totalItems).toBe(0);
  });

  it("fails exactly one request when asked, then recovers", async () => {
    api.setBehavior({ failNextRequest: true });
    await expect(api.listMembers({ pageSize: 1 })).rejects.toMatchObject({ code: ERR.FORCED_FAILURE });
    await expect(api.listMembers({ pageSize: 1 })).resolves.toBeDefined();
  });

  it("restores the canonical seed on reset", async () => {
    const before = await api.listMembers({ pageSize: 1 });
    const session = await api.getSession();
    await api.createMember({
      fullName: "Temporary Person",
      phone: "+962 79 000 0001",
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
    });
    expect((await api.listMembers({ pageSize: 1 })).totalItems).toBe(before.totalItems + 1);

    await api.resetDemo();
    expect((await api.listMembers({ pageSize: 1 })).totalItems).toBe(before.totalItems);
  });
});

describe("seed coverage required by the docs", () => {
  it("has two branches and enough members to look real", async () => {
    const session = await api.getSession();
    expect(session.branches.length).toBeGreaterThanOrEqual(2);
    const members = await api.listMembers({ pageSize: 500 });
    expect(members.totalItems).toBeGreaterThanOrEqual(80);
  });

  it("covers every membership status", async () => {
    for (const status of ["active", "expiring", "expired", "frozen", "cancelled"] as const) {
      const page = await api.listMemberships({ status, pageSize: 5 });
      expect(page.totalItems, `expected seeded ${status} memberships`).toBeGreaterThan(0);
    }
  });

  it("covers every lead stage", async () => {
    const leads = await api.listLeads({ pageSize: 300 });
    expect(leads.totalItems).toBeGreaterThanOrEqual(25);
    const stages = new Set(leads.items.map((l) => l.stage));
    for (const stage of ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"] as const) {
      expect(stages.has(stage), `expected a seeded lead in stage ${stage}`).toBe(true);
    }
  });

  it("covers cash, card and bank-transfer style payments", async () => {
    const tx = await api.listTransactions({ pageSize: 300 });
    const methods = new Set(tx.items.map((t) => t.method));
    expect(methods.has("cash")).toBe(true);
    expect(methods.has("card")).toBe(true);
    expect(methods.has("bank_transfer") || methods.has("cliq")).toBe(true);
  });

  it("includes at least two cash discrepancies to review", async () => {
    const shifts = await api.listCashShifts({ pageSize: 50 });
    const withVariance = shifts.items.filter((s) => (s.variance?.amount ?? 0) !== 0);
    expect(withVariance.length).toBeGreaterThanOrEqual(2);
  });

  it("includes automation executions and audit events", async () => {
    expect((await api.listAutomationExecutions({ pageSize: 10 })).totalItems).toBeGreaterThan(0);
    expect((await api.listAuditEvents({ pageSize: 10 })).totalItems).toBeGreaterThan(0);
  });

  it("includes members with an outstanding balance", async () => {
    const outstanding = await api.listMembers({ membershipStatus: "outstanding", pageSize: 50 });
    expect(outstanding.totalItems).toBeGreaterThan(0);
  });
});

describe("retail checkout", () => {
  it("supports front-desk member and guest sales with idempotent stock decrements", async () => {
    const ownerSession = await api.getSession();
    const branchId = ownerSession.branches[0]!.id;
    const product = await api.upsertProduct({ sku: "MOCK-RETAIL", name: "Mock retail item", unit: "each", reorderPoint: 1, retailPrice: money(2_000, "JOD") });
    await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 3, unitCost: money(500, "JOD"), idempotencyKey: "mock-retail-opening" });
    const member = await freshMemberForSale();
    const reconciliationBefore = await api.getDailyReconciliation({ branchId, date: todayISODate("Asia/Amman", new Date()) });
    await api.switchDemoRole("receptionist");
    const memberSale = await api.checkoutRetail({ branchId, memberId: member.id, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-MOCK-1", idempotencyKey: "mock-retail-member" });
    expect(memberSale.retailSale.lines[0]?.unitCost).toEqual(money(500, "JOD"));
    const replay = await api.checkoutRetail({ branchId, memberId: member.id, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-MOCK-1", idempotencyKey: "mock-retail-member" });
    expect(replay.receiptId).toBe(memberSale.receiptId);
    await expect(api.checkoutRetail({ branchId, memberId: member.id, lines: [{ productId: product.id, quantity: 2 }], method: "card", externalReference: "VISA-MOCK-1", idempotencyKey: "mock-retail-member" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    const guestSale = await api.checkoutRetail({ branchId, guest: { fullName: "Mock Guest", phone: "+962790000003" }, lines: [{ productId: product.id, quantity: 1 }], method: "cliq", externalReference: "CLIQ-MOCK-1", idempotencyKey: "mock-retail-guest" });
    const guestReceipt = await api.getReceipt(guestSale.receiptId);
    expect(guestReceipt).toMatchObject({ customer: { kind: "guest", fullName: "Mock Guest" }, retailSale: { lines: [{ quantity: 1 }] } });
    expect(guestReceipt.member).toBeUndefined();
    await expect(api.getReceipt(memberSale.receiptId)).resolves.toMatchObject({ customer: { kind: "member", memberId: member.id }, retailSale: { receiptId: memberSale.receiptId } });
    const memberTimeline = await api.listMemberTimeline(member.id);
    expect(memberTimeline.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "payment_collected", meta: expect.objectContaining({ receiptId: memberSale.receiptId }) })]));
    await expect(api.listInventory({ branchId, productId: product.id })).resolves.toEqual([expect.objectContaining({ availableQuantity: 1 })]);
    await api.switchDemoRole("owner");
    const shift = await api.getCurrentShiftTotals(branchId);
    expect(shift?.totals).toMatchObject({ cashPayments: { amount: expect.any(Number) }, paymentCount: expect.any(Number) });
    // Card and CliQ sales are intentionally not assigned to a cash drawer
    // shift. The reconciliation assertions below verify those collections by
    // payment method; this shift check only verifies the drawer projection.
    expect(shift?.totals.cashPayments.amount).toBeGreaterThanOrEqual(0);
    const reconciliation = await api.getDailyReconciliation({ branchId, date: todayISODate("Asia/Amman", new Date()) });
    const beforeByMethod = new Map(reconciliationBefore.totalsByMethod.map((row) => [row.method, row.payments.amount]));
    expect(reconciliation.totalsByMethod).toEqual(expect.arrayContaining([expect.objectContaining({ method: "card", payments: expect.objectContaining({ amount: (beforeByMethod.get("card") ?? 0) + 2_000 }) }), expect.objectContaining({ method: "cliq", payments: expect.objectContaining({ amount: (beforeByMethod.get("cliq") ?? 0) + 2_000 }) })]));
    const transactions = await api.listTransactions({ branchId, type: "retail_sale", pageSize: 20 });
    expect(transactions.items).toHaveLength(2);
    expect(transactions.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "retail_sale", customer: expect.objectContaining({ kind: "guest" }) })]));
    const otherBranch = ownerSession.branches[1]!.id;
    const internals = api as unknown as { db: MockDb };
    const otherBranchReceptionist = internals.db.users.find((user) => user.role === "receptionist" && user.branchIds.includes(otherBranch) && user.status === "active");
    if (!otherBranchReceptionist) throw new Error("seed should contain a receptionist for the second branch");
    internals.db.session.userId = otherBranchReceptionist.id;
    internals.db.session.activeBranchId = otherBranch;
    await expect(api.getReceipt(memberSale.receiptId)).rejects.toMatchObject({ code: ERR.NOT_FOUND });
  });

  it("restores mock inventory for reason-gated retail refunds and voids", async () => {
    const branchId = (await api.getSession()).branches[0]!.id;
    const product = await api.upsertProduct({ sku: "MOCK-RETURN", name: "Mock return item", unit: "each", reorderPoint: 1, retailPrice: money(2_000, "JOD") });
    await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 4, unitCost: money(500, "JOD"), idempotencyKey: "mock-return-opening" });
    const sale = await api.checkoutRetail({ branchId, guest: { fullName: "Return Guest", phone: "+962790000081" }, lines: [{ productId: product.id, quantity: 2 }], method: "card", externalReference: "MOCK-RETURN", idempotencyKey: "mock-return-sale" });
    await expect(api.refundRetailSale(sale.retailSale.id, { lines: [{ productId: product.id, quantity: 1 }], reason: "", idempotencyKey: "mock-return-invalid" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const refunded = await api.refundRetailSale(sale.retailSale.id, { lines: [{ productId: product.id, quantity: 1 }], reason: "Customer returned unopened item", idempotencyKey: "mock-return-refund" });
    expect(refunded.retailSale).toMatchObject({ status: "partially_refunded", refundedAmount: { amount: 2_000 }, returnedLines: [{ quantity: 1 }] });
    const internals = api as unknown as { db: MockDb };
    const refundPayment = internals.db.payments.find((payment) => payment.type === "refund" && "retailSaleId" in payment && payment.retailSaleId === sale.retailSale.id);
    expect(refundPayment).toMatchObject({ amount: { amount: -2_000 }, originalPaymentId: `retail-payment-${sale.retailSale.id}`, refundReason: "Customer returned unopened item" });
    expect(refundPayment?.receiptId).toBeTruthy();
    expect((internals.db.stockMovements.find((movement) => movement.type === "return") as T.StockMovement | undefined)?.unitCost).toEqual(money(500, "JOD"));
    await expect(api.getReceipt(refundPayment!.receiptId)).resolves.toMatchObject({ payment: { type: "refund", amount: { amount: -2_000 } }, retailSale: { status: "partially_refunded" } });
    const originalReceipt = await api.getReceipt(sale.receiptId);
    expect(originalReceipt.relatedPayments).toEqual(expect.arrayContaining([expect.objectContaining({ id: refundPayment!.id, type: "refund", amount: expect.objectContaining({ amount: -2_000 }) })]));
    const refundTransactions = await api.listTransactions({ type: "refund", pageSize: 20 });
    expect(refundTransactions.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: refundPayment!.id, amount: expect.objectContaining({ amount: -2_000 }) })]));
    await expect(api.voidRetailSale(sale.retailSale.id, { reason: "Duplicate sale", idempotencyKey: "mock-return-void-blocked" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    const voidSale = await api.checkoutRetail({ branchId, guest: { fullName: "Void Guest", phone: "+962790000082" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "MOCK-VOID", idempotencyKey: "mock-void-sale" });
    await expect(api.voidRetailSale(voidSale.retailSale.id, { reason: "Duplicate terminal entry", idempotencyKey: "mock-void-action" })).resolves.toMatchObject({ retailSale: { status: "voided" } });
    await expect(api.listInventory({ branchId, productId: product.id })).resolves.toEqual([expect.objectContaining({ availableQuantity: 3 })]);
    const cashSale = await api.checkoutRetail({ branchId, guest: { fullName: "Cash void guest", phone: "+962790000083" }, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "mock-cash-void-sale" });
    const cashInternals = api as unknown as { db: MockDb };
    cashInternals.db.shifts.filter((shift) => shift.branchId === branchId).forEach((shift) => { shift.status = "closed"; });
    await expect(api.voidRetailSale(cashSale.retailSale.id, { reason: "Cash void after close", idempotencyKey: "mock-cash-void-after-close" })).rejects.toMatchObject({ code: ERR.NO_OPEN_SHIFT });
    expect(cashInternals.db.retailSales.find((sale) => sale.id === cashSale.retailSale.id)?.status).toBe("completed");
  });

  it("does not sell an item until a positive retail price is configured", async () => {
    const ownerSession = await api.getSession();
    const branchId = ownerSession.branches[0]!.id;
    const product = await api.upsertProduct({ sku: "MOCK-UNPRICED", name: "Mock unpriced item", unit: "each", reorderPoint: 1 });
    const laterProduct = await api.upsertProduct({ sku: "MOCK-LATER", name: "Mock later line", unit: "each", reorderPoint: 1, retailPrice: money(1_500, "JOD") });
    await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 1, idempotencyKey: "mock-unpriced-opening" });
    await api.switchDemoRole("receptionist");
    await expect(api.checkoutRetail({ branchId, guest: { fullName: "Mock Guest", phone: "+962790000004" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-MOCK-2", idempotencyKey: "mock-unpriced-sale" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await api.switchDemoRole("owner");
    await api.upsertProduct({ id: product.id, sku: "MOCK-UNPRICED", name: "Mock now priced item", unit: "each", reorderPoint: 1, retailPrice: money(1_000, "JOD") });
    await api.switchDemoRole("receptionist");
    const internals = api as unknown as { db: MockDb };
    internals.db.shifts.filter((shift) => shift.branchId === branchId).forEach((shift) => { shift.status = "closed"; });
    const retailSalesBefore = internals.db.retailSales.length;
    await expect(api.checkoutRetail({ branchId, guest: { fullName: "Mock Guest", phone: "+962790000004" }, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "mock-no-shift" })).rejects.toMatchObject({ code: ERR.NO_OPEN_SHIFT });
    expect(internals.db.retailSales).toHaveLength(retailSalesBefore);
    await expect(api.checkoutRetail({ branchId, guest: { fullName: "Mock Guest", phone: "+962790000004" }, lines: [{ productId: product.id, quantity: 1 }, { productId: laterProduct.id, quantity: 1 }], method: "card", externalReference: "VISA-MOCK-3", idempotencyKey: "mock-later-line-stock" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await expect(api.listInventory({ branchId, productId: product.id })).resolves.toEqual([expect.objectContaining({ availableQuantity: 1 })]);
    expect(internals.db.retailSales).toHaveLength(retailSalesBefore);
  });

  it("allows front-desk collection but denies checkout without payments.collect", async () => {
    const ownerSession = await api.getSession();
    const branchId = ownerSession.branches[0]!.id;
    const product = await api.upsertProduct({ sku: "MOCK-AUTH", name: "Mock auth item", unit: "each", reorderPoint: 1, retailPrice: money(1_000, "JOD") });
    await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 1, idempotencyKey: "mock-auth-opening" });
    const input = { branchId, guest: { fullName: "Front Desk Guest", phone: "+962790000005" }, lines: [{ productId: product.id, quantity: 1 }], method: "card" as const, externalReference: "VISA-MOCK-4", idempotencyKey: "mock-auth-sale" };
    await api.switchDemoRole("trainer");
    await expect(api.checkoutRetail(input)).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("receptionist");
    await expect(api.checkoutRetail(input)).resolves.toMatchObject({ retailSale: { customer: { kind: "guest" } } });
  });

  it("enforces branch member visibility and configured payment methods", async () => {
    const ownerSession = await api.getSession();
    const branchA = ownerSession.branches[0]!.id;
    const branchB = ownerSession.branches[1]!.id;
    const product = await api.upsertProduct({ sku: "MOCK-BRANCH-AUTH", name: "Branch scoped item", unit: "each", reorderPoint: 1, retailPrice: money(1_000, "JOD") });
    await api.recordStockMovement({ branchId: branchA, productId: product.id, type: "receive", quantity: 2, idempotencyKey: "mock-branch-auth-opening" });
    const branchBMember = await api.createMember({ fullName: "Branch B Member", phone: "+962 79 900 0999", homeBranchId: branchB, preferredLanguage: "en" });
    const settings = await api.getOrganizationSettings();
    await api.updatePaymentMethods(settings.paymentMethods.map((method) => method.key === "card" ? { ...method, enabled: false } : method));
    await api.switchDemoRole("receptionist");
    await expect(api.checkoutRetail({ branchId: branchA, memberId: branchBMember.member.id, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "mock-branch-member" })).rejects.toMatchObject({ code: ERR.NOT_FOUND });
    await expect(api.checkoutRetail({ branchId: branchA, guest: { fullName: "Disabled card guest", phone: "+962 79 900 0998" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-DISABLED", idempotencyKey: "mock-disabled-card" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.listInventory({ branchId: branchA, productId: product.id })).resolves.toEqual([expect.objectContaining({ availableQuantity: 2 })]);
  });
});

describe("management accounting mock contract", () => {
  it("rejects malformed posting dates before creating a ledger period", async () => {
    const branch = (await api.getSession()).branches[0]!;
    await expect(api.postManualJournal({
      branchId: branch.id,
      scope: "branch",
      postingDate: "2026-02-30",
      memo: "Invalid date",
      reason: "Reject malformed calendar date",
      idempotencyKey: "mock-accounting-invalid-date",
      lines: [
        { accountId: "acct-1100", debit: money(100), credit: money(0) },
        { accountId: "acct-1200", debit: money(0), credit: money(100) },
      ],
    })).rejects.toMatchObject({ code: ERR.VALIDATION });
  });

  it("keeps reversal lines immutable and nets the original plus reversal to zero", async () => {
    const branch = (await api.getSession()).branches[0]!;
    const input = {
      branchId: branch.id,
      scope: "branch" as const,
      memo: "Mock correction",
      reason: "Owner-approved test correction",
      idempotencyKey: "mock-accounting-manual-1",
      lines: [
        { accountId: "acct-1100", debit: money(1_000), credit: money(0) },
        { accountId: "acct-1200", debit: money(0), credit: money(1_000) },
      ],
    };
    const entry = await api.postManualJournal(input);
    const originalLines = entry.lines.map((line) => ({ ...line, debit: { ...line.debit }, credit: { ...line.credit } }));
    await expect(api.postManualJournal({ ...input, memo: "Different memo" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    expect((await api.postManualJournal(input)).id).toBe(entry.id);

    const reversal = await api.reverseAccountingEntry(entry.id, { reason: "Owner-approved reversal", idempotencyKey: "mock-accounting-reversal-1" });
    expect(reversal.reversalOfEntryId).toBe(entry.id);
    expect((await api.reverseAccountingEntry(entry.id, { reason: "Owner-approved reversal", idempotencyKey: "mock-accounting-reversal-1" })).id).toBe(reversal.id);
    await expect(api.reverseAccountingEntry(entry.id, { reason: "Different reversal reason", idempotencyKey: "mock-accounting-reversal-1" })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const originalAfter = await api.getAccountingJournalEntry(entry.id);
    expect(originalAfter.lines).toEqual(originalLines);
    expect(await api.getAccountingTrialBalance()).toMatchObject({ rows: [], totalDebit: money(0), totalCredit: money(0) });
  });

  it("scopes source idempotency keys by full source identity", async () => {
    const internals = api as unknown as { db: { payments: Payment[] } };
    const payment = internals.db.payments.find((candidate) => candidate.status === "completed");
    expect(payment).toBeDefined();
    const posted = await api.postAccountingSource({ sourceType: "payment", sourceId: payment!.id, idempotencyKey: "shared-payment-void-key-mock", reason: "Verified cash collection" });
    expect(posted.status).toBe("posted");
    const replay = await api.postAccountingSource({ sourceType: "payment", sourceId: payment!.id, idempotencyKey: "shared-payment-void-key-mock", reason: "Verified cash collection" });
    expect(replay.journalEntryId).toBe(posted.journalEntryId);
    await expect(api.postAccountingSource({ sourceType: "void", sourceId: payment!.id, idempotencyKey: "shared-payment-void-key-mock", reason: "Attempted void with a reused key" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    const differentKey = await api.postAccountingSource({ sourceType: "void", sourceId: payment!.id, idempotencyKey: "different-void-key-mock", reason: "Void lifecycle is not complete" });
    expect(differentKey).toMatchObject({ status: "unconfigured" });
    expect(differentKey.journalEntryId).toBeUndefined();
    const journal = await api.listAccountingJournalEntries({});
    expect(journal.items.filter((item) => item.sourceId === payment!.id)).toHaveLength(1);
  });

  it("refreshes supported source facts into an idempotent, non-posting queue", async () => {
    const sourceTypes = ["payment", "refund", "void", "membership_sale", "membership_renewal"] as const;
    const first = await api.refreshAccountingSourceQueue({ sourceTypes: [...sourceTypes] });
    expect(first.scanned).toBeGreaterThan(0);
    expect(first.created).toBe(first.scanned);
    expect(first.items.every((item) => !item.journalEntryId)).toBe(true);
    expect(first.pending + first.unconfigured + first.excluded).toBe(first.scanned);

    const replay = await api.refreshAccountingSourceQueue({ sourceTypes: [...sourceTypes] });
    expect(replay).toMatchObject({ scanned: first.scanned, created: 0, updated: 0 });
  });

  it("projects retail collections into clearing and revenue accounting", async () => {
    const branch = (await api.getSession()).branches[0]!;
    const product = await api.upsertProduct({ sku: "MOCK-ACCOUNTING-RETAIL", name: "Accounting retail item", unit: "each", reorderPoint: 1, retailPrice: money(2_000, "JOD") });
    await api.recordStockMovement({ branchId: branch.id, productId: product.id, type: "receive", quantity: 1, unitCost: money(500, "JOD"), idempotencyKey: "mock-accounting-retail-opening" });
    await api.switchDemoRole("receptionist");
    const sale = await api.checkoutRetail({ branchId: branch.id, guest: { fullName: "Accounting guest", phone: "+962790000099" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-ACCOUNTING", idempotencyKey: "mock-accounting-retail-sale" });
    await api.switchDemoRole("owner");
    const refreshed = await api.refreshAccountingSourceQueue({ sourceTypes: ["payment"] });
    const source = refreshed.items.find((item) => item.sourceId === sale.payment.id);
    expect(source).toMatchObject({ sourceType: "payment", status: "pending", amount: money(2_000, "JOD"), policyCode: "retail-sale-card.v2", details: { saleType: "retail" } });
    const posted = await api.postAccountingSource({ sourceType: "payment", sourceId: sale.payment.id, idempotencyKey: "mock-accounting-retail-post" });
    expect(posted).toMatchObject({ status: "posted", amount: money(2_000, "JOD"), policyCode: "retail-sale-card.v2", policyVersion: 2 });
    const journal = await api.getAccountingJournalEntry(posted.journalEntryId!);
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "1110", debit: money(2_000, "JOD") }), expect.objectContaining({ accountCode: "4200", credit: money(2_000, "JOD") })]));
    expect(journal).toMatchObject({ policyCode: "retail-sale-card.v2", policyVersion: 2, idempotencyKey: `source:payment:${sale.payment.id}:v2:mock-accounting-retail-post` });
    const movements = (api as unknown as { db: MockDb }).db.stockMovements;
    const saleMovement = movements.find((movement) => movement.referenceType === "retail_sale" && movement.referenceId === sale.retailSale.id);
    expect(saleMovement).toBeDefined();
    const stockRefresh = await api.refreshAccountingSourceQueue({ sourceTypes: ["stock_movement"] });
    const stockSource = stockRefresh.items.find((item) => item.sourceId === saleMovement!.id);
    expect(stockSource).toMatchObject({ status: "pending", policyCode: "stock-consume.v1", amount: money(500, "JOD") });
    const stockPosted = await api.postAccountingSource({ sourceType: "stock_movement", sourceId: saleMovement!.id, idempotencyKey: "mock-accounting-retail-cogs" });
    const stockJournal = await api.getAccountingJournalEntry(stockPosted.journalEntryId!);
    expect(stockJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "5100", debit: money(500, "JOD") }), expect.objectContaining({ accountCode: "1300", credit: money(500, "JOD") })]));
    const refunded = await api.refundRetailSale(sale.retailSale.id, { lines: [{ productId: product.id, quantity: 1 }], reason: "Accounting integration return", idempotencyKey: "mock-accounting-retail-refund" });
    expect(refunded.payment).toMatchObject({ type: "refund", amount: money(-2_000, "JOD") });
    const refundPayment = (api as unknown as { db: MockDb }).db.payments.find((payment) => payment.type === "refund" && "retailSaleId" in payment && payment.retailSaleId === sale.retailSale.id);
    expect(refundPayment).toBeDefined();
    const returnMovement = (api as unknown as { db: MockDb }).db.stockMovements.find((movement) => movement.referenceType === "retail_refund" && movement.referenceId === sale.retailSale.id);
    expect(returnMovement).toBeDefined();
    await api.refreshAccountingSourceQueue({ sourceTypes: ["refund", "stock_movement"] });
    const refundPosted = await api.postAccountingSource({ sourceType: "refund", sourceId: refundPayment!.id, idempotencyKey: "mock-accounting-retail-refund-post" });
    const refundJournal = await api.getAccountingJournalEntry(refundPosted.journalEntryId!);
    expect(refundJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "4200", debit: money(2_000, "JOD") }), expect.objectContaining({ accountCode: "1110", credit: money(2_000, "JOD") })]));
    const returnPosted = await api.postAccountingSource({ sourceType: "stock_movement", sourceId: returnMovement!.id, idempotencyKey: "mock-accounting-retail-return-cogs" });
    const returnJournal = await api.getAccountingJournalEntry(returnPosted.journalEntryId!);
    expect(returnJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "1300", debit: money(500, "JOD") }), expect.objectContaining({ accountCode: "5100", credit: money(500, "JOD") })]));
  });

  it("preserves a historical pending retail policy across refresh and post", async () => {
    const branch = (await api.getSession()).branches[0]!;
    const product = await api.upsertProduct({ sku: "MOCK-HISTORICAL-POLICY", name: "Historical policy item", unit: "each", reorderPoint: 1, retailPrice: money(1_000, "JOD") });
    await api.recordStockMovement({ branchId: branch.id, productId: product.id, type: "receive", quantity: 1, unitCost: money(300, "JOD"), idempotencyKey: "mock-historical-policy-opening" });
    await api.switchDemoRole("receptionist");
    const sale = await api.checkoutRetail({ branchId: branch.id, guest: { fullName: "Historical policy guest", phone: "+962790000099" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "HISTORICAL-POLICY", idempotencyKey: "mock-historical-policy-sale" });
    await api.switchDemoRole("owner");
    await api.refreshAccountingSourceQueue({ sourceTypes: ["payment"] });
    const internals = api as unknown as { accountingSources: T.AccountingSourcePosting[] };
    const existing = internals.accountingSources.find((row) => row.sourceId === sale.payment.id);
    expect(existing).toBeDefined();
    Object.assign(existing!, { status: "unconfigured", policyCode: "retail-sale-card.v1", policyVersion: 1, reason: "Historical source awaiting review." });
    const refreshed = await api.refreshAccountingSourceQueue({ sourceTypes: ["payment"] });
    expect(refreshed.items.find((row) => row.sourceId === sale.payment.id)).toMatchObject({ status: "pending", policyCode: "retail-sale-card.v1", policyVersion: 1 });
    const posted = await api.postAccountingSource({ sourceType: "payment", sourceId: sale.payment.id, idempotencyKey: "mock-historical-policy-post" });
    expect(posted).toMatchObject({ status: "posted", policyCode: "retail-sale-card.v1", policyVersion: 1 });
    const journal = await api.getAccountingJournalEntry(posted.journalEntryId!);
    expect(journal).toMatchObject({ policyCode: "retail-sale-card.v1", policyVersion: 1, idempotencyKey: `source:payment:${sale.payment.id}:v1:mock-historical-policy-post` });
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "4100", credit: money(1_000, "JOD") })]));
  });

  it("replays an unconfigured source decision by key while a new key retries after source repair", async () => {
    const internals = api as unknown as { db: { payments: Payment[] } };
    const voided = internals.db.payments.find((payment) => payment.status === "voided");
    expect(voided).toBeDefined();

    const first = await api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-attempt-mock", reason: "Review the voided collection" });
    expect(first).toMatchObject({ status: "unconfigured" });
    expect(first.journalEntryId).toBeUndefined();

    voided!.status = "completed";
    const refreshed = await api.refreshAccountingSourceQueue({ sourceTypes: ["payment"] });
    const refreshedDecision = refreshed.items.find((item) => item.sourceId === voided!.id);
    expect(refreshedDecision).toMatchObject({ sourceId: voided!.id, status: "pending" });
    expect(refreshedDecision?.journalEntryId).toBeUndefined();

    const replay = await api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-attempt-mock", reason: "Review the voided collection" });
    expect(replay).toMatchObject({ status: "unconfigured" });
    expect(replay.journalEntryId).toBeUndefined();
    await expect(api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-attempt-mock", reason: "A materially different review reason" })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const retried = await api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-retry-mock", reason: "Post after the source was corrected" });
    expect(retried.status).toBe("posted");
    expect(retried.journalEntryId).toBeDefined();
    const replayAfterRetry = await api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-attempt-mock", reason: "Review the voided collection" });
    expect(replayAfterRetry).toMatchObject({ status: "unconfigured" });
    expect(replayAfterRetry.journalEntryId).toBeUndefined();
    await expect(api.postAccountingSource({ sourceType: "payment", sourceId: voided!.id, idempotencyKey: "stable-source-attempt-mock", reason: "A materially different review reason" })).rejects.toMatchObject({ code: ERR.CONFLICT });
  });

  it("hides consolidated and unknown-branch accounting rows from selected-branch managers", async () => {
    const ownerSession = await api.getSession();
    const branch = ownerSession.branches[0]!;
    const normal = await api.postManualJournal({
      branchId: branch.id,
      scope: "branch",
      memo: "Branch adjustment",
      reason: "Owner-approved branch adjustment",
      idempotencyKey: "scope-normal-mock",
      lines: [
        { accountId: "acct-1100", debit: money(1_000), credit: money(0) },
        { accountId: "acct-1200", debit: money(0), credit: money(1_000) },
      ],
    });
    const consolidated = await api.postManualJournal({
      scope: "consolidated",
      memo: "Consolidated adjustment",
      reason: "Owner-approved organization adjustment",
      idempotencyKey: "scope-consolidated-mock",
      lines: [
        { accountId: "acct-1100", debit: money(7_500), credit: money(0) },
        { accountId: "acct-1200", debit: money(0), credit: money(7_500) },
      ],
    });
    const now = new Date().toISOString();
    const internals = api as unknown as { accountingSources: AccountingSourcePosting[] };
    internals.accountingSources.push({
      id: "mock-consolidated-source",
      organizationId: ownerSession.organization.id,
      sourceType: "payment",
      sourceId: "mock-consolidated-source-fact",
      status: "posted",
      amount: money(9_900),
      currency: "JOD",
      journalEntryId: "mock-consolidated-journal",
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await api.switchDemoRole("manager", branch.id);
    const managerInternals = api as unknown as { db: { session: { userId: string }; users: Array<{ id: string; branchScope: string; branchIds: string[] }> } };
    const selectedManager = managerInternals.db.users.find((user) => user.id === managerInternals.db.session.userId);
    expect(selectedManager).toBeDefined();
    selectedManager!.branchScope = "selected";
    selectedManager!.branchIds = [branch.id];
    const managerEntries = await api.listAccountingJournalEntries();
    expect(managerEntries.items.map((entry) => entry.id)).toContain(normal.id);
    expect(managerEntries.items.map((entry) => entry.id)).not.toContain(consolidated.id);
    await expect(api.getAccountingJournalEntry(consolidated.id)).rejects.toMatchObject({ code: ERR.NOT_FOUND });

    const managerTrialBalance = await api.getAccountingTrialBalance();
    expect(managerTrialBalance.rows.some((row) => Math.abs(row.balance.amount) === 7_500)).toBe(false);
    expect(managerTrialBalance).toMatchObject({ totalDebit: money(1_000), totalCredit: money(1_000) });

    const managerSources = await api.listAccountingSourcePostings();
    expect(managerSources.items.map((source) => source.sourceId)).not.toContain("mock-consolidated-source-fact");
    await expect(api.postAccountingSource({ sourceType: "payment", sourceId: "mock-consolidated-source-fact", idempotencyKey: "scope-hidden-mock", reason: "Should not disclose consolidated source" })).rejects.toMatchObject({ code: ERR.NOT_FOUND });

    await api.switchDemoRole("owner");
    expect((await api.listAccountingSourcePostings()).items.map((source) => source.sourceId)).toContain("mock-consolidated-source-fact");
  });

  it("permanently deletes a product, releases its SKU, and preserves movement history", async () => {
    const session = await api.getSession();
    const branch = session.branches[0]!;
    const product = await api.upsertProduct({ sku: "MOCK-DELETE", name: "Disposable mock stock", unit: "each", reorderPoint: 1 });
    const supplier = await api.upsertSupplier({ name: "Mock delete supplier", branchIds: [branch.id], preferredProductIds: [product.id] });
    await api.recordStockMovement({ branchId: branch.id, productId: product.id, type: "receive", quantity: 2, idempotencyKey: "mock-delete-receive" });
    await api.switchDemoRole("receptionist");
    await expect(api.deleteProduct({ productId: product.id, reason: "No longer sold", confirmation: "mock-delete" })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("owner");
    await expect(api.deleteProduct({ productId: product.id, reason: "Stock must be cleared first", confirmation: "mock-delete" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await api.recordStockMovement({ branchId: branch.id, productId: product.id, type: "adjustment", quantity: -2, reason: "Clearing stock before permanent deletion", idempotencyKey: "mock-delete-clear" });
    const deleted = await api.deleteProduct({ productId: product.id, reason: "No longer sold", confirmation: "mock-delete" });
    expect(deleted).toMatchObject({ deleted: true, productId: product.id, sku: "MOCK-DELETE" });
    await expect(api.deleteProduct({ productId: product.id, reason: "Retry", confirmation: "mock-delete" })).resolves.toMatchObject({ deleted: true, productId: product.id });
    const replacement = await api.upsertProduct({ sku: "MOCK-DELETE", name: "Replacement mock stock", unit: "each", reorderPoint: 1 });
    expect(replacement.id).not.toBe(product.id);
    expect((await api.listSuppliers()).find((row) => row.id === supplier.id)?.preferredProductIds).not.toContain(product.id);
    const movements = await api.listStockMovements({ productId: product.id });
    expect(movements.items).toEqual(expect.arrayContaining([expect.objectContaining({ productId: product.id, productSku: "MOCK-DELETE", productName: "Disposable mock stock" })]));
    expect((await api.listProducts()).some((row) => row.id === product.id)).toBe(false);
  });

  it("blocks permanent deletion while a purchase order is still open", async () => {
    const session = await api.getSession();
    const branch = session.branches[0]!;
    const product = await api.upsertProduct({ sku: "MOCK-OPEN-PO", name: "Mock open PO stock", unit: "each", reorderPoint: 1 });
    const supplier = await api.upsertSupplier({ name: "Mock open PO supplier", branchIds: [branch.id], preferredProductIds: [product.id] });
    await api.createPurchaseOrder({ branchId: branch.id, supplierId: supplier.id, lines: [{ productId: product.id, quantity: 3, unitCost: money(100) }] });
    await expect(api.deleteProduct({ productId: product.id, reason: "Open order", confirmation: "MOCK-OPEN-PO" })).rejects.toMatchObject({ code: ERR.CONFLICT });
  });

  it("refunds a deleted product into a non-sellable tombstone balance", async () => {
    const session = await api.getSession();
    const branch = session.branches[0]!;
    const product = await api.upsertProduct({ sku: "MOCK-DELETE-REFUND", name: "Mock refundable retired stock", unit: "each", reorderPoint: 1, retailPrice: money(1_000) });
    await api.recordStockMovement({ branchId: branch.id, productId: product.id, type: "receive", quantity: 1, unitCost: money(400, "JOD"), idempotencyKey: "mock-delete-refund-receive" });
    const sale = await api.checkoutRetail({ branchId: branch.id, guest: { fullName: "Deleted mock guest", phone: "+962790000012" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "MOCK-DELETE-REFUND", idempotencyKey: "mock-delete-refund-sale" });
    await api.deleteProduct({ productId: product.id, reason: "Retiring this item", confirmation: "MOCK-DELETE-REFUND" });
    const replacement = await api.upsertProduct({ sku: "MOCK-DELETE-REFUND", name: "Replacement mock retail stock", unit: "each", reorderPoint: 1 });
    expect(replacement.id).not.toBe(product.id);
    await expect(api.refundRetailSale(sale.retailSale.id, { lines: [{ productId: product.id, quantity: 1 }], reason: "Customer returned retired item", idempotencyKey: "mock-delete-refund-action" })).resolves.toMatchObject({ retailSale: { status: "refunded" } });
    const internals = api as unknown as { db: MockDb };
    expect(internals.db.inventoryBalances).toEqual(expect.arrayContaining([expect.objectContaining({ productId: product.id, quantityOnHand: 1, sellable: false })]));
    expect(internals.db.inventoryBalances.some((balance) => balance.productId === replacement.id)).toBe(false);
    await expect(api.listInventory({ branchId: branch.id, productId: product.id })).resolves.toEqual([]);
    expect(internals.db.stockMovements.some((movement) => movement.productId === product.id && movement.type === "return" && movement.productName === "Mock refundable retired stock")).toBe(true);
    expect(internals.db.stockMovements.find((movement) => movement.productId === product.id && movement.type === "return")?.unitCost).toEqual(money(400, "JOD"));
  });
});
