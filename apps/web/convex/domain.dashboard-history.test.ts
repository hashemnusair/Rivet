import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-dashboard-history-${name}` });

// 12:00 in Amman, so the tenant's business date is 2026-10-15 and the default
// dashboard range is 2026-09-16 … 2026-10-15.
const NOW = "2026-10-15T09:00:00.000Z";
const ORG = "dash-org";
const A = "dash-branch-a";
const B = "dash-branch-b";
const money = (amount: number) => ({ amount, currency: "JOD" });

type Ids = { organization: Id<"organizations">; branchA: Id<"branches">; branchB: Id<"branches">; owner: Id<"users"> };

/**
 * A two-branch gym with enough history to exercise every dashboard source:
 * members who visited today, weeks ago, at another branch, never, or only
 * through an override; payments on both sides of the tenant's month and day
 * boundaries; leads at every funnel stage; and more timeline than the recent
 * activity list shows, with ties at its cut-off.
 */
async function seedHistory(t: TestConvex<typeof schema>): Promise<Ids> {
  return await t.run(async (ctx) => {
    const base = Date.parse("2026-01-01T00:00:00.000Z");
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Dashboard History Gym", slug: "dash-history", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: base, updatedAt: base });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: A, name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: base, updatedAt: base });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: B, name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: base, updatedAt: base });
    const user = async (publicId: string, fullName: string, role: "owner" | "manager" | "receptionist" | "sales", branchIds: Array<Id<"branches">>, branchScope: "all" | "selected") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@dash.example`, fullName, platformAdmin: false, status: "active", createdAt: base, updatedAt: base });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: id, role, branchIds, branchScope, active: true, createdAt: base, updatedAt: base });
      return id;
    };
    const owner = await user("dash-owner", "Dana Owner", "owner", [branchA, branchB], "all");
    await user("dash-manager-a", "Majd Manager", "manager", [branchA], "selected");
    await user("dash-desk", "Hala Desk", "receptionist", [branchA], "selected");
    await user("dash-sales", "Sami Sales", "sales", [branchA, branchB], "selected");

    const branchOf = (publicId?: string) => publicId === A ? branchA : publicId === B ? branchB : undefined;
    const record = async (entityType: string, publicId: string, value: Record<string, unknown>, keys: { branch?: string; member?: string; lead?: string; at?: string } = {}) => {
      const createdAt = Date.parse(keys.at ?? (typeof value.occurredAt === "string" ? value.occurredAt : typeof value.createdAt === "string" ? value.createdAt : "2026-10-01T00:00:00.000Z"));
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branchOf(keys.branch), memberPublicId: keys.member, leadPublicId: keys.lead, createdAt, updatedAt: createdAt, data: { id: publicId, organizationId: ORG, ...value } });
    };

    await record("settings", "settings", { operationalPolicies: { retention: { inactivityDays: 14, expiredWinBackDays: 90 }, membership: { renewalWindowDays: 14 } } }, { at: "2026-01-01T00:00:00.000Z" });
    await record("plan", "plan-monthly", { name: "Monthly", code: "MONTHLY", kind: "time", status: "active", branchAccess: "all", branchIds: [], basePrice: money(30_000) }, { at: "2026-01-01T00:00:00.000Z" });
    await record("plan", "plan-visits", { name: "10 visits", code: "TEN", kind: "visits", status: "active", branchAccess: "all", branchIds: [], basePrice: money(20_000) }, { at: "2026-01-01T00:00:00.000Z" });

    const member = async (id: string, fullName: string, homeBranchId: string, createdAt: string, extra: Record<string, unknown> = {}) =>
      await record("member", id, { fullName, memberNumber: id.toUpperCase(), phone: `+96279${String(fullName.length).padStart(7, "0")}`, homeBranchId, status: "active", assignedSalespersonId: "dash-sales", createdAt, ...extra }, { branch: homeBranchId, member: id });
    const membership = async (id: string, memberId: string, homeBranchId: string, startDate: string, endDate: string, extra: Record<string, unknown> = {}) =>
      await record("membership", id, { memberId, planId: "plan-monthly", homeBranchId, startDate, endDate, soldById: "dash-sales", ...extra }, { branch: homeBranchId, member: memberId, at: `${startDate}T08:00:00.000Z` });
    let checkInCount = 0;
    const checkIn = async (memberId: string, memberName: string, branchId: string, occurredAt: string, decision = "allowed", reasonCodes: string[] = ["OK"]) => {
      checkInCount += 1;
      await record("checkIn", `ci-${checkInCount}`, { memberId, memberName, memberNumber: memberId.toUpperCase(), branchId, branchName: branchId === A ? "Abdoun" : "Sweifieh", decision, reasonCodes, actorId: "dash-desk", actorName: "Hala Desk", occurredAt }, { branch: branchId, member: memberId });
      if (decision !== "blocked") await record("timeline", `tl-ci-${checkInCount}`, { memberId, branchId, type: "check_in", title: `Checked in — ${branchId === A ? "Abdoun" : "Sweifieh"}`, actorId: "dash-desk", actorName: "Hala Desk", occurredAt, meta: { decision } }, { branch: branchId, member: memberId });
    };
    const payment = async (id: string, value: { memberId?: string; branchId: string; type?: string; status?: string; amount: number; occurredAt: string; collectedById: string }) =>
      await record("payment", id, { type: "payment", status: "completed", method: "cash", collectedByName: value.collectedById, ...value, amount: money(value.amount) }, { branch: value.branchId, member: value.memberId });

    // Visits today and on a steady three-day rhythm since June.
    await member("dm-active-a", "Lina Haddad", A, "2026-03-01T08:00:00.000Z");
    await membership("ms-active-a-prev", "dm-active-a", A, "2026-09-01", "2026-09-30");
    await membership("ms-active-a", "dm-active-a", A, "2026-10-01", "2026-10-31", { previousMembershipId: "ms-active-a-prev" });
    for (let day = Date.parse("2026-06-17T06:00:00.000Z"); day <= Date.parse("2026-10-12T06:00:00.000Z"); day += 3 * 86_400_000) await checkIn("dm-active-a", "Lina Haddad", A, new Date(day).toISOString());
    await checkIn("dm-active-a", "Lina Haddad", A, "2026-10-15T06:10:00.000Z");

    // Last real visit 20 days ago; a refused attempt since then is not a visit.
    await member("dm-inactive-a", "Rami Khoury", A, "2026-05-01T08:00:00.000Z");
    await membership("ms-inactive-a", "dm-inactive-a", A, "2026-09-01", "2026-11-30");
    await checkIn("dm-inactive-a", "Rami Khoury", A, "2026-09-05T15:00:00.000Z");
    await checkIn("dm-inactive-a", "Rami Khoury", A, "2026-09-25T15:00:00.000Z");
    await checkIn("dm-inactive-a", "Rami Khoury", A, "2026-10-10T15:00:00.000Z", "blocked", ["BALANCE_DUE"]);

    // Home branch A, last visit at B: a branch-A view sees an older last visit.
    await member("dm-roamer", "Omar Nasser", A, "2026-04-01T08:00:00.000Z");
    await membership("ms-roamer", "dm-roamer", A, "2026-08-01", "2026-12-31");
    await checkIn("dm-roamer", "Omar Nasser", A, "2026-08-26T17:00:00.000Z");
    await checkIn("dm-roamer", "Omar Nasser", B, "2026-09-10T17:00:00.000Z");

    // Never visited since joining 25 days ago.
    await member("dm-never", "Sara Amin", B, "2026-09-20T10:00:00.000Z");
    await membership("ms-never", "dm-never", B, "2026-09-20", "2026-12-19");

    // Ends in two days: a renewal item, not an at-risk item.
    await member("dm-expiring", "Yousef Taha", A, "2026-01-10T08:00:00.000Z");
    await membership("ms-expiring", "dm-expiring", A, "2026-09-18", "2026-10-17");
    await checkIn("dm-expiring", "Yousef Taha", A, "2026-10-14T16:00:00.000Z");

    // Expired 15 days ago and refused twice this morning.
    await member("dm-expired", "Noor Saleh", A, "2026-02-01T08:00:00.000Z");
    await membership("ms-expired", "dm-expired", A, "2026-08-31", "2026-09-30");
    await checkIn("dm-expired", "Noor Saleh", A, "2026-09-29T16:00:00.000Z");
    await checkIn("dm-expired", "Noor Saleh", A, "2026-10-15T05:00:00.000Z", "blocked", ["MEMBERSHIP_EXPIRED"]);
    await checkIn("dm-expired", "Noor Saleh", A, "2026-10-15T06:30:00.000Z", "blocked", ["MEMBERSHIP_EXPIRED", "BALANCE_DUE"]);

    // Inactive but snoozed until next week.
    await member("dm-snoozed", "Huda Fares", A, "2026-02-15T08:00:00.000Z");
    await membership("ms-snoozed", "dm-snoozed", A, "2026-09-01", "2026-11-30");
    await checkIn("dm-snoozed", "Huda Fares", A, "2026-09-15T12:00:00.000Z");
    await record("retentionState", "rs-snoozed", { memberId: "dm-snoozed", snoozedUntil: "2026-10-20", reason: "Travelling" }, { branch: A, member: "dm-snoozed", at: "2026-10-08T10:00:00.000Z" });

    // Frozen today.
    await member("dm-frozen", "Ali Mansour", B, "2026-03-20T08:00:00.000Z");
    await membership("ms-frozen", "dm-frozen", B, "2026-08-01", "2026-11-30", { activeFreeze: { status: "active", startDate: "2026-10-01", endDate: "2026-10-30" } });
    await checkIn("dm-frozen", "Ali Mansour", B, "2026-09-01T09:00:00.000Z");

    // Last visit 100 days ago, through a manual override.
    await member("dm-long-gone", "Tariq Aziz", A, "2025-12-01T08:00:00.000Z");
    await membership("ms-long-gone", "dm-long-gone", A, "2026-06-01", "2026-12-31");
    await checkIn("dm-long-gone", "Tariq Aziz", A, "2026-07-01T09:00:00.000Z");
    await checkIn("dm-long-gone", "Tariq Aziz", A, "2026-07-07T09:00:00.000Z", "overridden", ["MANUAL_OVERRIDE"]);

    // Archived, a visit pack with no visits left, and a new member at B.
    await member("dm-archived", "Old Member", A, "2025-11-01T08:00:00.000Z", { status: "archived", archivedAt: "2026-09-01T08:00:00.000Z" });
    await membership("ms-archived", "dm-archived", A, "2026-07-01", "2026-07-31");
    await member("dm-visit-pack", "Rasha Odeh", B, "2026-06-01T08:00:00.000Z");
    await membership("ms-visit-pack", "dm-visit-pack", B, "2026-06-01", "2026-12-31", { planId: "plan-visits", totalVisits: 10, remainingVisits: 0 });
    await member("dm-new-b", "Kareem Said", B, "2026-10-05T08:00:00.000Z");
    await membership("ms-new-b", "dm-new-b", B, "2026-10-05", "2026-11-04");
    await checkIn("dm-new-b", "Kareem Said", B, "2026-10-15T07:00:00.000Z");

    // Payments: today, the tenant's month edges (UTC date differs), voided, refunds, retail, older history.
    await payment("pay-today-a", { memberId: "dm-active-a", branchId: A, amount: 10_000, occurredAt: "2026-10-15T06:15:00.000Z", collectedById: "dash-owner" });
    await payment("pay-today-b-retail", { branchId: B, type: "retail_sale", amount: 2_500, occurredAt: "2026-10-15T07:05:00.000Z", collectedById: "dash-desk" });
    await payment("pay-today-refund", { memberId: "dm-active-a", branchId: A, type: "refund", amount: -3_000, occurredAt: "2026-10-15T08:00:00.000Z", collectedById: "dash-owner" });
    await payment("pay-edge-today", { memberId: "dm-expiring", branchId: A, amount: 4_000, occurredAt: "2026-10-14T21:30:00.000Z", collectedById: "dash-sales" });
    await payment("pay-edge-month", { memberId: "dm-inactive-a", branchId: A, amount: 6_000, occurredAt: "2026-09-30T22:30:00.000Z", collectedById: "dash-sales" });
    await payment("pay-oct-3", { memberId: "dm-roamer", branchId: A, amount: 20_000, occurredAt: "2026-10-03T10:00:00.000Z", collectedById: "dash-sales" });
    await payment("pay-voided", { memberId: "dm-roamer", branchId: A, status: "voided", amount: 50_000, occurredAt: "2026-10-03T10:30:00.000Z", collectedById: "dash-sales" });
    await payment("pay-sep-30-utc", { memberId: "dm-snoozed", branchId: A, amount: 3_000, occurredAt: "2026-09-30T20:00:00.000Z", collectedById: "dash-owner" });
    await payment("pay-sep-20", { memberId: "dm-never", branchId: B, amount: 15_000, occurredAt: "2026-09-20T10:00:00.000Z", collectedById: "dash-sales" });
    await payment("pay-sep-5", { memberId: "dm-snoozed", branchId: A, amount: 7_000, occurredAt: "2026-09-05T10:00:00.000Z", collectedById: "dash-owner" });
    await payment("pay-aug-31-edge", { memberId: "dm-frozen", branchId: B, amount: 1_000, occurredAt: "2026-08-31T21:30:00.000Z", collectedById: "dash-sales" });
    await payment("pay-aug-10", { memberId: "dm-frozen", branchId: B, amount: 9_000, occurredAt: "2026-08-10T10:00:00.000Z", collectedById: "dash-sales" });
    for (const month of ["03", "04", "05", "06", "07", "08", "09"]) await payment(`pay-history-${month}`, { memberId: "dm-active-a", branchId: A, amount: 5_000, occurredAt: `2026-${month}-02T10:00:00.000Z`, collectedById: "dash-owner" });

    // Charges: collectible, not yet due, and settled.
    await record("charge", "ch-inactive", { memberId: "dm-inactive-a", total: money(12_000), paidAmount: money(0), outstandingAmount: money(12_000), status: "unpaid", issueDate: "2026-10-10", dueDate: "2026-10-10" }, { branch: A, member: "dm-inactive-a", at: "2026-10-10T08:00:00.000Z" });
    await record("charge", "ch-never", { memberId: "dm-never", total: money(5_000), paidAmount: money(0), outstandingAmount: money(5_000), status: "unpaid", issueDate: "2026-10-01", dueDate: "2026-10-01" }, { branch: B, member: "dm-never", at: "2026-10-01T08:00:00.000Z" });
    await record("charge", "ch-future", { memberId: "dm-active-a", total: money(8_000), paidAmount: money(0), outstandingAmount: money(8_000), status: "unpaid", issueDate: "2026-10-15", dueDate: "2026-10-20" }, { branch: A, member: "dm-active-a", at: "2026-10-15T08:00:00.000Z" });
    await record("charge", "ch-paid", { memberId: "dm-roamer", total: money(20_000), paidAmount: money(20_000), outstandingAmount: money(0), status: "paid", issueDate: "2026-10-03", dueDate: "2026-10-03" }, { branch: A, member: "dm-roamer", at: "2026-10-03T08:00:00.000Z" });

    // Leads at every stage, with their timeline, offers and trial bookings.
    const lead = async (id: string, fullName: string, branchId: string, extra: Record<string, unknown>) =>
      await record("lead", id, { branchId, fullName, phone: "+962790009999", source: "instagram", ownerId: "dash-sales", ownerName: "Sami Sales", createdAt: "2026-09-01T08:00:00.000Z", ...extra }, { branch: branchId, at: "2026-09-01T08:00:00.000Z" });
    const leadEvent = async (id: string, leadId: string, branchId: string, type: string, occurredAt: string, meta: Record<string, unknown> = {}) =>
      await record("timeline", id, { leadId, branchId, type, title: type.replaceAll("_", " "), actorId: "dash-sales", actorName: "Sami Sales", occurredAt, meta }, { branch: branchId, lead: leadId });
    await lead("dl-new", "New Lead", A, { stage: "new", nextFollowUpAt: "2026-10-15T08:00:00.000Z" });
    await lead("dl-called", "Called Lead", A, { stage: "contacted", nextFollowUpAt: "2026-10-14T09:00:00.000Z" });
    await leadEvent("tl-called-1", "dl-called", A, "call_attempt", "2026-10-10T09:00:00.000Z", { outcome: "no_answer" });
    await leadEvent("tl-called-2", "dl-called", A, "call_attempt", "2026-10-12T09:00:00.000Z", { outcome: "answered_interested" });
    await lead("dl-trial", "Trial Lead", B, { stage: "trial_booked", nextFollowUpAt: "2026-10-18T09:00:00.000Z" });
    await record("trialBooking", "tb-trial", { leadId: "dl-trial", branchId: B, status: "booked", scheduledAt: "2026-10-18T15:00:00.000Z" }, { branch: B, lead: "dl-trial", at: "2026-10-11T08:00:00.000Z" });
    await record("offer", "of-trial", { leadId: "dl-trial", status: "sent", planId: "plan-monthly", planName: "Monthly", expiresAt: "2026-10-25T00:00:00.000Z" }, { branch: B, lead: "dl-trial", at: "2026-10-11T09:00:00.000Z" });
    await lead("dl-tasked", "Tasked Lead", A, { stage: "attempted", nextFollowUpAt: "2026-10-15T07:00:00.000Z" });
    await leadEvent("tl-tasked-1", "dl-tasked", A, "call_attempt", "2026-10-13T11:00:00.000Z", { outcome: "busy" });
    await lead("dl-won", "Won Lead", B, { stage: "won", convertedMemberId: "dm-new-b" });
    await lead("dl-converted-event", "Converted By Event", B, { stage: "offer_sent" });
    await leadEvent("tl-converted", "dl-converted-event", B, "lead_converted", "2026-10-09T12:00:00.000Z");
    await lead("dl-lost", "Lost Lead", A, { stage: "lost", lostReason: "Too far" });
    await lead("dl-trial-done", "Trial Done Lead", A, { stage: "trial_completed", nextFollowUpAt: "2026-10-16T09:00:00.000Z" });
    await leadEvent("tl-trial-done", "dl-trial-done", A, "trial_completed", "2026-10-13T18:00:00.000Z");
    await leadEvent("tl-trial-done-old", "dl-trial-done", A, "call_attempt", "2026-05-02T09:00:00.000Z", { outcome: "whatsapp_sent" });

    // Tasks: overdue, due later today, completed, future.
    const task = async (id: string, value: Record<string, unknown>) =>
      await record("task", id, { type: "follow_up", priority: "normal", status: "open", ownerName: value.ownerId === "dash-sales" ? "Sami Sales" : "Majd Manager", ...value }, { member: typeof value.memberId === "string" ? value.memberId : undefined, lead: typeof value.leadId === "string" ? value.leadId : undefined, at: "2026-10-10T08:00:00.000Z" });
    await task("tk-overdue", { memberId: "dm-inactive-a", ownerId: "dash-sales", title: "Call about missed visits", subjectName: "Rami Khoury", dueAt: "2026-10-14T09:00:00.000Z", priority: "high" });
    await task("tk-today", { leadId: "dl-tasked", ownerId: "dash-manager-a", title: "Follow up — Tasked Lead", subjectName: "Tasked Lead", dueAt: "2026-10-15T15:00:00.000Z" });
    await task("tk-done", { memberId: "dm-active-a", ownerId: "dash-sales", title: "Welcome call", subjectName: "Lina Haddad", dueAt: "2026-10-02T09:00:00.000Z", status: "completed" });
    await task("tk-future", { memberId: "dm-never", ownerId: "dash-sales", title: "Book first session", subjectName: "Sara Amin", dueAt: "2026-10-20T09:00:00.000Z" });

    // More member timeline, including a tie at the recent-activity cut-off.
    for (const [index, occurredAt] of ["2026-10-14T16:00:00.000Z", "2026-10-14T16:00:00.000Z", "2026-10-14T16:00:00.000Z", "2026-10-15T08:30:00.000Z", "2026-10-15T08:59:00.000Z"].entries()) {
      await record("timeline", `tl-note-${index}`, { memberId: "dm-expiring", branchId: A, type: "note", title: `Note ${index}`, actorId: "dash-desk", actorName: "Hala Desk", occurredAt }, { branch: A, member: "dm-expiring" });
    }
    await record("timeline", "tl-note-b", { memberId: "dm-new-b", branchId: B, type: "note", title: "Note at B", actorId: "dash-sales", actorName: "Sami Sales", occurredAt: "2026-10-15T08:45:00.000Z" }, { branch: B, member: "dm-new-b" });

    // A cash variance waiting for review and an approval request.
    await record("shift", "sh-variance", { branchId: A, status: "closed", varianceApprovalStatus: "pending", variance: money(1_500), openedByName: "Hala Desk", closedAt: "2026-10-14T20:00:00.000Z" }, { branch: A, at: "2026-10-14T08:00:00.000Z" });
    await ctx.db.insert("auditEvents", { organizationId: organization, publicId: "audit-discount", branchId: branchA, actorUserId: owner, actorPublicId: "dash-sales", actorName: "Sami Sales", actorRole: "sales", category: "memberships", action: "membership.discount", entityType: "membership", entityPublicId: "ms-active-a", entityLabel: "Lina Haddad · DM-ACTIVE-A", summary: "Discount of 20% requested", reason: "Loyal member", approvalStatus: "pending", correlationId: "cor-audit-discount", occurredAt: Date.parse("2026-10-14T12:00:00.000Z") });
    await ctx.db.insert("auditEvents", { organizationId: organization, publicId: "audit-approved", branchId: branchB, actorUserId: owner, actorPublicId: "dash-owner", actorName: "Dana Owner", actorRole: "owner", category: "payments", action: "payment.refund", entityType: "payment", entityPublicId: "pay-today-refund", entityLabel: "Refund", summary: "Refunded JOD 3.000", approvalStatus: "approved", correlationId: "cor-audit-approved", occurredAt: Date.parse("2026-10-15T08:00:00.000Z") });

    return { organization, branchA, branchB, owner };
  });
}

