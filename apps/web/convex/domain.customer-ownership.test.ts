import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api } from "./_generated/api";
import schema from "./schema";
import { privacyFingerprint } from "./publicAbuse";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const originalEntryPassSecret = process.env.ENTRY_PASS_SIGNING_SECRET;
const trialDate = (() => { const date = new Date(Date.now() + 3 * 86_400_000); return date.toISOString().slice(0, 10); })();

function operation(operationName: string, input: Record<string, unknown> = {}) {
  return { operation: operationName, input, correlationId: `cor-test-${operationName}` };
}

async function expectCode(request: Promise<unknown>, code: string) {
  await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type CustomerExperienceResult = {
  customer?: { id: string; email: string; marketingPreference?: { optedIn: boolean } };
  memberships: Array<{ id: string; referral?: { enabled: boolean; sharePath?: string } }>;
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
      memberPublicId: typeof value.memberId === "string" ? value.memberId : undefined,
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
    await insertRecord(organizationA, "settings", "settings", {
      operationalPolicies: {
        operatingHours: [{ branchId: "branch-a", days: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((weekday) => [weekday, { enabled: true, opensAt: "06:00", closesAt: "23:00" }])) }],
        trialSchedules: [{ branchId: "branch-a", days: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((weekday) => [weekday, { enabled: true, opensAt: "09:00", closesAt: "20:00" }])) }],
      },
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
      memberId: "member-a",
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

    await insertRecord(organizationA, "member", "member-a", {
      memberNumber: "A-100",
      fullName: "Customer A",
      homeBranchId: "branch-a",
      status: "active",
    }, branchA);
    await insertRecord(organizationA, "membership", "membership-a-active", {
      memberId: "member-a",
      planName: "Active plan",
      homeBranchId: "branch-a",
      startDate: "2026-08-01",
      endDate: "2026-09-01",
      createdAt: "2026-08-01T00:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "checkIn", "checkin-a-allowed", {
      memberId: "member-a",
      memberName: "Customer A",
      memberNumber: "A-100",
      branchId: "branch-a",
      branchName: "Gym A Main",
      decision: "allowed",
      actorName: "Reception A",
      occurredAt: "2026-08-08T10:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "checkIn", "checkin-a-blocked", {
      memberId: "member-a",
      memberName: "Customer A",
      memberNumber: "A-100",
      branchId: "branch-a",
      branchName: "Gym A Main",
      decision: "blocked",
      actorName: "Reception A",
      occurredAt: "2026-08-09T10:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "charge", "charge-a", {
      memberId: "member-a",
      membershipId: "membership-a-active",
      description: "Active plan",
      total: { amount: 50_000, currency: "JOD" },
      paidAmount: { amount: 30_000, currency: "JOD" },
      outstandingAmount: { amount: 20_000, currency: "JOD" },
      status: "partial",
      issueDate: "2026-08-01",
      dueDate: "2026-08-01",
      createdAt: "2026-08-01T00:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "payment", "payment-a", {
      memberId: "member-a",
      membershipId: "membership-a-active",
      chargeId: "charge-a",
      branchId: "branch-a",
      type: "payment",
      amount: { amount: 30_000, currency: "JOD" },
      method: "cash",
      status: "completed",
      receiptId: "receipt-a",
      receiptNumber: "R-1001",
      collectedById: "user-staff",
      collectedByName: "Reception A",
      occurredAt: "2026-08-02T09:00:00.000Z",
    }, branchA);
    await insertRecord(organizationA, "receipt", "receipt-a", {
      receiptNumber: "R-1001",
      paymentId: "payment-a",
      issuedAt: "2026-08-02T09:00:00.000Z",
    }, branchA);

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
      gender: "female",
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
    expect(experience.memberships[0]).toMatchObject({
      visitsThisMonth: 1,
      lastCheckInAt: "2026-08-08T10:00:00.000Z",
      visitHistory: [{ id: "checkin-a-allowed", memberName: "Customer A", branchName: "Gym A Main", checkedInByName: "Reception A" }],
    });
    expect(experience.bookings).toEqual([]);

    const customerBProfile = await t.run(async (ctx) => await ctx.db.query("customerProfiles").withIndex("by_public_id", (q) => q.eq("publicId", "profile-b")).unique());
    expect(customerBProfile).toMatchObject({ email: "b@example.com" });
    expect(customerBProfile?.marketingOptIn).toBeUndefined();
  });

  it("synchronizes member-owned profile fields to linked gym records without changing marketing consent", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });

    const updated = await customerA.mutation(api.domain.mutate, operation("customer.profile.update", {
      fullName: "Customer A Updated",
      phone: "+962799999999",
      dateOfBirth: "1992-04-12",
      gender: "female",
      preferredLanguage: "ar",
      addressLine1: "Rainbow Street",
      city: "Amman",
      emergencyContactName: "Nour A",
      emergencyContactRelationship: "Sibling",
      emergencyContactPhone: "+962790001111",
    })) as Record<string, unknown>;

    expect(updated).toMatchObject({ id: "profile-a", name: "Customer A Updated", phone: "+962799999999", preferredLanguage: "ar" });
    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-a")).unique();
      const member = organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", "member-a")).unique() : null;
      const profile = await ctx.db.query("customerProfiles").withIndex("by_public_id", (q) => q.eq("publicId", "profile-a")).unique();
      const events = await ctx.db.query("customerProfileEvents").withIndex("by_profile", (q) => q.eq("customerProfileId", "profile-a")).collect();
      const audits = organization ? await ctx.db.query("auditEvents").withIndex("by_organization_entity", (q) => q.eq("organizationId", organization._id).eq("entityPublicId", "member-a")).collect() : [];
      return { member, profile, events, audits };
    });
    expect(persisted.member?.data).toMatchObject({ fullName: "Customer A Updated", phone: "+962799999999", dateOfBirth: "1992-04-12", preferredLanguage: "ar", emergencyContactRelationship: "Sibling", customerProfileId: "profile-a" });
    expect(persisted.profile?.marketingOptIn).toBeUndefined();
    expect(persisted.events[0]?.changedFields).toEqual(expect.arrayContaining(["fullName", "phone", "preferredLanguage", "emergencyContactRelationship"]));
    expect(persisted.audits).toEqual(expect.arrayContaining([expect.objectContaining({ action: "member.profile_sync", actorRole: "member", after: expect.objectContaining({ changedFields: expect.arrayContaining(["fullName", "phone"]) }) })]));
  });

  it("projects only the authenticated member's financial history and receipts", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });
    const customerB = t.withIdentity({ subject: "clerk-customer-b" });

    const summary = await customerA.query(api.domain.query, operation("customer.finance.summary")) as {
      outstanding: { amount: number; currency: string };
      paidLifetime: { amount: number; currency: string };
      receiptCount: number;
    };
    expect(summary).toMatchObject({
      outstanding: { amount: 20_000, currency: "JOD" },
      paidLifetime: { amount: 30_000, currency: "JOD" },
      receiptCount: 1,
    });

    const transactions = await customerA.query(api.domain.query, operation("customer.finance.transactions", { page: 1, pageSize: 20 })) as {
      items: Array<{ id: string; receiptId?: string }>;
      totalItems: number;
    };
    expect(transactions).toMatchObject({ totalItems: 1, items: [{ id: "payment-a", receiptId: "receipt-a" }] });

    const receipt = await customerA.query(api.domain.query, operation("customer.receipt", { receiptId: "receipt-a" })) as {
      member: { memberNumber: string };
      payment: { id: string };
    };
    expect(receipt).toMatchObject({ member: { memberNumber: "A-100" }, payment: { id: "payment-a" } });
    await expectCode(customerB.query(api.domain.query, operation("customer.receipt", { receiptId: "receipt-a" })), "NOT_FOUND");
  });

  it("keeps member onboarding resumable and unavailable to staff identities", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customer = t.withIdentity({ subject: "clerk-customer-a" });
    const staff = t.withIdentity({ subject: "clerk-staff" });
    const initial = await customer.query(api.domain.query, operation("onboarding.get", { audience: "member" })) as { tasks: Array<{ key: string; complete: boolean; completionMode: string }> };
    expect(initial.tasks).toContainEqual(expect.objectContaining({ key: "member_entry", complete: false, completionMode: "manual" }));
    await expectCode(customer.mutation(api.domain.mutate, operation("onboarding.update", { audience: "member", completedStepKey: "member_profile" })), "CONFLICT");
    const updated = await customer.mutation(api.domain.mutate, operation("onboarding.update", { audience: "member", completedStepKey: "member_entry" })) as { progress: { completedStepKeys: string[] }; tasks: Array<{ key: string; complete: boolean }> };
    expect(updated.progress.completedStepKeys).toContain("member_entry");
    expect(updated.tasks).toContainEqual(expect.objectContaining({ key: "member_entry", complete: true }));
    await expectCode(staff.query(api.domain.query, operation("onboarding.get", { audience: "member" })), "FORBIDDEN");
    await expectCode(customer.query(api.domain.query, operation("onboarding.get", { audience: "owner" })), "FORBIDDEN");
  });

  it("stores explicit per-device push consent without exposing subscription secrets", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customer = t.withIdentity({ subject: "clerk-customer-a" });
    const staff = t.withIdentity({ subject: "clerk-staff" });
    const saved = await customer.mutation(api.domain.mutate, operation("push.subscribe", { endpoint: "https://push.example.test/member-a", p256dh: "public-key-material-123456", auth: "auth-material-123", label: "Test phone" })) as { id: string; label: string; endpoint?: string; auth?: string };
    expect(saved).toMatchObject({ label: "Test phone" });
    expect(saved).not.toHaveProperty("endpoint");
    expect(saved).not.toHaveProperty("auth");
    expect(await customer.query(api.domain.query, operation("push.list"))).toEqual([expect.objectContaining({ id: saved.id, label: "Test phone" })]);
    await customer.mutation(api.domain.mutate, operation("push.revoke", { subscriptionId: saved.id }));
    expect(await customer.query(api.domain.query, operation("push.list"))).toEqual([]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("pushSubscriptions").withIndex("by_public_id", (q) => q.eq("publicId", saved.id)).unique()).toBeNull();
    });
    await expectCode(staff.query(api.domain.query, operation("push.list")), "FORBIDDEN");
  });

  it("resolves published gym branding in the authenticated member experience", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const [logoStorageId, coverStorageId] = await t.run(async (ctx) => [
      await ctx.storage.store(new NodeBlob(["logo"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["cover"]) as unknown as Blob),
    ]);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-a")).unique();
      const listing = organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym").eq("publicId", "gym-a")).unique() : null;
      expect(organization).not.toBeNull();
      expect(listing).not.toBeNull();
      const now = Date.now();
      const logo = await ctx.db.insert("mediaAssets", { organizationId: organization!._id, publicId: "logo-a", ownerType: "gym_logo", ownerPublicId: "org-a", storageId: logoStorageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: now, updatedAt: now });
      const cover = await ctx.db.insert("mediaAssets", { organizationId: organization!._id, publicId: "cover-a", ownerType: "gym_cover", ownerPublicId: "org-a", storageId: coverStorageId, contentType: "image/png", sizeBytes: 5, visibility: "public", status: "active", createdAt: now, updatedAt: now });
      await ctx.db.patch(listing!._id, { data: { ...listing!.data as Record<string, unknown>, logoAssetId: "logo-a", coverAssetId: "cover-a" }, updatedAt: now });
      expect(logo).toBeDefined();
      expect(cover).toBeDefined();
    });

    const experience = await t.withIdentity({ subject: "clerk-customer-a" }).query(api.domain.query, operation("customer.experience")) as { memberships: Array<{ gymLogoUrl?: string; gymCoverUrl?: string }> };
    expect(experience.memberships[0]).toMatchObject({ gymLogoUrl: expect.any(String), gymCoverUrl: expect.any(String) });
  });

  it("does not project private, stale, wrong-owner, or foreign gym media", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new NodeBlob(["logo"]) as unknown as Blob));
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationA = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-a")).unique();
      const organizationB = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-b")).unique();
      const listing = organizationA ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationA._id).eq("entityType", "marketplaceGym").eq("publicId", "gym-a")).unique() : null;
      expect(organizationA).not.toBeNull();
      expect(organizationB).not.toBeNull();
      expect(listing).not.toBeNull();
      const valid = await ctx.db.insert("mediaAssets", { organizationId: organizationA!._id, publicId: "media-valid-logo", ownerType: "gym_logo", ownerPublicId: "org-a", storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: now, updatedAt: now });
      const privateAsset = await ctx.db.insert("mediaAssets", { organizationId: organizationA!._id, publicId: "media-private-logo", ownerType: "gym_logo", ownerPublicId: "org-a", storageId, contentType: "image/png", sizeBytes: 4, visibility: "private", status: "active", createdAt: now, updatedAt: now });
      const wrongOwner = await ctx.db.insert("mediaAssets", { organizationId: organizationA!._id, publicId: "media-wrong-owner", ownerType: "gym_cover", ownerPublicId: "org-a", storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: now, updatedAt: now });
      const stale = await ctx.db.insert("mediaAssets", { organizationId: organizationA!._id, publicId: "media-stale-logo", ownerType: "gym_logo", ownerPublicId: "org-a", storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "replaced", createdAt: now, updatedAt: now });
      const foreign = await ctx.db.insert("mediaAssets", { organizationId: organizationB!._id, publicId: "media-foreign-logo", ownerType: "gym_logo", ownerPublicId: "org-b", storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: now, updatedAt: now });
      return { valid: String(valid), privateAsset: String(privateAsset), wrongOwner: String(wrongOwner), stale: String(stale), foreign: String(foreign), listingId: listing!._id };
    });

    const setLogo = async (logoAssetId: string) => {
      await t.run(async (ctx) => {
        const listing = await ctx.db.get(ids.listingId);
        await ctx.db.patch(ids.listingId, { data: { ...(listing?.data as Record<string, unknown>), logoAssetId }, updatedAt: Date.now() });
      });
      const experience = await t.withIdentity({ subject: "clerk-customer-a" }).query(api.domain.query, operation("customer.experience")) as { memberships: Array<{ gymLogoUrl?: string }> };
      return experience.memberships[0]?.gymLogoUrl;
    };

    expect(await setLogo("media-valid-logo")).toEqual(expect.any(String));
    for (const assetId of ["media-private-logo", "media-wrong-owner", "media-stale-logo", "media-foreign-logo"]) {
      expect(await setLogo(assetId)).toBeUndefined();
    }
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
      gender: "female",
      preferredDate: trialDate,
      preferredTime: "13:45",
      goal: "Strength",
    })) as TrialBookingResult;

    expect(booking).toMatchObject({ customerUserId: "user-a", customerId: "profile-a", email: "a@example.com", gymId: "gym-a", branchId: "directory-branch-a", preferredTime: "13:45", status: "requested" });
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

    await expectCode(customerA.mutation(api.domain.mutate, operation("customer.trial.create", {
      gymId: "gym-a", branchId: "directory-branch-a", fullName: "Customer A", phone: "+962799999991", preferredDate: trialDate, preferredTime: "18:00", goal: "Strength",
    })), "CONFLICT");

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
        preferredDate: trialDate,
        preferredTime: "18:00",
        goal: "Strength",
      })), "NOT_FOUND");
    }
    const routedRows = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "lead")).collect());
    expect(routedRows).toHaveLength(1);
  });

  it("creates an opaque member referral link and attributes the referred trial lead", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    await t.run(async (ctx) => {
      const settings = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "settings").eq("publicId", "settings")).unique())!;
      const value = settings.data as Record<string, unknown>;
      const operationalPolicies = value.operationalPolicies as Record<string, unknown>;
      await ctx.db.patch(settings._id, {
        data: {
          ...value,
          operationalPolicies: {
            ...operationalPolicies,
            referrals: { enabled: true, rewardDays: 7, maxRewardDaysPerWindow: 30, windowDays: 90 },
          },
        },
      });
    });
    const referrer = t.withIdentity({ subject: "clerk-customer-a" });
    const referred = t.withIdentity({ subject: "clerk-customer-b" });

    const program = await referrer.mutation(api.domain.mutate, operation("customer.referral.ensure", {
      membershipId: "membership-a-active",
    })) as { sharePath: string };
    expect(program.sharePath).toMatch(/^\/customer\/gyms\/gym-a\?ref=[0-9a-f-]+$/);
    expect(program.sharePath).not.toContain("member-a");
    expect(program.sharePath).not.toContain("Customer A");
    const token = new URL(program.sharePath, "https://rivet.jo").searchParams.get("ref");
    expect(token).toBeTruthy();

    const booking = await referred.mutation(api.domain.mutate, operation("customer.trial.create", {
      gymId: "gym-a",
      branchId: "directory-branch-a",
      preferredDate: trialDate,
      preferredTime: "13:45",
      goal: "Join a friend at the gym",
      gender: "female",
      referralToken: token,
    })) as TrialBookingResult;

    const persisted = await t.run(async (ctx) => {
      const lead = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "lead").eq("publicId", booking.leadId!)).unique();
      const link = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "referralLink").eq("publicId", token!)).unique();
      const audit = (await ctx.db.query("auditEvents").collect()).find((event) => event.action === "member.referral_link_created");
      return { lead: lead?.data, link: link?.data, audit };
    });
    expect(persisted.lead).toMatchObject({ source: "referral", referredByMemberId: "member-a" });
    expect(persisted.link).toMatchObject({ memberId: "member-a", membershipId: "membership-a-active", gymId: "gym-a", active: true });
    expect(persisted.audit).toMatchObject({ actorRole: "member", entityPublicId: "member-a" });
  });

  it("returns a dated reward history that never exposes the referred person", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    await t.run(async (ctx) => {
      const settings = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "settings").eq("publicId", "settings")).unique())!;
      const value = settings.data as Record<string, unknown>;
      const operationalPolicies = value.operationalPolicies as Record<string, unknown>;
      await ctx.db.patch(settings._id, { data: { ...value, operationalPolicies: { ...operationalPolicies, referrals: { enabled: true, rewardDays: 7, maxRewardDaysPerWindow: 30, windowDays: 90 } } } });
      const organization = (await ctx.db.query("organizations").collect())[0]!;
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "referralReward", publicId: "referral-member-friend", createdAt: now - 86_400_000, updatedAt: now, data: { id: "referral-member-friend", referrerId: "member-a", referrerName: "Customer A", referredMemberId: "member-friend", referredMemberName: "Secret Friend", days: 7, requestedDays: 7, status: "applied", createdAt: new Date(now - 86_400_000).toISOString() } });
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "member", publicId: "member-waiting", memberPublicId: "member-waiting", createdAt: now, updatedAt: now, data: { id: "member-waiting", fullName: "Waiting Person", memberNumber: "WAIT-1", status: "active", referredByMemberId: "member-a", homeBranchId: "branch-a", createdAt: new Date(now).toISOString() } });
    });

    const referrer = t.withIdentity({ subject: "clerk-customer-a" });
    const program = await referrer.mutation(api.domain.mutate, operation("customer.referral.ensure", { membershipId: "membership-a-active" })) as { history: Array<{ id: string; occurredAt: string; days: number; status: string }> };
    expect(program.history).toHaveLength(2);
    expect(program.history.map((event) => event.status).sort()).toEqual(["applied", "pending"]);
    expect(program.history.find((event) => event.status === "applied")).toMatchObject({ days: 7 });
    const serialized = JSON.stringify(program.history);
    expect(serialized).not.toContain("Secret Friend");
    expect(serialized).not.toContain("Waiting Person");
    expect(serialized).not.toContain("member-friend");
    expect(serialized).not.toContain("member-waiting");
  });

  it("replays customer trial requests idempotently with a privacy-safe guard", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });
    const input = {
      gymId: "gym-a",
      branchId: "directory-branch-a",
      fullName: "Customer A",
      email: "a@example.com",
      phone: "+962799999991",
      gender: "female",
      preferredDate: trialDate,
      preferredTime: "13:45",
      goal: "Strength",
      idempotencyKey: "trial-retry-key",
    };
    const first = await customerA.mutation(api.domain.mutate, operation("customer.trial.create", input)) as TrialBookingResult;
    const replay = await customerA.mutation(api.domain.mutate, operation("customer.trial.create", input)) as TrialBookingResult;
    expect(replay.id).toBe(first.id);
    await expectCode(customerA.mutation(api.domain.mutate, operation("customer.trial.create", { ...input, goal: "Different goal" })), "CONFLICT");
    const persisted = await t.run(async (ctx) => {
      const bookings = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect();
      const guards = await ctx.db.query("publicRequestGuards").collect();
      const retries = await ctx.db.query("publicRequestIdempotency").collect();
      return { bookings, guards, retries };
    });
    expect(persisted.bookings.filter((row) => row.publicId === first.id)).toHaveLength(1);
    expect(persisted.guards).toHaveLength(1);
    expect(persisted.retries).toHaveLength(1);
    expect(JSON.stringify(persisted.guards[0])).not.toContain("clerk-customer-a");
  });

  it("replaces expired customer trial retry state before reusing its key", async () => {
    const t = convexTest(schema, modules);
    await seedFixtures(t);
    const customerA = t.withIdentity({ subject: "clerk-customer-a" });
    const input = {
      gymId: "gym-a",
      branchId: "directory-branch-a",
      fullName: "Customer A",
      email: "a@example.com",
      phone: "+962799999991",
      gender: "female",
      preferredDate: trialDate,
      preferredTime: "15:45",
      goal: "Strength",
      idempotencyKey: "trial-expired-retry-key",
    };
    const scope = `customer.trial.create:${await privacyFingerprint("user-a")}`;
    await t.run(async (ctx) => {
      await ctx.db.insert("publicRequestIdempotency", {
        scope,
        key: input.idempotencyKey,
        requestHash: "expired-hash",
        result: { bookingId: "expired-booking" },
        createdAt: Date.now() - 86_400_000,
        expiresAt: Date.now() - 1,
      });
    });
    const booking = await customerA.mutation(api.domain.mutate, operation("customer.trial.create", input)) as TrialBookingResult;
    expect(booking).toMatchObject({ gymId: "gym-a", status: "requested" });
    const retries = await t.run((ctx) => ctx.db.query("publicRequestIdempotency").withIndex("by_scope_key", (q) => q.eq("scope", scope).eq("key", input.idempotencyKey)).collect());
    expect(retries).toHaveLength(1);
    expect(retries[0]?.expiresAt).toBeGreaterThan(Date.now());
    expect(retries[0]?.result).toMatchObject({ bookingId: booking.id });
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
      await expectCode(actor.query(api.domain.query, operation("customer.finance.summary")), "FORBIDDEN");
      await expectCode(actor.query(api.domain.query, operation("customer.finance.transactions")), "FORBIDDEN");
      await expectCode(actor.query(api.domain.query, operation("customer.receipt", { receiptId: "receipt-a" })), "FORBIDDEN");
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
