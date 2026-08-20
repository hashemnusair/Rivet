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

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationSeeds = [
      { key: "active", publicId: "identity-org", name: "Identity Gym", slug: "identity-gym", status: "active" },
      { key: "trial", publicId: "identity-trial-org", name: "Trial Identity Gym", slug: "identity-trial-gym", status: "trial" },
      { key: "past_due", publicId: "identity-past-due-org", name: "Past Due Identity Gym", slug: "identity-past-due-gym", status: "past_due" },
      { key: "suspended", publicId: "identity-suspended-org", name: "Suspended Identity Gym", slug: "identity-suspended-gym", status: "suspended" },
      { key: "cancelled", publicId: "identity-cancelled-org", name: "Cancelled Identity Gym", slug: "identity-cancelled-gym", status: "cancelled" },
    ] as const;
    const organizations = await Promise.all(organizationSeeds.map(async ({ key, publicId, name, slug, status }) => {
      const organization = await ctx.db.insert("organizations", {
        publicId,
        name,
        slug,
        status,
        timezone: "Asia/Amman",
        currency: "JOD",
        createdAt: now,
        updatedAt: now,
      });
      const branch = await ctx.db.insert("branches", {
        organizationId: organization,
        publicId: `${publicId}-branch`,
        name: "Main",
        code: "MAIN",
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      return { key, organization, branch };
    }));
    const activeOrganization = organizations.find(({ key }) => key === "active");
    if (!activeOrganization) throw new Error("The identity fixture did not create its active organization.");
    const activeAdmin = await ctx.db.insert("users", {
      publicId: "identity-admin",
      authSubject: "clerk-identity-admin",
      email: "admin@identity.example",
      fullName: "Identity Admin",
      platformAdmin: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const deactivatedAdmin = await ctx.db.insert("users", {
      publicId: "identity-disabled-admin",
      authSubject: "clerk-identity-disabled-admin",
      email: "disabled@identity.example",
      fullName: "Disabled Admin",
      platformAdmin: true,
      status: "deactivated",
      createdAt: now,
      updatedAt: now,
    });
    const invitedAdmin = await ctx.db.insert("users", {
      publicId: "identity-invited-admin",
      authSubject: "clerk-identity-invited-admin",
      email: "invited@identity.example",
      fullName: "Invited Admin",
      platformAdmin: true,
      status: "invited",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: activeOrganization.organization,
      userId: activeAdmin,
      role: "owner",
      branchIds: [activeOrganization.branch],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    for (const { key, organization, branch } of organizations) {
      if (key === "active") continue;
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization,
        userId: activeAdmin,
        role: "owner",
        branchIds: [branch],
        branchScope: "all",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("organizationMemberships", {
      organizationId: activeOrganization.organization,
      userId: deactivatedAdmin,
      role: "owner",
      branchIds: [activeOrganization.branch],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: activeOrganization.organization,
      userId: invitedAdmin,
      role: "owner",
      branchIds: [activeOrganization.branch],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("identity routing projection", () => {
  it("returns platform identity for an active operator", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-admin" }).query(api.identity.current, {})).resolves.toMatchObject({
      pending: false,
      user: { id: "identity-admin", platformAdmin: true },
    });
  });

  it("routes only to active, trial, and past-due organizations", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const result = await t.withIdentity({ subject: "clerk-identity-admin" }).query(api.identity.current, {});
    expect(result?.memberships.map((membership) => membership.organizationStatus).sort()).toEqual(["active", "past_due", "trial"]);
    expect(result?.memberships.some((membership) => membership.organizationStatus === "suspended")).toBe(false);
    expect(result?.memberships.some((membership) => membership.organizationStatus === "cancelled")).toBe(false);
  });

  it("does not advertise role or memberships for a deactivated operator", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-disabled-admin" }).query(api.identity.current, {})).resolves.toBeNull();
  });

  it("does not advertise an unclaimed invited operator", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-invited-admin" }).query(api.identity.current, {})).resolves.toBeNull();
  });

  it("does not expose invited or deactivated accounts through users.current", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-disabled-admin" }).query(api.users.current, {})).resolves.toBeNull();
    await expect(t.withIdentity({ subject: "clerk-identity-invited-admin" }).query(api.users.current, {})).resolves.toBeNull();
    await expect(t.withIdentity({ subject: "clerk-identity-admin" }).query(api.users.current, {})).resolves.toMatchObject({ publicId: "identity-admin", status: "active" });
  });
});
