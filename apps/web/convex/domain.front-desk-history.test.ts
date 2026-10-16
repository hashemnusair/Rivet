import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { A, B, NOW, seedHistory, summariseVisits, type Ids } from "./history-fixture.test-support";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

/**
 * Pins the front desk and CRM reads that stopped reading a gym's whole
 * history (check-in lists, occupancy, member lists and profiles, the leads
 * list, the at-risk and renewal queues, check-in search) to their output over
 * the shared history gym. The snapshot was recorded with the code that read
 * every check-in and timeline event; the new reads must give the same answer
 * both before and after the member-visit backfill.
 */
type View = { name: string; subject: string; operation: string; input: Record<string, unknown>; activeBranchId?: string };
const TODAY = NOW.slice(0, 10);
const VIEWS: View[] = [
  { name: "reception today, branch A", subject: "clerk-dash-desk", operation: "checkins.list", input: { branchId: A, date: TODAY, acceptedOnly: true, page: 1, pageSize: 25 } },
  { name: "check-ins on a past day, owner", subject: "clerk-dash-owner", operation: "checkins.list", input: { date: "2026-09-25", page: 1, pageSize: 50 } },
  { name: "check-ins since, branch-A manager", subject: "clerk-dash-manager-a", operation: "checkins.list", input: { since: "2026-10-09T00:00:00.000Z", page: 1, pageSize: 50 } },
  { name: "member check-in tab", subject: "clerk-dash-owner", operation: "checkins.list", input: { memberId: "dm-active-a", page: 2, pageSize: 10 } },
  { name: "member with no check-ins", subject: "clerk-dash-owner", operation: "checkins.list", input: { memberId: "dm-never", page: 1, pageSize: 20 } },
  { name: "all check-ins, page 3", subject: "clerk-dash-owner", operation: "checkins.list", input: { page: 3, pageSize: 10 } },
  { name: "occupancy A", subject: "clerk-dash-desk", operation: "checkins.occupancy", input: { branchId: A } },
  { name: "occupancy B", subject: "clerk-dash-owner", operation: "checkins.occupancy", input: { branchId: B } },
  { name: "members list, owner", subject: "clerk-dash-owner", operation: "members.list", input: { page: 1, pageSize: 50 } },
  { name: "members list by last visit, branch-A manager", subject: "clerk-dash-manager-a", operation: "members.list", input: { page: 1, pageSize: 50, sort: "lastCheckInAt" } },
  { name: "profile with merged visits", subject: "clerk-dash-owner", operation: "members.get", input: { memberId: "dm-inactive-a" } },
  { name: "profile never visited", subject: "clerk-dash-owner", operation: "members.get", input: { memberId: "dm-never" } },
  { name: "profile roamer, branch-A manager", subject: "clerk-dash-manager-a", operation: "members.get", input: { memberId: "dm-roamer" } },
  { name: "leads list", subject: "clerk-dash-owner", operation: "leads.list", input: { page: 1, pageSize: 50 } },
  { name: "leads list, sales at A", subject: "clerk-dash-sales", operation: "leads.list", input: { page: 1, pageSize: 50 }, activeBranchId: A },
  { name: "at-risk queue, owner", subject: "clerk-dash-owner", operation: "retention.queue", input: { page: 1, pageSize: 50 } },
  { name: "at-risk queue, branch-A manager", subject: "clerk-dash-manager-a", operation: "retention.queue", input: { page: 1, pageSize: 50 } },
  { name: "at-risk queue, sales at A", subject: "clerk-dash-sales", operation: "retention.queue", input: { page: 1, pageSize: 50 }, activeBranchId: A },
  { name: "renewals expiring", subject: "clerk-dash-owner", operation: "renewal.queue", input: { bucket: "expiring", page: 1, pageSize: 50 } },
  { name: "renewals expired", subject: "clerk-dash-owner", operation: "renewal.queue", input: { bucket: "expired", page: 1, pageSize: 50 } },
  { name: "check-in search, regular", subject: "clerk-dash-desk", operation: "checkins.preview", input: { branchId: A, query: "DM-ACTIVE-A" } },
  { name: "check-in search, merged survivor", subject: "clerk-dash-desk", operation: "checkins.preview", input: { branchId: A, query: "DM-INACTIVE-A" } },
];

