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
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@retry.example::retry-gym", gymName: "Retry Gym", ownerName: "Retry Owner", email: "owner@retry.example", contactNumber: "+962790000777", plan: "Enterprise", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-retry" });
    const correlationId = "cor-provisioning-retry";

    const claims = await Promise.all([
      platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId }),
      platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: `${correlationId}-concurrent` }),
    ]) as Array<{ status: string; correlationId?: string; leaseId?: string }>;
    expect(claims.map((claim) => claim.status)).toEqual(expect.arrayContaining(["in_progress", "busy"]));
    const firstClaim = claims.find((claim) => claim.status === "in_progress");
    if (!firstClaim?.leaseId || !firstClaim.correlationId) throw new Error("The provisioning claim did not return its lease.");
    await platform.mutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId: firstClaim.correlationId, leaseId: firstClaim.leaseId });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId: firstClaim.correlationId, leaseId: firstClaim.leaseId });
    await platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "Injected Clerk invitation failure for provisioning verification.", correlationId: firstClaim.correlationId, leaseId: firstClaim.leaseId });

    const secondClaim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: `${correlationId}-2` }) as { correlationId: string; leaseId: string };
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_retry", correlationId: secondClaim.correlationId, leaseId: secondClaim.leaseId });
    await platform.mutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId, clerkInvitationId: "orginv_retry", correlationId: secondClaim.correlationId, leaseId: secondClaim.leaseId });
    const result = await platform.mutation(internal.platformProvisioning.complete, { applicationId, clerkInvitationId: "orginv_retry", correlationId: secondClaim.correlationId, leaseId: secondClaim.leaseId }) as { organizationId: string; branchId: string };
    const replay = await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: `${correlationId}-3`, leaseId: secondClaim.leaseId }) as typeof result;
    expect(replay).toEqual(result);
    // A delayed action catch must not regress a committed completion into a
    // false failure or create another platform alert.
    await platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "Late transport failure after completion.", correlationId: `${correlationId}-late-failure`, leaseId: secondClaim.leaseId });

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
        notifications: await ctx.db.query("operationalNotifications").collect(),
        entitlements: organization ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique() : null,
      };
    });
    expect(state.organizations).toHaveLength(1);
    expect(state.branches).toHaveLength(1);
    expect(state.listings).toHaveLength(1);
    expect(state.settings).toHaveLength(1);
    expect(state.roles).toHaveLength(6);
    expect(state.ownerMemberships).toHaveLength(1);
    expect(state.organizations[0]).toMatchObject({ subscriptionPlan: "Enterprise", billingInterval: "monthly", status: "trial", subscriptionStartedAt: expect.any(Number), trialEndsAt: expect.any(Number) });
    expect(state.application).toMatchObject({ plan: "Enterprise", provisioningStatus: "completed", clerkOrganizationId: "org_clerk_retry", clerkInvitationId: "orginv_retry", provisionedOrganizationId: ids.organizationPublicId, provisionedBranchId: ids.branchPublicId });
    expect(state.notifications).toEqual([expect.objectContaining({ kind: "provisioning_failure", readAt: expect.any(Number), expiresAt: expect.any(Number) })]);
    expect(state.entitlements).toMatchObject({ subscriptionPlan: "Enterprise", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] });
  });

  it("resumes an existing paid workspace without resetting lifecycle, branch, listing, or accepted owner state", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000778";
    const ids = provisioningIdentifiers(applicationId, "Authoritative Gym");
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        publicId: ids.organizationPublicId,
        name: "Authoritative Gym",
        slug: ids.organizationSlug,
        status: "active",
        subscriptionPlan: "Enterprise",
        billingInterval: "annual",
        subscriptionStartedAt: now - 86_400_000 * 200,
        currentPeriodEndsAt: now + 86_400_000 * 100,
        subscriptionStatusReason: "Paid plan managed by platform operations.",
        clerkOrganizationId: "org_clerk_authoritative",
        timezone: "Asia/Amman",
        currency: "JOD",
        locale: "en-JO",
        defaultLanguage: "en",
        taxRatePercent: 0,
        receiptPrefix: "RV",
        nextReceiptNumber: 1001,
        receiptFooter: "Thank you.",
        createdAt: now - 86_400_000 * 200,
        updatedAt: now - 86_400_000,
      });
      const branchId = await ctx.db.insert("branches", {
        publicId: ids.branchPublicId,
        organizationId,
        name: "Authoritative Gym — Main branch",
        code: "PRIMARY",
        address: "Existing address",
        phone: "+962790000778",
        capacity: 80,
        active: false,
        status: "inactive",
        createdAt: now - 86_400_000 * 200,
        updatedAt: now - 86_400_000,
      });
      await ctx.db.insert("users", { publicId: "platform-authoritative", authSubject: "clerk-platform-authoritative", email: "platform@authoritative.example", fullName: "Platform Authoritative", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      const ownerUserId = await ctx.db.insert("users", { publicId: "owner-authoritative", authSubject: "clerk-owner-authoritative", email: "owner@authoritative.example", fullName: "Owner Before Retry", platformAdmin: false, status: "active", createdAt: now - 86_400_000 * 200, updatedAt: now - 86_400_000 });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerUserId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, invitationStatus: "accepted", invitedAt: now - 86_400_000 * 180, clerkInvitationId: "orginv_already_accepted", invitationSentAt: now - 86_400_000 * 180, invitationLastAttemptAt: now - 86_400_000 * 180, createdAt: now - 86_400_000 * 200, updatedAt: now - 86_400_000 });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "marketplaceGym", publicId: ids.marketplacePublicId, createdAt: now - 86_400_000 * 200, updatedAt: now - 86_400_000, data: { id: ids.marketplacePublicId, name: "Renamed by platform admin", isPublic: false, branches: [{ id: ids.branchPublicId, name: "Public branch label", area: "Abdoun", address: "Existing address", trialSlots: [] }], subscriptionStatus: "active", rivetPlan: "Enterprise", billingInterval: "annual" } });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@authoritative.example::authoritative-gym", gymName: "Authoritative Gym", ownerName: "Application Owner", email: "owner@authoritative.example", contactNumber: "+962790000778", plan: "Starter", billingInterval: "monthly", status: "approved", notificationStatus: "sent", provisioningStatus: "failed", provisioningOutcome: "partial", provisioningCheckpoint: "workspace_ready", provisioningError: "Invitation response was interrupted.", submittedAt: now - 86_400_000 * 200, updatedAt: now - 86_400_000 });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-authoritative" });
    const correlationId = "cor-provisioning-authoritative";

    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId }) as { status: string; ownerInvitationStatus?: string; correlationId: string; leaseId: string };
    expect(claim).toMatchObject({ status: "in_progress", ownerInvitationStatus: "accepted", clerkOrganizationId: "org_clerk_authoritative" });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_authoritative", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      if (!organization) throw new Error("Organization missing during branch identity test.");
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", ids.branchPublicId)).unique();
      if (!branch) throw new Error("Branch missing during branch identity test.");
      await ctx.db.patch(branch._id, { code: "RENAMED", updatedAt: Date.now() });
    });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_authoritative", correlationId: claim.correlationId, leaseId: claim.leaseId });
    const invitationRecord = await platform.mutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId, clerkInvitationId: "orginv-race-should-not-overwrite", correlationId: claim.correlationId, leaseId: claim.leaseId }) as { status?: string };
    expect(invitationRecord.status).toBe("accepted");
    const result = await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: claim.correlationId, leaseId: claim.leaseId }) as { status: string; plan: string; billingInterval: string; branchName: string };
    expect(result).toMatchObject({ status: "completed", plan: "Enterprise", billingInterval: "annual", branchName: "Authoritative Gym — Main branch" });

    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "owner@authoritative.example")).unique();
      const branch = organization ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", ids.branchPublicId)).unique() : null;
      const listing = organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym").eq("publicId", ids.marketplacePublicId)).unique() : null;
      const membership = organization && owner ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).unique() : null;
      const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique();
      return { organization, branch, listing, membership, application };
    });
    expect(state.organization).toMatchObject({ status: "active", subscriptionPlan: "Enterprise", billingInterval: "annual", currentPeriodEndsAt: expect.any(Number), subscriptionStatusReason: "Paid plan managed by platform operations." });
    expect(state.branch).toMatchObject({ status: "inactive", active: false, address: "Existing address" });
    expect(state.membership).toMatchObject({ role: "owner", active: true, invitationStatus: "accepted", clerkInvitationId: "orginv_already_accepted" });
    expect(state.listing?.data).toMatchObject({ name: "Renamed by platform admin", isPublic: false, subscriptionStatus: "active", rivetPlan: "Enterprise", billingInterval: "annual", branches: [{ name: "Public branch label" }] });
    expect(state.application).toMatchObject({ provisioningStatus: "completed", provisioningOutcome: "complete", provisioningCheckpoint: "completed" });
    expect(state.application?.provisionedOrganizationId).toBe(ids.organizationPublicId);
  });

  it("treats an active legacy owner membership without invitationStatus as accepted", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000780";
    const ids = provisioningIdentifiers(applicationId, "Legacy Owner Gym");
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: ids.organizationPublicId, name: "Legacy Owner Gym", slug: ids.organizationSlug, status: "active", subscriptionPlan: "Pro", billingInterval: "monthly", subscriptionStartedAt: now - 1000, clerkOrganizationId: "org_clerk_legacy", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { publicId: ids.branchPublicId, organizationId, name: "Legacy Owner Gym — Main branch", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("users", { publicId: "platform-legacy", authSubject: "clerk-platform-legacy", email: "platform@legacy.example", fullName: "Platform Legacy", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      const ownerId = await ctx.db.insert("users", { publicId: "owner-legacy", authSubject: "clerk-owner-legacy", email: "owner@legacy.example", fullName: "Legacy Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, clerkInvitationId: "legacy-invitation", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@legacy.example::legacy-owner-gym", gymName: "Legacy Owner Gym", ownerName: "Legacy Owner", email: "owner@legacy.example", contactNumber: "+962790000780", plan: "Starter", billingInterval: "monthly", status: "approved", notificationStatus: "sent", provisioningStatus: "failed", provisioningOutcome: "retryable", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-legacy" });
    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-legacy-owner" }) as { ownerInvitationStatus?: string; leaseId: string; correlationId: string };
    expect(claim.ownerInvitationStatus).toBe("accepted");
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_legacy", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: claim.correlationId, leaseId: claim.leaseId });
    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "owner@legacy.example")).unique();
      const membership = organization && owner ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).unique() : null;
      const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique();
      return { membership, application };
    });
    expect(state.membership).toMatchObject({ active: true, clerkInvitationId: "legacy-invitation" });
    expect(state.membership?.invitationStatus).toBeUndefined();
    expect(state.application).toMatchObject({ provisioningStatus: "completed", provisioningOutcome: "complete", clerkInvitationStatus: "accepted" });
  });

  it("fences delayed mutations from a newer provisioning lease", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000781";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform-lease", authSubject: "clerk-platform-lease", email: "platform@lease.example", fullName: "Platform Lease", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@lease.example::lease-gym", gymName: "Lease Gym", ownerName: "Lease Owner", email: "owner@lease.example", contactNumber: "+962790000781", plan: "Growth", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-lease" });
    const first = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-lease-first" }) as { leaseId: string; correlationId: string };
    await t.run(async (ctx) => {
      const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique();
      if (!application) throw new Error("Application missing during lease test.");
      await ctx.db.patch(application._id, { provisioningStartedAt: 0 });
    });
    const second = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-lease-second" }) as { leaseId: string; correlationId: string };
    expect(second.leaseId).not.toBe(first.leaseId);
    await expect(platform.mutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId, clerkOrganizationId: "org-stale", correlationId: first.correlationId, leaseId: first.leaseId })).rejects.toThrow(/stale/i);
    await expect(platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: first.correlationId, leaseId: first.leaseId })).rejects.toThrow(/stale/i);
    await expect(platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "late failure", correlationId: first.correlationId, leaseId: first.leaseId })).resolves.toMatchObject({ status: "stale" });
    const application = await t.run(async (ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique());
    expect(application).toMatchObject({ provisioningStatus: "in_progress", provisioningLastCorrelationId: second.correlationId, provisioningLeaseId: second.leaseId });
  });

  it("drops revoked or expired invitation ids before recording a replacement", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000783";
    const ids = provisioningIdentifiers(applicationId, "Invitation Replacement Gym");
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: ids.organizationPublicId, name: "Invitation Replacement Gym", slug: ids.organizationSlug, status: "active", subscriptionPlan: "Growth", billingInterval: "monthly", clerkOrganizationId: "org-clerk-replacement", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { publicId: ids.branchPublicId, organizationId, name: "Invitation Replacement Gym — Main branch", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("users", { publicId: "platform-replacement", authSubject: "clerk-platform-replacement", email: "platform@replacement.example", fullName: "Platform Replacement", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      const ownerId = await ctx.db.insert("users", { publicId: "owner-replacement", authSubject: "clerk-owner-replacement", email: "owner@replacement.example", fullName: "Replacement Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, invitationStatus: "pending", clerkInvitationId: "revoked-provider-id", clerkInvitationStatus: "revoked", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@replacement.example::invitation-replacement-gym", gymName: "Invitation Replacement Gym", ownerName: "Replacement Owner", email: "owner@replacement.example", contactNumber: "+962790000783", plan: "Growth", status: "approved", notificationStatus: "sent", clerkOrganizationId: "org-clerk-replacement", clerkInvitationId: "expired-application-id", clerkInvitationStatus: "expired", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-replacement" });
    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-replacement" }) as { clerkInvitationId?: string; leaseId: string; correlationId: string };
    expect(claim.clerkInvitationId).toBeUndefined();
    const cleared = await t.run(async (ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique());
    expect(cleared?.clerkInvitationId).toBeUndefined();
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org-clerk-replacement", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await platform.mutation(internal.platformProvisioning.rememberClerkInvitation, { applicationId, clerkInvitationId: "replacement-provider-id", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await platform.mutation(internal.platformProvisioning.complete, { applicationId, correlationId: claim.correlationId, leaseId: claim.leaseId });
    const finalState = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "owner@replacement.example")).unique();
      const membership = organization && owner ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).unique() : null;
      return { membership, application: await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique() };
    });
    expect(finalState.membership).toMatchObject({ clerkInvitationId: "replacement-provider-id", clerkInvitationStatus: "pending" });
    expect(finalState.application).toMatchObject({ clerkInvitationId: "replacement-provider-id", clerkInvitationStatus: "pending", provisioningStatus: "completed" });
  });

  it("persists a begin-time Clerk identity conflict as permanent", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000782";
    const ids = provisioningIdentifiers(applicationId, "Begin Conflict Gym");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform-begin-conflict", authSubject: "clerk-platform-begin-conflict", email: "platform@begin-conflict.example", fullName: "Platform Begin Conflict", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizations", { publicId: ids.organizationPublicId, name: "Begin Conflict Gym", slug: ids.organizationSlug, status: "active", clerkOrganizationId: "org-authoritative", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@begin-conflict.example::begin-conflict-gym", gymName: "Begin Conflict Gym", ownerName: "Owner", email: "owner@begin-conflict.example", contactNumber: "+962790000782", plan: "Growth", status: "approved", notificationStatus: "sent", clerkOrganizationId: "org-other", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-begin-conflict" });
    await expect(platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-begin-conflict" })).resolves.toMatchObject({ status: "permanent" });
    const application = await t.run(async (ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique());
    expect(application).toMatchObject({ provisioningStatus: "failed", provisioningOutcome: "permanent", provisioningError: "The application and workspace reference different Clerk organizations." });
  });

  it("does not guess a branch when a legacy workspace has multiple candidates", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000784";
    const ids = provisioningIdentifiers(applicationId, "Ambiguous Branch Gym");
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: ids.organizationPublicId, name: "Ambiguous Branch Gym", slug: ids.organizationSlug, status: "active", subscriptionPlan: "Growth", billingInterval: "monthly", clerkOrganizationId: "org-ambiguous", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("branches", { publicId: "branch-a", organizationId, name: "A", code: "A", active: true, status: "active", createdAt: now - 1000, updatedAt: now });
      await ctx.db.insert("branches", { publicId: "branch-b", organizationId, name: "B", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("users", { publicId: "platform-ambiguous", authSubject: "clerk-platform-ambiguous", email: "platform@ambiguous.example", fullName: "Platform Ambiguous", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@ambiguous.example::ambiguous-branch-gym", gymName: "Ambiguous Branch Gym", ownerName: "Owner", email: "owner@ambiguous.example", contactNumber: "+962790000784", plan: "Growth", status: "approved", notificationStatus: "sent", provisioningStatus: "failed", provisioningOutcome: "retryable", clerkOrganizationId: "org-ambiguous", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-ambiguous" });
    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-ambiguous" }) as { correlationId: string; leaseId: string };
    await expect(platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org-ambiguous", correlationId: claim.correlationId, leaseId: claim.leaseId })).rejects.toThrow(/cannot be identified safely/i);
    await platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "The initial gym branch cannot be identified safely; manual correction is required before retrying.", correlationId: claim.correlationId, leaseId: claim.leaseId, outcome: "permanent" });
    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
      return {
        branches: organization ? await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect() : [],
        application: await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique(),
      };
    });
    expect(state.branches).toHaveLength(2);
    expect(state.application).toMatchObject({ provisioningStatus: "failed", provisioningOutcome: "permanent" });
  });

  it("records a permanent provisioning conflict and does not silently retry it", async () => {
    const t = convexTest(schema, modules);
    const applicationId = "20000000-0000-4a00-8a00-000000000779";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform-permanent", authSubject: "clerk-platform-permanent", email: "platform@permanent.example", fullName: "Platform Permanent", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@permanent.example::permanent-gym", gymName: "Permanent Gym", ownerName: "Permanent Owner", email: "owner@permanent.example", contactNumber: "+962790000779", plan: "Growth", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform-permanent" });
    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-permanent-1" }) as { leaseId: string; correlationId: string };
    await platform.mutation(internal.platformProvisioning.fail, { applicationId, message: "The owner account is deactivated.", outcome: "permanent", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await expect(platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-permanent-2" })).resolves.toMatchObject({ status: "permanent", message: "The owner account is deactivated." });

    const application = await t.run(async (ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", applicationId)).unique());
    expect(application).toMatchObject({ provisioningStatus: "failed", provisioningOutcome: "permanent", provisioningCheckpoint: "claimed", provisioningAttemptCount: 1 });
  });
});
