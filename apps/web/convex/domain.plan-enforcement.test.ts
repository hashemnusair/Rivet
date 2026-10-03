import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { DAY_MS, SUSPENSION_AFTER_DUE_DAYS } from "./subscriptionTerm";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-plan-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

type Plan = "Starter" | "Growth" | "Pro" | "Enterprise";
type Status = "trial" | "active" | "past_due";

async function seeded(plan: Plan, options: { status?: Status; trialEndsAt?: number; limits?: { branches?: number; staff?: number; members?: number } } = {}) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "plan-org", name: "Plan Gym", slug: "plan-gym", status: options.status ?? "active", subscriptionPlan: plan, ...(options.trialEndsAt ? { trialEndsAt: options.trialEndsAt } : {}), timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "plan-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const people = [
      { id: "plan-owner", role: "owner" as const, active: true },
      { id: "plan-manager", role: "manager" as const, active: true },
      { id: "plan-desk", role: "receptionist" as const, active: true },
      { id: "plan-former", role: "receptionist" as const, active: false },
    ];
    for (const person of people) {
      const user = await ctx.db.insert("users", { publicId: person.id, authSubject: `clerk-${person.id}`, email: `${person.id}@plan.example`, fullName: person.id, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: user, role: person.role, branchIds: [branch], branchScope: "all", active: person.active, createdAt: now, updatedAt: now });
    }
    if (options.limits) {
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "platformPlan", publicId: plan, createdAt: now, updatedAt: now, data: { id: plan, name: plan, ...options.limits } });
    }
  });
  return { t, owner: t.withIdentity({ subject: "clerk-plan-owner" }), desk: t.withIdentity({ subject: "clerk-plan-desk" }) };
}

const newBranch = (code: string, status: "active" | "inactive" = "active") => ({ name: `Branch ${code}`, code, address: "Amman", phone: "+962790000000", capacity: 80, status });
const newMember = (name: string, phone: string) => ({ fullName: name, phone, gender: "female", homeBranchId: "plan-branch", preferredLanguage: "en" });

describe("analytics belong to management reporting", () => {
  it("refuses analytics on Starter and Growth and serves them on Pro", async () => {
    for (const plan of ["Starter", "Growth"] as const) {
      const { owner } = await seeded(plan);
      await expectCode(owner.query(api.domain.query, operation("analytics.peak_hours", { from: "2026-09-01", to: "2026-09-30" })), "FEATURE_NOT_AVAILABLE");
      await expectCode(owner.query(api.domain.query, operation("analytics.retention", {})), "FEATURE_NOT_AVAILABLE");
    }
    const { owner } = await seeded("Pro");
    await expect(owner.query(api.domain.query, operation("analytics.peak_hours", { from: "2026-09-01", to: "2026-09-30" }))).resolves.toBeTruthy();
  });

  it("keeps cash shifts on every plan", async () => {
    const { owner } = await seeded("Starter");
    await expect(owner.query(api.domain.query, operation("shifts.list", {}))).resolves.toBeTruthy();
  });

  it("refuses the stock download on a plan without daily operations", async () => {
    const { owner } = await seeded("Starter");
    await expectCode(owner.mutation(api.domain.mutate, operation("exports.request", { kind: "operations" })), "FEATURE_NOT_AVAILABLE");
  });
});

