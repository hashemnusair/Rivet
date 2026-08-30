import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-import-${name}` });

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "import-org", name: "Import Gym", slug: "import-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", phoneCountryCallingCode: "+962", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "import-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { publicId: "import-owner", authSubject: "clerk-import-owner", email: "owner@import.test", fullName: "Import Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "plan", publicId: "import-plan", branchId, createdAt: now, updatedAt: now, data: { id: "import-plan", organizationId: "import-org", name: "Monthly", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 7, includedPtSessions: 0, status: "active" } });
  });
}

describe("member migration batches", () => {
  it("persists mapping provenance, resumes by cursor, reports history, and safely undoes untouched records", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-import-owner" });
    const preview = await owner.mutation(api.domain.mutate, operation("members.import.preview", {
      branchId: "import-branch",
      csv: "full_name,phone,email\r\nRana Odeh,0791234567,rana@example.com",
      sourceFileName: "legacy-members.xlsx",
      sourceKind: "xlsx",
      sourceHeaders: ["Customer", "Mobile", "E-mail"],
      columnMapping: { fullName: 0, phone: 1, email: 2 },
    })) as { id: string; rows: Array<{ status: string }>; sourceFileName: string };
    expect(preview).toMatchObject({ sourceFileName: "legacy-members.xlsx", rows: [{ status: "valid" }] });

    const committed = await owner.mutation(api.domain.mutate, operation("members.import.commit", { importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "import-commit-0001" })) as { status: string; committedCount: number; createdMemberIds: string[] };
    expect(committed).toMatchObject({ status: "completed", committedCount: 1 });
    expect(await owner.query(api.domain.query, operation("members.import.list"))).toEqual([expect.objectContaining({ id: preview.id, status: "completed", committedCount: 1 })]);
    expect(await owner.query(api.domain.query, operation("members.import.get", { importId: preview.id }))).toMatchObject({ rows: [expect.objectContaining({ status: "committed" })] });

    const undone = await owner.mutation(api.domain.mutate, operation("members.import.undo", { importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "import-undo-0001", reason: "Uploaded the wrong gym list" })) as { status: string; archivedCount: number; skippedCount: number };
    expect(undone).toEqual(expect.objectContaining({ status: "undone", archivedCount: 1, skippedCount: 0 }));
    const member = await owner.query(api.domain.query, operation("members.get", { memberId: committed.createdMemberIds[0] })) as { status: string };
    expect(member.status).toBe("archived");
  });

  it("imports a current term, opening receivable, freeze, and read-only payment evidence without fabricating payments", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-import-owner" });
    const preview = await owner.mutation(api.domain.mutate, operation("members.import.preview", {
      branchId: "import-branch",
      migrationCutoffDate: "2026-08-30",
      planMappings: { Monthly: "import-plan" },
      csv: "full_name,phone,email,source_plan_name,membership_start_date,membership_end_date,remaining_visits,freeze_start_date,freeze_end_date,opening_balance,historical_paid_total,historical_payment_date,historical_payment_reference\r\nMira Saleh,0797778899,mira@example.com,Monthly,2026-08-01,2026-10-07,,2026-08-28,2026-09-03,12.500,80.000,2026-08-20,OLD-44",
    })) as { id: string; rows: Array<{ status: string; openingBalanceMinor: number; historicalPaidMinor: number }>; membershipRows: number };
    expect(preview).toMatchObject({ membershipRows: 1, rows: [{ status: "valid", openingBalanceMinor: 12_500, historicalPaidMinor: 80_000 }] });

    const committed = await owner.mutation(api.domain.mutate, operation("members.import.commit", { importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "import-membership-0001" })) as { createdMemberIds: string[] };
    const memberId = committed.createdMemberIds[0]!;
    const records = await t.run(async (ctx) => await ctx.db.query("domainRecords").collect());
    expect(records.filter((record) => record.memberPublicId === memberId && record.entityType === "membership")).toHaveLength(1);
    expect(records.find((record) => record.memberPublicId === memberId && record.entityType === "charge")?.data).toMatchObject({ total: { amount: 12_500 }, migration: { kind: "opening_receivable", accountingPostingEligible: false } });
    expect(records.find((record) => record.memberPublicId === memberId && record.entityType === "migrationPaymentEvidence")?.data).toMatchObject({ amount: { amount: 80_000 }, sourceReference: "OLD-44", readOnly: true, accountingPostingEligible: false });
    expect(records.filter((record) => record.memberPublicId === memberId && ["payment", "receipt", "shift"].includes(record.entityType))).toHaveLength(0);

    const undone = await owner.mutation(api.domain.mutate, operation("members.import.undo", { importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "import-membership-undo-0001", reason: "Incorrect migration cutoff" })) as { archivedCount: number; skippedCount: number };
    expect(undone).toMatchObject({ archivedCount: 1, skippedCount: 0 });
    const afterUndo = await t.run(async (ctx) => await ctx.db.query("domainRecords").collect());
    expect(afterUndo.filter((record) => record.memberPublicId === memberId && ["membership", "charge", "migrationPaymentEvidence"].includes(record.entityType))).toHaveLength(0);
  });
});
