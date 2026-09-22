import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import type { OperatingBrief } from "./operatingBrief";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(org: string, extra?: Extra) => ({ organizationId: org, correlationId: "cor-brief", ...(extra ?? ({} as Extra)) });
const ask = (org: string, question: string, subject: Record<string, unknown>) => scoped(org, { questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-brief-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const figures = (brief: OperatingBrief, key: string) => Object.fromEntries((brief.sections.find((section) => section.key === key)?.figures ?? []).map((figure) => [figure.key, figure.value.kind === "count" ? figure.value.value : figure.value.money.amount]));
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * 3_600_000).toISOString();

async function seed(t: TestConvex<typeof schema>, org: string, plan: "Starter" | "Growth") {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: org, name: "Brief Gym", slug: org, status: "active", subscriptionPlan: plan, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: `${org}-branch-a`, name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: `${org}-branch-b`, name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("zones", { organizationId: organization, branchId: branchA, publicId: `${org}-zone-floor`, code: "FLOOR", name: "Main floor", kind: "floor", status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string) => ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const owner = await user(`${org}-owner`);
    const managerB = await user(`${org}-manager-b`);
    const reception = await user(`${org}-reception`);
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: managerB, role: "manager", branchIds: [branchB], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const record = async (entityType: string, publicId: string, branch: typeof branchA, value: Record<string, unknown>, keys: { memberPublicId?: string } = {}) =>
      ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: org, ...value }, ...keys });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", operationalPolicies: {} } });
    await record("plan", `${org}-plan`, branchA, { name: "Monthly", status: "active" });
    const member = async (publicId: string, branch: typeof branchA, branchPublicId: string, fullName: string) => record("member", publicId, branch, { memberNumber: publicId, fullName, phone: "+962790000000", homeBranchId: branchPublicId, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: false, createdAt: new Date(now - 90 * 86_400_000).toISOString() }, { memberPublicId: publicId });
    await member(`${org}-member-a`, branchA, `${org}-branch-a`, "Aya Abdoun");
    await member(`${org}-member-b`, branchB, `${org}-branch-b`, "Omar Sweifieh");
    const charge = async (publicId: string, branch: typeof branchA, memberId: string, amount: number) => record("charge", publicId, branch, { memberId, description: "Membership balance", total: { amount, currency: "JOD" }, paidAmount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount, currency: "JOD" }, status: "unpaid", issueDate: day(-10), dueDate: day(-5), createdAt: new Date(now).toISOString() }, { memberPublicId: memberId });
    await charge(`${org}-charge-a`, branchA, `${org}-member-a`, 45_000);
    await charge(`${org}-charge-b`, branchB, `${org}-member-b`, 120_000);
    // A term at Sweifieh that lapsed ten days ago and was never renewed; a live term at Abdoun ending in three days.
    await record("membership", `${org}-ms-b`, branchB, { memberId: `${org}-member-b`, planId: `${org}-plan`, homeBranchId: `${org}-branch-b`, startDate: day(-40), endDate: day(-10), salePrice: { amount: 40_000, currency: "JOD" }, frozenDaysUsed: 0 }, { memberPublicId: `${org}-member-b` });
    await record("membership", `${org}-ms-a`, branchA, { memberId: `${org}-member-a`, planId: `${org}-plan`, homeBranchId: `${org}-branch-a`, startDate: day(-27), endDate: day(3), salePrice: { amount: 40_000, currency: "JOD" }, frozenDaysUsed: 0 }, { memberPublicId: `${org}-member-a` });
    // A follow-up nine days overdue at Abdoun (stale) and one due today at Sweifieh.
    await record("task", `${org}-task-a`, branchA, { type: "follow_up", title: "Call Aya about the balance", ownerId: `${org}-owner`, ownerName: "Owner", dueAt: iso(-9 * 24), priority: "normal", status: "open", memberId: `${org}-member-a`, subjectName: "Aya Abdoun", createdById: `${org}-owner`, createdAt: new Date(now).toISOString() }, { memberPublicId: `${org}-member-a` });
    await record("task", `${org}-task-b`, branchB, { type: "follow_up", title: "Call Omar about the lapsed term", ownerId: `${org}-manager-b`, ownerName: "Manager", dueAt: iso(-1), priority: "normal", status: "open", memberId: `${org}-member-b`, subjectName: "Omar Sweifieh", createdById: `${org}-manager-b`, createdAt: new Date(now).toISOString() }, { memberPublicId: `${org}-member-b` });
    // A blocked entry at Abdoun this morning: mandatory for the owner, invisible to the Sweifieh manager.
    await record("checkIn", `${org}-checkin-a`, branchA, { memberId: `${org}-member-a`, memberName: "Aya Abdoun", branchId: `${org}-branch-a`, branchName: "Abdoun", decision: "blocked", reasonCodes: ["OUTSTANDING_BALANCE"], occurredAt: iso(-0.5) }, { memberPublicId: `${org}-member-a` });
    await record("supportCase", `${org}-SUP-1`, branchA, { subject: "Scanner keeps rejecting cards", body: "The Abdoun scanner rejects valid cards since Monday.", priority: "urgent", status: "open", creatorId: `${org}-owner`, creatorName: "Owner", branchId: `${org}-branch-a`, createdAt: new Date(now - 3_600_000).toISOString(), updatedAt: new Date(now - 3_600_000).toISOString() });
  });
}

