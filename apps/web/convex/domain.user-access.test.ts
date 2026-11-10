import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown>, organizationId?: string) => ({
  operation: name,
  input,
  ...(organizationId ? { organizationId } : {}),
  correlationId: `cor-user-access-${name}`,
});

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationA = await ctx.db.insert("organizations", {
      publicId: "user-access-org-a",
      name: "User Access A",
      slug: "user-access-a",
      status: "active",
      timezone: "UTC",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const organizationB = await ctx.db.insert("organizations", {
      publicId: "user-access-org-b",
      name: "User Access B",
      slug: "user-access-b",
      status: "active",
      timezone: "UTC",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branchA = await ctx.db.insert("branches", {
      organizationId: organizationA,
      publicId: "user-access-branch-a",
      name: "A Main",
      code: "A",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const branchB = await ctx.db.insert("branches", {
      organizationId: organizationB,
      publicId: "user-access-branch-b",
      name: "B Main",
      code: "B",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const ownerA = await ctx.db.insert("users", {
      publicId: "user-access-owner-a",
      authSubject: "clerk-user-access-owner-a",
      email: "owner-a@user-access.example",
      fullName: "Owner A",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const sharedUser = await ctx.db.insert("users", {
      publicId: "user-access-shared",
      authSubject: "clerk-user-access-shared",
      email: "shared@user-access.example",
      fullName: "Shared Staff",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: organizationA,
      userId: ownerA,
      role: "owner",
      branchIds: [branchA],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const membershipA = await ctx.db.insert("organizationMemberships", {
      organizationId: organizationA,
      userId: sharedUser,
      role: "manager",
      branchIds: [branchA],
      branchScope: "all",
      active: true,
      invitationStatus: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    const membershipB = await ctx.db.insert("organizationMemberships", {
      organizationId: organizationB,
      userId: sharedUser,
      role: "manager",
      branchIds: [branchB],
      branchScope: "all",
      active: true,
      invitationStatus: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    return { organizationA, organizationB, sharedUser, membershipA, membershipB };
  });
}

describe("organization-local staff access", () => {
  it("deactivates and reactivates one organization's membership without changing the shared user account", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-user-access-owner-a" });

    const deactivated = await owner.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-shared", status: "deactivated" }, "user-access-org-a"));
    expect(deactivated).toMatchObject({ id: "user-access-shared", organizationId: "user-access-org-a", status: "deactivated" });

    let state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.sharedUser),
      membershipA: await ctx.db.get(ids.membershipA),
      membershipB: await ctx.db.get(ids.membershipB),
    }));
    expect(state.user?.status).toBe("active");
    expect(state.membershipA?.active).toBe(false);
    expect(state.membershipB?.active).toBe(true);

    const reactivated = await owner.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-shared", status: "active" }, "user-access-org-a"));
    expect(reactivated).toMatchObject({ id: "user-access-shared", organizationId: "user-access-org-a", status: "active" });

    state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.sharedUser),
      membershipA: await ctx.db.get(ids.membershipA),
      membershipB: await ctx.db.get(ids.membershipB),
    }));
    expect(state.user?.status).toBe("active");
    expect(state.membershipA?.active).toBe(true);
    expect(state.membershipB?.active).toBe(true);
  });

  it("keeps at least one owner who can sign in", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-user-access-owner-a" });
    const lastOwner = { code: "CONFLICT", message: "A gym needs at least one owner. Make someone else an owner first." };

    // The only owner cannot demote themselves.
    await expect(owner.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-owner-a", role: "manager" }, "user-access-org-a"))).rejects.toMatchObject({ data: lastOwner });

    // An owner whose invitation is still pending does not count as a second owner.
    await t.run(async (ctx) => await ctx.db.patch(ids.membershipA, { role: "owner", invitationStatus: "pending" }));
    await expect(owner.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-owner-a", role: "manager" }, "user-access-org-a"))).rejects.toMatchObject({ data: lastOwner });

    // With a second accepted owner the change goes through, and that owner is then the last one.
    await t.run(async (ctx) => await ctx.db.patch(ids.membershipA, { invitationStatus: "accepted" }));
    await expect(owner.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-owner-a", role: "manager" }, "user-access-org-a"))).resolves.toMatchObject({ id: "user-access-owner-a" });
    const second = t.withIdentity({ subject: "clerk-user-access-shared" });
    await expect(second.mutation(api.domain.mutate, operation("users.update", { userId: "user-access-shared", role: "manager" }, "user-access-org-a"))).rejects.toMatchObject({ data: lastOwner });
  });

  it("does not reset the access of someone who already works at the gym", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-user-access-owner-a" });
    const invite = (email: string) => owner.mutation(internal.invitations.prepare, {
      organizationId: "user-access-org-a",
      correlationId: "cor-user-access-invite",
      input: { email, name: "Shared Staff", role: "receptionist", branchScope: "selected", branchIds: ["user-access-branch-a"] },
    });

    await expect(invite("shared@user-access.example")).rejects.toMatchObject({ data: { code: "CONFLICT", message: "This person already has access to this gym. Change their role instead." } });
    const untouched = await t.run(async (ctx) => await ctx.db.get(ids.membershipA));
    expect(untouched).toMatchObject({ role: "manager", branchScope: "all", active: true, invitationStatus: "accepted" });

    // Someone whose access was switched off can be invited back.
    await t.run(async (ctx) => await ctx.db.patch(ids.membershipA, { active: false }));
    await expect(invite("shared@user-access.example")).resolves.toBeTruthy();
    const reinvited = await t.run(async (ctx) => await ctx.db.get(ids.membershipA));
    expect(reinvited).toMatchObject({ role: "receptionist", active: true, invitationStatus: "pending" });
  });
});
