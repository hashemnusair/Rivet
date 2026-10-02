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
  it("cancels one date atomically without waitlist promotion, late marks, or repeat audit events", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const reception = t.withIdentity({ subject: "clerk-reception-class-booking" });
    const member = t.withIdentity({ subject: "clerk-customer-class-a" });
    const other = t.withIdentity({ subject: "clerk-customer-class-b" });
    const date = addDays(fixture.today, 2);
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Small group", dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), startMinute: 1080, durationMinutes: 60, capacity: 1, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:${date}`;
    await member.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));
    await other.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId }));
    const cancel = operation("classes.occurrence.cancel", { occurrenceId, reason: "Coach unavailable" });
    await expectCode(reception.mutation(api.domain.mutate, cancel), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.occurrence.cancel", { occurrenceId, reason: "" })), "VALIDATION_ERROR");
    expect(await owner.mutation(api.domain.mutate, cancel)).toMatchObject({ status: "cancelled", cancelReason: "Coach unavailable", bookedCount: 0, waitlistCount: 0 });
    await owner.mutation(api.domain.mutate, cancel);
    await expectCode(member.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.occurrence.attendance.finalize", { occurrenceId })), "CONFLICT");
    const calendar = await member.query(api.domain.query, operation("customer.classes", { membershipId: "membership-class-a" })) as { upcoming: Array<{ id: string }> };
    expect(calendar.upcoming.find(row => row.id === occurrenceId)).toMatchObject({ status: "cancelled", cancelReason: "Coach unavailable", canBook: false, booking: { status: "cancelled" } });
    await t.run(async ctx => {
      expect((await ctx.db.query("classBookings").collect()).map(row => row.status)).toEqual(["cancelled", "cancelled"]);
      expect(await ctx.db.query("operationalNotifications").collect()).toHaveLength(0);
      expect((await ctx.db.query("auditEvents").collect()).filter(row => row.action === "classes.occurrence.cancel")).toHaveLength(1);
      expect((await ctx.db.query("classSessions").collect())[0]?.status).toBe("scheduled");
    });
    // The following week's occurrence remains open.
    expect(await owner.query(api.domain.query, operation("classes.occurrences.list", { branchId: "branch-class-booking", fromDate: addDays(date, 7), toDate: addDays(date, 7) }))).toEqual([expect.objectContaining({ status: "scheduled" })]);
  });

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
    const coach = await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Rana" })) as { id: string };
    const substitute = await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Dana" })) as { id: string };
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Conditioning", coachId: coach.id, dayOfWeek: 3, startMinute: 8 * 60, durationMinutes: 60, capacity: 5, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:${date}`;
    await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));
    await owner.mutation(api.domain.mutate, operation("classes.occurrence.coach.substitute", { occurrenceId, coachId: substitute.id, reason: "Regular coach is unavailable." }));

    vi.setSystemTime(new Date("2026-09-02T07:30:00.000Z"));
    // Reception marks attendance; only a manager or owner may finalize it.
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.occurrence.attendance.finalize", { occurrenceId })), "FORBIDDEN");
    const finalized = await owner.mutation(api.domain.mutate, operation("classes.occurrence.attendance.finalize", { occurrenceId })) as { status: string };
    expect(finalized.status).toBe("completed");
    const staffView = await owner.query(api.domain.query, operation("classes.occurrences.list", { branchId: "branch-class-booking", fromDate: date, toDate: date })) as Array<{ roster: Array<{ memberId: string; noShowCount: number }> }>;
    expect(staffView[0]?.roster[0]).toMatchObject({ memberId: "member-class-a", noShowCount: 1 });
    const persisted = await t.run(async (ctx) => ({ bookings: await ctx.db.query("classBookings").collect(), stats: await ctx.db.query("classMemberStats").collect(), payments: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect() }));
    expect(persisted.bookings[0]).toMatchObject({ status: "no_show" });
    expect(persisted.stats).toEqual([expect.objectContaining({ memberPublicId: "member-class-a", noShowCount: 1 })]);
    expect(persisted.payments).toHaveLength(0);
  });
});

