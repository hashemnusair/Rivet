import { vi } from "vitest";
import type { TestConvex } from "convex-test";
// The package has no exports map; its tracker is what counts reads per transaction.
import { TransactionMetricsTracker } from "convex-test/dist/transactionMetrics.js";
import type { Id } from "./_generated/dataModel";
import { recordMemberVisit } from "./qolMaintenance";
import type schema from "./schema";

/**
 * A busy gym's history for the opt-in benchmarks: 300 members, two branches,
 * about 180 check-ins a day, a timeline event for every second check-in and a
 * monthly payment per member. The file name has two dots, so Convex never
 * deploys it.
 */
export const NOW = "2026-10-15T09:00:00.000Z";
const DAY_MS = 86_400_000;
const MEMBERS = 300;
const CHECK_INS_PER_DAY = 180;
const BRANCHES = ["bench-branch-a", "bench-branch-b"] as const;

export async function seedGym(t: TestConvex<typeof schema>, days: number): Promise<number> {
  return await t.run(async (ctx) => {
    const now = Date.parse(NOW);
    const historyStart = now - days * DAY_MS;
    const organization = await ctx.db.insert("organizations", { publicId: "bench-org", name: "Bench Gym", slug: "bench-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: historyStart, updatedAt: historyStart });
    const branchIds: Array<Id<"branches">> = [];
    for (const publicId of BRANCHES) branchIds.push(await ctx.db.insert("branches", { organizationId: organization, publicId, name: publicId, code: publicId.slice(-1).toUpperCase(), active: true, status: "active", createdAt: historyStart, updatedAt: historyStart }));
    const owner = await ctx.db.insert("users", { publicId: "bench-owner", authSubject: "clerk-bench-owner", email: "owner@bench.example", fullName: "Bench Owner", platformAdmin: false, status: "active", createdAt: historyStart, updatedAt: historyStart });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds, branchScope: "all", active: true, createdAt: historyStart, updatedAt: historyStart });
    let inserted = 0;
    const record = async (entityType: string, publicId: string, value: Record<string, unknown>, createdAt: number, keys: { branch?: number; member?: string; lead?: string } = {}) => {
      inserted += 1;
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: keys.branch === undefined ? undefined : branchIds[keys.branch], memberPublicId: keys.member, leadPublicId: keys.lead, createdAt, updatedAt: createdAt, data: { id: publicId, organizationId: "bench-org", ...value } });
    };
    const iso = (ms: number) => new Date(ms).toISOString();
    const date = (ms: number) => iso(ms).slice(0, 10);

    await record("settings", "settings", { operationalPolicies: { retention: { inactivityDays: 14, expiredWinBackDays: 90 }, membership: { renewalWindowDays: 14 } } }, historyStart);
    await record("plan", "bench-plan", { name: "Monthly", code: "M", kind: "time", status: "active", branchAccess: "all", branchIds: [], basePrice: { amount: 30_000, currency: "JOD" } }, historyStart);
    for (let index = 0; index < MEMBERS; index += 1) {
      const id = `bench-member-${index}`;
      const branch = index % 2;
      await record("member", id, { fullName: `Member ${index}`, memberNumber: `B-${index}`, phone: `+9627900${String(index).padStart(5, "0")}`, homeBranchId: BRANCHES[branch], status: "active", assignedSalespersonId: "bench-owner", createdAt: iso(historyStart) }, historyStart, { branch, member: id });
      await record("membership", `bench-membership-${index}`, { memberId: id, planId: "bench-plan", homeBranchId: BRANCHES[branch], startDate: date(historyStart), endDate: date(now + (index % 40) * DAY_MS), soldById: "bench-owner" }, historyStart, { branch, member: id });
      await record("charge", `bench-charge-${index}`, { memberId: id, total: { amount: 30_000, currency: "JOD" }, paidAmount: { amount: index % 5 === 0 ? 0 : 30_000, currency: "JOD" }, outstandingAmount: { amount: index % 5 === 0 ? 30_000 : 0, currency: "JOD" }, status: index % 5 === 0 ? "unpaid" : "paid", issueDate: date(historyStart), dueDate: date(historyStart) }, historyStart, { branch, member: id });
    }
    for (let index = 0; index < 50; index += 1) {
      const id = `bench-lead-${index}`;
      await record("lead", id, { branchId: BRANCHES[index % 2], fullName: `Lead ${index}`, stage: index % 7 === 0 ? "lost" : "contacted", lostReason: index % 7 === 0 ? "Price" : undefined, ownerId: "bench-owner", nextFollowUpAt: iso(now - (index % 3) * DAY_MS), createdAt: iso(historyStart) }, historyStart, { branch: index % 2, lead: id });
      for (let event = 0; event < 3; event += 1) await record("timeline", `bench-lead-event-${index}-${event}`, { leadId: id, type: "call_attempt", title: "Call", occurredAt: iso(historyStart + event * DAY_MS), meta: { outcome: event === 2 ? "answered_interested" : "no_answer" } }, historyStart + event * DAY_MS, { branch: index % 2, lead: id });
    }
    for (let day = 0; day < days; day += 1) {
      const dayStart = historyStart + day * DAY_MS + 5 * 3_600_000;
      for (let slot = 0; slot < CHECK_INS_PER_DAY; slot += 1) {
        const memberIndex = (day * CHECK_INS_PER_DAY + slot) % MEMBERS;
        const memberId = `bench-member-${memberIndex}`;
        const branch = slot % 10 === 0 ? 1 - (memberIndex % 2) : memberIndex % 2;
        const occurredAt = dayStart + slot * 5 * 60_000;
        const decision = slot % 50 === 0 ? "blocked" : "allowed";
        await record("checkIn", `bench-checkin-${day}-${slot}`, { memberId, memberName: `Member ${memberIndex}`, branchId: BRANCHES[branch], decision, reasonCodes: [decision === "blocked" ? "BALANCE_DUE" : "OK"], occurredAt: iso(occurredAt) }, occurredAt, { branch, member: memberId });
        if (slot % 2 === 0) await record("timeline", `bench-timeline-${day}-${slot}`, { memberId, branchId: BRANCHES[branch], type: "check_in", title: "Checked in", occurredAt: iso(occurredAt), meta: { decision } }, occurredAt, { branch, member: memberId });
      }
      // Each member pays on their own day of the month.
      const today = new Date(historyStart + day * DAY_MS);
      for (let index = 0; index < MEMBERS; index += 1) {
        if ((index % 28) + 1 !== today.getUTCDate()) continue;
        const occurredAt = historyStart + day * DAY_MS + 10 * 3_600_000;
        await record("payment", `bench-payment-${day}-${index}`, { memberId: `bench-member-${index}`, branchId: BRANCHES[index % 2], type: "payment", status: "completed", method: "cash", amount: { amount: 30_000, currency: "JOD" }, collectedById: "bench-owner", occurredAt: iso(occurredAt) }, occurredAt, { branch: index % 2, member: `bench-member-${index}` });
      }
    }
    return inserted;
  });
}