/** A duplicate profile merged into Rami, with a visit Rami's summary must count. */
async function addMergedDuplicate(t: TestConvex<typeof schema>, ids: Ids): Promise<void> {
  await t.run(async (ctx) => {
    const at = Date.parse("2026-10-13T10:00:00.000Z");
    const survivor = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", ids.organization).eq("entityType", "member").eq("publicId", "dm-inactive-a")).unique();
    await ctx.db.patch(survivor!._id, { data: { ...(survivor!.data as Record<string, unknown>), mergedMemberIds: ["dm-dup"] } });
    await ctx.db.insert("domainRecords", { organizationId: ids.organization, entityType: "member", publicId: "dm-dup", branchId: ids.branchA, memberPublicId: "dm-dup", createdAt: at, updatedAt: at, data: { id: "dm-dup", fullName: "Rami K.", memberNumber: "DM-DUP", phone: "+962790000099", homeBranchId: A, status: "archived", mergedIntoMemberId: "dm-inactive-a", createdAt: "2026-06-01T08:00:00.000Z" } });
    await ctx.db.insert("domainRecords", { organizationId: ids.organization, entityType: "checkIn", publicId: "ci-dup", branchId: ids.branchA, memberPublicId: "dm-dup", createdAt: at, updatedAt: at, data: { id: "ci-dup", memberId: "dm-dup", memberName: "Rami K.", memberNumber: "DM-DUP", branchId: A, branchName: "Abdoun", decision: "allowed", reasonCodes: ["OK"], actorId: "dash-desk", actorName: "Hala Desk", occurredAt: "2026-10-13T10:00:00.000Z" } });
  });
}

async function views(t: TestConvex<typeof schema>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const view of VIEWS) out[view.name] = await t.withIdentity({ subject: view.subject }).query(api.domain.query, { operation: view.operation, input: view.input, correlationId: `cor-front-desk-${view.operation}`, activeBranchId: view.activeBranchId });
  return out;
}

afterEach(() => vi.useRealTimers());

describe("front desk and CRM reads over a gym with history", () => {
  it("answer exactly as when they read every check-in and timeline event, before and after the visit backfill", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await addMergedDuplicate(t, await seedHistory(t));
    const before = await views(t);
    expect(before).toMatchSnapshot();
    await summariseVisits(t);
    expect(await views(t)).toEqual(before);
  }, 60_000);

  it("still refuses a second scan within the duplicate window, and lets in a member on a first visit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedHistory(t);
    await summariseVisits(t);
    const desk = t.withIdentity({ subject: "clerk-dash-desk" });
    const create = (memberId: string) => desk.mutation(api.domain.mutate, { operation: "checkins.create", input: { branchId: A, memberId }, correlationId: "cor-front-desk-create" }) as Promise<Record<string, unknown>>;
    const first = await create("dm-inactive-a");
    expect(first.decision).not.toBe("blocked");
    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));
    expect(await create("dm-inactive-a")).toMatchObject({ decision: "blocked", reasonCodes: ["DUPLICATE_SCAN"] });
    vi.setSystemTime(new Date(Date.parse(NOW) + 3 * 60_000));
    expect((await create("dm-inactive-a")).reasonCodes).not.toContain("DUPLICATE_SCAN");
    const profile = await desk.query(api.domain.query, { operation: "members.get", input: { memberId: "dm-inactive-a" }, correlationId: "cor-front-desk-profile" }) as Record<string, unknown>;
    expect(profile.lastCheckInAt).toBe(new Date(Date.parse(NOW) + 3 * 60_000).toISOString());
  }, 60_000);
});
