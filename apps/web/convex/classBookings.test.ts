import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { addDays, todayISODate } from "../src/lib/utils/dates";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const today = todayISODate("Asia/Amman", new Date(now));
    const organization = await ctx.db.insert("organizations", { publicId: "org-class-booking", name: "Booking Gym", slug: "booking-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-class-booking", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-class-booking", authSubject: "clerk-owner-class-booking", email: "owner@class.example", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const reception = await ctx.db.insert("users", { publicId: "reception-class-booking", authSubject: "clerk-reception-class-booking", email: "reception@class.example", fullName: "Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const customerA = await ctx.db.insert("users", { publicId: "customer-class-a", authSubject: "clerk-customer-class-a", email: "a@class.example", fullName: "Aisha", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const customerB = await ctx.db.insert("users", { publicId: "customer-class-b", authSubject: "clerk-customer-class-b", email: "b@class.example", fullName: "Basel", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branch], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    await ctx.db.insert("customerProfiles", { publicId: "profile-class-a", userId: "customer-class-a", name: "Aisha", nameAr: "Aisha", email: "a@class.example", phone: "+962790000001", gender: "female", initials: "A", context: "RIVET member", createdAt: now, updatedAt: now });
    await ctx.db.insert("customerProfiles", { publicId: "profile-class-b", userId: "customer-class-b", name: "Basel", nameAr: "Basel", email: "b@class.example", phone: "+962790000002", gender: "male", initials: "B", context: "RIVET member", createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, data: Record<string, unknown>, memberPublicId?: string) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, memberPublicId, customerUserPublicId: entityType === "customerMembership" ? String(data.customerUserId) : undefined, customerProfilePublicId: entityType === "customerMembership" ? String(data.customerId) : undefined, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: "org-class-booking", ...data } });
    await insertRecord("plan", "plan-classes", { name: "All access", status: "active", branchAccess: "all", branchIds: [] });
    for (const member of [
      { id: "member-class-a", name: "Aisha", gender: "female", profileId: "profile-class-a", userId: "customer-class-a", membershipId: "membership-class-a" },
      { id: "member-class-b", name: "Basel", gender: "male", profileId: "profile-class-b", userId: "customer-class-b", membershipId: "membership-class-b" },
    ]) {
      await insertRecord("member", member.id, { fullName: member.name, memberNumber: member.id, status: "active", gender: member.gender, homeBranchId: "branch-class-booking", customerProfileId: member.profileId }, member.id);
      await insertRecord("membership", member.membershipId, { memberId: member.id, planId: "plan-classes", homeBranchId: "branch-class-booking", startDate: addDays(today, -30), endDate: addDays(today, 90) }, member.id);
      await insertRecord("customerMembership", member.membershipId, { customerUserId: member.userId, customerId: member.profileId, memberId: member.id, membershipId: member.membershipId, gymId: "org-class-booking", branchId: "branch-class-booking", memberNumber: member.id, planName: "All access", status: "active", startDate: addDays(today, -30), endDate: addDays(today, 90) }, member.id);
    }
    await insertRecord("settings", "settings", { operationalPolicies: { classBooking: { enabled: true, eligibilityMode: "all_active_memberships", eligiblePlanIds: [], bookingHorizonDays: 30, cancellationCutoffHours: 2, maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 4, noShowTracking: true } } });
    return { customerA, customerB, today };
  });
}

afterEach(() => vi.useRealTimers());

