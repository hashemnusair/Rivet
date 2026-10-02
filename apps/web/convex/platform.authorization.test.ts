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
const request = (operation: string, input: Record<string, unknown> = {}) => ({
  operation,
  input,
  correlationId: `cor-platform-auth-${operation}`,
});

async function expectCode(requestPromise: Promise<unknown>, code: string) {
  await expect(requestPromise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", {
      publicId: "platform-auth-org",
      name: "Platform Auth Gym",
      slug: "platform-auth-gym",
      status: "active",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branch = await ctx.db.insert("branches", {
      organizationId: organization,
      publicId: "platform-auth-branch",
      name: "Main",
      code: "MAIN",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const owner = await ctx.db.insert("users", {
      publicId: "platform-auth-owner",
      authSubject: "clerk-platform-auth-owner",
      email: "owner@platform-auth.example",
      fullName: "Gym Owner",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: organization,
      userId: owner,
      role: "owner",
      branchIds: [branch],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("platform operation authorization", () => {
  it("rejects a gym owner from every platform query boundary", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-platform-auth-owner" });

    for (const operation of ["platform.applications", "platform.marketingMigration.preview", "platform.snapshot", "platform.gym.detail"]) {
      await expectCode(owner.query(api.domain.query, request(operation, operation === "platform.gym.detail" ? { gymId: "unknown" } : {})), "FORBIDDEN");
    }
  });

  it("rejects a gym owner from every platform mutation boundary before validation or resource lookup", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-platform-auth-owner" });
    const inputs: Record<string, Record<string, unknown>> = {
      "platform.marketingMigration.apply": { reason: "test" },
      "platform.application.note": { applicationId: "unknown", note: "test" },
      "platform.gym.update": { gymId: "unknown", status: "suspended", reason: "test" },
      "platform.gym.archive": { gymId: "unknown", confirmation: "Unknown", reason: "test" },
      "platform.plan.update": { name: "Growth", priceMinor: 1, branches: 1, staff: 1, members: 1 },
      "platform.invoice.create": { gymId: "unknown", amountMinor: 1, currency: "JOD", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueAt: "2026-09-01" },
      "platform.invoice.issue": { invoiceId: "unknown" },
      "platform.invoice.past_due": { invoiceId: "unknown", reason: "test" },
      "platform.invoice.payment": { invoiceId: "unknown", reference: "test", reason: "test" },
      "platform.invoice.void": { invoiceId: "unknown", reason: "test" },
      "platform.support.resolve": { caseId: "unknown", resolutionSummary: "test" },
      "platform.support.reply": { caseId: "unknown", body: "test" },
      "platform.support.reopen": { caseId: "unknown" },
      "platform.support.assign": { caseId: "unknown" },
    };

    for (const [operation, input] of Object.entries(inputs)) {
      await expectCode(owner.mutation(api.domain.mutate, request(operation, input)), "FORBIDDEN");
    }
  });

  it("lets a platform admin archive a foreign gym without tenant membership", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform-auth-admin" });
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        publicId: "platform-auth-admin",
        authSubject: "clerk-platform-auth-admin",
        email: "admin@platform-auth.example",
        fullName: "Platform Admin",
        platformAdmin: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const foreignOrganization = await ctx.db.insert("organizations", {
        publicId: "platform-auth-foreign-org",
        name: "Foreign Gym",
        slug: "platform-auth-foreign-gym",
        status: "active",
        timezone: "Asia/Amman",
        currency: "JOD",
        createdAt: now,
        updatedAt: now,
      });
      const foreignBranch = await ctx.db.insert("branches", {
        organizationId: foreignOrganization,
        publicId: "platform-auth-foreign-branch",
        name: "Foreign Main",
        code: "MAIN",
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const foreignOwner = await ctx.db.insert("users", {
        publicId: "platform-auth-foreign-owner",
        authSubject: "clerk-platform-auth-foreign-owner",
        email: "foreign-owner@platform-auth.example",
        fullName: "Foreign Gym Owner",
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: foreignOrganization,
        userId: foreignOwner,
        role: "owner",
        branchIds: [foreignBranch],
        branchScope: "all",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("domainRecords", {
        organizationId: foreignOrganization,
        entityType: "marketplaceGym",
        publicId: "platform-auth-foreign-gym",
        createdAt: now,
        updatedAt: now,
        data: {
          id: "platform-auth-foreign-gym",
          name: "Foreign Gym",
          targetOrganizationId: "platform-auth-foreign-org",
          subscriptionStatus: "active",
          rivetPlan: "Growth",
          isPublic: true,
        },
      });
    });

    // The platform operator has no organization membership at all, but may
    // still perform the platform-scoped archive operation.
    const platformMemberships = await t.run(async (ctx) => {
      const user = await ctx.db.query("users").withIndex("by_auth_subject", (q) => q.eq("authSubject", "clerk-platform-auth-admin")).unique();
      return user ? await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", user._id)).collect() : [];
    });
    expect(platformMemberships).toHaveLength(0);

    const tenantOwner = t.withIdentity({ subject: "clerk-platform-auth-owner" });
    await expectCode(tenantOwner.mutation(api.domain.mutate, request("platform.gym.archive", {
      gymId: "platform-auth-foreign-gym",
      confirmation: "Foreign Gym",
      reason: "Unauthorized cross-tenant archive.",
    })), "FORBIDDEN");

    const archived = await platform.mutation(api.domain.mutate, request("platform.gym.archive", {
      gymId: "platform-auth-foreign-gym",
      confirmation: "Foreign Gym",
      reason: "Customer requested account closure.",
    })) as Record<string, unknown>;
    expect(archived).toMatchObject({ id: "platform-auth-foreign-gym", subscriptionStatus: "suspended", isPublic: false, isArchived: true });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "platform-auth-foreign-org")).unique();
      const audit = (await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "platform_gym").eq("entityPublicId", "platform-auth-foreign-gym")).collect()).find((event) => event.action === "gym.archive");
      return { organization, audit };
    });
    expect(persisted.organization).toMatchObject({ status: "suspended", archiveReason: "Customer requested account closure." });
    expect(persisted.audit).toMatchObject({ action: "gym.archive", reason: "Customer requested account closure." });

    const foreignOwner = t.withIdentity({ subject: "clerk-platform-auth-foreign-owner" });
    await expectCode(foreignOwner.mutation(api.domain.mutate, request("platform.gym.archive", {
      gymId: "platform-auth-foreign-gym",
      confirmation: "Foreign Gym",
      reason: "Unauthorized retry.",
    })), "FORBIDDEN");
  });
});