const VIEWS: Array<{ name: string; subject: string; input: Record<string, unknown>; activeBranchId?: string }> = [
  { name: "owner, all branches", subject: "clerk-dash-owner", input: {} },
  { name: "owner, branch A", subject: "clerk-dash-owner", input: { branchId: A } },
  { name: "owner, branch B", subject: "clerk-dash-owner", input: { branchId: B } },
  { name: "owner, September", subject: "clerk-dash-owner", input: { from: "2026-09-01", to: "2026-09-30" } },
  { name: "branch-A manager", subject: "clerk-dash-manager-a", input: {} },
  { name: "branch-A receptionist", subject: "clerk-dash-desk", input: {} },
  // Two selected branches: the workspace must name the active one.
  { name: "salesperson", subject: "clerk-dash-sales", input: {}, activeBranchId: A },
  { name: "salesperson, branch B", subject: "clerk-dash-sales", input: { branchId: B }, activeBranchId: B },
];

// Ranges the dashboard page does not send but the API accepts: a date that
// does not exist, a range after today, a long range and a single day.
const UNUSUAL_RANGES: typeof VIEWS = [
  { name: "owner, impossible start date", subject: "clerk-dash-owner", input: { from: "2026-02-30", to: "2026-10-15" } },
  { name: "owner, future range", subject: "clerk-dash-owner", input: { from: "2026-10-20", to: "2026-10-31" } },
  { name: "owner, since July", subject: "clerk-dash-owner", input: { from: "2026-07-01", to: "2026-10-15" } },
  { name: "owner, today only, branch B", subject: "clerk-dash-owner", input: { from: "2026-10-15", to: "2026-10-15", branchId: B } },
];

