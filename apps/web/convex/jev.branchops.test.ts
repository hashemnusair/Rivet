import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, todayISODate } from "../src/lib/utils/dates";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const ORG = "ops-jev-org";
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(extra?: Extra) => ({ organizationId: ORG, correlationId: "cor-ops-jev", ...(extra ?? ({} as Extra)) });
const ask = (question: string, subject: Record<string, unknown>) => scoped({ questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-ops-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const offered = (result: JevJudgeResult): string[] => (result.status === "ready" && result.judgment.kind === "choice" ? Object.keys(result.judgment.probabilities) : []);
const choice = (result: JevJudgeResult): string | undefined => (result.status === "ready" && result.judgment.kind === "choice" ? result.judgment.choice : undefined);

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Ops Gym", slug: "ops-gym", status: "active", subscriptionPlan: "Growth", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "ops-branch-a", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "ops-branch-b", name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("zones", { organizationId: organization, branchId: branchA, publicId: "ops-zone-floor", code: "FLOOR", name: "Main floor", kind: "floor", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("zones", { organizationId: organization, branchId: branchA, publicId: "ops-zone-changing", code: "CHG", name: "Changing rooms", kind: "locker_room", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("zones", { organizationId: organization, branchId: branchB, publicId: "ops-zone-b-floor", code: "FLOOR", name: "Main floor", kind: "floor", status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string) => ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const owner = await user("ops-owner");
    const receptionA = await user("ops-reception-a");
    const managerB = await user("ops-manager-b");
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionA, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: managerB, role: "manager", branchIds: [branchB], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings" } });
    const note = (recipient: typeof owner, publicId: string, kind: string, title: string, body: string, href: string, dedupeKey: string, offsetMinutes: number) => ctx.db.insert("operationalNotifications", { publicId, recipientUserId: recipient, organizationId: organization, branchId: branchA, kind, title, body, href, dedupeKey, createdAt: now - offsetMinutes * 60_000 });
    await note(owner, "NOT-ops-1", "pt_booking", "New PT booking", "Rania Odeh · tomorrow 07:00", "/pt?booking=bk-1", "pt-booking:bk-1", 60);
    await note(owner, "NOT-ops-2", "pt_booking_rescheduled", "PT booking rescheduled", "tomorrow 09:00", "/pt?booking=bk-1", "pt-reschedule:bk-1:1", 30);
    await note(owner, "NOT-ops-3", "staff_note", "Schedule note for Rania Odeh", "Rania Odeh · PT booking moved by the member", "/pt", "staff-note:1", 10);
    await note(receptionA, "NOT-ops-4", "support_reply", "RIVET replied", "Scanner", "/support?case=SUP-1", "support-reply:SUP-1", 5);
  });
}

type AssetResult = { id: string };
type IssueResult = { id: string; severity: string; safetyStatus: string; status: string };

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const owner = t.withIdentity({ subject: "clerk-ops-owner" });
  const reception = t.withIdentity({ subject: "clerk-ops-reception-a" });
  const managerB = t.withIdentity({ subject: "clerk-ops-manager-b" });
  await owner.mutation(api.jev.updateTenantPreference, scoped({ enabled: true }));
  const treadA = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "ops-branch-a", zoneId: "ops-zone-floor", code: "TREAD-01", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity" })) as AssetResult;
  const treadA2 = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "ops-branch-a", zoneId: "ops-zone-floor", code: "TREAD-02", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity" })) as AssetResult;
  const treadB = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "ops-branch-b", zoneId: "ops-zone-b-floor", code: "TREAD-01", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity" })) as AssetResult;
  const earlier = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "ops-branch-a", assetId: treadA.id, title: "Belt slipping", description: "Belt slipped under load during the evening peak; deck tensioned.", severity: "medium", safetyStatus: "safe_to_operate" })) as IssueResult;
  await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.update", { id: earlier.id, status: "resolved", safetyStatus: "safe_to_operate" }));
  const display = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "ops-branch-a", assetId: treadA.id, title: "Display flickers under load", description: "Console display flickers and resets at high speed.", severity: "low", safetyStatus: "safe_to_operate" })) as IssueResult;
  const current = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "ops-branch-a", assetId: treadA.id, title: "Belt slipping under load", description: "Belt slips above speed 10 with a grinding noise from the deck.", severity: "critical", safetyStatus: "out_of_service" })) as IssueResult;
  const otherMachine = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "ops-branch-a", assetId: treadA2.id, title: "Belt slipping under load", description: "Same wording, the second treadmill.", severity: "medium", safetyStatus: "unknown" })) as IssueResult;
  const otherBranch = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "ops-branch-b", assetId: treadB.id, title: "Belt slipping under load", description: "Same-named machine at Sweifieh.", severity: "medium", safetyStatus: "unknown" })) as IssueResult;
  return { t, owner, reception, managerB, treadA, treadA2, treadB, earlier, display, current, otherMachine, otherBranch };
}

