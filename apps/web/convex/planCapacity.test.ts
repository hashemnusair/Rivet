import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { effectivePlan, peakConcurrentMemberTerms } from "./planCapacity";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
let requestNumber = 0;
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `capacity-${name}-${++requestNumber}` });
const money = (amount: number) => ({ amount, currency: "JOD" });
const dateAt = (offset: number, date = new Date().toISOString().slice(0, 10)) => new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * 86_400_000).toISOString().slice(0, 10);

type Fixture = {
  t: TestConvex<typeof schema>;
  owner: ReturnType<TestConvex<typeof schema>["withIdentity"]>;
  organizationId: string;
  branchId: string;
  ownerId: string;
};

async function seed(t: TestConvex<typeof schema>, caps: { branches?: number; staff?: number; members?: number } = {}): Promise<Fixture> {
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      publicId: "capacity-org",
      name: "Capacity Gym",
      slug: "capacity-gym",
      status: "active",
      subscriptionPlan: "Starter",
      timezone: "UTC",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "capacity-branch-main", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: "capacity-owner", authSubject: "clerk-capacity-owner", email: "owner@capacity.example.test", fullName: "Capacity Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, invitationStatus: "accepted", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", {
      organizationId,
      entityType: "platformPlan",
      publicId: "Starter",
      createdAt: now,
      updatedAt: now,
      data: { id: "Starter", name: "Starter", ...caps },
    });
    await ctx.db.insert("domainRecords", {
      organizationId,
      entityType: "plan",
      publicId: "capacity-member-plan",
      branchId,
      createdAt: now,
      updatedAt: now,
      data: { id: "capacity-member-plan", name: "Monthly", kind: "time", durationDays: 30, basePrice: money(30_000), branchAccess: "all", status: "active" },
    });
    await ctx.db.insert("organizationEntitlements", { organizationId, catalogVersion: 1, subscriptionPlan: "Starter", entitledModules: ["foundation", "revenue"], source: "subscription_plan", createdAt: now, updatedAt: now });
    return { organizationId, branchId, ownerId };
  });
  return { ...ids, organizationId: String(ids.organizationId), branchId: String(ids.branchId), ownerId: String(ids.ownerId), t, owner: t.withIdentity({ subject: "clerk-capacity-owner" }) };
}

async function insertMember(t: Fixture["t"], publicId: string, branchId = "capacity-branch-main"): Promise<void> {
  await t.run(async (ctx) => {
    const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
    const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", org!._id).eq("publicId", branchId)).unique();
    if (!org || !branch) throw new Error("Capacity fixture member branch is missing");
    const now = Date.now();
    await ctx.db.insert("domainRecords", {
      organizationId: org._id,
      entityType: "member",
      publicId,
      memberPublicId: publicId,
      branchId: branch._id,
      createdAt: now,
      updatedAt: now,
      data: { id: publicId, fullName: `Member ${publicId}`, memberNumber: `M-${publicId}`, phone: `+962790${publicId.slice(-6).padStart(6, "0")}`, homeBranchId: branchId, status: "active", tags: [], createdAt: new Date(now).toISOString() },
    });
  });
}

async function insertTerm(
  t: Fixture["t"],
  publicId: string,
  memberId: string,
  startDate: string,
  endDate: string,
  extra: Record<string, unknown> = {},
  branchId = "capacity-branch-main",
): Promise<void> {
  await t.run(async (ctx) => {
    const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
    const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", org!._id).eq("publicId", branchId)).unique();
    if (!org || !branch) throw new Error("Capacity fixture term branch is missing");
    const now = Date.now();
    await ctx.db.insert("domainRecords", {
      organizationId: org._id,
      entityType: "membership",
      publicId,
      memberPublicId: memberId,
      branchId: branch._id,
      createdAt: now,
      updatedAt: now,
      data: { id: publicId, memberId, homeBranchId: branchId, planId: "capacity-member-plan", startDate, endDate, ...extra },
    });
  });
}

