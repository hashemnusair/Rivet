import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

const NOW = new Date("2026-10-22T08:30:00.000Z");
const ORG = "col-org";
const MAIN = "col-main";
const OTHER = "col-other";
const op = (operation: string, input: Record<string, unknown> = {}, activeBranchId = MAIN) => ({ operation, input, correlationId: `cor-col-${operation}`, organizationId: ORG, activeBranchId });

type Result = { available: boolean; reason?: string; considered?: number; items?: Array<{ memberId: string; outstandingMinor: number; daysOverdue: number; draft?: { template: string; text: string }; noDraftReason?: string; lastPayment?: { receiptNumber?: string } }> };

async function seed(t: TestConvex<typeof schema>, tenantMode: "prepare" | "off" = "prepare"): Promise<void> {
  await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Collect Gym", slug: "collect-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const other = await ctx.db.insert("branches", { organizationId: org, publicId: OTHER, name: "Other", code: "OTH", active: true, status: "active", createdAt: now, updatedAt: now });
    const person = async (publicId: string, role: "owner" | "receptionist" | "trainer", branchIds = [main]) => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@col.example`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds, branchScope: role === "owner" ? "all" : "selected", active: true, createdAt: now, updatedAt: now });
    };
    await person("col-owner", "owner", [main, other]);
    await person("col-desk", "receptionist");
    await person("col-trainer", "trainer");
    const rec = (entityType: string, publicId: string, branchId: typeof main, value: Record<string, unknown>, memberPublicId?: string) => ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId, ...(memberPublicId ? { memberPublicId } : {}), createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value } });
    await rec("settings", "settings", main, { operationalPolicies: {} });
    const member = (id: string, branch: typeof main, branchPublic: string, value: Record<string, unknown> = {}) => rec("member", id, branch, { fullName: id, homeBranchId: branchPublic, status: "active", phone: "+962790000000", ...value }, id);
    await member("due-today", main, MAIN);
    await member("long-overdue", main, MAIN, { preferredLanguage: "ar" });
    await member("opted-out", main, MAIN, { marketingPreferenceStatus: "explicit_opt_out" });
    await member("paid-up", main, MAIN);
    await member("other-branch", other, OTHER);
    const charge = (id: string, memberId: string, branch: typeof main, dueDate: string, outstanding: number) => rec("charge", id, branch, { memberId, total: { amount: outstanding, currency: "JOD" }, outstandingAmount: { amount: outstanding, currency: "JOD" }, status: outstanding ? "unpaid" : "paid", issueDate: dueDate, dueDate }, memberId);
    await charge("ch-1", "due-today", main, "2026-10-22", 25_000);
    await charge("ch-2", "long-overdue", main, "2026-09-01", 40_000);
    await charge("ch-3", "opted-out", main, "2026-10-22", 10_000);
    await charge("ch-4", "paid-up", main, "2026-10-01", 0);
    await charge("ch-5", "other-branch", other, "2026-10-01", 15_000);
    await charge("ch-6", "due-today", main, "2026-11-30", 5_000);
    await rec("payment", "pay-1", main, { memberId: "long-overdue", type: "payment", status: "completed", method: "cash", amount: { amount: 20_000, currency: "JOD" }, receiptId: "rc-1", receiptNumber: "R-0101", occurredAt: "2026-08-01T09:00:00.000Z" }, "long-overdue");
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode, externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
  });
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("RIVET_AI_MODE", "fixture"); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("collections preparation", () => {
  it("lists collectible balances in the branch, oldest first, with the last receipt and truthful drafts only", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const result = await t.withIdentity({ subject: "clerk-col-desk" }).query(api.domain.query, op("ai.collections.prepare")) as Result;
    expect(result.available).toBe(true);
    expect(result.items!.map((item) => item.memberId)).toEqual(["long-overdue", "due-today", "opted-out"]);
    const [old, today, optedOut] = result.items!;
    expect(old).toMatchObject({ outstandingMinor: 40_000, daysOverdue: 51, noDraftReason: "no_matching_template", lastPayment: { receiptNumber: "R-0101" } });
    // The bill due next month is not collectible yet and is not counted.
    expect(today).toMatchObject({ outstandingMinor: 25_000, draft: { template: "payment_due_today" } });
    expect(optedOut).toMatchObject({ noDraftReason: "opted_out" });
    expect(optedOut!.draft).toBeUndefined();
  });

  it("works in preparation mode, saves nothing, and is refused to staff who cannot collect", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const before = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).length);
    await t.withIdentity({ subject: "clerk-col-owner" }).query(api.domain.query, op("ai.collections.prepare"));
    expect(await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).length)).toBe(before);
    expect(await t.withIdentity({ subject: "clerk-col-trainer" }).query(api.domain.query, op("ai.collections.prepare"))).toMatchObject({ available: false, reason: "permission_denied" });
  });

  it("stays off until the gym turns assistance on", async () => {
    const t = convexTest(schema, modules);
    await seed(t, "off");
    expect(await t.withIdentity({ subject: "clerk-col-owner" }).query(api.domain.query, op("ai.collections.prepare"))).toMatchObject({ available: false, reason: "tenant_off" });
  });
});
