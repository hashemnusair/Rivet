import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { A, B, NOW, ORG, money, seedHistory, type Ids } from "./history-fixture.test-support";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

/**
 * Pins the payment reads scoped to one member (the member record's Payments
 * tab, receipts, payment refunds and PT refunds) to their output over the
 * shared history gym, plus refunds linked to their payments, a merged
 * duplicate, retail sales to a member and a guest, and a paid PT package.
 * The snapshot was recorded with the code that read every payment in the
 * gym; reading one member's payments must give the same answers and write
 * the same refunds and audit events.
 */
const OWNER = "clerk-dash-owner";
const MANAGER_A = "clerk-dash-manager-a";
const DESK = "clerk-dash-desk";
const SALES = "clerk-dash-sales";
const FOREIGN = "clerk-other-owner";

type Json = Record<string, unknown>;

/** Linked refunds, a merged duplicate, a branch-B receipt, a PT package and a second gym. */
async function addLinkedPayments(t: TestConvex<typeof schema>, ids: Ids): Promise<void> {
  await t.run(async (ctx) => {
    const at = Date.parse("2026-10-12T10:00:00.000Z");
    const record = async (entityType: string, publicId: string, value: Json, branch: typeof ids.branchA, member?: string) =>
      await ctx.db.insert("domainRecords", { organizationId: ids.organization, entityType, publicId, branchId: branch, memberPublicId: member, createdAt: at, updatedAt: at, data: { id: publicId, organizationId: ORG, ...value } });
    const card = (id: string, value: Json) => ({ type: "payment", status: "completed", method: "card", collectedById: "dash-owner", collectedByName: "Dana Owner", externalReference: `POS-${id}`, ...value });

    // Rami's archived duplicate, merged into him, with a paid card charge of its own.
    const survivor = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", ids.organization).eq("entityType", "member").eq("publicId", "dm-inactive-a")).unique();
    await ctx.db.patch(survivor!._id, { data: { ...(survivor!.data as Json), mergedMemberIds: ["dm-dup"] } });
    await record("member", "dm-dup", { fullName: "Rami K.", memberNumber: "DM-DUP", phone: "+962790000099", homeBranchId: A, status: "archived", mergedIntoMemberId: "dm-inactive-a", createdAt: "2026-06-01T08:00:00.000Z" }, ids.branchA, "dm-dup");
    await record("charge", "ch-dup", { memberId: "dm-dup", description: "Monthly membership", total: money(4_000), paidAmount: money(4_000), outstandingAmount: money(0), status: "paid", issueDate: "2026-10-12", dueDate: "2026-10-12" }, ids.branchA, "dm-dup");
    await record("payment", "pay-dup", card("dup", { memberId: "dm-dup", branchId: A, chargeId: "ch-dup", amount: money(4_000), receiptId: "rc-dup", receiptNumber: "RV-009001", occurredAt: "2026-10-12T10:00:00.000Z" }), ids.branchA, "dm-dup");
    await record("receipt", "rc-dup", { receiptNumber: "RV-009001", paymentId: "pay-dup", issuedAt: "2026-10-12T10:00:00.000Z" }, ids.branchA, "dm-dup");

    // Lina's card payment, already refunded twice in part.
    await record("charge", "ch-card", { memberId: "dm-active-a", description: "Monthly membership", total: money(12_000), paidAmount: money(9_000), outstandingAmount: money(3_000), status: "partial", issueDate: "2026-10-12", dueDate: "2026-10-12" }, ids.branchA, "dm-active-a");
    await record("payment", "pay-card", card("card", { memberId: "dm-active-a", branchId: A, chargeId: "ch-card", amount: money(12_000), status: "partially_refunded", refundedAmount: money(3_000), refundReason: "Two sessions cancelled", receiptId: "rc-card", receiptNumber: "RV-009002", occurredAt: "2026-10-12T10:00:00.000Z" }), ids.branchA, "dm-active-a");
    await record("receipt", "rc-card", { receiptNumber: "RV-009002", paymentId: "pay-card", issuedAt: "2026-10-12T10:00:00.000Z" }, ids.branchA, "dm-active-a");
    for (const [index, amount] of [[1, 2_000], [2, 1_000]] as const) {
      await record("payment", `pay-card-refund-${index}`, card(`card-refund-${index}`, { memberId: "dm-active-a", branchId: A, chargeId: "ch-card", type: "refund", amount: money(-amount), originalPaymentId: "pay-card", refundReason: "Two sessions cancelled", receiptId: `rc-card-refund-${index}`, receiptNumber: `RV-00900${2 + index}`, occurredAt: `2026-10-1${2 + index}T10:00:00.000Z` }), ids.branchA, "dm-active-a");
      await record("receipt", `rc-card-refund-${index}`, { receiptNumber: `RV-00900${2 + index}`, paymentId: `pay-card-refund-${index}`, issuedAt: `2026-10-1${2 + index}T10:00:00.000Z` }, ids.branchA, "dm-active-a");
    }

    // A card payment at branch B, outside the branch-A staff's reach.
    await record("payment", "pay-frozen-card", card("frozen", { memberId: "dm-frozen", branchId: B, amount: money(8_000), receiptId: "rc-frozen-card", receiptNumber: "RV-009005", occurredAt: "2026-10-11T10:00:00.000Z" }), ids.branchB, "dm-frozen");
    await record("receipt", "rc-frozen-card", { receiptNumber: "RV-009005", paymentId: "pay-frozen-card", issuedAt: "2026-10-11T10:00:00.000Z" }, ids.branchB, "dm-frozen");

    await ctx.db.insert("ptPackages", { organizationId: ids.organization, publicId: "pt-pack-12", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 24_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: at, updatedAt: at });

    // A second gym whose owner must not reach any of this.
    const other = await ctx.db.insert("organizations", { publicId: "other-org", name: "Other Gym", slug: "other-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: at, updatedAt: at });
    const otherBranch = await ctx.db.insert("branches", { organizationId: other, publicId: "other-branch", name: "Other", code: "OTH", active: true, status: "active", createdAt: at, updatedAt: at });
    const otherOwner = await ctx.db.insert("users", { publicId: "other-owner", authSubject: FOREIGN, email: "owner@other.example", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: at, updatedAt: at });
    await ctx.db.insert("organizationMemberships", { organizationId: other, userId: otherOwner, role: "owner", branchIds: [otherBranch], branchScope: "all", active: true, createdAt: at, updatedAt: at });
  });
}

function client(t: TestConvex<typeof schema>, subject: string, activeBranchId?: string) {
  const as = t.withIdentity({ subject });
  const outcome = async (run: () => Promise<unknown>): Promise<unknown> => {
    try { return await run(); } catch (error) { return { error: (error as { data?: { code?: string } }).data?.code ?? String(error) }; }
  };
  return {
    query: (operation: string, input: Json) => outcome(() => as.query(api.domain.query, { operation, input, correlationId: `cor-payment-history-${operation}`, activeBranchId })),
    mutate: (operation: string, input: Json) => outcome(() => as.mutation(api.domain.mutate, { operation, input, correlationId: `cor-payment-history-${operation}`, activeBranchId })),
  };
}

/** Ids the handlers generate count up instead, so the snapshot is the same on every run. */
function countedIds(): void {
  let next = 0;
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => `00000000-0000-4000-8000-${String((next += 1)).padStart(12, "0")}`);
}

/** Real retail sales and a paid PT package, through the handlers staff use. */
async function recordSales(t: TestConvex<typeof schema>): Promise<Json> {
  const owner = client(t, OWNER);
  const product = await owner.mutate("operations.product.upsert", { sku: "PIN-SHAKE", name: "Protein shake", unit: "each", reorderPoint: 1, retailPrice: money(1_500) }) as Json;
  await owner.mutate("operations.stock_movement.record", { branchId: A, productId: product.id, type: "receive", quantity: 10, unitCost: money(500), idempotencyKey: "pin-stock" });
  const memberSale = await owner.mutate("operations.retail.checkout", { branchId: A, memberId: "dm-active-a", lines: [{ productId: product.id, quantity: 2 }], method: "card", externalReference: "VISA-PIN-1", idempotencyKey: "pin-retail-member" }) as Json;
  const retailRefund = await owner.mutate("operations.retail.refund", { saleId: (memberSale.retailSale as Json | undefined)?.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Damaged bottle returned", idempotencyKey: "pin-retail-refund" }) as Json;
  const guestSale = await owner.mutate("operations.retail.checkout", { branchId: A, guest: { fullName: "Walk-in Buyer", phone: "+962790000123" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-PIN-2", idempotencyKey: "pin-retail-guest" }) as Json;
  const order = await owner.mutate("pt.package.request", { membershipId: "ms-active-a", packageId: "pt-pack-12", idempotencyKey: "pin-pt-order" }) as Json;
  const ptPayment1 = await owner.mutate("payments.create", { memberId: "dm-active-a", chargeId: order.chargeId, amount: money(10_000), method: "card", externalReference: "POS-PT-1", idempotencyKey: "pin-pt-pay-1" }) as Json;
  const ptPayment2 = await owner.mutate("payments.create", { memberId: "dm-active-a", chargeId: order.chargeId, amount: money(14_000), method: "card", externalReference: "POS-PT-2", idempotencyKey: "pin-pt-pay-2" }) as Json;
  return { memberSale, retailRefund, guestSale, order, ptPayment1, ptPayment2 };
}

const receiptIdOf = (value: unknown): string => String((value as Json).receiptId ?? ((value as Json).receipt as Json | undefined)?.id);

async function memberViews(t: TestConvex<typeof schema>, sales: Json): Promise<Json> {
  const owner = client(t, OWNER);
  const manager = client(t, MANAGER_A);
  const desk = client(t, DESK);
  const salesperson = client(t, SALES, A);
  const foreign = client(t, FOREIGN);
  return {
    "payments tab": await owner.query("transactions.list", { memberId: "dm-active-a", pageSize: 30 }),
    "payments tab, page 2 of 5": await owner.query("transactions.list", { memberId: "dm-active-a", page: 2, pageSize: 5 }),
    "member refunds": await owner.query("transactions.list", { memberId: "dm-active-a", type: "refund" }),
    "member card payments this month": await owner.query("transactions.list", { memberId: "dm-active-a", method: "card", from: "2026-10-01", to: "2026-10-15" }),
    "member search by receipt": await owner.query("transactions.list", { memberId: "dm-active-a", search: "RV-00900" }),
    "member by amount": await owner.query("transactions.list", { memberId: "dm-active-a", sort: "amount" }),
    "member at another branch's filter": await owner.query("transactions.list", { memberId: "dm-active-a", branchId: B }),
    "branch-B member, branch-A manager": await manager.query("transactions.list", { memberId: "dm-frozen" }),
    "roaming member, branch-A manager": await manager.query("transactions.list", { memberId: "dm-roamer" }),
    "merged survivor": await owner.query("transactions.list", { memberId: "dm-inactive-a" }),
    "merged duplicate": await owner.query("transactions.list", { memberId: "dm-dup" }),
    "unknown member": await owner.query("transactions.list", { memberId: "dm-nobody" }),
    "every payment, page 1": await owner.query("transactions.list", { page: 1, pageSize: 25 }),
    "every payment, branch-A manager": await manager.query("transactions.list", { pageSize: 100 }),
    "payments tab, reception": await desk.query("transactions.list", { memberId: "dm-active-a" }),
    "payments tab, sales": await salesperson.query("transactions.list", { memberId: "dm-active-a" }),
    "receipt with refunds": await owner.query("receipts.get", { receiptId: "rc-card" }),
    "refund receipt": await owner.query("receipts.get", { receiptId: "rc-card-refund-1" }),
    "merged duplicate's receipt": await owner.query("receipts.get", { receiptId: "rc-dup" }),
    "branch-B receipt, owner": await owner.query("receipts.get", { receiptId: "rc-frozen-card" }),
    "branch-B receipt, branch-A manager": await manager.query("receipts.get", { receiptId: "rc-frozen-card" }),
    "receipt, reception": await desk.query("receipts.get", { receiptId: "rc-card" }),
    "receipt, another gym's owner": await foreign.query("receipts.get", { receiptId: "rc-card" }),
    "retail sale to a member": await owner.query("receipts.get", { receiptId: receiptIdOf(sales.memberSale) }),
    "retail refund receipt": await owner.query("receipts.get", { receiptId: receiptIdOf(sales.retailRefund) }),
    "guest retail sale, sales": await salesperson.query("receipts.get", { receiptId: receiptIdOf(sales.guestSale) }),
    "PT payment receipt": await owner.query("receipts.get", { receiptId: receiptIdOf(sales.ptPayment1) }),
  };
}

async function refunds(t: TestConvex<typeof schema>, sales: Json): Promise<Json> {
  const owner = client(t, OWNER);
  const manager = client(t, MANAGER_A);
  const salesperson = client(t, SALES, A);
  const foreign = client(t, FOREIGN);
  const orderId = (sales.order as Json).id;
  const partial = { paymentId: "pay-card", amount: money(4_000), reason: "Member moved two sessions to next month", idempotencyKey: "pin-refund-card" };
  return {
    "refund part of a part-refunded payment": await owner.mutate("payments.refund", partial),
    "same refund replayed": await owner.mutate("payments.refund", partial),
    "refund more than remains": await owner.mutate("payments.refund", { ...partial, amount: money(6_000), idempotencyKey: "pin-refund-over" }),
    "refund by sales": await salesperson.mutate("payments.refund", { ...partial, idempotencyKey: "pin-refund-sales" }),
    "refund by another gym's owner": await foreign.mutate("payments.refund", { ...partial, idempotencyKey: "pin-refund-foreign" }),
    "branch-B refund, branch-A manager": await manager.mutate("payments.refund", { paymentId: "pay-frozen-card", reason: "Not my branch", idempotencyKey: "pin-refund-branch" }),
    "refund the merged duplicate's payment in full": await owner.mutate("payments.refund", { paymentId: "pay-dup", reason: "Duplicate profile charged by mistake", idempotencyKey: "pin-refund-dup" }),
    "refund the rest": await manager.mutate("payments.refund", { paymentId: "pay-card", reason: "Member cancelled the month", idempotencyKey: "pin-refund-rest" }),
    "refund a fully refunded payment": await owner.mutate("payments.refund", { paymentId: "pay-card", amount: money(1), reason: "One more", idempotencyKey: "pin-refund-again" }),
    "PT refund by sales": await salesperson.mutate("pt.package.refund", { orderId, sessions: 1, reason: "No permission" }),
    "PT refund of 9 sessions": await owner.mutate("pt.package.refund", { orderId, sessions: 9, reason: "Member relocating" }),
    "PT refund of more than is left": await owner.mutate("pt.package.refund", { orderId, sessions: 4, reason: "Over-refund attempt" }),
    "PT refund of the last 3": await manager.mutate("pt.package.refund", { orderId, sessions: 3, reason: "Member relocating, rest of the package" }),
  };
}

async function writtenRecords(t: TestConvex<typeof schema>, ids: Ids): Promise<Json> {
  return await t.run(async (ctx) => {
    const payments = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", ids.organization).eq("entityType", "payment")).collect();
    const audits = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", ids.organization)).collect();
    return {
      refundPayments: payments.filter((row) => (row.data as Json).type === "refund" || (row.data as Json).refundedAmount).map((row) => ({ publicId: row.publicId, memberPublicId: row.memberPublicId, data: row.data })),
      refundAudits: audits.filter((event) => ["payment.refund", "pt.package.refund", "operations.retail_sale.refund"].includes(event.action)).map(({ _id, _creationTime, organizationId: _organizationId, actorUserId: _actorUserId, ...event }) => event),
    };
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("member-scoped payment reads over a gym with history", () => {
  it("answer and refund exactly as when they read every payment in the gym", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    countedIds();
    const t = convexTest(schema, modules);
    const ids = await seedHistory(t);
    await addLinkedPayments(t, ids);
    const sales = await recordSales(t);
    const before = await memberViews(t, sales);
    const refunded = await refunds(t, sales);
    const after = await memberViews(t, sales);
    expect({ sales, before, refunded, after, written: await writtenRecords(t, ids) }).toMatchSnapshot();
  }, 120_000);
});

type Page = { items: Json[]; totalItems: number };

/** Payment rows and audit events in the history gym, to prove a refused request wrote nothing. */
async function moneyWrites(t: TestConvex<typeof schema>, ids: Ids): Promise<{ payments: number; audits: number }> {
  return await t.run(async (ctx) => ({
    payments: (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", ids.organization).eq("entityType", "payment")).collect()).length,
    audits: (await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", ids.organization)).collect()).length,
  }));
}

async function auditsFor(t: TestConvex<typeof schema>, ids: Ids, action: string): Promise<Json[]> {
  return await t.run(async (ctx) => (await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", ids.organization)).collect()).filter((event) => event.action === action && event.publicId !== "audit-approved"));
}

async function historyGym(): Promise<{ t: TestConvex<typeof schema>; ids: Ids }> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
  const t = convexTest(schema, modules);
  const ids = await seedHistory(t);
  await addLinkedPayments(t, ids);
  return { t, ids };
}

/** A paid PT package: two card payments against the order's charge, a minute apart. */
async function paidPtOrder(t: TestConvex<typeof schema>, membershipId: string, memberId: string): Promise<{ orderId: string; newerPaymentId: string }> {
  const owner = client(t, OWNER);
  const order = await owner.mutate("pt.package.request", { membershipId, packageId: "pt-pack-12", idempotencyKey: `auth-pt-${membershipId}` }) as Json;
  await owner.mutate("payments.create", { memberId, chargeId: order.chargeId, amount: money(10_000), method: "card", externalReference: `POS-${memberId}-1`, idempotencyKey: `auth-pt-pay-1-${memberId}` });
  vi.setSystemTime(Date.now() + 60_000);
  const newer = await owner.mutate("payments.create", { memberId, chargeId: order.chargeId, amount: money(14_000), method: "card", externalReference: `POS-${memberId}-2`, idempotencyKey: `auth-pt-pay-2-${memberId}` }) as { payment: Json };
  return { orderId: String(order.id), newerPaymentId: String(newer.payment.id) };
}

describe("member-scoped payment reads and refunds: who may run them", () => {
  /** A duplicate remains at A; its survivor is at B, outside A's manager scope. Historical money keeps A's member id. */
  async function mergeIntoOtherBranch(t: TestConvex<typeof schema>, ids: Ids) {
    await t.run(async (ctx) => {
      const member = async (id: string) => (await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", ids.organization).eq("entityType", "member").eq("publicId", id)).unique())!;
      const duplicate = await member("dm-active-a");
      const survivor = await member("dm-frozen");
      await ctx.db.patch(duplicate._id, { data: { ...duplicate.data, status: "archived", mergedIntoMemberId: survivor.publicId } });
      await ctx.db.patch(survivor._id, { data: { ...survivor.data, mergedMemberIds: [duplicate.publicId] } });
    });
  }

  it("keeps historical receipt links when a merged survivor is outside the manager's branch", async () => {
    const { t, ids } = await historyGym();
    await mergeIntoOtherBranch(t, ids);
    const manager = client(t, MANAGER_A);
    expect(await manager.query("receipts.get", { receiptId: "rc-card" })).toMatchObject({
      relatedPayments: [{ id: "pay-card-refund-1" }, { id: "pay-card-refund-2" }],
    });
    expect(await manager.query("receipts.get", { receiptId: "rc-card-refund-1" })).toMatchObject({ relatedPayments: [{ id: "pay-card" }] });
    expect(await manager.query("receipts.get", { receiptId: "rc-frozen-card" })).toEqual({ error: "NOT_FOUND" });
  });

  it("counts earlier refunds after a cross-branch merge and refuses an over-refund without writes", async () => {
    const { t, ids } = await historyGym();
    await mergeIntoOtherBranch(t, ids);
    const manager = client(t, MANAGER_A);
    const input = { paymentId: "pay-card", amount: money(9_001), reason: "Refund remaining balance", idempotencyKey: "cross-branch-over-refund" };
    const before = await moneyWrites(t, ids);
    expect(await manager.mutate("payments.refund", input)).toEqual({ error: "REFUND_EXCEEDS_AMOUNT" });
    expect(await moneyWrites(t, ids)).toEqual(before);
    expect(await manager.mutate("payments.refund", { ...input, amount: money(9_000), idempotencyKey: "cross-branch-remainder" })).toMatchObject({
      payment: { amount: money(-9_000) },
      relatedPayments: [{ id: "pay-card", status: "refunded", refundedAmount: money(12_000) }],
    });
  });

  it("finds the original PT payments after their member merges into another branch", async () => {
    const { t, ids } = await historyGym();
    const { orderId, newerPaymentId } = await paidPtOrder(t, "ms-active-a", "dm-active-a");
    await mergeIntoOtherBranch(t, ids);
    const manager = client(t, MANAGER_A);
    expect(await manager.mutate("pt.package.refund", { orderId, sessions: 2, reason: "Member relocating" })).toMatchObject({ refundedSessions: 2, refundedAmount: money(4_000) });
    const refunds = (await manager.query("transactions.list", { memberId: "dm-active-a", type: "refund", sort: "-occurredAt" }) as Page).items;
    expect(refunds[0]).toMatchObject({ originalPaymentId: newerPaymentId, amount: money(-4_000) });
  });

  it("keep a member's Payments tab and receipts to staff with the permission, the branch and the gym", async () => {
    const { t } = await historyGym();
    const owner = client(t, OWNER);
    const manager = client(t, MANAGER_A);
    const desk = client(t, DESK);
    const salesperson = client(t, SALES, A);
    const foreign = client(t, FOREIGN);

    // The Payments tab needs the financial-report permission.
    expect(await desk.query("transactions.list", { memberId: "dm-active-a" })).toEqual({ error: "FORBIDDEN" });
    expect(await salesperson.query("transactions.list", { memberId: "dm-active-a" })).toEqual({ error: "FORBIDDEN" });
    // It shows only payments at the actor's branches, and nothing from another gym.
    expect((await owner.query("transactions.list", { memberId: "dm-frozen" }) as Page).totalItems).toBe(3);
    expect(await manager.query("transactions.list", { memberId: "dm-frozen" })).toMatchObject({ items: [], totalItems: 0 });
    expect(await foreign.query("transactions.list", { memberId: "dm-active-a" })).toMatchObject({ items: [], totalItems: 0 });
    // A merged duplicate's payments stay on the duplicate's own list, as before.
    expect((await owner.query("transactions.list", { memberId: "dm-inactive-a" }) as Page).items.map((item) => item.id)).toEqual(["pay-edge-month"]);

    // A receipt needs member access, the receipt's branch and the actor's gym.
    expect(await desk.query("receipts.get", { receiptId: "rc-card" })).toMatchObject({ payment: { id: "pay-card" }, relatedPayments: [{ id: "pay-card-refund-1" }, { id: "pay-card-refund-2" }] });
    expect(await desk.query("receipts.get", { receiptId: "rc-card-refund-2" })).toMatchObject({ payment: { id: "pay-card-refund-2" }, relatedPayments: [{ id: "pay-card" }] });
    expect(await manager.query("receipts.get", { receiptId: "rc-frozen-card" })).toEqual({ error: "NOT_FOUND" });
    expect(await foreign.query("receipts.get", { receiptId: "rc-card" })).toEqual({ error: "NOT_FOUND" });
  }, 60_000);

  it("refund a payment only with the refund permission, a reason and the payment's branch, and audit it once", async () => {
    const { t, ids } = await historyGym();
    const owner = client(t, OWNER);
    const manager = client(t, MANAGER_A);
    const input = { paymentId: "pay-card", amount: money(4_000), reason: "Member moved two sessions to next month", idempotencyKey: "auth-refund" };
    const before = await moneyWrites(t, ids);

    expect(await client(t, SALES, A).mutate("payments.refund", input)).toEqual({ error: "FORBIDDEN" });
    expect(await client(t, DESK).mutate("payments.refund", input)).toEqual({ error: "FORBIDDEN" });
    expect(await owner.mutate("payments.refund", { ...input, reason: "" })).toEqual({ error: "VALIDATION_ERROR" });
    expect(await manager.mutate("payments.refund", { paymentId: "pay-frozen-card", reason: "Not this manager's branch", idempotencyKey: "auth-refund-branch" })).toEqual({ error: "NOT_FOUND" });
    expect(await client(t, FOREIGN).mutate("payments.refund", input)).toEqual({ error: "NOT_FOUND" });
    // The two earlier refunds still count: 3,000 of the 12,000 is already back.
    expect(await manager.mutate("payments.refund", { ...input, amount: money(9_001), idempotencyKey: "auth-refund-over" })).toEqual({ error: "REFUND_EXCEEDS_AMOUNT" });
    expect(await moneyWrites(t, ids)).toEqual(before);

    const refunded = await manager.mutate("payments.refund", input) as Json;
    expect(refunded).toMatchObject({ payment: { type: "refund", amount: { amount: -4_000 }, memberId: "dm-active-a", originalPaymentId: "pay-card" }, relatedPayments: [{ id: "pay-card", status: "partially_refunded", refundedAmount: { amount: 7_000 } }] });
    expect(await manager.mutate("payments.refund", input)).toEqual(refunded);
    expect(await moneyWrites(t, ids)).toEqual({ payments: before.payments + 1, audits: before.audits + 1 });
    expect(await auditsFor(t, ids, "payment.refund")).toEqual([expect.objectContaining({ actorPublicId: "dash-manager-a", entityPublicId: "pay-card", reason: input.reason, approvalStatus: "approved", before: { paymentStatus: "partially_refunded" }, after: { paymentStatus: "partially_refunded", refunded: 7_000 } })]);
  }, 60_000);

  it("refund PT sessions only with the PT refund permission, a reason and the order's branch, and audit it once", async () => {
    const { t, ids } = await historyGym();
    const owner = client(t, OWNER);
    const manager = client(t, MANAGER_A);
    const { orderId: orderA, newerPaymentId } = await paidPtOrder(t, "ms-active-a", "dm-active-a");
    const { orderId: orderB } = await paidPtOrder(t, "ms-never", "dm-never");
    const input = { orderId: orderA, sessions: 2, reason: "Member relocating" };
    const before = await moneyWrites(t, ids);

    expect(await client(t, SALES, A).mutate("pt.package.refund", input)).toEqual({ error: "FORBIDDEN" });
    expect(await client(t, DESK).mutate("pt.package.refund", input)).toEqual({ error: "FORBIDDEN" });
    expect(await owner.mutate("pt.package.refund", { ...input, reason: "" })).toEqual({ error: "VALIDATION_ERROR" });
    expect(await manager.mutate("pt.package.refund", { ...input, orderId: orderB })).toEqual({ error: "NOT_FOUND" });
    expect(await client(t, FOREIGN).mutate("pt.package.refund", input)).toEqual({ error: "NOT_FOUND" });
    expect(await moneyWrites(t, ids)).toEqual(before);

    expect(await manager.mutate("pt.package.refund", input)).toMatchObject({ refundedSessions: 2, refundedAmount: { amount: 4_000 }, status: "partially_refunded" });
    // The refund comes out of the newer of the order's two payments.
    expect(await moneyWrites(t, ids)).toEqual({ payments: before.payments + 1, audits: before.audits + 1 });
    const refunds = (await owner.query("transactions.list", { memberId: "dm-active-a", type: "refund", sort: "-occurredAt" }) as Page).items;
    expect(refunds[0]).toMatchObject({ amount: { amount: -4_000 }, memberId: "dm-active-a", originalPaymentId: newerPaymentId, refundReason: "Member relocating" });
    expect(await auditsFor(t, ids, "pt.package.refund")).toEqual([expect.objectContaining({ actorPublicId: "dash-manager-a", entityPublicId: orderA, reason: "Member relocating", before: expect.objectContaining({ refundedSessions: 0, refundedMinor: 0 }) })]);
  }, 60_000);
});
