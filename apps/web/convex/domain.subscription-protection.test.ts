import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { auditGym, maxAddOns, NOW, op } from "./subscription-audit.test-support";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
const submitted = { status: "submitted", reference: "BANK-1", submittedAt: new Date(NOW).toISOString() };

describe("submitted subscription payments survive replacement operations", () => {
  it.each([
    ["plan", { plan: "Pro" }, {}],
    ["cadence", { billingInterval: "annual" }, {}],
    ["quote", { quotedPriceMinor: 399_000 }, { subscriptionPlan: "Enterprise" as const, quotedPriceMinor: 299_000 }],
    ["add-ons", { addOns: maxAddOns, expectedAddOnsRevision: 0 }, {}],
    ["reactivation", { status: "active" }, { status: "suspended" as const }],
  ])("rejects %s changes before any persistent state or success audit", async (_name, input, patch) => {
    const gym = await auditGym(patch);
    await gym.invoice("claim", { paymentClaim: submitted });
    const before = await gym.state();
    for (let retry = 0; retry < 2; retry++) {
      await expect(gym.update(input)).rejects.toMatchObject({ data: { code: "CONFLICT" } });
      expect(await gym.state()).toEqual(before);
    }
  });

  it("allows listing, unchanged subscription and boundary-only changes that do not replace the invoice", async () => {
    const gym = await auditGym();
    await gym.invoice("claim", { paymentClaim: submitted });
    await gym.update({ isPublic: true });
    await gym.update({ plan: "Basic", billingInterval: "monthly" });
    await gym.update({ currentPeriodEndsAt: "2026-11-15T12:00:00.000Z" });
    const invoices = (await gym.state()).records.filter(row => row.entityType === "platformInvoice");
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.data).toMatchObject({ status: "open", paymentClaim: submitted });
  });

  it("does not let an unrelated manual invoice or another tenant block replacement; returned claims can be replaced", async () => {
    const gym = await auditGym();
    await gym.invoice("manual", { cycleKey: undefined, paymentClaim: submitted });
    await gym.invoice("returned", { paymentClaim: { ...submitted, status: "rejected" } });
    await gym.update({ plan: "Pro" });
    const rows = (await gym.state()).records;
    expect(rows.find(row => row.publicId === "manual")!.data.status).toBe("open");
    expect(rows.find(row => row.publicId === "returned")!.data.status).toBe("void");
  });

  it("blocks explicit voids and upgrade-confirmation replacement, including retries, without partial state", async () => {
    const gym = await auditGym();
    await gym.invoice("renewal", { paymentClaim: submitted });
    await gym.invoice("upgrade", { planChange: { from: "Basic", to: "Pro" }, amountMinor: 199_000 });
    const before = await gym.state();
    for (const operation of ["platform.invoice.void", "platform.invoice.payment"]) {
      for (let retry = 0; retry < 2; retry++) {
        await expect(gym.admin.mutation(api.domain.mutate, op(operation, { invoiceId: operation.endsWith("void") ? "renewal" : "upgrade", reference: "BANK-2", reason: "Verified transfer" }))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
        expect(await gym.state()).toEqual(before);
      }
    }
    await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment_reject", { invoiceId: "renewal", reason: "No transfer received" }));
    await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: "upgrade", reference: "BANK-2", reason: "Verified transfer" }));
    expect((await gym.state()).records.find(row => row.publicId === "renewal")!.data.status).toBe("void");
  });
});
