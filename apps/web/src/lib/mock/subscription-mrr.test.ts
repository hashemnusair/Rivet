import { expect, it } from "vitest";
import { MockGymOSApi } from "./MockGymOSApi";
import type { MockDb } from "./store";
const max = { branch: 1, members: 3, staff: 3, operations: 1, finance: 1, reporting: 1 };
it.each([["monthly", 158000], ["annual", 150100]] as const)("mock MRR includes %s Basic add-ons", async (billingInterval, amount) => {
  const api = new MockGymOSApi(); api.setBehavior({ latencyMs: 0 });
  const { db } = api as unknown as { db: MockDb };
  Object.assign(db.organization, { subscriptionPlan: "Basic", subscriptionAddOns: max, billingInterval, status: "active" });
  expect((await api.getPlatformSnapshot()).overview.activeMrr).toEqual({ amount, currency: "JOD" });
});
