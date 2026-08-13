import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-simple-crm-${name}` });

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "simple-crm-org", name: "Simple CRM Gym", slug: "simple-crm-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "simple-crm-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const salesperson = await ctx.db.insert("users", { publicId: "simple-crm-sales", authSubject: "clerk-simple-crm-sales", email: "sales@simple-crm.example", fullName: "Simple CRM Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: salesperson, role: "sales", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "simple-crm-manager", authSubject: "clerk-simple-crm-manager", email: "manager@simple-crm.example", fullName: "Simple CRM Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, value: Record<string, unknown>) => ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, ...value } });
    await insertRecord("plan", "simple-crm-plan", { organizationId: "simple-crm-org", name: "Monthly", code: "MONTHLY", kind: "time", durationDays: 30, basePrice: { amount: 30_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 2, status: "active" });
    await insertRecord("settings", "settings", { operationalPolicies: { trialSchedules: [{ branchId: "simple-crm-branch", days: { fri: { enabled: true, opensAt: "08:00", closesAt: "20:00" } } }] } });
    await insertRecord("lead", "simple-crm-lead-scheduled", { organizationId: "simple-crm-org", branchId: "simple-crm-branch", fullName: "Lead scheduled", phone: "+962790001004", email: "scheduled@simple-crm.example", stage: "new", source: "walk_in", ownerId: "simple-crm-sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    for (const [suffix, trialStatus] of [["existing", "completed"], ["custom", "completed"], ["unfinished", "confirmed"], ["reused", "completed"]] as const) {
      const phone = `+96279000${suffix === "existing" ? "1001" : suffix === "custom" ? "1002" : suffix === "unfinished" ? "1003" : "1005"}`;
      await insertRecord("lead", `simple-crm-lead-${suffix}`, { organizationId: "simple-crm-org", branchId: "simple-crm-branch", fullName: `Lead ${suffix}`, phone, email: `${suffix}@simple-crm.example`, stage: trialStatus === "completed" ? "trial_completed" : "trial_booked", source: "walk_in", ownerId: "simple-crm-sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
      await insertRecord("trialBooking", `simple-crm-trial-${suffix}`, { organizationId: "simple-crm-org", branchId: "simple-crm-branch", leadId: `simple-crm-lead-${suffix}`, fullName: `Lead ${suffix}`, phone, preferredDate: "2026-08-13", preferredTime: "18:00", goal: "Try the gym", status: trialStatus, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    }
    await insertRecord("member", "simple-crm-member-reused", { organizationId: "simple-crm-org", memberNumber: "MAIN-1000", fullName: "Lead reused", phone: "+962790001005", email: "reused@simple-crm.example", homeBranchId: "simple-crm-branch", status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: new Date(now).toISOString() });
    await insertRecord("member", "simple-crm-member-archived", { organizationId: "simple-crm-org", memberNumber: "MAIN-1001", fullName: "Archived member", phone: "+962790001006", email: "archived@simple-crm.example", homeBranchId: "simple-crm-branch", status: "archived", archivedAt: new Date(now).toISOString(), tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: new Date(now).toISOString() });
    await insertRecord("lead", "simple-crm-lead-archived", { organizationId: "simple-crm-org", branchId: "simple-crm-branch", fullName: "Archived member", phone: "+962790001006", email: "archived@simple-crm.example", stage: "won", source: "walk_in", ownerId: "simple-crm-sales", convertedMemberId: "simple-crm-member-archived", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
  });
}

describe("simple CRM membership sale", () => {
  it("lets staff schedule a lead trial only inside the branch trial window", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    await expect(sales.mutation(api.domain.mutate, operation("trials.schedule_for_lead", { leadId: "simple-crm-lead-scheduled", preferredDate: "2030-08-02", preferredTime: "21:00" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    const lead = await sales.mutation(api.domain.mutate, operation("trials.schedule_for_lead", { leadId: "simple-crm-lead-scheduled", preferredDate: "2030-08-02", preferredTime: "18:00" })) as { stage: string; trialBooking?: { status: string; preferredTime: string } };
    expect(lead).toMatchObject({ stage: "trial_booked", trialBooking: { status: "confirmed", preferredTime: "18:00" } });
  });

  it("creates the member and an existing-plan membership atomically", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    const result = await sales.mutation(api.domain.mutate, operation("leads.complete_sale", {
      leadId: "simple-crm-lead-existing",
      homeBranchId: "simple-crm-branch",
      preferredLanguage: "en",
      marketingOptIn: true,
      startDate: "2026-08-13",
      idempotencyKey: "simple-crm-existing-sale",
      membership: { mode: "existing", planId: "simple-crm-plan" },
    })) as { member: { id: string }; plan: { id: string }; membership: { memberId: string; planId: string }; charge: { membershipId: string } };

    expect(result.plan.id).toBe("simple-crm-plan");
    expect(result.membership).toMatchObject({ memberId: result.member.id, planId: "simple-crm-plan" });
    expect(result.charge.membershipId).toBeTruthy();
    const lead = await sales.query(api.domain.query, operation("leads.get", { leadId: "simple-crm-lead-existing" })) as { stage: string; convertedMemberId?: string; trialBooking?: { status: string } };
    expect(lead).toMatchObject({ stage: "won", convertedMemberId: result.member.id, trialBooking: { status: "converted" } });
  });

  it("creates a reusable custom plan with the entered price, duration, and PT sessions", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    const result = await sales.mutation(api.domain.mutate, operation("leads.complete_sale", {
      leadId: "simple-crm-lead-custom",
      homeBranchId: "simple-crm-branch",
      preferredLanguage: "en",
      startDate: "2026-08-13",
      idempotencyKey: "simple-crm-custom-sale",
      membership: { mode: "custom", name: "Eight week transformation", price: { amount: 150_000, currency: "JOD" }, durationDays: 56, includedPtSessions: 4 },
    })) as { member: { id: string }; plan: { id: string; name: string; durationDays: number; includedPtSessions: number; basePrice: { amount: number }; branchIds: string[] }; membership: { planId: string } };

    expect(result.plan).toMatchObject({ name: "Eight week transformation", durationDays: 56, includedPtSessions: 4, basePrice: { amount: 150_000 }, branchIds: ["simple-crm-branch"] });
    expect(result.membership.planId).toBe(result.plan.id);
    const plans = await sales.query(api.domain.query, operation("plans.list", { status: "active", pageSize: 100 })) as { items: Array<{ id: string }> };
    expect(plans.items.some((plan) => plan.id === result.plan.id)).toBe(true);
  });

  it("attaches the sold membership to one matching existing member instead of blocking or duplicating them", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    const before = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect());
    const result = await sales.mutation(api.domain.mutate, operation("leads.complete_sale", {
      leadId: "simple-crm-lead-reused",
      homeBranchId: "simple-crm-branch",
      preferredLanguage: "en",
      startDate: "2026-08-13",
      idempotencyKey: "simple-crm-reused-sale",
      membership: { mode: "existing", planId: "simple-crm-plan" },
    })) as { member: { id: string }; membership: { memberId: string } };

    expect(result.member.id).toBe("simple-crm-member-reused");
    expect(result.membership.memberId).toBe("simple-crm-member-reused");
    const after = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect());
    expect(after).toHaveLength(before.length);
  });

  it("keeps archived conversions out of CRM and permanently deletes only a confirmed archived member", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    const before = await sales.query(api.domain.query, operation("leads.list", { pageSize: 100 })) as { items: Array<{ id: string }> };
    expect(before.items.some((lead) => lead.id === "simple-crm-lead-archived")).toBe(false);
    const archivedMembers = await sales.query(api.domain.query, operation("members.list", { status: "archived", pageSize: 100 })) as { items: Array<{ id: string; status: string }> };
    expect(archivedMembers.items).toContainEqual(expect.objectContaining({ id: "simple-crm-member-archived", status: "archived" }));

    const manager = t.withIdentity({ subject: "clerk-simple-crm-manager" });
    await expect(manager.mutation(api.domain.mutate, operation("members.delete", { memberId: "simple-crm-member-archived", reason: "Duplicate record confirmed", confirmation: "Wrong name" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    await manager.mutation(api.domain.mutate, operation("members.delete", { memberId: "simple-crm-member-archived", reason: "Duplicate record confirmed", confirmation: "Archived member" }));

    await expect(manager.query(api.domain.query, operation("members.get", { memberId: "simple-crm-member-archived" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    const audit = await manager.query(api.domain.query, operation("audit.list", { category: "members", pageSize: 100 })) as { items: Array<{ action: string; entityId: string }> };
    expect(audit.items).toContainEqual(expect.objectContaining({ action: "member.delete", entityId: "simple-crm-member-archived" }));
    const after = await manager.query(api.domain.query, operation("leads.list", { pageSize: 100 })) as { items: Array<{ id: string }> };
    expect(after.items.some((lead) => lead.id === "simple-crm-lead-archived")).toBe(false);
    const archivedAfterDelete = await manager.query(api.domain.query, operation("members.list", { status: "archived", pageSize: 100 })) as { items: Array<{ id: string }> };
    expect(archivedAfterDelete.items.some((member) => member.id === "simple-crm-member-archived")).toBe(false);
  });

  it("refuses a sale before the trial is completed and creates no member", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-simple-crm-sales" });
    const membersBefore = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect());
    await expect(sales.mutation(api.domain.mutate, operation("leads.complete_sale", {
      leadId: "simple-crm-lead-unfinished",
      homeBranchId: "simple-crm-branch",
      preferredLanguage: "en",
      startDate: "2026-08-13",
      idempotencyKey: "simple-crm-unfinished-sale",
      membership: { mode: "existing", planId: "simple-crm-plan" },
    }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    const persistedMembers = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect());
    expect(persistedMembers).toHaveLength(membersBefore.length);
  });
});
