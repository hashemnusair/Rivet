import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-auth-${name}`, ...extra });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "org-auth-a", name: "Auth Gym A", slug: "auth-gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: "org-auth-b", name: "Auth Gym B", slug: "auth-gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "auth-branch-a", name: "A Main", code: "A", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchA2 = await ctx.db.insert("branches", { organizationId: orgA, publicId: "auth-branch-a2", name: "A Secondary", code: "A2", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "auth-branch-b", name: "B Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, role: "owner" | "manager" | "sales" | "receptionist" | "trainer", subject = `clerk-${publicId}`) => {
      const userId = await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId, role, branchIds: role === "owner" || role === "manager" ? [branchA, branchA2] : [branchA], active: true, branchScope: role === "owner" || role === "manager" ? "all" : "selected", createdAt: now, updatedAt: now });
      return userId;
    };
    await user("auth-owner", "owner");
    await user("auth-manager", "manager");
    await user("auth-sales", "sales");
    await user("auth-reception", "receptionist");
    await user("auth-trainer", "trainer");
    const foreign = await ctx.db.insert("users", { publicId: "auth-foreign", authSubject: "clerk-auth-foreign", email: "foreign@example.com", fullName: "Foreign Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgB, userId: foreign, role: "owner", branchIds: [branchB], active: true, branchScope: "all", createdAt: now, updatedAt: now });
  });
}

describe("Convex authorization matrix", () => {
  it("returns only accepted check-ins from the requested tenant-local business date", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-auth-a")).unique();
      const branch = organization
        ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "auth-branch-a")).unique()
        : null;
      if (!organization || !branch) throw new Error("authorization fixtures missing");
      const insert = async (publicId: string, decision: "allowed" | "blocked", occurredAt: string) => {
        const now = Date.now();
        await ctx.db.insert("domainRecords", {
          organizationId: organization._id,
          entityType: "checkIn",
          publicId,
          branchId: branch._id,
          memberPublicId: "auth-member",
          data: { id: publicId, memberId: "auth-member", memberName: "Auth Member", memberNumber: "A-100", branchId: "auth-branch-a", branchName: "A Main", decision, reasonCodes: decision === "allowed" ? ["OK"] : ["MEMBERSHIP_EXPIRED"], occurredAt },
          createdAt: now,
          updatedAt: now,
        });
      };
      await insert("checkin-today-allowed", "allowed", "2026-08-12T08:00:00.000Z");
      await insert("checkin-today-blocked", "blocked", "2026-08-12T09:00:00.000Z");
      await insert("checkin-yesterday-allowed", "allowed", "2026-08-11T08:00:00.000Z");
    });

    const owner = t.withIdentity({ subject: "clerk-auth-owner" });
    const result = await owner.query(api.domain.query, operation("checkins.list", { branchId: "auth-branch-a", date: "2026-08-12", acceptedOnly: true, pageSize: 100 })) as { items: Array<{ id: string; decision: string }> };

    expect(result.items).toEqual([expect.objectContaining({ id: "checkin-today-allowed", decision: "allowed" })]);
  });

  it("keeps selected branches, tenants, members and leads isolated", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const reception = t.withIdentity({ subject: "clerk-auth-reception" });
    const trainer = t.withIdentity({ subject: "clerk-auth-trainer" });
    const foreign = t.withIdentity({ subject: "clerk-auth-foreign" });

    await expectCode(reception.query(api.domain.query, operation("members.list", { branchId: "auth-branch-a2" })), "FORBIDDEN");
    await expectCode(reception.query(api.domain.query, operation("leads.list", { branchId: "auth-branch-a2" })), "FORBIDDEN");
    await expectCode(reception.query(api.domain.query, operation("members.list", {}, { organizationId: "org-auth-b" })), "FORBIDDEN");
    await expectCode(foreign.query(api.domain.query, operation("members.list", {}, { organizationId: "org-auth-a" })), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("members.create", { fullName: "Should fail", phone: "+962790000001", homeBranchId: "auth-branch-a" })), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("leads.create", { fullName: "Should fail", phone: "+962790000002", branchId: "auth-branch-a" })), "FORBIDDEN");
    await expectCode(trainer.mutation(api.domain.mutate, operation("members.note", { memberId: "missing-member", body: "Should fail" })), "FORBIDDEN");
  });

  it("requires an explicit branch for selected multi-branch actors while keeping All branches read-only", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-auth-owner" });
    const reception = t.withIdentity({ subject: "clerk-auth-reception" });

    const allBranches = await owner.query(api.domain.query, operation("branches.list")) as Array<{ id: string }>;
    expect(allBranches.map((branch) => branch.id)).toEqual(expect.arrayContaining(["auth-branch-a", "auth-branch-a2"]));

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-auth-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "auth-reception")).unique();
      if (!organization || !user) throw new Error("authorization fixtures missing");
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).unique();
      const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
      if (!membership || branches.length < 2) throw new Error("multi-branch fixture missing");
      await ctx.db.patch(membership._id, { branchIds: branches.slice(0, 2).map((branch) => branch._id), branchScope: "selected", updatedAt: Date.now() });
    });

    await expectCode(reception.query(api.domain.query, operation("session")), "ORGANIZATION_SELECTION_REQUIRED");
    const selected = await reception.query(api.domain.query, operation("session", {}, { activeBranchId: "auth-branch-a" })) as { activeBranchId?: string };
    expect(selected.activeBranchId).toBe("auth-branch-a");
    await expectCode(reception.query(api.domain.query, operation("members.list")), "ORGANIZATION_SELECTION_REQUIRED");
  });

  it("fails closed for stale, inactive, and foreign active-branch selections", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-auth-owner" });

    await expectCode(owner.query(api.domain.query, operation("session", {}, { activeBranchId: "auth-branch-not-real" })), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, operation("members.list", { branchId: "auth-branch-not-real" })), "NOT_FOUND");
    await expectCode(owner.query(api.domain.query, operation("members.list", { branchId: "auth-branch-b" })), "NOT_FOUND");

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-auth-a")).unique();
      const branch = organization
        ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "auth-branch-a")).unique()
        : null;
      if (!branch) throw new Error("authorization branch fixture missing");
      await ctx.db.patch(branch._id, { active: false, status: "inactive", updatedAt: Date.now() });
    });
    await expectCode(owner.query(api.domain.query, operation("session", {}, { activeBranchId: "auth-branch-a" })), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, operation("members.list", { branchId: "auth-branch-a" })), "NOT_FOUND");
  });

  it("blocks finance, cash, check-in, staff and privilege escalation actions by role", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const reception = t.withIdentity({ subject: "clerk-auth-reception" });
    const sales = t.withIdentity({ subject: "clerk-auth-sales" });
    const manager = t.withIdentity({ subject: "clerk-auth-manager" });
    const owner = t.withIdentity({ subject: "clerk-auth-owner" });

    for (const action of ["payments.refund", "payments.void", "checkins.override", "shifts.review", "roles.update", "users.update"]) {
      await expectCode(reception.mutation(api.domain.mutate, operation(action, { reason: "No privilege", paymentId: "missing", auditEventId: "missing", shiftId: "missing", role: "salesperson", userId: "missing" })), "FORBIDDEN");
    }
    await expectCode(sales.mutation(api.domain.mutate, operation("payments.refund", { paymentId: "missing", reason: "No privilege" })), "FORBIDDEN");
    await expectCode(sales.mutation(api.domain.mutate, operation("payments.void", { paymentId: "missing", reason: "No privilege" })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("users.update", { userId: "auth-sales", role: "owner", branchScope: "all" })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("roles.update", { role: "salesperson", permissions: ["users.manage"] })), "FORBIDDEN");
    await expectCode(sales.mutation(api.domain.mutate, operation("shifts.open", { branchId: "auth-branch-a", openingFloat: { amount: 0, currency: "JOD" } })), "FORBIDDEN");

    // The owner has the permission, so a missing record reaches the resource
    // boundary rather than being rejected by the role gate.
    await expectCode(owner.mutation(api.domain.mutate, operation("payments.refund", { paymentId: "missing", reason: "Owner verification", idempotencyKey: "missing-owner-refund" })), "NOT_FOUND");
    await expectCode(owner.mutation(api.domain.mutate, operation("payments.void", { paymentId: "missing", reason: "Owner verification", idempotencyKey: "missing-owner-void" })), "NOT_FOUND");
    await expectCode(owner.mutation(api.domain.mutate, operation("checkins.override", { branchId: "auth-branch-a", memberId: "missing", reason: "Owner verification" })), "NOT_FOUND");
  });
});
