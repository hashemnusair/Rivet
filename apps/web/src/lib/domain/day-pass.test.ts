import { beforeEach, describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/errors";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { MARKETPLACE_GYMS } from "@/lib/public/experience-data";
import { trialWindowForDate } from "@/lib/public/trial-schedule";
import { dayPassAwaitsPayment, dayPassPaymentMethods, isDayPassBooking, publicTrialOfferOf, trialOfferOf } from "./day-pass";

const JOD = (amount: number) => ({ amount, currency: "JOD" });

async function expectError(request: Promise<unknown>, code: string, key?: string) {
  const error = await request.then(() => undefined, (caught: unknown) => caught);
  expect(isApiError(error) && error.code).toBe(code);
  if (key) expect(isApiError(error) && error.messageDescriptor?.key).toBe(key);
}

describe("day-pass rules", () => {
  it("reads an offer as a free trial unless it is a priced day pass", () => {
    expect(trialOfferOf(undefined)).toEqual({ kind: "free_trial" });
    expect(trialOfferOf({ kind: "day_pass" }).kind).toBe("free_trial");
    expect(trialOfferOf({ kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "  GYM  ", dayPassPlanId: "plan-1" })).toEqual({ kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "GYM", dayPassPlanId: "plan-1" });
    expect(publicTrialOfferOf({ kind: "day_pass", dayPassPrice: JOD(5_000), dayPassPlanId: "plan-1" })).toEqual({ kind: "day_pass", dayPassPrice: JOD(5_000) });
    expect(publicTrialOfferOf({ kind: "free_trial", dayPassPrice: JOD(5_000), cliqAlias: "GYM" })).toEqual({ kind: "free_trial" });
  });

  it("offers CliQ only with an alias, and knows when a day pass awaits payment", () => {
    expect(dayPassPaymentMethods({})).toEqual(["cash"]);
    expect(dayPassPaymentMethods({ cliqAlias: "GYM" })).toEqual(["cliq", "cash"]);
    expect(isDayPassBooking({})).toBe(false);
    expect(dayPassAwaitsPayment({ kind: "day_pass", paymentStatus: "unpaid", status: "requested" })).toBe(true);
    expect(dayPassAwaitsPayment({ kind: "day_pass", paymentStatus: "paid", status: "confirmed" })).toBe(false);
    expect(dayPassAwaitsPayment({ kind: "day_pass", paymentStatus: "unpaid", status: "cancelled" })).toBe(false);
    expect(dayPassAwaitsPayment({ status: "requested" })).toBe(false);
  });
});

describe("the preview adapter sells day passes like Convex", () => {
  let api: MockGymOSApi;
  const gym = MARKETPLACE_GYMS.find((item) => item.branches.some((branch) => branch.internalBranchId))!;
  const branch = gym.branches.find((item) => item.internalBranchId)!;
  const visitDate = (() => {
    for (let offset = 2; offset < 10; offset += 1) {
      const date = new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
      if (trialWindowForDate(branch, date)) return date;
    }
    throw new Error("The preview branch has no trial day in the next week.");
  })();

  beforeEach(async () => {
    api = new MockGymOSApi();
    api.setBehavior({ latencyMs: 0 });
    await api.switchDemoRole("owner");
  });

  async function sellDayPasses(offer: Record<string, unknown>) {
    const settings = await api.getOrganizationSettings();
    return await api.updateOperationalPolicies({ ...settings.operationalPolicies, trialOffer: offer as never });
  }

  it("keeps a one-visit Day pass plan at the set price and shows the offer on the gym page", async () => {
    await expectError(sellDayPasses({ kind: "day_pass" }), "VALIDATION_ERROR", "apiErrors.dayPassPrice");
    const saved = await sellDayPasses({ kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "FORGEGYM", dayPassPlanId: "caller-chosen" });
    const offer = saved.operationalPolicies.trialOffer!;
    expect(offer.dayPassPlanId).toBeTruthy();
    expect(offer.dayPassPlanId).not.toBe("caller-chosen");
    await sellDayPasses({ ...offer, dayPassPrice: JOD(6_000) });
    const plans = await api.listPlans({ status: "active", pageSize: 100 });
    const dayPassPlans = plans.items.filter((plan) => plan.id === offer.dayPassPlanId);
    expect(dayPassPlans).toHaveLength(1);
    expect(dayPassPlans[0]).toMatchObject({ code: "DAY-PASS", kind: "visits", visitAllowance: 1, visitValidityDays: 1, basePrice: JOD(6_000) });
    const listed = (await api.listMarketplaceGyms()).find((item) => item.id === gym.id);
    expect(listed?.trialOffer).toEqual({ kind: "day_pass", dayPassPrice: JOD(6_000), cliqAlias: "FORGEGYM" });
  });

  it("books for a date with a payment choice, then records the CliQ payment at the booked price", async () => {
    const offer = (await sellDayPasses({ kind: "day_pass", dayPassPrice: JOD(5_000), cliqAlias: "FORGEGYM" })).operationalPolicies.trialOffer!;
    const input = { gymId: gym.id, branchId: branch.id, fullName: "Day Visitor", email: "day.visitor@example.com", phone: "+962795550001", preferredDate: visitDate, preferredTime: "", goal: "", customerId: "customer-day" };
    await expectError(api.createTrialBooking(input), "VALIDATION_ERROR", "apiErrors.dayPassPaymentMethod");
    const booking = await api.createTrialBooking({ ...input, paymentMethod: "cliq", cliqReference: "CLQ-77" });
    expect(booking).toMatchObject({ kind: "day_pass", price: JOD(5_000), paymentMethod: "cliq", paymentStatus: "unpaid", cliqReference: "CLQ-77" });

    await sellDayPasses({ ...offer, dayPassPrice: JOD(6_000) });
    await expectError(api.updateTrialBooking(booking.id, { status: "completed" }), "CONFLICT", "apiErrors.dayPassUnpaid");
    await expectError(api.collectDayPassPayment(booking.id, { method: "cliq", idempotencyKey: "pay-1" }), "VALIDATION_ERROR");
    const lead = await api.collectDayPassPayment(booking.id, { method: "cliq", externalReference: "CLQ-77", gender: "male", idempotencyKey: "pay-1" });
    expect(lead.trialBooking).toMatchObject({ paymentStatus: "paid", status: "confirmed", paymentMethod: "cliq" });
    expect(lead.trialBooking?.receiptId).toBeTruthy();
    const replay = await api.collectDayPassPayment(booking.id, { method: "cliq", externalReference: "CLQ-77", gender: "male", idempotencyKey: "pay-1" });
    expect(replay.trialBooking?.receiptId).toBe(lead.trialBooking?.receiptId);
    await expectError(api.collectDayPassPayment(booking.id, { method: "cliq", externalReference: "CLQ-77", gender: "male", idempotencyKey: "pay-2" }), "CONFLICT", "apiErrors.dayPassNotPayable");

    const receipt = await api.getReceipt(lead.trialBooking!.receiptId!);
    expect(receipt.payment).toMatchObject({ amount: JOD(5_000), method: "cliq", externalReference: "CLQ-77" });
    const completed = await api.updateTrialBooking(booking.id, { status: "completed" });
    expect(completed.trialBooking?.status).toBe("completed");
  });
});