afterEach(() => vi.unstubAllEnvs());

describe("branch-operations questions on the server", () => {
  it("offers only the selected branch's machines and spaces and reads the description into an existing kind", async () => {
    const { owner, reception, managerB, treadA, treadA2, treadB } = await harness();
    const description = "TREAD-01 belt slipping again under load, grinding noise at speed 10";
    const target = await owner.action(api.jevInference.judge, ask("branchops.report_target", { branchId: "ops-branch-a", description })) as JevJudgeResult;
    expect(target).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: `asset:${treadA.id}` } });
    expect(offered(target)).toEqual(expect.arrayContaining([`asset:${treadA.id}`, `asset:${treadA2.id}`, "zone:ops-zone-floor", "zone:ops-zone-changing", "none"]));
    // The same-named TREAD-01 at Sweifieh is a different machine and is never offered for Abdoun.
    expect(offered(target)).not.toContain(`asset:${treadB.id}`);
    const category = await owner.action(api.jevInference.judge, ask("branchops.report_category", { branchId: "ops-branch-a", description })) as JevJudgeResult;
    expect(choice(category)).toBe("equipment_issue");
    expect(choice(await reception.action(api.jevInference.judge, ask("branchops.report_category", { branchId: "ops-branch-a", description: "Changing room floor is sticky and the bins are overflowing" })) as JevJudgeResult)).toBe("cleaning");
    // A Sweifieh-only manager cannot describe against Abdoun; a short description is refused before anything is read.
    await expectCode(managerB.action(api.jevInference.judge, { ...ask("branchops.report_target", { branchId: "ops-branch-a", description }), activeBranchId: "ops-branch-b" }), "FORBIDDEN");
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.report_target", { branchId: "ops-branch-a", description: "broken" })), "VALIDATION_ERROR");
  });

  it("compares reports on the same machine only, tells recurring from separate, and leaves severity and safety alone", async () => {
    const { owner, current, earlier, display, otherMachine, otherBranch } = await harness();
    const same = await owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: earlier.id })) as JevJudgeResult;
    expect(choice(same)).toBe("same_fault");
    const separate = await owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: display.id })) as JevJudgeResult;
    expect(choice(separate)).toBe("similar_but_separate");
    // Same wording on another machine, or the same-named machine at another branch, is not comparable.
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: otherMachine.id })), "VALIDATION_ERROR");
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: otherBranch.id })), "VALIDATION_ERROR");
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: "issue-missing" })), "NOT_FOUND");
    const issues = await owner.query(api.domain.query, operation("operations.equipment_issues.list", { branchId: "ops-branch-a" })) as IssueResult[];
    expect(issues.find((issue) => issue.id === current.id)).toMatchObject({ severity: "critical", safetyStatus: "out_of_service", status: "open" });
    expect(await owner.action(api.jevInference.judge, ask("branchops.same_fault", { issueId: current.id, otherIssueId: earlier.id }))).toMatchObject({ status: "ready", source: "cache" });
  });

  it("relates two unresolved checklist items on one branch and refuses resolved ones", async () => {
    const { owner, reception } = await harness();
    const today = todayISODate("Asia/Amman");
    const opening = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { branchId: "ops-branch-a", type: "opening", name: "Opening walkthrough", dueTime: "07:30", assignedRole: "receptionist", items: [{ label: "Check changing rooms are clean", required: true, zoneId: "ops-zone-changing" }, { label: "Test the entry scanner", required: true }] })) as { id: string; items: Array<{ id: string }> };
    const closing = await owner.mutation(api.domain.mutate, operation("checklists.template.upsert", { branchId: "ops-branch-a", type: "closing", name: "Closing walkthrough", dueTime: "23:30", assignedRole: "receptionist", items: [{ label: "Mop changing room floors", required: true, zoneId: "ops-zone-changing" }] })) as { id: string; items: Array<{ id: string }> };
    const yesterday = addDays(today, -1);
    await reception.mutation(api.domain.mutate, { ...operation("checklists.item.set", { templateId: opening.id, date: yesterday, itemId: opening.items[0]!.id, status: "failed", reason: "Shower drain blocked, water on the floor" }), activeBranchId: "ops-branch-a" });
    await reception.mutation(api.domain.mutate, { ...operation("checklists.item.set", { templateId: closing.id, date: yesterday, itemId: closing.items[0]!.id, status: "failed", reason: "Drain still blocked, floor floods after mopping" }), activeBranchId: "ops-branch-a" });
    await reception.mutation(api.domain.mutate, { ...operation("checklists.item.set", { templateId: opening.id, date: yesterday, itemId: opening.items[1]!.id, status: "completed" }), activeBranchId: "ops-branch-a" });
    const pair = { firstTemplateId: opening.id, firstDate: yesterday, firstItemId: opening.items[0]!.id, secondTemplateId: closing.id, secondDate: yesterday, secondItemId: closing.items[0]!.id };
    const related = await reception.action(api.jevInference.judge, { ...ask("branchops.handover_related", pair), activeBranchId: "ops-branch-a" }) as JevJudgeResult;
    expect(choice(related)).toBe("same_problem");
    // A pending required item of today's run, not yet persisted, is still an obligation and can be related from the template.
    const pendingToday = await owner.action(api.jevInference.judge, ask("branchops.handover_related", { ...pair, secondTemplateId: opening.id, secondDate: today, secondItemId: opening.items[1]!.id })) as JevJudgeResult;
    expect(pendingToday.status).toBe("ready");
    // A completed item is not unresolved work and cannot be related.
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.handover_related", { ...pair, secondTemplateId: opening.id, secondDate: yesterday, secondItemId: opening.items[1]!.id })), "VALIDATION_ERROR");
    await expectCode(owner.action(api.jevInference.judge, ask("branchops.handover_related", { ...pair, secondTemplateId: "missing" })), "NOT_FOUND");
  });

  it("places only the caller's own notifications, and never reads anything for them", async () => {
    const { t, owner, reception } = await harness();
    const placed = await owner.action(api.jevInference.judge, ask("branchops.notification_topic", { notificationId: "NOT-ops-3" })) as JevJudgeResult;
    expect(placed).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "entity:booking:bk-1" } });
    expect(offered(placed)).toEqual(["entity:booking:bk-1", "none"]);
    // Another user's notification is unknown to the caller; the receptionist has no group to place into.
    await expectCode(reception.action(api.jevInference.judge, { ...ask("branchops.notification_topic", { notificationId: "NOT-ops-3" }), activeBranchId: "ops-branch-a" }), "NOT_FOUND");
    await expectCode(reception.action(api.jevInference.judge, { ...ask("branchops.notification_topic", { notificationId: "NOT-ops-4" }), activeBranchId: "ops-branch-a" }), "VALIDATION_ERROR");
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("operationalNotifications").collect();
      expect(rows.every((row) => row.readAt === undefined)).toBe(true);
      expect(rows.length).toBe(4);
    });
  });
});
