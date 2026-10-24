import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { auditGym, NOW, op } from "./subscription-audit.test-support";
import { DAY_MS } from "./subscriptionTerm";
type BillingCheckout = { gym: { id: string; name: string; status: string }; invoice: { id: string; amountMinor?: number; dueAt?: string; paymentClaim?: Record<string, unknown>; supportCaseId?: string } };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
it.each(["pending_payment", "suspended"] as const)("identity retains cancelled exports and %s billing, with explicit independent scope", async status => {
  const gym = await auditGym({ status: "cancelled", cancelledAt: NOW });
  const companion = await gym.t.run(async ctx => {
    const owner = (await ctx.db.query("users").collect()).find(user => user.publicId === "owner")!;
    const org = await ctx.db.insert("organizations", { publicId: "billing-org", name: "Billing Gym", slug: "billing-gym", status, subscriptionPlan: "Basic", timezone: "UTC", currency: "JOD", createdAt: NOW, updatedAt: NOW });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "billing-branch", name: "Billing", code: "B", active: true, status: "active", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId: owner._id, role: "owner", branchIds: [branch], branchScope: "all", invitationStatus: "accepted", active: true, createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("domainRecords", { organizationId: org, publicId: "billing-invoice", entityType: "platformInvoice", data: { status: "open", amountMinor: 49000, dueAt: new Date(NOW).toISOString() }, createdAt: NOW, updatedAt: NOW });
    return org;
  });
  expect(await gym.owner.query(api.identity.current, {})).toMatchObject({ memberships: [], billingAccess: [{ organizationId: "billing-org", status }], exportAccess: [{ organizationId: "audit-org", expiresAt: new Date(NOW + 30 * DAY_MS).toISOString() }] });
  // Input scope must override a stale session envelope without rebinding it.
  const checkout = await gym.owner.query(api.domain.query, { ...op("billing.checkout", { organizationId: "billing-org" }), organizationId: "audit-org", activeBranchId: "audit-branch" }) as BillingCheckout;
  expect(checkout.gym).toMatchObject({ id: "billing-org", name: "Billing Gym", status });
  expect(checkout.invoice?.id).toBe("billing-invoice");
  const payment = { organizationId: "billing-org", invoiceId: "billing-invoice", method: "cliq", reference: "BANK-1", payerName: "Owner", paidOn: "2026-10-10" };
  await gym.owner.mutation(api.domain.mutate, { ...op("billing.payment.submit", payment), organizationId: "audit-org" });
  const exported = await gym.owner.mutation(api.domain.mutate, { ...op("exports.request", { organizationId: "audit-org", kind: "members", idempotencyKey: "mixed-export" }), organizationId: "billing-org", activeBranchId: "billing-branch" });
  expect(exported).toMatchObject({ status: "completed" });
  for (const operation of ["session", "members.list"]) await expect(gym.owner.query(api.domain.query, { ...op(operation), organizationId: "audit-org" })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  await expect(gym.owner.query(api.domain.query, op("billing.checkout", { organizationId: "audit-org" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  await expect(gym.owner.query(api.domain.query, op("exports.list", { organizationId: "billing-org" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  await expect(gym.owner.query(api.domain.query, op("billing.checkout", { organizationId: "foreign" }))).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  vi.setSystemTime(NOW + 30 * DAY_MS);
  expect(await gym.owner.query(api.identity.current, {})).toMatchObject({ billingAccess: [{ organizationId: "billing-org", status }] });
  expect(await gym.owner.query(api.identity.current, {})).not.toHaveProperty("exportAccess");
  await expect(gym.owner.query(api.domain.query, op("exports.list", { organizationId: "audit-org" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  expect(await gym.owner.query(api.domain.query, op("billing.checkout", { organizationId: "billing-org" }))).toHaveProperty("invoice.id", "billing-invoice");
  await gym.t.run(ctx => ctx.db.patch(companion, { archivedAt: NOW }));
  await expect(gym.owner.query(api.domain.query, op("billing.checkout", { organizationId: "billing-org" }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
});