async function dashboardViews(t: TestConvex<typeof schema>, list = VIEWS): Promise<Record<string, Record<string, unknown>>> {
  const views: Record<string, Record<string, unknown>> = {};
  for (const view of list) views[view.name] = await t.withIdentity({ subject: view.subject }).query(api.domain.query, { ...operation("dashboard", view.input), activeBranchId: view.activeBranchId }) as Record<string, unknown>;
  return views;
}

type QueueItem = { id: string; kind: string; priority: string; detail?: string; occurredAt?: string };
const queueOf = (view: Record<string, unknown>) => (view.todayQueue as { items: QueueItem[] }).items;

afterEach(() => vi.useRealTimers());

describe("dashboard over a gym with history", () => {
  it("keeps KPIs, retention alerts and the Today queue exactly as before", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedHistory(t);

    const views = await dashboardViews(t);
    const owner = views["owner, all branches"]!;
    expect(owner.kpis).toEqual({
      revenueToday: money(16_500),
      revenueThisMonth: money(42_500),
      revenuePrevMonth: money(31_000),
      outstandingTotal: money(17_000),
      newMembersThisMonth: 1,
      renewalsDueNext7Days: 1,
      expiredUnactioned: 2,
      checkInsToday: 2,
      activeLeads: 5,
      overdueFollowUps: 1,
    });
    const atRisk = (view: Record<string, unknown>) => queueOf(view).filter((item) => item.kind === "at_risk").map((item) => [item.id, item.priority, item.detail, item.occurredAt]);
    expect(atRisk(owner)).toEqual([
      ["at-risk:dm-long-gone", "urgent", "No visit in 100 days · Monthly", "2026-07-07T09:00:00.000Z"],
      ["at-risk:dm-roamer", "urgent", "No visit in 35 days · Monthly", "2026-09-10T17:00:00.000Z"],
      ["at-risk:dm-expired", "urgent", "Expired 15 days ago · Monthly", "2026-09-29T16:00:00.000Z"],
      ["at-risk:dm-inactive-a", "high", "No visit in 20 days · Monthly", "2026-09-25T15:00:00.000Z"],
      ["at-risk:dm-never", "high", "No first visit after 25 days · Monthly", undefined],
    ]);
    // A branch-A view only counts branch-A visits, so the roamer looks idle longer.
    expect(atRisk(views["owner, branch A"]!)).toContainEqual(["at-risk:dm-roamer", "urgent", "No visit in 50 days · Monthly", "2026-08-26T17:00:00.000Z"]);
    expect(atRisk(views["branch-A manager"]!)).toContainEqual(["at-risk:dm-roamer", "urgent", "No visit in 50 days · Monthly", "2026-08-26T17:00:00.000Z"]);
    expect(queueOf(owner).filter((item) => item.kind === "access_denial")).toEqual([expect.objectContaining({ id: "access:dm-expired", detail: "membership expired · balance due", occurredAt: "2026-10-15T06:30:00.000Z" })]);
    expect(queueOf(owner).map((item) => item.id)).toMatchSnapshot("owner Today queue order");
    expect((owner.recentActivity as Array<{ id: string }>).map((event) => event.id)).toMatchSnapshot("owner recent activity");
    expect(views).toMatchSnapshot("every dashboard view");
    const unusual = await dashboardViews(t, UNUSUAL_RANGES);
    expect(unusual).toMatchSnapshot("unusual ranges");

    // Once older check-ins are summarised, last visits come from the summary.
    await summariseVisits(t);
    expect(await dashboardViews(t)).toEqual(views);
    expect(await dashboardViews(t, UNUSUAL_RANGES)).toEqual(unusual);
  }, 30_000);

  it("keeps last visits current as check-ins are written after the backfill", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedHistory(t);
    await summariseVisits(t);
    const desk = t.withIdentity({ subject: "clerk-dash-desk" });
    const owner = t.withIdentity({ subject: "clerk-dash-owner" });

    vi.setSystemTime(new Date("2026-10-15T09:05:00.000Z"));
    await desk.mutation(api.domain.mutate, operation("checkins.create", { branchId: A, memberId: "dm-roamer" }));
    await desk.mutation(api.domain.mutate, operation("checkins.create", { branchId: A, memberId: "dm-expired" }));
    await owner.mutation(api.domain.mutate, { ...operation("checkins.override", { branchId: B, memberId: "dm-long-gone", reason: "Card at home" }), activeBranchId: B });
    vi.setSystemTime(new Date("2026-10-15T09:10:00.000Z"));

    const summarised = await dashboardViews(t);
    const ownerQueue = queueOf(summarised["owner, all branches"]!).map((item) => item.id);
    expect(ownerQueue).not.toContain("at-risk:dm-roamer");
    expect(ownerQueue).not.toContain("at-risk:dm-long-gone");
    // The refused entry is not a visit: the expired member stays on the list.
    expect(ownerQueue).toContain("at-risk:dm-expired");
    // Branch A never saw the override at B.
    expect(queueOf(summarised["owner, branch A"]!).map((item) => item.id)).toContain("at-risk:dm-long-gone");

    // Reading every check-in gives the same dashboard.
    await t.run(async (ctx) => {
      const ready = await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "member_visit_summary_v1")).unique();
      await ctx.db.delete(ready!._id);
    });
    expect(await dashboardViews(t)).toEqual(summarised);
  }, 30_000);
});

async function summariseVisits(t: TestConvex<typeof schema>): Promise<void> {
  await t.mutation(internal.qolMaintenance.backfillMemberVisits, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.mutation(internal.qolMaintenance.backfillMemberVisits, {})).toEqual({ processed: 0, completed: true });
}