export async function summariseVisits(t: TestConvex<typeof schema>): Promise<void> {
  await t.run(async (ctx) => {
    const latest = new Map<string, Parameters<typeof recordMemberVisit>[1]>();
    for (const row of await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "checkIn")).collect()) {
      const value = row.data as { memberId: string; branchId: string; decision: string; occurredAt: string };
      if (value.decision === "blocked") continue;
      const key = `${value.memberId}|${value.branchId}`;
      if ((latest.get(key)?.occurredAt ?? "") < value.occurredAt) latest.set(key, { organizationId: row.organizationId, memberId: value.memberId, branchPublicId: value.branchId, branchId: row.branchId, occurredAt: value.occurredAt });
    }
    for (const visit of latest.values()) await recordMemberVisit(ctx, visit);
    const now = Date.now();
    await ctx.db.insert("maintenanceState", { key: "member_visit_summary_v1", status: "completed", processedCount: latest.size, updatedAt: now, completedAt: now });
  });
}

export interface ReadCost { documentsRead: number; indexRanges: number; megabytesRead: number; withinConvexLimits: boolean }

/** Documents, index ranges and bytes one Convex transaction reads; Convex refuses past 32,000 / 4,096 / 16 MiB. */
export async function readCost(run: () => Promise<unknown>): Promise<ReadCost> {
  const reads = vi.spyOn(TransactionMetricsTracker.prototype, "trackRead");
  const ranges = vi.spyOn(TransactionMetricsTracker.prototype, "trackIndexRange");
  try {
    await run();
    const bytesRead = reads.mock.calls.reduce((sum, [bytes]) => sum + bytes, 0);
    return {
      documentsRead: reads.mock.calls.length,
      indexRanges: ranges.mock.calls.length,
      megabytesRead: Math.round((bytesRead / (1 << 20)) * 10) / 10,
      withinConvexLimits: reads.mock.calls.length <= 32_000 && ranges.mock.calls.length <= 4_096 && bytesRead <= 16 * (1 << 20),
    };
  } finally {
    reads.mockRestore();
    ranges.mockRestore();
  }
}
