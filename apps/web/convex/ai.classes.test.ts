import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Thursday 22 October 2026, 11:30 in Amman.
const NOW = new Date("2026-10-22T08:30:00.000Z");
const ORG = "cls-org";
const MAIN = "cls-main";
const op = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-cls-${operation}`, organizationId: ORG, activeBranchId: MAIN });

type Options = { available: boolean; reason?: string; canBook?: boolean; options?: Array<{ occurrenceId: string; name: string; spotsLeft: number; timeOfDay: string }>; excluded?: Record<string, number> };
type Run = { id: string; status: string; errorCategory?: string; results: Array<{ kind: string; id: string }> };

async function seed(t: TestConvex<typeof schema>): Promise<void> {
  await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Class Gym", slug: "class-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const person = async (publicId: string, role: "owner" | "receptionist" | "trainer") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@cls.example`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds: [main], branchScope: role === "owner" ? "all" : "selected", active: true, createdAt: now, updatedAt: now });
    };
    await person("cls-owner", "owner");
    await person("cls-desk", "receptionist");
    await person("cls-trainer", "trainer");
    const rec = (entityType: string, publicId: string, value: Record<string, unknown>, memberPublicId?: string) => ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId: main, ...(memberPublicId ? { memberPublicId } : {}), createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value } });
    await rec("settings", "settings", { operationalPolicies: { classBooking: { enabled: true, eligibilityMode: "all_active_memberships", eligiblePlanIds: [], bookingHorizonDays: 30, cancellationCutoffHours: 2, maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 4, noShowTracking: true } } });
    await rec("plan", "plan-all", { name: "All access", status: "active", branchAccess: "all", branchIds: [] });
    for (const [id, gender] of [["mem-lina", "female"], ["mem-omar", "male"], ["mem-other", "female"]] as const) {
      await rec("member", id, { fullName: id, memberNumber: id, status: "active", gender, homeBranchId: MAIN }, id);
      await rec("membership", `ms-${id}`, { memberId: id, planId: "plan-all", homeBranchId: MAIN, startDate: "2026-09-01", endDate: "2026-12-31" }, id);
    }
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: "execute", externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
  });
  const owner = t.withIdentity({ subject: "clerk-cls-owner" });
  // Friday 23 October: evening mixed spin with one spot; women-only morning yoga.
  await owner.mutation(api.domain.mutate, op("classes.session.upsert", { branchId: MAIN, name: "Evening spin", dayOfWeek: 5, startMinute: 18 * 60, durationMinutes: 60, capacity: 1, audience: "mixed" }));
  await owner.mutation(api.domain.mutate, op("classes.session.upsert", { branchId: MAIN, name: "Women's yoga", dayOfWeek: 5, startMinute: 9 * 60, durationMinutes: 60, capacity: 10, audience: "women" }));
}

async function options(t: TestConvex<typeof schema>, subject: string, memberId: string, timeOfDay?: string): Promise<Options> {
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.classes.options", { memberId, ...(timeOfDay ? { timeOfDay } : {}) })) as Options;
}

async function book(t: TestConvex<typeof schema>, subject: string, memberId: string, occurrenceKey: string, requestKey: string): Promise<Run> {
  const started = await t.withIdentity({ subject }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "class_finder", params: { memberId, book: true, occurrenceKey }, requestKey })) as Run;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.run.get", { runId: started.id })) as Run;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("RIVET_AI_MODE", "fixture"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("class finder", () => {
  it("lists classes the member can take, respecting audience, and filters by time of day", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const lina = await options(t, "clerk-cls-desk", "mem-lina");
    expect(lina.options!.map((option) => option.name)).toEqual(["Women's yoga", "Evening spin"]);
    expect(lina.canBook).toBe(true);
    const omar = await options(t, "clerk-cls-desk", "mem-omar");
    expect(omar.options!.map((option) => option.name)).toEqual(["Evening spin"]);
    expect(omar.excluded).toMatchObject({ audience: 1 });
    expect((await options(t, "clerk-cls-desk", "mem-lina", "evening")).options!.map((option) => option.name)).toEqual(["Evening spin"]);
  });

  it("books through the roster rules and reads the booking back", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const spin = (await options(t, "clerk-cls-desk", "mem-lina", "evening")).options![0]!;
    const run = await book(t, "clerk-cls-desk", "mem-lina", spin.occurrenceId, "class-request-1");
    expect(run).toMatchObject({ status: "completed", results: [expect.objectContaining({ kind: "class_booking", id: spin.occurrenceId })] });
    expect((await options(t, "clerk-cls-desk", "mem-lina", "evening")).excluded).toMatchObject({ already_booked: 1 });
  });

  it("stops instead of joining a waitlist when the last spot went after listing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const spin = (await options(t, "clerk-cls-desk", "mem-lina", "evening")).options![0]!;
    // Someone else takes the only spot first.
    await t.withIdentity({ subject: "clerk-cls-desk" }).mutation(api.domain.mutate, op("classes.occurrence.roster.add", { occurrenceId: spin.occurrenceId, memberId: "mem-other" }));
    const run = await book(t, "clerk-cls-desk", "mem-lina", spin.occurrenceId, "class-request-2");
    expect(run).toMatchObject({ status: "failed", errorCategory: "source_changed" });
    const roster = await t.run(async (ctx) => (await ctx.db.query("classBookings").collect()).map((row) => `${row.memberPublicId}:${row.status}`));
    expect(roster).toEqual(["mem-other:booked"]);
  });

  it("lets a trainer look but not book", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const view = await options(t, "clerk-cls-trainer", "mem-lina");
    expect(view.canBook).toBe(false);
    const run = await book(t, "clerk-cls-trainer", "mem-lina", view.options![0]!.occurrenceId, "class-request-3");
    expect(run).toMatchObject({ status: "failed", errorCategory: "permission_denied" });
    expect(await t.run(async (ctx) => (await ctx.db.query("classBookings").collect()).length)).toBe(0);
  });
});
