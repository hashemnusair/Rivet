import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (notifications: Record<string, unknown>) => ({ operation: "settings.notifications", input: { notifications }, correlationId: "cor-renewal-settings" });

describe("renewal recovery settings authorization", () => {
  it("lets an authorized owner enable the gate and denies a receptionist", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.insert("organizations", { publicId: "renewal-settings-org", name: "Renewal Settings Gym", slug: "renewal-settings", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "renewal-settings-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const owner = await ctx.db.insert("users", { publicId: "renewal-settings-owner", authSubject: "clerk-renewal-settings-owner", email: "owner@renewal-settings.example", fullName: "Renewal Settings Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const receptionist = await ctx.db.insert("users", { publicId: "renewal-settings-reception", authSubject: "clerk-renewal-settings-reception", email: "reception@renewal-settings.example", fullName: "Renewal Settings Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionist, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", notifications: { quietHoursStart: "22:00", quietHoursEnd: "08:00" } } });
    });

    const owner = t.withIdentity({ subject: "clerk-renewal-settings-owner" });
    const receptionist = t.withIdentity({ subject: "clerk-renewal-settings-reception" });
    await expect(owner.mutation(api.domain.mutate, operation({ quietHoursStart: "22:00", quietHoursEnd: "08:00", renewalRecoveryEnabled: true }))).resolves.toMatchObject({ notifications: { renewalRecoveryEnabled: true } });
    await expect(owner.query(api.domain.query, { operation: "settings.get", input: {}, correlationId: "cor-renewal-settings-read" })).resolves.toMatchObject({ notifications: { renewalRecoveryEnabled: true } });
    await expect(receptionist.mutation(api.domain.mutate, operation({ quietHoursStart: "22:00", quietHoursEnd: "08:00", renewalRecoveryEnabled: true }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });
});
