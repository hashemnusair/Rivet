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
    const unavailableOwner = await ctx.db.insert("users", {
      publicId: "identity-unavailable-owner",
      authSubject: "clerk-identity-unavailable-owner",
      email: "unavailable-owner@identity.example",
      fullName: "Unavailable Owner",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const pendingOperator = await ctx.db.insert("users", {
      publicId: "identity-pending-operator",
      authSubject: "clerk-identity-pending-operator",
      email: "pending-operator@identity.example",
      fullName: "Pending Operator",
      platformAdmin: false,
      status: "active",
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
      userId: pendingOperator,
      role: "manager",
      branchIds: [activeOrganization.branch],
      branchScope: "all",
      active: true,
      invitationStatus: "pending",
      createdAt: now,
      updatedAt: now,
    });
    for (const { key, organization, branch } of organizations) {
      if (key !== "suspended" && key !== "cancelled") continue;
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization,
        userId: unavailableOwner,
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

  it("marks gym access unavailable instead of presenting suspended staff as a member", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-unavailable-owner" }).query(api.identity.current, {})).resolves.toMatchObject({
      gymAccessUnavailable: true,
      memberships: [],
      user: { id: "identity-unavailable-owner", platformAdmin: false },
    });
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
    const current = await t.withIdentity({ subject: "clerk-identity-admin" }).query(api.users.current, {});
    expect(current).toMatchObject({ publicId: "identity-admin", id: "identity-admin", status: "active" });
    expect(current).not.toHaveProperty("authSubject");
    expect(current).not.toHaveProperty("_id");
    expect(current).not.toHaveProperty("_creationTime");
  });

  it("does not route an active user through a pending invitation", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: "clerk-identity-pending-operator" }).query(api.identity.current, {})).resolves.toMatchObject({
      pending: false,
      gymAccessUnavailable: true,
      invitationClaimEligible: false,
      memberships: [],
    });
  });

  it("marks an existing authenticated user with a pending owner invitation as claim-eligible", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "identity-org")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization!._id)).first();
      const existingMember = await ctx.db.insert("users", {
        publicId: "identity-existing-member-owner",
        authSubject: "clerk-existing-member-owner",
        email: "existing-member-owner@identity.example",
        fullName: "Existing Member Owner",
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization!._id,
        userId: existingMember,
        role: "owner",
        branchIds: [branch!._id],
        branchScope: "all",
        active: true,
        invitationStatus: "pending",
        clerkInvitationId: "identity-existing-member-owner-invitation",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.withIdentity({ subject: "clerk-existing-member-owner" }).query(api.identity.current, {})).resolves.toMatchObject({
      gymAccessUnavailable: true,
      invitationClaimEligible: true,
      memberships: [],
    });
  });

  it("marks revoked and inactive gym memberships unavailable instead of routing them as members", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "identity-org")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "identity-org-branch")).unique();
      for (const [key, subject, invitationStatus, active] of [
        ["revoked", "clerk-identity-revoked-operator", "revoked", true],
        ["inactive", "clerk-identity-inactive-operator", undefined, false],
      ] as const) {
        const user = await ctx.db.insert("users", {
          publicId: `identity-${key}-operator`,
          authSubject: subject,
          email: `${key}@identity.example`,
          fullName: `${key} Operator`,
          platformAdmin: false,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId: organization!._id,
          userId: user,
          role: "receptionist",
          branchIds: [branch!._id],
          active,
          ...(invitationStatus ? { invitationStatus } : {}),
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    for (const subject of ["clerk-identity-revoked-operator", "clerk-identity-inactive-operator"]) {
      await expect(t.withIdentity({ subject }).query(api.identity.current, {})).resolves.toMatchObject({
        gymAccessUnavailable: true,
        memberships: [],
      });
    }
  });

  it("keeps a valid gym membership routable when a second invitation is still pending", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizations = await ctx.db.query("organizations").collect();
      const active = organizations.find((organization) => organization.publicId === "identity-org");
      const trial = organizations.find((organization) => organization.publicId === "identity-trial-org");
      const activeBranch = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", active!._id)).first();
      const trialBranch = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", trial!._id)).first();
      const user = await ctx.db.insert("users", {
        publicId: "identity-valid-with-pending",
        authSubject: "clerk-identity-valid-with-pending",
        email: "valid-with-pending@identity.example",
        fullName: "Valid With Pending",
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: active!._id,
        userId: user,
        role: "manager",
        branchIds: [activeBranch!._id],
        branchScope: "all",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: trial!._id,
        userId: user,
        role: "owner",
        branchIds: [trialBranch!._id],
        branchScope: "all",
        active: true,
        invitationStatus: "pending",
        clerkInvitationId: "pending-secondary-invitation",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.withIdentity({ subject: "clerk-identity-valid-with-pending" }).query(api.identity.current, {})).resolves.toMatchObject({
      gymAccessUnavailable: true,
      memberships: [{ organizationId: "identity-org" }],
    });
  });

  it("requires explicit organization selection when more than one gym is routable", async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    const identity = await t.withIdentity({ subject: "clerk-identity-admin" }).query(api.identity.current, {});
    expect(identity).toMatchObject({ organizationSelectionRequired: true });
    await expect(t.withIdentity({ subject: "clerk-identity-admin" }).query(api.domain.query, {
      operation: "session",
      input: {},
      correlationId: "identity-ambiguous-session",
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "ORGANIZATION_SELECTION_REQUIRED" }) });

    await expect(t.withIdentity({ subject: "clerk-identity-admin" }).query(api.domain.query, {
      operation: "session",
      input: {},
      organizationId: "identity-org",
      correlationId: "identity-explicit-session",
    })).resolves.toMatchObject({ organization: { id: "identity-org" } });
  });

  it("projects selected-scope branch access so login can require a concrete branch", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "identity-org")).unique();
      const firstBranch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "identity-org-branch")).unique();
      const secondBranch = await ctx.db.insert("branches", {
        organizationId: organization!._id,
        publicId: "identity-org-branch-two",
        name: "Second",
        code: "SECOND",
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const user = await ctx.db.insert("users", {
        publicId: "identity-selected-operator",
        authSubject: "clerk-identity-selected-operator",
        email: "selected@identity.example",
        fullName: "Selected Operator",
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization!._id,
        userId: user,
        role: "receptionist",
        branchIds: [firstBranch!._id, secondBranch],
        branchScope: "selected",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.withIdentity({ subject: "clerk-identity-selected-operator" }).query(api.identity.current, {})).resolves.toMatchObject({
      memberships: [{ branchScope: "selected", branches: [{ id: "identity-org-branch" }, { id: "identity-org-branch-two" }] }],
    });
  });
});
