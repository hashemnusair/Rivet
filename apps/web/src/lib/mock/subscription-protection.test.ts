import { describe, expect, it } from "vitest";
import { MockGymOSApi } from "./MockGymOSApi";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import type { MockDb } from "./store";

describe("mock submitted invoice protection", () => {
  it("rejects repricing, direct voids and upgrade replacement without partial state", async () => {
    const api = new MockGymOSApi();
    api.setBehavior({ latencyMs: 0 });
    await api.switchDemoRole("owner");
    const internal = api as unknown as { db: MockDb; platformInvoices: PlatformBillingInvoice[] };
    internal.db.organization.subscriptionPlan = "Basic";
    internal.platformInvoices = [{ id: "claim", gymId: "forge-fitness", gym: "Forge", amount: "JOD 49.000", amountMinor: 49000, status: "open", date: "2026-10-10", cycleKey: "subscription:claim", paymentClaim: { status: "submitted", method: "cliq", reference: "BANK-1", payerName: "Owner", paidOn: "2026-10-10", amountMinor: 49000, submittedAt: "2026-10-10T12:00:00Z" } }];
    const before = JSON.stringify(internal);
    await expect(api.updatePlatformGym({ gymId: "forge-fitness", plan: "Pro", reason: "Owner approved" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(internal)).toBe(before);
    await expect(api.voidPlatformInvoice("claim", "Replace invoice")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(internal)).toBe(before);
    internal.platformInvoices.push({ id: "upgrade", gymId: "forge-fitness", gym: "Forge", amount: "JOD 199.000", amountMinor: 199000, status: "open", date: "2026-10-10", cycleKey: "upgrade:test", planChange: { from: "Basic", to: "Pro" } });
    const withUpgrade = JSON.stringify(internal);
    await expect(api.recordPlatformInvoicePayment({ invoiceId: "upgrade", reference: "BANK-2", reason: "Verified transfer" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.stringify(internal)).toBe(withUpgrade);
  });
});
