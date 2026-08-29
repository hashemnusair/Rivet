import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-export", name: "Export Gym", slug: "export-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const foreignOrganization = await ctx.db.insert("organizations", { publicId: "org-foreign", name: "Foreign Gym", slug: "foreign-gym", status: "active", timezone: "UTC", currency: "USD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-export", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-export", authSubject: "clerk-owner-export", email: "owner@example.com", fullName: "Owner Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const auditor = await ctx.db.insert("users", { publicId: "auditor-export", authSubject: "clerk-auditor-export", email: "auditor@example.com", fullName: "Auditor Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: auditor, role: "auditor", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "member-export", branchId: branch, memberPublicId: "member-export", createdAt: now, updatedAt: now, data: { id: "member-export", fullName: "Doe, \"Jane\"", memberNumber: "M-100", phone: "+962790000000", homeBranchId: "branch-export", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: foreignOrganization, entityType: "member", publicId: "foreign-member", createdAt: now, updatedAt: now, data: { id: "foreign-member", fullName: "Must Not Leak", memberNumber: "F-1" } });
  });
}

describe("tenant data exports", () => {
  it("generates escaped, scoped CSV with metadata, idempotency, history, and audit", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-export" });
    const input = { kind: "members", filters: { branchId: "branch-export" }, idempotencyKey: "export-members-001" };
    const first = await owner.mutation(api.domain.mutate, operation("exports.request", input)) as { id: string; rowCount: number; content: string; timezone: string; branchScope: string };
    const replay = await owner.mutation(api.domain.mutate, operation("exports.request", input)) as { id: string };
    expect(first).toMatchObject({ rowCount: 1, timezone: "Asia/Amman", branchScope: "branch:branch-export" });
    expect(first.content).toContain('"Doe, ""Jane"""');
    expect(first.content).toContain("export_generated_at");
    expect(first.content).not.toContain("Must Not Leak");
    expect(replay.id).toBe(first.id);
    const history = await owner.query(api.domain.query, operation("exports.list")) as Array<{ id: string; content?: string }>;
    expect(history).toEqual([expect.objectContaining({ id: first.id, content: expect.any(String) })]);
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "data.export"));
    expect(audit).toEqual([expect.objectContaining({ entityPublicId: first.id, after: expect.objectContaining({ rowCount: 1, timezone: "Asia/Amman" }) })]);
  });

  it("enforces dataset permissions and rejects idempotency-key reuse with different filters", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const auditor = t.withIdentity({ subject: "clerk-auditor-export" });
    await expectCode(auditor.mutation(api.domain.mutate, operation("exports.request", { kind: "operations", idempotencyKey: "export-operations-001" })), "FORBIDDEN");
    const owner = t.withIdentity({ subject: "clerk-owner-export" });
    await owner.mutation(api.domain.mutate, operation("exports.request", { kind: "members", filters: {}, idempotencyKey: "export-members-002" }));
    await expectCode(owner.mutation(api.domain.mutate, operation("exports.request", { kind: "members", filters: { search: "different" }, idempotencyKey: "export-members-002" })), "CONFLICT");
  });
});
