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
    const organization = await ctx.db.insert("organizations", { publicId: "org-export", name: "Export Gym", slug: "export-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const foreignOrganization = await ctx.db.insert("organizations", { publicId: "org-foreign", name: "Foreign Gym", slug: "foreign-gym", status: "active", timezone: "UTC", currency: "USD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-export", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-export", authSubject: "clerk-owner-export", email: "owner@example.com", fullName: "Owner Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const trainer = await ctx.db.insert("users", { publicId: "trainer-export", authSubject: "clerk-trainer-export", email: "trainer@example.com", fullName: "Trainer Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "customer-export", authSubject: "clerk-customer-export", email: "customer@example.com", fullName: "Customer Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: trainer, role: "trainer", branchIds: [branch], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "member-export", branchId: branch, memberPublicId: "member-export", createdAt: now, updatedAt: now, data: { id: "member-export", fullName: "Doe, \"Jane\"", memberNumber: "M-100", phone: "+962790000000", email: "=2+2", homeBranchId: "branch-export", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("customerProfiles", { publicId: "profile-export", userId: "customer-export", name: "جنى حداد", nameAr: "جنى حداد", email: "customer@example.com", phone: "+962790000010", gender: "female", preferredLanguage: "ar", initials: "جح", context: "RIVET member", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "member-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "member-customer-export", fullName: "جنى حداد", memberNumber: "M-200", phone: "+962790000010", email: "customer@example.com", homeBranchId: "branch-export", customerProfileId: "profile-export", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: "membership-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "membership-customer-export", memberId: "member-customer-export", planId: "plan-export", homeBranchId: "branch-export", startDate: "2026-08-01", endDate: "2026-12-31", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "customerMembership", publicId: "portal-membership-export", branchId: branch, memberPublicId: "member-customer-export", customerUserPublicId: "customer-export", customerProfilePublicId: "profile-export", createdAt: now, updatedAt: now, data: { id: "portal-membership-export", customerUserId: "customer-export", customerId: "profile-export", memberId: "member-customer-export", membershipId: "membership-customer-export", gymId: "org-export", branchId: "branch-export", branchName: "Main", memberNumber: "M-200", planName: "All access", status: "active", startDate: "2026-08-01", endDate: "2026-12-31", balanceMinor: 15_000 } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "charge", publicId: "charge-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "charge-customer-export", memberId: "member-customer-export", description: "Membership balance", total: { amount: 15_000, currency: "JOD" }, paidAmount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount: 15_000, currency: "JOD" }, status: "unpaid", issueDate: "2026-08-01", dueDate: "2026-08-31", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "payment", publicId: "payment-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "payment-customer-export", memberId: "member-customer-export", membershipId: "membership-customer-export", branchId: "branch-export", receiptId: "receipt-customer-export", receiptNumber: "R-200", type: "payment", status: "completed", amount: { amount: 40_000, currency: "JOD" }, method: "cash", occurredAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "checkIn", publicId: "checkin-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "checkin-customer-export", memberId: "member-customer-export", branchId: "branch-export", branchName: "Main", decision: "allowed", occurredAt: new Date(now).toISOString(), actorName: "Reception" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "timeline", publicId: "timeline-customer-export", branchId: branch, memberPublicId: "member-customer-export", createdAt: now, updatedAt: now, data: { id: "timeline-customer-export", memberId: "member-customer-export", type: "membership_sale", title: "Membership sold", body: "All access", occurredAt: new Date(now).toISOString(), actorName: "Owner Export" } });
    await ctx.db.insert("domainRecords", { organizationId: foreignOrganization, entityType: "member", publicId: "foreign-member", createdAt: now, updatedAt: now, data: { id: "foreign-member", fullName: "Must Not Leak", memberNumber: "F-1" } });
  });
}

describe("tenant data exports", () => {
  it("generates escaped, scoped CSV with metadata, idempotency, history, and audit", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-export" });
    const input = { kind: "members", filters: { branchId: "branch-export" }, idempotencyKey: "export-members-001" };
    const first = await owner.mutation(api.domain.mutate, operation("exports.request", input)) as { id: string; rowCount: number; content: string; timezone: string; branchScope: string };
    const replay = await owner.mutation(api.domain.mutate, operation("exports.request", input)) as { id: string };
    expect(first).toMatchObject({ rowCount: 2, timezone: "Asia/Amman", branchScope: "branch:branch-export" });
    expect(first.content).toContain('"Doe, ""Jane"""');
    expect(first.content).toContain("'=2+2");
    expect(first.content).not.toContain(",=2+2,");
    expect(first.content.startsWith("\uFEFFRIVET export,Member directory\r\n")).toBe(true);
    expect(first.content).toContain("Generated at");
    expect(first.content).toContain("Member number,Full name,Arabic name,Phone");
    expect(first.content).not.toContain("data_json");
    expect(first.content).not.toContain("{\"");
    expect(first.content).not.toContain("RIVET member ID");
    expect(first.content).not.toContain("Must Not Leak");
    expect(replay.id).toBe(first.id);
    const history = await owner.query(api.domain.query, operation("exports.list")) as Array<{ id: string; content?: string }>;
    expect(history).toEqual([expect.objectContaining({ id: first.id, content: expect.any(String) })]);
    const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "data.export"));
    expect(audit).toEqual([expect.objectContaining({ entityPublicId: first.id, after: expect.objectContaining({ rowCount: 2, timezone: "Asia/Amman" }) })]);
  });

  it("creates a concise flat personal-data CSV without internal records", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const customer = t.withIdentity({ subject: "clerk-customer-export" });
    const exported = await customer.mutation(api.domain.mutate, operation("exports.member_personal_data", { idempotencyKey: "customer-export-readable-001" })) as { rowCount: number; content: string; fileName: string; mimeType: string };

    expect(exported.rowCount).toBeGreaterThan(5);
    expect(exported.fileName).toMatch(/^rivet-my-data-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exported.mimeType).toBe("text/csv;charset=utf-8");
    expect(exported.content.startsWith("\uFEFFRIVET export,My RIVET data\r\n")).toBe(true);
    expect(exported.content).toContain("Category,Gym,Branch,Date,Record,Details,Amount,Currency,Status");
    expect(exported.content).toContain("Profile,,,,Full name,جنى حداد");
    expect(exported.content).toContain("Membership,Export Gym,Main,2026-08-01,All access");
    expect(exported.content).toContain("Charge,Export Gym,,2026-08-01,Membership balance");
    expect(exported.content).toContain("Payment,Export Gym,Main");
    expect(exported.content).toContain("Check-in,Export Gym,Main");
    expect(exported.content).toContain("Account activity,Export Gym");
    expect(exported.content).toContain("40.000");
    expect(exported.content).toContain("JOD");
    expect(exported.content).not.toContain("data_json");
    expect(exported.content).not.toContain("{\"");
    expect(exported.content).not.toContain("profile-export");
    expect(exported.content).not.toContain("payment-customer-export");
  });

  it("enforces dataset permissions and rejects idempotency-key reuse with different filters", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const trainer = t.withIdentity({ subject: "clerk-trainer-export" });
    await expectCode(trainer.mutation(api.domain.mutate, operation("exports.request", { kind: "operations", idempotencyKey: "export-operations-001" })), "FORBIDDEN");
    const owner = t.withIdentity({ subject: "clerk-owner-export" });
    await owner.mutation(api.domain.mutate, operation("exports.request", { kind: "members", filters: {}, idempotencyKey: "export-members-002" }));
    await expectCode(owner.mutation(api.domain.mutate, operation("exports.request", { kind: "members", filters: { search: "different" }, idempotencyKey: "export-members-002" })), "CONFLICT");
  });

  it("rejects an oversized export instead of presenting a partial CSV as complete", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-export")).unique();
      const member = organization ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", "member-export")).unique() : null;
      if (!member) throw new Error("Export member fixture missing");
      await ctx.db.patch(member._id, { data: { ...member.data, notes: "x".repeat(760_000) }, updatedAt: Date.now() });
    });

    const result = await t.withIdentity({ subject: "clerk-owner-export" }).mutation(api.domain.mutate, operation("exports.request", { kind: "members", filters: {}, idempotencyKey: "export-members-oversized" })) as { status: string; rowCount: number; totalRows: number; content?: string; failureMessage?: string };
    expect(result).toMatchObject({ status: "failed", rowCount: 0, totalRows: 2, failureMessage: expect.stringContaining("safe single-download limit") });
    expect(result.content).toBeUndefined();
  });

  it("keeps personal-training exports inside a selected branch", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-export")).unique();
      const mainBranch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "branch-export")).unique();
      if (!organization || !mainBranch) throw new Error("Export fixtures missing");
      const otherBranch = await ctx.db.insert("branches", { organizationId: organization._id, publicId: "branch-other", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
      const manager = await ctx.db.insert("users", { publicId: "manager-export", authSubject: "clerk-manager-export", email: "manager@example.com", fullName: "Manager Export", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization._id, userId: manager, role: "manager", branchIds: [mainBranch._id], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "member", publicId: "member-other", branchId: otherBranch, memberPublicId: "member-other", createdAt: now, updatedAt: now, data: { id: "member-other", fullName: "Other Branch Member", memberNumber: "O-100", phone: "+962790000001", homeBranchId: "branch-other", createdAt: new Date(now).toISOString() } });
      const ptPackage = await ctx.db.insert("ptPackages", { organizationId: organization._id, publicId: "package-export", name: "Export package", sessionCount: 4, totalPriceMinor: 40_000, currency: "JOD", validityDays: 30, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("ptPackageOrders", { organizationId: organization._id, publicId: "order-visible", memberPublicId: "member-export", membershipPublicId: "membership-visible", packageId: ptPackage, chargePublicId: "charge-visible", packageNameSnapshot: "Visible package", sessionCountSnapshot: 4, totalPriceMinorSnapshot: 40_000, currencySnapshot: "JOD", status: "active", refundedSessions: 0, refundedMinor: 0, createdAt: now, updatedAt: now });
      await ctx.db.insert("ptPackageOrders", { organizationId: organization._id, publicId: "order-hidden", memberPublicId: "member-other", membershipPublicId: "membership-hidden", packageId: ptPackage, chargePublicId: "charge-hidden", packageNameSnapshot: "Hidden package", sessionCountSnapshot: 4, totalPriceMinorSnapshot: 40_000, currencySnapshot: "JOD", status: "active", refundedSessions: 0, refundedMinor: 0, createdAt: now, updatedAt: now });
    });
    const manager = t.withIdentity({ subject: "clerk-manager-export" });
    const exported = await manager.mutation(api.domain.mutate, operation("exports.request", { kind: "personal_training", filters: {}, idempotencyKey: "export-pt-scoped-001" })) as { rowCount: number; content: string };
    expect(exported.rowCount).toBe(1);
    expect(exported.content).toContain("Visible package");
    expect(exported.content).not.toContain("Hidden package");
    expect(exported.content).not.toContain("order-visible");
  });
});
