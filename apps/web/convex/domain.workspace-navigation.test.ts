import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const org = await ctx.db.insert("organizations", { publicId: "org-nav", name: "Nav Gym", slug: "nav-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const otherOrg = await ctx.db.insert("organizations", { publicId: "org-nav-other", name: "Other Gym", slug: "other-gym", status: "active", timezone: "UTC", currency: "USD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "branch-nav", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-nav", authSubject: "clerk-owner-nav", email: "owner@nav.test", fullName: "Owner Nav", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const auditor = await ctx.db.insert("users", { publicId: "auditor-nav", authSubject: "clerk-auditor-nav", email: "auditor@nav.test", fullName: "Auditor Nav", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: org, userId: auditor, role: "auditor", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: org, entityType: "member", publicId: "member-nav", branchId: branch, memberPublicId: "member-nav", createdAt: now, updatedAt: now, data: { id: "member-nav", fullName: "Lina Haddad", memberNumber: "M-1042", phone: "+962 79 551 2042", homeBranchId: "branch-nav" } });
    await ctx.db.insert("domainRecords", { organizationId: org, entityType: "payment", publicId: "payment-nav", branchId: branch, memberPublicId: "member-nav", createdAt: now, updatedAt: now, data: { id: "payment-nav", memberId: "member-nav", memberName: "Lina Haddad", receiptId: "receipt-nav", receiptNumber: "RCP-7782", externalReference: "CLIQ-AX91", status: "completed", occurredAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: otherOrg, entityType: "member", publicId: "member-secret", createdAt: now, updatedAt: now, data: { id: "member-secret", fullName: "Other Tenant Secret", memberNumber: "SECRET-1", phone: "+962 79 999 9999" } });
  });
}

describe("workspace navigation helpers", () => {
  it("searches phone fragments, receipt references, pages and actions without tenant leakage", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-nav" });
    const phone = await owner.query(api.domain.query, operation("workspace.search", { search: "551 2042" })) as Array<{ kind: string; title: string }>;
    expect(phone).toEqual([expect.objectContaining({ kind: "member", title: "Lina Haddad" })]);
    const reference = await owner.query(api.domain.query, operation("workspace.search", { search: "AX91" })) as Array<{ kind: string; title: string }>;
    expect(reference).toEqual([expect.objectContaining({ kind: "receipt", title: "RCP-7782" })]);
    const create = await owner.query(api.domain.query, operation("workspace.search", { search: "collect payment" })) as Array<{ kind: string; id: string }>;
    expect(create).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "action", id: "collect-payment" })]));
    const noLeak = await owner.query(api.domain.query, operation("workspace.search", { search: "Tenant Secret" })) as unknown[];
    expect(noLeak).toEqual([]);
  });

  it("persists recents and pins per user and re-enforces role actions", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-nav" });
    await owner.mutation(api.domain.mutate, operation("workspace.recent.record", { kind: "member", id: "member-nav", title: "Lina Haddad", subtitle: "M-1042", href: "/members/member-nav" }));
    const recent = await owner.query(api.domain.query, operation("workspace.recents")) as Array<{ id: string; viewedAt: string }>;
    expect(recent).toEqual([expect.objectContaining({ id: "member-nav", viewedAt: expect.any(String) })]);
    const pinned = await owner.mutation(api.domain.mutate, operation("workspace.pin.upsert", { targetKey: "collect-payment", kind: "action", label: "Collect payment", href: "/payments?collect=1" })) as { id: string };
    expect(await owner.query(api.domain.query, operation("workspace.pins"))).toEqual([expect.objectContaining({ id: pinned.id, targetKey: "collect-payment" })]);
    const auditor = t.withIdentity({ subject: "clerk-auditor-nav" });
    expect(await auditor.query(api.domain.query, operation("workspace.recents"))).toEqual([]);
    await expectCode(auditor.mutation(api.domain.mutate, operation("workspace.pin.upsert", { targetKey: "collect-payment", kind: "action", label: "Collect payment", href: "/payments?collect=1" })), "FORBIDDEN");
  });
});
