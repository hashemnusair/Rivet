import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-trial-schedule-${name}` });
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

describe("trial schedule settings", () => {
  it("publishes validated branch/weekday times and rejects times outside operating hours", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = await ctx.db.insert("organizations", { publicId: "org-trials", name: "Trial Gym", slug: "trial-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-trials", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const owner = await ctx.db.insert("users", { publicId: "owner-trials", authSubject: "clerk-owner-trials", email: "owner@trials.example", fullName: "Trial Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "gym-trials", createdAt: now, updatedAt: now, data: { id: "gym-trials", targetOrganizationId: "org-trials", name: "Trial Gym", shortName: "TRIAL", isPublic: true, profilePublished: true, subscriptionStatus: "active", branches: [{ id: "directory-trials", internalBranchId: "branch-trials", name: "Main", area: "Amman", address: "Amman", trialSlots: ["legacy"] }] } });
    });
    const owner = t.withIdentity({ subject: "clerk-owner-trials" });
    const operatingDays = Object.fromEntries(weekdays.map((day) => [day, { enabled: day !== "fri", opensAt: "08:00", closesAt: "20:00" }]));
    const trialDays = Object.fromEntries(weekdays.map((day) => [day, { slots: day === "sun" ? ["09:00", "18:00"] : [] }]));

    await owner.mutation(api.domain.mutate, operation("settings.operationalPolicies", { operationalPolicies: {
      entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: true },
      membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 },
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
      operatingHours: [{ branchId: "branch-trials", days: operatingDays }],
      trialSchedules: [{ branchId: "branch-trials", days: trialDays }],
    } }));

    const publicGyms = await owner.query(api.domain.query, operation("public.marketplace")) as Array<{ branches: Array<{ trialSlots: string[]; trialSchedule: Record<string, { slots: string[] }> }> }>;
    expect(publicGyms[0]?.branches[0]).toMatchObject({ trialSlots: ["09:00", "18:00"], trialSchedule: { sun: { slots: ["09:00", "18:00"] }, fri: { slots: [] } } });

    const invalidDays = { ...trialDays, sun: { slots: ["07:30"] } };
    await expect(owner.mutation(api.domain.mutate, operation("settings.operationalPolicies", { operationalPolicies: {
      entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: true },
      membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 },
      personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 },
      operatingHours: [{ branchId: "branch-trials", days: operatingDays }],
      trialSchedules: [{ branchId: "branch-trials", days: invalidDays }],
    } }))).rejects.toThrow(/inside the branch's operating hours/);
  });
});