async function invite(owner: Fixture["owner"], email: string) {
  return await owner.mutation(internal.invitations.prepare, {
    organizationId: "capacity-org",
    correlationId: `capacity-invite-${email}`,
    input: { name: email.split("@")[0] ?? "Staff", email, role: "receptionist", branchScope: "selected", branchIds: ["capacity-branch-main"] },
  });
}

function expectCapacityFailure(result: Promise<unknown>, resource: "branches" | "staff" | "members") {
  return expect(result).rejects.toMatchObject({
    data: expect.objectContaining({
      code: "VALIDATION_ERROR",
      messageKey: "apiErrors.planCapacity",
      details: expect.objectContaining({ resource }),
    }),
  });
}

describe("plan capacity enforcement", () => {
  it("uses defaults plus persisted plan overrides and sweeps distinct future/frozen terms", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seed(t, { members: 17, branches: 2.5, staff: 0 });
    const plans = await t.run(async (ctx) => ({ starter: await effectivePlan(ctx, "Starter"), pro: await effectivePlan(ctx, "Pro") }));
    expect(plans.starter).toMatchObject({ name: "Starter", members: 17, branches: 1, staff: 3, onboardingFeeMinor: expect.any(Number) });
    expect(plans.pro).toMatchObject({ name: "Pro", members: 1_000, branches: 5, staff: 20 });
    expect(organizationId).toBeTruthy();

    const today = "2026-10-07";
    const peak = peakConcurrentMemberTerms([
      { publicId: "term-a1", data: { memberId: "member-a", startDate: today, endDate: "2026-10-10", status: "frozen" } },
      { publicId: "term-a2", data: { memberId: "member-a", startDate: "2026-10-11", endDate: "2026-10-15" } },
      { publicId: "term-b", data: { memberId: "member-b", startDate: "2026-10-12", endDate: "2026-10-20", status: "scheduled" } },
      { publicId: "cancelled", data: { memberId: "member-c", startDate: today, endDate: "2026-12-01", status: "cancelled" } },
      { publicId: "archived", data: { memberId: "member-d", startDate: today, endDate: "2026-12-01" } },
      { publicId: "archived-status", data: { memberId: "member-g", startDate: today, endDate: "2026-12-01", status: "archived" } },
      { publicId: "depleted", data: { memberId: "member-e", startDate: today, endDate: "2026-12-01", remainingVisits: 0 } },
      { publicId: "past", data: { memberId: "member-f", startDate: "2026-01-01", endDate: "2026-01-30" } },
    ], today, new Set(["member-d"]));
    expect(peak).toBe(2);
    expect(peakConcurrentMemberTerms([{ publicId: "stale-expired", data: { memberId: "member-stale", startDate: today, endDate: "2026-11-01", status: "expired" } }], today)).toBe(1);
  });

  it("enforces branch and staff boundaries across the whole tenant and preserves invite-seat replay", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, { branches: 2, staff: 2 });
    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "capacity-foreign-org", name: "Foreign", slug: "capacity-foreign", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const foreignBranches = [];
      for (let index = 0; index < 4; index += 1) {
        foreignBranches.push(await ctx.db.insert("branches", { organizationId: foreignOrg, publicId: `capacity-foreign-${index}`, name: `Foreign ${index}`, code: `F${index}`, active: true, status: "active", createdAt: now, updatedAt: now }));
      }
      for (let index = 0; index < 4; index += 1) {
        const userId = await ctx.db.insert("users", { publicId: `capacity-foreign-user-${index}`, authSubject: `clerk-capacity-foreign-${index}`, email: `foreign-${index}@example.test`, fullName: `Foreign ${index}`, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
        await ctx.db.insert("organizationMemberships", { organizationId: foreignOrg, userId, role: "receptionist", branchIds: foreignBranches, active: true, invitationStatus: "accepted", createdAt: now, updatedAt: now });
      }
      const pendingId = await ctx.db.insert("users", { publicId: "capacity-pending", authSubject: "invite:pending@capacity.example.test", email: "pending@capacity.example.test", fullName: "Pending", platformAdmin: false, status: "invited", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: fixture.organizationId as never, userId: pendingId, role: "receptionist", branchIds: [fixture.branchId as never], branchScope: "selected", active: true, invitationStatus: "pending", createdAt: now, updatedAt: now });
    });

    await fixture.owner.mutation(api.domain.mutate, operation("branches.upsert", { name: "Second", code: "SECOND", status: "active" }));
    await expectCapacityFailure(fixture.owner.mutation(api.domain.mutate, operation("branches.upsert", { name: "Third", code: "THIRD", status: "active" })), "branches");
    const pending = await invite(fixture.owner, "pending@capacity.example.test");
    expect(pending).toMatchObject({ membershipId: expect.any(String), status: "invited" });
    await expectCapacityFailure(invite(fixture.owner, "overflow@capacity.example.test"), "staff");

    await fixture.owner.mutation(api.domain.mutate, operation("users.update", { userId: "capacity-pending", status: "deactivated" }));
    const replacement = await invite(fixture.owner, "replacement@capacity.example.test");
    expect(replacement).toMatchObject({ status: "invited", email: "replacement@capacity.example.test" });
  });

  it("pools terms across branches, counts frozen and future terms, and releases cancelled/archive/depleted terms", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, { members: 2 });
    const today = new Date().toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      const now = Date.now();
      const branch = await ctx.db.insert("branches", { organizationId: fixture.organizationId as never, publicId: "capacity-branch-two", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "capacity-members-foreign", name: "Foreign", slug: "capacity-members-foreign", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const foreignBranch = await ctx.db.insert("branches", { organizationId: foreignOrg, publicId: "capacity-members-foreign-branch", name: "Foreign", code: "FOREIGN", active: true, status: "active", createdAt: now, updatedAt: now });
      const add = async (organizationId: typeof fixture.organizationId, orgBranch: typeof branch, publicId: string, memberId: string, startDate: string, endDate: string, extra: Record<string, unknown> = {}) => await ctx.db.insert("domainRecords", {
        organizationId: organizationId as never,
        entityType: "membership",
        publicId,
        memberPublicId: memberId,
        branchId: orgBranch,
        createdAt: now,
        updatedAt: now,
        data: { id: publicId, memberId, startDate, endDate, planId: "capacity-member-plan", ...extra },
      });
      const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
      const main = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", org!._id).eq("publicId", "capacity-branch-main")).unique();
      if (!org || !main) throw new Error("Capacity fixture organization is missing");
      await ctx.db.insert("domainRecords", { organizationId: org._id, entityType: "member", publicId: "archived-member", memberPublicId: "archived-member", branchId: main._id, createdAt: now, updatedAt: now, data: { id: "archived-member", status: "archived", archivedAt: new Date(now).toISOString() } });
      await add(org._id as never, main._id, "frozen-term", "frozen-member", today, dateAt(60, today), { status: "frozen", activeFreeze: { status: "active", startDate: today, endDate: dateAt(5, today) } });
      await add(org._id as never, branch, "future-term", "future-member", dateAt(10, today), dateAt(40, today), { status: "scheduled" });
      await add(org._id as never, branch, "cancelled-term", "cancelled-member", today, dateAt(90, today), { status: "cancelled" });
      await add(org._id as never, branch, "archived-term", "archived-member", today, dateAt(90, today));
      await add(org._id as never, branch, "depleted-term", "depleted-member", today, dateAt(90, today), { remainingVisits: 0 });
      await add(foreignOrg as never, foreignBranch, "foreign-term", "foreign-member", today, dateAt(90, today));
    });
    await insertMember(t, "capacity-new-member");
    const input = { memberId: "capacity-new-member", planId: "capacity-member-plan", startDate: dateAt(10, today), overrideReason: "Member requested a future start date." };
    await expectCapacityFailure(fixture.owner.mutation(api.domain.mutate, operation("memberships.sale", input)), "members");

    await t.run(async (ctx) => {
      const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
      const future = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", org!._id).eq("entityType", "membership").eq("publicId", "future-term")).unique();
      if (!future) throw new Error("Capacity fixture future term is missing");
      await ctx.db.patch(future._id, { data: { ...future.data, status: "cancelled", cancelledAt: new Date().toISOString() } });
    });
    await expect(fixture.owner.mutation(api.domain.mutate, operation("memberships.sale", input))).resolves.toMatchObject({ membership: { memberId: "capacity-new-member" } });
  });

  it("allows non-increasing corrections above cap but rejects an extension that increases peak concurrency", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, { members: 1 });
    const today = new Date().toISOString().slice(0, 10);
    await insertMember(t, "over-member-a");
    await insertMember(t, "over-member-b");
    await insertTerm(t, "over-a", "over-member-a", today, dateAt(3, today));
    await insertTerm(t, "over-b", "over-member-b", today, dateAt(3, today));
    await insertTerm(t, "over-c", "over-member-a", dateAt(4, today), dateAt(10, today), { status: "scheduled" });

    await expect(fixture.owner.mutation(api.domain.mutate, operation("memberships.extend", { membershipId: "over-a", days: 1, reason: "Correct the over-cap term without increasing simultaneous members." }))).resolves.toMatchObject({ id: "over-a", endDate: dateAt(4, today) });
    await expectCapacityFailure(fixture.owner.mutation(api.domain.mutate, operation("memberships.extend", { membershipId: "over-b", days: 1, reason: "This correction would create a larger simultaneous over-cap peak." })), "members");
  });

  it("does not let an earlier over-cap peak hide a new over-cap future interval", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, { members: 2 });
    const today = new Date().toISOString().slice(0, 10);
    for (const memberId of ["disjoint-101", "disjoint-102", "disjoint-103", "disjoint-104", "disjoint-105", "disjoint-106"]) {
      await insertMember(t, memberId);
    }
    for (const [termId, memberId] of [["early-a", "disjoint-101"], ["early-b", "disjoint-102"], ["early-c", "disjoint-103"]] as const) {
      await insertTerm(t, termId, memberId, today, dateAt(2, today));
    }
    await insertTerm(t, "later-a", "disjoint-104", dateAt(10, today), dateAt(20, today), { status: "scheduled" });
    await insertTerm(t, "later-b", "disjoint-105", dateAt(10, today), dateAt(20, today), { status: "scheduled" });

    await expectCapacityFailure(fixture.owner.mutation(api.domain.mutate, operation("memberships.sale", {
      memberId: "disjoint-106",
      planId: "capacity-member-plan",
      startDate: dateAt(10, today),
      overrideReason: "Member requested a future start date.",
    })), "members");
  });

  it("rechecks future membership capacity when an archived member is restored", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seed(t, { members: 1 });
    const today = new Date().toISOString().slice(0, 10);
    await insertMember(t, "restore-active-member");
    await insertMember(t, "restore-archived-member");
    await insertTerm(t, "restore-active-term", "restore-active-member", today, dateAt(30, today));
    await insertTerm(t, "restore-archived-term", "restore-archived-member", today, dateAt(30, today));
    await t.run(async (ctx) => {
      const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
      const archived = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", org!._id).eq("entityType", "member").eq("publicId", "restore-archived-member")).unique();
      if (!archived) throw new Error("Capacity fixture archived member is missing");
      await ctx.db.patch(archived._id, { data: { ...archived.data, status: "archived", archivedAt: new Date().toISOString() } });
    });

    await expect(fixture.owner.mutation(api.domain.mutate, operation("members.update", { memberId: "restore-active-member", notes: "Non-archived profile edits remain available at capacity." }))).resolves.toMatchObject({ id: "restore-active-member" });
    await expectCapacityFailure(fixture.owner.mutation(api.domain.mutate, operation("members.update", { memberId: "restore-archived-member", status: "active", archivedAt: null })), "members");
    const restored = await t.run(async (ctx) => {
      const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
      const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", org!._id).eq("entityType", "member").eq("publicId", "restore-archived-member")).unique();
      return member?.data as Record<string, unknown> | undefined;
    });
    expect(restored).toMatchObject({ status: "archived", archivedAt: expect.any(String) });
  });

  it("serializes concurrent branch creation, invitation reservations, and membership sales; sale replay does not reserve again", async () => {
    const branchFixture = await seed(convexTest(schema, modules), { branches: 2 });
    const branchResults = await Promise.allSettled([
      branchFixture.owner.mutation(api.domain.mutate, operation("branches.upsert", { name: "Race one", code: "RACE1", status: "active" })),
      branchFixture.owner.mutation(api.domain.mutate, operation("branches.upsert", { name: "Race two", code: "RACE2", status: "active" })),
    ]);
    expect(branchResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(branchResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const branchFailure = branchResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(branchFailure?.reason).toMatchObject({ data: expect.objectContaining({ messageKey: "apiErrors.planCapacity", details: expect.objectContaining({ resource: "branches" }) }) });
    const activeBranchCount = await branchFixture.t.run(async (ctx) => (await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", branchFixture.organizationId as never)).collect()).filter((branch) => branch.active && branch.status !== "inactive").length);
    expect(activeBranchCount).toBe(2);

    const staffFixture = await seed(convexTest(schema, modules), { staff: 2 });
    const inviteResults = await Promise.allSettled([invite(staffFixture.owner, "race-one@capacity.example.test"), invite(staffFixture.owner, "race-two@capacity.example.test")]);
    expect(inviteResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(inviteResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const inviteFailure = inviteResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(inviteFailure?.reason).toMatchObject({ data: expect.objectContaining({ messageKey: "apiErrors.planCapacity", details: expect.objectContaining({ resource: "staff" }) }) });
    const activeStaffCount = await staffFixture.t.run(async (ctx) => (await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", staffFixture.organizationId as never)).collect()).filter((membership) => membership.active && membership.invitationStatus !== "revoked").length);
    expect(activeStaffCount).toBe(2);

    const memberFixture = await seed(convexTest(schema, modules), { members: 1 });
    await insertMember(memberFixture.t, "race-member-one");
    await insertMember(memberFixture.t, "race-member-two");
    const saleInput = (memberId: string, idempotencyKey: string) => ({ memberId, planId: "capacity-member-plan", startDate: new Date().toISOString().slice(0, 10), idempotencyKey });
    const saleResults = await Promise.allSettled([
      memberFixture.owner.mutation(api.domain.mutate, operation("memberships.sale", saleInput("race-member-one", "capacity-race-sale-one"))),
      memberFixture.owner.mutation(api.domain.mutate, operation("memberships.sale", saleInput("race-member-two", "capacity-race-sale-two"))),
    ]);
    expect(saleResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(saleResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saleFailure = saleResults.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(saleFailure?.reason).toMatchObject({ data: expect.objectContaining({ messageKey: "apiErrors.planCapacity", details: expect.objectContaining({ resource: "members" }) }) });
    const winner = saleResults.find((result): result is PromiseFulfilledResult<{ membership: { id: string; memberId: string } }> => result.status === "fulfilled");
    if (!winner) throw new Error("Expected one membership sale to win the capacity race");
    const winnerInput = saleInput(winner.value.membership.memberId, winner.value.membership.memberId === "race-member-one" ? "capacity-race-sale-one" : "capacity-race-sale-two");
    const replay = await memberFixture.owner.mutation(api.domain.mutate, operation("memberships.sale", winnerInput)) as { membership: { id: string } };
    expect(replay.membership.id).toBe(winner.value.membership.id);
    const persistedMemberships = await memberFixture.t.run(async (ctx) => {
      const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "capacity-org")).unique();
      return await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", org!._id).eq("entityType", "membership")).collect();
    });
    expect(persistedMemberships).toHaveLength(1);
  });
});
