import { afterEach, expect, it, vi } from "vitest";
import { MockGymOSApi } from "./MockGymOSApi";
import type { MockDb } from "./store";
import { DAY_MS } from "../../../convex/subscriptionTerm";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("mock cancellation retains owner-only exports, tenant/branch checks and artifact expiry", async () => {
  const now = Date.parse("2026-10-10T12:00:00Z"); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  const api = new MockGymOSApi(); api.setBehavior({ latencyMs: 0 }); await api.switchDemoRole("owner");
  const { db } = api as unknown as { db: MockDb };
  Object.assign(db.organization, { status: "cancelled", cancelledAt: new Date(now).toISOString() });
  const input = { kind: "members" as const, idempotencyKey: "cancelled-owner-export" };
  const job = await api.requestExport(input); expect(job.content).toContain("Member directory");
  expect(await api.listExportJobs()).toContainEqual(job);
  await expect(api.requestExport({ ...input, organizationId: "foreign" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(api.requestExport({ ...input, filters: { branchId: "foreign" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await api.switchDemoRole("manager");
  await expect(api.listExportJobs()).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(api.requestExport(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await api.switchDemoRole("owner");
  vi.setSystemTime(now + DAY_MS);
  expect((await api.listExportJobs())[0]?.content).toBeUndefined();
  vi.setSystemTime(now + 30 * DAY_MS - 1);
  await api.listExportJobs();
  vi.setSystemTime(now + 30 * DAY_MS);
  await expect(api.listExportJobs()).rejects.toMatchObject({ code: "FORBIDDEN" });
  vi.setSystemTime(now);
  for (const cancelledAt of [undefined, "invalid", new Date(now + 1).toISOString()]) {
    db.organization.cancelledAt = cancelledAt;
    await expect(api.listExportJobs()).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});
