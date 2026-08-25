import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-pt-${name}`, ...extra });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

function dateInDays(days: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-pt", name: "PT Gym", slug: "pt-gym", status: "active", timezone: "UTC", currency: "JOD", nextReceiptNumber: 1, receiptPrefix: "PT", createdAt: now, updatedAt: now });
    const foreignOrganization = await ctx.db.insert("organizations", { publicId: "org-pt-foreign", name: "Foreign Gym", slug: "foreign-pt-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "pt-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const foreignBranch = await ctx.db.insert("branches", { organizationId: foreignOrganization, publicId: "foreign-branch", name: "Foreign", code: "FRN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "pt-owner", authSubject: "clerk-pt-owner", email: "owner@pt.example", fullName: "PT Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const trainer = await ctx.db.insert("users", { publicId: "pt-trainer", authSubject: "clerk-pt-trainer", email: "trainer@pt.example", fullName: "PT Trainer", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const receptionist = await ctx.db.insert("users", { publicId: "pt-reception", authSubject: "clerk-pt-reception", email: "reception@pt.example", fullName: "PT Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const foreignOwner = await ctx.db.insert("users", { publicId: "pt-foreign-owner", authSubject: "clerk-pt-foreign-owner", email: "owner@foreign.example", fullName: "Foreign Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "pt-customer-user", authSubject: "clerk-pt-customer", email: "member@pt.example", fullName: "PT Member", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "pt-foreign-customer", authSubject: "clerk-pt-foreign-customer", email: "member@foreign.example", fullName: "Foreign Member", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: trainer, role: "trainer", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionist, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: foreignOrganization, userId: foreignOwner, role: "owner", branchIds: [foreignBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("customerProfiles", { publicId: "customer-pt", userId: "pt-customer-user", name: "PT Member", nameAr: "عضو", email: "member@pt.example", phone: "+962790000001", initials: "PM", context: "RIVET member", createdAt: now, updatedAt: now });
    await ctx.db.insert("customerProfiles", { publicId: "customer-foreign", userId: "pt-foreign-customer", name: "Foreign Member", nameAr: "عضو", email: "member@foreign.example", phone: "+962790000002", initials: "FM", context: "RIVET member", createdAt: now, updatedAt: now });

    const insertRecord = async (orgId: typeof organization, branchId: typeof branch, entityType: string, publicId: string, value: Record<string, unknown>) => await ctx.db.insert("domainRecords", { organizationId: orgId, entityType, publicId, branchId, memberPublicId: entityType === "member" ? publicId : undefined, createdAt: now, updatedAt: now, data: { id: publicId, ...value } });
    await insertRecord(organization, branch, "member", "pt-member", { fullName: "PT Member", email: "member@pt.example", phone: "+962790000001", memberNumber: "MAIN-PT-1", homeBranchId: "pt-branch", status: "active", createdAt: new Date(now).toISOString() });
    await insertRecord(organization, branch, "plan", "pt-plan", { name: "PT Membership", code: "PT", kind: "time", durationDays: 60, basePrice: { amount: 80_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 5, includedPtSessions: 0, status: "active" });
    await insertRecord(organization, branch, "membership", "pt-membership", { memberId: "pt-member", planId: "pt-plan", homeBranchId: "pt-branch", startDate: dateInDays(-2), endDate: dateInDays(45), salePrice: { amount: 80_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, status: "active", frozenDaysUsed: 0, freezes: [] });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "customerMembership", publicId: "pt-membership", branchId: branch, memberPublicId: "pt-member", createdAt: now, updatedAt: now, data: { id: "pt-membership", customerUserId: "pt-customer-user", customerId: "customer-pt", gymId: "org-pt", branchId: "pt-branch", memberId: "pt-member", membershipId: "pt-membership", memberNumber: "MAIN-PT-1", planName: "PT Membership", status: "active", startDate: dateInDays(-2), endDate: dateInDays(45), visitsThisMonth: 0, balanceMinor: 0, lastCheckInAt: new Date(now).toISOString() } });

    const trainerProfile = await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "trainer-profile", userId: trainer, displayName: "Coach Lina", specialties: ["Strength"], languages: ["en", "ar"], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    const bookingDate = dateInDays(2);
    const weekday = weekdays[new Date(`${bookingDate}T12:00:00Z`).getUTCDay()]!;
    await ctx.db.insert("ptAvailabilityRules", { organizationId: organization, publicId: "availability-1", trainerProfileId: trainerProfile, branchId: branch, weekday, startMinute: 8 * 60, endMinute: 11 * 60, active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("ptPackages", { organizationId: organization, publicId: "package-12", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 240_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
  });
}

describe("Convex personal-training lifecycle", () => {
  it("projects trainer photos only when the active public asset belongs to that trainer", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const assetIds = await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-pt")).unique();
      const foreignOrganization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-pt-foreign")).unique();
      const trainer = organization ? await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "trainer-profile")).unique() : null;
      expect(organization).not.toBeNull();
      expect(foreignOrganization).not.toBeNull();
      expect(trainer).not.toBeNull();
      const storageId = await ctx.storage.store(new NodeBlob(["trainer-photo"], { type: "image/png" }) as unknown as Blob);
      const insert = async (organizationId: NonNullable<typeof organization>, publicId: string, ownerPublicId: string, visibility: "public" | "private", status: "active" | "replaced") => await ctx.db.insert("mediaAssets", { organizationId: organizationId._id, publicId, ownerType: "trainer_photo", ownerPublicId, storageId, contentType: "image/png", sizeBytes: 13, visibility, status, createdAt: now, updatedAt: now });
      const valid = await insert(organization!, "pt-photo-valid", "trainer-profile", "public", "active");
      const privateAsset = await insert(organization!, "pt-photo-private", "trainer-profile", "private", "active");
      const wrongOwner = await insert(organization!, "pt-photo-wrong-owner", "another-trainer", "public", "active");
      const stale = await insert(organization!, "pt-photo-stale", "trainer-profile", "public", "replaced");
      const foreign = await insert(foreignOrganization!, "pt-photo-foreign", "trainer-profile", "public", "active");
      return { trainerId: trainer!._id, valid: String(valid), privateAsset: String(privateAsset), wrongOwner: String(wrongOwner), stale: String(stale), foreign: String(foreign) };
    });

    const setPhoto = async (photoAssetId: string) => {
      await t.run(async (ctx) => ctx.db.patch(assetIds.trainerId, { photoAssetId }));
      const experience = await t.withIdentity({ subject: "clerk-pt-customer" }).query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as { trainers: Array<{ photoUrl?: string }> };
      return experience.trainers[0]?.photoUrl;
    };

    expect(await setPhoto("pt-photo-valid")).toEqual(expect.any(String));
    for (const photoAssetId of ["pt-photo-private", "pt-photo-wrong-owner", "pt-photo-stale", "pt-photo-foreign"]) {
      expect(await setPhoto(photoAssetId)).toBeUndefined();
    }
  });

  it("keeps trainer uploads pending until the profile mutation links and activates them", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-pt-owner" });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new NodeBlob(["pending-trainer-photo"], { type: "image/png" }) as unknown as Blob));
    const pending = await owner.mutation(internal.media.commit, {
      organizationId: "org-pt",
      correlationId: "cor-pt-trainer-photo-pending",
      ownerType: "trainer_photo",
      ownerPublicId: "trainer-profile",
      altText: "Coach Lina during a strength session",
      contentType: "image/png",
      sizeBytes: 20,
      storageId,
    });
    expect(pending.status).toBe("pending");

    const profile = await owner.mutation(api.domain.mutate, operation("pt.trainer.upsert", {
      id: "trainer-profile",
      userId: "pt-trainer",
      displayName: "Coach Lina",
      specialties: ["Strength"],
      languages: ["en", "ar"],
      branchIds: ["pt-branch"],
      status: "published",
      photoAssetId: pending.id,
      photoAlt: "Coach Lina during a strength session",
    })) as { photoUrl?: string };
    expect(profile.photoUrl).toEqual(expect.any(String));

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-pt")).unique();
      const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", pending.id)).unique();
      expect(asset).toMatchObject({ status: "active", ownerType: "trainer_photo", ownerPublicId: "trainer-profile" });
      expect(asset).not.toHaveProperty("deleteAfter");
    });
  });

  it("allows arbitrary package terms while preserving existing order terms and supports unpaid cancellation", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-pt-owner" });
    const customer = t.withIdentity({ subject: "clerk-pt-customer" });

    const requested = await customer.mutation(api.domain.mutate, operation("customer.pt.package.request", { membershipId: "pt-membership", packageId: "package-12", idempotencyKey: "snapshot-request" })) as { id: string; status: string };
    const edited = await owner.mutation(api.domain.mutate, operation("pt.package.upsert", { id: "package-12", name: "Foundations 15", sessionCount: 15, totalPrice: { amount: 135_000, currency: "JOD" }, validityDays: 120, branchAccess: "all", branchIds: [], status: "active" })) as { name: string; sessionCount: number };
    expect(edited).toMatchObject({ name: "Foundations 15", sessionCount: 15 });
    const historical = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as { orders: Array<{ id: string; packageName: string; sessionCountSnapshot: number; totalPriceSnapshot: { amount: number } }> };
    expect(historical.orders[0]).toMatchObject({ id: requested.id, packageName: "12 PT sessions", sessionCountSnapshot: 12, totalPriceSnapshot: { amount: 240_000 } });

    await expectCode(owner.mutation(api.domain.mutate, operation("pt.package.delete", { packageId: "package-12", reason: "Attempted catalog cleanup" })), "CONFLICT");
    await owner.mutation(api.domain.mutate, operation("pt.package.upsert", { name: "Unused 40", sessionCount: 40, totalPrice: { amount: 320_000, currency: "JOD" }, validityDays: 120, branchAccess: "all", branchIds: [], status: "active" }));
    const unused = await owner.query(api.domain.query, operation("pt.workspace")) as { packages: Array<{ id: string; name: string }> };
    const unusedPackage = unused.packages.find((item) => item.name === "Unused 40")!;
    await expect(owner.mutation(api.domain.mutate, operation("pt.package.delete", { packageId: unusedPackage.id, reason: "Created in error" }))).resolves.toMatchObject({ id: unusedPackage.id });

    const cancelled = await owner.mutation(api.domain.mutate, operation("pt.package.cancel", { orderId: requested.id, reason: "Member selected a different package", idempotencyKey: "cancel-snapshot-request" })) as { status: string; cancellationReason: string };
    expect(cancelled).toMatchObject({ status: "cancelled", cancellationReason: "Member selected a different package" });
    const replay = await owner.mutation(api.domain.mutate, operation("pt.package.cancel", { orderId: requested.id, reason: "Member selected a different package", idempotencyKey: "cancel-snapshot-request" })) as { status: string };
    expect(replay.status).toBe("cancelled");
    const charge = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "charge")).collect())[0]);
    expect(charge?.data).toMatchObject({ status: "void", outstandingAmount: { amount: 0 } });
  });

  it("keeps package payment, credits, booking, cancellation and refund atomic", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-pt-owner" });
    const customer = t.withIdentity({ subject: "clerk-pt-customer" });

    const requested = await customer.mutation(api.domain.mutate, operation("customer.pt.package.request", { membershipId: "pt-membership", packageId: "package-12", idempotencyKey: "package-request-1" })) as { id: string; chargeId: string; status: string };
    const replay = await customer.mutation(api.domain.mutate, operation("customer.pt.package.request", { membershipId: "pt-membership", packageId: "package-12", idempotencyKey: "package-request-1" })) as { id: string };
    expect(replay.id).toBe(requested.id);
    expect(requested.status).toBe("pending_payment");

    await expectCode(owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "pt-member", chargeId: requested.chargeId, amount: { amount: 120_000, currency: "JOD" }, method: "card", idempotencyKey: "pt-pay-missing-ref" })), "VALIDATION_ERROR");
    await owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "pt-member", chargeId: requested.chargeId, amount: { amount: 120_000, currency: "JOD" }, method: "card", externalReference: "POS-PT-1", idempotencyKey: "pt-pay-1" }));
    let experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as { availableSessions: number; orders: Array<{ status: string }> };
    expect(experience.availableSessions).toBe(0);
    expect(experience.orders[0]?.status).toBe("pending_payment");

    await owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "pt-member", chargeId: requested.chargeId, amount: { amount: 120_000, currency: "JOD" }, method: "cliq", externalReference: "CLIQ-PT-2", idempotencyKey: "pt-pay-2" }));
    experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as typeof experience;
    expect(experience.availableSessions).toBe(12);
    expect(experience.orders[0]?.status).toBe("active");

    const bookingDate = dateInDays(2);
    const slots = await customer.query(api.domain.query, operation("customer.pt.slots", { membershipId: "pt-membership", trainerProfileId: "trainer-profile", branchId: "pt-branch", from: bookingDate, to: bookingDate })) as Array<{ startsAt: string }>;
    expect(slots).toHaveLength(3);
    const booked = await customer.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "pt-membership", trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[0]!.startsAt, idempotencyKey: "booking-1" })) as { id: string; status: string };
    const bookingReplay = await customer.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "pt-membership", trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[0]!.startsAt, idempotencyKey: "booking-1" })) as { id: string };
    expect(bookingReplay.id).toBe(booked.id);
    await expectCode(customer.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "pt-membership", trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[0]!.startsAt, idempotencyKey: "booking-collision" })), "CONFLICT");
    experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as typeof experience & { reservedSessions: number };
    expect(experience).toMatchObject({ availableSessions: 11, reservedSessions: 1 });

    const rescheduled = await customer.mutation(api.domain.mutate, operation("customer.pt.booking.reschedule", { bookingId: booked.id, trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[1]!.startsAt, reason: "Member changed the session time", idempotencyKey: "reschedule-1" })) as { id: string; startsAt: string };
    expect(rescheduled).toMatchObject({ id: booked.id, startsAt: slots[1]!.startsAt });
    const rescheduleReplay = await customer.mutation(api.domain.mutate, operation("customer.pt.booking.reschedule", { bookingId: booked.id, trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[1]!.startsAt, reason: "Member changed the session time", idempotencyKey: "reschedule-1" })) as { startsAt: string };
    expect(rescheduleReplay.startsAt).toBe(slots[1]!.startsAt);
    experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as typeof experience & { reservedSessions: number };
    expect(experience).toMatchObject({ availableSessions: 11, reservedSessions: 1 });

    await customer.mutation(api.domain.mutate, operation("customer.pt.booking.cancel", { bookingId: booked.id, reason: "Member schedule changed" }));
    experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as typeof experience & { reservedSessions: number };
    expect(experience).toMatchObject({ availableSessions: 12, reservedSessions: 0 });

    const order = await owner.mutation(api.domain.mutate, operation("pt.package.refund", { orderId: requested.id, sessions: 2, reason: "Unused sessions refunded at member request" })) as { status: string; refundedSessions: number; refundedAmount: { amount: number } };
    expect(order).toMatchObject({ status: "partially_refunded", refundedSessions: 2, refundedAmount: { amount: 40_000 } });
    experience = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as typeof experience;
    expect(experience.availableSessions).toBe(10);

    const persisted = await t.run(async (ctx) => ({
      ledger: await ctx.db.query("ptCreditLedger").collect(),
      audits: await ctx.db.query("auditEvents").collect(),
      charges: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "charge")).collect(),
    }));
    expect(persisted.ledger.map((entry) => entry.type)).toEqual(expect.arrayContaining(["grant", "reserve", "release", "refund_revoke"]));
    expect(persisted.audits.map((event) => event.action)).toEqual(expect.arrayContaining(["pt.package.request", "pt.booking.create", "pt.booking.reschedule", "pt.booking.cancel", "pt.package.refund"]));
    expect(persisted.charges[0]?.data).toMatchObject({ status: "paid", outstandingAmount: { amount: 0 } });
  });

  it("enforces customer ownership and role boundaries without disclosing foreign records", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const customer = t.withIdentity({ subject: "clerk-pt-customer" });
    const foreignCustomer = t.withIdentity({ subject: "clerk-pt-foreign-customer" });
    const trainer = t.withIdentity({ subject: "clerk-pt-trainer" });
    const reception = t.withIdentity({ subject: "clerk-pt-reception" });

    await expectCode(foreignCustomer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })), "NOT_FOUND");
    await expectCode(foreignCustomer.mutation(api.domain.mutate, operation("customer.pt.package.request", { membershipId: "pt-membership", packageId: "package-12", idempotencyKey: "foreign" })), "NOT_FOUND");
    await expectCode(trainer.mutation(api.domain.mutate, operation("pt.package.upsert", { name: "12 sessions", sessionCount: 12, totalPrice: { amount: 120_000, currency: "JOD" }, validityDays: 90, branchAccess: "all", branchIds: [], status: "active" })), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("pt.trainer.upsert", { userId: "pt-trainer", displayName: "Coach Lina", specialties: [], languages: ["en"], branchIds: ["pt-branch"], status: "published" })), "FORBIDDEN");

    const trainerWorkspace = await trainer.query(api.domain.query, operation("pt.workspace")) as {
      trainers: Array<{ id: string }>;
      packages: unknown[];
      pendingOrders: unknown[];
      metrics: { packageRevenue: { amount: number } };
    };
    expect(trainerWorkspace.trainers.map((item) => item.id)).toEqual(["trainer-profile"]);
    expect(trainerWorkspace.packages).toEqual([]);
    expect(trainerWorkspace.pendingOrders).toEqual([]);
    expect(trainerWorkspace.metrics.packageRevenue.amount).toBe(0);

    const owned = await customer.query(api.domain.query, operation("customer.pt", { membershipId: "pt-membership" })) as { trainers: Array<{ id: string }>; packages: Array<{ id: string }> };
    expect(owned.trainers.map((item) => item.id)).toEqual(["trainer-profile"]);
    expect(owned.packages.map((item) => item.id)).toEqual(["package-12"]);
  });

  it("grants introductory credits once and protects trainers with future bookings", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-pt-owner" });

    const preview = await owner.query(api.domain.query, operation("pt.introductory.preview", { sessionCount: 2 })) as { eligibleMemberships: number; alreadyGranted: number };
    expect(preview).toEqual(expect.objectContaining({ eligibleMemberships: 1, alreadyGranted: 0 }));
    const applied = await owner.mutation(api.domain.mutate, operation("pt.introductory.apply", { sessionCount: 2, reason: "Pilot introduction approved by owner", idempotencyKey: "intro-1" })) as { grantedMemberships: number; migrationId: string };
    expect(applied.grantedMemberships).toBe(1);
    const replay = await owner.mutation(api.domain.mutate, operation("pt.introductory.apply", { sessionCount: 2, reason: "Pilot introduction approved by owner", idempotencyKey: "intro-1" })) as { migrationId: string };
    expect(replay.migrationId).toBe(applied.migrationId);

    const bookingDate = dateInDays(2);
    const slots = await owner.query(api.domain.query, operation("pt.slots", { trainerProfileId: "trainer-profile", branchId: "pt-branch", from: bookingDate, to: bookingDate })) as Array<{ startsAt: string }>;
    const futureBooking = await owner.mutation(api.domain.mutate, operation("pt.booking.create", { membershipId: "pt-membership", trainerProfileId: "trainer-profile", branchId: "pt-branch", startsAt: slots[0]!.startsAt, idempotencyKey: "intro-booking" })) as { id: string };
    const trainer = t.withIdentity({ subject: "clerk-pt-trainer" });
    await expectCode(trainer.mutation(api.domain.mutate, operation("pt.booking.complete", { bookingId: futureBooking.id })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("users.update", { userId: "pt-trainer", status: "deactivated" })), "CONFLICT");

    const stored = await t.run(async (ctx) => ({
      grants: (await ctx.db.query("ptEntitlements").collect()).filter((item) => item.grantKind === "introductory"),
      audits: (await ctx.db.query("auditEvents").collect()).filter((item) => item.action === "pt.introductory_credits.apply"),
    }));
    expect(stored.grants).toHaveLength(1);
    expect(stored.audits).toHaveLength(1);
  });
});
