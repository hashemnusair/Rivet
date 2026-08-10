import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const originalEntryPassSecret = process.env.ENTRY_PASS_SIGNING_SECRET;

function operation(operationName: string, input: Record<string, unknown> = {}) {
  return { operation: operationName, input, correlationId: `cor-test-${operationName}` };
}

async function expectCode(request: Promise<unknown>, code: string) {
  await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type CustomerExperienceResult = {
  customer?: { id: string; email: string; marketingPreference?: { optedIn: boolean } };
  memberships: Array<{ id: string }>;
  bookings: Array<{ id: string }>;
};

type TrialBookingResult = {
  id: string;
  leadId?: string;
  customerUserId: string;
  customerId: string;
  email: string;
  gymId: string;
  branchId: string;
  status: string;
};

async function seedFixtures(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const organizationA = await ctx.db.insert("organizations", {
      publicId: "org-a",
      name: "Gym A",
      slug: "gym-a",
      status: "active",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const organizationB = await ctx.db.insert("organizations", {
      publicId: "org-b",
      name: "Gym B",
      slug: "gym-b",
      status: "active",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const suspendedOrganization = await ctx.db.insert("organizations", {
      publicId: "org-suspended",
      name: "Suspended Gym",
      slug: "suspended-gym",
      status: "suspended",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });

    const branchA = await ctx.db.insert("branches", {
      organizationId: organizationA,
      publicId: "branch-a",
      name: "Gym A Main",
      code: "A",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("branches", {
      organizationId: organizationA,
      publicId: "branch-a-inactive",
      name: "Gym A Closed",
      code: "AX",
      active: false,
      status: "inactive",
      createdAt: now,
      updatedAt: now,
    });
    const branchB = await ctx.db.insert("branches", {
      organizationId: organizationB,
      publicId: "branch-b",
      name: "Gym B Main",
      code: "B",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("branches", {
      organizationId: suspendedOrganization,
      publicId: "branch-suspended",
      name: "Suspended Main",
      code: "S",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const insertUser = async (publicId: string, authSubject: string, email: string, options: { platformAdmin?: boolean; status?: "active" | "deactivated" } = {}) =>
      await ctx.db.insert("users", {
        publicId,
        authSubject,
        email,
        fullName: publicId.replaceAll("-", " "),
        platformAdmin: options.platformAdmin ?? false,
        status: options.status ?? "active",
        createdAt: now,
        updatedAt: now,
      });

    await insertUser("user-a", "clerk-customer-a", "a@example.com");
    await insertUser("user-b", "clerk-customer-b", "b@example.com");
    const staff = await insertUser("user-staff", "clerk-staff", "staff@gym-a.example");
    await insertUser("user-platform", "clerk-platform", "platform@rivet.example", { platformAdmin: true });
    await insertUser("user-deactivated", "clerk-deactivated", "deactivated@example.com", { status: "deactivated" });
    const formerStaff = await insertUser("user-former-staff", "clerk-former-staff", "former@gym-a.example");

    await ctx.db.insert("organizationMemberships", {
      organizationId: organizationA,
      userId: staff,
      role: "receptionist",
      branchIds: [branchA],
      active: true,
      branchScope: "selected",
      createdAt: now,
      updatedAt: now,
    });
    const formerStaffMembership = await ctx.db.insert("organizationMemberships", {
      organizationId: organizationA,
      userId: formerStaff,
      role: "receptionist",
      branchIds: [branchA],
      active: false,
      branchScope: "selected",
      createdAt: now,
      updatedAt: now,
    });

    const insertProfile = async (publicId: string, userId: string, email: string) =>
      await ctx.db.insert("customerProfiles", {
        publicId,
        userId,
        name: publicId,
        nameAr: publicId,
        email,
        phone: "+962790000000",
        initials: "CU",
        context: "RIVET member",
        createdAt: now,
        updatedAt: now,
      });
    await insertProfile("profile-a", "user-a", "a@example.com");
    await insertProfile("profile-b", "user-b", "b@example.com");
    await insertProfile("profile-former-staff", "user-former-staff", "former@gym-a.example");

    const insertRecord = async (
      organizationId: typeof organizationA,
      entityType: string,
      publicId: string,
      value: Record<string, unknown>,
      branchId?: typeof branchA,
    ) => await ctx.db.insert("domainRecords", {
      organizationId,
      entityType,
      publicId,
      branchId,
      createdAt: now,
      updatedAt: now,
      data: { id: publicId, ...value },
    });

    await insertRecord(organizationA, "marketplaceGym", "gym-a", {
      name: "Gym A",
      shortName: "A",
      isPublic: true,
      subscriptionStatus: "active",
      targetOrganizationId: "org-a",
      fromPriceMinor: 30_000,
      branches: [
        { id: "directory-branch-a", internalBranchId: "branch-a", name: "Gym A Main" },
        { id: "directory-branch-a-inactive", internalBranchId: "branch-a-inactive", name: "Gym A Closed" },
      ],
    });
    await insertRecord(organizationB, "marketplaceGym", "gym-b", {
      name: "Gym B",
      shortName: "B",
      isPublic: true,
      subscriptionStatus: "active",
      targetOrganizationId: "org-b",
      fromPriceMinor: 40_000,
      branches: [{ id: "directory-branch-b", internalBranchId: "branch-b", name: "Gym B Main" }],
    });
    await insertRecord(suspendedOrganization, "marketplaceGym", "gym-suspended", {
      name: "Suspended Gym",
      shortName: "S",
      isPublic: true,
      subscriptionStatus: "suspended",
      targetOrganizationId: "org-suspended",
      branches: [{ id: "directory-branch-suspended", internalBranchId: "branch-suspended" }],
    });
    await insertRecord(organizationB, "marketplaceGym", "gym-private", {
      name: "Private Gym",
      shortName: "P",
      isPublic: false,
      subscriptionStatus: "active",
      targetOrganizationId: "org-b",
      branches: [{ id: "directory-branch-private", internalBranchId: "branch-b" }],
    });

    await insertRecord(organizationA, "customerMembership", "membership-a-active", {
      customerUserId: "user-a",
      customerId: "profile-a",
      gymId: "gym-a",
      branchId: "directory-branch-a",
      memberNumber: "A-100",
      planName: "Active plan",
      status: "active",
      startDate: "2026-08-01",
      endDate: "2026-09-01",
      visitsThisMonth: 1,
      balanceMinor: 0,
      lastCheckInAt: "2026-08-08T10:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "customerMembership", "membership-a-inactive", {
      customerUserId: "user-a",
      customerId: "profile-a",
      gymId: "gym-a",
      branchId: "directory-branch-a",
      memberNumber: "A-OLD",
      planName: "Expired plan",
      status: "expired",
      startDate: "2026-01-01",
      endDate: "2026-02-01",
      visitsThisMonth: 0,
      balanceMinor: 0,
      lastCheckInAt: "2026-01-20T10:00:00.000Z",
    }, branchA);
    await insertRecord(organizationB, "customerMembership", "membership-b", {
      customerUserId: "user-b",
      customerId: "profile-b",
      gymId: "gym-b",
      branchId: "directory-branch-b",
      memberNumber: "B-100",
      planName: "Foreign plan",
      status: "active",
    }, branchB);
    await insertRecord(organizationB, "customerMembership", "membership-mismatched-owner", {
      customerUserId: "user-b",
      customerId: "profile-a",
      gymId: "gym-b",
      branchId: "directory-branch-b",
      memberNumber: "B-101",
      planName: "Mismatched legacy owner",
      status: "active",
    }, branchB);

    await insertRecord(organizationA, "trialBooking", "trial-anonymous", {
      gymId: "gym-a",
      branchId: "directory-branch-a",
      fullName: "Anonymous A",
      email: "a@example.com",
      phone: "+962790000001",
      status: "requested",
      createdAt: new Date(now).toISOString(),
    }, branchA);
    await insertRecord(organizationB, "trialBooking", "trial-b", {
      customerUserId: "user-b",
      customerId: "profile-b",
      gymId: "gym-b",
      branchId: "directory-branch-b",
      fullName: "Customer B",
      email: "b@example.com",
      phone: "+962790000002",
      status: "requested",
      createdAt: new Date(now).toISOString(),
    }, branchB);
    await insertRecord(organizationB, "trialBooking", "trial-mismatched-owner", {
      customerUserId: "user-b",
      customerId: "profile-a",
      gymId: "gym-b",
      branchId: "directory-branch-b",
      fullName: "Mismatched owner",
      email: "a@example.com",
      phone: "+962790000003",
      status: "requested",
      createdAt: new Date(now).toISOString(),
    }, branchB);

    return { formerStaffMembership };
  });
}

describe("exported Convex customer ownership boundaries", () => {
  beforeEach(() => {
    process.env.ENTRY_PASS_SIGNING_SECRET = "customer-boundary-test-secret";
  });

  afterEach(() => {
    if (originalEntryPassSecret === undefined) delete process.env.ENTRY_PASS_SIGNING_SECRET;
    else process.env.ENTRY_PASS_SIGNING_SECRET = originalEntryPassSecret;
  });

  it("resolves profile, My Gyms, memberships, and trials only from the Clerk subject", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });

    const registered = await customerA.mutation(api.domain.mutate, operation("customer.register", {
      customerId: "profile-b",
      customerUserId: "user-b",
      email: "b@example.com",
      membershipId: "membership-b",
      trialId: "trial-b",
      fullName: "Customer A Updated",
      phone: "+962799999999",
    }));
    expect(registered).toMatchObject({ id: "profile-a", userId: "user-a", email: "a@example.com" });

    await customerA.mutation(api.domain.mutate, operation("customer.marketingPreference.update", {
      customerId: "profile-b",
      email: "b@example.com",
      optedIn: false,
    }));
    const experience = await customerA.query(api.domain.query, operation("customer.experience", {
      customerId: "profile-b",
      membershipId: "membership-b",
      trialId: "trial-b",
    })) as CustomerExperienceResult;

    expect(experience.customer).toMatchObject({ id: "profile-a", email: "a@example.com", marketingPreference: { optedIn: false } });
    expect(experience.memberships.map((membership: { id: string }) => membership.id)).toEqual(["membership-a-active", "membership-a-inactive"]);
    expect(experience.bookings).toEqual([]);

    const customerBProfile = await t.run(async (ctx) => await ctx.db.query("customerProfiles").withIndex("by_public_id", (q) => q.eq("publicId", "profile-b")).unique());
    expect(customerBProfile).toMatchObject({ email: "b@example.com" });
    expect(customerBProfile?.marketingOptIn).toBeUndefined();
  });

  it("creates a trial for the authenticated customer and only in the selected gym and active branch", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });

    const booking = await customerA.mutation(api.domain.mutate, operation("customer.trial.create", {
      customerId: "profile-b",
      customerUserId: "user-b",
      email: "b@example.com",
      membershipId: "membership-b",
      trialId: "trial-b",
      gymId: "gym-a",
      branchId: "directory-branch-a",
      fullName: "Customer A",
      phone: "+962799999991",
      preferredDate: "2026-08-15",
      preferredTime: "18:00",
      goal: "Strength",
    })) as TrialBookingResult;

    expect(booking).toMatchObject({ customerUserId: "user-a", customerId: "profile-a", email: "a@example.com", gymId: "gym-a", branchId: "directory-branch-a", status: "requested" });
    expect(booking.id).not.toBe("trial-b");

    const persisted = await t.run(async (ctx) => {
      const bookings = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect();
      const leads = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "lead")).collect();
      const persistedBooking = bookings.find((row) => row.publicId === booking.id);
      const organization = persistedBooking ? await ctx.db.get(persistedBooking.organizationId) : null;
      const branch = persistedBooking?.branchId ? await ctx.db.get(persistedBooking.branchId) : null;
      return {
        booking: persistedBooking,
        lead: leads.find((row) => row.publicId === booking.leadId),
        organizationPublicId: organization?.publicId,
        branchPublicId: branch?.publicId,
      };
    });
    expect(persisted.booking).toMatchObject({ data: expect.objectContaining({ customerUserId: "user-a", customerId: "profile-a", leadId: booking.leadId }) });
    expect(persisted.lead).toMatchObject({ organizationId: persisted.booking?.organizationId, branchId: persisted.booking?.branchId });
    expect(persisted).toMatchObject({ organizationPublicId: "org-a", branchPublicId: "branch-a" });

    for (const [gymId, branchId] of [
      ["gym-a", "directory-branch-b"],
      ["gym-a", "directory-branch-a-inactive"],
      ["gym-suspended", "directory-branch-suspended"],
      ["gym-private", "directory-branch-private"],
    ]) {
      await expectCode(customerA.mutation(api.domain.mutate, operation("customer.trial.create", {
        gymId,
        branchId,
        fullName: "Customer A",
        email: "a@example.com",
        phone: "+962799999991",
        preferredDate: "2026-08-15",
        preferredTime: "18:00",
        goal: "Strength",
      })), "NOT_FOUND");
    }
    const routedRows = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "lead")).collect());
    expect(routedRows).toHaveLength(1);
  });

  it("does not allow foreign or inactive membership identifiers to create entry passes", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });

    const pass = await customerA.mutation(api.domain.mutate, operation("customer.entryPass", { membershipId: "membership-a-active" }));
    expect(pass).toMatchObject({ membershipId: "membership-a-active", token: expect.stringMatching(/^rivet-pass\./) });
    await expectCode(customerA.mutation(api.domain.mutate, operation("customer.entryPass", { membershipId: "membership-b" })), "NOT_FOUND");
    await expectCode(customerA.mutation(api.domain.mutate, operation("customer.entryPass", { membershipId: "membership-mismatched-owner" })), "NOT_FOUND");
    await expectCode(customerA.mutation(api.domain.mutate, operation("customer.entryPass", { membershipId: "membership-a-inactive" })), "NOT_FOUND");
  });

  it("denies gym staff, platform administrators, and deactivated users at every member-only operation", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const actors = [
      t.withIdentity({ subject: "clerk-staff" }),
      t.withIdentity({ subject: "clerk-platform" }),
    ];
    for (const actor of actors) {
      await expectCode(actor.query(api.domain.query, operation("customer.experience", { customerId: "profile-a" })), "FORBIDDEN");
      await expectCode(actor.mutation(api.domain.mutate, operation("customer.register", { customerId: "profile-a", email: "a@example.com" })), "FORBIDDEN");
      await expectCode(actor.mutation(api.domain.mutate, operation("customer.marketingPreference.update", { customerId: "profile-a", optedIn: false })), "FORBIDDEN");
      await expectCode(actor.mutation(api.domain.mutate, operation("customer.trial.create", { customerId: "profile-a", trialId: "trial-b", gymId: "gym-a", branchId: "directory-branch-a" })), "FORBIDDEN");
      await expectCode(actor.mutation(api.domain.mutate, operation("customer.entryPass", { membershipId: "membership-a-active" })), "FORBIDDEN");
    }

    const deactivated = t.withIdentity({ subject: "clerk-deactivated" });
    await expectCode(deactivated.query(api.domain.query, operation("customer.experience")), "UNAUTHENTICATED");
    await expectCode(deactivated.mutation(api.domain.mutate, operation("customer.trial.create", { gymId: "gym-a", branchId: "directory-branch-a" })), "UNAUTHENTICATED");
  });

  it("keeps anonymous requests unclaimed across authentication and handles inactive staff membership deliberately", async () => {
    const t = convexTest(schema, modules);
    const fixtures = await seedFixtures(t);
    const publicGyms = await t.query(api.domain.query, operation("public.marketplace")) as Array<{ id: string }>;
    expect(publicGyms.map((gym) => gym.id)).toEqual(["gym-a", "gym-b"]);
    const before = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect()).length);

    await expectCode(t.mutation(api.domain.mutate, operation("customer.trial.create", {
      customerId: "profile-a",
      email: "a@example.com",
      gymId: "gym-a",
      branchId: "directory-branch-a",
    })), "UNAUTHENTICATED");
    const after = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect()).length);
    expect(after).toBe(before);

    const customerA = t.withIdentity({ subject: "clerk-customer-a" });
    const customerAExperience = await customerA.query(api.domain.query, operation("customer.experience")) as CustomerExperienceResult;
    expect(customerAExperience.bookings).toEqual([]);

    const formerStaff = t.withIdentity({ subject: "clerk-former-staff" });
    await expect(formerStaff.query(api.domain.query, operation("customer.experience"))).resolves.toMatchObject({ customer: { id: "profile-former-staff" } });
    await t.run(async (ctx) => await ctx.db.patch(fixtures.formerStaffMembership, { active: true, updatedAt: Date.now() }));
    await expectCode(formerStaff.query(api.domain.query, operation("customer.experience")), "FORBIDDEN");
  });
});
