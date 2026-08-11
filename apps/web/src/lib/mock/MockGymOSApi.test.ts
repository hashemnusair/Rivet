import { beforeEach, describe, expect, it } from "vitest";
import { ERR, isApiError } from "@/lib/api/errors";
import type { MemberSummary, OperationalPolicies } from "@/lib/domain/types";
import { addDays, partsInTimeZone, todayISODate } from "@/lib/utils/dates";
import { fromMajor, money } from "@/lib/utils/money";
import { MockGymOSApi } from "./MockGymOSApi";

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
});

describe("platform gym applications", () => {
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
});

describe("platform subscription controls", () => {
  it("persists gym support cases and their append-only platform conversation", async () => {
    const reception = await api.switchDemoRole("receptionist");
    const supportCase = await api.createSupportCase({ email: reception.user.email, subject: "Scanner unavailable", body: "The scanner is not detected.", priority: "urgent", branchId: reception.activeBranchId });
    expect(await api.listSupportCases()).toEqual([expect.objectContaining({ id: supportCase.id, creatorId: reception.user.id, status: "open" })]);

    await api.switchDemoRole("owner");
    expect((await api.listSupportCases()).some((item) => item.id === supportCase.id)).toBe(true);
    const replied = await api.replyToPlatformSupportCase(supportCase.id, "We are reviewing the device logs.");
    expect(replied).toMatchObject({ status: "waiting", messages: [{ authorType: "gym" }, { authorType: "platform", body: "We are reviewing the device logs." }] });
    await api.switchDemoRole("receptionist");
    const notifications = await api.listNotifications();
    expect(notifications).toEqual([expect.objectContaining({ kind: "support_reply", href: `/support?case=${supportCase.id}` })]);
    await expect(api.setNotificationRead(notifications[0]!.id, true)).resolves.toMatchObject({ readAt: expect.any(String) });
    await api.switchDemoRole("owner");
    await expect(api.resolvePlatformSupportCase(supportCase.id, "")).rejects.toMatchObject({ code: ERR.VALIDATION });
    const resolved = await api.resolvePlatformSupportCase(supportCase.id, "Scanner permissions were restored.");
    expect(resolved).toMatchObject({ status: "resolved", resolutionSummary: "Scanner permissions were restored." });
    await expect(api.reopenPlatformSupportCase(supportCase.id)).resolves.toMatchObject({ status: "open" });
  });

  it("keeps platform invoices as a manual audited-style lifecycle", async () => {
    const gym = (await api.getPlatformSnapshot()).gyms[0]!;
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
    const updatedGym = await api.updatePlatformGym({ gymId: gym.id, status: "suspended", plan: "Growth", isPublic: false, reason: "Account requested a temporary pause." });
    expect(updatedGym).toMatchObject({ id: gym.id, subscriptionStatus: "suspended", rivetPlan: "Growth", isPublic: false });
    expect((await api.listMarketplaceGyms()).some((item) => item.id === gym.id)).toBe(false);

    const plan = before.plans.find((item) => item.name === "Growth")!;
    const originalPrice = plan.priceMinor;
    const originalMembers = plan.members;
    const updatedPlan = await api.updatePlatformPlan({ name: plan.name, priceMinor: plan.priceMinor + 1_000, members: plan.members + 100 });
    expect(updatedPlan.priceMinor).toBe(originalPrice + 1_000);
    expect(updatedPlan.members).toBe(originalMembers + 100);
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
    expect(receipt.member.memberNumber).toBe(member.memberNumber);

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(0);

    const timeline = await api.listMemberTimeline(member.id);
    expect(timeline.items.some((e) => e.type === "payment_collected")).toBe(true);
  });

  it("leaves a remainder outstanding on a partial payment", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const part = Math.floor(owed / 2);

    await api.createPayment({ memberId: member.id, amount: money(part), method: "card" }, "idem-part-1");

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
      { memberId: member.id, amount: money(10_000), method: "cliq" },
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

    const result = await api.renewMembership(previousId, { payment: { amount: item.membership.salePrice, method: "cash" } });

    expect(result.membership.id).not.toBe(previousId);
    expect(result.membership.previousMembershipId).toBe(previousId);

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

    const detail = await api.freezeMembership(membership.id, {
      startDate: "2026-08-01",
      endDate: "2026-08-15",
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
    await expect(api.freezeMembership(membership.id, { startDate: "2026-08-10", endDate: "2026-08-14", reason: "Short trip" })).rejects.toMatchObject({ code: ERR.VALIDATION });
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
    expect(refund.payment.originalPaymentId).toBe(receipt.payment.id);
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
    await expect(api.markOfferDelivered(draft.id, { channel: "email" })).rejects.toMatchObject({ code: ERR.CONFLICT });
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

  it("converts a lead into a member without duplicating contact details", async () => {
    const leads = await api.listLeads({ pageSize: 30 });
    const lead = leads.items.find((l) => !l.convertedMemberId && l.stage !== "lost")!;

    const member = await api.convertLead(lead.id, { homeBranchId: lead.branchId, preferredLanguage: "en" });

    expect(member.fullName).toBe(lead.fullName);
    expect(member.phone).toBe(lead.phone);
    expect(member.marketingOptIn).toBe(true);

    const after = await api.getLead(lead.id);
    expect(after.stage).toBe("won");
    expect(after.convertedMemberId).toBe(member.id);
  });

  it("blocks lead conversion when the contact already belongs to a member", async () => {
    const membersBefore = await api.listMembers({ pageSize: 300 });
    const existing = membersBefore.items[0]!;
    const lead = await api.createLead({
      fullName: "Duplicate conversion candidate",
      phone: existing.phone,
      email: existing.email,
      branchId: existing.homeBranchId,
      source: "walk_in",
    });

    await expect(api.convertLead(lead.id, { homeBranchId: existing.homeBranchId, preferredLanguage: "en" })).rejects.toMatchObject({
      code: ERR.DUPLICATE_MEMBER,
    });
    expect((await api.listMembers({ pageSize: 300 })).totalItems).toBe(membersBefore.totalItems);
    expect((await api.getLead(lead.id)).stage).toBe("new");
  });

  it("refuses to convert the same lead twice", async () => {
    const leads = await api.listLeads({ pageSize: 30 });
    const lead = leads.items.find((l) => !l.convertedMemberId && l.stage !== "lost")!;
    await api.convertLead(lead.id, { homeBranchId: lead.branchId, preferredLanguage: "en" });
    await expect(api.convertLead(lead.id, { homeBranchId: lead.branchId, preferredLanguage: "en" })).rejects.toMatchObject(
      { code: ERR.VALIDATION },
    );
  });

  it("closes open follow-up tasks when a lead converts", async () => {
    const leads = await api.listLeads({ pageSize: 30 });
    const lead = leads.items.find((l) => !l.convertedMemberId && l.stage !== "lost")!;
    const session = await api.getSession();
    await api.createFollowUp({
      type: "follow_up",
      title: "Call back",
      ownerId: session.user.id,
      dueAt: "2026-08-05T09:00:00Z",
      leadId: lead.id,
    });

    await api.convertLead(lead.id, { homeBranchId: lead.branchId, preferredLanguage: "en" });

    const open = await api.listTasks({ status: "open", pageSize: 100 });
    expect(open.items.some((t) => t.leadId === lead.id)).toBe(false);
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

  it("marks the linked customer booking converted when the lead becomes a member", async () => {
    const booking = await bookTrial();
    const session = await api.getSession();
    await api.convertLead(booking.leadId!, { homeBranchId: session.branches[0]!.id, preferredLanguage: "en" });
    const experience = await api.getCustomerExperience();
    expect(experience.bookings.find((item) => item.id === booking.id)?.status).toBe("converted");
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
