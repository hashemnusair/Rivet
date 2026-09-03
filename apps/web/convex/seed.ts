import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { organizationRole } from "./schema";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSION_CATALOG_VERSION, rolePermissions } from "./permissions";
import { defaultWorkspacePreferences, entitledModulesForPlan, validateWorkspaceModuleSelection, WORKSPACE_MODULE_CATALOG_VERSION } from "./workspaceModules";

function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return target.getTime();
}

/**
 * Seeds the Forge Fitness demo tenant as real Convex records: the organization,
 * its two Amman branches, the four staff members and the two customers that the
 * frontend previously hard-coded.
 *
 * These users are created *unclaimed* — their `authSubject` is a placeholder
 * rather than a Clerk subject, because no Clerk account exists for them. The
 * first person to sign in with the matching email claims the record and inherits
 * its role (see `users.ensureCurrent`), which is how an invited staff member
 * joins in a real deployment.
 *
 * Internal on purpose: the deployment is public, so seeding is something the
 * owner runs from the Convex dashboard, not something the web app can trigger.
 * Running it twice is safe — every write is keyed and patched rather than
 * duplicated.
 */
export const seedDemoTenant = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const seedSubscriptionStartedAt = now - 12 * 86_400_000;
    const seedCurrentPeriodEndsAt = addCalendarMonths(seedSubscriptionStartedAt, 1);

    // --- organization -------------------------------------------------------
    const slug = "forge-fitness";
    const organization: Doc<"organizations"> | null = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    let organizationId: Id<"organizations">;
    if (organization) {
      organizationId = organization._id;
      await ctx.db.patch(organizationId, {
        publicId: "10000000-0000-4a00-8a00-000000000001",
        locale: "en-JO",
        phoneCountryCallingCode: "962",
        defaultLanguage: "en",
        taxRatePercent: 0,
        receiptPrefix: "RV",
        nextReceiptNumber: organization.nextReceiptNumber ?? 1001,
        receiptFooter: "Thank you for training with RIVET.",
        // Billing facts are tenant-owned. Repair only fields that are absent
        // on an existing demo record so a real lifecycle is never reset by a
        // subsequent seed run.
        ...(organization.subscriptionPlan === undefined ? { subscriptionPlan: "Pro" as const } : {}),
        ...(organization.billingInterval === undefined ? { billingInterval: "monthly" as const } : {}),
        ...(organization.status === "active" && organization.subscriptionStartedAt === undefined ? { subscriptionStartedAt: seedSubscriptionStartedAt } : {}),
        ...(organization.status === "active" && organization.currentPeriodEndsAt === undefined
          ? { currentPeriodEndsAt: addCalendarMonths(organization.subscriptionStartedAt ?? seedSubscriptionStartedAt, organization.billingInterval === "annual" ? 12 : 1) }
          : {}),
        updatedAt: now,
      });
    } else {
      organizationId = await ctx.db.insert("organizations", {
        publicId: "10000000-0000-4a00-8a00-000000000001",
        name: "Forge Fitness Club",
        slug,
        status: "active",
        timezone: "Asia/Amman",
        currency: "JOD",
        locale: "en-JO",
        phoneCountryCallingCode: "962",
        defaultLanguage: "en",
        subscriptionPlan: "Pro",
        billingInterval: "monthly",
        subscriptionStartedAt: seedSubscriptionStartedAt,
        currentPeriodEndsAt: seedCurrentPeriodEndsAt,
        taxRatePercent: 0,
        receiptPrefix: "RV",
        nextReceiptNumber: 1001,
        receiptFooter: "Thank you for training with RIVET.",
        createdAt: now,
        updatedAt: now,
      });
    }

    // --- branches -----------------------------------------------------------
    const branchSeeds = [
      { code: "ABD", name: "Forge — Abdoun", address: "Salah Al-Suheimat St 12, Abdoun" },
      { code: "SWF", name: "Forge — Sweifieh", address: "Ali Nasuh Al-Tahir St 7, Sweifieh" },
    ];

    const branchIds: Id<"branches">[] = [];
    for (const branch of branchSeeds) {
      const existing = await ctx.db
        .query("branches")
        .withIndex("by_organization_code", (q) => q.eq("organizationId", organizationId).eq("code", branch.code))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { publicId: branch.code === "ABD" ? "10000000-0000-4a00-8a00-000000000002" : "10000000-0000-4a00-8a00-000000000003", name: branch.name, address: branch.address, phone: "+962 6 555 0100", capacity: 180, active: true, status: "active", updatedAt: now });
        branchIds.push(existing._id);
      } else {
        branchIds.push(
          await ctx.db.insert("branches", {
            publicId: branch.code === "ABD" ? "10000000-0000-4a00-8a00-000000000002" : "10000000-0000-4a00-8a00-000000000003",
            organizationId,
            name: branch.name,
            code: branch.code,
            address: branch.address,
            phone: "+962 6 555 0100",
            capacity: 180,
            active: true,
            status: "active",
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    }
    const [abdoun] = branchIds as [Id<"branches">];

    // --- people -------------------------------------------------------------
    const staff = [
      { email: "omar@forgefitness.jo", fullName: "Omar Al-Khatib", role: "owner" as const, branches: branchIds },
      { email: "layla@forgefitness.jo", fullName: "Layla Haddad", role: "manager" as const, branches: branchIds },
      { email: "sara@forgefitness.jo", fullName: "Sara Abuhamdan", role: "sales" as const, branches: branchIds },
      { email: "hala@forgefitness.jo", fullName: "Hala Qasem", role: "receptionist" as const, branches: [abdoun] },
    ];

    // Customers hold no organization membership — that is what makes them
    // members rather than staff when they sign in.
    const customers = [
      { email: "lina@example.com", fullName: "Lina Haddad" },
      { email: "yousef@example.com", fullName: "Yousef Nasser" },
    ];

    const upsertUser = async (email: string, fullName: string) => {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          publicId: existing.publicId ?? seedPublicId(email),
          // Migrate the old demo placeholder prefix without touching a real
          // Clerk subject that may already have claimed this row.
          authSubject: existing.authSubject.startsWith("invite:") ? `seed:${email}` : existing.authSubject,
          fullName,
          status: existing.status ?? "active",
          updatedAt: now,
        });
        return existing._id;
      }
      return await ctx.db.insert("users", {
        publicId: seedPublicId(email),
        // Development fixture identity. Real invitation placeholders use the
        // distinct invite: prefix and can only be promoted by the verified
        // Clerk ticket claim action.
        authSubject: `seed:${email}`,
        email,
        fullName,
        platformAdmin: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    };

    for (const person of staff) {
      const userId = await upsertUser(person.email, person.fullName);
      const existing = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { role: person.role, branchIds: person.branches, branchScope: person.role === "owner" || person.role === "manager" ? "all" : "selected", active: true, invitationStatus: "accepted", updatedAt: now });
      } else {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role: person.role,
          branchIds: person.branches,
          branchScope: person.role === "owner" || person.role === "manager" ? "all" : "selected",
          active: true,
          invitationStatus: "accepted",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const person of customers) await upsertUser(person.email, person.fullName);

    // --- reference data and a compact, deterministic operating scenario ----
    for (const [role, definition] of Object.entries(DEFAULT_ROLE_DEFINITIONS) as Array<["owner" | "manager" | "sales" | "receptionist" | "trainer", (typeof DEFAULT_ROLE_DEFINITIONS)["owner"]]>) {
      const existing = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", organizationId).eq("role", role)).unique();
      const value = { label: definition.label, description: definition.description, permissions: definition.permissions, catalogVersion: PERMISSION_CATALOG_VERSION, discountLimitMinor: definition.discountLimitMinor, isSystem: true, updatedAt: now };
      if (existing) await ctx.db.patch(existing._id, { ...value, permissions: rolePermissions(role, existing.permissions, existing.catalogVersion), discountLimitMinor: existing.discountLimitMinor });
      else await ctx.db.insert("roleDefinitions", { organizationId, role, ...value, createdAt: now });
    }

    // Preserve the legacy Forge tenant while making the new server-owned
    // entitlement/preference records explicit and idempotent.
    const ownerMembership = (await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect()).find((membership) => membership.active && membership.role === "owner");
    if (ownerMembership) {
      const entitledModules = entitledModulesForPlan();
      const entitlement = await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
      if (entitlement) await ctx.db.patch(entitlement._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: undefined, entitledModules, source: "legacy_default", updatedAt: now });
      else await ctx.db.insert("organizationEntitlements", { organizationId, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, entitledModules, source: "legacy_default", createdAt: now, updatedAt: now });
      const preferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
      const storedModules = preferences?.enabledModules.filter((module): module is typeof entitledModules[number] => entitledModules.includes(module as typeof entitledModules[number])) ?? [];
      let enabledModules = storedModules;
      try { enabledModules = validateWorkspaceModuleSelection(storedModules, entitledModules); } catch { enabledModules = defaultWorkspacePreferences(entitledModules); }
      if (preferences) await ctx.db.patch(preferences._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: ownerMembership.userId, updatedAt: now });
      else await ctx.db.insert("workspaceModulePreferences", { organizationId, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: ownerMembership.userId, createdAt: now, updatedAt: now });
    }

    const upsertDomain = async (entityType: string, publicId: string, value: Record<string, unknown>, branchId?: Id<"branches">, memberPublicId?: string, leadPublicId?: string) => {
      const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", entityType).eq("publicId", publicId)).unique();
      const data = { ...value, id: publicId, organizationId: "10000000-0000-4a00-8a00-000000000001" };
      if (existing) await ctx.db.patch(existing._id, { data, branchId, memberPublicId, leadPublicId, updatedAt: now });
      else await ctx.db.insert("domainRecords", { organizationId, entityType, publicId, branchId, memberPublicId, leadPublicId, createdAt: now, updatedAt: now, data });
    };

    const abdounPublicId = "10000000-0000-4a00-8a00-000000000002";
    const sweifiehPublicId = "10000000-0000-4a00-8a00-000000000003";
    const planMonthly = "10000000-0000-4a00-8a00-000000000030";
    const planVisits = "10000000-0000-4a00-8a00-000000000035";
    const memberLina = "10000000-0000-4a00-8a00-000000000200";
    const memberRami = "10000000-0000-4a00-8a00-000000000201";
    const memberNour = "10000000-0000-4a00-8a00-000000000202";
    const membershipLina = "10000000-0000-4a00-8a00-000000000300";
    const membershipRami = "10000000-0000-4a00-8a00-000000000301";
    const membershipNour = "10000000-0000-4a00-8a00-000000000302";
    const chargeLina = "10000000-0000-4a00-8a00-000000000400";
    const chargeRami = "10000000-0000-4a00-8a00-000000000401";
    const receiptSeed = "10000000-0000-4a00-8a00-000000000600";
    const paymentSeed = "10000000-0000-4a00-8a00-000000000500";
    const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    await upsertDomain("settings", "settings", { paymentMethods: [{ key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true }, { key: "card", label: "Card", enabled: true, affectsCashDrawer: false }, { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false }, { key: "cliq", label: "CliQ", enabled: true, affectsCashDrawer: false }, { key: "other", label: "Other", enabled: false, affectsCashDrawer: false }], notifications: { managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true }, automationDeliveryMode: "sandbox", quietHoursStart: "22:00", quietHoursEnd: "08:00" } });
    await upsertDomain("plan", planMonthly, { name: "Monthly All Access", code: "MTH", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 30, status: "active" });
    await upsertDomain("plan", planVisits, { name: "10 Visit Pass", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 90, basePrice: { amount: 75_000, currency: "JOD" }, branchAccess: "selected", branchIds: [abdounPublicId], freezeAllowanceDays: 0, status: "active" });
    await upsertDomain("member", memberLina, { fullName: "Lina Haddad", fullNameAr: "لينا حداد", memberNumber: "ABD-2214", phone: "+962 79 440 2211", email: "lina@example.com", homeBranchId: abdounPublicId, status: "active", tags: ["renewal"], preferredLanguage: "en", marketingOptIn: true, notes: "Prefers evening sessions.", createdAt: new Date(Date.now() - 120 * 86_400_000).toISOString() }, abdoun);
    await upsertDomain("member", memberRami, { fullName: "Rami Tahboub", memberNumber: "SWF-1840", phone: "+962 78 510 8831", email: "rami@example.com", homeBranchId: sweifiehPublicId, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: new Date(Date.now() - 80 * 86_400_000).toISOString() }, branchIds[1]);
    await upsertDomain("member", memberNour, { fullName: "Nour Abu Eid", memberNumber: "ABD-1841", phone: "+962 79 333 1212", email: "nour@example.com", homeBranchId: abdounPublicId, status: "active", tags: ["student"], preferredLanguage: "ar", marketingOptIn: false, createdAt: new Date(Date.now() - 50 * 86_400_000).toISOString() }, abdoun);
    await upsertDomain("membership", membershipLina, { memberId: memberLina, planId: planMonthly, homeBranchId: abdounPublicId, startDate: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10), endDate: plus(8), salePrice: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, discountApprovalStatus: "none", soldById: seedPublicId("sara@forgefitness.jo"), frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }, abdoun, memberLina);
    await upsertDomain("membership", membershipRami, { memberId: memberRami, planId: planMonthly, homeBranchId: sweifiehPublicId, startDate: new Date(Date.now() - 65 * 86_400_000).toISOString().slice(0, 10), endDate: new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10), salePrice: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, discountApprovalStatus: "none", soldById: seedPublicId("sara@forgefitness.jo"), frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(Date.now() - 65 * 86_400_000).toISOString() }, branchIds[1], memberRami);
    await upsertDomain("membership", membershipNour, { memberId: memberNour, planId: planVisits, homeBranchId: abdounPublicId, startDate: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), endDate: plus(80), totalVisits: 10, remainingVisits: 4, salePrice: { amount: 75_000, currency: "JOD" }, discount: { amount: 5_000, currency: "JOD" }, discountReason: "Student rate", discountApprovalStatus: "approved", soldById: seedPublicId("sara@forgefitness.jo"), frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString() }, abdoun, memberNour);
    await upsertDomain("charge", chargeLina, { memberId: memberLina, membershipId: membershipLina, description: "Monthly All Access membership", subtotal: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, tax: { amount: 0, currency: "JOD" }, total: { amount: 40_000, currency: "JOD" }, paidAmount: { amount: 25_000, currency: "JOD" }, outstandingAmount: { amount: 15_000, currency: "JOD" }, status: "partial", createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }, abdoun, memberLina);
    await upsertDomain("charge", chargeRami, { memberId: memberRami, membershipId: membershipRami, description: "Monthly All Access membership", subtotal: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, tax: { amount: 0, currency: "JOD" }, total: { amount: 40_000, currency: "JOD" }, paidAmount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount: 40_000, currency: "JOD" }, status: "unpaid", createdAt: new Date(Date.now() - 65 * 86_400_000).toISOString() }, branchIds[1], memberRami);
    await upsertDomain("payment", paymentSeed, { branchId: abdounPublicId, memberId: memberLina, chargeId: chargeLina, type: "payment", amount: { amount: 25_000, currency: "JOD" }, method: "card", status: "completed", receiptId: receiptSeed, receiptNumber: "RV-001000", collectedById: seedPublicId("sara@forgefitness.jo"), collectedByName: "Sara Abuhamdan", idempotencyKey: "seed-payment-lina", occurredAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }, abdoun, memberLina);
    await upsertDomain("receipt", receiptSeed, { receiptNumber: "RV-001000", paymentId: paymentSeed, issuedAt: new Date(Date.now() - 20 * 86_400_000).toISOString() }, abdoun, memberLina);
    await upsertDomain("checkIn", "10000000-0000-4a00-8a00-000000000700", { memberId: memberLina, memberName: "Lina Haddad", memberNumber: "ABD-2214", branchId: abdounPublicId, branchName: "Forge — Abdoun", decision: "allowed", reasonCodes: ["OK"], actorId: seedPublicId("hala@forgefitness.jo"), actorName: "Hala Qasem", occurredAt: new Date(Date.now() - 3 * 3_600_000).toISOString() }, abdoun, memberLina);
    await upsertDomain("lead", "10000000-0000-4a00-8a00-000000000800", { branchId: abdounPublicId, fullName: "Maya Odeh", phone: "+962 79 882 1402", email: "maya@example.com", stage: "trial_booked", source: "instagram", ownerId: seedPublicId("sara@forgefitness.jo"), expectedValue: { amount: 40_000, currency: "JOD" }, nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(), notes: "Free trial booked through RIVET.", createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), updatedAt: new Date(now).toISOString() }, abdoun, undefined, "10000000-0000-4a00-8a00-000000000800");
    await upsertDomain("messageTemplate", "10000000-0000-4a00-8a00-000000000900", { name: "Renewal reminder", channel: "whatsapp", bodyEn: "Hi {{memberName}}, your membership renews soon.", bodyAr: "مرحباً {{memberName}}، عضويتك على وشك الانتهاء.", variables: ["memberName", "endDate"] });
    await upsertDomain("automationRule", "10000000-0000-4a00-8a00-000000000901", { name: "Renewals — 7 days", trigger: "membership_expiring", triggerParams: { daysBefore: [7] }, actions: [{ key: "create_task", taskOwnerRole: "salesperson", taskTitle: "Call member about renewal" }], enabled: true, dedupeWindowHours: 24, executionsLast30Days: 0, updatedAt: new Date().toISOString() });

    // --- public directory and consumer records ----------------------------
    // Directory rows contain only explicitly public fields. Private tenant
    // records remain in their organization scope and are never returned by
    // public.marketplace.
    const directory = [
      { id: "forge-fitness", name: "Forge Fitness Club", shortName: "FORGE", tagline: "Strength, conditioning, and a floor that remembers your name.", description: "A serious but welcoming training club with two Amman branches, coached small groups, open gym, and practical plans for people who train consistently.", city: "Amman", areas: ["Abdoun", "Sweifieh"], category: "Strength & conditioning", audience: "All members", rating: 4.9, reviewCount: 184, memberCount: 1050, branchCount: 2, fromPriceMinor: 40_000, amenities: ["Free weights", "Functional zone", "Showers", "Parking", "Personal training"], accent: "#d9232b", featured: true, subscriptionStatus: "active", rivetPlan: "Pro", joinedAt: "2026-04-18", lastActiveAt: new Date().toISOString(), monthlyRevenueMinor: 48_750_000, targetOrganizationId: "10000000-0000-4a00-8a00-000000000001", branches: [{ id: "forge-abdoun", name: "Forge — Abdoun", area: "Abdoun", address: "Salah Al-Suheimat St 12, Abdoun", trialSlots: ["08:00", "17:00", "19:00"], internalBranchId: abdounPublicId }, { id: "forge-sweifieh", name: "Forge — Sweifieh", area: "Sweifieh", address: "Ali Nasuh Al-Tahir St 7, Sweifieh", trialSlots: ["09:00", "18:00", "20:00"], internalBranchId: sweifiehPublicId }] },
      { id: "pulse-lab", name: "Pulse Lab", shortName: "PULSE", tagline: "Coach-led performance without the intimidation.", description: "Small-group strength, conditioning, and recovery sessions for busy professionals who want structure, coaching, and measurable progress.", city: "Amman", areas: ["Dabouq"], category: "Boutique performance", audience: "All members", rating: 4.8, reviewCount: 96, memberCount: 420, branchCount: 1, fromPriceMinor: 55_000, amenities: ["Coach-led classes", "Recovery room", "Mobility zone", "Parking"], accent: "#176e44", featured: true, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: "2026-05-06", lastActiveAt: new Date().toISOString(), monthlyRevenueMinor: 29_400_000, targetOrganizationId: "directory:pulse-lab", branches: [{ id: "pulse-dabouq", name: "Pulse Lab — Dabouq", area: "Dabouq", address: "King Abdullah II St, Dabouq", trialSlots: ["07:30", "18:30", "20:00"] }] },
      { id: "her-house", name: "Her House Fitness", shortName: "HER HOUSE", tagline: "A women-only club built around strength and privacy.", description: "Women-only training, studio classes, strength equipment, and personal coaching with private facilities and flexible morning and evening schedules.", city: "Amman", areas: ["Khalda", "Shmeisani"], category: "Women-only fitness", audience: "Women only", rating: 4.9, reviewCount: 231, memberCount: 1380, branchCount: 2, fromPriceMinor: 45_000, amenities: ["Women only", "Studio classes", "Sauna", "Child-friendly hours", "Parking"], accent: "#8d4f68", featured: true, subscriptionStatus: "active", rivetPlan: "Pro", joinedAt: "2026-03-11", lastActiveAt: new Date().toISOString(), monthlyRevenueMinor: 62_900_000, targetOrganizationId: "directory:her-house", branches: [{ id: "her-khalda", name: "Her House — Khalda", area: "Khalda", address: "Wasfi Al Tal St, Khalda", trialSlots: ["10:00", "16:00", "18:00"] }, { id: "her-shmeisani", name: "Her House — Shmeisani", area: "Shmeisani", address: "Queen Noor St, Shmeisani", trialSlots: ["09:30", "17:30", "19:30"] }] },
      { id: "district-strength", name: "District Strength", shortName: "DISTRICT", tagline: "Barbells, community, and zero wasted motion.", description: "An independent strength gym for lifters and first-timers, with coached fundamentals, powerlifting equipment, and straightforward memberships.", city: "Amman", areas: ["Jabal Amman"], category: "Independent strength gym", audience: "All members", rating: 4.7, reviewCount: 73, memberCount: 310, branchCount: 1, fromPriceMinor: 32_000, amenities: ["Powerlifting", "Olympic lifting", "Coaching", "Locker rooms"], accent: "#96620a", featured: false, subscriptionStatus: "trial", rivetPlan: "Starter", joinedAt: "2026-07-22", lastActiveAt: new Date().toISOString(), monthlyRevenueMinor: 13_850_000, targetOrganizationId: "directory:district-strength", branches: [{ id: "district-jabal-amman", name: "District — Jabal Amman", area: "Jabal Amman", address: "Rainbow St, Jabal Amman", trialSlots: ["08:30", "17:30", "19:30"] }] },
    ];
    for (const gym of directory) await upsertDomain("marketplaceGym", gym.id, { ...gym, isPublic: true });
    const upsertCustomerProfile = async (publicId: string, value: { userId: string; name: string; nameAr: string; email: string; phone: string; initials: string; context: string }) => {
      const existing = await ctx.db.query("customerProfiles").withIndex("by_public_id", (q) => q.eq("publicId", publicId)).unique();
      if (existing) await ctx.db.patch(existing._id, { ...value, updatedAt: now });
      else await ctx.db.insert("customerProfiles", { publicId, ...value, createdAt: now, updatedAt: now });
    };
    await upsertCustomerProfile("customer-lina", { userId: seedPublicId("lina@example.com"), name: "Lina Haddad", nameAr: "لينا حداد", email: "lina@example.com", phone: "+962 79 440 2211", initials: "LH", context: "Active at Forge Fitness" });
    await upsertCustomerProfile("customer-yousef", { userId: seedPublicId("yousef@example.com"), name: "Yousef Nasser", nameAr: "يوسف ناصر", email: "yousef@example.com", phone: "+962 78 441 9033", initials: "YN", context: "Looking for a gym" });
    await upsertDomain("customerMembership", "membership-lina-forge", { customerUserId: seedPublicId("lina@example.com"), customerId: "customer-lina", gymId: "forge-fitness", branchId: "forge-abdoun", memberNumber: "ABD-2214", planName: "6-Month All Access", status: "expiring", startDate: "2026-02-09", endDate: "2026-08-12", visitsThisMonth: 14, balanceMinor: 0, qrValue: "rivet://entry/forge-fitness/ABD-2214/customer-lina", lastCheckInAt: "2026-07-30T19:12:00+03:00" }, abdoun);
    await upsertDomain("trialBooking", "trial-1001", { gymId: "pulse-lab", branchId: "pulse-dabouq", fullName: "Maya Odeh", email: "maya@example.com", phone: "+962 79 882 1402", preferredDate: "2026-08-02", preferredTime: "18:30", goal: "Build strength with coaching", status: "confirmed", createdAt: "2026-07-31T10:12:00+03:00" });
    await upsertDomain("trialBooking", "trial-1002", { gymId: "forge-fitness", branchId: "forge-abdoun", fullName: "Rami Tahboub", email: "rami@example.com", phone: "+962 78 510 8831", preferredDate: "2026-08-01", preferredTime: "19:00", goal: "Return to training after a long break", status: "requested", createdAt: "2026-07-31T12:35:00+03:00" }, abdoun);
    for (const invoice of [
      { id: "RV-1048", gymId: "pulse-lab", gym: "Pulse Lab", amount: "JD 149.000", date: "31 Jul 2026", status: "failed" },
      { id: "RV-1047", gymId: "her-house", gym: "Her House Fitness", amount: "JD 249.000", date: "28 Jul 2026", status: "paid" },
      { id: "RV-1046", gymId: "forge-fitness", gym: "Forge Fitness Club", amount: "JD 249.000", date: "18 Jul 2026", status: "paid" },
      { id: "RV-1045", gymId: "district-strength", gym: "District Strength", amount: "JD 0.000", date: "5 Jul 2026", status: "trial" },
      { id: "RV-1044", gymId: "pulse-lab", gym: "Pulse Lab", amount: "JD 149.000", date: "30 Jun 2026", status: "paid" },
    ]) await upsertDomain("platformInvoice", invoice.id, invoice);
    for (const supportCase of [
      { id: "SUP-218", gymId: "pulse-lab", gym: "Pulse Lab", subject: "Payment retry failed", age: "18m", priority: "urgent", status: "open" },
      { id: "SUP-217", gymId: "forge-fitness", gym: "Forge Fitness", subject: "New staff permission question", age: "1h", priority: "normal", status: "open" },
      { id: "SUP-216", gymId: "district-strength", gym: "District Strength", subject: "Member import formatting", age: "3h", priority: "normal", status: "waiting" },
      { id: "SUP-214", gymId: "her-house", gym: "Her House", subject: "Add a Shmeisani kiosk", age: "1d", priority: "normal", status: "open" },
    ]) await upsertDomain("supportCase", supportCase.id, supportCase);
    for (const plan of [
      { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
      { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
      { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
      { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" },
    ]) await upsertDomain("platformPlan", plan.name, plan);
    for (const [key, nextValue] of [["member:ABD", 2300], ["member:SWF", 1900]] as const) {
      const existing = await ctx.db.query("sequenceCounters").withIndex("by_organization_key", (q) => q.eq("organizationId", organizationId).eq("key", key)).unique();
      if (existing) await ctx.db.patch(existing._id, { nextValue: Math.max(existing.nextValue, nextValue), updatedAt: now });
      else await ctx.db.insert("sequenceCounters", { organizationId, key, nextValue, updatedAt: now });
    }

    return {
      organizationId,
      branches: branchIds.length,
      staff: staff.length,
      customers: customers.length,
    };
  },
});

function seedPublicId(key: string): string {
  const ids: Record<string, string> = {
    "omar@forgefitness.jo": "10000000-0000-4a00-8a00-000000000010",
    "layla@forgefitness.jo": "10000000-0000-4a00-8a00-000000000011",
    "sara@forgefitness.jo": "10000000-0000-4a00-8a00-000000000013",
    "hala@forgefitness.jo": "10000000-0000-4a00-8a00-000000000016",
    "lina@example.com": "10000000-0000-4a00-8a00-000000000100",
    "yousef@example.com": "10000000-0000-4a00-8a00-000000000101",
  };
  return ids[key] ?? `10000000-0000-4a00-8a00-${key.length.toString(16).padStart(12, "0")}`;
}

/**
 * Grants platform administration to a user by email. The owner runs this from
 * the Convex dashboard; it is deliberately unreachable from the web app, so a
 * public deployment cannot be used to escalate into the platform console.
 */
/**
 * Finds a user by email, or by Clerk subject when the JWT template omits the
 * email claim and the stored email is therefore blank.
 */
async function findUser(ctx: MutationCtx, args: { email?: string; authSubject?: string }) {
  if (args.authSubject) {
    const bySubject = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject!))
      .unique();
    if (bySubject) return bySubject;
  }
  if (args.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email!))
      .unique();
    if (byEmail) return byEmail;
  }
  throw new Error(
    `No user matched ${JSON.stringify(args)}. Sign in once first, or seed the tenant. ` +
      "If the email is blank in the users table, add `email` and `name` claims to the Clerk JWT template for Convex.",
  );
}

