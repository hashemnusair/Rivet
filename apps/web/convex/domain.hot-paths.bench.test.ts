import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import { NOW, readCost, seedGym, summariseVisits, type ReadCost } from "./history-gym.bench-support";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

/**
 * Opt-in benchmark: `RIVET_DASHBOARD_BENCH=1 vitest run convex/domain.hot-paths.bench.test.ts`.
 *
 * Documents, index ranges and bytes read by the operations the front desk
 * and the sales team run all day, on the busy gym of
 * `history-gym.bench-support.ts` after 180 days, with member-visit summaries
 * in place. Convex refuses a transaction past 32,000 documents, 4,096 index
 * ranges or 16 MiB.
 */
type Row = ReadCost & { operation: string };
type Links = { retailReceiptId: string; guestReceiptId: string; ptOrderId: string };

/**
 * One member's linked payments: a card payment refunded twice, a retail sale
 * to them and one to a guest, and a paid PT package, so the member-scoped
 * payment reads have something to find.
 */
async function linkPayments(t: TestConvex<typeof schema>): Promise<Links> {
  await t.run(async (ctx) => {
    const organization = (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "bench-org")).unique())!;
    const branch = (await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).first())!;
    const now = Date.parse(NOW) - 3_600_000;
    const record = async (entityType: string, publicId: string, value: Record<string, unknown>) =>
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType, publicId, branchId: branch._id, memberPublicId: "bench-member-12", createdAt: now, updatedAt: now, data: { id: publicId, organizationId: "bench-org", memberId: "bench-member-12", branchId: branch.publicId, ...value } });
    const card = { method: "card", status: "completed", collectedById: "bench-owner", chargeId: "bench-card-charge", occurredAt: new Date(now).toISOString() };
    await record("charge", "bench-card-charge", { total: { amount: 12_000, currency: "JOD" }, paidAmount: { amount: 9_000, currency: "JOD" }, outstandingAmount: { amount: 3_000, currency: "JOD" }, status: "partial", issueDate: NOW.slice(0, 10), dueDate: NOW.slice(0, 10) });
    await record("payment", "bench-card-payment", { ...card, type: "payment", status: "partially_refunded", amount: { amount: 12_000, currency: "JOD" }, refundedAmount: { amount: 3_000, currency: "JOD" }, receiptId: "bench-card-receipt" });
    await record("receipt", "bench-card-receipt", { receiptNumber: "RV-900001", paymentId: "bench-card-payment", issuedAt: NOW });
    for (const [index, amount] of [[1, 2_000], [2, 1_000]] as const) {
      await record("payment", `bench-card-refund-${index}`, { ...card, type: "refund", amount: { amount: -amount, currency: "JOD" }, originalPaymentId: "bench-card-payment", receiptId: `bench-refund-receipt-${index}` });
      await record("receipt", `bench-refund-receipt-${index}`, { receiptNumber: `RV-90000${index + 1}`, paymentId: `bench-card-refund-${index}`, issuedAt: NOW });
    }
    await ctx.db.insert("ptPackages", { organizationId: organization._id, publicId: "bench-pt-12", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 24_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
  });
  const owner = t.withIdentity({ subject: "clerk-bench-owner" });
  const mutate = async (operation: string, input: Record<string, unknown>) => await owner.mutation(api.domain.mutate, { operation, input, correlationId: `cor-bench-setup-${operation}` }) as Record<string, unknown>;
  const product = await mutate("operations.product.upsert", { sku: "BENCH-SHAKE", name: "Protein shake", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_500, currency: "JOD" } });
  await mutate("operations.stock_movement.record", { branchId: "bench-branch-a", productId: product.id, type: "receive", quantity: 10, unitCost: { amount: 500, currency: "JOD" }, idempotencyKey: "bench-stock" });
  const retail = await mutate("operations.retail.checkout", { branchId: "bench-branch-a", memberId: "bench-member-12", lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-1", idempotencyKey: "bench-retail-member" });
  const guest = await mutate("operations.retail.checkout", { branchId: "bench-branch-a", guest: { fullName: "Walk-in Buyer", phone: "+962790000123" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-2", idempotencyKey: "bench-retail-guest" });
  const order = await mutate("pt.package.request", { membershipId: "bench-membership-12", packageId: "bench-pt-12", idempotencyKey: "bench-pt-order" });
  await mutate("payments.create", { memberId: "bench-member-12", chargeId: order.chargeId, amount: { amount: 24_000, currency: "JOD" }, method: "card", externalReference: "POS-PT", idempotencyKey: "bench-pt-pay" });
  return { retailReceiptId: String(retail.receiptId), guestReceiptId: String(guest.receiptId), ptOrderId: String(order.id) };
}

async function measureAll(t: TestConvex<typeof schema>, links: Links): Promise<Row[]> {
  const owner = t.withIdentity({ subject: "clerk-bench-owner" });
  const today = NOW.slice(0, 10);
  const query = (operation: string, input: Record<string, unknown>) => () => owner.query(api.domain.query, { operation, input, correlationId: `cor-bench-${operation}` });
  const mutate = (operation: string, input: Record<string, unknown>) => () => owner.mutation(api.domain.mutate, { operation, input, correlationId: `cor-bench-${operation}` });
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["checkins.preview (member number)", query("checkins.preview", { branchId: "bench-branch-a", query: "B-12" })],
    ["checkins.list (reception: today)", query("checkins.list", { branchId: "bench-branch-a", date: today, acceptedOnly: true, page: 1, pageSize: 25 })],
    ["checkins.occupancy", query("checkins.occupancy", { branchId: "bench-branch-a" })],
    ["checkins.list (member tab)", query("checkins.list", { memberId: "bench-member-12", page: 1, pageSize: 20 })],
    ["members.list (page 1)", query("members.list", { page: 1, pageSize: 25 })],
    ["members.get", query("members.get", { memberId: "bench-member-12" })],
    ["leads.list", query("leads.list", { page: 1, pageSize: 25 })],
    ["retention.queue", query("retention.queue", { page: 1, pageSize: 25 })],
    ["renewal.queue (expiring)", query("renewal.queue", { bucket: "expiring", page: 1, pageSize: 25 })],
    ["transactions.list", query("transactions.list", { page: 1, pageSize: 25 })],
    ["transactions.list (member tab)", query("transactions.list", { memberId: "bench-member-12", pageSize: 30 })],
    ["receipts.get (payment with refunds)", query("receipts.get", { receiptId: "bench-card-receipt" })],
    ["receipts.get (refund)", query("receipts.get", { receiptId: "bench-refund-receipt-1" })],
    ["receipts.get (retail sale to a member)", query("receipts.get", { receiptId: links.retailReceiptId })],
    ["receipts.get (guest retail sale)", query("receipts.get", { receiptId: links.guestReceiptId })],
    ["workspace.search", query("workspace.search", { search: "Member 12" })],
    ["checkins.create", mutate("checkins.create", { branchId: "bench-branch-a", memberId: "bench-member-13" })],
    ["payments.refund", mutate("payments.refund", { paymentId: "bench-card-payment", amount: { amount: 1_000, currency: "JOD" }, reason: "Benchmark refund", idempotencyKey: "bench-refund" })],
    ["pt.package.refund", mutate("pt.package.refund", { orderId: links.ptOrderId, sessions: 2, reason: "Benchmark PT refund" })],
  ];
  const rows: Row[] = [];
  for (const [operation, run] of cases) {
    try { rows.push({ operation, ...(await readCost(run)) }); }
    catch (error) { rows.push({ operation: `${operation} FAILED: ${String((error as Error).message).slice(0, 80)}`, documentsRead: -1, indexRanges: -1, megabytesRead: -1, withinConvexLimits: false }); }
  }
  return rows;
}

afterEach(() => vi.useRealTimers());

describe.skipIf(!process.env.RIVET_DASHBOARD_BENCH)("front desk and sales reads against history", () => {
  it("measures each hot operation after 180 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedGym(t, 180);
    await summariseVisits(t);
    const rows = await measureAll(t, await linkPayments(t));
    console.table(rows);
    expect(rows.length).toBeGreaterThan(0);
  }, 900_000);
});
