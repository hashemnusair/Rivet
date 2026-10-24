import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { auditGym, maxAddOns, op } from "./subscription-audit.test-support";

describe("platform snapshot purchased recurring revenue", () => {
  it.each([ ["monthly", 158_000], ["annual", 150_100] ] as const)("counts the full %s Basic package excluding one-time invoices", async (billingInterval, amount) => {
    const gym = await auditGym({ billingInterval, subscriptionAddOns: maxAddOns });
    await gym.invoice("one-time", { amountMinor: 225_000, onboardingFeeMinor: 75_000, websiteMinor: 150_000, status: "paid" });
    await gym.t.run(async ctx => {
      const { _id, _creationTime, ...org } = (await ctx.db.get(gym.org))!;
      void _id; void _creationTime;
      await ctx.db.insert("organizations", { ...org, publicId: "unlinked", slug: "unlinked" });
    });
    const snapshot = await gym.admin.query(api.domain.query, op("platform.snapshot")) as { overview: { activeMrr: unknown } };
    expect(snapshot.overview.activeMrr).toEqual({ amount, currency: "JOD" });
    await expect(gym.owner.query(api.domain.query, op("platform.snapshot"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await gym.update({ status: "cancelled" });
    expect((await gym.admin.query(api.domain.query, op("platform.snapshot")) as typeof snapshot).overview.activeMrr).toEqual({ amount: 0, currency: "JOD" });
  });
});
