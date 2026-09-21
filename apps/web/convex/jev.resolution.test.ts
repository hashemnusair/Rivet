import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import type { MemberResolutionContext } from "./resolutionAssist";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const ORG = "res-org";
const BRANCH = "res-branch";
const OTHER_BRANCH = "res-branch-b";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const date = (days: number) => inDays(days).slice(0, 10);
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, activeBranchId: BRANCH, correlationId: `cor-res-${organizationId}`, ...(extra ?? ({} as Extra)) });
const ask = (question: string, subject: Record<string, unknown>) => scoped(ORG, { questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, activeBranchId: BRANCH, correlationId: `cor-res-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const offered = (result: JevJudgeResult): string[] => (result.status === "ready" && result.judgment.kind === "choice" ? Object.keys(result.judgment.probabilities) : []);
const choice = (result: JevJudgeResult): string | undefined => (result.status === "ready" && result.judgment.kind === "choice" ? result.judgment.choice : undefined);
const money = (amount: number) => ({ amount, currency: "JOD" });

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Resolution Gym", slug: "res-gym", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: BRANCH, name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    const other = await ctx.db.insert("branches", { organizationId: organization, publicId: OTHER_BRANCH, name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, fullName: string) => await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const member = async (userId: Awaited<ReturnType<typeof user>>, role: "owner" | "sales" | "receptionist" | "trainer", scope: "all" | "selected" = "selected") => ctx.db.insert("organizationMemberships", { organizationId: organization, userId, role, branchIds: [branch, other], branchScope: scope, active: true, createdAt: now, updatedAt: now });
    await member(await user("res-owner", "Res Owner"), "owner", "all");
    await member(await user("res-sales", "Res Sales"), "sales");
    await member(await user("res-reception", "Res Reception"), "receptionist");
    const trainerUser = await user("res-trainer-user", "Res Trainer");
    await member(trainerUser, "trainer");
    const trainerAr = await user("res-trainer-ar", "Coach Lina");
    await member(trainerAr, "trainer");
    const trainerBlank = await user("res-trainer-blank", "Ahmad Nasser");
    await member(trainerBlank, "trainer");
    const trainerOther = await user("res-trainer-other", "Coach Far");
    await member(trainerOther, "trainer");
    const insert = async (entityType: string, publicId: string, value: Record<string, unknown>, keys: { memberPublicId?: string; leadPublicId?: string } = {}) => ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, ...value }, ...keys });
    await insert("settings", "settings", { operationalPolicies: {} });
    await insert("plan", "plan-basic", { organizationId: ORG, name: "Basic Monthly", code: "BM", kind: "time", durationDays: 30, basePrice: money(40_000), branchAccess: "selected", branchIds: [BRANCH], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" });
    await insert("plan", "plan-flex", { organizationId: ORG, name: "Flex Monthly", code: "FM", kind: "time", durationDays: 30, basePrice: money(55_000), branchAccess: "all", branchIds: [], freezeAllowanceDays: 14, includedPtSessions: 2, status: "active" });
    await insert("member", "res-member", { organizationId: ORG, memberNumber: "ABD-1", fullName: "Rania Odeh", phone: "+962790001000", gender: "female", homeBranchId: BRANCH, status: "active", tags: [], preferredLanguage: "ar", marketingOptIn: true, createdAt: new Date(now).toISOString() });
    await insert("membership", "res-term", { organizationId: ORG, memberId: "res-member", planId: "plan-basic", homeBranchId: BRANCH, startDate: date(-20), endDate: date(20), salePrice: money(40_000), discount: money(0), discountApprovalStatus: "none", soldById: "res-sales", frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(now).toISOString() }, { memberPublicId: "res-member" });
    await insert("charge", "charge-membership", { organizationId: ORG, memberId: "res-member", membershipId: "res-term", description: "Basic Monthly membership", subtotal: money(40_000), discount: money(0), tax: money(0), total: money(40_000), paidAmount: money(0), outstandingAmount: money(40_000), status: "unpaid", issueDate: date(-20), dueDate: date(-20), createdAt: inDays(-20) }, { memberPublicId: "res-member" });
    await insert("charge", "charge-pt", { organizationId: ORG, memberId: "res-member", membershipId: "res-term", description: "12 PT sessions", subtotal: money(240_000), discount: money(0), tax: money(0), total: money(240_000), paidAmount: money(240_000), outstandingAmount: money(0), status: "paid", issueDate: date(-6), dueDate: date(-6), createdAt: inDays(-6) }, { memberPublicId: "res-member" });
    await insert("payment", "pay-pt", { organizationId: ORG, branchId: BRANCH, memberId: "res-member", chargeId: "charge-pt", type: "payment", amount: money(240_000), method: "card", status: "completed", receiptId: "rcpt-pt", receiptNumber: "ABD-0001", collectedById: "res-sales", collectedByName: "Res Sales", idempotencyKey: "pay-pt", occurredAt: inDays(-5) }, { memberPublicId: "res-member" });
    await insert("timeline", "ev-payment", { organizationId: ORG, memberId: "res-member", type: "payment_collected", title: "Payment collected — JOD 240.000 card", actorName: "Res Sales", occurredAt: inDays(-5), meta: { receiptId: "rcpt-pt", receiptNumber: "ABD-0001" } }, { memberPublicId: "res-member" });
    for (let index = 0; index < 8; index += 1) await insert("timeline", `ev-note-${index}`, { organizationId: ORG, memberId: "res-member", type: "note", title: "Note added", body: `Desk note ${index}`, actorName: "Res Reception", occurredAt: inDays(-4 + index * 0.4) }, { memberPublicId: "res-member" });
    await insert("task", "res-task", { organizationId: ORG, type: "follow_up", title: "Follow up — Rania Odeh about the PT package", ownerId: "res-sales", ownerName: "Res Sales", dueAt: inDays(2), priority: "normal", status: "open", memberId: "res-member", subjectName: "Rania Odeh", createdById: "res-sales", createdAt: new Date(now).toISOString() }, { memberPublicId: "res-member" });
    const ptPackage = await ctx.db.insert("ptPackages", { organizationId: organization, publicId: "pkg-12", name: "12 PT sessions", sessionCount: 12, totalPriceMinor: 240_000, currency: "JOD", validityDays: 90, branchAccess: "all", branchIds: [], status: "active", createdAt: now, updatedAt: now });
    const order = await ctx.db.insert("ptPackageOrders", { organizationId: organization, publicId: "order-pt", memberPublicId: "res-member", membershipPublicId: "res-term", packageId: ptPackage, chargePublicId: "charge-pt", packageNameSnapshot: "12 PT sessions", sessionCountSnapshot: 12, totalPriceMinorSnapshot: 240_000, currencySnapshot: "JOD", validityDaysSnapshot: 90, status: "active", paidAt: now - 5 * 86_400_000, createdAt: now - 6 * 86_400_000, updatedAt: now });
    await ctx.db.insert("ptEntitlements", { organizationId: organization, publicId: "ent-pt", memberPublicId: "res-member", source: "package", packageOrderId: order, granted: 12, reserved: 1, consumed: 2, revoked: 0, expiresAt: now + 90 * 86_400_000, status: "active", createdAt: now, updatedAt: now });
    const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const profileAr = await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "trainer-ar", userId: trainerAr, displayName: "Coach Lina", specialties: ["Strength"], languages: ["ar", "en"], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    const profileBlank = await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "trainer-blank", userId: trainerBlank, displayName: "Ahmad Nasser", specialties: [], languages: [], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "trainer-other", userId: trainerOther, displayName: "Coach Far", specialties: ["Yoga"], languages: ["en"], branchIds: [other], status: "published", createdAt: now, updatedAt: now });
    await ctx.db.insert("ptTrainerProfiles", { organizationId: organization, publicId: "trainer-nohours", userId: trainerUser, displayName: "Coach Nohours", specialties: ["Boxing"], languages: ["ar"], branchIds: [branch], status: "published", createdAt: now, updatedAt: now });
    for (const weekday of weekdays) {
      await ctx.db.insert("ptAvailabilityRules", { organizationId: organization, publicId: `rule-ar-${weekday}`, trainerProfileId: profileAr, branchId: branch, weekday, startMinute: 8 * 60, endMinute: 14 * 60, active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("ptAvailabilityRules", { organizationId: organization, publicId: `rule-blank-${weekday}`, trainerProfileId: profileBlank, branchId: branch, weekday, startMinute: 15 * 60, endMinute: 18 * 60, active: true, createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "res-member-far", branchId: other, memberPublicId: "res-member-far", createdAt: now, updatedAt: now, data: { id: "res-member-far", organizationId: ORG, memberNumber: "SWF-1", fullName: "Far Member", phone: "+962790002000", homeBranchId: OTHER_BRANCH, status: "active", tags: [], preferredLanguage: "en", createdAt: new Date(now).toISOString() } });
    const foreign = await ctx.db.insert("organizations", { publicId: "res-org-b", name: "Other Gym", slug: "res-other", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const foreignBranch = await ctx.db.insert("branches", { organizationId: foreign, publicId: "res-branch-foreign", name: "F", code: "F", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: foreign, entityType: "member", publicId: "res-member-foreign", branchId: foreignBranch, memberPublicId: "res-member-foreign", createdAt: now, updatedAt: now, data: { id: "res-member-foreign", organizationId: "res-org-b", memberNumber: "F-1", fullName: "Foreign Member", phone: "+962790003000", homeBranchId: "res-branch-foreign", status: "active", tags: [], preferredLanguage: "en", createdAt: new Date(now).toISOString() } });
  });
}

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const owner = t.withIdentity({ subject: "clerk-res-owner" });
  const sales = t.withIdentity({ subject: "clerk-res-sales" });
  const reception = t.withIdentity({ subject: "clerk-res-reception" });
  const trainer = t.withIdentity({ subject: "clerk-res-trainer-user" });
  await owner.mutation(api.jev.updateTenantPreference, scoped(ORG, { enabled: true }));
  // Two Sunday classes and one men-only Monday class at the member's branch.
  const hiit = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: BRANCH, name: "Morning HIIT", dayOfWeek: 0, startMinute: 7 * 60, durationMinutes: 60, capacity: 12, audience: "mixed" })) as { id: string };
  const ladies = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: BRANCH, name: "Ladies Strength", dayOfWeek: 0, startMinute: 18 * 60, durationMinutes: 60, capacity: 10, audience: "women" })) as { id: string };
  const men = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: BRANCH, name: "Men's Circuit", dayOfWeek: 1, startMinute: 18 * 60, durationMinutes: 60, capacity: 10, audience: "men" })) as { id: string };
  return { t, owner, sales, reception, trainer, hiit, ladies, men };
}

afterEach(() => vi.unstubAllEnvs());

describe("the member resolution context", () => {
  it("matches payments to charges by service, reads evidence from the whole record, and enforces class and trainer rules", async () => {
    const { owner, hiit, ladies, men } = await harness();
    const context = await owner.query(api.domain.query, operation("members.resolution", { memberId: "res-member" })) as MemberResolutionContext;
    expect(context.access).toMatchObject({ payments: true, tasks: true, roster: true, sell: true, collect: true });
    expect(context.panels).toContain("panel.open_work");
    expect(context.charges.map((charge) => [charge.id, charge.service, charge.outstandingAmount.amount])).toEqual(expect.arrayContaining([["charge-pt", "personal_training", 0], ["charge-membership", "membership", 40_000]]));
    expect(context.payments).toEqual([expect.objectContaining({ id: "pay-pt", service: "personal_training", chargeDescription: "12 PT sessions", receiptNumber: "ABD-0001" })]);
    expect(context.facts).toMatchObject({ outstandingMinor: 40_000, openCharges: 1, ptOrdersPaid: 1, ptCreditsAvailable: 9, ptCreditsReserved: 1, openTasks: 1, activePlans: 2 });
    expect(context.ptOrders[0]).toMatchObject({ id: "order-pt", status: "active", chargeId: "charge-pt", sessionCount: 12 });
    expect(context.membership).toMatchObject({ id: "res-term", planName: "Basic Monthly", paymentStatus: "unpaid", outstanding: { amount: 40_000 } });
    // The payment sits behind eight newer notes; the first page of the overview would not show it, the evidence does.
    expect(context.evidence.map((event) => event.id)).toContain("ev-payment");
    expect(context.evidence.find((event) => event.id === "ev-payment")).toMatchObject({ receiptId: "rcpt-pt" });
    expect(context.tasks.map((task) => task.id)).toEqual(["res-task"]);
    expect(context.plans.map((plan) => plan.id)).toEqual(["plan-basic", "plan-flex"]);
    // Only occurrences still ahead of the clock: a class that already started today is blocked for a different reason.
    const byTemplate = (template: string) => context.classes.options.filter((option) => option.id.startsWith(`occ:${template}:`) && Date.parse(option.startsAt) > Date.now());
    expect(byTemplate(hiit.id).length).toBeGreaterThan(0);
    expect(byTemplate(men.id).length).toBeGreaterThan(0);
    expect(byTemplate(hiit.id).every((option) => option.eligible)).toBe(true);
    expect(byTemplate(ladies.id).every((option) => option.eligible)).toBe(true);
    expect(byTemplate(men.id).every((option) => !option.eligible && option.blockReason?.includes("for men"))).toBe(true);
    const trainers = new Map(context.trainers.options.map((option) => [option.id, option]));
    expect(trainers.get("trainer-ar")).toMatchObject({ languages: ["ar", "en"], openSlots: expect.any(Number) });
    expect(trainers.get("trainer-ar")?.nextSlotAt).toBeDefined();
    expect(trainers.get("trainer-blank")).toMatchObject({ languages: [], specialties: [] });
    expect(trainers.get("trainer-nohours")?.nextSlotAt).toBeUndefined();
    expect(trainers.has("trainer-other")).toBe(false);
    expect(context.trainers.credits).toBe(9);
  });

  it("keeps restricted roles restricted: no ledger rows without financial read, no open work without crm read, foreign members unknown", async () => {
    const { sales, trainer, reception } = await harness();
    const asSales = await sales.query(api.domain.query, operation("members.resolution", { memberId: "res-member" })) as MemberResolutionContext;
    expect(asSales.access.payments).toBe(false);
    expect(asSales.payments).toEqual([]);
    expect(asSales.charges.length).toBe(2);
    expect(asSales.panels).toContain("panel.open_work");
    const asTrainer = await trainer.query(api.domain.query, operation("members.resolution", { memberId: "res-member" })) as MemberResolutionContext;
    expect(asTrainer.panels).not.toContain("panel.open_work");
    expect(asTrainer.tasks).toEqual([]);
    expect(asTrainer.access).toMatchObject({ payments: false, tasks: false, roster: false });
    const asReception = await reception.query(api.domain.query, operation("members.resolution", { memberId: "res-member" })) as MemberResolutionContext;
    expect(asReception.access.roster).toBe(true);
    await expectCode(sales.query(api.domain.query, operation("members.resolution", { memberId: "res-member-foreign" })), "NOT_FOUND");
  });
});

describe("resolution questions on the server", () => {
  it("offers each actor only their panels and reads the brief's examples", async () => {
    const { owner, trainer } = await harness();
    const paid = await owner.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member", goal: "I already paid for training" })) as JevJudgeResult;
    expect(paid).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "panel.training_payment" } });
    expect(offered(paid)).toEqual(expect.arrayContaining(["panel.training_payment", "panel.balance", "panel.open_work", "clarify.payment", "no_match"]));
    expect(choice(await owner.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member", goal: "she says she paid" })) as JevJudgeResult)).toBe("clarify.payment");
    expect(choice(await owner.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member", goal: "what is the weather like" })) as JevJudgeResult)).toBe("no_match");
    const asTrainer = await trainer.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member", goal: "who is handling her callback" })) as JevJudgeResult;
    expect(offered(asTrainer)).not.toContain("panel.open_work");
    expect(choice(asTrainer)).toBe("no_match");
    await expectCode(owner.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member", goal: "x" })), "VALIDATION_ERROR");
    await expectCode(owner.action(api.jevInference.judge, ask("resolution.intent", { memberId: "res-member-foreign", goal: "I already paid" })), "NOT_FOUND");
  });

  it("reads a stated plan priority and never ranks plans", async () => {
    const { sales } = await harness();
    const result = await sales.action(api.jevInference.judge, ask("resolution.plan_priority", { memberId: "res-member", goal: "she travels a lot and wants to pause when she is away" })) as JevJudgeResult;
    expect(choice(result)).toBe("attr.freeze");
    expect(offered(result)).toEqual(expect.arrayContaining(["attr.branch_access", "attr.price", "none"]));
  });

  it("offers only joinable classes, matches a day and time, and drops a class cancelled since the suggestion", async () => {
    const { owner, sales, hiit, men } = await harness();
    const first = await sales.action(api.jevInference.judge, ask("resolution.class_pick", { memberId: "res-member", goal: "a sunday morning class" })) as JevJudgeResult;
    const picked = choice(first)!;
    expect(picked.startsWith(`occ:${hiit.id}:`)).toBe(true);
    expect(offered(first).some((id) => id.startsWith(`occ:${men.id}:`))).toBe(false);
    expect(await sales.action(api.jevInference.judge, ask("resolution.class_pick", { memberId: "res-member", goal: "a sunday morning class" }))).toMatchObject({ status: "ready", source: "cache" });
    await owner.mutation(api.domain.mutate, operation("classes.occurrence.cancel", { occurrenceId: picked, reason: "Coach unavailable" }));
    const after = await sales.action(api.jevInference.judge, ask("resolution.class_pick", { memberId: "res-member", goal: "a sunday morning class" })) as JevJudgeResult;
    expect(after).toMatchObject({ status: "ready", source: "fixture" });
    expect(offered(after)).not.toContain(picked);
    expect(choice(await sales.action(api.jevInference.judge, ask("resolution.class_pick", { memberId: "res-member", goal: "a pilates class on saturday" })) as JevJudgeResult)).toBe("none");
    // A member with no class at their branch has nothing to ask about.
    await expectCode(owner.action(api.jevInference.judge, ask("resolution.class_pick", { memberId: "res-member-far", goal: "any class" })), "VALIDATION_ERROR");
  });

  it("offers trainers with open slots only and never infers a language from a name", async () => {
    const { t, sales, owner } = await harness();
    const arabic = await sales.action(api.jevInference.judge, ask("resolution.trainer_pick", { memberId: "res-member", goal: "an arabic speaking trainer" })) as JevJudgeResult;
    expect(choice(arabic)).toBe("trainer-ar");
    expect([...offered(arabic)].sort()).toEqual(["none", "trainer-ar", "trainer-blank"]);
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === ORG)!;
      const profile = (await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "trainer-ar")).unique())!;
      await ctx.db.patch(profile._id, { languages: [], updatedAt: Date.now() });
    });
    const unknown = await sales.action(api.jevInference.judge, ask("resolution.trainer_pick", { memberId: "res-member", goal: "an arabic speaking trainer" })) as JevJudgeResult;
    expect(unknown).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "none" } });
    await expectCode(owner.action(api.jevInference.judge, ask("resolution.trainer_pick", { memberId: "res-member-far", goal: "any trainer" })), "VALIDATION_ERROR");
  });
});
