import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");

const previousClerkSecret = process.env.CLERK_SECRET_KEY;
afterEach(() => {
  if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = previousClerkSecret;
  vi.unstubAllGlobals();
});

async function seed(t: TestConvex<typeof schema>, invitationStatus: "pending" | "revoked" = "pending") {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      publicId: "users-security-org",
      name: "Users Security Gym",
      slug: "users-security-gym",
      status: "active",
      timezone: "UTC",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branchId = await ctx.db.insert("branches", {
      organizationId,
      publicId: "users-security-branch",
      name: "Main",
      code: "MAIN",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", {
      publicId: "users-security-user",
      authSubject: "invite:owner@users-security.example",
      email: "owner@users-security.example",
      fullName: "Pending Owner",
      platformAdmin: false,
      status: "invited",
      createdAt: now,
      updatedAt: now,
    });
    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
      branchIds: [branchId],
      branchScope: "all",
      active: true,
      invitationStatus,
      clerkInvitationId: "inv-users-security",
      createdAt: now,
      updatedAt: now,
    });
    return { organizationId, userId, membershipId };
  });
}

describe("invitation claim boundary", () => {
  it("does not claim an invited row from an email-only sign-in", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    await expect(t.withIdentity({ subject: "clerk-owner-without-ticket", email: "owner@users-security.example" }).mutation(api.users.ensureCurrent, {})).rejects.toThrow(/INVITATION_NOT_ACCEPTED/);
    const state = await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "users-security-user")).unique();
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", ids.organizationId).eq("userId", user!._id)).unique();
      return { user, membership };
    });
    expect(state.user).toMatchObject({ authSubject: "invite:owner@users-security.example", status: "invited" });
    expect(state.membership?.invitationStatus).toBe("pending");
  });

  it("does not promote an invited row merely because its subject is already real", async () => {
    const t = convexTest(schema, modules);
    const subject = "clerk-invited-real-subject";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        publicId: "users-security-real-invited",
        authSubject: subject,
        email: "real-invited@users-security.example",
        fullName: "Real Subject But Unclaimed",
        platformAdmin: false,
        status: "invited",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(t.withIdentity({ subject, email: "real-invited@users-security.example" }).mutation(api.users.ensureCurrent, {})).rejects.toThrow(/INVITATION_NOT_ACCEPTED/);
    await expect(t.withIdentity({ subject }).query(api.users.current, {})).resolves.toBeNull();
  });

  it("accepts only the verified server claim and makes a retry idempotent", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);

    await expect(t.withIdentity({ subject: "clerk-wrong-identity", email: "owner@users-security.example" }).mutation(internal.users.acceptInvitation, {
      userId: ids.userId,
      membershipId: ids.membershipId,
      subject: "clerk-owner-verified",
      email: "owner@users-security.example",
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "INVITATION_NOT_ACCEPTED" }) });

    await expect(t.mutation(internal.users.acceptInvitation, {
      userId: ids.userId,
      membershipId: ids.membershipId,
      subject: "clerk-owner-verified",
      email: "owner@users-security.example",
    })).resolves.toMatchObject({ claimed: true, id: "users-security-user" });
    await expect(t.mutation(internal.users.acceptInvitation, {
      userId: ids.userId,
      membershipId: ids.membershipId,
      subject: "clerk-owner-verified",
      email: "owner@users-security.example",
    })).resolves.toMatchObject({ claimed: true, id: "users-security-user" });

    await expect(t.withIdentity({ subject: "clerk-owner-verified" }).query(api.users.current, {})).resolves.toMatchObject({ id: "users-security-user", status: "active" });
    const state = await t.run(async (ctx) => {
      const user = await ctx.db.get(ids.userId);
      const membership = await ctx.db.get(ids.membershipId);
      return { user, membership };
    });
    expect(state.user).toMatchObject({ authSubject: "clerk-owner-verified", status: "active" });
    expect(state.membership).toMatchObject({ invitationStatus: "accepted" });
  });

  it("keeps revoked invitations non-routable and non-claimable", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, "revoked");

    await expect(t.mutation(internal.users.acceptInvitation, {
      userId: ids.userId,
      membershipId: ids.membershipId,
      subject: "clerk-owner-revoked",
      email: "owner@users-security.example",
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "INVITATION_REVOKED" }) });
    await expect(t.withIdentity({ subject: "invite:owner@users-security.example" }).query(api.identity.current, {})).resolves.toBeNull();
  });

  it("accepts a second-organization invitation without replacing an existing Clerk identity", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const second = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        publicId: "users-security-org-two",
        name: "Users Security Gym Two",
        slug: "users-security-gym-two",
        status: "active",
        timezone: "UTC",
        currency: "JOD",
        createdAt: now,
        updatedAt: now,
      });
      const membershipId = await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ids.userId,
        role: "manager",
        branchIds: [],
        branchScope: "all",
        active: true,
        invitationStatus: "pending",
        clerkInvitationId: "inv-users-security-two",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(ids.userId, { authSubject: "clerk-existing-owner", status: "active" });
      return { membershipId };
    });

    await expect(t.mutation(internal.users.acceptInvitation, {
      userId: ids.userId,
      membershipId: second.membershipId,
      subject: "clerk-existing-owner",
      email: "owner@users-security.example",
    })).resolves.toMatchObject({ claimed: true });
    const state = await t.run(async (ctx) => ({ user: await ctx.db.get(ids.userId), membership: await ctx.db.get(second.membershipId) }));
    expect(state.user).toMatchObject({ authSubject: "clerk-existing-owner", status: "active" });
    expect(state.membership).toMatchObject({ invitationStatus: "accepted" });
  });

  it("rate-limits repeated provider verification attempts but allows an idempotent retry", async () => {
    process.env.CLERK_SECRET_KEY = "clerk-test-secret";
    const t = convexTest(schema, modules);
    await seed(t);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/users/")) {
        return { ok: true, status: 200, json: async () => ({ public_metadata: { rivetOrganizationPublicId: "users-security-org" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "inv-users-security", status: "accepted", email_address: "owner@users-security.example" }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const verified = t.withIdentity({ subject: "clerk-owner-verified", email: "owner@users-security.example" });
    await expect(verified.action(api.users.claimInvitation, {})).resolves.toMatchObject({ claimed: true });
    // The accepted membership is no longer a candidate, so a retry is a
    // cheap idempotent no-op and does not perform more provider lookups.
    await expect(verified.action(api.users.claimInvitation, {})).resolves.toEqual({ claimed: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const abuse = convexTest(schema, modules);
    await seed(abuse);
    const pendingFetch = vi.fn(async (url: string) => {
      if (url.includes("/users/")) {
        return { ok: true, status: 200, json: async () => ({ public_metadata: { rivetOrganizationPublicId: "users-security-org" } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "inv-users-security", status: "pending", email_address: "owner@users-security.example" }] }) };
    });
    vi.stubGlobal("fetch", pendingFetch);
    const unverified = abuse.withIdentity({ subject: "clerk-repeated-abuser", email: "owner@users-security.example" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(unverified.action(api.users.claimInvitation, {})).rejects.toMatchObject({ data: expect.objectContaining({ code: "INVITATION_NOT_ACCEPTED" }) });
    }
    await expect(unverified.action(api.users.claimInvitation, {})).rejects.toMatchObject({ data: expect.objectContaining({ code: "RATE_LIMITED" }) });
    expect(pendingFetch).toHaveBeenCalledTimes(10);
    const guards = await abuse.run((ctx) => ctx.db.query("publicRequestGuards").collect());
    expect(guards).toHaveLength(2);
    expect(guards.every((guard) => guard.requestCount === 5)).toBe(true);
    expect(JSON.stringify(guards)).not.toContain("owner@users-security.example");
    expect(JSON.stringify(guards)).not.toContain("clerk-repeated-abuser");
  });

  it("claims a platform owner from accepted organization membership metadata, not user metadata", async () => {
    process.env.CLERK_SECRET_KEY = "clerk-test-secret";
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(ids.organizationId, { clerkOrganizationId: "org-clerk-users-security" });
      await ctx.db.patch(ids.membershipId, { clerkInvitationId: "org-inv-users-security" });
      await ctx.db.insert("gymApplications", {
        publicId: "users-security-application",
        applicationKey: "owner@users-security.example::users-security-gym",
        gymName: "Users Security Gym",
        ownerName: "Pending Owner",
        email: "owner@users-security.example",
        contactNumber: "+962790000000",
        plan: "Growth",
        status: "approved",
        notificationStatus: "sent",
        provisioningStatus: "completed",
        provisionedOrganizationId: "users-security-org",
        clerkOrganizationId: "org-clerk-users-security",
        clerkInvitationId: "org-inv-users-security",
        clerkInvitationStatus: "accepted",
        submittedAt: now,
        updatedAt: now,
      });
    });

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/invitations/org-inv-users-security")) {
        // After acceptance Clerk can retain the invitation record but move
        // its RIVET metadata to the resulting organization membership.
        return { ok: true, status: 200, json: async () => ({ id: "org-inv-users-security", status: "accepted", email_address: "owner@users-security.example" }) };
      }
      if (url.includes("/memberships?user_id=clerk-owner-org")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ status: "active", public_user_data: { user_id: "clerk-owner-org", identifier: "owner@users-security.example" }, public_metadata: { rivetApplicationId: "users-security-application", rivetOrganizationPublicId: "users-security-org" } }] }),
        };
      }
      throw new Error(`Unexpected provider lookup: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(t.withIdentity({ subject: "clerk-owner-org", email: "owner@users-security.example" }).action(api.users.claimInvitation, {})).resolves.toMatchObject({ claimed: true, id: "users-security-user" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/users/"), expect.anything());
    const state = await t.run(async (ctx) => ({ user: await ctx.db.get(ids.userId), membership: await ctx.db.get(ids.membershipId) }));
    expect(state.user).toMatchObject({ authSubject: "clerk-owner-org", status: "active" });
    expect(state.membership).toMatchObject({ invitationStatus: "accepted", clerkInvitationId: "org-inv-users-security" });
  });

  it("fails closed when a legacy user row has no public id", async () => {
    const t = convexTest(schema, modules);
    const subject = "clerk-legacy-user-without-public-id";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        authSubject: subject,
        email: "legacy@users-security.example",
        fullName: "Legacy User",
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });

    const current = await t.withIdentity({ subject }).query(api.users.current, {});
    expect(current).toMatchObject({ id: "", publicId: "", email: "legacy@users-security.example" });
    expect(current).not.toHaveProperty("_id");
    expect(current).not.toHaveProperty("_creationTime");
    expect(current).not.toHaveProperty("authSubject");
  });
});
