import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");
const request = (operation: string, input: Record<string, unknown> = {}) => ({
  operation,
  input,
  correlationId: `cor-platform-auth-${operation}`,
});

async function expectCode(requestPromise: Promise<unknown>, code: string) {
  await expect(requestPromise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", {
      publicId: "platform-auth-org",
      name: "Platform Auth Gym",
      slug: "platform-auth-gym",
      status: "active",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branch = await ctx.db.insert("branches", {
      organizationId: organization,
      publicId: "platform-auth-branch",
      name: "Main",
      code: "MAIN",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const owner = await ctx.db.insert("users", {
      publicId: "platform-auth-owner",
      authSubject: "clerk-platform-auth-owner",
      email: "owner@platform-auth.example",
      fullName: "Gym Owner",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: organization,
      userId: owner,
      role: "owner",
      branchIds: [branch],
      branchScope: "all",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("platform operation authorization", () => {
  it("rejects a gym owner from every platform query boundary", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-platform-auth-owner" });

    for (const operation of ["platform.applications", "platform.marketingMigration.preview", "platform.snapshot", "platform.gym.detail"]) {
      await expectCode(owner.query(api.domain.query, request(operation, operation === "platform.gym.detail" ? { gymId: "unknown" } : {})), "FORBIDDEN");
    }
  });

  it("rejects a gym owner from every platform mutation boundary before validation or resource lookup", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-platform-auth-owner" });
    const inputs: Record<string, Record<string, unknown>> = {
      "platform.marketingMigration.apply": { reason: "test" },
      "platform.application.note": { applicationId: "unknown", note: "test" },
      "platform.gym.update": { gymId: "unknown", status: "suspended", reason: "test" },
      "platform.plan.update": { name: "Growth", priceMinor: 1, branches: 1, staff: 1, members: 1 },
      "platform.invoice.create": { gymId: "unknown", amountMinor: 1, currency: "JOD", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueAt: "2026-09-01" },
      "platform.invoice.issue": { invoiceId: "unknown" },
      "platform.invoice.past_due": { invoiceId: "unknown", reason: "test" },
      "platform.invoice.payment": { invoiceId: "unknown", reference: "test", reason: "test" },
      "platform.invoice.void": { invoiceId: "unknown", reason: "test" },
      "platform.support.resolve": { caseId: "unknown", resolutionSummary: "test" },
      "platform.support.reply": { caseId: "unknown", body: "test" },
      "platform.support.reopen": { caseId: "unknown" },
      "platform.support.assign": { caseId: "unknown" },
    };

    for (const [operation, input] of Object.entries(inputs)) {
      await expectCode(owner.mutation(api.domain.mutate, request(operation, input)), "FORBIDDEN");
    }
  });
});
