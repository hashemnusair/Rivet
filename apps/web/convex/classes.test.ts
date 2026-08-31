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

describe("weekly class schedule", () => {
  it("manages the coach directory and keeps class snapshots in step", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-classes" });
    const reception = t.withIdentity({ subject: "clerk-reception-classes" });

    await expectCode(reception.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Blocked" })), "FORBIDDEN");
    const coach = await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { name: "Dana Haddad", specialty: "HIIT" })) as { id: string; name: string };
    expect(coach).toMatchObject({ name: "Dana Haddad", specialty: "HIIT" });

    const created = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Evening HIIT", coachId: coach.id, dayOfWeek: 1, startMinute: 18 * 60, durationMinutes: 60, capacity: 10, audience: "women" })) as { id: string; coachName: string; audience: string };
    expect(created).toMatchObject({ coachName: "Dana Haddad", audience: "women", dayOfWeek: 1, startMinute: 1080 });

    // Renaming the coach updates the schedule's snapshots.
    await owner.mutation(api.domain.mutate, operation("classes.coach.upsert", { coachId: coach.id, name: "Dana H." }));
    const listed = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes" })) as Array<{ id: string; coachName?: string }>;
    expect(listed.find((item) => item.id === created.id)?.coachName).toBe("Dana H.");

    // Removing a coach keeps the class but drops the dangling reference.
    await owner.mutation(api.domain.mutate, operation("classes.coach.remove", { coachId: coach.id }));
    const after = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes" })) as Array<{ id: string; coachId?: string; coachName?: string }>;
    expect(after.find((item) => item.id === created.id)).toMatchObject({ coachName: "Dana H." });
    expect(after.find((item) => item.id === created.id)?.coachId).toBeUndefined();
    expect(await owner.query(api.domain.query, operation("classes.coaches.list"))).toEqual([]);
  });

  it("keeps a weekly template with roster capacity, attendance, and reason-gated removal", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-classes" });
    const reception = t.withIdentity({ subject: "clerk-reception-classes" });

    await expectCode(reception.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "HIIT", dayOfWeek: 0, startMinute: 360, durationMinutes: 60, capacity: 2, audience: "mixed" })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Bad day", dayOfWeek: 9, startMinute: 360, durationMinutes: 60, capacity: 2, audience: "mixed" })), "VALIDATION_ERROR");
    // A class may not cross midnight: 22:30 + 120 minutes must be rejected.
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Late night", dayOfWeek: 0, startMinute: 22 * 60 + 30, durationMinutes: 120, capacity: 10, audience: "mixed" })), "VALIDATION_ERROR");

    const created = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Morning HIIT", dayOfWeek: 0, startMinute: 6 * 60, durationMinutes: 90, capacity: 2, audience: "mixed" })) as { id: string };
    // Two classes never overlap on the same branch and day; adjacent is fine.
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Clashing", dayOfWeek: 0, startMinute: 7 * 60, durationMinutes: 60, capacity: 5, audience: "mixed" })), "VALIDATION_ERROR");
    const adjacent = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-classes", name: "Back to back", dayOfWeek: 0, startMinute: 7 * 60 + 30, durationMinutes: 30, capacity: 5, audience: "mixed" })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("classes.session.delete", { sessionId: adjacent.id, reason: "Test cleanup." }));

    await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" }));
    const duplicated = await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" })) as { roster: unknown[] };
    expect(duplicated.roster).toHaveLength(1);
    await reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-b" }));
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-c" })), "VALIDATION_ERROR");
    const marked = await reception.mutation(api.domain.mutate, operation("classes.attendance.set", { sessionId: created.id, memberId: "member-a", attended: true })) as { attendedCount: number };
    expect(marked.attendedCount).toBe(1);

    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { sessionId: created.id, branchId: "branch-classes", name: "Morning HIIT", dayOfWeek: 0, startMinute: 6 * 60, durationMinutes: 90, capacity: 1, audience: "mixed" })), "VALIDATION_ERROR");

    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.delete", { sessionId: created.id, reason: "" })), "VALIDATION_ERROR");
    await owner.mutation(api.domain.mutate, operation("classes.session.delete", { sessionId: created.id, reason: "Coach left; slot retired." }));
    const listed = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes" })) as Array<{ id: string }>;
    expect(listed.map((item) => item.id)).not.toContain(created.id);

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.entityType === "class_session").map((event) => event.action));
    expect(audits).toEqual(expect.arrayContaining(["classes.session.create", "classes.roster.add", "classes.attendance.set", "classes.session.delete"]));
  });

  it("normalizes legacy dated rows into weekly slots and enforces branch scope", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-classes" });
    const reception = t.withIdentity({ subject: "clerk-reception-classes" });

    // A legacy dated row (Wednesday 2026-09-02 11:00 Amman = 08:00 UTC).
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-classes")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "branch-classes")).unique();
      await ctx.db.insert("classSessions", { organizationId: organization!._id, publicId: "legacy-1", branchId: branch!._id, name: "Legacy MMA", startsAt: Date.parse("2026-09-02T08:00:00.000Z"), durationMinutes: 60, capacity: 12, status: "scheduled", roster: [], createdAt: Date.now(), updatedAt: Date.now() });
    });
    const listed = await owner.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-classes" })) as Array<{ id: string; dayOfWeek: number; startMinute: number }>;
    expect(listed.find((item) => item.id === "legacy-1")).toMatchObject({ dayOfWeek: 3, startMinute: 11 * 60 });

    const created = await owner.mutation(api.domain.mutate, operation("classes.session.upsert", { branchId: "branch-other", name: "Second Branch Yoga", dayOfWeek: 2, startMinute: 600, durationMinutes: 60, capacity: 10, audience: "mixed" })) as { id: string };
    await expectCode(reception.query(api.domain.query, operation("classes.sessions.list", { branchId: "branch-other" })), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("classes.roster.add", { sessionId: created.id, memberId: "member-a" })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("classes.session.upsert", { sessionId: created.id, branchId: "branch-classes", name: "Second Branch Yoga", dayOfWeek: 2, startMinute: 600, durationMinutes: 60, capacity: 10, audience: "mixed" })), "VALIDATION_ERROR");
  });
});
