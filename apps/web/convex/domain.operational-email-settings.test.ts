import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (enabledKinds: string[], reason = "") => ({ operation: "settings.operationalEmail.update", input: { enabledKinds, reason }, correlationId: "cor-email-settings" });
const expectValidation = async (request: Promise<unknown>) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) }); };

async function seeded(initial: string[]) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "email-settings-org", name: "Email Settings Gym", slug: "email-settings", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "email-settings-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: "email-settings-owner", authSubject: "clerk-email-settings-owner", email: "owner@email-settings.example", fullName: "Email Settings Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: initial, updatedByUserId: ownerId, reason: "", createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-email-settings-owner" }) };
}

describe("operational email settings reason boundary", () => {
  it("allows enable-only and no-op updates without a reason", async () => {
    const { owner } = await seeded(["payment_receipt"]);
    await expect(owner.mutation(api.domain.mutate, operation(["payment_receipt", "trial_status"]))).resolves.toMatchObject({ enabledKinds: ["payment_receipt", "trial_status"] });
    await expect(owner.mutation(api.domain.mutate, operation(["payment_receipt", "trial_status"]))).resolves.toMatchObject({ enabledKinds: ["payment_receipt", "trial_status"] });
  });

  it("requires a reason for disable-only updates", async () => {
    const { owner } = await seeded(["payment_receipt", "trial_status"]);
    await expectValidation(owner.mutation(api.domain.mutate, operation(["payment_receipt"])));
    await expect(owner.mutation(api.domain.mutate, operation(["payment_receipt"], "The gym no longer sends trial status email"))).resolves.toMatchObject({ enabledKinds: ["payment_receipt"] });
  });

  it("requires a reason when a same-count swap disables a previous category", async () => {
    const { owner } = await seeded(["payment_receipt"]);
    await expectValidation(owner.mutation(api.domain.mutate, operation(["trial_status"])));
    await expect(owner.mutation(api.domain.mutate, operation(["trial_status"], "Replacing receipt email with trial status messages"))).resolves.toMatchObject({ enabledKinds: ["trial_status"] });
  });
});