describe("dated class booking", () => {
  it("books atomically, waitlists at capacity, promotes FIFO, and enforces ownership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const b = t.withIdentity({ subject: "clerk-customer-class-b" });
    const date = addDays(fixture.today, 2);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Small group", dayOfWeek: weekday, startMinute: 18 * 60, durationMinutes: 60, capacity: 1, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:${date}`;

    const first = await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId })) as { outcome: string; occurrence: { booking: { id: string } } };
    expect(first.outcome).toBe("booked");
    const duplicate = await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId })) as { outcome: string };
    expect(duplicate.outcome).toBe("booked");
    const second = await b.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId })) as { outcome: string; occurrence: { booking: { id: string; position: number } } };
    expect(second).toMatchObject({ outcome: "waitlisted", occurrence: { booking: { position: 1 } } });

    await expectCode(b.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-b", occurrenceId, bookingId: first.occurrence.booking.id })), "NOT_FOUND");
    const cancelled = await a.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-a", occurrenceId, bookingId: first.occurrence.booking.id })) as { outcome: string; promotedMemberId: string };
    expect(cancelled).toMatchObject({ outcome: "cancelled", promotedMemberId: "member-class-b" });

    const persisted = await t.run(async (ctx) => ({ bookings: await ctx.db.query("classBookings").collect(), notifications: await ctx.db.query("operationalNotifications").collect() }));
    expect(persisted.bookings.find((booking) => booking.memberPublicId === "member-class-b")).toMatchObject({ status: "booked", fromWaitlist: true });
    expect(persisted.notifications).toEqual([expect.objectContaining({ kind: "class_waitlist_promoted", recipientUserId: fixture.customerB })]);
  });

  it("blocks audience mismatches for members and requires a reason for staff override", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const reception = t.withIdentity({ subject: "clerk-reception-class-booking" });
    const member = t.withIdentity({ subject: "clerk-customer-class-b" });
    const date = addDays(fixture.today, 3);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Women strength", dayOfWeek: weekday, startMinute: 10 * 60, durationMinutes: 60, capacity: 8, audience: "women" })) as { id: string };
    const occurrenceId = `occ:${template.id}:${date}`;
    await expectCode(member.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId })), "VALIDATION_ERROR");
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.occurrence.roster.add", { occurrenceId, memberId: "member-class-b" })), "VALIDATION_ERROR");
    const overridden = await reception.mutation(api.domain.mutate, operation("classes.occurrence.roster.add", { occurrenceId, memberId: "member-class-b", overrideReason: "Member confirmed the booking with reception." })) as { bookedCount: number };
    expect(overridden.bookedCount).toBe(1);
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).find((event) => event.action === "classes.booking.create"));
    expect(audit).toMatchObject({ reason: "Member confirmed the booking with reception." });
  });

  it("enforces the member booking horizon at the mutation boundary", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const member = t.withIdentity({ subject: "clerk-customer-class-a" });
    const date = addDays(fixture.today, 31);
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Future conditioning", dayOfWeek: weekday, startMinute: 18 * 60, durationMinutes: 60, capacity: 8, audience: "mixed" })) as { id: string };

    await expectCode(member.mutation(api.domain.mutate, operation("customer.classes.book", {
      membershipId: "membership-class-a",
      occurrenceId: `occ:${template.id}:${date}`,
    })), "VALIDATION_ERROR");
  });

  it("finalizes no-shows and snapshots substitute coach pay without money writes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T05:00:00.000Z"));
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const reception = t.withIdentity({ subject: "clerk-reception-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const date = "2026-09-02";
    const coach = await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Rana", payPerClassMinor: 15_000 })) as { id: string };
    const substitute = await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Dana", payPerClassMinor: 20_000 })) as { id: string };
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Conditioning", coachId: coach.id, dayOfWeek: 3, startMinute: 8 * 60, durationMinutes: 60, capacity: 5, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:${date}`;
    await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));
    await owner.mutation(api.domain.mutate, operation("classes.occurrence.coach.substitute", { occurrenceId, coachId: substitute.id, reason: "Regular coach is unavailable." }));

    vi.setSystemTime(new Date("2026-09-02T07:30:00.000Z"));
    const finalized = await reception.mutation(api.domain.mutate, operation("classes.occurrence.attendance.finalize", { occurrenceId })) as { status: string };
    expect(finalized.status).toBe("completed");
    const report = await owner.query(api.domain.query, operation("classes.coachPayout", { month: "2026-09", coachId: substitute.id })) as { total: { amount: number }; lines: Array<{ substituted: boolean; rate: { amount: number } }> };
    expect(report).toMatchObject({ total: { amount: 20_000 }, lines: [{ substituted: true, rate: { amount: 20_000 } }] });
    const staffView = await owner.query(api.domain.query, operation("classes.occurrences.list", { branchId: "branch-class-booking", fromDate: date, toDate: date })) as Array<{ roster: Array<{ memberId: string; noShowCount: number }> }>;
    expect(staffView[0]?.roster[0]).toMatchObject({ memberId: "member-class-a", noShowCount: 1 });
    const persisted = await t.run(async (ctx) => ({ bookings: await ctx.db.query("classBookings").collect(), stats: await ctx.db.query("classMemberStats").collect(), payments: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect() }));
    expect(persisted.bookings[0]).toMatchObject({ status: "no_show" });
    expect(persisted.stats).toEqual([expect.objectContaining({ memberPublicId: "member-class-a", noShowCount: 1 })]);
    expect(persisted.payments).toHaveLength(0);
  });
});
