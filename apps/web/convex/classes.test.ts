import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

const DAY_MS = 86_400_000;

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-classes", name: "Classes Gym", slug: "classes-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-classes", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const other = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-other", name: "Second", code: "SEC", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-classes", authSubject: "clerk-owner-classes", email: "owner@classes.example", fullName: "Owner Classes", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const reception = await ctx.db.insert("users", { publicId: "reception-classes", authSubject: "clerk-reception-classes", email: "reception@classes.example", fullName: "Reception Classes", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch, other], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branch], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    for (const member of [
      { id: "member-a", fullName: "Aisha Karim" },
      { id: "member-b", fullName: "Basel Odeh" },
      { id: "member-c", fullName: "Celine Haddad" },
    ]) {
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: member.id, branchId: branch, memberPublicId: member.id, createdAt: now, updatedAt: now, data: { id: member.id, fullName: member.fullName, memberNumber: member.id.toUpperCase(), status: "active", homeBranchId: "branch-classes", createdAt: new Date(now).toISOString() } });
    }
  });
}

describe("class calendar", () => {
  it("schedules, lists in a window, rosters with capacity, records attendance, and cancels with a reason", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-classes" });
    const reception = t.withIdentity({ subject: "clerk-reception-classes" });
    const startsAt = new Date(Date.now() + 2 * DAY_MS).toISOString();

    // Receptionists cannot schedule classes.
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "HIIT", startsAt, durationMinutes: 60, capacity: 2 })), "FORBIDDEN");

    const created = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", {
      branchId: "branch-classes",
      name: "Morning HIIT",
      coachUserId: "owner-classes",
      startsAt,
      durationMinutes: 60,
      capacity: 2,
      notes: "Bring water.",
    })) as { id: string; status: string; coachName: string; roster: unknown[] };
    expect(created).toMatchObject({ status: "scheduled", coachName: "Owner Classes", roster: [] });

    const listed = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes", from: new Date(Date.now()).toISOString(), to: new Date(Date.now() + 7 * DAY_MS).toISOString() })) as Array<{ id: string }>;
    expect(listed.map((item) => item.id)).toContain(created.id);
    const outside = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes", from: new Date(Date.now() + 3 * DAY_MS).toISOString(), to: new Date(Date.now() + 5 * DAY_MS).toISOString() })) as Array<{ id: string }>;
    expect(outside.map((item) => item.id)).not.toContain(created.id);

    // Reception can roster and mark attendance.
    await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" }));
    const duplicated = await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" })) as { roster: unknown[] };
    expect(duplicated.roster).toHaveLength(1);
    await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-b" }));
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-c" })), "VALIDATION_ERROR");

    const marked = await reception.mutation(api.domain.mutate, operation("classes.attendance.set", { sessionId: created.id, memberId: "member-a", attended: true })) as { attendedCount: number };
    expect(marked.attendedCount).toBe(1);

    // Capacity cannot drop below the booked roster.
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { sessionId: created.id, branchId: "branch-classes", name: "Morning HIIT", startsAt, durationMinutes: 60, capacity: 1 })), "VALIDATION_ERROR");

    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.cancel", { sessionId: created.id, reason: "" })), "VALIDATION_ERROR");
    const cancelled = await owner.mutation(api.domain.mutate, operation("classes.session.cancel", { sessionId: created.id, reason: "Coach is unavailable." })) as { status: string; cancelReason: string };
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Coach is unavailable." });
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-c" })), "VALIDATION_ERROR");

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.entityType === "class_session").map((event) => event.action));
    expect(audits).toEqual(expect.arrayContaining(["classes.session.create", "classes.roster.add", "classes.attendance.set", "classes.session.cancel"]));
  });

  it("keeps class sessions inside the caller's branch scope", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-classes" });
    const reception = t.withIdentity({ subject: "clerk-reception-classes" });
    const startsAt = new Date(Date.now() + DAY_MS).toISOString();
    const created = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-other", name: "Second Branch Yoga", startsAt, durationMinutes: 60, capacity: 10 })) as { id: string };

    // The receptionist is scoped to the main branch only.
    await expectCode(reception.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-other" })), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" })), "FORBIDDEN");

    // A session can never migrate between branches.
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { sessionId: created.id, branchId: "branch-classes", name: "Second Branch Yoga", startsAt, durationMinutes: 60, capacity: 10 })), "VALIDATION_ERROR");
  });
});
