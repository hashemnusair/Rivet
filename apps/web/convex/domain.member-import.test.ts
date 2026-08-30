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
});
