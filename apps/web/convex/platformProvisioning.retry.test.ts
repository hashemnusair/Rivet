import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { provisioningIdentifiers } from "./platformProvisioning";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

describe("gym provisioning retry convergence", () => {
  it("converges after an invitation failure without duplicating tenant records", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000777";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform-retry", authSubject: "clerk-platform-retry", email: "platform@retry.example", fullName: "Platform Retry", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@retry.example::retry-gym", gymName: "Retry Gym", ownerName: "Retry Owner", email: "owner@retry.example", contactNumber: "+962790000777", plan: "Growth", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-retry" });
    const correlationId = "cor-provisioning-retry";

    await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId });
    await platform.mutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId });
    await platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "Injected Clerk invitation failure for provisioning verification.", correlationId });

    await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: `${correlationId}-2` });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId: `${correlationId}-2` });
    await platform.mutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId, clerkInvitationId: "orginv_retry", correlationId: `${correlationId}-2` });
    const result = await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: `${correlationId}-2` }) as { organizationId: string; branchId: string };
    const replay = await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: `${correlationId}-3` }) as typeof result;
    expect(replay).toEqual(result);

    const ids = provisioningIdentifiers(applicationId, "Retry Gym");
    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "owner@retry.example")).unique();
      const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique();
      return {
        organizations: (await ctx.db.query("organizations").collect()).filter((item) => item.publicId === ids.organizationPublicId),
        branches: organization ? await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect() : [],
        listings: organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym")).collect() : [],
        settings: organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "settings")).collect() : [],
        roles: organization ? (await ctx.db.query("roleDefinitions").collect()).filter((role) => role.organizationId === organization._id) : [],
        ownerMemberships: organization && owner ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).collect() : [],
        application,
      };
    });
    expect(state.organizations).toHaveLength(1);
    expect(state.branches).toHaveLength(1);
    expect(state.listings).toHaveLength(1);
    expect(state.settings).toHaveLength(1);
    expect(state.roles).toHaveLength(6);
    expect(state.ownerMemberships).toHaveLength(1);
    expect(state.application).toMatchObject({ provisioningStatus: "completed", clerkOrganizationId: "org_clerk_retry", clerkInvitationId: "orginv_retry", provisionedOrganizationId: ids.organizationPublicId, provisionedBranchId: ids.branchPublicId });
  });
});
