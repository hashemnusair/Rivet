import { describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * The complete PT credit lifecycle against the real handlers: package setup,
 * included and purchased credits, unpaid/partial/full activation, member and
 * staff booking, rescheduling, timely/late/gym cancellation, completion,
 * no-show, unused-credit refunds, expiry and trainer deactivation. After every
 * step the ledger must conserve credits: granted = available + reserved +
 * consumed + revoked, and the member's projection must agree.
 */

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-lifecycle-${name}-${Math.random().toString(36).slice(2, 8)}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY = 86_400_000;

function dateInDays(days: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Experience = { availableSessions: number; reservedSessions: number; entitlements: Array<{ granted: number; reserved: number; consumed: number; revoked: number; available: number; source: string; status: string }>; upcomingBookings: Array<{ id: string; status: string }>; orders: Array<{ id: string; status: string }>; trainers: Array<{ id: string }> };
type Slot = { startsAt: string };
type Booking = { id: string; status: string; startsAt: string };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "life-org", name: "Lifecycle Gym", slug: "lifecycle-gym", status: "active", timezone: "UTC", currency: "JOD", receiptPrefix: "LC", nextReceiptNumber: 1, createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "life-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const insertUser = async (publicId: string, subject: string, fullName: string) => await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@life.example`, fullName, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const owner = await insertUser("life-owner", "clerk-life-owner", "Life Owner");
    const trainer = await insertUser("life-trainer", "clerk-life-trainer", "Life Trainer");
    const reception = await insertUser("life-reception", "clerk-life-reception", "Life Reception");
    await insertUser("life-customer-a", "clerk-life-customer-a", "Member A");
    await insertUser("life-customer-b", "clerk-life-customer-b", "Member B");
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: trainer, role: "trainer", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, value: Record<string, unknown>, memberPublicId?: string) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, memberPublicId, createdAt: now, updatedAt: now, data: { id: publicId, ...value } });
    await insertRecord("plan", "life-plan", { name: "Lifecycle plan", code: "LC", kind: "time", durationDays: 60, basePrice: { amount: 80_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 5, includedPtSessions: 0, status: "active" });
    for (const key of ["a", "b"] as const) {
      await ctx.db.insert("customerProfiles", { publicId: `customer-${key}`, userId: `life-customer-${key}`, name: `Member ${key.toUpperCase()}`, nameAr: "عضو", email: `life-customer-${key}@life.example`, phone: `+96279000010${key === "a" ? 1 : 2}`, initials: "M", context: "RIVET member", createdAt: now, updatedAt: now });
      await insertRecord("member", `member-${key}`, { fullName: `Member ${key.toUpperCase()}`, email: `life-customer-${key}@life.example`, phone: `+96279000010${key === "a" ? 1 : 2}`, memberNumber: `MAIN-${key}`, homeBranchId: "life-branch", status: "active", createdAt: new Date(now).toISOString() }, `member-${key}`);
      await insertRecord("membership", `membership-${key}`, { memberId: `member-${key}`, planId: "life-plan", homeBranchId: "life-branch", startDate: dateInDays(-2), endDate: dateInDays(45), salePrice: { amount: 80_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, status: "active", frozenDaysUsed: 0, freezes: [] }, `member-${key}`);
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "customerMembership", publicId: `membership-${key}`, branchId: branch, memberPublicId: `member-${key}`, createdAt: now, updatedAt: now, data: { id: `membership-${key}`, customerUserId: `life-customer-${key}`, customerId: `customer-${key}`, gymId: "life-org", branchId: "life-branch", memberId: `member-${key}`, membershipId: `membership-${key}`, memberNumber: `MAIN-${key}`, planName: "Lifecycle plan", status: "active", startDate: dateInDays(-2), endDate: dateInDays(45), visitsThisMonth: 0, balanceMinor: 0, lastCheckInAt: new Date(now).toISOString() } });
    }
    const profile = await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "life-trainer-profile", userId: trainer, displayName: "Coach Life", specialties: ["Strength"], languages: ["en"], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    for (const weekday of weekdays) await ctx.db.insert("ptAvailabilityRules", { organizationId: organization, publicId: `life-rule-${weekday}`, trainerProfileId: profile, branchId: branch, weekday, startMinute: 8 * 60, endMinute: 14 * 60, active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("ptPackages", { organizationId: organization, publicId: "life-package-12", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 240_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
  });
}

/** Every entitlement must balance and the projection must report the same totals as the ledger rows. */
async function assertConserved(t: TestConvex<typeof schema>, experience: Experience, memberId: string) {
  const rows = await t.run(async (ctx) => (await ctx.db.query("ptEntitlements").collect()).filter((row) => row.memberPublicId === memberId));
  let available = 0; let reserved = 0;
  for (const row of rows) {
    expect(row.reserved, `${row.source} reserved`).toBeGreaterThanOrEqual(0);
    expect(row.consumed + row.reserved + row.revoked, `${row.source} never overspends its grant`).toBeLessThanOrEqual(row.granted);
    const active = row.status === "active" && row.expiresAt >= Date.now() && (row.startsAt ?? 0) <= Date.now();
    if (active) available += Math.max(0, row.granted - row.reserved - row.consumed - row.revoked);
    reserved += row.reserved;
  }
  expect(experience.availableSessions, "available sessions match the ledger").toBe(available);
  expect(experience.reservedSessions, "reserved sessions match the ledger").toBe(reserved);
  // An expired or scheduled grant is shown with zero available by design; an active one must match its arithmetic.
  for (const view of experience.entitlements) expect(view.available, `${view.source} ${view.status}`).toBe(view.status === "active" ? Math.max(0, view.granted - view.reserved - view.consumed - view.revoked) : 0);
}

describe("PT credit lifecycle", () => {
  it("conserves credits across purchase, booking, rescheduling, every cancellation kind, outcomes, refunds, expiry and trainer deactivation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = convexTest(schema, modules);
      await seed(t);
      const owner = t.withIdentity({ subject: "clerk-life-owner" });
      const trainer = t.withIdentity({ subject: "clerk-life-trainer" });
      const reception = t.withIdentity({ subject: "clerk-life-reception" });
      const memberA = t.withIdentity({ subject: "clerk-life-customer-a" });
      const memberB = t.withIdentity({ subject: "clerk-life-customer-b" });
      const experienceOf = async (actor: typeof memberA, membershipId = "membership-a") => await actor.query(api.domain.query, operation("customer.pt", { membershipId })) as Experience;
      const slotsOn = async (day: number, membershipId = "membership-a", actor: typeof memberA = memberA) => await actor.query(api.domain.query, operation("customer.pt.slots", { membershipId, trainerProfileId: "life-trainer-profile", branchId: "life-branch", from: dateInDays(day), to: dateInDays(day) })) as Slot[];

      // Package setup and activation: nothing before full payment.
      const order = await memberA.mutation(api.domain.mutate, operation("customer.pt.package.request", { membershipId: "membership-a", packageId: "life-package-12", idempotencyKey: "life-order" })) as { id: string; chargeId: string };
      await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "member-a", chargeId: order.chargeId, amount: { amount: 100_000, currency: "JOD" }, method: "card", externalReference: "POS-1", idempotencyKey: "life-pay-1" }));
      let a = await experienceOf(memberA);
      expect(a.availableSessions).toBe(0);
      expect(a.orders[0]?.status).toBe("pending_payment");
      await expectCode(memberA.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: (await slotsOn(2))[0]!.startsAt, idempotencyKey: "life-too-early" })), "VALIDATION_ERROR");
      await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "member-a", chargeId: order.chargeId, amount: { amount: 140_000, currency: "JOD" }, method: "cash", idempotencyKey: "life-pay-2" })).catch(async () => {
        // Cash needs an open drawer; open one and retry the same idempotent request.
        await reception.mutation(api.domain.mutate, operation("shifts.open", { branchId: "life-branch", openingFloat: { amount: 0, currency: "JOD" } }));
        await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "member-a", chargeId: order.chargeId, amount: { amount: 140_000, currency: "JOD" }, method: "cash", idempotencyKey: "life-pay-2" }));
      });
      a = await experienceOf(memberA);
      expect(a.orders[0]?.status).toBe("active");
      expect(a.availableSessions).toBe(12);

      // Included-style credits: two introductory sessions on every active membership, once.
      await owner.mutation(api.domain.mutate, operation("pt.introductory.apply", { sessionCount: 2, reason: "Pilot introduction approved by owner", idempotencyKey: "life-intro" }));
      await owner.mutation(api.domain.mutate, operation("pt.introductory.apply", { sessionCount: 2, reason: "Pilot introduction approved by owner", idempotencyKey: "life-intro" }));
      a = await experienceOf(memberA);
      expect(a.availableSessions).toBe(14);
      await assertConserved(t, a, "member-a");
      expect((await experienceOf(memberB, "membership-b")).availableSessions).toBe(2);

      // Staff and member bookings, replayed by idempotency key.
      const day2 = await slotsOn(2);
      expect(day2.length).toBeGreaterThanOrEqual(4);
      const staffBooking = await reception.mutation(api.domain.mutate, operation("pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day2[0]!.startsAt, idempotencyKey: "life-staff-booking" })) as Booking;
      const staffReplay = await reception.mutation(api.domain.mutate, operation("pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day2[0]!.startsAt, idempotencyKey: "life-staff-booking" })) as Booking;
      expect(staffReplay.id).toBe(staffBooking.id);
      const memberBooking = await memberA.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day2[1]!.startsAt, idempotencyKey: "life-member-booking" })) as Booking;
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 12, reservedSessions: 2 });
      await assertConserved(t, a, "member-a");

      // Rescheduling moves the reservation without touching the counters.
      const moved = await memberA.mutation(api.domain.mutate, operation("customer.pt.booking.reschedule", { bookingId: memberBooking.id, trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day2[2]!.startsAt, reason: "Member changed time", idempotencyKey: "life-move" })) as Booking;
      expect(moved.startsAt).toBe(day2[2]!.startsAt);
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 12, reservedSessions: 2 });
      await assertConserved(t, a, "member-a");

      // Gym cancellation returns the credit regardless of timing.
      const gymCancelled = await reception.mutation(api.domain.mutate, operation("pt.booking.cancel", { bookingId: staffBooking.id, reason: "Trainer unavailable", cancelledByGym: true })) as Booking;
      expect(gymCancelled.status).toBe("gym_cancelled");
      await expectCode(reception.mutation(api.domain.mutate, operation("pt.booking.cancel", { bookingId: staffBooking.id, reason: "Trainer unavailable", cancelledByGym: true })), "VALIDATION_ERROR");
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 13, reservedSessions: 1 });
      await assertConserved(t, a, "member-a");

      // A member cancellation inside the cutoff consumes the credit.
      vi.setSystemTime(new Date(Date.parse(moved.startsAt) - 3_600_000));
      const late = await memberA.mutation(api.domain.mutate, operation("customer.pt.booking.cancel", { bookingId: memberBooking.id, reason: "Cancelled by member" })) as Booking;
      expect(late.status).toBe("late_cancelled");
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 13, reservedSessions: 0 });
      await assertConserved(t, a, "member-a");

      // No-show and completion each consume exactly one credit, once.
      const day3 = await slotsOn(3);
      const noShowBooking = await memberA.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day3[0]!.startsAt, idempotencyKey: "life-no-show" })) as Booking;
      const completedBooking = await reception.mutation(api.domain.mutate, operation("pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day3[1]!.startsAt, idempotencyKey: "life-complete" })) as Booking;
      await expectCode(trainer.mutation(api.domain.mutate, operation("pt.booking.no_show", { bookingId: noShowBooking.id, reason: "Did not arrive" })), "VALIDATION_ERROR");
      vi.setSystemTime(new Date(Date.parse(completedBooking.startsAt) + 15 * 60_000));
      await expectCode(trainer.mutation(api.domain.mutate, operation("pt.booking.no_show", { bookingId: noShowBooking.id, reason: "" })), "VALIDATION_ERROR");
      expect((await trainer.mutation(api.domain.mutate, operation("pt.booking.no_show", { bookingId: noShowBooking.id, reason: "Did not arrive" })) as Booking).status).toBe("no_show");
      expect((await trainer.mutation(api.domain.mutate, operation("pt.booking.complete", { bookingId: completedBooking.id })) as Booking).status).toBe("completed");
      await expectCode(trainer.mutation(api.domain.mutate, operation("pt.booking.no_show", { bookingId: noShowBooking.id, reason: "Did not arrive" })), "VALIDATION_ERROR");
      await expectCode(trainer.mutation(api.domain.mutate, operation("pt.booking.complete", { bookingId: completedBooking.id })), "VALIDATION_ERROR");
      await expectCode(reception.mutation(api.domain.mutate, operation("pt.booking.cancel", { bookingId: completedBooking.id, reason: "Too late", cancelledByGym: true })), "VALIDATION_ERROR");
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 11, reservedSessions: 0 });
      await assertConserved(t, a, "member-a");
      const consumedRows = await t.run(async (ctx) => (await ctx.db.query("ptEntitlements").collect()).filter((row) => row.memberPublicId === "member-a"));
      expect(consumedRows.reduce((total, row) => total + row.consumed, 0)).toBe(3);

      // Unused-credit refunds revoke package credits only, and never below zero.
      const refunded = await owner.mutation(api.domain.mutate, operation("pt.package.refund", { orderId: order.id, sessions: 9, reason: "Member relocating; unused sessions refunded" })) as { refundedSessions: number; refundedAmount: { amount: number } };
      expect(refunded).toMatchObject({ refundedSessions: 9, refundedAmount: { amount: 180_000 } });
      await expectCode(owner.mutation(api.domain.mutate, operation("pt.package.refund", { orderId: order.id, sessions: 5, reason: "Over-refund attempt" })), "VALIDATION_ERROR");
      a = await experienceOf(memberA);
      expect(a.availableSessions).toBe(2);
      await assertConserved(t, a, "member-a");

      // Two members racing for the same slot: exactly one reservation.
      const day4 = await slotsOn(4);
      const race = await Promise.allSettled([
        memberA.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day4[0]!.startsAt, idempotencyKey: "life-race-a" })),
        memberB.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-b", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day4[0]!.startsAt, idempotencyKey: "life-race-b" })),
      ]);
      expect(race.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(race.filter((result) => result.status === "rejected")).toHaveLength(1);
      const stillOpen = await t.run(async (ctx) => (await ctx.db.query("ptBookings").collect()).filter((row) => row.startsAt === Date.parse(day4[0]!.startsAt) && ["reserved", "confirmed"].includes(row.status)));
      expect(stillOpen).toHaveLength(1);
      const raceWinner = race[0]!.status === "fulfilled" ? memberA : memberB;
      const winnerMembership = raceWinner === memberA ? "membership-a" : "membership-b";
      const winnerBookingId = (race.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Booking>).value.id;
      await raceWinner.mutation(api.domain.mutate, operation("customer.pt.booking.cancel", { bookingId: winnerBookingId, reason: "Cancelled by member" }));
      await assertConserved(t, await experienceOf(memberA), "member-a");
      await assertConserved(t, await experienceOf(memberB, "membership-b"), "member-b");
      expect(winnerMembership).toBeTruthy();

      // Two attempts to spend the final credit: exactly one succeeds.
      await owner.mutation(api.domain.mutate, operation("pt.package.refund", { orderId: order.id, sessions: 1, reason: "Down to the last credit" }));
      a = await experienceOf(memberA);
      expect(a.availableSessions).toBe(1);
      const finalRace = await Promise.allSettled([
        memberA.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day4[1]!.startsAt, idempotencyKey: "life-final-1" })),
        reception.mutation(api.domain.mutate, operation("pt.booking.create", { membershipId: "membership-a", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day4[2]!.startsAt, idempotencyKey: "life-final-2" })),
      ]);
      expect(finalRace.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      a = await experienceOf(memberA);
      expect(a).toMatchObject({ availableSessions: 0, reservedSessions: 1 });
      await assertConserved(t, a, "member-a");
      const finalBooking = (finalRace.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Booking>).value;
      vi.setSystemTime(new Date(Date.parse(finalBooking.startsAt) + 15 * 60_000));
      await trainer.mutation(api.domain.mutate, operation("pt.booking.complete", { bookingId: finalBooking.id }));

      // Expiry: once the term ends, remaining credits stop counting and cannot be booked.
      vi.setSystemTime(new Date(Date.now() + 100 * DAY));
      const b = await experienceOf(memberB, "membership-b");
      expect(b.availableSessions).toBe(0);
      await assertConserved(t, b, "member-b");
      const expiredSlots = await slotsOn(1, "membership-b", memberB);
      // The membership term has ended too, which the server names first; either refusal keeps the credit unusable.
      if (expiredSlots[0]) await expect(memberB.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-b", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: expiredSlots[0].startsAt, idempotencyKey: "life-expired" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: expect.stringMatching(/^(VALIDATION_ERROR|MEMBERSHIP_NOT_ACTIVE)$/) }) });

      // Trainer deactivation: refused while a future session is reserved, then removes the trainer from booking.
      vi.setSystemTime(new Date(Date.now() - 100 * DAY));
      const day5 = await slotsOn(5, "membership-b", memberB);
      const futureBooking = await memberB.mutation(api.domain.mutate, operation("customer.pt.booking.create", { membershipId: "membership-b", trainerProfileId: "life-trainer-profile", branchId: "life-branch", startsAt: day5[0]!.startsAt, idempotencyKey: "life-future" })) as Booking;
      await expectCode(owner.mutation(api.domain.mutate, operation("users.update", { userId: "life-trainer", status: "deactivated" })), "CONFLICT");
      await reception.mutation(api.domain.mutate, operation("pt.booking.cancel", { bookingId: futureBooking.id, reason: "Trainer leaving", cancelledByGym: true }));
      await owner.mutation(api.domain.mutate, operation("users.update", { userId: "life-trainer", status: "deactivated" }));
      const afterDeactivation = await experienceOf(memberB, "membership-b");
      expect(afterDeactivation.trainers.map((item) => item.id), "a deactivated trainer is no longer offered to members").not.toContain("life-trainer-profile");
      await expectCode(memberB.query(api.domain.query, operation("customer.pt.slots", { membershipId: "membership-b", trainerProfileId: "life-trainer-profile", branchId: "life-branch", from: dateInDays(6), to: dateInDays(6) })), "NOT_FOUND");
      await assertConserved(t, afterDeactivation, "member-b");
    } finally {
      vi.useRealTimers();
    }
  });
});