describe("dated class booking integrity", () => {
  it("records leaving the waitlist as a plain cancellation, promotes on a late seat release, and repeats safely", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T05:00:00.000Z"));
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const b = t.withIdentity({ subject: "clerk-customer-class-b" });
    // Wednesday 2 September, 08:00 Amman (05:00Z), one seat.
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Sunrise spin", dayOfWeek: 3, startMinute: 8 * 60, durationMinutes: 60, capacity: 1, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:2026-09-02`;
    await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));
    expect((await b.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId })) as { outcome: string }).outcome).toBe("waitlisted");

    // One hour before the start: inside the two-hour cutoff.
    vi.setSystemTime(new Date("2026-09-02T04:00:00.000Z"));
    const left = await b.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-b", occurrenceId })) as { outcome: string };
    expect(left.outcome).toBe("cancelled");
    expect((await b.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId })) as { outcome: string }).outcome).toBe("waitlisted");

    const late = await a.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-a", occurrenceId })) as { outcome: string; promotedMemberId?: string };
    expect(late).toMatchObject({ outcome: "late_cancelled", promotedMemberId: "member-class-b" });
    // A second tap reports what already happened instead of "not found".
    const repeat = await a.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-a", occurrenceId })) as { outcome: string };
    expect(repeat.outcome).toBe("late_cancelled");

    const bookings = await t.run(async (ctx) => await ctx.db.query("classBookings").collect());
    expect(bookings.filter((booking) => booking.memberPublicId === "member-class-b").map((booking) => booking.status).sort()).toEqual(["booked", "cancelled"]);
    expect(bookings.find((booking) => booking.memberPublicId === "member-class-b" && booking.status === "booked")).toMatchObject({ fromWaitlist: true });
    expect(bookings.filter((booking) => booking.memberPublicId === "member-class-a")).toHaveLength(1);
    expect(bookings.find((booking) => booking.memberPublicId === "member-class-a")).toMatchObject({ status: "late_cancelled" });
  });

  it("keeps upcoming dated classes in step with the timetable and fills freed seats from the waitlist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T05:00:00.000Z"));
    const t = convexTest(schema, modules);
    const fixture = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const b = t.withIdentity({ subject: "clerk-customer-class-b" });
    const base = { branchId: "branch-class-booking", dayOfWeek: 3, durationMinutes: 60, audience: "mixed" };
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, name: "Conditioning", startMinute: 8 * 60, capacity: 1 })) as { id: string };
    const occurrenceId = `occ:${template.id}:2026-09-02`;
    await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));
    await b.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-b", occurrenceId }));

    // Rename, move within the same weekday, and open a second seat.
    await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, sessionId: template.id, name: "Conditioning II", startMinute: 9 * 60, capacity: 2 }));
    const listed = await owner.query(api.domain.query, operation("classes.occurrences.list", { branchId: "branch-class-booking", fromDate: "2026-09-02", toDate: "2026-09-02" })) as Array<{ id: string; name: string; capacity: number; bookedCount: number; waitlistCount: number; startsAt: string; roster: Array<{ memberId: string; status: string; fromWaitlist: boolean }> }>;
    expect(listed.find((item) => item.id === occurrenceId)).toMatchObject({ name: "Conditioning II", capacity: 2, bookedCount: 2, waitlistCount: 0, startsAt: "2026-09-02T06:00:00.000Z" });
    expect(listed.find((item) => item.id === occurrenceId)?.roster.find((entry) => entry.memberId === "member-class-b")).toMatchObject({ status: "booked", fromWaitlist: true });
    const persisted = await t.run(async (ctx) => ({ bookings: await ctx.db.query("classBookings").collect(), notifications: await ctx.db.query("operationalNotifications").collect() }));
    expect(persisted.bookings.every((booking) => booking.startsAt === Date.parse("2026-09-02T06:00:00.000Z"))).toBe(true);
    expect(persisted.notifications).toEqual([expect.objectContaining({ kind: "class_waitlist_promoted", recipientUserId: fixture.customerB })]);

    // Shrinking below the confirmed bookings is refused, naming the date.
    await expect(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, sessionId: template.id, name: "Conditioning II", startMinute: 9 * 60, capacity: 1 })))
      .rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.stringContaining("2026-09-02") }) });
  });

  it("tells a member when booking has closed instead of offering a button the server refuses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T05:00:00.000Z"));
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-class-booking", name: "Mobility", dayOfWeek: 3, startMinute: 8 * 60, durationMinutes: 60, capacity: 8, audience: "mixed" })) as { id: string };
    const occurrenceId = `occ:${template.id}:2026-09-02`;

    vi.setSystemTime(new Date("2026-09-02T05:30:00.000Z"));
    const experience = await a.query(api.domain.query, operation("customer.classes", { membershipId: "membership-class-a" })) as { upcoming: Array<{ id: string; canBook: boolean; bookingBlockReason?: string }> };
    expect(experience.upcoming.find((item) => item.id === occurrenceId)).toMatchObject({ canBook: false, bookingBlockReason: "Booking closed when the class started." });
    await expectCode(a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId })), "CONFLICT");
  });
});

describe("moving a class to another weekday", () => {
  it("refuses while members hold its dates, then retires the emptied date as a cancelled record", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T05:00:00.000Z"));
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-class-booking" });
    const a = t.withIdentity({ subject: "clerk-customer-class-a" });
    const base = { branchId: "branch-class-booking", name: "Core", startMinute: 8 * 60, durationMinutes: 60, capacity: 5, audience: "mixed" };
    const template = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, dayOfWeek: 3 })) as { id: string };
    const occurrenceId = `occ:${template.id}:2026-09-02`;
    await a.mutation(api.domain.mutate, operation("customer.classes.book", { membershipId: "membership-class-a", occurrenceId }));

    await expect(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, sessionId: template.id, dayOfWeek: 4 })))
      .rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.stringContaining("2026-09-02") }) });

    await a.mutation(api.domain.mutate, operation("customer.classes.cancel", { membershipId: "membership-class-a", occurrenceId }));
    await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { ...base, sessionId: template.id, dayOfWeek: 4 }));
    const rows = await t.run(async (ctx) => await ctx.db.query("classOccurrences").collect());
    expect(rows.find((row) => row.publicId === occurrenceId)).toMatchObject({ status: "cancelled", cancelReason: "Class moved to Thursday" });
    const listed = await owner.query(api.domain.query, operation("classes.occurrences.list", { branchId: "branch-class-booking", fromDate: "2026-09-02", toDate: "2026-09-03" })) as Array<{ id: string; date: string; status: string }>;
    expect(listed.map((item) => [item.date, item.status])).toEqual([["2026-09-02", "cancelled"], ["2026-09-03", "scheduled"]]);
  });
});
