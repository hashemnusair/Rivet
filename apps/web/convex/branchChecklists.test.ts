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
    const organization = await ctx.db.insert("organizations", { publicId: "org-check", name: "Checklist Gym", slug: "checklist-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-a", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-b", name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("zones", { organizationId: organization, branchId: branchA, publicId: "zone-a", code: "FLOOR", name: "Main floor", kind: "floor", status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-check", authSubject: "clerk-owner-check", email: "owner@check.example", fullName: "Owner Check", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const reception = await ctx.db.insert("users", { publicId: "reception-check", authSubject: "clerk-reception-check", email: "reception@check.example", fullName: "Reception Check", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const managerB = await ctx.db.insert("users", { publicId: "manager-b-check", authSubject: "clerk-manager-b-check", email: "managerb@check.example", fullName: "Manager B", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branchA], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: managerB, role: "manager", branchIds: [branchB], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    // Entitle the operations module so facility-task escalation is available.
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings" } });
  });
}

const TEMPLATE_INPUT = {
  branchId: "branch-a",
  type: "opening",
  name: "Opening walkthrough",
  dueTime: "07:30",
  assignedRole: "receptionist",
  items: [
    { label: "Unlock doors", required: true },
    { label: "Check changing rooms", required: true, zoneId: "zone-a", offerMaintenance: true },
    { label: "Fresh towels", required: false },
  ],
};

describe("branch checklists", () => {
  it("validates and audits template management, rejecting invalid role, time, zone, and cross-branch input", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-check" });
    const reception = t.withIdentity({ subject: "clerk-reception-check" });

    await expectCode(reception.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, assignedRole: "janitor" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, dueTime: "25:99" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, branchId: "branch-b", items: [{ label: "Zone from A", zoneId: "zone-a" }] })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, items: [] })), "VALIDATION_ERROR");

    const created = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)) as { id: string; items: Array<{ id: string; order: number }> };
    expect(created.items).toHaveLength(3);
    expect(created.items.map((item) => item.order)).toEqual([0, 1, 2]);

    const updated = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, templateId: created.id, name: "Morning open", active: false })) as { name: string; active: boolean };
    expect(updated).toMatchObject({ name: "Morning open", active: false });

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.entityType === "checklist_template").map((event) => event.action));
    expect(audits).toEqual(expect.arrayContaining(["checklists.template.create", "checklists.template.update"]));

    // A disabled template stops accepting results but keeps history.
    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: created.id, itemId: created.items[0]!.id, status: "completed" })), "VALIDATION_ERROR");
  });

  it("creates exactly one run per template and local date, ensured lazily by the first result", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-check" });
    const reception = t.withIdentity({ subject: "clerk-reception-check" });
    const template = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)) as { id: string; items: Array<{ id: string }> };

    // The day view shows a pending run before anything persists.
    const day = await reception.query(api.domain.query, operation("checklists.day", { branchId: "branch-a" })) as { runs: Array<{ id?: string; progress: { total: number } }> };
    expect(day.runs).toHaveLength(1);
    expect(day.runs[0]!.id).toBeUndefined();
    expect(day.runs[0]!.progress.total).toBe(3);

    const first = await reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[0]!.id, status: "completed" })) as { id: string; items: Array<{ status: string; actorName?: string; at?: string }> };
    expect(first.id).toBeTruthy();
    expect(first.items[0]).toMatchObject({ status: "completed", actorName: "Reception Check" });
    expect(first.items[0]!.at).toBeTruthy();

    const second = await reception.mutation(api.domain.mutate, operation("checklists.run.ensure", { templateId: template.id })) as { id: string };
    expect(second.id).toBe(first.id);
    const runs = await t.run(async (ctx) => await ctx.db.query("checklistRuns").collect());
    expect(runs).toHaveLength(1);

    // A different local date opens a separate run — one per date.
    const tomorrow = await reception.mutation(api.domain.mutate, operation("checklists.run.ensure", { templateId: template.id, date: "2030-01-01" })) as { id: string };
    expect(tomorrow.id).not.toBe(first.id);
    expect(await t.run(async (ctx) => (await ctx.db.query("checklistRuns").collect()).length)).toBe(2);
  });

  it("requires reasons for failed or skipped required items and for corrections, and audits them", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-check" });
    const reception = t.withIdentity({ subject: "clerk-reception-check" });
    const template = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)) as { id: string; items: Array<{ id: string }> };

    await expectCode(reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[1]!.id, status: "failed" })), "VALIDATION_ERROR");
    const failed = await reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[1]!.id, status: "failed", reason: "Shower drain is blocked." })) as { items: Array<{ status: string }>; progress: { failedRequired: number } };
    expect(failed.progress.failedRequired).toBe(1);

    // Optional items may be skipped without a reason.
    await reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[2]!.id, status: "skipped" }));

    // Changing a recorded result is a reasoned correction.
    await expectCode(reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[1]!.id, status: "completed" })), "VALIDATION_ERROR");
    const corrected = await reception.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[1]!.id, status: "completed", reason: "Drain cleared and rechecked." })) as { items: Array<{ status: string }> };
    expect(corrected.items.filter((item) => item.status === "completed")).toHaveLength(1);

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.entityType === "checklist_run").map((event) => event.action));
    expect(audits).toEqual(expect.arrayContaining(["checklists.item.fail", "checklists.item.correct"]));
  });

  it("escalates a failed item into a real facility task through the existing operations contract", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-check" });
    const template = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)) as { id: string; items: Array<{ id: string }> };
    await owner.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[1]!.id, status: "failed", reason: "Mirror cracked." }));

    const escalated = await owner.mutation(api.domain.mutate, operation("checklists.item.create_task", { templateId: template.id, itemId: template.items[1]!.id })) as { items: Array<{ facilityTaskId?: string }> };
    const linked = escalated.items.find((item) => item.facilityTaskId);
    expect(linked?.facilityTaskId).toBeTruthy();
    const task = await t.run(async (ctx) => (await ctx.db.query("facilityTasks").collect())[0]);
    expect(task).toMatchObject({ kind: "incident", severity: "high", status: "open" });

    await expectCode(owner.mutation(api.domain.mutate, operation("checklists.item.create_task", { templateId: template.id, itemId: template.items[1]!.id })), "CONFLICT");
  });

  it("enforces branch scope and rejects customer access", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-check" });
    const template = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", TEMPLATE_INPUT)) as { id: string; items: Array<{ id: string }> };

    const managerB = t.withIdentity({ subject: "clerk-manager-b-check" });
    await expectCode(managerB.query(api.domain.query, operation("checklists.day", { branchId: "branch-a" })), "FORBIDDEN");
    await expectCode(managerB.mutation(api.domain.mutate, operation("checklists.item.set", { templateId: template.id, itemId: template.items[0]!.id, status: "completed" })), "FORBIDDEN");
    await expectCode(managerB.mutation(api.domain.mutate, operation("checklists.template.upsert", { ...TEMPLATE_INPUT, templateId: template.id })), "FORBIDDEN");

    const stranger = t.withIdentity({ subject: "clerk-total-stranger" });
    await expect(stranger.query(api.domain.query, operation("checklists.day", { branchId: "branch-a" }))).rejects.toThrow();
  });
});
