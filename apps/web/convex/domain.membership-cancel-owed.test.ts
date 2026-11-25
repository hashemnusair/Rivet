import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-cancel-${name}` });

function dateInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const JOD = (amount: number) => ({ amount, currency: "JOD" });

/** One gym, three members with a running membership: two owe 60 JOD, one owes nothing. */
async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-cancel", name: "Cancel Gym", slug: "cancel-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "cancel-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "cancel-owner", authSubject: "clerk-cancel-owner", email: "owner@cancel.example", fullName: "Cancel Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const sales = await ctx.db.insert("users", { publicId: "cancel-sales", authSubject: "clerk-cancel-sales", email: "sales@cancel.example", fullName: "Cancel Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: sales, role: "sales", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, data: Record<string, unknown>, memberPublicId?: string) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, memberPublicId: entityType === "member" ? publicId : memberPublicId, createdAt: now, updatedAt: now, data: { id: publicId, ...data } });
    await insertRecord("plan", "plan-month", { name: "Monthly", code: "MONTH", kind: "time", durationDays: 30, basePrice: JOD(60_000), branchAccess: "all", status: "active", freezeAllowanceDays: 0 });
    for (const [key, owes] of [["a", true], ["b", true], ["c", false]] as const) {
      await insertRecord("member", `member-${key}`, { fullName: `Member ${key.toUpperCase()}`, memberNumber: `MAIN-100${key}`, phone: `+96279000020${key.charCodeAt(0)}`, homeBranchId: "cancel-branch", status: "active", createdAt: new Date(now).toISOString() });
      await insertRecord("membership", `membership-${key}`, { memberId: `member-${key}`, planId: "plan-month", homeBranchId: "cancel-branch", startDate: dateInDays(-5), endDate: dateInDays(25), salePrice: JOD(60_000), discount: JOD(0), status: "active", frozenDaysUsed: 0, freezes: [] }, `member-${key}`);
      await insertRecord("charge", `charge-${key}`, { memberId: `member-${key}`, membershipId: `membership-${key}`, total: JOD(60_000), paidAmount: JOD(owes ? 0 : 60_000), outstandingAmount: JOD(owes ? 60_000 : 0), status: owes ? "unpaid" : "paid", issueDate: dateInDays(-5), dueDate: dateInDays(-5) }, `member-${key}`);
    }
  });
}

async function cancelAudit(t: TestConvex<typeof schema>, membershipId: string) {
  return await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).find((event) => event.action === "membership.cancel" && event.entityPublicId === membershipId));
}

async function chargeOf(t: TestConvex<typeof schema>, chargeId: string) {
  return await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).find((row) => row.entityType === "charge" && row.publicId === chargeId)!.data as { status: string; outstandingAmount: { amount: number }; paidAmount: { amount: number } });
}

describe("cancelling a membership while the member owes money", () => {
  it("records what was owed and staff's answer, and never marks the money as paid", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-cancel-owner" });

    // Staff say the money has not been paid.
    await owner.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-a", reason: "Member moved abroad.", owedMoneyPaid: false }));
    expect(await cancelAudit(t, "membership-a")).toMatchObject({ reason: "Member moved abroad.", after: { status: "cancelled", owedMinor: 60_000, currency: "JOD", owedMoneyPaid: "no" } });

    // Staff say it has been paid. The answer is kept; the charge is untouched.
    await owner.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-b", reason: "Member paid at the desk and left.", owedMoneyPaid: true }));
    expect(await cancelAudit(t, "membership-b")).toMatchObject({ after: { status: "cancelled", owedMinor: 60_000, owedMoneyPaid: "yes" } });
    for (const id of ["charge-a", "charge-b"]) expect(await chargeOf(t, id)).toMatchObject({ status: "unpaid", outstandingAmount: { amount: 60_000 }, paidAmount: { amount: 0 } });

    // The members still show the amount as owed after the cancellation.
    const members = await owner.query(api.domain.query, operation("members.list", { pageSize: 20 })) as { items: Array<{ id: string; outstanding: { amount: number } }> };
    expect(members.items.find((member) => member.id === "member-b")).toMatchObject({ outstanding: { amount: 60_000 } });
  });

  it("records nothing about money when the member owes nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-cancel-owner" });
    await owner.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-c", reason: "Member asked to stop.", owedMoneyPaid: true }));
    const audit = await cancelAudit(t, "membership-c");
    expect(audit?.after).toEqual({ status: "cancelled" });
  });

  it("marks the answer as not asked when an older screen cancels without it", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-cancel-owner" });
    await owner.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-a", reason: "Member moved abroad." }));
    expect(await cancelAudit(t, "membership-a")).toMatchObject({ after: { owedMinor: 60_000, owedMoneyPaid: "not_asked" } });
  });

  it("still needs the permission and a reason", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-cancel-sales" });
    await expect(sales.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-a", reason: "Member moved abroad.", owedMoneyPaid: true }))).rejects.toThrow();
    const owner = t.withIdentity({ subject: "clerk-cancel-owner" });
    await expect(owner.mutation(api.domain.mutate, operation("memberships.cancel", { membershipId: "membership-a", reason: "", owedMoneyPaid: true }))).rejects.toThrow();
    expect(await cancelAudit(t, "membership-a")).toBeFalsy();
  });
});
