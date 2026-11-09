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
const AMMAN_TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(new Date());
const visitDate = (() => { const date = new Date(`${AMMAN_TODAY}T12:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 3); return date.toISOString().slice(0, 10); })();
const JOD = (amount: number) => ({ amount, currency: "JOD" });
const EVERY_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function operation(operationName: string, input: Record<string, unknown> = {}) {
  return { operation: operationName, input, correlationId: `cor-day-pass-${operationName}` };
}

async function expectCode(request: Promise<unknown>, code: string, key?: string) {
  await expect(request).rejects.toMatchObject({ data: expect.objectContaining(key ? { code, messageKey: key } : { code }) });
}

type Booking = { id: string; leadId: string; kind?: string; price?: { amount: number }; paymentMethod?: string; paymentStatus?: string; cliqReference?: string; preferredTime: string; status: string; memberId?: string; membershipId?: string; receiptId?: string };
type Settings = { operationalPolicies: { trialOffer: { kind: string; dayPassPrice?: { amount: number }; cliqAlias?: string; dayPassPlanId?: string } } };
type LeadDetail = { stage: string; trialBooking: Booking };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-pass", name: "Pass Gym", slug: "pass-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-pass", name: "Pass Main", code: "P", active: true, status: "active", createdAt: now, updatedAt: now });
    const insertUser = async (publicId: string, authSubject: string, email: string) => await ctx.db.insert("users", { publicId, authSubject, email, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const owner = await insertUser("user-owner", "clerk-owner", "owner@pass.example");
    await insertUser("user-visitor", "clerk-visitor", "visitor@example.com");
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("customerProfiles", { publicId: "profile-visitor", userId: "user-visitor", name: "Visitor One", nameAr: "Visitor One", email: "visitor@example.com", phone: "+962791111222", gender: "female", dateOfBirth: "1995-04-02", preferredLanguage: "ar", city: "Amman", initials: "VO", context: "RIVET member", createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, value: Record<string, unknown>) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, createdAt: now, updatedAt: now, data: { id: publicId, ...value } });
    await insertRecord("marketplaceGym", "gym-pass", { name: "Pass Gym", shortName: "PASS", isPublic: true, subscriptionStatus: "active", targetOrganizationId: "org-pass", fromPriceMinor: 30_000, branches: [{ id: "directory-branch-pass", internalBranchId: "branch-pass", name: "Pass Main" }] });
    await insertRecord("settings", "settings", {
      operationalPolicies: {
        operatingHours: [{ branchId: "branch-pass", days: Object.fromEntries(EVERY_DAY.map((weekday) => [weekday, { enabled: true, opensAt: "06:00", closesAt: "23:00" }])) }],
        trialSchedules: [{ branchId: "branch-pass", days: Object.fromEntries(EVERY_DAY.map((weekday) => [weekday, { enabled: true, opensAt: "09:00", closesAt: "20:00" }])) }],
      },
    });
  });
  return { owner: t.withIdentity({ subject: "clerk-owner" }), visitor: t.withIdentity({ subject: "clerk-visitor" }) };
}

async function sellDayPasses(owner: ReturnType<TestConvex<typeof schema>["withIdentity"]>, offer: Record<string, unknown>) {
  const current = await owner.query(api.domain.query, operation("settings.get")) as Settings;
  return await owner.mutation(api.domain.mutate, operation("settings.operationalPolicies", { operationalPolicies: { ...current.operationalPolicies, trialOffer: offer } })) as Settings;
}

function bookDayPass(visitor: ReturnType<TestConvex<typeof schema>["withIdentity"]>, input: Record<string, unknown>) {
  return visitor.mutation(api.domain.mutate, operation("customer.trial.create", { gymId: "gym-pass", branchId: "directory-branch-pass", fullName: "Visitor One", email: "visitor@example.com", phone: "+962791111222", preferredDate: visitDate, preferredTime: "", goal: "", ...input }));
}

describe("day passes", () => {
  it("keeps a one-visit Day pass plan at the price the gym sets, and keeps it off the public plan list", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seed(t);

    await expectCode(sellDayPasses(owner, { kind: "day_pass" }), "VALIDATION_ERROR", "apiErrors.dayPassPrice");
    const saved = await sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "PASSGYM", dayPassPlanId: "caller-chosen" });
    const offer = saved.operationalPolicies.trialOffer;
    expect(offer).toMatchObject({ kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "PASSGYM" });
    expect(offer.dayPassPlanId).toBeTruthy();
    expect(offer.dayPassPlanId).not.toBe("caller-chosen");

    await sellDayPasses(owner, { ...offer, dayPassPrice: JOD(7_000) });
    const plans = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "plan")).collect()).map((row) => row.data as Record<string, unknown>));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: offer.dayPassPlanId, code: "DAY-PASS", kind: "visits", visitAllowance: 1, visitValidityDays: 1, basePrice: JOD(7_000), status: "active" });

    const gyms = await t.query(api.domain.query, operation("public.marketplace")) as Array<{ id: string; trialOffer?: Record<string, unknown>; plans?: Array<{ id: string }>; fromPriceMinor: number }>;
    const gym = gyms.find((item) => item.id === "gym-pass");
    expect(gym?.trialOffer).toEqual({ kind: "day_pass", dayPassPrice: JOD(7_000), cliqAlias: "PASSGYM" });
    expect(gym?.plans?.map((plan) => plan.id)).not.toContain(offer.dayPassPlanId);
    expect(gym?.fromPriceMinor).toBe(0);
  });

  it("refuses a CliQ alias while CliQ is switched off as a payment method", async () => {
    const t = convexTest(schema, modules);
    const { owner } = await seed(t);
    await t.run(async (ctx) => {
      const settings = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "settings").eq("publicId", "settings")).unique())!;
      await ctx.db.patch(settings._id, { data: { ...(settings.data as Record<string, unknown>), paymentMethods: [{ key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true }, { key: "cliq", label: "CliQ", enabled: false, affectsCashDrawer: false }] } });
    });
    await expectCode(sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "PASSGYM" }), "VALIDATION_ERROR", "apiErrors.dayPassCliqDisabled");
    await expect(sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000) })).resolves.toBeTruthy();
  });

  it("books a day pass for a date with the member's payment choice at the quoted price", async () => {
    const t = convexTest(schema, modules);
    const { owner, visitor } = await seed(t);
    await sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000) });

    // Without an alias, CliQ is not offered.
    await expectCode(bookDayPass(visitor, { paymentMethod: "cliq" }), "VALIDATION_ERROR", "apiErrors.dayPassPaymentMethod");
    await expectCode(bookDayPass(visitor, {}), "VALIDATION_ERROR", "apiErrors.dayPassPaymentMethod");
    const booking = await bookDayPass(visitor, { paymentMethod: "cash" }) as Booking;
    expect(booking).toMatchObject({ kind: "day_pass", price: JOD(5_000), paymentMethod: "cash", paymentStatus: "unpaid", preferredTime: "09:00", status: "requested" });

    const notices = await t.run(async (ctx) => (await ctx.db.query("operationalNotifications").collect()).map((row) => row.title));
    expect(notices).toContain("New day-pass request");
  });

  it("keeps free trials as they were when the gym offers no day pass", async () => {
    const t = convexTest(schema, modules);
    const { visitor } = await seed(t);
    const booking = await bookDayPass(visitor, { preferredTime: "18:00", goal: "Strength", paymentMethod: "cash" }) as Booking;
    expect(booking.kind).toBeUndefined();
    expect(booking.paymentStatus).toBeUndefined();
    expect(booking.preferredTime).toBe("18:00");
  });

  it("books without a gender in the form and keeps the member's saved profile", async () => {
    // The gym page sends a name and phone only. Booking used to save that as
    // the whole profile: refused for the missing gender, and it would have
    // wiped the birth date, language and city.
    const t = convexTest(schema, modules);
    const { visitor } = await seed(t);
    await bookDayPass(visitor, { fullName: "Visitor Renamed", phone: "+962791111333", preferredTime: "18:00", goal: "Strength" });
    const profile = await t.run(async (ctx) => await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", "user-visitor")).unique());
    expect(profile).toMatchObject({ name: "Visitor Renamed", phone: "+962791111333", gender: "female", dateOfBirth: "1995-04-02", preferredLanguage: "ar", city: "Amman" });
  });

  it("records a CliQ payment by selling the Day pass plan at the booked price, with a receipt", async () => {
    const t = convexTest(schema, modules);
    const { owner, visitor } = await seed(t);
    const offer = (await sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "PASSGYM" })).operationalPolicies.trialOffer;
    const booking = await bookDayPass(visitor, { paymentMethod: "cliq", cliqReference: "CLQ-1234" }) as Booking;
    expect(booking).toMatchObject({ paymentMethod: "cliq", cliqReference: "CLQ-1234" });

    // The gym raises its price after the booking: the visitor still pays what they were quoted.
    await sellDayPasses(owner, { ...offer, dayPassPrice: JOD(6_000) });

    await expectCode(owner.mutation(api.domain.mutate, operation("trials.update", { bookingId: booking.id, status: "completed" })), "CONFLICT", "apiErrors.dayPassUnpaid");
    await expectCode(owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", { bookingId: booking.id, method: "cliq", idempotencyKey: "pay-1", gender: "female" })), "VALIDATION_ERROR");

    const input = { bookingId: booking.id, method: "cliq", externalReference: "CLQ-1234", gender: "female", idempotencyKey: "pay-1" };
    const lead = await owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", input)) as LeadDetail;
    expect(lead.trialBooking).toMatchObject({ paymentStatus: "paid", paymentMethod: "cliq", status: "confirmed" });
    expect(lead.stage).toBe("trial_booked");
    const replay = await owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", input)) as LeadDetail;
    expect(replay.trialBooking.receiptId).toBe(lead.trialBooking.receiptId);
    await expectCode(owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", { ...input, idempotencyKey: "pay-2" })), "CONFLICT", "apiErrors.dayPassNotPayable");

    const state = await t.run(async (ctx) => {
      const rows = async (entityType: string) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", entityType)).collect()).map((row) => row.data as Record<string, unknown>);
      return { members: await rows("member"), memberships: await rows("membership"), charges: await rows("charge"), payments: await rows("payment"), receipts: await rows("receipt"), audits: (await ctx.db.query("auditEvents").collect()).map((row) => row.action) };
    });
    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toMatchObject({ fullName: "Visitor One", email: "visitor@example.com", gender: "female", homeBranchId: "branch-pass" });
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]).toMatchObject({ planId: offer.dayPassPlanId, startDate: visitDate, totalVisits: 1, remainingVisits: 1 });
    expect(state.charges[0]).toMatchObject({ total: JOD(5_000), outstandingAmount: JOD(0) });
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({ type: "payment", amount: JOD(5_000), method: "cliq", externalReference: "CLQ-1234" });
    expect(state.receipts.map((receipt) => receipt.id)).toContain(lead.trialBooking.receiptId);
    expect(state.audits).toEqual(expect.arrayContaining(["trial.day_pass_paid", "membership.sale", "membership.price_override"]));

    const completed = await owner.mutation(api.domain.mutate, operation("trials.update", { bookingId: booking.id, status: "completed" })) as LeadDetail;
    expect(completed.trialBooking.status).toBe("completed");
  });

  it("takes cash only into an open shift, and refuses to charge a free trial", async () => {
    const t = convexTest(schema, modules);
    const { owner, visitor } = await seed(t);
    const trial = await bookDayPass(visitor, { preferredTime: "18:00", goal: "Strength" }) as Booking;
    await expectCode(owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", { bookingId: trial.id, method: "cash", gender: "male", idempotencyKey: "free-1" })), "VALIDATION_ERROR", "apiErrors.dayPassNotDayPass");
    await owner.mutation(api.domain.mutate, operation("trials.update", { bookingId: trial.id, status: "cancelled", note: "Switching to day passes" }));

    await sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000) });
    const booking = await bookDayPass(visitor, { paymentMethod: "cash" }) as Booking;
    await expectCode(owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", { bookingId: booking.id, method: "cash", gender: "male", idempotencyKey: "cash-1" })), "NO_OPEN_SHIFT");
    await owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "branch-pass", openingFloat: JOD(0) }));
    const lead = await owner.mutation(api.domain.mutate, operation("trials.collect_day_pass", { bookingId: booking.id, method: "cash", gender: "male", idempotencyKey: "cash-2" })) as LeadDetail;
    expect(lead.trialBooking).toMatchObject({ paymentStatus: "paid", paymentMethod: "cash" });
    const payment = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect()).map((row) => row.data as Record<string, unknown>)[0]);
    expect(payment).toMatchObject({ method: "cash", amount: JOD(5_000), shiftId: expect.any(String) });
  });

  it("lets only staff who can take payments record one", async () => {
    const t = convexTest(schema, modules);
    const { owner, visitor } = await seed(t);
    await sellDayPasses(owner, { kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "PASSGYM" });
    const booking = await bookDayPass(visitor, { paymentMethod: "cliq" }) as Booking;
    await expectCode(visitor.mutation(api.domain.mutate, operation("trials.collect_day_pass", { bookingId: booking.id, method: "cliq", externalReference: "X-1", gender: "female", idempotencyKey: "self-pay" })), "FORBIDDEN");
  });
});
