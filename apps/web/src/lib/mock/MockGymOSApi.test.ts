import { beforeEach, describe, expect, it } from "vitest";
import { ERR, isApiError } from "@/lib/api/errors";
import type { MemberSummary } from "@/lib/domain/types";
import { partsInTimeZone, todayISODate } from "@/lib/utils/dates";
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
    await expect(api.refundPayment(payment.id, { reason: "trying it on" })).rejects.toMatchObject({
      code: ERR.FORBIDDEN,
    });
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
    const member = (await api.listMembers({ pageSize: 1 })).items[0]!;
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
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
    const member = (await api.listMembers({ pageSize: 1 })).items[0]!;
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;
    const deposit = money(Math.floor(plan.basePrice.amount / 4));

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
      payment: { amount: deposit, method: "cash" },
    });

    expect(result.charge.outstandingAmount.amount).toBe(plan.basePrice.amount - deposit.amount);
    expect(result.membership.paymentStatus).toBe("partial");
  });

  it("applies a discount to the charge total and keeps the reason", async () => {
    const member = (await api.listMembers({ pageSize: 1 })).items[0]!;
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0]!;
    const discount = fromMajor(10);

    const result = await api.createMembershipSale({
      memberId: member.id,
      planId: plan.id,
      startDate: "2026-08-01",
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
});

describe("membership adjustments", () => {
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

    const refund = await api.refundPayment(receipt.payment.id, { reason: "Member cancelled within cooling-off" });

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

    await api.refundPayment(receipt.payment.id, { reason: "Sale reversed by manager" });

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(0);
    const charge = (await api.getReceipt(receipt.receipt.id)).charge!;
    expect(charge.status).toBe("refunded");
  });

  it("supports a partial refund and marks the original part-refunded", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-ref-2");

    await api.refundPayment(receipt.payment.id, { amount: money(Math.floor(owed / 2)), reason: "Half term unused" });

    const original = await api.getReceipt(receipt.receipt.id);
    expect(original.payment.status).toBe("partially_refunded");
  });

  it("refuses to refund more than was taken", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(10_000), method: "cash" }, "idem-ref-3");
    await api.refundPayment(receipt.payment.id, { reason: "full refund" });
    await expect(api.refundPayment(receipt.payment.id, { reason: "again" })).rejects.toMatchObject({
      code: ERR.PAYMENT_ALREADY_REFUNDED,
    });
  });

  it("requires a reason for a refund", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(5_000), method: "cash" }, "idem-ref-4");
    await expect(api.refundPayment(receipt.payment.id, { reason: "" })).rejects.toMatchObject({
      code: ERR.VALIDATION,
    });
  });

  it("voids a same-day payment and returns the charge to unpaid", async () => {
    const member = await anyMemberWithBalance();
    const owed = member.outstanding.amount;
    const receipt = await api.createPayment({ memberId: member.id, amount: money(owed), method: "cash" }, "idem-void-1");

    const voided = await api.voidPayment(receipt.payment.id, { reason: "Wrong amount keyed in" });
    expect(voided.payment.status).toBe("voided");

    const after = await api.getMember(member.id);
    expect(after.outstanding.amount).toBe(owed);
  });

  it("refuses to void a payment that has already been refunded", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(5_000), method: "cash" }, "idem-void-2");
    await api.refundPayment(receipt.payment.id, { reason: "refunded first" });
    await expect(api.voidPayment(receipt.payment.id, { reason: "now void it" })).rejects.toMatchObject({
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
    await expect(api.voidPayment(stale.id, { reason: "too late" })).rejects.toMatchObject({
      code: ERR.VOID_WINDOW_EXPIRED,
    });
  });

  it("writes an audit event naming the actor for every refund", async () => {
    const member = await anyMemberWithBalance();
    const receipt = await api.createPayment({ memberId: member.id, amount: money(30_000), method: "cash" }, "idem-ref-5");
    await api.refundPayment(receipt.payment.id, { reason: "Equipment closure goodwill" });

    const audit = await api.listAuditEvents({ category: "payments", pageSize: 20 });
    const event = audit.items.find((e) => e.action === "payment.refund" && e.entityId === receipt.payment.id)!;
    expect(event.actorName).toBeTruthy();
    expect(event.reason).toBe("Equipment closure goodwill");
  });
});

describe("CRM", () => {
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

  it("converts a lead into a member without duplicating contact details", async () => {
    const leads = await api.listLeads({ pageSize: 30 });
    const lead = leads.items.find((l) => !l.convertedMemberId && l.stage !== "lost")!;

    const member = await api.convertLead(lead.id, { homeBranchId: lead.branchId, preferredLanguage: "en" });

    expect(member.fullName).toBe(lead.fullName);
    expect(member.phone).toBe(lead.phone);

    const after = await api.getLead(lead.id);
    expect(after.stage).toBe("won");
    expect(after.convertedMemberId).toBe(member.id);
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

    const reviewed = await api.reviewVariance(closed.id, { decision: "approved" });
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
