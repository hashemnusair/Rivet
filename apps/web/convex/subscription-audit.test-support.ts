import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { termEnd } from "./subscriptionTerm";

const modules = import.meta.glob("./**/*.ts");
export const NOW = Date.parse("2026-10-10T12:00:00.000Z");
export const op = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `audit-${operation}` });
export const maxAddOns = { branch: 1, members: 3, staff: 3, operations: 1, finance: 1, reporting: 1 };

export async function auditGym(patch: Partial<Doc<"organizations">> = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const org = await ctx.db.insert("organizations", { publicId: "audit-org", name: "Audit Gym", slug: "audit-gym", status: "active", subscriptionPlan: "Basic", billingInterval: "monthly", currentPeriodEndsAt: termEnd(NOW, "monthly"), timezone: "UTC", currency: "JOD", createdAt: NOW, updatedAt: NOW, ...patch });
    const branch = await ctx.db.insert("branches", { organizationId: org, publicId: "audit-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("users", { publicId: "admin", authSubject: "admin", email: "admin@example.test", fullName: "Admin", platformAdmin: true, status: "active", createdAt: NOW, updatedAt: NOW });
    for (const role of ["owner", "manager", "receptionist"] as const) {
      const user = await ctx.db.insert("users", { publicId: role, authSubject: role, email: `${role}@example.test`, fullName: role, platformAdmin: false, status: "active", createdAt: NOW, updatedAt: NOW });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: user, role, branchIds: [branch], active: true, branchScope: "all", invitationStatus: "accepted", createdAt: NOW, updatedAt: NOW });
    }
    await ctx.db.insert("domainRecords", { organizationId: org, entityType: "marketplaceGym", publicId: "audit-gym", createdAt: NOW, updatedAt: NOW, data: { id: "audit-gym", name: "Audit Gym", targetOrganizationId: "audit-org", rivetPlan: patch.subscriptionPlan ?? "Basic", subscriptionStatus: patch.status ?? "active", isPublic: false } });
    return { org, branch };
  });
  const admin = t.withIdentity({ subject: "admin" });
  const owner = t.withIdentity({ subject: "owner" });
  const state = () => t.run(async ctx => ({ organizations: await ctx.db.query("organizations").collect(), records: await ctx.db.query("domainRecords").collect(), entitlements: await ctx.db.query("organizationEntitlements").collect(), preferences: await ctx.db.query("workspaceModulePreferences").collect(), audits: await ctx.db.query("platformAuditEvents").collect(), notifications: await ctx.db.query("operationalNotifications").collect() }));
  const invoice = (id: string, data: Record<string, unknown> = {}) => t.run(ctx => ctx.db.insert("domainRecords", { organizationId: ids.org, entityType: "platformInvoice", publicId: id, createdAt: NOW, updatedAt: NOW, data: { id, gymId: "audit-gym", gym: "Audit Gym", status: "open", amountMinor: 49_000, currency: "JOD", cycleKey: `subscription:${id}`, periodStart: new Date(NOW).toISOString(), periodEnd: new Date(termEnd(NOW, "monthly")).toISOString(), billingInterval: "monthly", ...data } }));
  const update = (input: Record<string, unknown>) => admin.mutation(api.domain.mutate, op("platform.gym.update", { gymId: "audit-gym", reason: "Owner approved subscription correction", ...input }));
  return { t, ...ids, admin, owner, state, invoice, update };
}