/**
 * Grants platform administration. The owner runs this from the Convex dashboard
 * or CLI; it is deliberately unreachable from the web app, so a public
 * deployment cannot be used to escalate into the platform console.
 */
export const grantPlatformAdmin = internalMutation({
  args: { email: v.optional(v.string()), authSubject: v.optional(v.string()), platformAdmin: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args);
    const platformAdmin = args.platformAdmin ?? true;
    await ctx.db.patch(user._id, { platformAdmin, updatedAt: Date.now() });
    return { email: user.email, authSubject: user.authSubject, platformAdmin };
  },
});

/**
 * Puts a user on a gym's staff, or changes the role they already hold. Also
 * dashboard-only, for the same reason.
 */
export const grantOrganizationRole = internalMutation({
  args: {
    email: v.optional(v.string()),
    authSubject: v.optional(v.string()),
    organizationSlug: v.string(),
    role: organizationRole,
    branchCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args);

    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.organizationSlug))
      .unique();
    if (!organization) throw new Error(`No organization with slug ${args.organizationSlug}.`);

    const allBranches = await ctx.db
      .query("branches")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();

    // No branch codes means every branch, which is what owners and managers get.
    const branchIds = args.branchCodes
      ? allBranches.filter((branch) => args.branchCodes!.includes(branch.code)).map((branch) => branch._id)
      : allBranches.map((branch) => branch._id);

    const now = Date.now();
    const existing = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, branchIds, active: true, updatedAt: now });
    } else {
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization._id,
        userId: user._id,
        role: args.role,
        branchIds,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { email: user.email, organization: organization.name, role: args.role, branches: branchIds.length };
  },
});
