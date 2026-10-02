import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-offer-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "offer-org", name: "Offer Gym", slug: "offer-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "offer-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const salesperson = await ctx.db.insert("users", { publicId: "offer-sales", authSubject: "clerk-offer-sales", email: "sales@offer.example", fullName: "Offer Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: salesperson, role: "sales", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, data: Record<string, unknown>) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, ...data } });
    await insertRecord("plan", "offer-plan", { name: "Monthly", code: "MONTHLY", kind: "time", durationDays: 30, basePrice: { amount: 30_000, currency: "JOD" }, branchAccess: "all", status: "active" });
    await insertRecord("lead", "offer-lead-accepted", { fullName: "Accepted Lead", phone: "+962790001001", email: "accepted@example.com", branchId: "offer-branch", branchName: "Main", source: "walk_in", stage: "contacted", ownerId: "offer-sales", ownerName: "Offer Sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    await insertRecord("lead", "offer-lead-declined", { fullName: "Declined Lead", phone: "+962790001002", branchId: "offer-branch", branchName: "Main", source: "walk_in", stage: "contacted", ownerId: "offer-sales", ownerName: "Offer Sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
  });
}

describe("CRM offer lifecycle", () => {
  it("publishes a branded bearer link and records an immutable public response", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-offer-sales" });
    const draft = await sales.mutation(api.domain.mutate, operation("offers.create", { leadId: "offer-lead-accepted", planId: "offer-plan", price: { amount: 28_000, currency: "JOD" }, expiresInDays: 7 })) as { id: string; publicToken: string };
    expect(draft.publicToken).toMatch(/^[a-f0-9]{64}$/);

    const preparing = await t.query(api.domain.query, operation("public.offer", { token: draft.publicToken })) as { status: string; recipientName: string; organizationName: string };
    expect(preparing).toMatchObject({ status: "preparing", recipientName: "Accepted Lead", organizationName: "Offer Gym" });

    await sales.mutation(api.domain.mutate, operation("offers.deliver", { offerId: draft.id, channel: "whatsapp", reference: "Public offer link" }));
    const available = await t.query(api.domain.query, operation("public.offer", { token: draft.publicToken })) as { status: string };
    expect(available.status).toBe("available");

    const accepted = await t.mutation(api.domain.mutate, operation("public.offer.respond", { token: draft.publicToken, outcome: "accepted" })) as { status: string; respondedAt: string };
    expect(accepted).toMatchObject({ status: "accepted", respondedAt: expect.any(String) });
    await expect(t.mutation(api.domain.mutate, operation("public.offer.respond", { token: draft.publicToken, outcome: "accepted" }))).resolves.toMatchObject({ status: "accepted" });

    const persisted = await t.run(async (ctx) => ({
      responses: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "offerResponse")).collect(),
      timelines: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
    }));
    expect(persisted.responses).toHaveLength(1);
    expect(persisted.responses[0]?.data).toMatchObject({ offerId: draft.id, outcome: "accepted", source: "public_link" });
    expect(persisted.timelines.map((row) => row.data)).toContainEqual(expect.objectContaining({ type: "offer_accepted", actorName: "Offer recipient", meta: expect.objectContaining({ source: "public_link" }) }));
  });

  it("keeps drafts truthful, records delivery, and persists an accepted response once", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-offer-sales" });
    const draft = await sales.mutation(api.domain.mutate, operation("offers.create", { leadId: "offer-lead-accepted", planId: "offer-plan", price: { amount: 28_000, currency: "JOD" }, expiresInDays: 7 })) as { id: string; status: string };
    expect(draft.status).toBe("draft");
    await expectCode(sales.mutation(api.domain.mutate, operation("offers.respond", { offerId: draft.id, outcome: "accepted" })), "CONFLICT");

    const delivered = await sales.mutation(api.domain.mutate, operation("offers.deliver", { offerId: draft.id, channel: "email", reference: "staging-delivery-reference" })) as { status: string; deliveryChannel: string };
    expect(delivered).toMatchObject({ status: "sent", deliveryChannel: "email" });
    const accepted = await sales.mutation(api.domain.mutate, operation("offers.respond", { offerId: draft.id, outcome: "accepted", reason: "Lead confirmed the offer" })) as { status: string; responseReason: string };
    expect(accepted).toMatchObject({ status: "accepted", responseReason: "Lead confirmed the offer" });
    await expectCode(sales.mutation(api.domain.mutate, operation("offers.respond", { offerId: draft.id, outcome: "accepted" })), "CONFLICT");

    const persisted = await t.run(async (ctx) => ({
      timeline: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
      audits: await ctx.db.query("auditEvents").collect(),
    }));
    expect(persisted.timeline.map((row) => (row.data as { type?: string }).type)).toEqual(expect.arrayContaining(["offer_drafted", "offer_sent", "offer_accepted"]));
    expect(persisted.audits.filter((event) => event.action === "offer.accepted")).toHaveLength(1);
  });

  it("reason-gates declines and returns the lead to an explicit follow-up state", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-offer-sales" });
    const draft = await sales.mutation(api.domain.mutate, operation("offers.create", { leadId: "offer-lead-declined", planId: "offer-plan", price: { amount: 30_000, currency: "JOD" }, expiresInDays: 7 })) as { id: string };
    await sales.mutation(api.domain.mutate, operation("offers.deliver", { offerId: draft.id, channel: "whatsapp", reference: "staging-whatsapp-reference" }));
    await expectCode(sales.mutation(api.domain.mutate, operation("offers.respond", { offerId: draft.id, outcome: "declined" })), "VALIDATION_ERROR");
    await sales.mutation(api.domain.mutate, operation("offers.respond", { offerId: draft.id, outcome: "declined", reason: "Timing does not work" }));

    const lead = await sales.query(api.domain.query, operation("leads.get", { leadId: "offer-lead-declined" })) as { stage: string; nextFollowUpAt?: string; offers: Array<{ status: string }> };
    expect(lead.stage).toBe("contacted");
    expect(lead.nextFollowUpAt).toEqual(expect.any(String));
    expect(lead.offers).toContainEqual(expect.objectContaining({ status: "declined" }));
  });

  it("blocks the retired member-only conversion path", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-offer-sales" });
    const draft = await sales.mutation(api.domain.mutate, operation("offers.create", { leadId: "offer-lead-accepted", planId: "offer-plan", price: { amount: 28_000, currency: "JOD" }, expiresInDays: 7 })) as { id: string };
    await sales.mutation(api.domain.mutate, operation("offers.deliver", { offerId: draft.id, channel: "manual", reference: "accepted-at-conversion" }));

    await expectCode(sales.mutation(api.domain.mutate, operation("leads.convert", {
      leadId: "offer-lead-accepted",
      homeBranchId: "offer-branch",
      preferredLanguage: "en",
    })), "VALIDATION_ERROR");

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "offer-org")).unique();
      if (!organization) throw new Error("Offer test organization is missing");
      return {
        offer: await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "offer").eq("publicId", draft.id)).unique(),
        timeline: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
        audits: await ctx.db.query("auditEvents").collect(),
      };
    });
    expect((persisted.offer?.data as { status?: string }).status).toBe("sent");
    expect(persisted.timeline.filter((row) => (row.data as { type?: string }).type === "offer_accepted")).toHaveLength(0);
    expect(persisted.audits.filter((event) => event.action === "offer.accepted")).toHaveLength(0);
  });
});
