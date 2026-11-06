import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-allowlist-${name}` });
const expectValidation = async (request: Promise<unknown>) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const org = await ctx.db.insert("organizations", { publicId: "allow-org", name: "Allow Gym", slug: "allow-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "allow-branch", name: "Main", code: "M", active: true, status: "active", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { publicId: "allow-owner", authSubject: "clerk-allow-owner", email: "owner@example.com", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId, role: "owner", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
}

async function stored(t: TestConvex<typeof schema>, entityType: string, publicId: string): Promise<Record<string, unknown>> {
  return await t.run(async (ctx) => {
    const record = (await ctx.db.query("domainRecords").collect()).find((row) => row.entityType === entityType && row.publicId === publicId);
    return (record?.data ?? {}) as Record<string, unknown>;
  });
}

const plan = { name: "Monthly", code: "MON", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0 };

describe("edits change only what an edit may change", () => {
  it("ignores a member's status, number, account link and referrer in members.update", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-allow-owner" });
    const created = await owner.mutation(api.domain.mutate, operation("members.create", { fullName: "Lina Haddad", phone: "+962790007101", gender: "female", homeBranchId: "allow-branch" })) as { member: { id: string; memberNumber: string } };
    const memberId = created.member.id;

    const updated = await owner.mutation(api.domain.mutate, operation("members.update", {
      memberId,
      city: "Amman",
      status: "archived",
      archivedAt: "2026-01-01T00:00:00.000Z",
      memberNumber: "X-1",
      customerProfileId: "someone-else",
      referredByMemberId: "referrer",
      organizationId: "another-org",
    })) as { city?: string; status: string; memberNumber: string };

    expect(updated.city).toBe("Amman");
    expect(updated.status).toBe("active");
    expect(updated.memberNumber).toBe(created.member.memberNumber);
    const record = await stored(t, "member", memberId);
    expect(record).toMatchObject({ city: "Amman", status: "active", memberNumber: created.member.memberNumber, organizationId: "allow-org" });
    expect(record).not.toHaveProperty("archivedAt");
    expect(record).not.toHaveProperty("customerProfileId");
    expect(record).not.toHaveProperty("referredByMemberId");
  });

  it("refuses member values a member record cannot hold", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-allow-owner" });
    const created = await owner.mutation(api.domain.mutate, operation("members.create", { fullName: "Omar Saleh", phone: "+962790007102", gender: "male", homeBranchId: "allow-branch" })) as { member: { id: string } };
    const memberId = created.member.id;
    for (const input of [{ gender: "other" }, { preferredLanguage: "fr" }, { dateOfBirth: "12/03/1994" }, { tags: "vip" }, { tags: [1] }]) {
      await expectValidation(owner.mutation(api.domain.mutate, operation("members.update", { memberId, ...input })));
    }
    const updated = await owner.mutation(api.domain.mutate, operation("members.update", { memberId, gender: "male", preferredLanguage: "ar", dateOfBirth: "1994-03-12", tags: ["vip"] })) as { preferredLanguage: string; tags: string[] };
    expect(updated).toMatchObject({ preferredLanguage: "ar", tags: ["vip"] });
  });

  it("ignores fields a plan edit may not change and refuses values a plan cannot hold", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-allow-owner" });
    const created = await owner.mutation(api.domain.mutate, operation("plans.create", plan)) as { id: string };

    await owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, code: " mon2 ", organizationId: "another-org", activeSubscribers: 99, createdBy: "someone" }));
    const record = await stored(t, "plan", created.id);
    expect(record).toMatchObject({ code: "MON2", organizationId: "allow-org" });
    expect(record).not.toHaveProperty("activeSubscribers");
    expect(record).not.toHaveProperty("createdBy");

    for (const input of [{ status: "deleted" }, { kind: "class" }, { branchAccess: "some" }, { branchIds: "allow-branch" }, { basePrice: { amount: -1, currency: "JOD" } }, { basePrice: { amount: 1.5, currency: "JOD" } }, { code: "  " }]) {
      await expectValidation(owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, ...input })));
    }
    await expectValidation(owner.mutation(api.domain.mutate, operation("plans.create", { ...plan, code: "NEG", basePrice: { amount: -5, currency: "JOD" } })));
    const archived = await owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, status: "archived" })) as { status: string };
    expect(archived.status).toBe("archived");
  });
});

describe("free text is bounded on the server", () => {
  it("refuses notes, reasons, addresses and support text longer than any form allows, at any depth", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-allow-owner" });
    const created = await owner.mutation(api.domain.mutate, operation("members.create", { fullName: "Sara Odeh", phone: "+962790007103", gender: "female", homeBranchId: "allow-branch", notes: "N".repeat(2000) })) as { member: { id: string } };
    const memberId = created.member.id;

    const tooLong = async (request: Promise<unknown>, maximum: number) => {
      await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR", message: `This text is too long. The limit is ${maximum} characters.` }) });
    };
    await tooLong(owner.mutation(api.domain.mutate, operation("members.update", { memberId, notes: "N".repeat(2001) })), 2000);
    await tooLong(owner.mutation(api.domain.mutate, operation("members.archive", { memberId, reason: "R".repeat(2001) })), 2000);
    await tooLong(owner.mutation(api.domain.mutate, operation("members.update", { memberId, addressLine1: "A".repeat(501) })), 500);
    await tooLong(owner.mutation(api.domain.mutate, operation("members.update", { memberId, city: "C".repeat(256) })), 255);
    await tooLong(owner.mutation(api.domain.mutate, operation("support.create", { subject: "S".repeat(256), body: "Help" })), 255);
    await tooLong(owner.mutation(api.domain.mutate, operation("support.create", { subject: "Help", body: "B".repeat(2001) })), 2000);
    await tooLong(owner.mutation(api.domain.mutate, operation("memberships.renew", { membershipId: "any", payment: { notes: "P".repeat(2001) }, discountReason: "ok" })), 2000);
    await tooLong(owner.mutation(api.domain.mutate, operation("checklists.item.set", { items: [{ note: "x" }, { note: "Y".repeat(2001) }] })), 2000);
    await tooLong(owner.mutation(api.domain.mutate, operation("memberships.freeze", { membershipId: "any", freezeReason: "F".repeat(2001) })), 2000);

    // At the limit is fine, and the check leaves the member as it was when it refuses.
    expect(await stored(t, "member", memberId)).toMatchObject({ notes: "N".repeat(2000), status: "active" });
    const updated = await owner.mutation(api.domain.mutate, operation("members.update", { memberId, addressLine1: "A".repeat(500), city: "C".repeat(255) })) as { addressLine1: string };
    expect(updated.addressLine1).toHaveLength(500);
  });
});