describe("plan limits stop additions, never existing records", () => {
  it("refuses a second active branch on Starter, new or switched back on", async () => {
    const { t, owner } = await seeded("Starter");
    await expectCode(owner.mutation(api.domain.mutate, operation("branches.upsert", newBranch("SEC"))), "PLAN_LIMIT_REACHED");
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "plan-org")).unique();
      const now = Date.now();
      await ctx.db.insert("branches", { organizationId: organization!._id, publicId: "plan-parked", name: "Parked", code: "PRK", active: false, status: "inactive", createdAt: now, updatedAt: now });
    });
    await expect(owner.mutation(api.domain.mutate, operation("branches.upsert", { id: "plan-parked", ...newBranch("PRK") }))).rejects.toMatchObject({
      data: expect.objectContaining({ code: "PLAN_LIMIT_REACHED", messageKey: "apiErrors.planLimitBranches", messageParams: { plan: "Starter", limit: 1 } }),
    });
  });

  it("allows a second branch on Growth", async () => {
    const { owner } = await seeded("Growth");
    await expect(owner.mutation(api.domain.mutate, operation("branches.upsert", newBranch("SEC")))).resolves.toMatchObject({ code: "SEC" });
  });

  it("uses a member limit the platform operator saved over the published one", async () => {
    const { owner } = await seeded("Starter", { limits: { members: 1 } });
    await owner.mutation(api.domain.mutate, operation("members.create", newMember("First Member", "079 321 4567")));
    await expect(owner.mutation(api.domain.mutate, operation("members.create", newMember("Second Member", "079 321 4568")))).rejects.toMatchObject({
      data: expect.objectContaining({ code: "PLAN_LIMIT_REACHED", messageKey: "apiErrors.planLimitMembers", messageParams: { plan: "Starter", limit: 1 } }),
    });
  });

  it("refuses to reactivate staff past the staff limit, and allows it once a seat is free", async () => {
    const { owner } = await seeded("Starter", { limits: { staff: 3 } });
    await expectCode(owner.mutation(api.domain.mutate, operation("users.update", { userId: "plan-former", status: "active" })), "PLAN_LIMIT_REACHED");
    await owner.mutation(api.domain.mutate, operation("users.update", { userId: "plan-desk", status: "deactivated" }));
    await expect(owner.mutation(api.domain.mutate, operation("users.update", { userId: "plan-former", status: "active" }))).resolves.toMatchObject({ id: "plan-former" });
  });

  it("leaves a gym already over its limit fully working", async () => {
    const { owner } = await seeded("Starter", { limits: { staff: 1 } });
    // Three active staff on a one-seat plan: reads and edits still work.
    await expect(owner.query(api.domain.query, operation("session"))).resolves.toBeTruthy();
    await expect(owner.mutation(api.domain.mutate, operation("users.update", { userId: "plan-desk", role: "receptionist" }))).resolves.toMatchObject({ id: "plan-desk" });
  });
});

describe("money owed to RIVET reaches owners and managers", () => {
  it("tells a past-due owner the amount and the day access may be suspended, and not the desk", async () => {
    const dueAt = Date.UTC(2026, 8, 1);
    const { t, owner, desk } = await seeded("Starter", { status: "past_due" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "plan-org")).unique();
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "platformInvoice", publicId: "INV-1", createdAt: now, updatedAt: now, data: { id: "INV-1", amountMinor: 79_000, currency: "JOD", dueAt: new Date(dueAt).toISOString(), status: "past_due" } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "platformInvoice", publicId: "INV-0", createdAt: now, updatedAt: now, data: { id: "INV-0", amountMinor: 50_000, currency: "JOD", dueAt: new Date(dueAt - DAY_MS).toISOString(), status: "paid" } });
    });
    const session = await owner.query(api.domain.query, operation("session")) as { organization: { subscription: { notice?: unknown } } };
    expect(session.organization.subscription.notice).toEqual({
      kind: "past_due",
      amount: { amount: 79_000, currency: "JOD" },
      dueAt: new Date(dueAt).toISOString(),
      suspendsAt: new Date(dueAt + SUSPENSION_AFTER_DUE_DAYS * DAY_MS).toISOString(),
    });
    const deskSession = await desk.query(api.domain.query, operation("session")) as { organization: { subscription: { notice?: unknown } } };
    expect(deskSession.organization.subscription.notice).toBeUndefined();
  });

  it("tells the owner when the trial has ended, and says nothing while it runs", async () => {
    const ended = Date.now() - 2 * DAY_MS;
    const { owner } = await seeded("Growth", { status: "trial", trialEndsAt: ended });
    const session = await owner.query(api.domain.query, operation("session")) as { organization: { subscription: { notice?: unknown } } };
    expect(session.organization.subscription.notice).toEqual({ kind: "trial_ended", trialEndedAt: new Date(ended).toISOString() });

    const running = await seeded("Growth", { status: "trial", trialEndsAt: Date.now() + 5 * DAY_MS });
    const runningSession = await running.owner.query(api.domain.query, operation("session")) as { organization: { subscription: { notice?: unknown } } };
    expect(runningSession.organization.subscription.notice).toBeUndefined();
  });
});