type AssetResult = { id: string };
type IssueResult = { id: string; safetyStatus: string; status: string };

async function harness(plan: "Starter" | "Growth" = "Growth") {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const org = plan === "Growth" ? "brief-org" : "brief-starter";
  const t = convexTest(schema, modules);
  await seed(t, org, plan);
  const owner = t.withIdentity({ subject: `clerk-${org}-owner` });
  const managerB = t.withIdentity({ subject: `clerk-${org}-manager-b` });
  const reception = t.withIdentity({ subject: `clerk-${org}-reception` });
  await owner.mutation(api.jev.updateTenantPreference, scoped(org, { enabled: true }));
  const brief = (actor: typeof owner, input: Record<string, unknown> = {}) => actor.query(api.domain.query, { ...operation("dashboard.brief", input), organizationId: org }) as Promise<OperatingBrief>;
  return { t, org, owner, managerB, reception, brief };
}

afterEach(() => vi.unstubAllEnvs());

describe("the operating brief on the server", () => {
  it("gives the owner both branches with exact figures and the restricted manager only their own branch, never the owner's view", async () => {
    const { org, owner, managerB, brief } = await harness();
    const ownerBrief = await brief(owner);
    expect(ownerBrief.scope).toMatchObject({ branchScope: "all", role: "owner", userId: `${org}-owner` });
    expect(ownerBrief.scope.branches.map((branch) => branch.name)).toEqual(["Abdoun", "Sweifieh"]);
    expect(figures(ownerBrief, "collections")).toEqual({ outstanding: 165_000, members: 2, largest: 120_000 });
    expect(figures(ownerBrief, "renewals")).toEqual({ ending: 1, today: 0, expired: 1 });
    expect(figures(ownerBrief, "followups")).toMatchObject({ overdue: 2, stale: 1 });
    expect(figures(ownerBrief, "controls")).toMatchObject({ entry: 1 });
    expect(figures(ownerBrief, "support")).toEqual({ open: 1, urgent: 1 });
    expect(ownerBrief.mandatory.map((item) => item.id)).toEqual(expect.arrayContaining([`access:${org}-member-a`, `support:${org}-SUP-1`]));
    expect(ownerBrief.queue.find((item) => item.id === `task:${org}-task-a`)).toMatchObject({ overdueDays: 9, stale: true, action: { kind: "complete_task", label: "Done" } });
    expect(ownerBrief.queue.find((item) => item.id === `expired:${org}-ms-b`)).toMatchObject({ kind: "renewal", title: "Win back Omar Sweifieh", href: `/members/${org}-member-b?action=renew`, branchName: "Sweifieh" });
    expect(ownerBrief.coverage).toBe("complete");
    expect(ownerBrief.sources.map((source) => [source.key, source.status])).toEqual([["queue", "ok"], ["expired", "ok"], ["equipment", "empty"], ["stock", "empty"], ["support", "ok"]]);

    const managerBrief = await brief(managerB);
    expect(managerBrief.scope).toMatchObject({ branchScope: "selected", role: "manager", userId: `${org}-manager-b` });
    expect(managerBrief.scope.branchId).toBeUndefined();
    expect(managerBrief.scope.branches.map((branch) => branch.name)).toEqual(["Sweifieh"]);
    expect(figures(managerBrief, "collections")).toEqual({ outstanding: 120_000, members: 1, largest: 120_000 });
    expect(figures(managerBrief, "renewals")).toEqual({ ending: 0, today: 0, expired: 1 });
    expect(figures(managerBrief, "controls")).toMatchObject({ entry: 0 });
    expect(managerBrief.mandatory.map((item) => item.id)).not.toContain(`access:${org}-member-a`);
    expect(managerBrief.queue.every((item) => !item.branchName || item.branchName === "Sweifieh")).toBe(true);
    expect(managerBrief.queue.some((item) => item.id === `task:${org}-task-a` || item.id === `balance:${org}-member-a`)).toBe(false);
    // The manager cannot widen the scope by asking for the other branch.
    await expectCode(brief(managerB, { branchId: `${org}-branch-a` }), "FORBIDDEN");
    // Another tenant's owner is not part of this organization at all: the organization is not found for them.
    const stranger = (await harness("Starter")).owner;
    await expectCode(stranger.query(api.domain.query, { ...operation("dashboard.brief"), organizationId: org }), "NOT_FOUND");
  });

  it("answers the emphasis question from each caller's own figures, so the manager never receives the owner's cached judgment", async () => {
    const { org, owner, managerB, brief } = await harness();
    const ownerAnswer = await owner.action(api.jevInference.judge, ask(org, "brief.emphasis", {})) as JevJudgeResult;
    expect(ownerAnswer).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "safety_first" } });
    // The Sweifieh manager's own brief still has a mandatory item (the lapsed member reads as urgent by the existing retention rule),
    // but its figures, its offered emphases and therefore its state hash are their own: the owner's cached answer is never reused.
    const managerAnswer = await managerB.action(api.jevInference.judge, ask(org, "brief.emphasis", {})) as JevJudgeResult;
    expect(managerAnswer).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice" } });
    expect(managerAnswer.status === "ready" && ownerAnswer.status === "ready" && managerAnswer.stateHash !== ownerAnswer.stateHash).toBe(true);
    const offered = managerAnswer.status === "ready" && managerAnswer.judgment.kind === "choice" ? Object.keys(managerAnswer.judgment.probabilities) : [];
    const managerBrief = await brief(managerB);
    expect([...offered].sort()).toEqual([...managerBrief.applicableEmphases].sort());
    expect(offered).not.toContain("support");
    const ownerOffered = ownerAnswer.status === "ready" && ownerAnswer.judgment.kind === "choice" ? Object.keys(ownerAnswer.judgment.probabilities) : [];
    expect(ownerOffered).toContain("support");
    expect(managerAnswer.status === "ready" && managerAnswer.judgment.kind === "choice" && offered.includes(managerAnswer.judgment.choice)).toBe(true);
    const again = await owner.action(api.jevInference.judge, ask(org, "brief.emphasis", {})) as JevJudgeResult;
    expect(again).toMatchObject({ status: "ready", source: "cache" });
  });

  it("relates two similarly worded operational items only inside the caller's scope, reads conflicting descriptions as unclear, and changes no safety status", async () => {
    const { org, owner, managerB, brief } = await harness();
    const asset = await owner.mutation(api.domain.mutate, { ...operation("operations.equipment_asset.upsert", { branchId: `${org}-branch-a`, zoneId: `${org}-zone-floor`, code: "TREAD-01", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity" }), organizationId: org }) as AssetResult;
    const issue = await owner.mutation(api.domain.mutate, { ...operation("operations.equipment_issue.report", { branchId: `${org}-branch-a`, assetId: asset.id, title: "Belt slipping under load", description: "TREAD-01 belt slips above speed 10 with a grinding noise; out of service.", severity: "high", safetyStatus: "out_of_service" }), organizationId: org }) as IssueResult;
    await owner.mutation(api.domain.mutate, { ...operation("operations.facility_task.upsert", { branchId: `${org}-branch-a`, zoneId: `${org}-zone-floor`, kind: "inspection", severity: "medium", title: "TREAD-01 belt fixed", notes: "Belt tensioned this morning; treadmill safe to use again." }), organizationId: org });

    const ownerBrief = await brief(owner);
    const machine = ownerBrief.queue.find((item) => item.id === `equipment:${issue.id}`);
    expect(machine).toMatchObject({ kind: "equipment_issue", mandatory: true, safetyStatus: "out_of_service", detail: expect.stringContaining("TREAD-01") });
    const task = ownerBrief.queue.find((item) => item.kind === "facility_task" && item.title === "TREAD-01 belt fixed");
    expect(task).toBeDefined();
    expect(ownerBrief.related).toEqual([{ firstId: expect.any(String), secondId: expect.any(String), sharedTokens: expect.any(Number) }]);
    const pair = ownerBrief.related[0]!;
    expect([pair.firstId, pair.secondId].sort()).toEqual([machine!.id, task!.id].sort());

    const answer = await owner.action(api.jevInference.judge, ask(org, "brief.related_matter", { firstId: machine!.id, secondId: task!.id })) as JevJudgeResult;
    expect(answer).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "unclear" } });
    const issues = await owner.query(api.domain.query, { ...operation("operations.equipment_issues.list", { branchId: `${org}-branch-a` }), organizationId: org }) as IssueResult[];
    expect(issues.find((candidate) => candidate.id === issue.id)).toMatchObject({ safetyStatus: "out_of_service", status: "open" });
    // Both items remain in the brief whatever the answer.
    const after = await brief(owner);
    expect(after.queue.map((item) => item.id)).toEqual(expect.arrayContaining([machine!.id, task!.id]));

    // The Sweifieh manager's brief holds neither Abdoun item, so the pair is not found for them.
    await expectCode(managerB.action(api.jevInference.judge, ask(org, "brief.related_matter", { firstId: machine!.id, secondId: task!.id })), "NOT_FOUND");
    await expectCode(owner.action(api.jevInference.judge, ask(org, "brief.related_matter", { firstId: machine!.id, secondId: machine!.id })), "VALIDATION_ERROR");
  });

  it("reports sources a plan or a role cannot supply as partial coverage and keeps the rest exact", async () => {
    const { org, owner, reception, brief } = await harness("Starter");
    const starter = await brief(owner);
    expect(starter.coverage).toBe("partial");
    expect(starter.sources.map((source) => [source.key, source.status])).toEqual([["queue", "ok"], ["expired", "ok"], ["equipment", "not_enabled"], ["stock", "not_enabled"], ["support", "ok"]]);
    expect(starter.sources.find((source) => source.key === "equipment")?.message).toContain("operations module is off");
    expect(figures(starter, "collections")).toEqual({ outstanding: 165_000, members: 2, largest: 120_000 });
    const desk = await brief(reception);
    expect(desk.scope).toMatchObject({ branchScope: "selected", role: "receptionist", userId: `${org}-reception` });
    // The lapsed term is at Sweifieh, outside the desk's branch, so its source reads as empty for them.
    expect(desk.sources.map((source) => [source.key, source.status])).toEqual([["queue", "ok"], ["expired", "empty"], ["equipment", "no_permission"], ["stock", "no_permission"], ["support", "no_permission"]]);
    expect(desk.coverage).toBe("partial");
    expect(desk.queue.some((item) => item.kind === "support_case")).toBe(false);
    expect(desk.queue.every((item) => !item.branchName || item.branchName === "Abdoun")).toBe(true);
  });
});
