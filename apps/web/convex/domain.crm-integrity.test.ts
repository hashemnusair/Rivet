import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-crm-integrity-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "crm-integrity-org-a", name: "CRM Integrity A", slug: "crm-integrity-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: "crm-integrity-org-b", name: "CRM Integrity B", slug: "crm-integrity-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "crm-integrity-branch-a", name: "A Main", code: "A", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "crm-integrity-branch-b", name: "B Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const addUser = async (organizationId: typeof orgA, publicId: string, role: "owner" | "manager" | "sales" | "receptionist" | "trainer", subject: string, options: { status?: "active" | "deactivated"; active?: boolean; branchId: typeof branchA | typeof branchB } = { branchId: branchA }) => {
      const userId = await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: options.status ?? "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId, role, branchIds: [options.branchId], branchScope: "selected", active: options.active ?? true, createdAt: now, updatedAt: now });
      return userId;
    };
    await addUser(orgA, "crm-integrity-owner", "owner", "clerk-crm-integrity-owner");
    await addUser(orgA, "crm-integrity-manager", "manager", "clerk-crm-integrity-manager");
    await addUser(orgA, "crm-integrity-sales", "sales", "clerk-crm-integrity-sales");
    await addUser(orgA, "crm-integrity-reception", "receptionist", "clerk-crm-integrity-reception");
    await addUser(orgA, "crm-integrity-trainer", "trainer", "clerk-crm-integrity-trainer");
    await addUser(orgA, "crm-integrity-inactive-membership", "sales", "clerk-crm-integrity-inactive-membership", { active: false, branchId: branchA });
    await addUser(orgA, "crm-integrity-deactivated", "sales", "clerk-crm-integrity-deactivated", { status: "deactivated", branchId: branchA });
    await addUser(orgB, "crm-integrity-foreign", "sales", "clerk-crm-integrity-foreign", { branchId: branchB });
    await ctx.db.insert("domainRecords", {
      organizationId: orgA,
      entityType: "lead",
      publicId: "crm-integrity-lead",
      branchId: branchA,
      createdAt: now,
      updatedAt: now,
      data: { id: "crm-integrity-lead", organizationId: "crm-integrity-org-a", branchId: "crm-integrity-branch-a", fullName: "Original Lead", phone: "+962 79 000 1000", email: "original@example.com", stage: "new", source: "walk_in", ownerId: "crm-integrity-sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() },
    });
    await ctx.db.insert("domainRecords", {
      organizationId: orgB,
      entityType: "member",
      publicId: "crm-integrity-foreign-member",
      branchId: branchB,
      createdAt: now,
      updatedAt: now,
      data: { id: "crm-integrity-foreign-member", organizationId: "crm-integrity-org-b", branchId: "crm-integrity-branch-b", homeBranchId: "crm-integrity-branch-b", memberNumber: "B-1000", fullName: "Foreign Matching Member", phone: "+962 79 000 1000", email: "original@example.com", status: "active", createdAt: new Date(now).toISOString() },
    });
  });
}

