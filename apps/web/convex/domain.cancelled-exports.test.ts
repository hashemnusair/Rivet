import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { auditGym, NOW, op } from "./subscription-audit.test-support";
import { DAY_MS } from "./subscriptionTerm";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
const exportInput = (kind = "members") => ({ kind, idempotencyKey: `cancelled-export-${kind}` });

describe("cancelled owner termination exports", () => {
  it("keeps all seven existing export datasets reachable after cancellation, without workspace or billing access", async () => {
    const gym = await auditGym();
    await gym.t.run(ctx => ctx.db.insert("domainRecords", { organizationId: gym.org, branchId: gym.branch, entityType: "member", publicId: "member", createdAt: NOW, updatedAt: NOW, data: { fullName: "Export Me", memberNumber: "M-1", homeBranchId: "audit-branch", createdAt: new Date(NOW).toISOString() } }));
    const active = await gym.owner.mutation(api.domain.mutate, op("exports.request", { ...exportInput(), idempotencyKey: "active-owner-export" })) as { content: string };
    expect(active.content).toContain("Export Me");
    await gym.update({ status: "cancelled" });
    const identity = await gym.owner.query(api.identity.current, {});
    expect(identity).toMatchObject({ memberships: [], exportAccess: [{ organizationId: "audit-org", expiresAt: new Date(NOW + 30 * DAY_MS).toISOString() }] });
    expect(identity && "billingAccess" in identity && identity.billingAccess).toBeFalsy();
    for (const kind of ["members", "leads", "payments", "membership_liabilities", "personal_training", "operations", "audit"]) {
      const first = await gym.owner.mutation(api.domain.mutate, op("exports.request", exportInput(kind))) as { id: string; status: string; content: string };
      expect(first.status).toBe("completed");
      if (kind === "members") expect(first.content).toContain("Export Me");
      expect(await gym.owner.mutation(api.domain.mutate, op("exports.request", exportInput(kind)))).toEqual(first);
      expect(await gym.owner.query(api.domain.query, op("exports.list"))).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.id, content: first.content })]));
    }
    for (const operation of ["session", "members.list", "billing.checkout", "billing.plans", "workspace.access"]) await expect(gym.owner.query(api.domain.query, op(operation))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    const before = await gym.state();
    await expect(gym.owner.mutation(api.domain.mutate, op("members.create", { fullName: "Not permitted" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(await gym.state()).toEqual(before);
    for (const role of ["manager", "receptionist"]) {
      const staff = gym.t.withIdentity({ subject: role });
      await expect(staff.query(api.domain.query, op("exports.list"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      await expect(staff.mutation(api.domain.mutate, op("exports.request", exportInput()))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      expect(await staff.query(api.identity.current, {})).not.toHaveProperty("exportAccess");
    }
  });

  it.each([ [0, true], [30 * DAY_MS - 1, true], [30 * DAY_MS, false], [30 * DAY_MS + 1, false] ])("enforces the window at cancellation +%i ms for creation and retrieval", async (elapsed, allowed) => {
    const gym = await auditGym({ status: "cancelled", cancelledAt: NOW });
    vi.setSystemTime(NOW + elapsed);
    const create = gym.owner.mutation(api.domain.mutate, op("exports.request", exportInput()));
    if (allowed) {
      const job = await create;
      expect(await gym.owner.query(api.domain.query, op("exports.list"))).toContainEqual(job);
    } else {
      await expect(create).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      await expect(gym.owner.query(api.domain.query, op("exports.list"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
      expect(await gym.owner.query(api.identity.current, {})).not.toHaveProperty("exportAccess");
    }
  });

  it.each([undefined, NaN, Infinity, 0, -1, NOW + 1])("fails closed on missing/invalid cancellation time %s", async cancelledAt => {
    const gym = await auditGym({ status: "cancelled", cancelledAt });
    await expect(gym.owner.query(api.domain.query, op("exports.list"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(await gym.owner.query(api.identity.current, {})).not.toHaveProperty("exportAccess");
  });

  it("preserves archive, tenant/branch and 24-hour artifact expiry restrictions", async () => {
    const gym = await auditGym({ status: "cancelled", cancelledAt: NOW });
    const foreign = await gym.t.run(async ctx => {
      const org = await ctx.db.insert("organizations", { publicId: "foreign", name: "Foreign", slug: "foreign", status: "active", timezone: "UTC", currency: "JOD", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("branches", { organizationId: org, publicId: "foreign-branch", name: "Foreign", code: "F", active: true, status: "active", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("domainRecords", { organizationId: org, entityType: "member", publicId: "foreign-member", createdAt: NOW, updatedAt: NOW, data: { fullName: "Must not leak" } });
      return org;
    });
    void foreign;
    await expect(gym.owner.mutation(api.domain.mutate, op("exports.request", { ...exportInput(), organizationId: "foreign" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(gym.owner.mutation(api.domain.mutate, op("exports.request", { ...exportInput(), filters: { branchId: "foreign-branch" } }))).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
    const job = await gym.owner.mutation(api.domain.mutate, op("exports.request", exportInput())) as { id: string; content: string };
    expect(job.content).not.toContain("Must not leak");
    vi.setSystemTime(NOW + DAY_MS);
    const history = await gym.owner.query(api.domain.query, op("exports.list")) as Array<{ id: string; content?: string }>;
    expect(history.find(row => row.id === job.id)?.content).toBeUndefined();
    await gym.t.run(ctx => ctx.db.patch(gym.org, { archivedAt: NOW }));
    await expect(gym.owner.query(api.domain.query, op("exports.list"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(await gym.owner.query(api.identity.current, {})).not.toHaveProperty("exportAccess");
  });
  it("does not restart the termination window on repeated cancellation saves", async () => {
    const gym = await auditGym(); await gym.update({ status: "cancelled" });
    vi.setSystemTime(NOW + 29 * DAY_MS);
    await gym.update({ status: "cancelled", isPublic: false });
    expect((await gym.state()).organizations[0]!.cancelledAt).toBe(NOW);
    vi.setSystemTime(NOW + 30 * DAY_MS);
    await expect(gym.owner.query(api.domain.query, op("exports.list"))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

  it("preserves a selected owner's branch scope during cancellation exports", async () => {
    const gym = await auditGym({ status: "cancelled", cancelledAt: NOW });
    await gym.t.run(async ctx => {
      const owner = (await ctx.db.query("users").collect()).find(user => user.publicId === "owner")!;
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", q => q.eq("organizationId", gym.org).eq("userId", owner._id)).unique();
      const second = await ctx.db.insert("branches", { organizationId: gym.org, publicId: "second-assigned", name: "Assigned", code: "A", active: true, status: "active", createdAt: NOW, updatedAt: NOW });
      await ctx.db.patch(membership!._id, { branchScope: "selected", branchIds: [gym.branch, second] });
      await ctx.db.insert("domainRecords", { organizationId: gym.org, branchId: second, entityType: "member", publicId: "assigned-member", createdAt: NOW, updatedAt: NOW, data: { fullName: "Assigned member", memberNumber: "A-1", homeBranchId: "second-assigned", createdAt: new Date(NOW).toISOString() } });
      const hidden = await ctx.db.insert("branches", { organizationId: gym.org, publicId: "hidden", name: "Hidden", code: "H", active: true, status: "active", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("domainRecords", { organizationId: gym.org, branchId: hidden, entityType: "member", publicId: "hidden-member", createdAt: NOW, updatedAt: NOW, data: { fullName: "Hidden member", homeBranchId: "hidden" } });
    });
    const job = await gym.owner.mutation(api.domain.mutate, op("exports.request", exportInput())) as { content: string };
    expect(job.content).toContain("Assigned member");
    expect(job.content).not.toContain("Hidden member");
    await expect(gym.owner.mutation(api.domain.mutate, op("exports.request", { ...exportInput(), filters: { branchId: "hidden" } }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  });

});
