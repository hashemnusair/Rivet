import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "org-a", name: "Gym A", slug: "gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: "org-b", name: "Gym B", slug: "gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "branch-a", name: "Gym A Main", code: "A", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "branch-b", name: "Gym B Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, subject: string, platformAdmin = false) => await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await user("owner-a", "clerk-owner-a");
    const receptionA = await user("reception-a", "clerk-reception-a");
    const receptionA2 = await user("reception-a-2", "clerk-reception-a-2");
    const ownerB = await user("owner-b", "clerk-owner-b");
    await user("platform", "clerk-platform", true);
    const membership = async (organizationId: typeof orgA, userId: typeof ownerA, role: "owner" | "receptionist", branchId: typeof branchA) => await ctx.db.insert("organizationMemberships", { organizationId, userId, role, branchIds: [branchId], active: true, branchScope: role === "owner" ? "all" : "selected", createdAt: now, updatedAt: now });
    await membership(orgA, ownerA, "owner", branchA);
    await membership(orgA, receptionA, "receptionist", branchA);
    await membership(orgA, receptionA2, "receptionist", branchA);
    await membership(orgB, ownerB, "owner", branchB);
  });
}

type SupportCaseResult = { id: string; creatorId: string; status: string; assigneeId?: string; resolutionSummary?: string; messages: Array<{ authorType: string; body: string }> };
type NotificationResult = { id: string; kind: string; readAt?: string; href: string };

describe("exported Convex support workflow", () => {
  it("scopes cases to creators while owners can supervise their whole gym", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const receptionist = t.withIdentity({ subject: "clerk-reception-a" });
    const otherReceptionist = t.withIdentity({ subject: "clerk-reception-a-2" });
    const ownerA = t.withIdentity({ subject: "clerk-owner-a" });
    const ownerB = t.withIdentity({ subject: "clerk-owner-b" });
    const created = await receptionist.mutation(api.domain.mutate, operation("support.create", { branchId: "branch-a", email: "desk@gym-a.example", subject: "Scanner unavailable", body: "The reception scanner is not detected.", priority: "urgent" })) as SupportCaseResult;
    expect(created).toMatchObject({ creatorId: "reception-a", status: "open", messages: [{ authorType: "gym", body: "The reception scanner is not detected." }] });

    expect((await receptionist.query(api.domain.query, operation("support.list")) as SupportCaseResult[]).map((item) => item.id)).toEqual([created.id]);
    expect(await otherReceptionist.query(api.domain.query, operation("support.list"))).toEqual([]);
    expect((await ownerA.query(api.domain.query, operation("support.list")) as SupportCaseResult[]).map((item) => item.id)).toEqual([created.id]);
    expect(await ownerB.query(api.domain.query, operation("support.list"))).toEqual([]);
  });

  it("persists append-only platform replies, assignment, resolution, and reopen history", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const created = await owner.mutation(api.domain.mutate, operation("support.create", { email: "owner@gym-a.example", subject: "Import review", body: "Please review our import error.", priority: "normal" })) as SupportCaseResult;

    const assigned = await platform.mutation(api.domain.mutate, operation("platform.support.assign", { caseId: created.id, assigneeId: "platform" })) as SupportCaseResult;
    expect(assigned.assigneeId).toBe("platform");
    const replied = await platform.mutation(api.domain.mutate, operation("platform.support.reply", { caseId: created.id, body: "We are reviewing the rejected rows." })) as SupportCaseResult;
    expect(replied).toMatchObject({ status: "waiting", messages: [{ authorType: "gym" }, { authorType: "platform", body: "We are reviewing the rejected rows." }] });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.support.resolve", { caseId: created.id, resolutionSummary: "" })), "VALIDATION_ERROR");
    const resolved = await platform.mutation(api.domain.mutate, operation("platform.support.resolve", { caseId: created.id, resolutionSummary: "Corrected the CSV column mapping." })) as SupportCaseResult;
    expect(resolved).toMatchObject({ status: "resolved", resolutionSummary: "Corrected the CSV column mapping." });
    const reopened = await platform.mutation(api.domain.mutate, operation("platform.support.reopen", { caseId: created.id })) as SupportCaseResult;
    expect(reopened).toMatchObject({ status: "open" });
    expect(reopened.resolutionSummary).toBeUndefined();

    const platformNotifications = await platform.query(api.domain.query, operation("notifications.list")) as NotificationResult[];
    expect(platformNotifications).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "support_case_created", href: `/platform/support?case=${created.id}` }), expect.objectContaining({ kind: "support_assignment" })]));
    const ownerNotifications = await owner.query(api.domain.query, operation("notifications.list")) as NotificationResult[];
    expect(ownerNotifications).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "support_reply", href: `/support?case=${created.id}` }), expect.objectContaining({ kind: "support_resolved" })]));
    const unread = ownerNotifications.find((notification) => !notification.readAt)!;
    const marked = await owner.mutation(api.domain.mutate, operation("notifications.read", { notificationId: unread.id, read: true })) as NotificationResult;
    expect(marked.readAt).toEqual(expect.any(String));
    await expectCode(t.withIdentity({ subject: "clerk-owner-b" }).mutation(api.domain.mutate, operation("notifications.read", { notificationId: unread.id, read: false })), "NOT_FOUND");

    const persisted = await t.run(async (ctx) => ({
      messages: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "supportMessage")).collect(),
      emails: (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "operationalEmailDelivery")).collect()).map((record) => record.data),
      audit: (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.entityPublicId === created.id),
    }));
    expect(persisted.messages).toHaveLength(2);
    expect(persisted.emails.map((email) => email.kind)).toEqual(["support_acknowledgement", "support_reply", "support_resolved"]);
    expect(persisted.emails.every((email) => email.status === "suppressed")).toBe(true);
    expect(persisted.audit.map((event) => event.action)).toEqual(["support.assign", "support.reply", "support.resolve", "support.reopen"]);
  });
});
