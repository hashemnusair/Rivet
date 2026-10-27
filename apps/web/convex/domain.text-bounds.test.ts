import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-text-bounds-${name}` });
const expectValidation = async (request: Promise<unknown>) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const org = await ctx.db.insert("organizations", { publicId: "bounds-org", name: "Bounds Gym", slug: "bounds-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "bounds-branch", name: "Main", code: "M", active: true, status: "active", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { publicId: "bounds-owner", authSubject: "clerk-bounds-owner", email: "owner@example.com", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId, role: "owner", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
}

const member = (fullName: string, phone = "+962790007001") => ({ fullName, phone, gender: "female", homeBranchId: "bounds-branch" });
const plan = (input: Record<string, unknown> = {}) => ({ name: "Monthly", code: "MON", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0, ...input });

describe("typed text and counts are bounded by the API", () => {
  it("trims member names and refuses one longer than a lead or imported name may be", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-bounds-owner" });

    await expectValidation(owner.mutation(api.domain.mutate, operation("members.create", member("W".repeat(121)))));
    const created = await owner.mutation(api.domain.mutate, operation("members.create", member(`  ${"A".repeat(120)}  `))) as { member: { id: string; fullName: string } };
    expect(created.member.fullName).toBe("A".repeat(120));

    const memberId = created.member.id;
    await expectValidation(owner.mutation(api.domain.mutate, operation("members.update", { memberId, fullName: "   " })));
    await expectValidation(owner.mutation(api.domain.mutate, operation("members.update", { memberId, fullName: "W".repeat(121) })));
    const renamed = await owner.mutation(api.domain.mutate, operation("members.update", { memberId, fullName: "  Lina Haddad  " })) as { fullName: string };
    expect(renamed.fullName).toBe("Lina Haddad");
  });

  it("refuses plan counts that are fractional, negative or out of range, and an over-long name", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-bounds-owner" });

    for (const input of [{ durationDays: 1.5 }, { durationDays: -1 }, { durationDays: 99_999 }, { durationDays: "30" }, { freezeAllowanceDays: 181 }, { kind: "visits", durationDays: undefined, visitAllowance: 0 }, { name: "P".repeat(81) }]) {
      await expectValidation(owner.mutation(api.domain.mutate, operation("plans.create", plan(input))));
    }
    const created = await owner.mutation(api.domain.mutate, operation("plans.create", plan({ kind: "visits", durationDays: undefined, visitAllowance: 10, visitValidityDays: 90 }))) as { id: string; visitAllowance: number };
    expect(created.visitAllowance).toBe(10);

    await expectValidation(owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, visitValidityDays: 0 })));
    await expectValidation(owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, name: "  " })));
    const renamed = await owner.mutation(api.domain.mutate, operation("plans.update", { planId: created.id, name: "  Ten visits " })) as { name: string };
    expect(renamed.name).toBe("Ten visits");
  });
});
