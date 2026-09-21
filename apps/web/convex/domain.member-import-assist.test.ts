import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import { summarizeImportColumn } from "./jevImportState";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-assist-${name}` });
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, correlationId: `cor-assist-${organizationId}`, ...(extra ?? ({} as Extra)) });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "org-a", name: "Gym A", slug: "gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", phoneCountryCallingCode: "+962", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: "org-b", name: "Gym B", slug: "gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "branch-b", name: "Main B", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, subject: string) => await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await user("owner-a", "clerk-owner-a");
    const trainerA = await user("trainer-a", "clerk-trainer-a");
    const ownerB = await user("owner-b", "clerk-owner-b");
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: ownerA, role: "owner", branchIds: [branchA], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgA, userId: trainerA, role: "trainer", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: orgB, userId: ownerB, role: "owner", branchIds: [branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const plan = async (organizationId: typeof orgA, branchId: typeof branchA, publicId: string, data: Record<string, unknown>) => await ctx.db.insert("domainRecords", { organizationId, entityType: "plan", publicId, branchId, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: "org-a", branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active", ...data } });
    await plan(orgA, branchA, "plan-monthly", { name: "Monthly", code: "M1", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" } });
    await plan(orgA, branchA, "plan-ten", { name: "Ten Visits", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 90, basePrice: { amount: 50_000, currency: "JOD" } });
    await plan(orgA, branchA, "plan-old", { name: "Old Promo", code: "OLD", kind: "time", durationDays: 90, basePrice: { amount: 89_000, currency: "JOD" }, status: "archived" });
  });
}

const draftInput = {
  branchId: "branch-a",
  sourceKind: "csv",
  sourceFileName: "legacy.csv",
  headers: ["Name", "Tel", "Sex", "Pkg"],
  columns: [
    summarizeImportColumn(0, "Name", ["Rana Odeh", "Mira Nasser", "Omar Haddad"]),
    summarizeImportColumn(1, "Tel", ["0798765432", "0798123456", "0797000000"]),
    summarizeImportColumn(2, "Sex", ["female", "female", "male"]),
    summarizeImportColumn(3, "Pkg", ["10 visits", "شهري", "Platinum"]),
  ],
  sourcePlanLabels: [{ label: "10 visits", rows: 1 }, { label: "شهري", rows: 1 }, { label: "Platinum", rows: 1 }],
};

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const ownerA = t.withIdentity({ subject: "clerk-owner-a" });
  const trainerA = t.withIdentity({ subject: "clerk-trainer-a" });
  const ownerB = t.withIdentity({ subject: "clerk-owner-b" });
  await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
  await ownerB.mutation(api.jev.updateTenantPreference, scoped("org-b", { enabled: true }));
  return { t, ownerA, trainerA, ownerB };
}

afterEach(() => vi.unstubAllEnvs());

describe("import assistance drafts", () => {
  it("needs member write access, keeps headings and shape counts only, and rejects oversized files", async () => {
    const { t, ownerA, trainerA } = await harness();
    await expectCode(trainerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)), "FORBIDDEN");
    const draft = await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)) as { id: string; headers: string[]; columns: Array<{ heading: string; phoneLike: number }>; sourcePlanLabels: Array<{ label: string }>; expiresAt: string };
    expect(draft.headers).toEqual(["Name", "Tel", "Sex", "Pkg"]);
    expect(draft.columns[1]).toMatchObject({ heading: "Tel", phoneLike: 3 });
    expect(draft.sourcePlanLabels.map((entry) => entry.label)).toEqual(["10 visits", "شهري", "Platinum"]);
    await t.run(async (ctx) => {
      const rows = (await ctx.db.query("domainRecords").collect()).filter((row) => row.entityType === "memberImportDraft");
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0]!.data)).not.toContain("0798765432");
      expect(JSON.stringify(rows[0]!.data)).not.toContain("Rana");
    });
    // A second save by the same person replaces the first draft.
    await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput));
    await t.run(async (ctx) => { expect((await ctx.db.query("domainRecords").collect()).filter((row) => row.entityType === "memberImportDraft")).toHaveLength(1); });
    await expectCode(ownerA.mutation(api.domain.mutate, operation("members.import.draft", { ...draftInput, columns: Array.from({ length: 101 }, (_, index) => summarizeImportColumn(index, `c${index}`, [])) })), "VALIDATION_ERROR");
    await expectCode(ownerA.mutation(api.domain.mutate, operation("members.import.draft", { ...draftInput, branchId: "branch-b" })), "NOT_FOUND");
  });

  it("suggests a column target from real fields and never a field that is already assigned", async () => {
    const { ownerA } = await harness();
    const draft = await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)) as { id: string };
    const first = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 1, assigned: "fullName,gender" } })) as JevJudgeResult;
    expect(first).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "phone" } });
    const second = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 1, assigned: "fullName,gender,phone" } })) as JevJudgeResult;
    expect(second.status).toBe("ready");
    if (second.status === "ready" && second.judgment.kind === "choice") {
      expect(second.judgment.choice).not.toBe("phone");
      expect(Object.keys(second.judgment.probabilities)).not.toContain("phone");
    }
    const arabic = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 3, assigned: "fullName,phone,gender" } })) as JevJudgeResult;
    expect(arabic).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "sourcePlanName" } });
    await expectCode(ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 9 } })), "NOT_FOUND");
  });

  it("matches legacy plan labels against the gym's current plans only, including Arabic labels and no-equivalent", async () => {
    const { t, ownerA } = await harness();
    const draft = await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)) as { id: string };
    const visits = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "10 visits" } })) as JevJudgeResult;
    expect(visits).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "plan-ten" } });
    if (visits.status === "ready" && visits.judgment.kind === "choice") expect(Object.keys(visits.judgment.probabilities)).not.toContain("plan-old");
    const monthly = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "شهري" } })) as JevJudgeResult;
    expect(monthly).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "plan-monthly" } });
    const none = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "Platinum" } })) as JevJudgeResult;
    expect(none).toMatchObject({ status: "ready", judgment: { kind: "choice", choice: "no_equivalent" } });
    await expectCode(ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "Not in file" } })), "NOT_FOUND");

    // A changed plan invalidates the cached answer: the archived plan is no longer offered.
    const cached = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "10 visits" } })) as JevJudgeResult;
    expect(cached).toMatchObject({ status: "ready", source: "cache" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").collect()).find((record) => record.entityType === "plan" && record.publicId === "plan-ten")!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Record<string, unknown>), status: "archived" } });
    });
    const afterChange = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.plan_match", subject: { draftId: draft.id, label: "10 visits" } })) as JevJudgeResult;
    expect(afterChange).toMatchObject({ status: "ready", source: "fixture" });
    if (afterChange.status === "ready" && afterChange.judgment.kind === "choice") expect(Object.keys(afterChange.judgment.probabilities)).not.toContain("plan-ten");
  });

  it("keeps drafts inside their gym and refuses expired ones", async () => {
    const { t, ownerA, ownerB } = await harness();
    const draft = await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)) as { id: string };
    await expectCode(ownerB.action(api.jevInference.judge, scoped("org-b", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 1 } })), "NOT_FOUND");
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").collect()).find((record) => record.entityType === "memberImportDraft")!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Record<string, unknown>), expiresAt: Date.now() - 1 } });
    });
    await expectCode(ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "import.column_target", subject: { draftId: draft.id, column: 1 } })), "NOT_FOUND");
  });

  it("records accepted suggestions on the preview and its audit entry without changing validation", async () => {
    const { t, ownerA } = await harness();
    const draft = await ownerA.mutation(api.domain.mutate, operation("members.import.draft", draftInput)) as { id: string };
    const preview = await ownerA.mutation(api.domain.mutate, operation("members.import.preview", {
      branchId: "branch-a",
      csv: "full_name,phone,gender,email\r\nRana Odeh,0791234567,female,rana@example.com",
      sourceHeaders: ["Name", "Tel", "Sex"],
      columnMapping: { fullName: 0, phone: 1, gender: 2 },
      assist: { draftId: draft.id, columns: ["phone", "not_a_field"], plans: ["10 visits"] },
    })) as { id: string; rows: Array<{ status: string }>; assist?: { draftId?: string; columns: string[]; plans: string[] } };
    expect(preview.rows).toEqual([expect.objectContaining({ status: "valid" })]);
    expect(preview.assist).toEqual({ draftId: draft.id, columns: ["phone"], plans: ["10 visits"] });
    expect(await ownerA.query(api.domain.query, operation("members.import.get", { importId: preview.id }))).toMatchObject({ assist: { columns: ["phone"], plans: ["10 visits"] } });
    await t.run(async (ctx) => {
      const audit = (await ctx.db.query("auditEvents").collect()).find((event) => event.action === "member.import_preview");
      expect(audit?.after).toMatchObject({ assistedColumns: ["phone"], assistedPlans: 1 });
    });
    const plain = await ownerA.mutation(api.domain.mutate, operation("members.import.preview", { branchId: "branch-a", csv: "full_name,phone,gender\r\nMira Nasser,0797778899,female" })) as { assist?: unknown };
    expect(plain.assist).toBeUndefined();
  });
});
