import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSION_CATALOG_VERSION } from "./permissions";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-permission-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "permission-org", name: "Permission Gym", slug: "permission-gym", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "permission-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const createUser = async (publicId: string, role: "owner" | "manager" | "sales" | "receptionist" | "trainer" | "auditor") => {
      const user = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: user, role, branchIds: [branch], branchScope: role === "owner" || role === "manager" ? "all" : "selected", active: true, createdAt: now, updatedAt: now });
      return user;
    };
    await createUser("permission-owner", "owner");
    await createUser("permission-manager", "manager");
    await createUser("permission-sales", "sales");
    await createUser("permission-receptionist", "receptionist");
    await createUser("permission-trainer", "trainer");
    await createUser("permission-auditor", "auditor");
  });
  return {
    t,
    owner: t.withIdentity({ subject: "clerk-permission-owner" }),
    manager: t.withIdentity({ subject: "clerk-permission-manager" }),
    auditor: t.withIdentity({ subject: "clerk-permission-auditor" }),
  };
}

describe("permission catalog compatibility and write boundaries", () => {
  it("keeps legacy role rows compatible with product capabilities added before catalog versioning", async () => {
    const { t, manager } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "permission-org")).unique();
      if (!organization) throw new Error("permission fixture missing organization");
      await ctx.db.insert("roleDefinitions", {
        organizationId: organization._id,
        role: "manager",
        label: "Legacy manager",
        description: "Pre-catalog manager",
        permissions: ["members.read"],
        discountLimitMinor: 50_000,
        isSystem: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    const session = await manager.query(api.domain.query, operation("session")) as { permissions: string[] };
    expect(session.permissions).toEqual(expect.arrayContaining(["operations.manage", "accounting.post", "pt.manage", "pt.refund", "pt.reports.read"]));
    const product = await manager.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "LEGACY", name: "Legacy stock", unit: "each", reorderPoint: 1 })) as { id: string };
    expect(product.id).toBeTruthy();
    await expect(manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh"))).resolves.toMatchObject({ scanned: 0 });

    const legacyRoles = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "permission-org")).unique();
      if (!organization) throw new Error("permission fixture missing organization");
      return await Promise.all((["sales", "receptionist", "trainer"] as const).map(async (role) => {
        const existing = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", organization._id).eq("role", role)).unique();
        if (existing) await ctx.db.delete(existing._id);
        await ctx.db.insert("roleDefinitions", {
          organizationId: organization._id,
          role,
          label: `Legacy ${role}`,
          description: "Pre-catalog role",
          permissions: ["members.read"],
          discountLimitMinor: 0,
          isSystem: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return role;
      }));
    });
    expect(legacyRoles).toEqual(["sales", "receptionist", "trainer"]);

    const roleSessions = await Promise.all([
      t.withIdentity({ subject: "clerk-permission-sales" }).query(api.domain.query, operation("session")),
      t.withIdentity({ subject: "clerk-permission-receptionist" }).query(api.domain.query, operation("session")),
      t.withIdentity({ subject: "clerk-permission-trainer" }).query(api.domain.query, operation("session")),
    ]) as Array<{ permissions: string[] }>;
    expect(roleSessions[0]!.permissions).toEqual(expect.arrayContaining(["pt.book_for_member"]));
    expect(roleSessions[1]!.permissions).toEqual(expect.arrayContaining(["pt.book_for_member"]));
    expect(roleSessions[2]!.permissions).toEqual(expect.arrayContaining(["pt.schedule.self", "pt.outcome.self"]));
  });

  it("enforces omissions after an owner edits a current-version manager role", async () => {
    const { t, owner, manager } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "permission-org")).unique();
      if (!organization) throw new Error("permission fixture missing organization");
      const definition = DEFAULT_ROLE_DEFINITIONS.manager;
      await ctx.db.insert("roleDefinitions", { organizationId: organization._id, role: "manager", label: definition.label, description: definition.description, permissions: definition.permissions, catalogVersion: PERMISSION_CATALOG_VERSION, discountLimitMinor: definition.discountLimitMinor, isSystem: true, createdAt: Date.now(), updatedAt: Date.now() });
    });
    await owner.mutation(api.domain.mutate, operation("roles.update", { role: "manager", permissions: ["members.read", "accounting.post"] }));
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "NO-OPERATIONS", name: "Blocked stock", unit: "each" })), "FORBIDDEN");
    await owner.mutation(api.domain.mutate, operation("roles.update", { role: "manager", permissions: ["members.read", "operations.manage"] }));
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh")), "FORBIDDEN");
  });

  it("keeps auditors read-only for finance and operations", async () => {
    const { auditor } = await seeded();
    await expectCode(auditor.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "AUDITOR", name: "Blocked stock", unit: "each" })), "FORBIDDEN");
    await expectCode(auditor.mutation(api.domain.mutate, operation("accounting.source_postings.refresh")), "FORBIDDEN");
    await expectCode(auditor.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "missing", idempotencyKey: "auditor-post" })), "FORBIDDEN");
  });
});