describe("CRM lead identity and assignment integrity", () => {
  it("normalizes phone-only and email leads, rejects malformed email, and validates self assignment", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-crm-integrity-sales" });

    const phoneOnly = await sales.mutation(api.domain.mutate, operation("leads.create", { fullName: "Phone Only Lead", phone: " +962 79 000 1001 ", email: "  ", branchId: "crm-integrity-branch-a", source: "phone_call", ownerId: "crm-integrity-sales" })) as { email?: string; phone: string; ownerId?: string };
    expect(phoneOnly).toMatchObject({ phone: "+962790001001", ownerId: "crm-integrity-sales" });
    expect(phoneOnly).not.toHaveProperty("email");

    const normalized = await sales.mutation(api.domain.mutate, operation("leads.create", { fullName: "Normalized Email Lead", phone: "+962790001002", email: "  NEW.LEAD@EXAMPLE.COM ", branchId: "crm-integrity-branch-a", source: "phone_call", ownerId: "crm-integrity-sales" })) as { email: string };
    expect(normalized.email).toBe("new.lead@example.com");
    await expectCode(sales.mutation(api.domain.mutate, operation("leads.create", { fullName: "Malformed Email Lead", phone: "+962790001003", email: "not-an-email", branchId: "crm-integrity-branch-a", source: "phone_call", ownerId: "crm-integrity-sales" })), "VALIDATION_ERROR");
  });

  it("rejects foreign, inactive, deactivated, and non-sales owner targets", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const targets = [
      ["crm-integrity-foreign", "NOT_FOUND"],
      ["crm-integrity-unknown", "NOT_FOUND"],
      ["crm-integrity-inactive-membership", "VALIDATION_ERROR"],
      ["crm-integrity-deactivated", "VALIDATION_ERROR"],
      ["crm-integrity-reception", "VALIDATION_ERROR"],
      ["crm-integrity-trainer", "VALIDATION_ERROR"],
    ] as const;
    for (const [index, [ownerId, code]] of targets.entries()) {
      await expectCode(owner.mutation(api.domain.mutate, operation("leads.create", { fullName: `Invalid ${ownerId}`, phone: `+96279000${String(index + 2000)}`, branchId: "crm-integrity-branch-a", source: "walk_in", ownerId })), code);
    }
  });

  it("keeps duplicate contact matching inside the actor tenant", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const matches = await owner.query(api.domain.query, operation("members.duplicates", { phone: "+962790001000", email: "ORIGINAL@EXAMPLE.COM" })) as Array<{ memberId: string }>;
    expect(matches).toEqual([]);
  });

  it("treats local and international Jordan phone forms as one member identity", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const created = await owner.mutation(api.domain.mutate, operation("members.create", {
      fullName: "Jordan Phone Member",
      phone: "079 321 4567",
      homeBranchId: "crm-integrity-branch-a",
      preferredLanguage: "en",
    })) as { member: { id: string; phone: string } };

    expect(created.member.phone).toBe("+962793214567");
    const matches = await owner.query(api.domain.query, operation("members.duplicates", { phone: "00962 79 321 4567" })) as Array<{ memberId: string }>;
    expect(matches).toEqual([{ memberId: created.member.id, fullName: "Jordan Phone Member", memberNumber: expect.any(String), matchedOn: "phone" }]);
    const search = await owner.query(api.domain.query, operation("members.list", { search: "079 321", pageSize: 10 })) as { items: Array<{ id: string }> };
    expect(search.items.map((member) => member.id)).toContain(created.member.id);
  });

  it("validates every update assignment, preserves unassigned, and requires crm.assign for another owner", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const sales = t.withIdentity({ subject: "clerk-crm-integrity-sales" });

    const self = await sales.mutation(api.domain.mutate, operation("leads.update", { leadId: "crm-integrity-lead", ownerId: "crm-integrity-sales" })) as { ownerId?: string };
    expect(self.ownerId).toBe("crm-integrity-sales");
    await expectCode(sales.mutation(api.domain.mutate, operation("leads.update", { leadId: "crm-integrity-lead", ownerId: "crm-integrity-manager" })), "FORBIDDEN");
    await owner.mutation(api.domain.mutate, operation("leads.update", { leadId: "crm-integrity-lead", ownerId: "crm-integrity-manager" }));
    const unassigned = await sales.query(api.domain.query, operation("leads.get", { leadId: "crm-integrity-lead" })) as { ownerId?: string };
    expect(unassigned.ownerId).toBe("crm-integrity-manager");
    await owner.mutation(api.domain.mutate, operation("leads.update", { leadId: "crm-integrity-lead", ownerId: "unassigned" }));
    const cleared = await owner.query(api.domain.query, operation("leads.get", { leadId: "crm-integrity-lead" })) as { ownerId?: string };
    expect(cleared).not.toHaveProperty("ownerId");
    await expectCode(owner.mutation(api.domain.mutate, operation("leads.update", { leadId: "crm-integrity-lead", ownerId: "crm-integrity-reception" })), "VALIDATION_ERROR");
  });

  it("corrects contact identity with an audited before/after and a non-pipeline timeline fact", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const updated = await owner.mutation(api.domain.mutate, operation("leads.update_contact", { leadId: "crm-integrity-lead", fullName: "  Corrected Lead ", phone: " +962 79 000 1009 ", email: "  CORRECTED@EXAMPLE.COM " })) as { fullName: string; phone: string; email: string; stage: string; activities: Array<{ type: string; body?: string; meta?: { fields?: string } }> };
    expect(updated).toMatchObject({ fullName: "Corrected Lead", phone: "+962790001009", email: "corrected@example.com", stage: "new" });
    const contactEvent = updated.activities.find((event) => event.type === "lead_contact_updated");
    expect(contactEvent).toMatchObject({ body: "Contact details were updated; pipeline status was unchanged.", meta: { fields: "fullName,phone,email" } });
    expect(updated.activities.some((event) => event.type === "call_attempt")).toBe(false);

    const audits = await owner.query(api.domain.query, operation("audit.list", { category: "crm", entityId: "crm-integrity-lead", pageSize: 100 })) as { items: Array<{ action: string; before?: Record<string, unknown>; after?: Record<string, unknown> }> };
    expect(audits.items).toContainEqual(expect.objectContaining({ action: "lead.contact.update", before: { fullName: "Original Lead", phone: "+962 79 000 1000", email: "original@example.com" }, after: { fullName: "Corrected Lead", phone: "+962790001009", email: "corrected@example.com" } }));

    const cleared = await owner.mutation(api.domain.mutate, operation("leads.update_contact", { leadId: "crm-integrity-lead", fullName: "Corrected Lead", phone: "+962790001009", email: " " })) as { email?: string };
    expect(cleared).not.toHaveProperty("email");
    await expectCode(owner.mutation(api.domain.mutate, operation("leads.update_contact", { leadId: "crm-integrity-lead", fullName: "Corrected Lead", phone: "+962790001009", email: "bad" })), "VALIDATION_ERROR");
  });

  it("requires, persists, and audits a terminal not-sold reason", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });

    await expectCode(owner.mutation(api.domain.mutate, operation("leads.contact", { leadId: "crm-integrity-lead", outcome: "answered_not_interested", stage: "lost" })), "VALIDATION_ERROR");
    const closed = await owner.mutation(api.domain.mutate, operation("leads.contact", {
      leadId: "crm-integrity-lead",
      outcome: "answered_not_interested",
      stage: "lost",
      notes: "Chose another gym closer to home",
    })) as { stage: string; lostReason?: string; activities: Array<{ type: string; body?: string }> };

    expect(closed).toMatchObject({ stage: "lost", lostReason: "Chose another gym closer to home" });
    expect(closed.activities).toContainEqual(expect.objectContaining({ type: "call_attempt", body: "Chose another gym closer to home" }));
    const audit = await owner.query(api.domain.query, operation("audit.list", { category: "crm", entityId: "crm-integrity-lead", pageSize: 20 })) as { items: Array<{ action: string; reason?: string }> };
    expect(audit.items).toContainEqual(expect.objectContaining({ action: "lead.lost", reason: "Chose another gym closer to home" }));
  });

  it("projects persisted CRM events into summaries and the dashboard funnel", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((item) => item.publicId === "crm-integrity-org-a");
      if (!organization) throw new Error("CRM integrity organization missing");
      const branch = (await ctx.db.query("branches").collect()).find((item) => item.publicId === "crm-integrity-branch-a");
      if (!branch) throw new Error("CRM integrity branch missing");
      const lead = (await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "lead").eq("publicId", "crm-integrity-lead")).unique());
      if (!lead) throw new Error("CRM integrity lead missing");
      const now = Date.now();
      await ctx.db.patch(lead._id, { data: { ...lead.data, stage: "offer_sent" }, updatedAt: now });
      const event = async (publicId: string, type: string, meta?: Record<string, string>) => {
        await ctx.db.insert("domainRecords", {
          organizationId: organization._id,
          entityType: "timeline",
          publicId,
          branchId: branch._id,
          leadPublicId: "crm-integrity-lead",
          createdAt: now,
          updatedAt: now,
          data: { id: publicId, organizationId: "crm-integrity-org-a", branchId: "crm-integrity-branch-a", leadId: "crm-integrity-lead", type, title: type, occurredAt: new Date(now).toISOString(), meta },
        });
      };
      await event("crm-integrity-attempt", "call_attempt", { outcome: "answered_interested" });
      await event("crm-integrity-trial-confirmed", "trial_confirmed");
      await event("crm-integrity-trial-completed", "trial_completed");
      await event("crm-integrity-offer-sent", "offer_sent");
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "trialBooking",
        publicId: "crm-integrity-trial",
        branchId: branch._id,
        leadPublicId: "crm-integrity-lead",
        createdAt: now,
        updatedAt: now,
        data: { id: "crm-integrity-trial", leadId: "crm-integrity-lead", status: "completed", preferredDate: "2026-08-28", preferredTime: "18:00" },
      });
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "offer",
        publicId: "crm-integrity-offer",
        branchId: branch._id,
        leadPublicId: "crm-integrity-lead",
        createdAt: now,
        updatedAt: now,
        data: { id: "crm-integrity-offer", leadId: "crm-integrity-lead", planId: "plan-1", planName: "Monthly", price: { amount: 40_000, currency: "JOD" }, status: "sent", createdAt: new Date(now).toISOString() },
      });
    });

    const owner = t.withIdentity({ subject: "clerk-crm-integrity-owner" });
    const detail = await owner.query(api.domain.query, operation("leads.get", { leadId: "crm-integrity-lead" })) as { progressFacts: Record<string, boolean> };
    expect(detail.progressFacts).toMatchObject({ hasAttempt: true, hasContact: true, hasTrialBooking: true, hasTrialCompletion: true, hasOfferDelivery: true, hasConversion: false, hasLoss: false });

    const dashboard = await owner.query(api.domain.query, operation("dashboard")) as { kpis: { activeLeads: number }; funnel: Array<{ stage: string; count: number }> };
    expect(dashboard.kpis.activeLeads).toBe(1);
    expect(Object.fromEntries(dashboard.funnel.map((item) => [item.stage, item.count]))).toMatchObject({ new: 1, attempted: 1, contacted: 1, trial_booked: 1, trial_completed: 1, offer_sent: 1, won: 0, lost: 0 });
  });
});
