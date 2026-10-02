import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const op = (operation: string, input: Record<string, unknown>) => ({ operation, input, organizationId: "gym-a" });
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const now = Date.now();
    const org = await ctx.db.insert("organizations", { publicId: "gym-a", name: "Gym A", slug: "gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const other = await ctx.db.insert("organizations", { publicId: "gym-b", name: "Gym B", slug: "gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "a", name: "A", code: "A", active: true, createdAt: now, updatedAt: now });
    const restricted = await ctx.db.insert("branches", { organizationId: org, publicId: "restricted", name: "Restricted", code: "R", active: true, createdAt: now, updatedAt: now });
    const foreign = await ctx.db.insert("branches", { organizationId: other, publicId: "foreign", name: "B", code: "B", active: true, createdAt: now, updatedAt: now });
    for (const role of ["owner", "manager", "receptionist"] as const) {
      const user = await ctx.db.insert("users", { authSubject: role, publicId: role, email: `${role}@example.com`, fullName: role, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: user, role, branchScope: role === "owner" ? "all" : "selected", branchIds: [branch], active: true, createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("domainRecords", { organizationId: org, branchId: branch, entityType: "member", publicId: "person", memberPublicId: "person", createdAt: now, updatedAt: now, data: { id: "person", homeBranchId: "a", fullName: "Private name", memberNumber: "PRIVATE001", status: "active" } });
    await ctx.db.insert("domainRecords", { organizationId: org, branchId: branch, entityType: "checkIn", publicId: "legacy", memberPublicId: "person", createdAt: now, updatedAt: now, data: { id: "legacy", memberId: "person", branchId: "a", decision: "allowed", occurredAt: new Date(now - 89 * 60_000).toISOString() } });
    return { org, branch, foreign, restricted };
  });
  return { t, ids, owner: t.withIdentity({ subject: "owner" }), manager: t.withIdentity({ subject: "manager" }), reception: t.withIdentity({ subject: "receptionist" }) };
}
afterEach(() => vi.useRealTimers());
describe("attendance access and persistence", () => {
  it("expires legacy presence on a later read without writing a departure", async () => {
    vi.useFakeTimers(); const { t, owner } = await setup();
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 1, capacity: null });
    vi.advanceTimersByTime(60_000);
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 0 });
    expect(await t.run(ctx => ctx.db.query("domainRecords").withIndex("by_entity_type", q => q.eq("entityType", "timeline")).collect())).toHaveLength(0);
  });
  it("enforces staff report/settings permissions and selected-branch and tenant isolation", async () => {
    const { owner, manager, reception, t } = await setup();
    for (const request of [reception.query(api.domain.query, op("attendance.insights", { branchId: "a" })), reception.query(api.domain.query, op("attendance.settings", { branchId: "a" })), manager.query(api.domain.query, op("checkins.occupancy", { branchId: "restricted" })), owner.query(api.domain.query, op("checkins.occupancy", { branchId: "foreign" })), t.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))]) await expect(request).rejects.toThrow();
    await expect(owner.query(api.domain.query, op("attendance.insights", { branchId: "a" }))).resolves.toHaveProperty("curve");
  });
  it("defaults publication off; publishes only an allowlist and revokes immediately", async () => {
    const { t, owner } = await setup();
    const args = { organizationId: "gym-a", branchId: "a", clockBucket: 0 };
    expect(await t.query(internal.attendance.publicSnapshot, args)).toBeNull();
    const settings = { windowMinutes: 60, capacity: 80, timezone: "Asia/Amman", publicEnabled: true, feedMode: "reception" };
    await owner.mutation(api.domain.mutate, op("attendance.settings.save", { branchId: "a", settings }));
    const published = await t.query(internal.attendance.publicSnapshot, args);
    expect(published).toMatchObject({ current: 1, status: "quiet" });
    expect(Object.keys(published!).sort()).toEqual(["version", "current", "status", "availability", "generatedAt", "validUntil", "timezone", "disclosure"].sort());
    expect(JSON.stringify(published)).not.toMatch(/Private name|PRIVATE001|person|capacity|checkInsToday/);
    expect(await t.query(internal.attendance.publicSnapshot, { ...args, branchId: "foreign" })).toBeNull();
    await owner.mutation(api.domain.mutate, op("attendance.settings.save", { branchId: "a", settings: { ...settings, publicEnabled: false } }));
    expect(await t.query(internal.attendance.publicSnapshot, args)).toBeNull();
    const audit = await t.run(ctx => ctx.db.query("auditEvents").collect());
    expect(audit.filter(row => row.action === "attendance.settings.update")).toHaveLength(2);
  });
  it("deduplicates delayed exit events, permits genuine re-entry, and rejects ID payload conflicts", async () => {
    const { t, ids, owner } = await setup();
    const args = { organizationId: ids.org, branchId: ids.branch, personId: "person", eventId: "door-1", source: "adapter-test", kind: "exit" as const, accepted: true, occurredAt: Date.now() - 10_000 };
    expect(await t.mutation(internal.attendance.ingest, args)).toEqual({ duplicate: false });
    expect(await t.mutation(internal.attendance.ingest, args)).toEqual({ duplicate: true });
    await expect(t.mutation(internal.attendance.ingest, { ...args, kind: "entry" })).rejects.toThrow();
    await t.mutation(internal.attendance.ingest, { ...args, kind: "entry", eventId: "door-2", occurredAt: Date.now() });
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 1, checkInsToday: 2 });
    await expect(t.mutation(internal.attendance.ingest, { ...args, branchId: ids.foreign })).rejects.toThrow();
    await expect(t.mutation(internal.attendance.ingest, { ...args, eventId: "future", occurredAt: Date.now() + 1 })).rejects.toThrow();
  });
  it("replays accepted retries after expiry and excludes newly denied attempts", async () => {
    vi.useFakeTimers(); const { owner, t, ids } = await setup();
    const input = { branchId: "a", memberId: "person", idempotencyKey: "attempt-1", reason: "Approved trial entry" };
    const first = await owner.mutation(api.domain.mutate, op("checkins.override", input));
    vi.advanceTimersByTime(91 * 60_000);
    const replay = await owner.mutation(api.domain.mutate, op("checkins.override", input));
    expect(replay).toEqual(first);
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 0 });
    await expect(owner.mutation(api.domain.mutate, op("checkins.override", { ...input, reason: "Different payload" }))).rejects.toThrow();
    const denial = await owner.mutation(api.domain.mutate, op("checkins.create", { branchId: "a", memberId: "person", idempotencyKey: "denied-1" }));
    expect(denial).toMatchObject({ decision: "blocked" });
    vi.advanceTimersByTime(1000);
    expect(await owner.mutation(api.domain.mutate, op("checkins.create", { branchId: "a", memberId: "person", idempotencyKey: "denied-1" }))).toEqual(denial);
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 0 });
    const rows = await t.run(ctx => ctx.db.query("domainRecords").withIndex("by_organization_branch_type", q => q.eq("organizationId", ids.org).eq("branchId", ids.branch).eq("entityType", "checkIn")).collect());
    expect(rows).toHaveLength(3);
  });
  it("keeps capacity cleared instead of restoring a legacy branch default", async () => {
    const { t, ids, owner } = await setup();
    await t.run(ctx => ctx.db.patch(ids.branch, { capacity: 120 }));
    await owner.mutation(api.domain.mutate, op("attendance.settings.save", { branchId: "a", settings: { windowMinutes: 90, timezone: "Asia/Amman", publicEnabled: false, feedMode: "reception" } }));
    expect(await owner.query(api.domain.query, op("attendance.settings", { branchId: "a" }))).not.toHaveProperty("capacity");
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ capacity: null, status: "learning" });
  });
  it("uses the branch policy at the time of a delayed entry, not its delivery time", async () => {
    vi.useFakeTimers(); const { t, ids, owner } = await setup();
    await owner.mutation(api.domain.mutate, op("attendance.settings.save", { branchId: "a", settings: { windowMinutes: 180, timezone: "Asia/Amman", publicEnabled: false, feedMode: "reception" } }));
    await t.mutation(internal.attendance.ingest, { organizationId: ids.org, branchId: ids.branch, personId: "person", eventId: "delayed", source: "adapter-test", kind: "entry", accepted: true, occurredAt: Date.now() - 100 * 60_000 });
    const event = await t.run(ctx => ctx.db.query("domainRecords").withIndex("by_entity_type", q => q.eq("entityType", "attendanceEvent")).first());
    expect(event?.data.windowMinutes).toBe(90);
    // The earlier delayed entry also suppresses the later legacy scan inside its original window.
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 0 });
  });
  it("requires a heartbeat for an external feed, and never calls a stale feed empty", async () => {
    vi.useFakeTimers(); const { t, ids, owner } = await setup();
    await owner.mutation(api.domain.mutate, op("attendance.settings.save", { branchId: "a", settings: { windowMinutes: 90, timezone: "Asia/Amman", publicEnabled: false, feedMode: "external" } }));
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: null, availability: "stale" });
    await t.mutation(internal.attendance.heartbeat, { organizationId: ids.org, branchId: ids.branch });
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: 1, availability: "available" });
    vi.advanceTimersByTime(121000);
    expect(await owner.query(api.domain.query, op("checkins.occupancy", { branchId: "a" }))).toMatchObject({ current: null, availability: "stale" });
  });
  it("validates public requests and enforces a shared request budget", async () => {
    const { t } = await setup();
    expect((await t.fetch("/api/v1/public/occupancy?organizationId=gym-a&branchId=a")).status).toBe(404);
    expect((await t.fetch("/api/v1/public/occupancy?organizationId=gym-a&branchId=a&memberId=person")).status).toBe(400);
    await t.run(async ctx => { const guard = await ctx.db.query("publicRequestGuards").first(); await ctx.db.patch(guard!._id, { requestCount: 600 }); });
    const response = await t.fetch("/api/v1/public/occupancy?organizationId=gym-a&branchId=a");
    expect(response.status).toBe(429);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
