import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-checkin-lookup-${name}` });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(Date.now());
const shiftDays = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(Date.now() + days * 86_400_000);

/**
 * Two active people share a name; a third profile with the same name was
 * merged away. One of the twins has bought a term that starts next week.
 */
async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "lookup-org", name: "Lookup Gym", slug: "lookup-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", phoneCountryCallingCode: "+962", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "lookup-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { publicId: "lookup-owner", authSubject: "clerk-lookup-owner", email: "owner@lookup.test", fullName: "Lookup Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "plan", publicId: "lookup-plan", branchId, createdAt: now, updatedAt: now, data: { id: "lookup-plan", name: "Monthly", code: "MONTHLY", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], status: "active", freezeAllowanceDays: 5 } });
    const member = async (id: string, value: Record<string, unknown>) => {
      await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: id, branchId, memberPublicId: id, createdAt: now, updatedAt: now, data: { id, homeBranchId: "lookup-branch", status: "active", preferredLanguage: "en", tags: [], createdAt: new Date(now).toISOString(), ...value } });
    };
    await member("twin-one", { fullName: "Lookup Twin", memberNumber: "MAIN-1001", phone: "+962790000001" });
    await member("twin-two", { fullName: "Lookup Twin", memberNumber: "MAIN-1002", phone: "+962790000002" });
    await member("twin-merged", { fullName: "Lookup Twin", memberNumber: "MAIN-1003", phone: "+962790000003", mergedIntoMemberId: "twin-one" });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: "twin-one-next", branchId, memberPublicId: "twin-one", createdAt: now, updatedAt: now, data: { id: "twin-one-next", organizationId: "lookup-org", memberId: "twin-one", planId: "lookup-plan", homeBranchId: "lookup-branch", startDate: shiftDays(7), endDate: shiftDays(37), salePrice: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, paymentStatus: "paid", soldById: "lookup-owner", frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(now).toISOString() } });
  });
}

type Preview = { found: boolean; decision: string; reasonCodes: string[]; message: string; member?: { id: string }; membership?: { status: string }; candidates?: Array<{ id: string; memberNumber: string }> };

describe("front-desk lookup resolution", () => {
  it("lists the people a name could mean, excluding merged profiles, and never decides for the first", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-lookup-owner" });

    const ambiguous = await owner.query(api.domain.query, operation("checkins.preview", { branchId: "lookup-branch", query: "Lookup Twin" })) as Preview;
    expect(ambiguous.found).toBe(false);
    expect(ambiguous.member).toBeUndefined();
    expect(ambiguous.reasonCodes).toEqual([]);
    expect(ambiguous.message).toMatch(/2 members match/);
    expect(ambiguous.candidates?.map((candidate) => candidate.id).sort()).toEqual(["twin-one", "twin-two"]);
  });

  it("resolves a complete member number or phone straight to one person", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-lookup-owner" });

    const byNumber = await owner.query(api.domain.query, operation("checkins.preview", { branchId: "lookup-branch", query: "main 1002" })) as Preview;
    expect(byNumber.found).toBe(true);
    expect(byNumber.member?.id).toBe("twin-two");
    expect(byNumber.candidates).toBeUndefined();

    const byPhone = await owner.query(api.domain.query, operation("checkins.preview", { branchId: "lookup-branch", query: "079 000 0002" })) as Preview;
    expect(byPhone.found).toBe(true);
    expect(byPhone.member?.id).toBe("twin-two");
  });

  it("explains a term that has not started instead of calling it expired", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-lookup-owner" });

    const preview = await owner.query(api.domain.query, operation("checkins.preview", { branchId: "lookup-branch", query: "MAIN-1001" })) as Preview;
    expect(preview.found).toBe(true);
    expect(preview.decision).toBe("blocked");
    expect(preview.reasonCodes).toEqual(["MEMBERSHIP_NOT_STARTED"]);
    expect(preview.message).toContain(shiftDays(7));
    expect(preview.message).not.toMatch(/renew/i);
    expect(preview.membership?.status).toBe("scheduled");
    expect(today() < shiftDays(7)).toBe(true);
  });
});
