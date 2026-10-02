import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
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
});
