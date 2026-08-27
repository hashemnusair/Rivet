import { v } from "convex/values";
import { mutation as convexMutation, query as convexQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  domainError,
  hasPermission,
  publicBranchId,
  publicOrganizationId,
  publicUserId,
  requireActor,
  requireAuthenticated,
  requireMember,
  requirePermission,
  requirePlatformAdmin,
  requireReason,
  type ActorContext,
  type OrganizationRole,
  type RequestArgs,
} from "./security";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSIONS, PERMISSION_CATALOG_VERSION, roleDiscountLimit, rolePermissions, toFrontendRole } from "./permissions";
import { approvalPermissionForAction, dashboardRevenueSummary, deriveServerMembershipStatus, duplicateMemberMatches, formatPaymentAuditEntityLabel, isValidMinorUnit, marketingPreference, paymentAllocation, refundAllocation, trialTransitionAllowed } from "./invariants";
import { buildCustomerProfileDraft, customerProfileOwnership, findCustomerProfileByUserId } from "./customer";
import { buildPlatformGymDetail } from "./platformGymDetail";
import { annualPrice } from "./subscriptionReconciliation";
import { buildPlatformOverview } from "./platformOverview";
import { varianceApprovalStatusForAmount, varianceAuditApprovalStatusForAmount } from "./reconciliation";
import { logRedactedServerError } from "./telemetry";
import { marketingSuppressionReason } from "./marketing";
import { enqueueOperationalEmail } from "./operationalEmail";
import {
  buildWorkspaceAccess,
  defaultWorkspacePreferences,
  allWorkspaceModuleKeys,
  entitledModulesForPlan,
  entitledModulesForPlanSelection,
  requireWorkspaceModule as requireConfiguredWorkspaceModule,
  resolveWorkspaceEntitlements,
  resolveWorkspacePreferences,
  validateWorkspaceModuleSelection,
  WORKSPACE_MODULE_CATALOG,
  WORKSPACE_MODULE_CATALOG_VERSION,
  type WorkspaceModuleKey,
  type WorkspaceModulePlan,
} from "./workspaceModules";
import { BRAND_PALETTE_PRESETS, DEFAULT_BRAND_PALETTE, deriveBrandTokens, isBrandPaletteKey, normalizeBrandHex, type BrandPaletteKey } from "./brand";
import { operationsMutation, operationsQuery } from "./operations";
import { accountingMutation, accountingQuery } from "./accounting";
import { managementReportQuery } from "./managementReports";
import { platformPlanEntitledModules } from "./platformPlanCatalog";
import { enforcePublicRateLimit, privacyFingerprint } from "./publicAbuse";
import { automationAttentionHref } from "./automations";

type ReadContext = QueryCtx | MutationCtx;
// Convex's `v.any()` is the deliberate JSON storage boundary for normalized
// domain records. The adapter validates/matches these values before they cross
// into the typed GymOSApi contract; keeping this escape hatch local prevents
// pages from gaining an `any` dependency.
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type DomainRecord = Doc<"domainRecords">;
type Branch = Doc<"branches">;
type Organization = Doc<"organizations">;
type User = Doc<"users">;
type Zone = Doc<"zones">;

const OPERATION_ARGS = {
  operation: v.string(),
  input: v.any(),
  organizationId: v.optional(v.string()),
  branchId: v.optional(v.string()),
  activeBranchId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
};

const TZ_FALLBACK = "Asia/Amman";
const JOD = "JOD";
const CURRENCY_MINOR_EXPONENTS: Record<string, number> = {
  AED: 2,
  BHD: 3,
  EUR: 2,
  GBP: 2,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  SAR: 2,
  TND: 3,
  USD: 2,
};
const DEFAULT_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true },
  { key: "card", label: "Card", enabled: true, affectsCashDrawer: false },
  { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false },
  { key: "cliq", label: "CliQ", enabled: true, affectsCashDrawer: false },
  { key: "other", label: "Other", enabled: false, affectsCashDrawer: false },
];
const DEFAULT_NOTIFICATIONS = {
  managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true },
  renewalRecoveryEnabled: false,
  automationDeliveryMode: "sandbox",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LEAD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEAD_PHONE_PATTERN = /^\+?[\d\s()-]{9,18}$/;
const ZONE_KINDS = ["floor", "studio", "weights", "cardio", "functional", "locker_room", "bathroom", "reception", "storage", "other"] as const;

function normalizedTrialWindow(value: Data): Data {
  if (typeof value.enabled === "boolean" || value.opensAt || value.closesAt) {
    const enabled = booleanValue(value.enabled);
    const opensAt = stringValue(value.opensAt, "09:00");
    const closesAt = stringValue(value.closesAt, "20:00");
    return {
      enabled,
      opensAt,
      closesAt,
      // Temporary read compatibility for the previously deployed exact-slot
      // frontend. Remove only after every environment runs the window UI.
      slots: enabled ? [opensAt, closesAt] : [],
    };
  }
  // Backward-compatible read for exact-slot schedules saved before windows
  // were introduced. The next settings save persists the canonical shape.
  const slots = [...new Set(arrayValue(value.slots).map((slot) => stringValue(slot).trim()).filter(Boolean))].sort();
  const onlySlot = slots.length === 1 ? slots[0] : undefined;
  const [onlyHour = 0, onlyMinute = 0] = onlySlot?.split(":").map(Number) ?? [];
  const legacyClosingMinutes = Math.min(23 * 60 + 59, onlyHour * 60 + onlyMinute + 60);
  return {
    enabled: slots.length > 0,
    opensAt: slots[0] ?? "09:00",
    closesAt: onlySlot ? `${String(Math.floor(legacyClosingMinutes / 60)).padStart(2, "0")}:${String(legacyClosingMinutes % 60).padStart(2, "0")}` : (slots.at(-1) ?? "20:00"),
    slots,
  };
}
const DEFAULT_OPERATIONAL_POLICIES = {
  entry: {
    outstandingBalance: "warn",
    expiryWarningDays: 7,
    duplicateScanWindowMinutes: 2,
    enforceOperatingHours: false,
  },
  membership: {
    allowOverlappingMemberships: false,
    renewalWindowDays: 14,
    minimumFreezeDays: 1,
    maximumExtensionDays: 365,
  },
  personalTraining: {
    sessionDurationMinutes: 60,
    bookingHorizonDays: 30,
    cancellationCutoffHours: 12,
  },
  operatingHours: [],
  trialSchedules: [],
};
// The public SaaS catalog is configuration, not demo tenant data. Production
// intentionally starts without the Forge reference seed, so keep the approved
// launch plans available until an operator has created editable catalog rows.
// These values are also the defaults used by the application form.
const DEFAULT_PLATFORM_PLANS: Data[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper", entitledModules: ["foundation", "revenue"] },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal", entitledModules: ["foundation", "revenue", "operations"] },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
];
const ENTRY_PASS_PREFIX = "rivet-pass";
const ENTRY_PASS_TTL_MS = 15 * 60_000;
const MARKETING_WORDING_VERSION = "2026-08-explicit-consent-v2";
const GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS = ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"] as const;
const MANDATORY_PLATFORM_EMAIL_KINDS = ["platform_invoice_issued", "platform_invoice_reminder", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled"] as const;

function data(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function gymProfileMediaIds(value: unknown): string[] {
  const profile = data(value);
  return [
    optionalString(profile.logoAssetId),
    optionalString(profile.coverAssetId),
    ...arrayValue(profile.galleryAssetIds).map((item) => optionalString(item)),
  ].filter((item): item is string => Boolean(item));
}

/**
 * Publishes the tenant's saved profile draft: snapshots an immutable version,
 * projects it onto the marketplace listing, and schedules unreferenced media
 * for deletion. Shared by the tenant's first self-serve publish and the
 * platform console's reviewed publish.
 */
async function applyGymProfilePublish(
  ctx: MutationCtx,
  organization: Doc<"organizations">,
  listing: Doc<"domainRecords">,
  draft: Doc<"domainRecords">,
): Promise<{ versionId: string; listingBefore: Data }> {
  const draftValue = data(draft.data);
  const draftVersion = numberValue(draftValue.version);
  const now = Date.now();
  const publishedAt = utcIso(now);
  const allVersions = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "gymProfileVersion")).collect();
  const oldVersions = allVersions.filter((record) => stringValue(data(record.data).status) === "published");
  for (const old of oldVersions) await ctx.db.patch(old._id, { data: { ...data(old.data), status: "unpublished", unpublishedAt: publishedAt, updatedAt: publishedAt }, updatedAt: now });
  const versionId = newPublicId();
  const versionValue = { ...draftValue, status: "published", version: draftVersion, publishedAt, updatedAt: publishedAt };
  await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "gymProfileVersion", publicId: versionId, createdAt: now, updatedAt: now, data: versionValue });
  await ctx.db.patch(draft._id, { data: versionValue, updatedAt: now });
  const listingBefore = data(listing.data);
  await ctx.db.patch(listing._id, { data: { ...listingBefore, shortName: draftValue.shortName, tagline: draftValue.taglineEn, taglineAr: draftValue.taglineAr, description: draftValue.descriptionEn, descriptionAr: draftValue.descriptionAr, category: draftValue.category, audience: draftValue.audience, amenities: draftValue.amenities, contactEmail: draftValue.contactEmail, contactPhone: draftValue.contactPhone, websiteUrl: draftValue.websiteUrl, instagramUrl: draftValue.instagramUrl, accent: draftValue.accentColor, logoAssetId: draftValue.logoAssetId, coverAssetId: draftValue.coverAssetId, galleryAssetIds: draftValue.galleryAssetIds, profilePublished: true, profileVersion: draftValue.version }, updatedAt: now });
  // Keep assets referenced by immutable profile snapshots. The version
  // history is retained for audit and preview, so replacing the current
  // draft must not make an older snapshot point at a deleted object.
  const referencedMedia = new Set([...gymProfileMediaIds(draftValue), ...allVersions.flatMap((record) => gymProfileMediaIds(record.data))]);
  const orgPublicId = publicOrganizationId(organization);
  const publicMedia = (await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", organization._id).eq("ownerType", "gym_gallery").eq("ownerPublicId", orgPublicId)).collect())
    .concat(await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", organization._id).eq("ownerType", "gym_logo").eq("ownerPublicId", orgPublicId)).collect())
    .concat(await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", organization._id).eq("ownerType", "gym_cover").eq("ownerPublicId", orgPublicId)).collect());
  for (const asset of publicMedia.filter((item) => item.status === "active" && !referencedMedia.has(item.publicId))) await ctx.db.patch(asset._id, { status: "scheduled_for_deletion", deleteAfter: now + 30 * 86_400_000, updatedAt: now });
  return { versionId, listingBefore };
}

function offerProjection(value: Data): Data {
  const expiresAt = optionalString(value.expiresAt);
  return value.status === "sent" && expiresAt && Date.parse(expiresAt) <= Date.now()
    ? { ...value, status: "expired" }
    : value;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizedLeadEmail(value: unknown, actor: ActorContext): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") domainError("VALIDATION_ERROR", "Email must be a string.", { correlationId: actor.correlationId, fieldErrors: { email: ["Enter a valid email"] } });
  const email = value.trim().toLowerCase();
  if (!email) return undefined;
  if (email.length > 254 || !LEAD_EMAIL_PATTERN.test(email)) domainError("VALIDATION_ERROR", "Enter a valid email address.", { correlationId: actor.correlationId, fieldErrors: { email: ["Enter a valid email"] } });
  return email;
}

function normalizedLeadName(value: unknown, actor: ActorContext): string {
  const fullName = stringValue(value).trim();
  if (fullName.length < 3 || fullName.length > 120) domainError("VALIDATION_ERROR", "Full name must be between 3 and 120 characters.", { correlationId: actor.correlationId, fieldErrors: { fullName: ["Enter a full name"] } });
  return fullName;
}

function normalizedLeadPhone(value: unknown, actor: ActorContext): string {
  const phone = stringValue(value).trim();
  if (!LEAD_PHONE_PATTERN.test(phone)) domainError("VALIDATION_ERROR", "Enter a valid phone number.", { correlationId: actor.correlationId, fieldErrors: { phone: ["Enter a valid phone"] } });
  return phone;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function chargeIssueDateValue(charge: Data): string {
  return optionalString(charge.issueDate) ?? stringValue(charge.createdAt).slice(0, 10);
}

function chargeDueDateValue(charge: Data): string {
  return optionalString(charge.dueDate) ?? chargeIssueDateValue(charge);
}

function chargeIsCollectibleValue(charge: Data, today: string): boolean {
  if (["refunded", "void"].includes(stringValue(charge.status))) return false;
  return chargeDueDateValue(charge) <= today;
}

function collectibleOutstandingValue(charge: Data, today: string): number {
  return chargeIsCollectibleValue(charge, today) ? Math.max(0, amountOf(charge.outstandingAmount)) : 0;
}

function chargeProjection(charge: Data, today: string): Data {
  return {
    ...charge,
    issueDate: chargeIssueDateValue(charge),
    dueDate: chargeDueDateValue(charge),
    collectible: chargeIsCollectibleValue(charge, today),
  };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function marketingPreferenceRecord(input: Data, actor: ActorContext, fallbackOptedIn = false): Data {
  const requestedSource = optionalString(input.marketingPreferenceSource);
  const source = requestedSource ?? "system_default";
  if (!["system_default", "staff_selected", "member_selected", "imported"].includes(source)) {
    domainError("VALIDATION_ERROR", "Marketing preference source is invalid.", { correlationId: actor.correlationId });
  }
  const explicit = source !== "system_default" && typeof input.marketingOptIn === "boolean";
  const optedIn = explicit ? marketingPreference(input.marketingOptIn) : fallbackOptedIn && explicit;
  const status = explicit ? (optedIn ? "explicit_opt_in" : "explicit_opt_out") : "unknown";
  return {
    optedIn,
    status,
    source,
    changedAt: explicit ? isoNow() : undefined,
    changedById: explicit ? publicUserId(actor.user) : undefined,
    wordingVersion: explicit ? MARKETING_WORDING_VERSION : undefined,
  };
}

function customerPreferenceFromProfile(value: Data): Data {
  const storedStatus = optionalString(value.marketingPreferenceStatus);
  const requestedSource = stringValue(value.marketingPreferenceSource, "system_default");
  const source = requestedSource === "member_selected" ? "member_selected" : "system_default";
  const legacyOptedIn = booleanValue(value.marketingOptIn, false);
  const status = storedStatus === "explicit_opt_in" || storedStatus === "explicit_opt_out" || storedStatus === "unknown"
    ? storedStatus
    : source === "member_selected" ? (legacyOptedIn ? "explicit_opt_in" : "explicit_opt_out") : "unknown";
  const optedIn = status === "explicit_opt_in";
  const changedAt = numberValue(value.marketingPreferenceChangedAt);
  return {
    optedIn,
    status,
    source,
    changedAt: status !== "unknown" && changedAt > 0 ? new Date(changedAt).toISOString() : undefined,
    wordingVersion: status !== "unknown" ? stringValue(value.marketingPreferenceWordingVersion, MARKETING_WORDING_VERSION) : undefined,
  };
}

function customerPreferenceEventView(value: Data): Data {
  const status = optionalString(value.status) ?? (stringValue(value.source, "system_default") === "system_default" ? "unknown" : booleanValue(value.optedIn, false) ? "explicit_opt_in" : "explicit_opt_out");
  return {
    optedIn: status === "explicit_opt_in",
    status,
    source: stringValue(value.source, "system_default") === "member_selected" ? "member_selected" : "system_default",
    changedAt: new Date(numberValue(value.changedAt)).toISOString(),
    wordingVersion: stringValue(value.wordingVersion, MARKETING_WORDING_VERSION),
  };
}

async function platformPlans(ctx: ReadContext): Promise<Data[]> {
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const persisted = new Map(rows.map((row): [string, Data] => {
    const persistedValue = data(row.data);
    const defaultValue = DEFAULT_PLATFORM_PLANS.find((plan) => stringValue(plan.name) === stringValue(persistedValue.name, row.publicId));
    return [stringValue(persistedValue.name, row.publicId), { id: row.publicId, ...(defaultValue ?? {}), ...persistedValue }];
  }));
  const defaults = DEFAULT_PLATFORM_PLANS.map((plan) => persisted.get(stringValue(plan.name)) ?? { id: plan.name, ...plan });
  const defaultNames = new Set(DEFAULT_PLATFORM_PLANS.map((plan) => stringValue(plan.name)));
  return [...defaults, ...[...persisted.entries()].filter(([name]) => !defaultNames.has(name)).map(([, plan]) => plan)];
}

function recordId(value: unknown): string {
  const id = stringValue(value);
  if (!id) domainError("VALIDATION_ERROR", "A public identifier is required.");
  return id;
}

function isoNow(): string {
  return new Date().toISOString();
}

function newPublicId(): string {
  return crypto.randomUUID();
}

type PlatformAdminContext = Awaited<ReturnType<typeof requirePlatformAdmin>>;

async function insertPlatformAudit(
  ctx: MutationCtx,
  admin: PlatformAdminContext,
  event: {
    action: string;
    entityType: string;
    entityPublicId: string;
    entityLabel: string;
    summary: string;
    reason?: string;
    before?: Data;
    after?: Data;
  },
): Promise<void> {
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorUserId: admin.user._id,
    actorPublicId: publicUserId(admin.user),
    actorName: admin.user.fullName,
    action: event.action,
    entityType: event.entityType,
    entityPublicId: event.entityPublicId,
    entityLabel: event.entityLabel,
    summary: event.summary,
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.before ? { before: event.before } : {}),
    ...(event.after ? { after: event.after } : {}),
    correlationId: admin.correlationId,
    occurredAt: Date.now(),
  });
}

function currencyMinorExponent(currency: string): number {
  return CURRENCY_MINOR_EXPONENTS[currency.toUpperCase()] ?? 2;
}

function platformInvoiceAmount(amountMinor: number, currency: string): string {
  const exponent = currencyMinorExponent(currency);
  return `${currency} ${(amountMinor / 10 ** exponent).toFixed(exponent)}`;
}

function validTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sameCalendarDate(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

/**
 * Lifecycle controls accept either a date-only value from the admin form or a
 * complete ISO timestamp. Date.parse normalizes impossible date-only values
 * (for example, 2026-02-31), so date-only inputs are checked round-trip before
 * they are persisted.
 */
function validSubscriptionTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  const datePrefix = normalized.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    const dateOnlyTimestamp = Date.parse(`${datePrefix}T00:00:00.000Z`);
    if (!Number.isFinite(dateOnlyTimestamp) || new Date(dateOnlyTimestamp).toISOString().slice(0, 10) !== datePrefix) return undefined;
  }
  return validTimestamp(normalized);
}

type BillingInterval = "monthly" | "annual";

function billingInterval(value: unknown): BillingInterval {
  return value === "annual" ? "annual" : "monthly";
}

/** Add calendar months without allowing Jan 31 to spill into March. */
function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

function platformSubscriptionStatusForOrganization(status: Organization["status"]): "trial" | "active" | "overdue" | "suspended" | "cancelled" {
  return status === "past_due" ? "overdue" : status;
}

function platformPlanFromFacts(gym: Data, organization: Organization | null, entitlement: Doc<"organizationEntitlements"> | null): string | undefined {
  // The tenant row is the billing authority. Entitlements are a materialized
  // capability snapshot and the marketplace listing is only a projection. A
  // stale entitlement/listing must never make the platform show or restore a
  // plan that is different from the organization actually being operated.
  return organization?.subscriptionPlan ?? optionalString(entitlement?.subscriptionPlan) ?? optionalString(gym.rivetPlan);
}

function platformSubscriptionSnapshot(
  gym: Data,
  organization: Organization | null,
  entitlement: Doc<"organizationEntitlements"> | null,
): Data {
  const listingPlan = optionalString(gym.rivetPlan) ?? null;
  const organizationPlan = organization?.subscriptionPlan ?? null;
  const entitlementPlan = entitlement?.subscriptionPlan ?? null;
  return {
    subscriptionStatus: optionalString(gym.subscriptionStatus) ?? null,
    rivetPlan: optionalString(gym.rivetPlan) ?? null,
    isPublic: typeof gym.isPublic === "boolean" ? gym.isPublic : null,
    trialEndsAt: optionalString(gym.trialEndsAt) ?? null,
    subscriptionStartedAt: optionalString(gym.subscriptionStartedAt) ?? null,
    currentPeriodEndsAt: optionalString(gym.currentPeriodEndsAt) ?? null,
    cancelledAt: optionalString(gym.cancelledAt) ?? null,
    subscriptionStatusReason: optionalString(gym.subscriptionStatusReason) ?? null,
    billingInterval: organization?.billingInterval ?? optionalString(gym.billingInterval) ?? null,
    lastActiveAt: optionalString(gym.lastActiveAt) ?? null,
    isArchived: Boolean(gym.isArchived || organization?.archivedAt),
    archivedAt: organization?.archivedAt !== undefined ? utcIso(organization.archivedAt) : optionalString(gym.archivedAt) ?? null,
    archiveReason: organization?.archiveReason ?? optionalString(gym.archiveReason) ?? null,
    planResolution: {
      source: organizationPlan ? "organization" : entitlementPlan ? "organization_entitlement" : "marketplace_listing",
      listingPlan,
      organizationPlan,
      entitlementPlan,
      drift: Boolean(
        (entitlementPlan && organizationPlan !== entitlementPlan)
        || (entitlementPlan && listingPlan !== entitlementPlan)
        || (!entitlementPlan && organizationPlan && listingPlan !== organizationPlan),
      ),
    },
    organization: organization
      ? {
          id: publicOrganizationId(organization),
          status: organization.status,
          subscriptionPlan: organization.subscriptionPlan ?? null,
          billingInterval: organization.billingInterval ?? "monthly",
          subscriptionStartedAt: organization.subscriptionStartedAt ?? null,
          trialEndsAt: organization.trialEndsAt ?? null,
          currentPeriodEndsAt: organization.currentPeriodEndsAt ?? null,
          cancelledAt: organization.cancelledAt ?? null,
          subscriptionStatusReason: organization.subscriptionStatusReason ?? null,
          archivedAt: organization.archivedAt ?? null,
          archiveReason: organization.archiveReason ?? null,
        }
      : null,
    entitlements: entitlement
      ? {
          catalogVersion: entitlement.catalogVersion,
          subscriptionPlan: entitlement.subscriptionPlan ?? null,
          entitledModules: entitlement.entitledModules,
          source: entitlement.source,
        }
      : null,
  };
}

async function supportCaseView(ctx: ReadContext, record: DomainRecord): Promise<Data> {
  const value = data(record.data);
  const messages = (await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", record.organizationId).eq("entityType", "supportMessage"))
    .collect())
    .map((message): Data => ({ id: message.publicId, ...data(message.data) }))
    .filter((message) => stringValue(message.caseId) === record.publicId)
    .sort((left, right) => stringValue(left.createdAt).localeCompare(stringValue(right.createdAt)));
  return {
    id: record.publicId,
    ...value,
    createdAt: optionalString(value.createdAt) ?? utcIso(record.createdAt),
    updatedAt: optionalString(value.updatedAt) ?? utcIso(record.updatedAt),
    messages,
  };
}

async function notificationView(ctx: ReadContext, notification: Doc<"operationalNotifications">): Promise<Data> {
  const organization = notification.organizationId ? await ctx.db.get(notification.organizationId) : null;
  const branch = notification.branchId ? await ctx.db.get(notification.branchId) : null;
  return {
    id: notification.publicId,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    dedupeKey: notification.dedupeKey,
    organizationId: organization ? publicOrganizationId(organization) : undefined,
    branchId: branch ? publicBranchId(branch) : undefined,
    readAt: notification.readAt ? utcIso(notification.readAt) : undefined,
    expiresAt: notification.expiresAt ? utcIso(notification.expiresAt) : undefined,
    createdAt: utcIso(notification.createdAt),
  };
}

async function insertOperationalNotification(ctx: MutationCtx, input: {
  recipientUserId: Id<"users">;
  organizationId?: Id<"organizations">;
  branchId?: Id<"branches">;
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  expiresAt?: number;
}): Promise<void> {
  const existing = await ctx.db
    .query("operationalNotifications")
    .withIndex("by_recipient_dedupe", (q) => q.eq("recipientUserId", input.recipientUserId).eq("dedupeKey", input.dedupeKey))
    .unique();
  if (existing && (!existing.expiresAt || existing.expiresAt > Date.now())) return;
  if (!input.href.startsWith("/") || input.href.startsWith("//")) domainError("VALIDATION_ERROR", "Notification links must be internal RIVET routes.");
  await ctx.db.insert("operationalNotifications", {
    publicId: `NOT-${newPublicId()}`,
    recipientUserId: input.recipientUserId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    dedupeKey: input.dedupeKey,
    expiresAt: input.expiresAt,
    createdAt: Date.now(),
  });
}

async function notifyOrganizationRoles(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  branchId?: Id<"branches">;
  roles: OrganizationRole[];
  kind: string;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  excludeUserId?: Id<"users">;
}): Promise<void> {
  const memberships = (await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", input.organizationId))
    .collect())
    .filter((membership) => membership.active && input.roles.includes(membership.role))
    .filter((membership) => !input.branchId || membership.branchScope === "all" || membership.branchIds.includes(input.branchId));
  await Promise.all(memberships.map(async (membership) => {
    if (input.excludeUserId && membership.userId === input.excludeUserId) return;
    const user = await ctx.db.get(membership.userId);
    if (!user || user.status === "deactivated") return;
    await insertOperationalNotification(ctx, {
      recipientUserId: user._id,
      organizationId: input.organizationId,
      branchId: input.branchId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href,
      dedupeKey: input.dedupeKey,
    });
  }));
}

async function queueOperationalEmail(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  branchId?: Id<"branches">;
  kind: string;
  templateVersion: string;
  language?: "en" | "ar";
  recipientReference: string;
  recipientEmail?: string;
  dedupeKey: string;
  messageClass?: "service" | "marketing";
  marketingOptIn?: boolean;
}): Promise<void> {
  const suppressionReason = input.messageClass === "marketing"
    ? marketingSuppressionReason({ marketingOptIn: input.marketingOptIn })
    : undefined;
  await enqueueOperationalEmail(ctx, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    messageClass: input.messageClass,
    templateVersion: input.templateVersion,
    language: input.language,
    recipientReference: input.recipientReference,
    recipientEmail: input.recipientEmail,
    dedupeKey: input.dedupeKey,
    suppressionReason,
  });
}

async function platformGymOwnerRecipient(ctx: MutationCtx, gymId: string): Promise<{ organization: Organization; user: User } | null> {
  const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "marketplaceGym").eq("publicId", gymId)).unique();
  const targetOrganizationId = optionalString(data(listing?.data).targetOrganizationId);
  const organization = targetOrganizationId ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique() : null;
  if (!organization) return null;
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
  const ownerMembership = memberships.find((membership) => membership.active && membership.role === "owner");
  const user = ownerMembership ? await ctx.db.get(ownerMembership.userId) : null;
  return user && user.status !== "deactivated" ? { organization, user } : null;
}

function utcIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function dateParts(value: string): [number, number, number] {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return [year || 1970, month || 1, day || 1];
}

function dayNumber(value: string): number {
  const [year, month, day] = dateParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function addDays(value: string, days: number): string {
  const [year, month, day] = dateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function todayIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function localSchedulePosition(timezone: string): { weekday: string; time: string } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { weekday: stringValue(values.weekday).slice(0, 3).toLowerCase(), time: `${values.hour}:${values.minute}` };
  } catch {
    const now = new Date();
    return { weekday: WEEKDAYS[now.getUTCDay()] ?? "sun", time: now.toISOString().slice(11, 16) };
  }
}

function isBranchOpen(operationalPolicies: Data, branchId: string, timezone: string): boolean {
  if (!booleanValue(data(operationalPolicies.entry).enforceOperatingHours)) return true;
  const schedule = arrayValue(operationalPolicies.operatingHours).map(data).find((item) => item.branchId === branchId);
  if (!schedule) return true;
  const position = localSchedulePosition(timezone);
  const hours = data(data(schedule.days)[position.weekday]);
  if (!booleanValue(hours.enabled)) return false;
  return position.time >= stringValue(hours.opensAt) && position.time < stringValue(hours.closesAt);
}

function businessDate(value: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return value.slice(0, 10);
  }
}

function validatedWeekdayForDate(value: string): (typeof WEEKDAYS)[number] | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return undefined;
  return WEEKDAYS[parsed.getUTCDay()];
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function entryPassSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

async function verifyEntryPassSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return await crypto.subtle.verify("HMAC", key, base64UrlDecode(signature) as unknown as BufferSource, new TextEncoder().encode(payload));
}

function money(amount: number, currency = JOD) {
  if (!isValidMinorUnit(amount)) domainError("VALIDATION_ERROR", "Money must be a non-negative integer amount.");
  return { amount, currency };
}

function signedMoney(amount: number, currency = JOD) {
  if (!isValidMinorUnit(amount, true)) domainError("VALIDATION_ERROR", "Money must be an integer amount.");
  return { amount, currency };
}

function amountOf(value: unknown): number {
  return numberValue(data(value).amount);
}

function currencyOf(value: unknown, fallback = JOD): string {
  return stringValue(data(value).currency, fallback);
}

function normalize(value: string | undefined): string {
  return (value ?? "").replace(/[\s+()\-]/g, "").toLowerCase();
}

function matchesSearch(values: unknown[], search?: string): boolean {
  if (!search?.trim()) return true;
  const query = search.trim().toLowerCase();
  const compact = query.replace(/[\s\-]/g, "");
  return values.some((value) => {
    if (typeof value !== "string") return false;
    return value.toLowerCase().includes(query) || value.replace(/[\s\-]/g, "").includes(compact);
  });
}

function sortRecords<T>(items: T[], sort: unknown, getter: (item: T, key: string) => string | number | undefined): T[] {
  if (typeof sort !== "string" || !sort) return items;
  const descending = sort.startsWith("-");
  const key = descending ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    const left = getter(a, key);
    const right = getter(b, key);
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (left === right) return 0;
    return left < right ? (descending ? 1 : -1) : (descending ? -1 : 1);
  });
}

function page<T>(items: T[], input: Data) {
  const pageNumber = Math.max(1, Math.floor(numberValue(input.page, 1)));
  const pageSize = Math.min(100, Math.max(1, Math.floor(numberValue(input.pageSize, 20))));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    page: pageNumber,
    pageSize,
    totalItems,
    totalPages,
  };
}

function roleFromFrontend(value: unknown): OrganizationRole {
  const role = stringValue(value);
  const normalized = role === "salesperson" ? "sales" : role;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_DEFINITIONS, normalized)) domainError("VALIDATION_ERROR", "A valid staff role is required.");
  return normalized as OrganizationRole;
}

function frontendRole(value: OrganizationRole): string {
  return toFrontendRole(value);
}

async function branchByPublicId(ctx: ReadContext, organizationId: Id<"organizations">, id?: string): Promise<Branch | null> {
  if (!id) return null;
  return await ctx.db
    .query("branches")
    .withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", id))
    .unique();
}

async function zoneByPublicId(ctx: ReadContext, organizationId: Id<"organizations">, id?: string): Promise<Zone | null> {
  if (!id) return null;
  return await ctx.db.query("zones").withIndex("by_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", id)).unique();
}

async function recordsOf(ctx: ReadContext, actor: ActorContext, entityType: string): Promise<DomainRecord[]> {
  const records = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType))
    .collect();
  if (actor.branchScope === "all") return records;
  return records.filter((record) => !record.branchId || actor.branchIds.includes(record.branchId));
}

async function recordsOfBranch(ctx: ReadContext, actor: ActorContext, entityType: string, branchPublicId: string): Promise<DomainRecord[]> {
  const branch = await branchByPublicId(ctx, actor.organization._id, branchPublicId);
  assertBranchAccess(actor, branch);
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_branch_type", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("entityType", entityType))
    .collect();
}

async function recordsOfMember(ctx: ReadContext, organizationId: Id<"organizations">, memberPublicId: string, entityType: string): Promise<DomainRecord[]> {
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_member_type", (q) => q.eq("organizationId", organizationId).eq("memberPublicId", memberPublicId).eq("entityType", entityType))
    .collect();
}

async function recordOf(ctx: ReadContext, actor: ActorContext, entityType: string, id: string): Promise<DomainRecord> {
  const record = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) =>
      q.eq("organizationId", actor.organization._id).eq("entityType", entityType).eq("publicId", id),
    )
    .unique();
  if (!record) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
  if (record.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(record.branchId)) {
    domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
  }
  return record;
}

async function insertRecord(
  ctx: MutationCtx,
  actor: ActorContext,
  entityType: string,
  value: Data,
  options: { branchId?: string; memberPublicId?: string; leadPublicId?: string } = {},
): Promise<Data> {
  const id = recordId(value.id ?? newPublicId());
  const branch = await branchByPublicId(ctx, actor.organization._id, options.branchId ?? optionalString(value.branchId) ?? optionalString(value.homeBranchId));
  if (branch) assertBranchAccess(actor, branch);
  const now = Date.now();
  const enriched: Data = { ...value, id, organizationId: publicOrganizationId(actor.organization) };
  await ctx.db.insert("domainRecords", {
    organizationId: actor.organization._id,
    entityType,
    publicId: id,
    branchId: branch?._id,
    memberPublicId: options.memberPublicId ?? optionalString(value.memberId),
    leadPublicId: options.leadPublicId ?? optionalString(value.leadId),
    createdAt: now,
    updatedAt: now,
    data: enriched,
  });
  return enriched;
}

async function patchRecord(ctx: MutationCtx, actor: ActorContext, record: DomainRecord, value: Data): Promise<Data> {
  const enriched = { ...data(record.data), ...value, id: record.publicId, organizationId: publicOrganizationId(actor.organization) };
  await ctx.db.patch(record._id, { data: enriched, updatedAt: Date.now() });
  return enriched;
}

async function insertTimeline(ctx: MutationCtx, actor: ActorContext, value: Data): Promise<Data> {
  const event: Data = {
    id: newPublicId(),
    organizationId: publicOrganizationId(actor.organization),
    occurredAt: optionalString(value.occurredAt) ?? isoNow(),
    ...value,
    actorId: optionalString(value.actorId) ?? publicUserId(actor.user),
    actorName: optionalString(value.actorName) ?? actor.user.fullName,
  };
  return await insertRecord(ctx, actor, "timeline", event, {
    branchId: optionalString(event.branchId) ?? optionalString(event.homeBranchId),
    memberPublicId: optionalString(event.memberId),
    leadPublicId: optionalString(event.leadId),
  });
}

async function insertAudit(
  ctx: MutationCtx,
  actor: ActorContext,
  value: {
    branchId?: string;
    category: string;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string;
    summary: string;
    reason?: string;
    before?: unknown;
    after?: unknown;
    approvalStatus?: "pending" | "approved" | "rejected";
  },
): Promise<Data> {
  const branch = await branchByPublicId(ctx, actor.organization._id, value.branchId);
  if (branch) assertBranchAccess(actor, branch);
  const event = {
    publicId: newPublicId(),
    organizationId: actor.organization._id,
    branchId: branch?._id,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: value.category,
    action: value.action,
    entityType: value.entityType,
    entityPublicId: value.entityId,
    entityLabel: value.entityLabel,
    summary: value.summary,
    reason: value.reason,
    before: value.before,
    after: value.after,
    approvalStatus: value.approvalStatus,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  };
  await ctx.db.insert("auditEvents", event);
  return event;
}

async function settingsRecord(ctx: ReadContext, actor: ActorContext): Promise<DomainRecord | null> {
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) =>
      q.eq("organizationId", actor.organization._id).eq("entityType", "settings").eq("publicId", "settings"),
    )
    .unique();
}

async function settingsData(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const record = await settingsRecord(ctx, actor);
  const current = data(record?.data);
  const operational = data(current.operationalPolicies);
  return {
    paymentMethods: current.paymentMethods ?? DEFAULT_PAYMENT_METHODS,
    notifications: current.notifications ?? DEFAULT_NOTIFICATIONS,
    operationalPolicies: {
      entry: { ...DEFAULT_OPERATIONAL_POLICIES.entry, ...data(operational.entry) },
      membership: { ...DEFAULT_OPERATIONAL_POLICIES.membership, ...data(operational.membership) },
      personalTraining: { ...DEFAULT_OPERATIONAL_POLICIES.personalTraining, ...data(operational.personalTraining) },
      operatingHours: Array.isArray(operational.operatingHours) ? operational.operatingHours : [],
      trialSchedules: Array.isArray(operational.trialSchedules) ? operational.trialSchedules : [],
    },
  };
}

function workspacePlan(value: unknown): WorkspaceModulePlan | undefined {
  return value === "Starter" || value === "Growth" || value === "Pro" || value === "Enterprise" ? value : undefined;
}

async function workspaceEntitlementRecord(ctx: ReadContext, actor: ActorContext) {
  return await ctx.db
    .query("organizationEntitlements")
    .withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id))
    .unique();
}

async function workspacePreferencesRecord(ctx: ReadContext, actor: ActorContext) {
  return await ctx.db
    .query("workspaceModulePreferences")
    .withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id))
    .unique();
}

async function workspaceEntitlementsData(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const row = await workspaceEntitlementRecord(ctx, actor);
  const organizationPlan = workspacePlan(actor.organization.subscriptionPlan);
  const storedPlan = workspacePlan(row?.subscriptionPlan);
  // Once a tenant has an explicit organization plan, derive the module set
  // from that plan on every read. This closes the stale-row window between a
  // platform mutation and its entitlement projection becoming visible to a
  // live workspace query. The mutation still persists the matching snapshot
  // for auditability and fast platform projections.
  const plan = organizationPlan ?? storedPlan;
  const catalogSelection = await platformPlanEntitledModules(ctx, plan);
  const resolved = resolveWorkspaceEntitlements(
    plan,
    organizationPlan
      ? {
          subscriptionPlan: organizationPlan,
          entitledModules: row?.entitledModules,
          source: "subscription_plan",
          updatedAt: row?.updatedAt,
        }
      : row
        ? {
            subscriptionPlan: row.subscriptionPlan,
            entitledModules: row.entitledModules,
            source: row.source,
            updatedAt: row.updatedAt,
          }
        : undefined,
    catalogSelection,
  );
  return {
    organizationId: publicOrganizationId(actor.organization),
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    subscriptionPlan: resolved.subscriptionPlan,
    entitledModules: resolved.entitledModules,
    source: resolved.source,
    updatedAt: row ? utcIso(row.updatedAt) : undefined,
  };
}

async function workspacePreferencesData(ctx: ReadContext, actor: ActorContext, entitledModules: WorkspaceModuleKey[]): Promise<Data> {
  const row = await workspacePreferencesRecord(ctx, actor);
  const updatedById = row ? await publicUserIdFromId(ctx, actor.organization._id, row.updatedByUserId) : undefined;
  const resolved = resolveWorkspacePreferences(entitledModules, row ? {
    enabledModules: row.enabledModules,
    updatedAt: row.updatedAt,
    updatedById,
  } : undefined);
  return {
    organizationId: publicOrganizationId(actor.organization),
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    enabledModules: resolved.enabledModules,
    updatedAt: row ? utcIso(row.updatedAt) : undefined,
    updatedById,
  };
}

async function workspaceAccessData(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const entitlements = await workspaceEntitlementsData(ctx, actor);
  const entitledModules = entitlements.entitledModules as WorkspaceModuleKey[];
  const preferences = await workspacePreferencesData(ctx, actor, entitledModules);
  return buildWorkspaceAccess(publicOrganizationId(actor.organization), entitlements as {
    catalogVersion: number;
    subscriptionPlan?: WorkspaceModulePlan;
    entitledModules: WorkspaceModuleKey[];
    source: "subscription_plan" | "legacy_default";
    updatedAt?: string;
  }, preferences as {
    catalogVersion: number;
    enabledModules: WorkspaceModuleKey[];
    updatedAt?: string;
    updatedById?: string;
  });
}

function requireWorkspaceModule(actor: ActorContext, access: Data, moduleKey: WorkspaceModuleKey): void {
  const status = arrayValue(access.modules).map(data).find((item) => item.key === moduleKey);
  try {
    requireConfiguredWorkspaceModule(moduleKey, {
      entitledModules: (data(access.entitlements).entitledModules ?? []) as WorkspaceModuleKey[],
      enabledModules: (data(access.preferences).enabledModules ?? []) as WorkspaceModuleKey[],
    });
  } catch {
    domainError("FEATURE_NOT_AVAILABLE", `The ${moduleKey} workspace module is not enabled for this organization.`, { correlationId: actor.correlationId, details: { module: moduleKey, reason: status?.lockedReason ?? "not_entitled" } });
  }
}

async function validatedOperationalPolicies(ctx: MutationCtx, actor: ActorContext, raw: unknown): Promise<Data> {
  const value = data(raw);
  const entry = data(value.entry);
  const membership = data(value.membership);
  const personalTraining = data(value.personalTraining);
  const outstandingBalance = stringValue(entry.outstandingBalance, "warn");
  if (!["allow", "warn", "block"].includes(outstandingBalance)) domainError("VALIDATION_ERROR", "Outstanding-balance policy is invalid.", { correlationId: actor.correlationId });
  const expiryWarningDays = numberValue(entry.expiryWarningDays, 7);
  const duplicateScanWindowMinutes = numberValue(entry.duplicateScanWindowMinutes, 2);
  const renewalWindowDays = numberValue(membership.renewalWindowDays, 14);
  const minimumFreezeDays = numberValue(membership.minimumFreezeDays, 1);
  const maximumExtensionDays = numberValue(membership.maximumExtensionDays, 365);
  const bookingHorizonDays = numberValue(personalTraining.bookingHorizonDays, 30);
  const cancellationCutoffHours = numberValue(personalTraining.cancellationCutoffHours, 12);
  const integerInRange = (candidate: number, minimum: number, maximum: number) => Number.isInteger(candidate) && candidate >= minimum && candidate <= maximum;
  if (!integerInRange(expiryWarningDays, 0, 30)) domainError("VALIDATION_ERROR", "Expiry warning must be between 0 and 30 days.", { correlationId: actor.correlationId });
  if (!integerInRange(duplicateScanWindowMinutes, 1, 15)) domainError("VALIDATION_ERROR", "Duplicate-scan window must be between 1 and 15 minutes.", { correlationId: actor.correlationId });
  if (!integerInRange(renewalWindowDays, 1, 90)) domainError("VALIDATION_ERROR", "Renewal window must be between 1 and 90 days.", { correlationId: actor.correlationId });
  if (!integerInRange(minimumFreezeDays, 1, 30)) domainError("VALIDATION_ERROR", "Minimum freeze must be between 1 and 30 days.", { correlationId: actor.correlationId });
  if (!integerInRange(maximumExtensionDays, 1, 365)) domainError("VALIDATION_ERROR", "Maximum extension must be between 1 and 365 days.", { correlationId: actor.correlationId });
  if (!integerInRange(bookingHorizonDays, 1, 90)) domainError("VALIDATION_ERROR", "PT booking horizon must be between 1 and 90 days.", { correlationId: actor.correlationId });
  if (!integerInRange(cancellationCutoffHours, 0, 72)) domainError("VALIDATION_ERROR", "PT cancellation cutoff must be between 0 and 72 hours.", { correlationId: actor.correlationId });
  const operatingHours: Data[] = [];
  const seenOperatingBranches = new Set<string>();
  for (const rawSchedule of arrayValue(value.operatingHours)) {
    const schedule = data(rawSchedule);
    const branchId = recordId(schedule.branchId);
    if (seenOperatingBranches.has(branchId)) domainError("VALIDATION_ERROR", "Each branch can have only one operating-hours schedule.", { correlationId: actor.correlationId });
    seenOperatingBranches.add(branchId);
    assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
    const days = data(schedule.days);
    const validatedDays: Data = {};
    for (const weekday of WEEKDAYS) {
      const day = data(days[weekday]);
      const enabled = booleanValue(day.enabled);
      const opensAt = stringValue(day.opensAt, "06:00");
      const closesAt = stringValue(day.closesAt, "23:00");
      if (!TIME_PATTERN.test(opensAt) || !TIME_PATTERN.test(closesAt) || (enabled && opensAt >= closesAt)) {
        domainError("VALIDATION_ERROR", `Operating hours for ${weekday} are invalid.`, { correlationId: actor.correlationId });
      }
      validatedDays[weekday] = { enabled, opensAt, closesAt, slots: enabled ? [opensAt, closesAt] : [] };
    }
    operatingHours.push({ branchId, days: validatedDays });
  }
  const operatingByBranch = new Map(operatingHours.map((schedule) => [stringValue(schedule.branchId), data(schedule.days)]));
  const trialSchedules: Data[] = [];
  const seenTrialBranches = new Set<string>();
  for (const rawSchedule of arrayValue(value.trialSchedules)) {
    const schedule = data(rawSchedule);
    const branchId = recordId(schedule.branchId);
    if (seenTrialBranches.has(branchId)) domainError("VALIDATION_ERROR", "Each branch can have only one trial schedule.", { correlationId: actor.correlationId });
    seenTrialBranches.add(branchId);
    assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
    const days = data(schedule.days);
    const validatedDays: Data = {};
    for (const weekday of WEEKDAYS) {
      const window = normalizedTrialWindow(data(days[weekday]));
      const enabled = booleanValue(window.enabled);
      const opensAt = stringValue(window.opensAt);
      const closesAt = stringValue(window.closesAt);
      if (!TIME_PATTERN.test(opensAt) || !TIME_PATTERN.test(closesAt) || (enabled && opensAt >= closesAt)) {
        domainError("VALIDATION_ERROR", `Trial window for ${weekday} is invalid.`, { correlationId: actor.correlationId });
      }
      const hours = data(operatingByBranch.get(branchId)?.[weekday]);
      if (enabled && (!booleanValue(hours.enabled) || opensAt < stringValue(hours.opensAt) || closesAt > stringValue(hours.closesAt))) {
        domainError("VALIDATION_ERROR", `Trial window for ${weekday} must fall inside the branch's operating hours.`, { correlationId: actor.correlationId });
      }
      validatedDays[weekday] = { enabled, opensAt, closesAt };
    }
    trialSchedules.push({ branchId, days: validatedDays });
  }
  return {
    entry: { outstandingBalance, expiryWarningDays, duplicateScanWindowMinutes, enforceOperatingHours: booleanValue(entry.enforceOperatingHours) },
    membership: { allowOverlappingMemberships: booleanValue(membership.allowOverlappingMemberships), renewalWindowDays, minimumFreezeDays, maximumExtensionDays },
    personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays, cancellationCutoffHours },
    operatingHours,
    trialSchedules,
  };
}

function organizationView(org: Organization): Data {
  return {
    id: publicOrganizationId(org),
    name: org.name,
    slug: org.slug,
    subscriptionPlan: org.subscriptionPlan,
    currency: org.currency,
    timezone: org.timezone,
    locale: org.locale ?? "en-JO",
    defaultLanguage: org.defaultLanguage ?? "en",
    taxRatePercent: org.taxRatePercent ?? 0,
    receiptPrefix: org.receiptPrefix ?? "RV",
    nextReceiptNumber: org.nextReceiptNumber ?? 1001,
    receiptFooter: org.receiptFooter ?? "Thank you for training with RIVET.",
    status: org.status === "suspended" ? "suspended" : "active",
  };
}

function branchView(branch: Branch, organizationId: string): Data {
  return {
    id: publicBranchId(branch),
    organizationId,
    name: branch.name,
    code: branch.code,
    address: branch.address ?? "",
    phone: branch.phone ?? "",
    capacity: branch.capacity ?? 120,
    status: branch.active && branch.status !== "inactive" ? "active" : "inactive",
  };
}

function zoneView(zone: Zone, organizationId: string, branchId: string): Data {
  return {
    id: zone.publicId,
    // Convex document IDs are an internal persistence detail. The typed API
    // contract exposes stable public IDs consistently with branches and the
    // rest of the authenticated workspace.
    organizationId,
    branchId,
    code: zone.code,
    name: zone.name,
    nameAr: zone.nameAr,
    kind: zone.kind,
    capacity: zone.capacity,
    status: zone.status,
    createdAt: utcIso(zone.createdAt),
    updatedAt: utcIso(zone.updatedAt),
  };
}

async function brandKitView(ctx: ReadContext, organization: Organization): Promise<Data> {
  const paletteKey: BrandPaletteKey = isBrandPaletteKey(organization.brandPaletteKey) ? organization.brandPaletteKey : DEFAULT_BRAND_PALETTE;
  const primaryColor = normalizeBrandHex(organization.brandPrimaryColor) ?? BRAND_PALETTE_PRESETS[paletteKey];
  const logoAssetId = organization.brandLogoAssetId;
  const logo = logoAssetId
    ? await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", logoAssetId)).unique()
    : null;
  const logoIsUsable = Boolean(logo && logo.status === "active" && logo.visibility === "public" && logo.ownerType === "gym_logo" && logo.ownerPublicId === publicOrganizationId(organization));
  const logoUrl = logoIsUsable && logo ? await ctx.storage.getUrl(logo.storageId) : undefined;
  return {
    organizationId: publicOrganizationId(organization),
    paletteKey,
    primaryColor,
    tokens: deriveBrandTokens(primaryColor),
    logoAssetId: logoIsUsable ? logoAssetId : undefined,
    logoUrl: logoIsUsable ? logoUrl ?? undefined : undefined,
    logoAltText: logoIsUsable ? logo?.altText : undefined,
    version: organization.brandVersion ?? 0,
    updatedAt: organization.brandUpdatedAt ? utcIso(organization.brandUpdatedAt) : undefined,
    updatedById: organization.brandUpdatedByUserId ? await publicUserIdFromId(ctx, organization._id, organization.brandUpdatedByUserId) : undefined,
  };
}

async function accessibleBranches(ctx: ReadContext, actor: ActorContext): Promise<Branch[]> {
  const branches = await ctx.db
    .query("branches")
    .withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id))
    .collect();
  return branches.filter((branch) => branch.active && (actor.branchScope === "all" || actor.branchIds.includes(branch._id)));
}

async function roleViews(ctx: ReadContext, actor: ActorContext): Promise<Data[]> {
  const configured = await ctx.db
    .query("roleDefinitions")
    .withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id))
    .collect();
  const byRole = new Map(configured.map((role) => [role.role, role]));
  return (Object.keys(DEFAULT_ROLE_DEFINITIONS) as OrganizationRole[]).map((role) => {
    const definition = byRole.get(role);
    const fallback = DEFAULT_ROLE_DEFINITIONS[role];
    return {
      key: frontendRole(role),
      label: definition?.label ?? fallback.label,
      description: definition?.description ?? fallback.description,
      permissions: rolePermissions(role, definition?.permissions, definition?.catalogVersion),
      catalogVersion: definition?.catalogVersion ?? PERMISSION_CATALOG_VERSION,
      discountLimitMinor: definition?.discountLimitMinor ?? fallback.discountLimitMinor,
      isSystem: definition?.isSystem ?? true,
    };
  });
}

async function buildSession(ctx: ReadContext, actor: ActorContext, activeBranchId?: string): Promise<Data> {
  const branches = await accessibleBranches(ctx, actor);
  const workspace = await workspaceAccessData(ctx, actor);
  const brand = await brandKitView(ctx, actor.organization);
  let selected: Branch | undefined;
  if (activeBranchId) {
    selected = branches.find((branch) => publicBranchId(branch) === activeBranchId);
    if (!selected) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  } else if (actor.branchScope === "selected") {
    // A selected-branch actor may only receive an implicit branch when their
    // membership has exactly one active branch. With multiple branches there
    // is no safe default: the client must preserve an explicit branch choice
    // (or ask the user to choose one) before any branch-scoped work can run.
    if (branches.length === 1) selected = branches[0];
    else if (branches.length > 1) {
      domainError("ORGANIZATION_SELECTION_REQUIRED", "Select a branch before continuing.", {
        correlationId: actor.correlationId,
        details: { branchCount: branches.length },
      });
    }
  }
  return {
    user: { id: publicUserId(actor.user), name: actor.user.fullName, email: actor.user.email },
    organization: {
      id: publicOrganizationId(actor.organization),
      name: actor.organization.name,
      currency: actor.organization.currency,
      timezone: actor.organization.timezone,
      locale: actor.organization.locale ?? "en-JO",
      brand,
    },
    branches: branches.map((branch) => ({ id: publicBranchId(branch), name: branch.name, code: branch.code })),
    activeBranchId: selected ? publicBranchId(selected) : undefined,
    roles: [frontendRole(actor.role)],
    permissions: actor.permissions,
    workspace,
  };
}

function statusOfMembership(value: Data, today: string): string {
  const freeze = data(value.activeFreeze);
  return deriveServerMembershipStatus({ cancelledAt: value.cancelledAt, freezeStatus: freeze.status, freezeStartDate: freeze.startDate, freezeEndDate: freeze.endDate, startDate: stringValue(value.startDate), endDate: stringValue(value.endDate), totalVisits: value.totalVisits, remainingVisits: value.remainingVisits }, today);
}

async function memberRecords(ctx: ReadContext, actor: ActorContext): Promise<DomainRecord[]> {
  return await recordsOf(ctx, actor, "member");
}

async function membershipRecords(ctx: ReadContext, actor: ActorContext): Promise<DomainRecord[]> {
  return await recordsOf(ctx, actor, "membership");
}

async function chargeRecords(ctx: ReadContext, actor: ActorContext): Promise<DomainRecord[]> {
  return await recordsOf(ctx, actor, "charge");
}

async function paymentRecords(ctx: ReadContext, actor: ActorContext): Promise<DomainRecord[]> {
  return await recordsOf(ctx, actor, "payment");
}

async function currentMembership(ctx: ReadContext, actor: ActorContext, memberId: string): Promise<Data | undefined> {
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const terms = (await membershipRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((membership) => membership.memberId === memberId)
    .map((membership) => ({ membership, status: statusOfMembership(membership, today) }));
  const rank: Record<string, number> = { active: 0, expiring: 0, frozen: 0, depleted: 1, scheduled: 2, expired: 3, cancelled: 4 };
  return terms.sort((a, b) => (rank[a.status] ?? 5) - (rank[b.status] ?? 5) || stringValue(b.membership.endDate).localeCompare(stringValue(a.membership.endDate)))[0]?.membership;
}

async function outstandingForMember(ctx: ReadContext, actor: ActorContext, memberId: string): Promise<Data> {
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const total = (await chargeRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((charge) => charge.memberId === memberId)
    .reduce((sum, charge) => sum + collectibleOutstandingValue(charge, today), 0);
  return money(total, actor.organization.currency);
}

async function toMemberSummary(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const membership = await currentMembership(ctx, actor, stringValue(value.id));
  const plan = membership ? await recordOfOptional(ctx, actor, "plan", stringValue(membership.planId)) : null;
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const outstandingCharges = (await chargeRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((charge) => charge.memberId === value.id && collectibleOutstandingValue(charge, today) > 0)
    .map((charge) => chargeProjection(charge, today));
  const checkins = (await recordsOf(ctx, actor, "checkIn"))
    .map((record) => data(record.data))
    .filter((checkin) => checkin.memberId === value.id && checkin.decision !== "blocked")
    .sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt)));
  return {
    id: stringValue(value.id),
    memberNumber: stringValue(value.memberNumber),
    fullName: stringValue(value.fullName),
    fullNameAr: optionalString(value.fullNameAr),
    phone: stringValue(value.phone),
    email: optionalString(value.email),
    homeBranchId: stringValue(value.homeBranchId),
    status: stringValue(value.status, "active"),
    tags: arrayValue(value.tags),
    membershipStatus: membership ? statusOfMembership(membership, todayIn(actor.organization.timezone || TZ_FALLBACK)) : undefined,
    currentPlanName: plan ? stringValue(data(plan.data).name) : undefined,
    membershipEndDate: membership ? optionalString(membership.endDate) : undefined,
    outstanding: money(outstandingCharges.reduce((sum, charge) => sum + amountOf(charge.outstandingAmount), 0), actor.organization.currency),
    outstandingCharges,
    lastCheckInAt: checkins[0] ? optionalString(checkins[0].occurredAt) : undefined,
    createdAt: stringValue(value.createdAt, isoNow()),
  };
}

/**
 * Member lists are rendered on the dashboard, reception, and CRM hand-offs.
 * Keep the row projection equivalent to toMemberSummary, but load the shared
 * membership, plan, charge, and check-in collections once per request. The
 * previous per-row currentMembership/outstanding/check-in reads made a
 * 100-member page fan out into hundreds of Convex queries and made navigation
 * feel frozen on larger gyms.
 */
async function toMemberSummaries(ctx: ReadContext, actor: ActorContext, values: Data[]): Promise<Data[]> {
  const [memberships, plans, charges, checkIns] = await Promise.all([
    membershipRecords(ctx, actor),
    recordsOf(ctx, actor, "plan"),
    chargeRecords(ctx, actor),
    recordsOf(ctx, actor, "checkIn"),
  ]);
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const rank: Record<string, number> = { active: 0, expiring: 0, frozen: 0, depleted: 1, scheduled: 2, expired: 3, cancelled: 4 };
  const membershipsByMember = new Map<string, Data[]>();
  for (const record of memberships) {
    const membership = data(record.data);
    const memberId = optionalString(membership.memberId);
    if (!memberId) continue;
    const list = membershipsByMember.get(memberId) ?? [];
    list.push(membership);
    membershipsByMember.set(memberId, list);
  }
  const plansById = new Map(plans.map((record) => [record.publicId, data(record.data)]));
  const chargesByMember = new Map<string, Data[]>();
  for (const record of charges) {
    const charge = data(record.data);
    const memberId = optionalString(charge.memberId);
    if (!memberId) continue;
    const list = chargesByMember.get(memberId) ?? [];
    list.push(charge);
    chargesByMember.set(memberId, list);
  }
  const lastCheckInByMember = new Map<string, string>();
  for (const record of checkIns) {
    const checkIn = data(record.data);
    if (checkIn.decision === "blocked") continue;
    const memberId = optionalString(checkIn.memberId);
    if (!memberId) continue;
    const occurredAt = optionalString(checkIn.occurredAt);
    if (occurredAt && (!lastCheckInByMember.has(memberId) || occurredAt > lastCheckInByMember.get(memberId)!)) lastCheckInByMember.set(memberId, occurredAt);
  }
  return values.map((value) => {
    const memberId = stringValue(value.id);
    const terms = membershipsByMember.get(memberId) ?? [];
    const membership = terms
      .map((candidate) => ({ candidate, status: statusOfMembership(candidate, today) }))
      .sort((left, right) => (rank[left.status] ?? 5) - (rank[right.status] ?? 5) || stringValue(right.candidate.endDate).localeCompare(stringValue(left.candidate.endDate)))[0]?.candidate;
    const plan = membership ? plansById.get(stringValue(membership.planId)) : undefined;
    const outstanding = (chargesByMember.get(memberId) ?? []).reduce((sum, charge) => sum + collectibleOutstandingValue(charge, today), 0);
    return {
      id: memberId,
      memberNumber: stringValue(value.memberNumber),
      fullName: stringValue(value.fullName),
      fullNameAr: optionalString(value.fullNameAr),
      phone: stringValue(value.phone),
      email: optionalString(value.email),
      homeBranchId: stringValue(value.homeBranchId),
      status: stringValue(value.status, "active"),
      tags: arrayValue(value.tags),
      membershipStatus: membership ? statusOfMembership(membership, today) : undefined,
      currentPlanName: plan ? stringValue(plan.name) : undefined,
      membershipEndDate: membership ? optionalString(membership.endDate) : undefined,
      outstanding: money(outstanding, actor.organization.currency),
      outstandingCharges: (chargesByMember.get(memberId) ?? [])
        .filter((charge) => collectibleOutstandingValue(charge, today) > 0)
        .map((charge) => chargeProjection(charge, today)),
      lastCheckInAt: lastCheckInByMember.get(memberId),
      createdAt: stringValue(value.createdAt, isoNow()),
    };
  });
}

async function recordOfOptional(ctx: ReadContext, actor: ActorContext, entityType: string, id: string): Promise<DomainRecord | null> {
  if (!id) return null;
  const record = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) =>
      q.eq("organizationId", actor.organization._id).eq("entityType", entityType).eq("publicId", id),
    )
    .unique();
  if (!record) return null;
  if (record.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(record.branchId)) return null;
  return record;
}

async function toMemberDetail(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const summary = await toMemberSummary(ctx, actor, value);
  const checkins = (await recordsOf(ctx, actor, "checkIn"))
    .map((record) => data(record.data))
    .filter((checkin) => checkin.memberId === value.id && checkin.decision !== "blocked");
  const payments = (await paymentRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((payment) => payment.memberId === value.id && payment.status !== "voided")
    .reduce((sum, payment) => sum + amountOf(payment.amount), 0);
  const recent = checkins.map((checkin) => businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK)).sort().at(-1);
  const storedPreference = data(value.marketingPreference);
  const storedStatus = optionalString(storedPreference.status);
  const marketingStatus = storedStatus === "explicit_opt_in" || storedStatus === "explicit_opt_out" || storedStatus === "unknown"
    ? storedStatus
    : optionalString(storedPreference.source) && storedPreference.source !== "system_default"
      ? (marketingPreference(storedPreference.optedIn) ? "explicit_opt_in" : "explicit_opt_out")
      : value.marketingOptIn === false ? "explicit_opt_out" : "unknown";
  const marketingOptIn = marketingStatus === "explicit_opt_in";
  const marketingPreferenceValue: Data = typeof storedPreference.source === "string"
    ? { ...storedPreference, optedIn: marketingOptIn, status: marketingStatus }
    : { optedIn: false, status: "unknown", source: "system_default" };
  const photoAsset = (await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", actor.organization._id).eq("ownerType", "member_photo").eq("ownerPublicId", stringValue(value.id))).collect()).find((asset) => asset.status === "active" && asset.visibility === "private");
  const photoUrl = photoAsset ? (await ctx.storage.getUrl(photoAsset.storageId)) ?? undefined : undefined;
  const detail: Data = {
    ...summary,
    photoUrl,
    gender: optionalString(value.gender),
    dateOfBirth: optionalString(value.dateOfBirth),
    preferredLanguage: stringValue(value.preferredLanguage, "en"),
    emergencyContactName: optionalString(value.emergencyContactName),
    emergencyContactRelationship: optionalString(value.emergencyContactRelationship),
    emergencyContactPhone: optionalString(value.emergencyContactPhone),
    addressLine1: optionalString(value.addressLine1),
    city: optionalString(value.city),
    customerProfileId: optionalString(value.customerProfileId),
    customerProfileSyncedAt: optionalString(value.customerProfileSyncedAt),
    source: optionalString(value.source),
    assignedSalespersonId: optionalString(value.assignedSalespersonId),
    marketingOptIn,
    marketingPreference: marketingPreferenceValue,
    notes: optionalString(value.notes),
    archivedAt: optionalString(value.archivedAt),
      stats: {
      checkInsLast30Days: checkins.filter((checkin) => diffDays(businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK), todayIn(actor.organization.timezone || TZ_FALLBACK)) <= 30).length,
      totalCheckIns: checkins.length,
      lifetimeValue: money(payments, actor.organization.currency),
      outstanding: summary.outstanding,
      daysSinceLastCheckIn: recent ? Math.max(0, diffDays(recent, todayIn(actor.organization.timezone || TZ_FALLBACK))) : undefined,
    },
  };
  if (hasPermission(actor, "members.sensitive_notes.read")) detail.sensitiveNotes = optionalString(value.sensitiveNotes);
  return detail;
}

async function toPlan(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const subscribers = (await membershipRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((membership) => membership.planId === value.id)
    .filter((membership) => ["active", "expiring", "frozen"].includes(statusOfMembership(membership, todayIn(actor.organization.timezone || TZ_FALLBACK)))).length;
  return { ...value, includedPtSessions: numberValue(value.includedPtSessions), activeSubscribers: subscribers, basePrice: { ...data(value.basePrice), currency: currencyOf(value.basePrice, actor.organization.currency) } };
}

async function toMembership(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const charge = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).find((item) => item.membershipId === value.id);
  const status = statusOfMembership(value, todayIn(actor.organization.timezone || TZ_FALLBACK));
  const paid = amountOf(charge?.paidAmount);
  const total = amountOf(charge?.total);
  return {
    ...value,
    status,
    paymentStatus: charge?.status ?? (total === paid && total > 0 ? "paid" : "unpaid"),
    salePrice: { ...data(value.salePrice), currency: currencyOf(value.salePrice, actor.organization.currency) },
    discount: { ...data(value.discount), currency: currencyOf(value.discount, actor.organization.currency) },
  };
}

async function toMembershipSummary(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const memberRecord = await recordOfOptional(ctx, actor, "member", stringValue(value.memberId));
  const planRecord = await recordOfOptional(ctx, actor, "plan", stringValue(value.planId));
  const branch = await branchByPublicId(ctx, actor.organization._id, optionalString(value.homeBranchId));
  const charge = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).find((item) => item.membershipId === value.id);
  const membership = await toMembership(ctx, actor, value);
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const projectedCharge = charge ? chargeProjection(charge, today) : undefined;
  return {
    ...membership,
    memberName: memberRecord ? stringValue(data(memberRecord.data).fullName) : "Unknown member",
    memberNumber: memberRecord ? stringValue(data(memberRecord.data).memberNumber) : "—",
    planName: planRecord ? stringValue(data(planRecord.data).name) : "Unknown plan",
    branchName: branch?.name ?? "—",
    planFreezeAllowanceDays: planRecord ? numberValue(data(planRecord.data).freezeAllowanceDays) : 0,
    outstanding: money(projectedCharge ? collectibleOutstandingValue(projectedCharge, today) : 0, actor.organization.currency),
    upcomingAmount: money(projectedCharge && !projectedCharge.collectible && !["void", "refunded"].includes(stringValue(projectedCharge.status)) ? amountOf(projectedCharge.outstandingAmount) : 0, actor.organization.currency),
  };
}

/**
 * Membership lists are a hot path for finance and renewal work. Keep the
 * public response identical to toMembershipSummary, but load shared member,
 * plan, charge, and branch records once instead of re-reading the full charge
 * collection for every membership row.
 */
async function toMembershipSummaries(ctx: ReadContext, actor: ActorContext, values: Data[]): Promise<Data[]> {
  const [members, plans, charges, branches] = await Promise.all([
    memberRecords(ctx, actor),
    recordsOf(ctx, actor, "plan"),
    chargeRecords(ctx, actor),
    ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
  ]);
  const membersById = new Map(members.map((record) => [record.publicId, data(record.data)]));
  const plansById = new Map(plans.map((record) => [record.publicId, data(record.data)]));
  const chargesByMembership = new Map<string, Data>();
  for (const record of charges) {
    const charge = data(record.data);
    const membershipId = optionalString(charge.membershipId);
    if (membershipId && !chargesByMembership.has(membershipId)) chargesByMembership.set(membershipId, charge);
  }
  const branchesById = new Map(branches.map((branch) => [publicBranchId(branch), branch]));
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  return values.map((value) => {
    const member = membersById.get(stringValue(value.memberId));
    const plan = plansById.get(stringValue(value.planId));
    const branch = branchesById.get(stringValue(value.homeBranchId));
    const charge = chargesByMembership.get(stringValue(value.id));
    const status = statusOfMembership(value, today);
    const paid = amountOf(charge?.paidAmount);
    const total = amountOf(charge?.total);
    const membership = {
      ...value,
      status,
      paymentStatus: charge?.status ?? (total === paid && total > 0 ? "paid" : "unpaid"),
      salePrice: { ...data(value.salePrice), currency: currencyOf(value.salePrice, actor.organization.currency) },
      discount: { ...data(value.discount), currency: currencyOf(value.discount, actor.organization.currency) },
    };
    const projectedCharge = charge ? chargeProjection(charge, today) : undefined;
    return {
      ...membership,
      memberName: member ? stringValue(member.fullName) : "Unknown member",
      memberNumber: member ? stringValue(member.memberNumber) : "—",
      planName: plan ? stringValue(plan.name) : "Unknown plan",
      branchName: branch?.name ?? "—",
      planFreezeAllowanceDays: plan ? numberValue(plan.freezeAllowanceDays) : 0,
      outstanding: money(projectedCharge ? collectibleOutstandingValue(projectedCharge, today) : 0, actor.organization.currency),
      upcomingAmount: money(projectedCharge && !projectedCharge.collectible && !["void", "refunded"].includes(stringValue(projectedCharge.status)) ? amountOf(projectedCharge.outstandingAmount) : 0, actor.organization.currency),
    };
  });
}

async function toMembershipDetail(ctx: MutationCtx | QueryCtx, actor: ActorContext, value: Data): Promise<Data> {
  const memberRecord = await recordOf(ctx, actor, "member", stringValue(value.memberId));
  const planRecord = await recordOf(ctx, actor, "plan", stringValue(value.planId));
  const chargeRecord = (await chargeRecords(ctx, actor)).find((record) => data(record.data).membershipId === value.id);
  const adjustments = arrayValue(value.adjustments);
  const freezes = arrayValue(value.freezes);
  return {
    ...(await toMembership(ctx, actor, value)),
    member: await toMemberSummary(ctx, actor, data(memberRecord.data)),
    plan: await toPlan(ctx, actor, data(planRecord.data)),
    charge: chargeRecord ? chargeProjection(data(chargeRecord.data), todayIn(actor.organization.timezone || TZ_FALLBACK)) : undefined,
    adjustments,
    freezes,
  };
}

async function toLeadSummary(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const branch = await branchByPublicId(ctx, actor.organization._id, optionalString(value.branchId));
  const owner = optionalString(value.ownerId) ? await userByPublicId(ctx, actor.organization._id, stringValue(value.ownerId)) : null;
  const attempts = (await recordsOf(ctx, actor, "timeline"))
    .map((record) => data(record.data))
    .filter((event) => event.leadId === value.id && event.type === "call_attempt")
    .sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt)));
  const nextFollowUpAt = optionalString(value.nextFollowUpAt);
  const open = value.stage !== "won" && value.stage !== "lost";
  return {
    ...value,
    branchName: branch?.name ?? "—",
    ownerName: owner?.fullName,
    lastContactOutcome: attempts[0] ? optionalString(data(attempts[0].meta).outcome) : undefined,
    lastContactAt: attempts[0] ? optionalString(attempts[0].occurredAt) : undefined,
    overdue: open && Boolean(nextFollowUpAt && new Date(nextFollowUpAt).getTime() < Date.now()),
  };
}

/**
 * Lead lists are a hot path for the pipeline and follow-up queues. The
 * original mapper loaded branches, users and the full timeline once per lead,
 * turning a 100-row page into hundreds of database reads. Build those lookup
 * maps once per page instead; detail/mutation paths still use the focused
 * mapper above.
 */
async function toLeadSummaries(ctx: ReadContext, actor: ActorContext, values: Data[]): Promise<Data[]> {
  const [branches, users, memberships, timelineRecords] = await Promise.all([
    ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
    ctx.db.query("users").collect(),
    ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
    recordsOf(ctx, actor, "timeline"),
  ]);
  const branchNames = new Map(branches.map((branch) => [publicBranchId(branch), branch.name]));
  const activeUserIds = new Set(memberships.filter((membership) => membership.active).map((membership) => membership.userId));
  const ownerNames = new Map(users.filter((user) => activeUserIds.has(user._id)).map((user) => [publicUserId(user), user.fullName]));
  const attemptsByLead = new Map<string, Data[]>();
  for (const record of timelineRecords) {
    const event = data(record.data);
    const leadId = optionalString(event.leadId);
    if (!leadId || event.type !== "call_attempt") continue;
    const attempts = attemptsByLead.get(leadId) ?? [];
    attempts.push(event);
    attemptsByLead.set(leadId, attempts);
  }
  for (const attempts of attemptsByLead.values()) attempts.sort((left, right) => stringValue(right.occurredAt).localeCompare(stringValue(left.occurredAt)));
  return values.map((value) => {
    const attempts = attemptsByLead.get(stringValue(value.id)) ?? [];
    const nextFollowUpAt = optionalString(value.nextFollowUpAt);
    const open = value.stage !== "won" && value.stage !== "lost";
    return {
      ...value,
      branchName: branchNames.get(stringValue(value.branchId)) ?? "—",
      ownerName: optionalString(value.ownerId) ? ownerNames.get(stringValue(value.ownerId)) : undefined,
      lastContactOutcome: attempts[0] ? optionalString(data(attempts[0].meta).outcome) : undefined,
      lastContactAt: attempts[0] ? optionalString(attempts[0].occurredAt) : undefined,
      overdue: open && Boolean(nextFollowUpAt && new Date(nextFollowUpAt).getTime() < Date.now()),
    };
  });
}

async function userByPublicId(ctx: ReadContext, organizationId: Id<"organizations">, id: string): Promise<User | null> {
  const users = await ctx.db.query("users").collect();
  const user = users.find((item) => (item.publicId ?? item._id) === id);
  if (!user) return null;
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", user._id))
    .unique();
  return membership?.active ? user : null;
}

async function assertLeadOwner(ctx: ReadContext, actor: ActorContext, ownerId: string): Promise<void> {
  const owner = (await ctx.db.query("users").collect()).find((candidate) => publicUserId(candidate) === ownerId);
  if (!owner) domainError("NOT_FOUND", "Lead owner not found.", { correlationId: actor.correlationId });
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", owner._id))
    .unique();
  if (!membership) domainError("NOT_FOUND", "Lead owner not found.", { correlationId: actor.correlationId });
  if (organizationUserStatus(owner, membership) !== "active" || !["owner", "manager", "sales"].includes(membership.role)) {
    domainError("VALIDATION_ERROR", "Leads can only be assigned to active owner, manager, or sales staff.", { correlationId: actor.correlationId });
  }
}

/**
 * Staff access is organization-local. A person's Convex user row is the
 * global identity shared by every gym, so a local membership deactivation
 * must not overwrite `users.status` and revoke access to other gyms.
 */
function organizationUserStatus(user: User, membership: Doc<"organizationMemberships">): "active" | "invited" | "deactivated" {
  if (!membership.active || membership.invitationStatus === "revoked") return "deactivated";
  if (membership.invitationStatus === "pending" || user.status === "invited") return "invited";
  if (user.status === "deactivated") return "deactivated";
  return "active";
}

async function toTask(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const owner = await userByPublicId(ctx, actor.organization._id, stringValue(value.ownerId));
  const subjectRecord = value.leadId
    ? await recordOfOptional(ctx, actor, "lead", stringValue(value.leadId))
    : value.memberId
      ? await recordOfOptional(ctx, actor, "member", stringValue(value.memberId))
      : null;
  return {
    ...value,
    ownerName: owner?.fullName ?? "Unassigned",
    subjectName: subjectRecord ? stringValue(data(subjectRecord.data).fullName) : stringValue(value.subjectName, "—"),
  };
}

async function toTaskSummaries(ctx: ReadContext, actor: ActorContext, values: Data[], leads: Data[], members: Data[]): Promise<Data[]> {
  const [users, memberships] = await Promise.all([
    ctx.db.query("users").collect(),
    ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
  ]);
  const activeUserIds = new Set(memberships.filter((membership) => membership.active).map((membership) => String(membership.userId)));
  const ownersById = new Map(users.filter((user) => activeUserIds.has(String(user._id))).map((user) => [publicUserId(user), user.fullName]));
  const subjectsById = new Map([
    ...leads.map((record) => [record.id, stringValue(record.fullName)] as const),
    ...members.map((record) => [record.id, stringValue(record.fullName)] as const),
  ]);
  return values.map((value) => ({
    ...value,
    ownerName: optionalString(value.ownerId) ? ownersById.get(stringValue(value.ownerId)) ?? "Unassigned" : "Unassigned",
    subjectName: subjectsById.get(stringValue(optionalString(value.leadId) ?? optionalString(value.memberId))) ?? stringValue(value.subjectName, "—"),
  }));
}

async function toTransactionSummaries(ctx: ReadContext, actor: ActorContext, values: Data[]): Promise<Data[]> {
  const [members, branches] = await Promise.all([
    memberRecords(ctx, actor),
    ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
  ]);
  const membersById = new Map(members.map((record) => [record.publicId, data(record.data)]));
  const branchesById = new Map(branches.map((branch) => [publicBranchId(branch), branch.name]));
  return values.map((value) => {
    const member = membersById.get(stringValue(value.memberId));
    const customer = value.customer && typeof value.customer === "object" ? data(value.customer) : undefined;
    const customerName = optionalString(customer?.fullName);
    const customerNumber = optionalString(customer?.memberNumber);
    return {
      ...value,
      memberName: customerName ?? (member ? stringValue(member.fullName) : "—"),
      memberNumber: customerNumber ?? (customer?.kind === "guest" ? "Guest" : member ? stringValue(member.memberNumber) : "—"),
      branchName: branchesById.get(stringValue(value.branchId)) ?? "—",
    };
  });
}

async function receiptDetail(ctx: ReadContext, actor: ActorContext, receiptId: string): Promise<Data> {
  const receipt = await recordOf(ctx, actor, "receipt", receiptId);
  const receiptData = data(receipt.data);
  const retailSaleId = optionalString(receiptData.retailSaleId);
  if (retailSaleId) {
    const sale = await ctx.db.query("retailSales").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", retailSaleId)).unique();
    if (!sale) domainError("NOT_FOUND", "Retail sale not found.", { correlationId: actor.correlationId });
    const branch = await ctx.db.get(sale.branchId);
    assertBranchAccess(actor, branch);
    if (!branch) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
    const customer = data(sale.customer);
    const originalPaymentId = `retail-payment-${sale.publicId}`;
    const originalPayment = {
      id: originalPaymentId,
      organizationId: publicOrganizationId(actor.organization),
      branchId: publicBranchId(branch),
      type: "retail_sale",
      amount: { amount: sale.totalMinor, currency: sale.currency },
      method: sale.method,
      status: sale.status,
      refundedAmount: sale.refundedMinor ? { amount: sale.refundedMinor, currency: sale.currency } : undefined,
      refundReason: sale.refundReason,
      voidReason: sale.voidReason,
      customer,
      receiptId: sale.receiptId,
      receiptNumber: sale.receiptNumber,
      collectedById: sale.createdByPublicId,
      collectedByName: sale.createdByName,
      shiftId: sale.shiftId,
      externalReference: sale.externalReference,
      idempotencyKey: sale.idempotencyKey,
      occurredAt: utcIso(sale.createdAt),
    };
    const retailPayments = (await paymentRecords(ctx, actor)).map((row) => data(row.data));
    const receiptPaymentId = stringValue(receiptData.paymentId, originalPaymentId);
    const payment = retailPayments.find((item) => item.id === receiptPaymentId) ?? originalPayment;
    const relatedPayments = retailPayments.filter((item) => item.id !== payment.id && (item.originalPaymentId === originalPaymentId || item.id === originalPaymentId));
    const retailSale = {
      id: sale.publicId,
      organizationId: publicOrganizationId(actor.organization),
      branchId: publicBranchId(branch),
      receiptId: sale.receiptId,
      receiptNumber: sale.receiptNumber,
      customer,
      lines: sale.lines.map((line) => ({ productId: line.productId, sku: line.sku, productName: line.productName, quantity: line.quantity, unitPrice: { amount: line.unitPriceMinor, currency: line.currency }, lineTotal: { amount: line.lineTotalMinor, currency: line.currency }, unitCost: line.unitCostMinor === undefined || line.unitCostCurrency === undefined ? undefined : { amount: line.unitCostMinor, currency: line.unitCostCurrency } })),
      subtotal: { amount: sale.subtotalMinor, currency: sale.currency },
      total: { amount: sale.totalMinor, currency: sale.currency },
      status: sale.status,
      refundedAmount: sale.refundedMinor ? { amount: sale.refundedMinor, currency: sale.currency } : undefined,
      returnedLines: sale.returnedLines,
      refundReason: sale.refundReason,
      voidReason: sale.voidReason,
      voidedAt: sale.voidedAt ? utcIso(sale.voidedAt) : undefined,
      method: sale.method,
      externalReference: sale.externalReference,
      shiftId: sale.shiftId,
      idempotencyKey: sale.idempotencyKey,
      createdById: sale.createdByPublicId,
      createdByName: sale.createdByName,
      createdAt: utcIso(sale.createdAt),
      updatedAt: utcIso(sale.updatedAt),
    };
    return {
      receipt: receiptData,
      receiptId: sale.receiptId,
      organization: { name: actor.organization.name, receiptFooter: stringValue(actor.organization.receiptFooter), taxRatePercent: numberValue(actor.organization.taxRatePercent) },
      branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone },
      member: customer.kind === "member" ? { fullName: stringValue(customer.fullName), memberNumber: stringValue(customer.memberNumber, "Member") } : undefined,
      customer,
      payment,
      retailSale,
      relatedPayments,
    };
  }
  const payment = await recordOf(ctx, actor, "payment", stringValue(receiptData.paymentId));
  const paymentData = data(payment.data);
  const branch = await branchByPublicId(ctx, actor.organization._id, optionalString(paymentData.branchId));
  const member = await recordOf(ctx, actor, "member", stringValue(paymentData.memberId));
  const charge = paymentData.chargeId ? await recordOfOptional(ctx, actor, "charge", stringValue(paymentData.chargeId)) : null;
  const related = (await paymentRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((item) => item.originalPaymentId === paymentData.id || (paymentData.originalPaymentId && item.id === paymentData.originalPaymentId));
  const organization = organizationView(actor.organization);
  return {
    receipt: receiptData,
    organization: { name: actor.organization.name, receiptFooter: stringValue(organization.receiptFooter), taxRatePercent: numberValue(organization.taxRatePercent) },
    branch: {
      name: branch?.name ?? "—",
      code: branch?.code ?? "—",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
    },
    member: { fullName: stringValue(data(member.data).fullName), memberNumber: stringValue(data(member.data).memberNumber) },
    customer: { kind: "member", fullName: stringValue(data(member.data).fullName), phone: optionalString(data(member.data).phone), memberId: stringValue(paymentData.memberId), memberNumber: stringValue(data(member.data).memberNumber) },
    payment: paymentData,
    charge: charge ? data(charge.data) : undefined,
    relatedPayments: related,
  };
}

async function auditPage(ctx: QueryCtx, actor: ActorContext, input: Data) {
  requirePermission(actor, "audit.read");
  const approvalReviews = await recordsOf(ctx, actor, "approvalReview");
  const reviewDecisions = new Map(
    approvalReviews.map((review) => {
      const value = data(review.data);
      return [stringValue(value.auditEventId), stringValue(value.decision)] as const;
    }),
  );
  let rows = await ctx.db
    .query("auditEvents")
    .withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id))
    .order("desc")
    .collect();
  if (actor.branchScope === "selected") rows = rows.filter((row) => (!row.branchId && !row.destinationBranchId) || actor.branchIds.includes(row.branchId!) || actor.branchIds.includes(row.destinationBranchId!));
  const category = optionalString(input.category);
  const actorId = optionalString(input.actorId);
  const entityId = optionalString(input.entityId);
  const branchId = optionalString(input.branchId);
  const from = optionalString(input.from);
  const to = optionalString(input.to);
  const branch = branchId ? await branchByPublicId(ctx, actor.organization._id, branchId) : null;
  rows = rows.filter((row) =>
    (!category || row.category === category) &&
    (!actorId || row.actorPublicId === actorId) &&
    (!entityId || row.entityPublicId === entityId) &&
    (!branch || row.branchId === branch._id || row.destinationBranchId === branch._id) &&
    (!from || row.occurredAt >= new Date(from).getTime()) &&
    (!to || row.occurredAt <= new Date(`${to}T23:59:59.999Z`).getTime()) &&
    matchesSearch([row.summary, row.entityLabel, row.actorName, row.action], optionalString(input.search)),
  );
  const mapped = await Promise.all(rows.map(async (row) => ({
    id: row.publicId,
    organizationId: publicOrganizationId(actor.organization),
    branchId: row.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.branchId) : undefined,
    destinationBranchId: row.destinationBranchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.destinationBranchId) : undefined,
    actorId: row.actorPublicId,
    actorName: row.actorName,
    actorRole: row.actorRole === "member" ? "member" : frontendRole(row.actorRole),
    category: row.category,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityPublicId,
    entityLabel: row.entityLabel,
    summary: row.summary,
    reason: row.reason,
    before: row.before,
    after: row.after,
    approvalStatus: reviewDecisions.get(row.publicId) ?? row.approvalStatus,
    correlationId: row.correlationId,
    occurredAt: utcIso(row.occurredAt),
  })));
  return page(mapped, input);
}

async function publicBranchIdFromId(ctx: ReadContext, organizationId: Id<"organizations">, id: Id<"branches">): Promise<string> {
  const branch = await ctx.db.get(id);
  return branch?.publicId ?? id;
}

async function publicUserIdFromId(ctx: ReadContext, organizationId: Id<"organizations">, id: Id<"users">): Promise<string | undefined> {
  const user = await ctx.db.get(id);
  if (!user) return undefined;
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", id)).unique();
  return membership ? publicUserId(user) : undefined;
}

function marketplaceView(value: Data, includePlatformFields = false): Data {
  return {
    id: stringValue(value.id),
    name: stringValue(value.name),
    shortName: stringValue(value.shortName),
    tagline: stringValue(value.tagline),
    description: stringValue(value.description),
    city: stringValue(value.city),
    areas: arrayValue(value.areas),
    category: stringValue(value.category),
    audience: stringValue(value.audience),
    rating: typeof value.rating === "number" ? numberValue(value.rating) : undefined,
    reviewCount: typeof value.reviewCount === "number" ? numberValue(value.reviewCount) : undefined,
    memberCount: numberValue(value.memberCount),
    branchCount: numberValue(value.branchCount),
    fromPriceMinor: numberValue(value.fromPriceMinor),
    amenities: arrayValue(value.amenities),
    taglineAr: optionalString(value.taglineAr),
    descriptionAr: optionalString(value.descriptionAr),
    contactEmail: optionalString(value.contactEmail),
    contactPhone: optionalString(value.contactPhone),
    websiteUrl: optionalString(value.websiteUrl),
    instagramUrl: optionalString(value.instagramUrl),
    profileVersion: value.profileVersion === undefined ? undefined : numberValue(value.profileVersion),
    accent: stringValue(value.accent),
    featured: booleanValue(value.featured),
    subscriptionStatus: stringValue(value.subscriptionStatus),
    rivetPlan: stringValue(value.rivetPlan),
    joinedAt: stringValue(value.joinedAt),
    lastActiveAt: stringValue(value.lastActiveAt),
    // Revenue is platform-private. Public discovery receives a zero placeholder
    // to preserve the existing view model without disclosing tenant finances.
    monthlyRevenueMinor: includePlatformFields ? numberValue(value.monthlyRevenueMinor) : 0,
    ...(includePlatformFields ? {
      isPublic: booleanValue(value.isPublic),
      isProvisioned: typeof value.isProvisioned === "boolean" ? value.isProvisioned : undefined,
      isArchived: booleanValue(value.isArchived),
      archivedAt: optionalString(value.archivedAt),
      archiveReason: optionalString(value.archiveReason),
      trialEndsAt: optionalString(value.trialEndsAt),
      subscriptionStartedAt: optionalString(value.subscriptionStartedAt),
      currentPeriodEndsAt: optionalString(value.currentPeriodEndsAt),
      cancelledAt: optionalString(value.cancelledAt),
      subscriptionStatusReason: optionalString(value.subscriptionStatusReason),
      billingInterval: optionalString(value.billingInterval),
      logoUrl: optionalString(value.logoUrl),
    } : {}),
    branches: arrayValue(value.branches).map((item) => {
      const branch = data(item);
      return {
        id: stringValue(branch.id),
        name: stringValue(branch.name),
        area: stringValue(branch.area),
        address: stringValue(branch.address),
        trialSlots: arrayValue(branch.trialSlots),
      };
    }),
  };
}

function platformMarketplaceProjection(value: Data, organization: Organization | null, entitlement: Doc<"organizationEntitlements"> | null = null): Data {
  // Keep unprovisioned legacy rows in the platform snapshot for cleanup, but
  // never present them as publishable tenants.
  if (!organization) return {
    ...value,
    isProvisioned: false,
    subscriptionStatus: "suspended",
    rivetPlan: undefined,
    isPublic: false,
    trialEndsAt: undefined,
    subscriptionStartedAt: undefined,
    currentPeriodEndsAt: undefined,
    cancelledAt: undefined,
    subscriptionStatusReason: "Organization is not provisioned.",
    billingInterval: undefined,
    logoUrl: undefined,
    lastActiveAt: undefined,
  };
  const status = platformSubscriptionStatusForOrganization(organization.status);
  const plan = platformPlanFromFacts(value, organization, entitlement);
  const trialCurrent = status !== "trial" || (organization.trialEndsAt !== undefined && organization.trialEndsAt > Date.now());
  const isArchived = organization.archivedAt !== undefined || booleanValue(value.isArchived);
  return {
    ...value,
    isProvisioned: true,
    subscriptionStatus: status,
    ...(plan ? { rivetPlan: plan } : {}),
    isPublic: !isArchived && (status === "active" || (status === "trial" && trialCurrent)) && booleanValue(value.isPublic),
    isArchived,
    archivedAt: organization.archivedAt !== undefined ? utcIso(organization.archivedAt) : optionalString(value.archivedAt),
    archiveReason: organization.archiveReason ?? optionalString(value.archiveReason),
    // Lifecycle dates and reasons are tenant-owned. Explicitly clear stale
    // directory values when the authoritative organization has no value.
    subscriptionStartedAt: organization.subscriptionStartedAt !== undefined ? utcIso(organization.subscriptionStartedAt) : undefined,
    trialEndsAt: organization.trialEndsAt !== undefined ? utcIso(organization.trialEndsAt) : undefined,
    currentPeriodEndsAt: organization.currentPeriodEndsAt !== undefined ? utcIso(organization.currentPeriodEndsAt) : undefined,
    cancelledAt: organization.cancelledAt !== undefined ? utcIso(organization.cancelledAt) : undefined,
    subscriptionStatusReason: organization.subscriptionStatusReason ?? undefined,
    billingInterval: organization.billingInterval ?? "monthly",
  };
}

function acceptsPublicTrialRequests(value: Data, authoritativeStatus = stringValue(value.subscriptionStatus), authoritativeTrialEndsAt?: number, useAuthoritativeTrialDate = false): boolean {
  if (!booleanValue(value.isPublic) || !booleanValue(value.profilePublished, true) || !["active", "trial"].includes(authoritativeStatus)) return false;
  if (authoritativeStatus !== "trial") return true;
  const trialEndsAt = useAuthoritativeTrialDate ? authoritativeTrialEndsAt : validSubscriptionTimestamp(value.trialEndsAt);
  return trialEndsAt !== undefined && trialEndsAt > Date.now();
}

function gymApplicationView(application: Doc<"gymApplications">): Data {
  return {
    id: application.publicId,
    gymName: application.gymName,
    ownerName: application.ownerName,
    email: application.email,
    contactNumber: application.contactNumber,
    plan: application.plan,
    billingInterval: application.billingInterval ?? "monthly",
    status: application.status,
    notificationStatus: application.notificationStatus,
    notificationError: application.notificationError,
    reviewNotificationStatus: application.reviewNotificationStatus ?? "not_configured",
    reviewNotificationError: application.reviewNotificationError,
    submittedAt: utcIso(application.submittedAt),
    updatedAt: utcIso(application.updatedAt),
    reviewedAt: application.reviewedAt ? utcIso(application.reviewedAt) : undefined,
    reviewedBy: application.reviewedBy,
    reviewNotes: application.reviewNotes,
    provisioningStatus: application.provisioningStatus ?? "not_started",
    provisioningCheckpoint: application.provisioningCheckpoint,
    provisioningOutcome: application.provisioningOutcome,
    provisioningAttemptCount: application.provisioningAttemptCount,
    provisioningLastCorrelationId: application.provisioningLastCorrelationId,
    provisioningProviderStatus: application.provisioningProviderStatus,
    provisioningProviderCode: application.provisioningProviderCode,
    provisioningStartedAt: application.provisioningStartedAt ? utcIso(application.provisioningStartedAt) : undefined,
    provisioningError: application.provisioningError,
    provisionedAt: application.provisionedAt ? utcIso(application.provisionedAt) : undefined,
    provisionedOrganizationId: application.provisionedOrganizationId,
    provisionedBranchId: application.provisionedBranchId,
    clerkOrganizationId: application.clerkOrganizationId,
    clerkInvitationId: application.clerkInvitationId,
    clerkInvitationStatus: application.clerkInvitationStatus,
  };
}

async function marketplaceRows(ctx: ReadContext): Promise<DomainRecord[]> {
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym"))
    .collect();
}

async function legacyCustomerProfileForUser(ctx: ReadContext, userId: string): Promise<Data | undefined> {
  const records = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerProfile")).collect();
  const profiles = records.map((row) => {
    const value = data(row.data);
    return { ...value, id: row.publicId, userId: optionalString(value.userId) };
  });
  const record = findCustomerProfileByUserId(profiles, userId);
  return record ? data(record) : undefined;
}

async function customerProfileForUser(ctx: ReadContext, userId: string): Promise<Data | undefined> {
  const profile = await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", userId)).unique();
  if (profile) {
    return {
      id: profile.publicId,
      userId: profile.userId,
      name: profile.name,
      nameAr: profile.nameAr,
      email: profile.email,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      gender: profile.gender,
      preferredLanguage: profile.preferredLanguage,
      addressLine1: profile.addressLine1,
      city: profile.city,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactRelationship: profile.emergencyContactRelationship,
      emergencyContactPhone: profile.emergencyContactPhone,
      initials: profile.initials,
      context: profile.context,
      marketingPreference: customerPreferenceFromProfile(profile),
    };
  }
  // Keep existing preview/pilot profiles readable during the table migration,
  // but never fall back to email matching: only the authenticated user ID can
  // claim a legacy record.
  return await legacyCustomerProfileForUser(ctx, userId);
}

const CUSTOMER_PROFILE_MEMBER_FIELDS = [
  "fullName",
  "email",
  "phone",
  "dateOfBirth",
  "gender",
  "preferredLanguage",
  "addressLine1",
  "city",
  "emergencyContactName",
  "emergencyContactRelationship",
  "emergencyContactPhone",
] as const;

function customerProfileMemberFields(profile: Data, syncedAt: string): Data {
  return {
    fullName: stringValue(profile.name),
    email: stringValue(profile.email).toLowerCase(),
    phone: stringValue(profile.phone),
    dateOfBirth: optionalString(profile.dateOfBirth),
    gender: optionalString(profile.gender),
    preferredLanguage: stringValue(profile.preferredLanguage, "en"),
    addressLine1: optionalString(profile.addressLine1),
    city: optionalString(profile.city),
    emergencyContactName: optionalString(profile.emergencyContactName),
    emergencyContactRelationship: optionalString(profile.emergencyContactRelationship),
    emergencyContactPhone: optionalString(profile.emergencyContactPhone),
    customerProfileId: stringValue(profile.id),
    customerProfileSyncedAt: syncedAt,
  };
}

function customerProfileFieldValue(value: Data, field: string): unknown {
  return field === "fullName" ? value.name : value[field];
}

function changedCustomerProfileFields(previous: Data, next: Data): string[] {
  return CUSTOMER_PROFILE_MEMBER_FIELDS.filter((field) => stringValue(customerProfileFieldValue(previous, field)) !== stringValue(customerProfileFieldValue(next, field)));
}

async function syncCustomerProfileToMemberRecord(
  ctx: MutationCtx,
  user: User,
  memberRecord: DomainRecord,
  profile: Data,
  changedFields: string[],
  correlationId: string,
): Promise<boolean> {
  const now = Date.now();
  const syncedAt = utcIso(now);
  const sharedFields = customerProfileMemberFields(profile, syncedAt);
  const previous = data(memberRecord.data);
  const actualChangedFields = changedFields.filter((field) => stringValue(previous[field]) !== stringValue(sharedFields[field]));
  if (actualChangedFields.length === 0 && previous.customerProfileId === sharedFields.customerProfileId) return false;
  await ctx.db.patch(memberRecord._id, { data: { ...previous, ...sharedFields }, updatedAt: now });
  await ctx.db.insert("auditEvents", {
    publicId: newPublicId(),
    organizationId: memberRecord.organizationId,
    branchId: memberRecord.branchId,
    actorUserId: user._id,
    actorPublicId: publicUserId(user),
    actorName: user.fullName,
    actorRole: "member",
    category: "members",
    action: "member.profile_sync",
    entityType: "member",
    entityPublicId: memberRecord.publicId,
    entityLabel: `${stringValue(previous.memberNumber, memberRecord.publicId)}`,
    summary: "Member-owned profile fields synchronized",
    after: { changedFields: actualChangedFields, customerProfileId: sharedFields.customerProfileId, synchronizedAt: syncedAt },
    correlationId,
    occurredAt: now,
  });
  return true;
}

async function syncCustomerProfileToLinkedMembers(
  ctx: MutationCtx,
  user: User,
  profile: Data,
  changedFields: string[],
  correlationId: string,
): Promise<void> {
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership")).collect();
  for (const row of rows) {
    const projection = data(row.data);
    if (!belongsToAuthenticatedCustomer(projection, publicUserId(user), stringValue(profile.id))) continue;
    const memberId = optionalString(projection.memberId);
    if (!memberId) continue;
    const memberRecord = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", row.organizationId).eq("entityType", "member").eq("publicId", memberId)).unique();
    if (memberRecord) await syncCustomerProfileToMemberRecord(ctx, user, memberRecord, profile, changedFields, correlationId);
  }
}

/**
 * A membership created before the member registered has no projection yet.
 * Once the member proves the same email through the authenticated identity,
 * link only an unambiguous exact-email member record in each gym. Phone or
 * browser-supplied IDs are deliberately not considered.
 */
async function linkExactEmailMembersToCustomerProfile(ctx: MutationCtx, user: User, profile: Data): Promise<void> {
  const memberRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect();
  const matches = memberRows.filter((row) => stringValue(data(row.data).email).trim().toLowerCase() === stringValue(profile.email).trim().toLowerCase());
  const byOrganization = new Map<string, DomainRecord[]>();
  for (const row of matches) byOrganization.set(String(row.organizationId), [...(byOrganization.get(String(row.organizationId)) ?? []), row]);
  for (const rows of byOrganization.values()) {
    if (rows.length !== 1) continue;
    const memberRecord = rows[0]!;
    const member = data(memberRecord.data);
    if (member.customerProfileId && member.customerProfileId !== profile.id) continue;
    const organization = await ctx.db.get(memberRecord.organizationId);
    if (!organization || organization.status === "suspended" || organization.status === "cancelled") continue;
    const staffMemberships = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).collect();
    if (staffMemberships.some((item) => item.active)) continue;
    const memberships = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership")).collect())
      .map((row) => ({ row, value: data(row.data) }))
      .filter(({ value }) => value.memberId === memberRecord.publicId);
    const marketplace = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym")).first();
    const marketplaceValue = data(marketplace?.data);
    const charges = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "charge")).collect();
    const checkIns = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "checkIn")).collect();
    for (const { row: membershipRow, value: membership } of memberships) {
      const planRecord = optionalString(membership.planId)
        ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "plan").eq("publicId", stringValue(membership.planId))).unique()
        : null;
      const plan = data(planRecord?.data);
      const branch = membershipRow.branchId ? await ctx.db.get(membershipRow.branchId) : null;
      const directoryBranch = arrayValue(marketplaceValue.branches).map(data).find((item) => item.internalBranchId === membership.homeBranchId || item.internalBranchId === (branch ? publicBranchId(branch) : undefined));
      const today = todayIn(organization.timezone || TZ_FALLBACK);
      const checks = checkIns.map((item) => data(item.data)).filter((item) => item.memberId === memberRecord.publicId && item.decision !== "blocked").sort((left, right) => stringValue(right.occurredAt).localeCompare(stringValue(left.occurredAt)));
      const balanceMinor = charges.map((item) => data(item.data)).filter((item) => item.memberId === memberRecord.publicId).reduce((total, item) => total + collectibleOutstandingValue(item, today), 0);
      const projection = {
        customerUserId: publicUserId(user),
        customerId: stringValue(profile.id),
        gymId: marketplace?.publicId ?? publicOrganizationId(organization),
        branchId: optionalString(directoryBranch?.id) ?? (branch ? publicBranchId(branch) : stringValue(membership.homeBranchId)),
        internalBranchId: branch ? publicBranchId(branch) : stringValue(membership.homeBranchId),
        memberId: memberRecord.publicId,
        membershipId: stringValue(membership.id, membershipRow.publicId),
        memberNumber: stringValue(member.memberNumber),
        planName: stringValue(plan.name, stringValue(membership.planName, "Membership")),
        status: statusOfMembership(membership, today),
        startDate: stringValue(membership.startDate),
        endDate: stringValue(membership.endDate),
        visitsThisMonth: checks.filter((item) => businessDate(stringValue(item.occurredAt), organization.timezone || TZ_FALLBACK).startsWith(today.slice(0, 7))).length,
        totalCheckIns: checks.length,
        remainingVisits: membership.remainingVisits,
        balanceMinor,
        lastCheckInAt: optionalString(checks[0]?.occurredAt),
      };
      const existingProjection = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "customerMembership").eq("publicId", projection.membershipId)).unique();
      if (existingProjection) await ctx.db.patch(existingProjection._id, { branchId: branch?._id, memberPublicId: memberRecord.publicId, data: { ...data(existingProjection.data), ...projection }, updatedAt: Date.now() });
      else await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "customerMembership", publicId: projection.membershipId, branchId: branch?._id, memberPublicId: memberRecord.publicId, createdAt: Date.now(), updatedAt: Date.now(), data: { id: projection.membershipId, ...projection } });
      await syncCustomerProfileToMemberRecord(ctx, user, memberRecord, profile, [...CUSTOMER_PROFILE_MEMBER_FIELDS], `membership-link-${projection.membershipId}`);
    }
  }
}

function belongsToAuthenticatedCustomer(value: Data, userId: string, profileId?: string): boolean {
  const ownerUserId = optionalString(value.customerUserId);
  if (ownerUserId) return ownerUserId === userId;
  return Boolean(profileId && optionalString(value.customerId) === profileId);
}

async function saveCustomerProfile(ctx: MutationCtx, user: User, input: Data): Promise<Data> {
  const userId = publicUserId(user);
  const email = user.email.trim().toLowerCase();
  if (!email) domainError("CONFIGURATION_ERROR", "The authenticated Clerk identity is missing an email claim.");
  const existing = await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", userId)).unique();
  const legacy = existing ? undefined : await legacyCustomerProfileForUser(ctx, userId);
  const profileId = existing?.publicId ?? optionalString(legacy?.id) ?? newPublicId();
  const value = buildCustomerProfileDraft({ userId, email, fullName: user.fullName, phone: user.phone }, input, profileId);
  const previous = existing ? {
    name: existing.name,
    email: existing.email,
    phone: existing.phone,
    dateOfBirth: existing.dateOfBirth,
    gender: existing.gender,
    preferredLanguage: existing.preferredLanguage,
    addressLine1: existing.addressLine1,
    city: existing.city,
    emergencyContactName: existing.emergencyContactName,
    emergencyContactRelationship: existing.emergencyContactRelationship,
    emergencyContactPhone: existing.emergencyContactPhone,
  } : data(legacy);
  const changedFields = changedCustomerProfileFields(previous, value);
  const now = Date.now();
  const preference = existing ? customerPreferenceFromProfile(existing) : customerPreferenceFromProfile(legacy ?? { createdAt: now });
  const preferenceChangedAt = preference.changedAt ? Date.parse(stringValue(preference.changedAt)) : now;
  const marketingState = preference.status === "unknown"
    ? {
        ...(existing?.marketingOptIn === undefined ? {} : { marketingOptIn: existing.marketingOptIn }),
        ...(existing?.marketingPreferenceStatus === undefined ? {} : { marketingPreferenceStatus: existing.marketingPreferenceStatus }),
        ...(existing?.marketingPreferenceSource === undefined ? {} : { marketingPreferenceSource: existing.marketingPreferenceSource }),
        ...(existing?.marketingPreferenceChangedAt === undefined ? {} : { marketingPreferenceChangedAt: existing.marketingPreferenceChangedAt }),
        ...(existing?.marketingPreferenceWordingVersion === undefined ? {} : { marketingPreferenceWordingVersion: existing.marketingPreferenceWordingVersion }),
      }
    : {
        marketingOptIn: booleanValue(preference.optedIn, false),
        marketingPreferenceStatus: stringValue(preference.status, "unknown") as "explicit_opt_in" | "explicit_opt_out" | "unknown",
        marketingPreferenceSource: stringValue(preference.source, "system_default") === "member_selected" ? "member_selected" as const : "system_default" as const,
        marketingPreferenceChangedAt: Number.isFinite(preferenceChangedAt) ? preferenceChangedAt : now,
        marketingPreferenceWordingVersion: stringValue(preference.wordingVersion, MARKETING_WORDING_VERSION),
      };
  const stored = {
    publicId: value.id,
    userId: value.userId,
    name: value.name,
    nameAr: value.nameAr,
    email: value.email,
    phone: value.phone,
    dateOfBirth: value.dateOfBirth,
    gender: value.gender,
    preferredLanguage: value.preferredLanguage,
    addressLine1: value.addressLine1,
    city: value.city,
    emergencyContactName: value.emergencyContactName,
    emergencyContactRelationship: value.emergencyContactRelationship,
    emergencyContactPhone: value.emergencyContactPhone,
    initials: value.initials,
    context: value.context,
    ...marketingState,
  };
  if (existing) {
    await ctx.db.patch(existing._id, { ...stored, updatedAt: now });
  } else {
    await ctx.db.insert("customerProfiles", { ...stored, createdAt: now, updatedAt: now });
    if (preference.status !== "unknown") await ctx.db.insert("customerMarketingPreferenceEvents", {
      userId,
      customerProfileId: value.id,
      optedIn: preference.optedIn,
      status: preference.status as "explicit_opt_in" | "explicit_opt_out",
      source: "system_default",
      wordingVersion: stringValue(preference.wordingVersion, MARKETING_WORDING_VERSION),
      changedAt: now,
    });
  }
  if (changedFields.length > 0) {
    await ctx.db.insert("customerProfileEvents", { userId, customerProfileId: value.id, changedFields, changedAt: now });
  }
  await syncCustomerProfileToLinkedMembers(ctx, user, { ...value, id: value.id }, changedFields, `customer-profile-${value.id}-${now}`);
  await linkExactEmailMembersToCustomerProfile(ctx, user, { ...value, id: value.id });
  return { ...value, marketingPreference: preference };
}

async function customerExperience(ctx: ReadContext): Promise<Data> {
  const { user } = await requireMember(ctx);
  const userId = publicUserId(user);
  const profile = await customerProfileForUser(ctx, userId);
  const preferenceEvents = await ctx.db.query("customerMarketingPreferenceEvents").withIndex("by_user_id", (q) => q.eq("userId", userId)).collect();
  const history = preferenceEvents
    .sort((a, b) => a.changedAt - b.changedAt)
    .map((event) => customerPreferenceEventView(event));
  const preference = history.at(-1) ?? data(profile?.marketingPreference ?? customerPreferenceFromProfile({ createdAt: Date.now() }));
  const preferenceHistory = history.length > 0 ? history : [preference];
  const membershipRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership")).collect();
  const ownedMembershipRows = membershipRows
    .map((record): { record: DomainRecord; projection: Data } => ({ record, projection: { id: record.publicId, ...data(record.data) } }))
    .filter(({ projection }) => belongsToAuthenticatedCustomer(projection, userId, optionalString(profile?.id)));
  const memberships = await Promise.all(ownedMembershipRows.map(async ({ record: projectionRecord, projection }) => {
    const internalMembershipId = optionalString(projection.membershipId) ?? stringValue(projection.id);
    const tenant = await ctx.db.get(projectionRecord.organizationId);
    if (!tenant) return { ...projection, visitHistory: arrayValue(projection.visitHistory), qrValue: "" };
    const [membershipRecord, memberRecord, marketplace] = await Promise.all([
      ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", tenant._id).eq("entityType", "membership").eq("publicId", internalMembershipId)).unique(),
      optionalString(projection.memberId)
        ? ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", tenant._id).eq("entityType", "member").eq("publicId", stringValue(projection.memberId))).unique()
        : Promise.resolve(null),
      ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", tenant._id).eq("entityType", "marketplaceGym")).first(),
    ]);
    if (!membershipRecord) return { ...projection, visitHistory: arrayValue(projection.visitHistory), qrValue: "" };
    const membership = data(membershipRecord.data);
    const member = memberRecord ? data(memberRecord.data) : {};
    const timezone = tenant.timezone || TZ_FALLBACK;
    const memberId = optionalString(member.id) ?? optionalString(membership.memberId) ?? stringValue(projection.memberId);
    const [planRecord, checkIns, charges, timelineRows, paymentRows] = await Promise.all([
      optionalString(membership.planId)
        ? ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", tenant._id).eq("entityType", "plan").eq("publicId", stringValue(membership.planId))).unique()
        : Promise.resolve(null),
      recordsOfMember(ctx, tenant._id, memberId, "checkIn"),
      recordsOfMember(ctx, tenant._id, memberId, "charge"),
      recordsOfMember(ctx, tenant._id, memberId, "timeline"),
      recordsOfMember(ctx, tenant._id, memberId, "payment"),
    ]);
    const validCheckIns = checkIns.map((row) => data(row.data)).filter((item) => item.memberId === memberId && item.decision !== "blocked").sort((left, right) => stringValue(right.occurredAt).localeCompare(stringValue(left.occurredAt)));
    const month = todayIn(timezone).slice(0, 7);
    const balanceMinor = charges.map((row) => data(row.data)).filter((item) => item.memberId === memberId).reduce((sum, item) => sum + collectibleOutstandingValue(item, todayIn(timezone)), 0);
    const marketplaceValue = data(marketplace?.data);
    const [logo, cover] = await Promise.all([
      gymMediaAssetView(ctx, tenant, optionalString(marketplaceValue.logoAssetId), "gym_logo"),
      gymMediaAssetView(ctx, tenant, optionalString(marketplaceValue.coverAssetId), "gym_cover"),
    ]);
    const branch = membershipRecord.branchId ? await ctx.db.get(membershipRecord.branchId) : null;
    const directoryBranch = arrayValue(marketplaceValue.branches).map(data).find((item) => item.internalBranchId === membership.homeBranchId || item.internalBranchId === (branch ? publicBranchId(branch) : undefined));
    const memberTimeline = timelineRows.map((row) => data(row.data)).filter((item) => item.memberId === memberId);
    const activity = [
      ...validCheckIns.map((item) => ({ id: stringValue(item.id), type: "check_in", title: `Checked in at ${stringValue(item.branchName, "the gym")}`, detail: stringValue(item.decision, "allowed"), occurredAt: stringValue(item.occurredAt) })),
      ...memberTimeline.filter((item) => item.type !== "check_in").map((item) => ({
        id: stringValue(item.id),
        type: stringValue(item.type).startsWith("pt_") ? "pt" : stringValue(item.type).includes("payment") ? "payment" : "membership",
        title: stringValue(item.title, "Gym activity"),
        detail: optionalString(item.body),
        occurredAt: stringValue(item.occurredAt),
      })),
      ...paymentRows.map((row) => data(row.data)).filter((item) => item.memberId === memberId && item.status !== "voided").map((item) => ({
        id: stringValue(item.id),
        type: "payment",
        title: "Payment recorded",
        detail: optionalString(item.method),
        occurredAt: stringValue(item.occurredAt, stringValue(item.createdAt)),
      })),
    ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 100);
    return {
      ...projection,
      gymId: marketplace?.publicId ?? stringValue(projection.gymId, publicOrganizationId(tenant)),
      gymName: stringValue(marketplaceValue.name, tenant.name),
      gymLogoUrl: optionalString(logo?.url),
      gymCoverUrl: optionalString(cover?.url),
      branchId: optionalString(directoryBranch?.id) ?? stringValue(projection.branchId),
      branchName: stringValue(directoryBranch?.name, stringValue(branch?.name)),
      memberNumber: optionalString(member.memberNumber) ?? stringValue(projection.memberNumber),
      planName: stringValue(data(planRecord?.data).name, stringValue(projection.planName)),
      status: statusOfMembership(membership, todayIn(timezone)),
      startDate: stringValue(membership.startDate, stringValue(projection.startDate)),
      endDate: stringValue(membership.endDate, stringValue(projection.endDate)),
      visitsThisMonth: validCheckIns.filter((item) => businessDate(stringValue(item.occurredAt), timezone).startsWith(month)).length,
      totalCheckIns: validCheckIns.length,
      remainingVisits: membership.remainingVisits,
      balanceMinor,
      lastCheckInAt: optionalString(validCheckIns[0]?.occurredAt) ?? optionalString(projection.lastCheckInAt),
      visitHistory: validCheckIns.slice(0, 100).map((item) => ({
        id: stringValue(item.id),
        memberName: stringValue(item.memberName, stringValue(member.fullName, stringValue(profile?.name))),
        branchId: stringValue(item.branchId),
        branchName: stringValue(item.branchName),
        occurredAt: stringValue(item.occurredAt),
        decision: stringValue(item.decision),
        checkedInByName: optionalString(item.actorName),
      })),
      activity,
      qrValue: "",
    };
  }));
  const bookings = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect())
    .map((record): Data => ({ id: record.publicId, ...data(record.data) }))
    .filter((value) => belongsToAuthenticatedCustomer(value, userId, optionalString(profile?.id)));
  return {
    customer: profile
      ? {
          id: stringValue(profile.id),
          name: stringValue(profile.name),
          nameAr: stringValue(profile.nameAr, stringValue(profile.name)),
          email: stringValue(profile.email),
          phone: stringValue(profile.phone),
          dateOfBirth: optionalString(profile.dateOfBirth),
          gender: optionalString(profile.gender),
          preferredLanguage: stringValue(profile.preferredLanguage, "en"),
          addressLine1: optionalString(profile.addressLine1),
          city: optionalString(profile.city),
          emergencyContactName: optionalString(profile.emergencyContactName),
          emergencyContactRelationship: optionalString(profile.emergencyContactRelationship),
          emergencyContactPhone: optionalString(profile.emergencyContactPhone),
          initials: stringValue(profile.initials),
          context: stringValue(profile.context, "RIVET member"),
          marketingPreference: preference,
          marketingPreferenceHistory: preferenceHistory,
        }
      : undefined,
    memberships,
    bookings,
  };
}

async function resolveEntryPass(ctx: ReadContext, actor: ActorContext, token: string, branchId: string): Promise<{ pass: Doc<"entryPasses">; membership: DomainRecord; payload: Data } | null> {
  if (!token.startsWith(`${ENTRY_PASS_PREFIX}.`)) return null;
  const secret = process.env.ENTRY_PASS_SIGNING_SECRET;
  if (!secret) domainError("CONFIGURATION_ERROR", "Entry-pass validation is not configured.", { correlationId: actor.correlationId });
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== ENTRY_PASS_PREFIX) return null;
  const encodedPayload = parts[1] ?? "";
  const signature = parts[2] ?? "";
  let payload: Data;
  try {
    if (!await verifyEntryPassSignature(encodedPayload, signature, secret)) return null;
    payload = data(JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))));
  } catch {
    return null;
  }
  if (numberValue(payload.exp) <= Date.now() || stringValue(payload.organizationId) !== publicOrganizationId(actor.organization)) return null;
  if (payload.branchId && payload.branchId !== branchId) return null;
  const passId = optionalString(payload.passId);
  const membershipId = optionalString(payload.membershipId);
  if (!passId || !membershipId) return null;
  const pass = await ctx.db.query("entryPasses").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", passId)).unique();
  if (!pass || pass.revokedAt || pass.consumedAt || pass.expiresAt <= Date.now()) return null;
  const membership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "customerMembership").eq("publicId", membershipId)).unique();
  return membership ? { pass, membership, payload } : null;
}

async function createEntryPass(ctx: MutationCtx, input: Data): Promise<Data> {
  const secret = process.env.ENTRY_PASS_SIGNING_SECRET;
  if (!secret) domainError("CONFIGURATION_ERROR", "Entry-pass signing is not configured.");
  const { user } = await requireMember(ctx);
  const userId = publicUserId(user);
  const profile = await customerProfileForUser(ctx, userId);
  const membershipId = recordId(input.membershipId);
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership")).collect();
  const membership = rows.find((row) => row.publicId === membershipId && belongsToAuthenticatedCustomer(data(row.data), userId, optionalString(profile?.id)));
  if (!membership) domainError("NOT_FOUND", "Membership not found.");
  const organization = await ctx.db.get(membership.organizationId);
  const membershipData = data(membership.data);
  if (!organization || !["trial", "active"].includes(organization.status) || !["active", "expiring", "frozen"].includes(stringValue(membershipData.status))) {
    domainError("NOT_FOUND", "Membership not found.");
  }
  const branch = membership.branchId ? await ctx.db.get(membership.branchId) : null;
  if (membership.branchId && (!branch || !branch.active || branch.status === "inactive" || branch.organizationId !== membership.organizationId)) {
    domainError("NOT_FOUND", "Membership not found.");
  }
  const member = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", membership.organizationId).eq("entityType", "member")).collect())
    .find((row) => data(row.data).id === membershipData.memberId || data(row.data).memberNumber === membershipData.memberNumber);
  const passId = crypto.randomUUID();
  const expiresAt = Date.now() + ENTRY_PASS_TTL_MS;
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    v: 1,
    passId,
    organizationId: publicOrganizationId(organization),
    membershipId: membership.publicId,
    customerUserId: userId,
    memberId: member?.publicId,
    branchId: branch ? publicBranchId(branch) : undefined,
    exp: expiresAt,
  })));
  const signature = await entryPassSignature(payload, secret);
  await ctx.db.insert("entryPasses", {
    organizationId: membership.organizationId,
    publicId: passId,
    membershipPublicId: membership.publicId,
    customerUserId: user._id,
    branchId: membership.branchId,
    expiresAt,
    issuedAt: Date.now(),
  });
  return { token: `${ENTRY_PASS_PREFIX}.${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString(), membershipId: membership.publicId };
}

async function registerCustomer(ctx: MutationCtx, input: Data): Promise<Data> {
  const { user } = await requireMember(ctx);
  return await saveCustomerProfile(ctx, user, input);
}

async function updateCustomerMarketingPreference(ctx: MutationCtx, input: Data): Promise<Data> {
  const { user } = await requireMember(ctx);
  if (typeof input.optedIn !== "boolean") {
    domainError("VALIDATION_ERROR", "Choose whether to receive marketing messages.", { fieldErrors: { optedIn: ["Required"] } });
  }

  const userId = publicUserId(user);
  let profile = await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", userId)).unique();
  if (!profile) {
    await saveCustomerProfile(ctx, user, {});
    profile = await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", userId)).unique();
  }
  if (!profile) domainError("CONFIGURATION_ERROR", "The member profile could not be created.");

  const optedIn = input.optedIn;
  const currentOptedIn = profile.marketingPreferenceStatus === "explicit_opt_in";
  const currentSource = profile.marketingPreferenceSource ?? "system_default";
  if (currentOptedIn === optedIn && currentSource === "member_selected") {
    const experience = await customerExperience(ctx);
    if (!experience.customer) domainError("NOT_FOUND", "Member profile not found.");
    return experience.customer;
  }

  const changedAt = Date.now();
  await ctx.db.patch(profile._id, {
    marketingOptIn: optedIn,
    marketingPreferenceStatus: optedIn ? "explicit_opt_in" : "explicit_opt_out",
    marketingPreferenceSource: "member_selected",
    marketingPreferenceChangedAt: changedAt,
    marketingPreferenceWordingVersion: MARKETING_WORDING_VERSION,
    updatedAt: changedAt,
  });
  await ctx.db.insert("customerMarketingPreferenceEvents", {
    userId,
    customerProfileId: profile.publicId,
    optedIn,
    status: optedIn ? "explicit_opt_in" : "explicit_opt_out",
    source: "member_selected",
    wordingVersion: MARKETING_WORDING_VERSION,
    changedAt,
  });

  const experience = await customerExperience(ctx);
  if (!experience.customer) domainError("NOT_FOUND", "Member profile not found.");
  return experience.customer;
}

async function createCustomerTrial(ctx: MutationCtx, input: Data): Promise<Data> {
  const { user } = await requireMember(ctx);
  const gyms = await marketplaceRows(ctx);
  const gymRecord = gyms.find((record) => record.publicId === stringValue(input.gymId));
  if (!gymRecord) domainError("NOT_FOUND", "Gym not found.");
  const gym = data(gymRecord.data);
  const targetOrgPublicId = optionalString(gym.targetOrganizationId);
  const targetOrganization = targetOrgPublicId
    ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrgPublicId)).unique()
    : null;
  if (!targetOrganization || gymRecord.organizationId !== targetOrganization._id || !acceptsPublicTrialRequests(gym, platformSubscriptionStatusForOrganization(targetOrganization.status), targetOrganization.trialEndsAt, true)) {
    domainError("NOT_FOUND", "This gym is not accepting online trial requests yet.");
  }
  const storageOrganization = targetOrganization;
  const idempotencyKey = optionalString(input.idempotencyKey)?.trim();
  if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
    domainError("VALIDATION_ERROR", "The trial request could not be processed.");
  }
  const preferredDate = stringValue(input.preferredDate);
  const preferredTime = stringValue(input.preferredTime);
  const requestHash = await privacyFingerprint({
    scope: "customer.trial.create",
    userId: publicUserId(user),
    gymId: stringValue(input.gymId),
    branchId: stringValue(input.branchId),
    preferredDate,
    preferredTime,
    goal: stringValue(input.goal),
  });
  const idempotencyScope = `customer.trial.create:${await privacyFingerprint(publicUserId(user))}`;
  if (idempotencyKey) {
    // Read all matching rows instead of calling unique(). Older deployments
    // may contain more than one expired record from before this guard existed.
    // Remove stale records before inserting the replacement so retries remain
    // deterministic and the index cannot accumulate ambiguous state.
    const existingRequests = await ctx.db.query("publicRequestIdempotency").withIndex("by_scope_key", (q) => q.eq("scope", idempotencyScope).eq("key", idempotencyKey)).collect();
    const existingRequest = existingRequests.find((row) => row.expiresAt > Date.now());
    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) domainError("CONFLICT", "This trial request has already been used.");
      const bookingId = stringValue(data(existingRequest.result).bookingId);
      const booking = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("entityType", "trialBooking").eq("publicId", bookingId)).unique();
      if (!booking) domainError("CONFIGURATION_ERROR", "The trial request could not be recovered.");
      // Clean up any stale duplicate rows while retaining the active replay.
      await Promise.all(existingRequests.filter((row) => row._id !== existingRequest._id && row.expiresAt <= Date.now()).map((row) => ctx.db.delete(row._id)));
      return data(booking.data);
    }
    if (existingRequests.length > 0) {
      // Replace expired retry state transactionally before the new insert.
      await Promise.all(existingRequests.map((row) => ctx.db.delete(row._id)));
    }
  }
  const directoryBranch = arrayValue(gym.branches).map(data).find((candidate) => candidate.id === input.branchId);
  const actualBranchId = optionalString(directoryBranch?.internalBranchId) ?? stringValue(input.branchId);
  const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("publicId", actualBranchId)).unique();
  if (!branch || !branch.active || branch.status === "inactive") {
    domainError("NOT_FOUND", "The selected gym branch is not accepting online trial requests yet.");
  }
  const weekday = validatedWeekdayForDate(preferredDate);
  if (!weekday || !TIME_PATTERN.test(preferredTime)) domainError("VALIDATION_ERROR", "Choose a valid trial date and time.");
  const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("entityType", "settings").eq("publicId", "settings")).unique();
  const schedule = arrayValue(data(data(settings?.data).operationalPolicies).trialSchedules).map(data).find((candidate) => candidate.branchId === publicBranchId(branch));
  if (!schedule) domainError("VALIDATION_ERROR", "Trial scheduling is not configured for this branch yet.");
  const trialWindow = normalizedTrialWindow(data(data(schedule.days)[weekday]));
  if (!booleanValue(trialWindow.enabled) || preferredTime < stringValue(trialWindow.opensAt) || preferredTime > stringValue(trialWindow.closesAt)) {
    domainError("CONFLICT", "That trial time is outside this branch's trial-request hours.");
  }
  const [hour = 0, minute = 0] = preferredTime.split(":").map(Number);
  const requestedAt = ptWallTime(preferredDate, hour * 60 + minute, storageOrganization.timezone || TZ_FALLBACK);
  if (requestedAt <= Date.now()) domainError("VALIDATION_ERROR", "Choose a future trial time.");
  const existingOpenRequest = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect()).find((record) => {
    const booking = data(record.data);
    return booking.customerUserId === publicUserId(user) && booking.gymId === stringValue(input.gymId) && ["requested", "confirmed"].includes(stringValue(booking.status));
  });
  if (existingOpenRequest) domainError("CONFLICT", "You already have an open trial request with this gym.");
  await enforcePublicRateLimit(ctx, {
    scope: "customer.trial.create",
    fingerprint: await privacyFingerprint(publicUserId(user)),
    maxRequests: 10,
    windowMs: 24 * 60 * 60 * 1000,
  });
  const profile = await saveCustomerProfile(ctx, user, input);
  const ownership = customerProfileOwnership(publicUserId(user), profile.id);
  const bookingId = newPublicId();
  const createdAt = isoNow();
  const base = {
    id: bookingId,
    ...ownership,
    gymId: stringValue(input.gymId),
    branchId: stringValue(input.branchId),
    fullName: profile.name,
    email: profile.email,
    phone: profile.phone,
    preferredDate,
    preferredTime,
    goal: stringValue(input.goal),
    status: "requested",
    createdAt,
  };
  await ctx.db.insert("domainRecords", { organizationId: storageOrganization._id, entityType: "trialBooking", publicId: bookingId, branchId: branch?._id, createdAt: Date.now(), updatedAt: Date.now(), data: base });

  let leadId: string | undefined;
  if (branch) {
    leadId = newPublicId();
    const branchPublicId = publicBranchId(branch);
    const lead = { id: leadId, organizationId: publicOrganizationId(targetOrganization), branchId: branchPublicId, fullName: base.fullName, phone: base.phone, email: base.email, stage: "trial_booked", source: "other", expectedValue: money(numberValue(gym.fromPriceMinor), targetOrganization.currency), nextFollowUpAt: utcIso(requestedAt), notes: `Free trial requested through RIVET Member. Goal: ${base.goal}`, createdAt, updatedAt: createdAt };
    await ctx.db.insert("domainRecords", { organizationId: targetOrganization._id, entityType: "lead", publicId: leadId, branchId: branch._id, leadPublicId: leadId, createdAt: Date.now(), updatedAt: Date.now(), data: lead });
    await ctx.db.patch((await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("entityType", "trialBooking").eq("publicId", bookingId)).unique())!._id, { data: { ...base, leadId }, updatedAt: Date.now() });
    await notifyOrganizationRoles(ctx, {
      organizationId: targetOrganization._id,
      branchId: branch._id,
      roles: ["owner", "manager", "sales", "receptionist"],
      kind: "trial_request",
      title: "New free-trial request",
      body: `${base.fullName} · ${branch.name} · ${base.preferredDate} ${base.preferredTime}`,
      href: `/crm/leads/${leadId}`,
      dedupeKey: `trial-request:${bookingId}`,
    });
  }
  await queueOperationalEmail(ctx, {
    organizationId: storageOrganization._id,
    branchId: branch?._id,
    kind: "trial_request_confirmation",
    templateVersion: "trial-request-v1",
    language: stringValue(profile.preferredLanguage, "en") === "ar" ? "ar" : "en",
    recipientReference: publicUserId(user),
    recipientEmail: profile.email,
    dedupeKey: `trial-request-confirmation:${bookingId}`,
  });
  if (idempotencyKey) {
    await ctx.db.insert("publicRequestIdempotency", {
      scope: idempotencyScope,
      key: idempotencyKey,
      requestHash,
      result: { bookingId },
      createdAt: Date.now(),
      expiresAt: Date.now() + 365 * 86_400_000,
    });
  }
  return { ...base, ...(leadId ? { leadId } : {}) };
}

async function linkedTrialBooking(ctx: ReadContext, actor: ActorContext, leadId: string) {
  return (await recordsOf(ctx, actor, "trialBooking")).find((record) => optionalString(data(record.data).leadId) === leadId);
}

type AutomationCandidate = {
  record: DomainRecord;
  value: Data;
  subjectType: "member" | "membership" | "lead" | "task" | "charge";
  subjectId: string;
  subjectName: string;
  branchId?: string;
  duplicate: boolean;
  dedupeKey: string;
};

function automationEntityType(trigger: string): AutomationCandidate["subjectType"] {
  if (trigger === "member_inactive") return "member";
  if (trigger === "lead_untouched") return "lead";
  if (trigger === "follow_up_overdue") return "task";
  if (trigger === "payment_outstanding") return "charge";
  return "membership";
}

const AUTOMATION_TRIGGER_KEYS = [
  "membership_expiring",
  "membership_expired",
  "member_inactive",
  "lead_untouched",
  "follow_up_overdue",
  "payment_outstanding",
] as const;
const AUTOMATION_ACTION_KEYS = ["create_task", "queue_message", "notify_manager"] as const;
const AUTOMATION_TASK_OWNER_ROLES = ["owner", "manager", "salesperson", "receptionist", "trainer", "auditor"] as const;

function automationInteger(value: unknown, label: string, correlationId: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    domainError("VALIDATION_ERROR", `${label} must be a whole number of at least ${minimum}.`, { correlationId });
  }
  return value;
}

function normalizedAutomationTriggerParams(trigger: string, raw: Data, correlationId: string): Data {
  if (trigger === "membership_expiring") {
    const daysBefore = [...new Set(arrayValue(raw.daysBefore).map((value) => automationInteger(value, "Expiry checkpoints", correlationId, 1)))].sort((left, right) => left - right);
    if (daysBefore.length === 0) domainError("VALIDATION_ERROR", "Add at least one expiry checkpoint.", { correlationId });
    return { daysBefore };
  }
  if (trigger === "membership_expired") return { daysAfter: automationInteger(raw.daysAfter, "Days after expiry", correlationId, 0) };
  if (trigger === "member_inactive") return { days: automationInteger(raw.days, "Inactive days", correlationId, 1) };
  if (trigger === "payment_outstanding") return { days: automationInteger(raw.days, "Outstanding days", correlationId, 1) };
  if (trigger === "lead_untouched") return { hours: automationInteger(raw.hours, "Untouched hours", correlationId, 1) };
  if (trigger === "follow_up_overdue") return { hours: automationInteger(raw.hours, "Overdue hours", correlationId, 1) };
  domainError("VALIDATION_ERROR", "Automation trigger is invalid.", { correlationId });
}

function normalizedAutomationActions(raw: unknown[], correlationId: string, requireMessageTemplate: boolean): Data[] {
  if (raw.length === 0) domainError("VALIDATION_ERROR", "Choose at least one automation action.", { correlationId });
  const seen = new Set<string>();
  return raw.map((rawAction) => {
    const action = data(rawAction);
    const key = stringValue(action.key);
    if (!AUTOMATION_ACTION_KEYS.includes(key as (typeof AUTOMATION_ACTION_KEYS)[number])) domainError("VALIDATION_ERROR", "Automation action is invalid.", { correlationId });
    if (seen.has(key)) domainError("VALIDATION_ERROR", "An automation action cannot be selected twice.", { correlationId });
    seen.add(key);
    if (key === "create_task") {
      const taskOwnerRole = stringValue(action.taskOwnerRole, "salesperson");
      if (!AUTOMATION_TASK_OWNER_ROLES.includes(taskOwnerRole as (typeof AUTOMATION_TASK_OWNER_ROLES)[number])) domainError("VALIDATION_ERROR", "Task owner role is invalid.", { correlationId });
      const taskTitle = stringValue(action.taskTitle, "Follow up with member").trim();
      if (!taskTitle || taskTitle.length > 160) domainError("VALIDATION_ERROR", "Task title must be between 1 and 160 characters.", { correlationId });
      return { key, taskOwnerRole, taskTitle };
    }
    if (key === "queue_message") {
      const channel = stringValue(action.channel, "whatsapp");
      if (!["email", "sms", "whatsapp"].includes(channel)) domainError("VALIDATION_ERROR", "Message channel is invalid.", { correlationId });
      const templateId = optionalString(action.templateId);
      if (requireMessageTemplate && !templateId) domainError("VALIDATION_ERROR", "Choose a message template before enabling Queue message.", { correlationId });
      return { key, channel, ...(templateId ? { templateId } : {}) };
    }
    return { key };
  });
}

function normalizedAutomationRulePatch(input: Data, existing: Data | undefined, correlationId: string, creating: boolean): Data {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const trigger = stringValue(input.trigger, stringValue(existing?.trigger));
  if (!AUTOMATION_TRIGGER_KEYS.includes(trigger as (typeof AUTOMATION_TRIGGER_KEYS)[number])) domainError("VALIDATION_ERROR", "Automation trigger is invalid.", { correlationId });
  const patch: Data = {};
  if (creating || has("name")) {
    const name = stringValue(input.name, stringValue(existing?.name)).trim();
    if (!name || name.length > 120) domainError("VALIDATION_ERROR", "Rule name must be between 1 and 120 characters.", { correlationId });
    patch.name = name;
  }
  if (creating || has("trigger") || has("triggerParams")) patch.trigger = trigger;
  if (creating || has("trigger") || has("triggerParams")) patch.triggerParams = normalizedAutomationTriggerParams(trigger, data(input.triggerParams ?? existing?.triggerParams), correlationId);
  if (creating || has("actions")) patch.actions = normalizedAutomationActions(arrayValue(input.actions ?? existing?.actions), correlationId, true);
  if (creating || has("enabled")) {
    if (typeof input.enabled !== "boolean" && creating) domainError("VALIDATION_ERROR", "Enabled state is invalid.", { correlationId });
    if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  }
  if (creating || has("dedupeWindowHours")) patch.dedupeWindowHours = automationInteger(input.dedupeWindowHours ?? existing?.dedupeWindowHours ?? 24, "Deduplication window", correlationId, 1);
  return patch;
}

async function assertAutomationTemplateReferences(ctx: ReadContext, actor: ActorContext, actions: Data[]): Promise<void> {
  for (const action of actions) {
    const templateId = optionalString(action.templateId);
    if (action.key !== "queue_message" || !templateId) continue;
    if (!(await recordOfOptional(ctx, actor, "messageTemplate", templateId))) domainError("NOT_FOUND", "Message template not found.", { correlationId: actor.correlationId });
  }
}

function automationTriggerMatches(rule: Data, candidate: Data, today: string): boolean {
  const trigger = stringValue(rule.trigger);
  const params = data(rule.triggerParams);
  if (trigger === "membership_expiring") {
    const days = diffDays(today, stringValue(candidate.endDate));
    return arrayValue(params.daysBefore).map((item) => numberValue(item)).includes(days);
  }
  if (trigger === "membership_expired") {
    const days = diffDays(stringValue(candidate.endDate), today);
    return days === numberValue(params.daysAfter, 0);
  }
  if (trigger === "member_inactive") {
    const lastActivity = optionalString(candidate.lastCheckInAt) ?? optionalString(candidate.createdAt);
    return Boolean(lastActivity) && diffDays(stringValue(lastActivity).slice(0, 10), today) >= numberValue(params.days, 21);
  }
  if (trigger === "lead_untouched") {
    const createdAt = Date.parse(stringValue(candidate.createdAt));
    return ["new", "attempted"].includes(stringValue(candidate.stage)) && Number.isFinite(createdAt) && Date.now() - createdAt >= numberValue(params.hours, 24) * 3_600_000;
  }
  if (trigger === "follow_up_overdue") {
    const dueAt = Date.parse(stringValue(candidate.dueAt));
    return stringValue(candidate.status, "open") === "open" && Number.isFinite(dueAt) && dueAt < Date.now() - numberValue(params.hours, 4) * 3_600_000;
  }
  if (trigger === "payment_outstanding") {
    const createdAt = optionalString(candidate.createdAt);
    return collectibleOutstandingValue(candidate, today) > 0 && Boolean(createdAt) && diffDays(stringValue(createdAt).slice(0, 10), today) >= numberValue(params.days, 7);
  }
  return false;
}

async function automationSubjectName(ctx: ReadContext, actor: ActorContext, subjectType: AutomationCandidate["subjectType"], value: Data): Promise<string> {
  if (subjectType === "member" || subjectType === "lead") return stringValue(value.fullName, stringValue(value.name, "Record"));
  const linkedMemberId = optionalString(value.memberId);
  if (linkedMemberId) {
    const member = await recordOfOptional(ctx, actor, "member", linkedMemberId);
    if (member) return stringValue(data(member.data).fullName, linkedMemberId);
  }
  if (subjectType === "task") return stringValue(value.title, "Follow-up task");
  if (subjectType === "charge") return stringValue(value.description, "Outstanding charge");
  return stringValue(value.planName, "Membership");
}

async function automationCandidates(ctx: ReadContext, actor: ActorContext, ruleRecord: DomainRecord): Promise<AutomationCandidate[]> {
  const rule = data(ruleRecord.data);
  const subjectType = automationEntityType(stringValue(rule.trigger));
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const candidates = (await recordsOf(ctx, actor, subjectType)).filter((record) => automationTriggerMatches(rule, data(record.data), today));
  return await Promise.all(candidates.map(async (record): Promise<AutomationCandidate> => {
    const value = data(record.data);
    const dedupeKey = `${ruleRecord.publicId}:${record.publicId}:${today}`;
    const existing = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "automation.execute").eq("key", dedupeKey))
      .unique();
    return {
      record,
      value,
      subjectType,
      subjectId: record.publicId,
      subjectName: await automationSubjectName(ctx, actor, subjectType, value),
      branchId: record.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, record.branchId) : optionalString(value.branchId) ?? optionalString(value.homeBranchId),
      duplicate: Boolean(existing?.expiresAt && existing.expiresAt > Date.now()),
      dedupeKey,
    };
  }));
}

async function automationExecutionView(ctx: ReadContext, actor: ActorContext, record: DomainRecord): Promise<Data> {
  const value = data(record.data);
  const rule = await recordOfOptional(ctx, actor, "automationRule", stringValue(value.ruleId));
  const storedSubjectType = stringValue(value.subjectType);
  const subjectType = ["member", "membership", "lead", "task", "charge"].includes(storedSubjectType)
    ? storedSubjectType
    : automationEntityType(stringValue(value.trigger));
  const actionResults = arrayValue(value.actionResults).map(data);
  const attemptHistory = arrayValue(value.attemptHistory).map(data);
  const legacyAction = optionalString(value.action);
  const status = stringValue(value.status, "completed");
  return {
    id: record.publicId,
    ...value,
    ruleName: stringValue(value.ruleName, stringValue(data(rule?.data).name, "Deleted rule")),
    subjectType,
    subjectId: stringValue(value.subjectId, stringValue(value.entityId, record.publicId)),
    subjectName: stringValue(value.subjectName, "Record"),
    action: legacyAction ?? optionalString(actionResults[0]?.key),
    status,
    detail: optionalString(value.detail) ?? optionalString(value.suppressionReason) ?? `${actionResults.length} action${actionResults.length === 1 ? "" : "s"}`,
    actionResults,
    attemptHistory,
    retryPolicy: Object.keys(data(value.retryPolicy)).length > 0 ? data(value.retryPolicy) : { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
    executedAt: optionalString(value.executedAt) ?? utcIso(record.createdAt),
  };
}

function ptAvailable(value: { granted: number; reserved: number; consumed: number; revoked: number }): number {
  return Math.max(0, value.granted - value.reserved - value.consumed - value.revoked);
}

async function ptPackageView(ctx: ReadContext, organization: Organization, value: Doc<"ptPackages">): Promise<Data> {
  const branchIds = await Promise.all(value.branchIds.map(async (id) => {
    const branch = await ctx.db.get(id);
    return branch ? publicBranchId(branch) : undefined;
  }));
  return {
    id: value.publicId,
    organizationId: publicOrganizationId(organization),
    name: value.name,
    sessionCount: value.sessionCount,
    totalPrice: money(value.totalPriceMinor, value.currency),
    validityDays: value.validityDays,
    branchAccess: value.branchAccess,
    branchIds: branchIds.filter((id): id is string => Boolean(id)),
    status: value.status,
    createdAt: utcIso(value.createdAt),
    updatedAt: utcIso(value.updatedAt),
  };
}

type PtPackageTerms = {
  name: string;
  sessionCount: number;
  totalPriceMinor: number;
  currency: string;
  validityDays: number;
  branchAccess: "all" | "selected";
  branchIds: Id<"branches">[];
};

function ptPackageTerms(order: Doc<"ptPackageOrders">, current?: Doc<"ptPackages">): PtPackageTerms {
  return {
    name: order.packageNameSnapshot ?? current?.name ?? "PT package",
    sessionCount: order.sessionCountSnapshot ?? current?.sessionCount ?? 0,
    totalPriceMinor: order.totalPriceMinorSnapshot ?? current?.totalPriceMinor ?? 0,
    currency: order.currencySnapshot ?? current?.currency ?? "JOD",
    validityDays: order.validityDaysSnapshot ?? current?.validityDays ?? 0,
    branchAccess: order.branchAccessSnapshot ?? current?.branchAccess ?? "all",
    branchIds: order.branchIdsSnapshot ?? current?.branchIds ?? [],
  };
}

/**
 * Existing orders were created before package terms became immutable. Capture
 * the current catalog terms immediately before the first package edit. The
 * operation is intentionally idempotent: once every field is present, it is
 * a no-op and can safely run again.
 */
async function snapshotMissingPtPackageOrders(ctx: MutationCtx, actor: ActorContext, ptPackage: Doc<"ptPackages">): Promise<void> {
  const orders = (await ctx.db.query("ptPackageOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect())
    .filter((order) => order.packageId === ptPackage._id);
  const now = Date.now();
  await Promise.all(orders.filter((order) => order.sessionCountSnapshot === undefined || order.totalPriceMinorSnapshot === undefined || order.validityDaysSnapshot === undefined || order.packageNameSnapshot === undefined).map((order) => ctx.db.patch(order._id, {
    packageNameSnapshot: order.packageNameSnapshot ?? ptPackage.name,
    sessionCountSnapshot: order.sessionCountSnapshot ?? ptPackage.sessionCount,
    totalPriceMinorSnapshot: order.totalPriceMinorSnapshot ?? ptPackage.totalPriceMinor,
    currencySnapshot: order.currencySnapshot ?? ptPackage.currency,
    validityDaysSnapshot: order.validityDaysSnapshot ?? ptPackage.validityDays,
    branchAccessSnapshot: order.branchAccessSnapshot ?? ptPackage.branchAccess,
    branchIdsSnapshot: order.branchIdsSnapshot ?? [...ptPackage.branchIds],
    updatedAt: now,
  })));
}

async function ptTrainerView(ctx: ReadContext, organization: Organization, value: Doc<"ptTrainerProfiles">): Promise<Data> {
  const [branchIds, rules, exceptions] = await Promise.all([Promise.all(value.branchIds.map(async (id) => {
    const branch = await ctx.db.get(id);
    return branch ? publicBranchId(branch) : undefined;
  })), ctx.db.query("ptAvailabilityRules").withIndex("by_trainer", (q) => q.eq("trainerProfileId", value._id)).collect(), ctx.db.query("ptAvailabilityExceptions").withIndex("by_trainer_date", (q) => q.eq("trainerProfileId", value._id)).collect()]);
  const branchPublicIds = new Map<string, string>();
  await Promise.all([...new Set([...rules.map((item) => item.branchId), ...exceptions.map((item) => item.branchId)])].map(async (branchId) => {
    const branch = await ctx.db.get(branchId);
    if (branch) branchPublicIds.set(String(branchId), publicBranchId(branch));
  }));
  let photoUrl: string | undefined;
  if (value.photoAssetId) {
    const asset = await ctx.db
      .query("mediaAssets")
      .withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", value.photoAssetId!))
      .unique();
    if (asset && asset.ownerType === "trainer_photo" && asset.ownerPublicId === value.publicId && asset.status === "active" && asset.visibility === "public") {
      photoUrl = (await ctx.storage.getUrl(asset.storageId)) ?? undefined;
    }
  }
  return {
    id: value.publicId,
    organizationId: publicOrganizationId(organization),
    userId: publicUserId((await ctx.db.get(value.userId))!),
    displayName: value.displayName,
    bioEn: value.bioEn,
    bioAr: value.bioAr,
    specialties: value.specialties,
    languages: value.languages,
    branchIds: branchIds.filter((id): id is string => Boolean(id)),
    photoUrl,
    photoAlt: value.photoAlt,
    status: value.status,
    availabilityRules: rules.map((rule) => ({ id: rule.publicId, trainerProfileId: value.publicId, branchId: branchPublicIds.get(String(rule.branchId)) ?? String(rule.branchId), weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, active: rule.active })),
    availabilityExceptions: exceptions.map((exception) => ({ id: exception.publicId, trainerProfileId: value.publicId, branchId: branchPublicIds.get(String(exception.branchId)) ?? String(exception.branchId), date: exception.date, startMinute: exception.startMinute, endMinute: exception.endMinute, reason: exception.reason })),
    createdAt: utcIso(value.createdAt),
    updatedAt: utcIso(value.updatedAt),
  };
}

function ptEntitlementView(organization: Organization, value: Doc<"ptEntitlements">): Data {
  const expired = value.expiresAt < Date.now();
  const notStarted = (value.startsAt ?? 0) > Date.now();
  return {
    id: value.publicId,
    organizationId: publicOrganizationId(organization),
    memberId: value.memberPublicId,
    source: value.source,
    membershipId: value.membershipPublicId,
    packageOrderId: value.packageOrderId,
    granted: value.granted,
    reserved: value.reserved,
    consumed: value.consumed,
    revoked: value.revoked,
    available: expired || notStarted || value.status !== "active" ? 0 : ptAvailable(value),
    startsAt: value.startsAt ? utcIso(value.startsAt) : undefined,
    expiresAt: utcIso(value.expiresAt),
    status: expired && value.status === "active" ? "expired" : value.status,
    createdAt: utcIso(value.createdAt),
    updatedAt: utcIso(value.updatedAt),
  };
}

async function ptBookingView(ctx: ReadContext, organization: Organization, value: Doc<"ptBookings">): Promise<Data> {
  const [memberRecord, trainer, branch, bookedBy] = await Promise.all([
    ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", value.memberPublicId)).unique(),
    ctx.db.get(value.trainerProfileId),
    ctx.db.get(value.branchId),
    value.bookedByUserId ? ctx.db.get(value.bookedByUserId) : null,
  ]);
  return {
    id: value.publicId,
    organizationId: publicOrganizationId(organization),
    memberId: value.memberPublicId,
    memberName: stringValue(data(memberRecord?.data).fullName, "Member"),
    trainerProfileId: trainer?.publicId ?? "",
    trainerName: trainer?.displayName ?? "Trainer",
    branchId: branch ? publicBranchId(branch) : "",
    branchName: branch?.name ?? "Branch",
    entitlementId: (await ctx.db.get(value.entitlementId))?.publicId ?? "",
    startsAt: utcIso(value.startsAt),
    endsAt: utcIso(value.endsAt),
    status: value.status,
    cancellationReason: value.cancellationReason,
    outcomeReason: value.outcomeReason,
    bookedById: bookedBy ? publicUserId(bookedBy) : undefined,
    createdAt: utcIso(value.createdAt),
    updatedAt: utcIso(value.updatedAt),
  };
}

async function ptPackageOrderView(ctx: ReadContext, organization: Organization, value: Doc<"ptPackageOrders">): Promise<Data> {
  const [memberRecord, ptPackage] = await Promise.all([
    ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", value.memberPublicId)).unique(),
    ctx.db.get(value.packageId),
  ]);
  const terms = ptPackageTerms(value, ptPackage ?? undefined);
  return {
    id: value.publicId,
    organizationId: publicOrganizationId(organization),
    memberId: value.memberPublicId,
    packageId: ptPackage?.publicId ?? "",
    chargeId: value.chargePublicId,
    memberName: stringValue(data(memberRecord?.data).fullName, "Member"),
    packageName: terms.name,
    packageNameSnapshot: value.packageNameSnapshot,
    sessionCountSnapshot: terms.sessionCount,
    totalPriceSnapshot: money(terms.totalPriceMinor, terms.currency),
    validityDaysSnapshot: terms.validityDays,
    paymentReference: `PT order ${value.publicId.slice(-6).toUpperCase()}`,
    status: value.status,
    entitlementId: value.entitlementId ? (await ctx.db.get(value.entitlementId))?.publicId : undefined,
    paidAt: value.paidAt ? utcIso(value.paidAt) : undefined,
    refundedSessions: value.refundedSessions,
    refundedAmount: value.refundedMinor === undefined ? undefined : money(value.refundedMinor, organization.currency),
    cancelledAt: value.cancelledAt ? utcIso(value.cancelledAt) : undefined,
    cancellationReason: value.cancellationReason,
    createdAt: utcIso(value.createdAt),
    updatedAt: utcIso(value.updatedAt),
  };
}

/**
 * Resolve the tenant/member/branch facts that authorize an existing PT order.
 * Idempotency records are intentionally not authorization records: a caller
 * may know a key from another branch, so every replay must prove access to the
 * order and its branch before the immutable view is returned. This helper
 * deliberately does not require an active branch; an already-created order
 * remains replayable after a safe branch lifecycle change, while new writes
 * still call assertBranchAccess before mutating anything.
 */
async function ptPackageOrderScope(ctx: ReadContext, actor: ActorContext, order: Doc<"ptPackageOrders">): Promise<{ membership: DomainRecord; member: DomainRecord; charge: DomainRecord; branch: Branch }> {
  if (order.organizationId !== actor.organization._id) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
  const membership = await recordOf(ctx, actor, "membership", order.membershipPublicId);
  const membershipValue = data(membership.data);
  if (stringValue(membershipValue.memberId) !== order.memberPublicId) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
  const member = await recordOf(ctx, actor, "member", order.memberPublicId);
  const branch = await branchByPublicId(ctx, actor.organization._id, stringValue(membershipValue.homeBranchId));
  if (!branch || branch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "PT package order branch not found.", { correlationId: actor.correlationId });
  if (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id)) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  const charge = await recordOf(ctx, actor, "charge", order.chargePublicId);
  if (charge.branchId !== branch._id || optionalString(data(charge.data).memberId) !== order.memberPublicId) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
  return { membership, member, charge, branch };
}

function ptPackageLadderIsValid(packages: Array<{ sessionCount: number; totalPriceMinor: number }>): boolean {
  const sorted = [...packages].sort((left, right) => left.sessionCount - right.sessionCount);
  return sorted.every((item, index) => {
    const previous = sorted[index - 1];
    return !previous || item.totalPriceMinor * previous.sessionCount <= previous.totalPriceMinor * item.sessionCount;
  });
}

function ptWallTime(date: string, minute: number, timezone: string): number {
  const [year, month, day] = dateParts(date);
  const target = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const rendered = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour) % 24, Number(values.minute));
    guess += target - rendered;
  }
  return guess;
}

function weekdayForDate(date: string): typeof WEEKDAYS[number] {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? "sun";
}

async function ptSlots(
  ctx: ReadContext,
  organization: Organization,
  trainer: Doc<"ptTrainerProfiles">,
  branch: Branch,
  from: string,
  to: string,
): Promise<Data[]> {
  if (diffDays(from, to) < 0 || diffDays(from, to) > 90) domainError("VALIDATION_ERROR", "PT availability may be requested for at most 90 days.");
  const [rules, exceptions, bookings] = await Promise.all([
    ctx.db.query("ptAvailabilityRules").withIndex("by_trainer", (q) => q.eq("trainerProfileId", trainer._id)).collect(),
    ctx.db.query("ptAvailabilityExceptions").withIndex("by_trainer_date", (q) => q.eq("trainerProfileId", trainer._id).gte("date", from).lte("date", to)).collect(),
    ctx.db.query("ptBookings").withIndex("by_trainer_start", (q) => q.eq("trainerProfileId", trainer._id).gte("startsAt", ptWallTime(from, 0, organization.timezone || TZ_FALLBACK)).lte("startsAt", ptWallTime(addDays(to, 1), 0, organization.timezone || TZ_FALLBACK))).collect(),
  ]);
  const slots: Data[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const dayRules = rules.filter((rule) => rule.active && rule.branchId === branch._id && rule.weekday === weekdayForDate(date));
    const dayExceptions = exceptions.filter((exception) => exception.branchId === branch._id && exception.date === date);
    for (const rule of dayRules) {
      for (let minute = rule.startMinute; minute + 60 <= rule.endMinute; minute += 60) {
        const startsAt = ptWallTime(date, minute, organization.timezone || TZ_FALLBACK);
        const endsAt = startsAt + 3_600_000;
        if (startsAt <= Date.now()) continue;
        if (dayExceptions.some((exception) => exception.startMinute === undefined || (minute < (exception.endMinute ?? 1_440) && (exception.startMinute ?? 0) < minute + 60))) continue;
        if (bookings.some((booking) => ["reserved", "confirmed"].includes(booking.status) && booking.startsAt < endsAt && startsAt < booking.endsAt)) continue;
        slots.push({ trainerProfileId: trainer.publicId, branchId: publicBranchId(branch), startsAt: utcIso(startsAt), endsAt: utcIso(endsAt) });
      }
    }
  }
  return slots;
}

async function ptMemberExperience(ctx: ReadContext, actor: ActorContext, membershipRecord: DomainRecord): Promise<Data> {
  const membership = data(membershipRecord.data);
  const [entitlements, bookings, orders, trainers, packages] = await Promise.all([
    ctx.db.query("ptEntitlements").withIndex("by_organization_member", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", stringValue(membership.memberId))).collect(),
    ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", stringValue(membership.memberId))).collect(),
    ctx.db.query("ptPackageOrders").withIndex("by_organization_member", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", stringValue(membership.memberId))).collect(),
    ctx.db.query("ptTrainerProfiles").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
    ctx.db.query("ptPackages").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect(),
  ]);
  const entitlementViews = entitlements.map((item) => ptEntitlementView(actor.organization, item));
  return {
    organizationId: publicOrganizationId(actor.organization),
    membershipId: membershipRecord.publicId,
    availableSessions: entitlementViews.reduce((total, item) => total + numberValue(item.available), 0),
    reservedSessions: entitlementViews.reduce((total, item) => total + numberValue(item.reserved), 0),
    entitlements: entitlementViews,
    upcomingBookings: await Promise.all(bookings.filter((item) => ["reserved", "confirmed"].includes(item.status) && item.endsAt >= Date.now()).sort((left, right) => left.startsAt - right.startsAt).map((item) => ptBookingView(ctx, actor.organization, item))),
    orders: await Promise.all(orders.sort((left, right) => right.createdAt - left.createdAt).map((item) => ptPackageOrderView(ctx, actor.organization, item))),
    trainers: await Promise.all(trainers.filter((item) => item.status === "published").map((item) => ptTrainerView(ctx, actor.organization, item))),
    packages: await Promise.all(packages.map((item) => ptPackageView(ctx, actor.organization, item))),
  };
}

async function customerPtExperience(ctx: ReadContext, membershipId: string): Promise<Data> {
  const { user } = await requireMember(ctx);
  const userId = publicUserId(user);
  const profile = await customerProfileForUser(ctx, userId);
  const membershipRecord = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "customerMembership").eq("publicId", membershipId)).unique();
  const customerMembership = membershipRecord && belongsToAuthenticatedCustomer(data(membershipRecord.data), userId, optionalString(profile?.id)) ? membershipRecord : null;
  if (!customerMembership) domainError("NOT_FOUND", "Membership not found.");
  const organization = await ctx.db.get(customerMembership.organizationId);
  if (!organization || organization.status === "suspended" || organization.status === "cancelled") domainError("NOT_FOUND", "Membership not found.");
  const customerValue = data(customerMembership.data);
  const internalMembershipId = optionalString(customerValue.membershipId) ?? optionalString(customerValue.internalMembershipId) ?? customerMembership.publicId;
  const internalMembership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership").eq("publicId", internalMembershipId)).unique();
  const memberId = optionalString(customerValue.memberId) ?? optionalString(data(internalMembership?.data).memberId);
  const [entitlements, bookings, orders, trainers, packages] = await Promise.all([
    memberId ? ctx.db.query("ptEntitlements").withIndex("by_organization_member", (q) => q.eq("organizationId", organization._id).eq("memberPublicId", memberId)).collect() : [],
    memberId ? ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", organization._id).eq("memberPublicId", memberId)).collect() : [],
    memberId ? ctx.db.query("ptPackageOrders").withIndex("by_organization_member", (q) => q.eq("organizationId", organization._id).eq("memberPublicId", memberId)).collect() : [],
    ctx.db.query("ptTrainerProfiles").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect(),
    ctx.db.query("ptPackages").withIndex("by_organization_status", (q) => q.eq("organizationId", organization._id).eq("status", "active")).collect(),
  ]);
  const entitlementViews = entitlements.map((item) => ptEntitlementView(organization, item));
  return {
    organizationId: publicOrganizationId(organization),
    membershipId,
    availableSessions: entitlementViews.reduce((total, item) => total + numberValue(item.available), 0),
    reservedSessions: entitlementViews.reduce((total, item) => total + numberValue(item.reserved), 0),
    entitlements: entitlementViews,
    upcomingBookings: await Promise.all(bookings.filter((item) => ["reserved", "confirmed"].includes(item.status) && item.endsAt >= Date.now()).sort((left, right) => left.startsAt - right.startsAt).map((item) => ptBookingView(ctx, organization, item))),
    orders: await Promise.all(orders.sort((left, right) => right.createdAt - left.createdAt).map((item) => ptPackageOrderView(ctx, organization, item))),
    trainers: await Promise.all(trainers.filter((item) => item.status === "published").map((item) => ptTrainerView(ctx, organization, item))),
    packages: await Promise.all(packages.map((item) => ptPackageView(ctx, organization, item))),
  };
}

type PublicGymMediaOwnerType = "gym_logo" | "gym_cover" | "gym_gallery";

async function gymMediaAssetView(
  ctx: ReadContext,
  organization: Organization,
  publicId: string | undefined,
  expectedOwnerType: PublicGymMediaOwnerType,
): Promise<Data | undefined> {
  if (!publicId) return undefined;
  const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", publicId)).unique();
  // A profile reference is not sufficient proof that an asset is safe to
  // expose. Require every public invariant at the projection boundary:
  // same tenant, canonical owner type/id, public visibility, active status,
  // and a live storage URL. This keeps stale profile snapshots and accidental
  // private/foreign references from crossing into public/customer responses.
  if (
    !asset
    || asset.ownerType !== expectedOwnerType
    || asset.ownerPublicId !== publicOrganizationId(organization)
    || asset.visibility !== "public"
    || asset.status !== "active"
  ) return undefined;
  const url = await ctx.storage.getUrl(asset.storageId);
  if (!url) return undefined;
  return { id: asset.publicId, organizationId: publicOrganizationId(organization), ownerType: asset.ownerType, ownerId: asset.ownerPublicId, contentType: asset.contentType, sizeBytes: asset.sizeBytes, altText: asset.altText, visibility: asset.visibility, status: asset.status, url: url ?? undefined, deleteAfter: asset.deleteAfter ? utcIso(asset.deleteAfter) : undefined, createdAt: utcIso(asset.createdAt), updatedAt: utcIso(asset.updatedAt) };
}

/** Resolve only the canonical, published gym logo for platform surfaces.
 * Marketplace rows store asset references rather than URLs; the reference
 * must belong to the same organization, be a public active gym-logo asset,
 * and resolve through Convex storage before it crosses the admin boundary.
 * The organization Brand Kit logo is a safe fallback when a public profile has
 * not selected a separate logo. */
async function platformGymLogoUrl(ctx: ReadContext, organization: Organization, listingValue: Data): Promise<string | undefined> {
  const candidateIds = [optionalString(listingValue.logoAssetId), optionalString(organization.brandLogoAssetId)].filter((id, index, ids): id is string => Boolean(id) && ids.indexOf(id) === index);
  for (const assetId of candidateIds) {
    const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", assetId)).unique();
    if (!asset || asset.ownerType !== "gym_logo" || asset.ownerPublicId !== publicOrganizationId(organization) || asset.visibility !== "public" || asset.status !== "active") continue;
    const url = await ctx.storage.getUrl(asset.storageId);
    if (url) return url;
  }
  return undefined;
}

async function gymPublicProfileView(ctx: ReadContext, actor: ActorContext, source?: Data): Promise<Data> {
  const value = source ?? {};
  const listing = (await recordsOf(ctx, actor, "marketplaceGym"))[0];
  const listingValue = data(listing?.data);
  const [trainers, packages, logo, cover, gallery] = await Promise.all([
    ctx.db.query("ptTrainerProfiles").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
    ctx.db.query("ptPackages").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect(),
    gymMediaAssetView(ctx, actor.organization, optionalString(value.logoAssetId), "gym_logo"),
    gymMediaAssetView(ctx, actor.organization, optionalString(value.coverAssetId), "gym_cover"),
    Promise.all(arrayValue(value.galleryAssetIds).map((id) => gymMediaAssetView(ctx, actor.organization, optionalString(id), "gym_gallery"))),
  ]);
  const versionRecords = await recordsOf(ctx, actor, "gymProfileVersion");
  return {
    organizationId: publicOrganizationId(actor.organization),
    version: numberValue(value.version, numberValue(listingValue.profileVersion, 1)),
    status: stringValue(value.status, booleanValue(listingValue.profilePublished, true) ? "published" : "unpublished"),
    // After the first publish, tenants save drafts but RIVET reviews and
    // publishes them; the editor uses this to swap its publish action.
    publishLocked: versionRecords.length > 0,
    shortName: stringValue(value.shortName, stringValue(listingValue.shortName, actor.organization.name.slice(0, 16))),
    taglineEn: stringValue(value.taglineEn, stringValue(listingValue.tagline)),
    taglineAr: optionalString(value.taglineAr) ?? optionalString(listingValue.taglineAr),
    descriptionEn: stringValue(value.descriptionEn, stringValue(listingValue.description)),
    descriptionAr: optionalString(value.descriptionAr) ?? optionalString(listingValue.descriptionAr),
    category: stringValue(value.category, stringValue(listingValue.category, "Gym")),
    audience: stringValue(value.audience, stringValue(listingValue.audience, "All members")),
    amenities: arrayValue(value.amenities ?? listingValue.amenities).map(String),
    contactEmail: optionalString(value.contactEmail) ?? optionalString(listingValue.contactEmail),
    contactPhone: optionalString(value.contactPhone) ?? optionalString(listingValue.contactPhone),
    websiteUrl: optionalString(value.websiteUrl) ?? optionalString(listingValue.websiteUrl),
    instagramUrl: optionalString(value.instagramUrl) ?? optionalString(listingValue.instagramUrl),
    accentColor: stringValue(value.accentColor, stringValue(listingValue.accent, "#15140f")),
    logo,
    cover,
    gallery: gallery.filter((item): item is Data => Boolean(item)),
    trainers: await Promise.all(trainers.filter((item) => item.status === "published").map((item) => ptTrainerView(ctx, actor.organization, item))),
    ptPackages: await Promise.all(packages.map((item) => ptPackageView(ctx, actor.organization, item))),
    publishedAt: optionalString(value.publishedAt),
    updatedAt: stringValue(value.updatedAt, listing ? utcIso(listing.updatedAt) : utcIso(actor.organization.updatedAt)),
  };
}

async function currentGymProfile(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const draft = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
  return await gymPublicProfileView(ctx, actor, draft ? data(draft.data) : undefined);
}

async function queryData(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "session") {
    const actor = await requireActor(ctx, request);
    return await buildSession(ctx, actor, request.activeBranchId);
  }

  if (operation === "health") {
    return { status: "ok", serverTime: Date.now() };
  }

  if (operation === "notifications.list") {
    const { user } = await requireAuthenticated(ctx);
    const notifications = (await ctx.db
      .query("operationalNotifications")
      .withIndex("by_recipient_created", (q) => q.eq("recipientUserId", user._id))
      .collect())
      .filter((notification) => !notification.expiresAt || notification.expiresAt > Date.now())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 100);
    return await Promise.all(notifications.map((notification) => notificationView(ctx, notification)));
  }

  if (operation === "public.marketplace") {
    const rows = await marketplaceRows(ctx);
    const visibleRows: Array<{ row: DomainRecord; organization: Organization; entitlement: Doc<"organizationEntitlements"> | null }> = [];
    for (const row of rows) {
      const listing = data(row.data);
      // Publication/profile flags belong to the directory record, but tenant
      // lifecycle is authoritative on organizations. Do not reject a healthy
      // tenant solely because an old directory status is stale; the projection
      // below will replace that status from the organization row.
      if (!booleanValue(listing.isPublic) || !booleanValue(listing.profilePublished, true)) continue;
      // The directory projection is not an authority for tenant lifecycle.
      // Require a real, same-tenant organization and read its status before a
      // gym is exposed to member discovery. This prevents stale active/public
      // rows (including unprovisioned demo rows) surviving suspension.
      const targetOrganizationId = optionalString(listing.targetOrganizationId);
      if (!targetOrganizationId) continue;
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique();
      const entitlement = organization
        ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique()
        : null;
      if (!organization || organization._id !== row.organizationId || !acceptsPublicTrialRequests(listing, platformSubscriptionStatusForOrganization(organization.status), organization.trialEndsAt, true)) continue;
      visibleRows.push({ row, organization, entitlement });
    }
    return await Promise.all(visibleRows.map(async ({ row, organization, entitlement }) => {
      const listingValue = data(row.data);
      const [trainers, packages, plans, members, branches, tenantSettings, logo, cover, gallery] = await Promise.all([
        ctx.db.query("ptTrainerProfiles").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect(),
        ctx.db.query("ptPackages").withIndex("by_organization_status", (q) => q.eq("organizationId", organization._id).eq("status", "active")).collect(),
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "plan")).collect(),
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "member")).collect(),
        ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect(),
        ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "settings").eq("publicId", "settings")).unique(),
        gymMediaAssetView(ctx, organization, optionalString(listingValue.logoAssetId), "gym_logo"),
        gymMediaAssetView(ctx, organization, optionalString(listingValue.coverAssetId), "gym_cover"),
        Promise.all(arrayValue(listingValue.galleryAssetIds).map((id) => gymMediaAssetView(ctx, organization, optionalString(id), "gym_gallery"))),
      ]);
      const activePlans = plans.map((item) => data(item.data)).filter((item) => stringValue(item.status, "active") === "active");
      const activePrices = activePlans.map((item) => amountOf(item.basePrice)).filter((amount) => amount > 0);
      // Keep the public projection aligned with the tenant lifecycle even if
      // an older directory row has not yet been repaired by an admin.
      const baseView = marketplaceView(platformMarketplaceProjection(listingValue, organization, entitlement));
      const rawBranches = arrayValue(listingValue.branches).map(data);
      const trialSchedules = arrayValue(data(data(tenantSettings?.data).operationalPolicies).trialSchedules).map(data);
      const liveBranches = branches.filter((branch) => branch.active && branch.status !== "inactive");
      const publicBranches = liveBranches.map((branch) => {
        const internalBranchId = publicBranchId(branch);
        const persisted = rawBranches.find((candidate) => candidate.internalBranchId === internalBranchId);
        const schedule = trialSchedules.find((candidate) => candidate.branchId === internalBranchId);
        const trialSchedule = schedule
          ? Object.fromEntries(WEEKDAYS.map((weekday) => [weekday, normalizedTrialWindow(data(data(schedule.days)[weekday]))]))
          : undefined;
        return {
          id: optionalString(persisted?.id) ?? internalBranchId,
          internalBranchId,
          name: branch.name,
          address: branch.address ?? "",
          area: optionalString(persisted?.area) ?? branch.address ?? stringValue(listingValue.city),
          trialSlots: [],
          ...(trialSchedule ? { trialSchedule } : {}),
        };
      });
      return {
        ...baseView,
        branches: publicBranches,
        plans: activePlans.map((plan) => ({
          id: stringValue(plan.id),
          name: stringValue(plan.name),
          kind: stringValue(plan.kind),
          durationDays: plan.durationDays === undefined ? undefined : numberValue(plan.durationDays),
          visitAllowance: plan.visitAllowance === undefined ? undefined : numberValue(plan.visitAllowance),
          visitValidityDays: plan.visitValidityDays === undefined ? undefined : numberValue(plan.visitValidityDays),
          basePrice: money(amountOf(plan.basePrice), currencyOf(plan.basePrice, organization.currency)),
          branchAccess: stringValue(plan.branchAccess, "all"),
          branchIds: arrayValue(plan.branchIds).map(String),
          includedPtSessions: numberValue(plan.includedPtSessions),
        })),
        memberCount: members.filter((item) => stringValue(data(item.data).status, "active") === "active").length,
        branchCount: liveBranches.length,
        fromPriceMinor: activePrices.length ? Math.min(...activePrices) : 0,
        trainers: await Promise.all(trainers.filter((item) => item.status === "published").map((item) => ptTrainerView(ctx, organization, item))),
        ptPackages: await Promise.all(packages.map((item) => ptPackageView(ctx, organization, item))),
        logo,
        cover,
        gallery: gallery.filter((asset): asset is Data => Boolean(asset)),
      };
    }));
  }
  if (operation === "public.catalog") {
    return await platformPlans(ctx);
  }
  if (operation === "customer.experience") return await customerExperience(ctx);
  if (operation === "customer.pt") return await customerPtExperience(ctx, recordId(input.membershipId));
  if (operation === "customer.pt.slots") {
    const context = await customerPtContext(ctx, recordId(input.membershipId));
    const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", context.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique();
    const branch = await branchByPublicId(ctx, context.organization._id, recordId(input.branchId));
    if (!trainer || trainer.status !== "published" || !branch || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer availability not found.");
    return await ptSlots(ctx, context.organization, trainer, branch, stringValue(input.from), stringValue(input.to));
  }
  if (operation === "platform.applications") {
    await requirePlatformAdmin(ctx, request.correlationId);
    const requestedStatus = optionalString(input.status);
    const allowedStatuses = new Set(["pending", "under_review", "approved", "rejected"]);
    const search = optionalString(input.search);
    const rows = (await ctx.db.query("gymApplications").collect())
      .filter((row) => !requestedStatus || (allowedStatuses.has(requestedStatus) && row.status === requestedStatus))
      .filter((row) => matchesSearch([row.gymName, row.ownerName, row.email, row.contactNumber, row.plan, row.status], search))
      .sort((a, b) => b.submittedAt - a.submittedAt);
    return rows.map(gymApplicationView);
  }
  if (operation === "platform.marketingMigration.preview") {
    await requirePlatformAdmin(ctx, request.correlationId);
    const profiles = await ctx.db.query("customerProfiles").collect();
    const members = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect();
    const profileCount = profiles.filter((profile) => !profile.marketingPreferenceStatus || profile.marketingPreferenceSource === "system_default").length;
    const memberCount = members.filter((record) => {
      const preference = data(data(record.data).marketingPreference);
      return !optionalString(preference.status) && (!optionalString(preference.source) || preference.source === "system_default");
    }).length;
    return { profileCount, memberCount, totalCount: profileCount + memberCount, targetStatus: "unknown", marketingDelivery: "suppressed" };
  }
  if (operation === "platform.snapshot") {
    await requirePlatformAdmin(ctx, request.correlationId);
    const gymProjections = await Promise.all((await marketplaceRows(ctx)).map(async (row) => {
      const listing = data(row.data);
      const targetOrganizationId = optionalString(listing.targetOrganizationId);
      const organization = targetOrganizationId
        ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
        : null;
      const sameTenantOrganization = organization && organization._id === row.organizationId ? organization : null;
      const entitlement = sameTenantOrganization
        ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", sameTenantOrganization._id)).unique()
        : null;
      const logoUrl = sameTenantOrganization ? await platformGymLogoUrl(ctx, sameTenantOrganization, listing) : undefined;
      return {
        view: marketplaceView(platformMarketplaceProjection({ ...listing, logoUrl }, sameTenantOrganization, entitlement), true),
        provisioned: Boolean(sameTenantOrganization),
        organizationId: sameTenantOrganization ? String(sameTenantOrganization._id) : undefined,
      };
    }));
    const gyms = gymProjections.map(({ view }) => view);
    const bookings = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect()).map((row): Data => ({ id: row.publicId, organizationId: String(row.organizationId), ...data(row.data) }));
    const invoices = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect()).map((row): Data => ({ id: row.publicId, organizationId: String(row.organizationId), ...data(row.data) }));
    const supportCaseRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "supportCase")).collect();
    const supportCases = await Promise.all(supportCaseRows.map(async (row) => ({ view: await supportCaseView(ctx, row), organizationId: String(row.organizationId) })));
    const supportCaseViews = supportCases.map(({ view }) => view);
    const applications = (await ctx.db.query("gymApplications").collect()).map(gymApplicationView);
    const auditEvents = (await ctx.db.query("platformAuditEvents").withIndex("by_occurred").collect())
      .sort((left, right) => right.occurredAt - left.occurredAt)
      .slice(0, 100)
      .map((event) => ({ id: event.publicId, action: event.action, summary: event.summary, actorName: event.actorName, occurredAt: utcIso(event.occurredAt) }));
    const plans = await platformPlans(ctx);
    const [organizations, branches, staffMemberships, memberRows, entitlements] = await Promise.all([
      ctx.db.query("organizations").collect(),
      ctx.db.query("branches").collect(),
      ctx.db.query("organizationMemberships").collect(),
      ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect(),
      ctx.db.query("organizationEntitlements").collect(),
    ]);
    const entitlementByOrganization = new Map(entitlements.map((entitlement) => [String(entitlement.organizationId), entitlement]));
    const provisionedOrganizationIds = new Set(gymProjections.filter(({ view, provisioned, organizationId }) => provisioned && !booleanValue(view.isArchived) && organizationId).map(({ organizationId }) => organizationId as string));
    const overview = buildPlatformOverview({
      gyms: gymProjections.map(({ view, provisioned, organizationId }) => ({ id: stringValue(view.id), organizationId, subscriptionStatus: stringValue(view.subscriptionStatus), trialEndsAt: optionalString(view.trialEndsAt), provisioned: provisioned && !booleanValue(view.isArchived) })),
      organizations: organizations.map((organization) => ({ id: String(organization._id), status: organization.status, subscriptionPlan: organization.subscriptionPlan, entitlementPlan: entitlementByOrganization.get(String(organization._id))?.subscriptionPlan, billingInterval: billingInterval(organization.billingInterval), provisioned: provisionedOrganizationIds.has(String(organization._id)) })),
      plans: plans.map((plan) => ({ name: stringValue(plan.name), priceMinor: numberValue(plan.priceMinor) })),
      branches: branches.map((branch) => ({ organizationId: String(branch.organizationId), active: branch.active, status: branch.status })),
      members: memberRows.map((member) => ({ organizationId: String(member.organizationId), status: optionalString(data(member.data).status) })),
      staffMemberships: staffMemberships.map((membership) => ({ organizationId: String(membership.organizationId), active: membership.active })),
      bookings: bookings.map((booking) => ({ organizationId: optionalString(booking.organizationId), gymId: optionalString(booking.gymId), status: optionalString(booking.status) })),
      applications: applications.map((application) => ({
        id: stringValue(application.id),
        gymName: stringValue(application.gymName),
        plan: stringValue(application.plan),
        status: stringValue(application.status),
        updatedAt: stringValue(application.updatedAt),
        provisioningStatus: optionalString(application.provisioningStatus),
        provisioningError: optionalString(application.provisioningError),
        provisioningOutcome: optionalString(application.provisioningOutcome),
      })),
      invoices: invoices.map((invoice) => ({
        id: stringValue(invoice.id),
        organizationId: optionalString(invoice.organizationId),
        gymId: optionalString(invoice.gymId),
        gym: optionalString(invoice.gym),
        amount: optionalString(invoice.amount),
        amountMinor: typeof invoice.amountMinor === "number" ? invoice.amountMinor : undefined,
        currency: optionalString(invoice.currency),
        cycleKey: optionalString(invoice.cycleKey),
        billingInterval: invoice.billingInterval === "annual" || invoice.billingInterval === "monthly" ? invoice.billingInterval : undefined,
        status: optionalString(invoice.status),
        date: optionalString(invoice.date),
        issuedAt: optionalString(invoice.issuedAt),
        dueAt: optionalString(invoice.dueAt),
        periodStart: optionalString(invoice.periodStart),
        periodEnd: optionalString(invoice.periodEnd),
        paymentReference: optionalString(invoice.paymentReference),
        paidAt: optionalString(invoice.paidAt),
        pastDueAt: optionalString(invoice.pastDueAt),
        voidedAt: optionalString(invoice.voidedAt),
        occurredAt: optionalString(invoice.occurredAt),
      })),
      supportCases: supportCases.map(({ view, organizationId }) => ({
        id: stringValue(view.id),
        organizationId,
        gymId: optionalString(view.gymId),
        gym: optionalString(view.gym),
        subject: optionalString(view.subject),
        body: optionalString(view.body),
        priority: optionalString(view.priority),
        status: optionalString(view.status),
        requestType: optionalString(view.requestType),
        requestedPlan: optionalString(view.requestedPlan),
        billingInterval: optionalString(view.billingInterval),
        createdAt: optionalString(view.createdAt),
      })),
    });
    return { gyms, bookings, invoices, supportCases: supportCaseViews, applications, auditEvents, plans, overview };
  }
  if (operation === "platform.gym.detail") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const gymId = recordId(input.gymId);
    const row = (await marketplaceRows(ctx)).find((candidate) => candidate.publicId === gymId);
    if (!row) domainError("NOT_FOUND", "Gym not found.", { correlationId: admin.correlationId });

    const gym = data(row.data);
    const targetOrganizationId = optionalString(gym.targetOrganizationId);
    const organizationCandidate = targetOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
      : null;
    const organization = organizationCandidate && organizationCandidate._id === row.organizationId ? organizationCandidate : null;
    const entitlement = organization
      ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique()
      : null;
    const rawPlan = stringValue(gym.rivetPlan);
    const effectiveStatus = organization ? platformSubscriptionStatusForOrganization(organization.status) : "suspended";
    const effectivePlan = organization ? platformPlanFromFacts(gym, organization, entitlement) ?? rawPlan : rawPlan;
    const allowedStatuses = ["trial", "active", "overdue", "suspended", "cancelled"] as const;
    const allowedPlans = ["Starter", "Growth", "Pro", "Enterprise"] as const;
    if (!allowedStatuses.includes(effectiveStatus as (typeof allowedStatuses)[number]) || !allowedPlans.includes(effectivePlan as (typeof allowedPlans)[number])) {
      domainError("CONFIGURATION_ERROR", "This gym does not have a complete platform subscription projection.", { correlationId: admin.correlationId });
    }

    let branches: Array<{ id: string; name: string; code: string; address?: string; phone?: string; status: "active" | "inactive" }> = [];
    let owner: { name: string; email: string; phone?: string } | undefined;
    let memberCount = 0;
    let activeStaffCount = 0;
    let staffLimit: number | undefined;
    let automationRuleCount = 0;
    let paymentTransactionCount = 0;
    let recurringAmountMinor: number | undefined;
    let invoices: Array<Record<string, unknown> & { id: string }> | undefined;
    let publicPage: { publishedVersion: number; draftVersion?: number; draftStatus?: string; draftUpdatedAt?: string } | undefined;
    let activity: Array<{ id: string; action: string; summary: string; actorName: string; occurredAt: string }> = [];

    if (organization) {
      const branchRows = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
      branches = branchRows.map((branch) => ({
        id: publicBranchId(branch),
        name: branch.name,
        code: branch.code,
        address: branch.address,
        phone: branch.phone,
        status: branch.active && branch.status !== "inactive" ? "active" : "inactive",
      }));

      const membershipRows = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
      activeStaffCount = membershipRows.filter((membership) => membership.active).length;
      const ownerMembership = membershipRows.find((membership) => membership.active && membership.role === "owner");
      const ownerUser = ownerMembership ? await ctx.db.get(ownerMembership.userId) : null;
      if (ownerUser) owner = { name: ownerUser.fullName, email: ownerUser.email, phone: ownerUser.phone };

      const [memberRows, planRows, ruleRows, paymentRows] = await Promise.all([
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "member")).collect(),
        platformPlans(ctx),
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "automationRule")).collect(),
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "payment")).collect(),
      ]);
      memberCount = memberRows.filter((member) => stringValue(data(member.data).status) === "active").length;
      automationRuleCount = ruleRows.length;
      paymentTransactionCount = paymentRows.length;
      const configuredPlan = planRows.find((plan) => stringValue(data(plan).name) === effectivePlan);
      const configuredStaffLimit = configuredPlan ? data(configuredPlan).staff : undefined;
      if (typeof configuredStaffLimit === "number" && Number.isFinite(configuredStaffLimit)) staffLimit = configuredStaffLimit;

      // The recurring amount is the same catalog price and annual formula the
      // subscription clock invoices with, so this panel can never disagree
      // with the ledger it summarizes.
      const configuredPrice = configuredPlan ? data(configuredPlan).priceMinor : undefined;
      if (typeof configuredPrice === "number" && Number.isSafeInteger(configuredPrice) && configuredPrice >= 0) {
        recurringAmountMinor = billingInterval(organization.billingInterval) === "annual" ? annualPrice(configuredPrice) : configuredPrice;
      }
      invoices = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice")).collect())
        .map((row) => ({ id: row.publicId, organizationId: String(row.organizationId), ...data(row.data) }));

      // Public-page review facts: after the first self-serve publish, tenant
      // drafts wait here for a platform admin to review and publish them.
      const profileDraft = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
      const profileDraftValue = profileDraft ? data(profileDraft.data) : undefined;
      publicPage = {
        publishedVersion: booleanValue(gym.profilePublished, false) ? numberValue(gym.profileVersion, 0) : 0,
        ...(profileDraftValue ? {
          draftVersion: numberValue(profileDraftValue.version),
          draftStatus: stringValue(profileDraftValue.status, "draft"),
          draftUpdatedAt: optionalString(profileDraftValue.updatedAt),
        } : {}),
      };

      const directActivity = await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "platform_gym").eq("entityPublicId", gymId)).collect();
      const applicationId = optionalString(gym.applicationId);
      const applicationActivity = applicationId
        ? await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "gym_application").eq("entityPublicId", applicationId)).collect()
        : [];
      const targetActivity = [...directActivity, ...applicationActivity]
        .filter((event, index, events) => events.findIndex((candidate) => candidate.publicId === event.publicId) === index)
        .filter((event) => event.entityType === "platform_gym" || stringValue(data(event.after).organizationId) === publicOrganizationId(organization))
        .sort((left, right) => right.occurredAt - left.occurredAt);
      activity = targetActivity.map((event) => ({ id: event.publicId, action: event.action, summary: event.summary, actorName: event.actorName, occurredAt: utcIso(event.occurredAt) }));
    }

    const status = effectiveStatus as "trial" | "active" | "overdue" | "suspended" | "cancelled";
    const plan = effectivePlan as "Starter" | "Growth" | "Pro" | "Enterprise";
    const logoUrl = organization ? await platformGymLogoUrl(ctx, organization, gym) : undefined;
    return buildPlatformGymDetail({
      gym: {
        id: gymId,
        name: stringValue(gym.name, gymId),
        shortName: stringValue(gym.shortName, stringValue(gym.name, gymId).slice(0, 3).toUpperCase()),
        accent: stringValue(gym.accent, "#1b1a15"),
        subscriptionStatus: status,
        rivetPlan: plan,
        isPublic: Boolean(organization && (status === "active" || status === "trial") && booleanValue(gym.isPublic)),
        isArchived: Boolean(organization?.archivedAt || gym.isArchived),
        archivedAt: organization?.archivedAt ?? validSubscriptionTimestamp(gym.archivedAt),
        archiveReason: organization?.archiveReason ?? optionalString(gym.archiveReason),
      },
      logoUrl,
      organization: organization
        ? {
            id: publicOrganizationId(organization),
            name: organization.name,
            status: organization.status,
            currency: organization.currency,
            timezone: organization.timezone,
            createdAt: organization.createdAt,
            subscriptionPlan: plan,
            billingInterval: organization.billingInterval ?? "monthly",
            subscriptionStartedAt: organization.subscriptionStartedAt,
            trialEndsAt: organization.trialEndsAt,
            currentPeriodEndsAt: organization.currentPeriodEndsAt,
            cancelledAt: organization.cancelledAt,
            subscriptionStatusReason: organization.subscriptionStatusReason,
            archivedAt: organization.archivedAt,
            archiveReason: organization.archiveReason,
          }
        : undefined,
      branches,
      owner,
      usage: { memberCount, activeStaffCount, staffLimit, automationRuleCount, paymentTransactionCount },
      recurringAmountMinor,
      invoices,
      publicPage,
      activity,
    });
  }

  const actor = await requireActor(ctx, request);
  const orgId = publicOrganizationId(actor.organization);

  switch (operation) {
    case "support.list": {
      const records = await recordsOf(ctx, actor, "supportCase");
      const visible = actor.role === "owner" || actor.role === "manager"
        ? records
        : records.filter((record) => stringValue(data(record.data).creatorId) === publicUserId(actor.user));
      return await Promise.all(visible.sort((left, right) => right.updatedAt - left.updatedAt).map((record) => supportCaseView(ctx, record)));
    }
    case "settings.get": {
      const branches = await accessibleBranches(ctx, actor);
      const settings = await settingsData(ctx, actor);
      const brand = await brandKitView(ctx, actor.organization);
      return {
        organization: { ...organizationView(actor.organization), brand },
        brand,
        branches: branches.map((branch) => branchView(branch, orgId)),
        paymentMethods: settings.paymentMethods,
        roles: await roleViews(ctx, actor),
        notifications: settings.notifications,
        operationalPolicies: settings.operationalPolicies,
        workspace: await workspaceAccessData(ctx, actor),
      };
    }
    case "workspace.access":
      return await workspaceAccessData(ctx, actor);
    case "workspace.entitlements": {
      const access = await workspaceAccessData(ctx, actor);
      return access.entitlements;
    }
    case "workspace.preferences": {
      const access = await workspaceAccessData(ctx, actor);
      return access.preferences;
    }
    case "workspace.module": {
      const key = stringValue(input.moduleKey);
      if (!WORKSPACE_MODULE_CATALOG.some((module) => module.key === key)) domainError("VALIDATION_ERROR", "Unknown workspace module.", { correlationId: actor.correlationId, details: { module: key } });
      const access = await workspaceAccessData(ctx, actor);
      requireWorkspaceModule(actor, access, key as WorkspaceModuleKey);
      return arrayValue(access.modules).map(data).find((item) => item.key === key);
    }
    case "settings.operationalEmail.get": {
      requirePermission(actor, "settings.manage");
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
      const updatedBy = settings ? await ctx.db.get(settings.updatedByUserId) : undefined;
      const confirmedBy = settings?.ownerConfirmedByUserId ? await ctx.db.get(settings.ownerConfirmedByUserId) : undefined;
      const providerConfigured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
      return { enabledKinds: settings?.enabledKinds ?? [], availableKinds: [...GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS], configurableKinds: [...GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS], mandatoryPlatformKinds: [...MANDATORY_PLATFORM_EMAIL_KINDS], liveWorkerEnabled: process.env.RIVET_OPERATIONAL_EMAIL_LIVE === "true" && providerConfigured, providerConfigured, webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()), ownerConfirmed: Boolean(settings?.ownerConfirmedAt), ownerConfirmedAt: settings?.ownerConfirmedAt ? utcIso(settings.ownerConfirmedAt) : undefined, ownerConfirmedBy: confirmedBy?.fullName, updatedAt: settings ? utcIso(settings.updatedAt) : undefined, updatedBy: updatedBy?.fullName, reason: settings?.reason };
    }
    case "settings.brand.get":
      requirePermission(actor, "settings.manage");
      return await brandKitView(ctx, actor.organization);
    case "branches.list":
      return (await accessibleBranches(ctx, actor)).map((branch) => branchView(branch, orgId));
    case "zones.list": {
      const requestedBranchId = optionalString(input.branchId);
      const branches = requestedBranchId
        ? [await branchByPublicId(ctx, actor.organization._id, requestedBranchId)]
        : await accessibleBranches(ctx, actor);
      const validBranches = branches.filter((branch): branch is Branch => Boolean(branch));
      for (const branch of validBranches) assertBranchAccess(actor, branch);
      if (requestedBranchId && validBranches.length === 0) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
      const rows = (await Promise.all(validBranches.map((branch) => ctx.db.query("zones").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect()))).flat();
      const branchIds = new Map(validBranches.map((branch) => [String(branch._id), publicBranchId(branch)]));
      const includeArchived = input.includeArchived === true;
      return rows
        .filter((zone) => includeArchived || zone.status === "active")
        .sort((left, right) => left.code.localeCompare(right.code))
        .map((zone) => {
          const branchId = branchIds.get(String(zone.branchId));
          if (!branchId) domainError("NOT_FOUND", "Zone branch not found.", { correlationId: actor.correlationId });
          return zoneView(zone, orgId, branchId);
        });
    }
    case "profiles.gym.get": {
      requirePermission(actor, "profiles.manage");
      return await currentGymProfile(ctx, actor);
    }
    case "profiles.gym.versions": {
      requirePermission(actor, "profiles.manage");
      const versions = (await recordsOf(ctx, actor, "gymProfileVersion")).sort((left, right) => numberValue(data(right.data).version) - numberValue(data(left.data).version));
      return await Promise.all(versions.map(async (record) => {
        const value = data(record.data);
        const profile = await gymPublicProfileView(ctx, actor, value);
        return { id: record.publicId, organizationId: orgId, version: numberValue(value.version), status: stringValue(value.status, "unpublished"), profile, publishedAt: optionalString(value.publishedAt), unpublishedAt: optionalString(value.unpublishedAt), updatedAt: stringValue(value.updatedAt, utcIso(record.updatedAt)) };
      }));
    }
    case "plans.list": {
      requirePermission(actor, "members.read");
      let records = await recordsOf(ctx, actor, "plan");
      const status = optionalString(input.status);
      if (status) records = records.filter((record) => stringValue(data(record.data).status, "active") === status);
      let items = await Promise.all(records.map((record) => toPlan(ctx, actor, data(record.data))));
      items = items.filter((plan) => matchesSearch([plan.name, plan.code], optionalString(input.search)));
      items = sortRecords(items, input.sort ?? "name", (plan, key) => stringValue(plan[key]));
      return page(items, input);
    }
    case "pt.workspace": {
      const canReadReports = hasPermission(actor, "pt.reports.read");
      if (!canReadReports && !hasPermission(actor, "pt.schedule.self")) requirePermission(actor, "pt.reports.read");
      const [allTrainers, allPackages, allBookings, allOrders, entitlements, paymentRows] = await Promise.all([
        ctx.db.query("ptTrainerProfiles").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
        ctx.db.query("ptPackages").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
        ctx.db.query("ptBookings").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id)).collect(),
        ctx.db.query("ptPackageOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
        ctx.db.query("ptEntitlements").withIndex("by_expiry", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect(),
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "payment")).collect(),
      ]);
      const ownTrainer = allTrainers.find((item) => item.userId === actor.user._id);
      const visibleTrainers = canReadReports ? allTrainers : ownTrainer ? [ownTrainer] : [];
      const visibleTrainerIds = new Set(visibleTrainers.map((item) => item._id));
      const visibleBookings = allBookings.filter((item) => visibleTrainerIds.has(item.trainerProfileId) && (actor.branchScope === "all" || actor.branchIds.includes(item.branchId)));
      const visibleEntitlementIds = new Set(visibleBookings.map((item) => item.entitlementId));
      const visibleEntitlements = canReadReports ? entitlements : entitlements.filter((item) => visibleEntitlementIds.has(item._id));
      const ptChargeIds = new Set(allOrders.map((order) => order.chargePublicId));
      const packageRevenue = canReadReports ? paymentRows.map((row) => data(row.data)).filter((payment) => ptChargeIds.has(stringValue(payment.chargeId)) && payment.status !== "voided").reduce((total, payment) => total + amountOf(payment.amount), 0) : 0;
      return {
        trainers: await Promise.all(visibleTrainers.map((item) => ptTrainerView(ctx, actor.organization, item))),
        packages: canReadReports ? await Promise.all(allPackages.map((item) => ptPackageView(ctx, actor.organization, item))) : [],
        bookings: await Promise.all(visibleBookings.sort((left, right) => left.startsAt - right.startsAt).map((item) => ptBookingView(ctx, actor.organization, item))),
        pendingOrders: canReadReports ? await Promise.all(allOrders.filter((item) => item.status === "pending_payment").map((item) => ptPackageOrderView(ctx, actor.organization, item))) : [],
        metrics: {
          packageRevenue: money(packageRevenue, actor.organization.currency),
          sessionsUsed: visibleEntitlements.reduce((total, item) => total + item.consumed, 0),
          sessionsReserved: visibleEntitlements.reduce((total, item) => total + item.reserved, 0),
          upcomingBookings: visibleBookings.filter((item) => ["reserved", "confirmed"].includes(item.status) && item.startsAt > Date.now()).length,
          noShows: visibleBookings.filter((item) => item.status === "no_show").length,
        },
      };
    }
    case "pt.member": {
      requirePermission(actor, "members.read");
      const membership = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      return await ptMemberExperience(ctx, actor, membership);
    }
    case "pt.slots": {
      const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique();
      const branch = await branchByPublicId(ctx, actor.organization._id, recordId(input.branchId));
      if (!trainer || !branch || trainer.status !== "published" || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer availability not found.", { correlationId: actor.correlationId });
      assertBranchAccess(actor, branch);
      return await ptSlots(ctx, actor.organization, trainer, branch, stringValue(input.from), stringValue(input.to));
    }
    case "pt.introductory.preview": {
      requirePermission(actor, "pt.manage");
      const sessionCount = numberValue(input.sessionCount, 2);
      if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 100) domainError("VALIDATION_ERROR", "Introductory PT credits must be between 1 and 100 sessions.", { correlationId: actor.correlationId });
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const memberships = (await membershipRecords(ctx, actor)).filter((record) => ["active", "expiring"].includes(statusOfMembership(data(record.data), today)));
      const grants = await ctx.db.query("ptEntitlements").withIndex("by_expiry", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect();
      const grantedMembershipIds = new Set(grants.filter((item) => item.grantKind === "introductory").map((item) => item.membershipPublicId));
      const alreadyGranted = memberships.filter((record) => grantedMembershipIds.has(record.publicId)).length;
      return { eligibleMemberships: memberships.length - alreadyGranted, alreadyGranted, sessionCount };
    }
    case "members.list": {
      requirePermission(actor, "members.read");
      const branchId = optionalString(input.branchId);
      const records = branchId ? await recordsOfBranch(ctx, actor, "member", branchId) : await memberRecords(ctx, actor);
      let candidateValues = records.map((record) => data(record.data));
      if (branchId) candidateValues = candidateValues.filter((member) => member.homeBranchId === branchId);
      if (input.status) candidateValues = candidateValues.filter((member) => stringValue(member.status, "active") === input.status);
      candidateValues = candidateValues.filter((member) => matchesSearch([member.fullName, member.fullNameAr, member.phone, member.memberNumber, member.email], optionalString(input.search)));
      let items = await toMemberSummaries(ctx, actor, candidateValues);
      if (input.planId) {
        const memberships = await membershipRecords(ctx, actor);
        const memberIds = memberships.map((record) => data(record.data)).filter((membership) => membership.planId === input.planId).map((membership) => membership.memberId);
        items = items.filter((member) => memberIds.includes(member.id));
      }
      if (input.membershipStatus) {
        if (input.membershipStatus === "outstanding") items = items.filter((member) => amountOf(member.outstanding) > 0);
        else items = items.filter((member) => member.membershipStatus === input.membershipStatus);
      }
      items = sortRecords(items, input.sort ?? "fullName", (member, key) => key === "outstanding" ? amountOf(member.outstanding) : stringValue(member[key]));
      return page(items, input);
    }
    case "members.get": {
      requirePermission(actor, "members.read");
      const record = await recordOf(ctx, actor, "member", recordId(input.memberId));
      return await toMemberDetail(ctx, actor, data(record.data));
    }
    case "members.duplicates": {
      requirePermission(actor, "members.read");
      const phone = normalize(optionalString(input.phone));
      const email = normalize(optionalString(input.email));
      const records = await memberRecords(ctx, actor);
      return records
        .map((record) => data(record.data))
        .filter((member) => member.status !== "archived")
        .flatMap((member) => {
          if (phone && normalize(optionalString(member.phone)) === phone) return [{ memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber, matchedOn: "phone" }];
          if (email && normalize(optionalString(member.email)) === email) return [{ memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber, matchedOn: "email" }];
          return [];
        });
    }
    case "members.timeline": {
      requirePermission(actor, "members.read");
      const memberId = recordId(input.memberId);
      await recordOf(ctx, actor, "member", memberId);
      let events = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).filter((event) => event.memberId === memberId);
      if (Array.isArray(input.types)) events = events.filter((event) => arrayValue(input.types).includes(event.type));
      events.sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt)));
      return page(events, input);
    }
    case "plans.get": {
      requirePermission(actor, "members.read");
      const record = await recordOf(ctx, actor, "plan", recordId(input.planId));
      return await toPlan(ctx, actor, data(record.data));
    }
    case "memberships.list": {
      requirePermission(actor, "members.read");
      const branchId = optionalString(input.branchId);
      const membershipRows = branchId ? await recordsOfBranch(ctx, actor, "membership", branchId) : await membershipRecords(ctx, actor);
      let items = await toMembershipSummaries(ctx, actor, membershipRows.map((record) => data(record.data)));
      if (branchId) items = items.filter((membership) => membership.homeBranchId === branchId);
      if (input.memberId) items = items.filter((membership) => membership.memberId === input.memberId);
      if (input.status) items = items.filter((membership) => membership.status === input.status);
      if (input.paymentStatus) items = items.filter((membership) => membership.paymentStatus === input.paymentStatus);
      items = items.filter((membership) => matchesSearch([membership.memberName, membership.memberNumber, membership.planName], optionalString(input.search)));
      items = sortRecords(items, input.sort ?? "-endDate", (membership, key) => stringValue(membership[key]));
      return page(items, input);
    }
    case "memberships.get": {
      requirePermission(actor, "members.read");
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      return await toMembershipDetail(ctx, actor, data(record.data));
    }
    case "leads.list": {
      requirePermission(actor, "crm.read");
      const [leadRecords, memberRecordsForLeads] = await Promise.all([
        input.branchId ? recordsOfBranch(ctx, actor, "lead", stringValue(input.branchId)) : recordsOf(ctx, actor, "lead"),
        recordsOf(ctx, actor, "member"),
      ]);
      // A converted lead is no longer actionable. In particular, do not let
      // archiving a member put their old conversion back into the follow-up
      // queues. Missing member records are treated the same way so a
      // permanently deleted archived member cannot leave a dangling lead.
      const memberById = new Map(memberRecordsForLeads.map((record) => [record.publicId, data(record.data)]));
      let visibleLeadRecords = leadRecords.filter((record) => {
        const convertedMemberId = optionalString(data(record.data).convertedMemberId);
        if (!convertedMemberId) return true;
        const member = memberById.get(convertedMemberId);
        return Boolean(member && stringValue(member.status, "active") !== "archived");
      });
      // Apply cheap persisted filters before the projection fan-out. Follow-up
      // queues normally request only a few open stages, so this avoids mapping
      // converted/irrelevant records just to discard them afterwards.
      if (input.branchId) {
        visibleLeadRecords = visibleLeadRecords.filter((record) => stringValue(data(record.data).branchId) === stringValue(input.branchId));
      }
      if (input.stage) {
        const stages = Array.isArray(input.stage) ? input.stage : [input.stage];
        visibleLeadRecords = visibleLeadRecords.filter((record) => stages.includes(stringValue(data(record.data).stage)));
      }
      if (input.ownerId === "unassigned") visibleLeadRecords = visibleLeadRecords.filter((record) => !optionalString(data(record.data).ownerId));
      else if (input.ownerId) visibleLeadRecords = visibleLeadRecords.filter((record) => stringValue(data(record.data).ownerId) === stringValue(input.ownerId));
      if (input.search) {
        visibleLeadRecords = visibleLeadRecords.filter((record) => {
          const value = data(record.data);
          return matchesSearch([value.fullName, value.phone, value.email], optionalString(input.search));
        });
      }
      let items = await toLeadSummaries(ctx, actor, visibleLeadRecords.map((record) => data(record.data)));
      if (input.overdueOnly) items = items.filter((lead) => lead.overdue);
      items = sortRecords(items, input.sort ?? "-createdAt", (lead, key) => stringValue(lead[key]));
      return page(items, input);
    }
    case "leads.get": {
      requirePermission(actor, "crm.read");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const leadId = stringValue(data(lead.data).id);
      const activities = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).filter((event) => event.leadId === leadId);
      const offers = (await recordsOf(ctx, actor, "offer")).map((record) => offerProjection(data(record.data))).filter((offer) => offer.leadId === leadId);
      const trialBooking = await linkedTrialBooking(ctx, actor, leadId);
      return { ...(await toLeadSummary(ctx, actor, data(lead.data))), notes: optionalString(data(lead.data).notes), activities, offers, ...(trialBooking ? { trialBooking: data(trialBooking.data) } : {}) };
    }
    case "tasks.list": {
      requirePermission(actor, "crm.read");
      const [taskRecords, leadRecords, memberRecordsForTasks] = await Promise.all([
        recordsOf(ctx, actor, "task"),
        recordsOf(ctx, actor, "lead"),
        recordsOf(ctx, actor, "member"),
      ]);
      const leadById = new Map(leadRecords.map((record) => [record.publicId, data(record.data)]));
      const memberById = new Map(memberRecordsForTasks.map((record) => [record.publicId, data(record.data)]));
      // Tasks are separate records from leads and members. Do not let a
      // closed lead, archived/deleted member, or dangling relation continue
      // to appear as actionable work after its underlying record is gone.
      // Completed/cancelled tasks remain available as history.
      const visibleTaskRecords = taskRecords.filter((record) => {
        const task = data(record.data);
        if (stringValue(task.status, "open") !== "open") return true;
        if (task.leadId) {
          const lead = leadById.get(stringValue(task.leadId));
          if (!lead || ["won", "lost"].includes(stringValue(lead.stage))) return false;
          const convertedMemberId = optionalString(lead.convertedMemberId);
          if (convertedMemberId) {
            const member = memberById.get(convertedMemberId);
            if (!member || stringValue(member.status, "active") === "archived") return false;
          }
        }
        if (task.memberId) {
          const member = memberById.get(stringValue(task.memberId));
          if (!member || stringValue(member.status, "active") === "archived") return false;
        }
        return true;
      });
      let items = await toTaskSummaries(
        ctx,
        actor,
        visibleTaskRecords.map((record) => data(record.data)),
        leadRecords.map((record) => data(record.data)),
        memberRecordsForTasks.map((record) => data(record.data)),
      );
      if (input.status) items = items.filter((task) => task.status === input.status);
      if (input.ownerId) items = items.filter((task) => task.ownerId === input.ownerId);
      if (input.overdueOnly) items = items.filter((task) => task.status === "open" && stringValue(task.dueAt) < isoNow());
      if (input.dueBefore) items = items.filter((task) => stringValue(task.dueAt) <= stringValue(input.dueBefore));
      items = sortRecords(items, input.sort ?? "dueAt", (task, key) => stringValue(task[key]));
      return page(items, input);
    }
    case "renewal.queue": {
      requirePermission(actor, "crm.read");
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const policies = (await settingsData(ctx, actor)).operationalPolicies;
      const renewalWindowDays = numberValue(data(data(policies).membership).renewalWindowDays, 14);
      const bucket = stringValue(input.bucket, "expiring");
      if (bucket !== "expiring" && bucket !== "expired") domainError("VALIDATION_ERROR", "Renewal bucket is invalid.", { correlationId: actor.correlationId });
      const requestedDays = numberValue(input.days, bucket === "expired" ? 45 : renewalWindowDays);
      if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 365) domainError("VALIDATION_ERROR", "Follow-up days must be between 1 and 365.", { correlationId: actor.correlationId });
      const fromDate = optionalString(input.fromDate);
      const toDate = optionalString(input.toDate);
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      if ((fromDate && !datePattern.test(fromDate)) || (toDate && !datePattern.test(toDate))) domainError("VALIDATION_ERROR", "Follow-up dates must use YYYY-MM-DD.", { correlationId: actor.correlationId });
      if (fromDate && diffDays(addDays(today, -365), fromDate) < 0) domainError("VALIDATION_ERROR", "Follow-up dates cannot be earlier than one year ago.", { correlationId: actor.correlationId });
      if (toDate && diffDays(addDays(today, -365), toDate) < 0) domainError("VALIDATION_ERROR", "Follow-up dates cannot be earlier than one year ago.", { correlationId: actor.correlationId });
      if (toDate && diffDays(today, toDate) > 365) domainError("VALIDATION_ERROR", "Follow-up dates cannot be more than one year ahead.", { correlationId: actor.correlationId });
      if (fromDate && toDate && diffDays(fromDate, toDate) < 0) domainError("VALIDATION_ERROR", "The follow-up start date must be before the end date.", { correlationId: actor.correlationId });
      const branchId = optionalString(input.branchId);
      if (branchId) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const [membershipRows, memberRows, timelineRows, taskRows] = await Promise.all([
        branchId ? recordsOfBranch(ctx, actor, "membership", branchId) : membershipRecords(ctx, actor),
        memberRecords(ctx, actor),
        recordsOf(ctx, actor, "timeline"),
        recordsOf(ctx, actor, "task"),
      ]);
      const terms = membershipRows.map((record) => data(record.data));
      const members = memberRows.map((record) => data(record.data));
      const membersById = new Map(members.map((member) => [member.id, member]));
      const renewedMembershipIds = new Set(terms.map((term) => optionalString(term.previousMembershipId)).filter(Boolean));
      const candidateTerms = terms.filter((term) => {
        const member = membersById.get(term.memberId);
        if (!member || member.status !== "active") return false;
        if (branchId && term.homeBranchId !== branchId) return false;
        if (renewedMembershipIds.has(term.id)) return false;
        const daysUntil = diffDays(today, stringValue(term.endDate));
        if (fromDate || toDate) {
          const lower = fromDate ?? (bucket === "expired" ? addDays(today, -requestedDays) : today);
          const upper = toDate ?? (bucket === "expired" ? today : addDays(today, requestedDays));
          return bucket === "expired" ? daysUntil < 0 && stringValue(term.endDate) >= lower && stringValue(term.endDate) <= upper : daysUntil >= 0 && stringValue(term.endDate) >= lower && stringValue(term.endDate) <= upper;
        }
        return bucket === "expired" ? daysUntil < 0 && daysUntil >= -requestedDays : daysUntil >= 0 && daysUntil <= requestedDays;
      });
      const [memberSummaries, membershipSummaries] = await Promise.all([
        toMemberSummaries(ctx, actor, members),
        toMembershipSummaries(ctx, actor, candidateTerms),
      ]);
      const memberSummaryById = new Map(memberSummaries.map((member) => [member.id, member]));
      const membershipSummaryById = new Map(membershipSummaries.map((membership) => [membership.id, membership]));
      const callsByMember = new Map<string, Data[]>();
      for (const record of timelineRows) {
        const event = data(record.data);
        if (event.type !== "call_attempt" || !event.memberId) continue;
        const calls = callsByMember.get(event.memberId) ?? [];
        calls.push(event);
        callsByMember.set(event.memberId, calls);
      }
      for (const calls of callsByMember.values()) calls.sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt)));
      const openTaskByMember = new Map<string, Data>();
      for (const record of taskRows) {
        const task = data(record.data);
        if (task.status === "open" && task.type === "renewal_call" && task.memberId && !openTaskByMember.has(task.memberId)) openTaskByMember.set(task.memberId, task);
      }
      const items: Data[] = candidateTerms.flatMap((term) => {
        const member = membersById.get(term.memberId);
        const memberSummary = member ? memberSummaryById.get(member.id) : undefined;
        const membershipSummary = membershipSummaryById.get(term.id);
        if (!member || !memberSummary || !membershipSummary) return [];
        const daysUntil = diffDays(today, stringValue(term.endDate));
        const calls = callsByMember.get(member.id) ?? [];
        const openTask = openTaskByMember.get(member.id);
        return [{ member: memberSummary, membership: membershipSummary, daysUntilExpiry: daysUntil, lastContactAt: calls[0]?.occurredAt, lastContactOutcome: optionalString(data(calls[0]?.meta).outcome), openTaskId: optionalString(openTask?.id) }];
      });
      items.sort((a, b) => numberValue(a.daysUntilExpiry) - numberValue(b.daysUntilExpiry));
      return page(items, input);
    }
    case "checkins.preview": {
      requirePermission(actor, "members.read");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const query = stringValue(input.query).trim();
      if (!query) return { found: false, decision: "blocked", reasonCodes: [], message: "Type a name, phone, or member number." };
      if (query.length < 3) return { found: false, decision: "blocked", reasonCodes: [], message: "Keep typing — at least 3 characters." };
      const entryPass = await resolveEntryPass(ctx, actor, query, branchId);
      const members = await memberRecords(ctx, actor);
      const member = entryPass
        ? members.map((record) => data(record.data)).find((item) => item.id === entryPass.payload.memberId || item.memberNumber === data(entryPass.membership.data).memberNumber)
        : query.startsWith(`${ENTRY_PASS_PREFIX}.`)
          ? undefined
          : members.map((record) => data(record.data)).find((item) => matchesSearch([item.fullName, item.fullNameAr, item.phone, item.memberNumber, item.email], query));
      if (!member) return { found: false, decision: "blocked", reasonCodes: [], message: `No member matches “${query}”.` };
      return await evaluateCheckIn(ctx, actor, member, branchId, false);
    }
    case "checkins.list": {
      requirePermission(actor, "members.read");
      const checkInRecords = input.branchId
        ? await recordsOfBranch(ctx, actor, "checkIn", stringValue(input.branchId))
        : await recordsOf(ctx, actor, "checkIn");
      let items = checkInRecords.map((record) => data(record.data));
      if (input.branchId) items = items.filter((item) => item.branchId === input.branchId);
      if (input.memberId) items = items.filter((item) => item.memberId === input.memberId);
      if (input.since) items = items.filter((item) => stringValue(item.occurredAt) >= stringValue(input.since));
      if (input.date) items = items.filter((item) => businessDate(stringValue(item.occurredAt), actor.organization.timezone || TZ_FALLBACK) === stringValue(input.date));
      if (input.acceptedOnly) items = items.filter((item) => item.decision !== "blocked");
      items.sort((left, right) => stringValue(right.occurredAt).localeCompare(stringValue(left.occurredAt)));
      return page(items, input);
    }
    case "checkins.occupancy": {
      requirePermission(actor, "members.read");
      const branchId = recordId(input.branchId);
      const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
      assertBranchAccess(actor, branch);
      const cutoff = Date.now() - 90 * 60_000;
      const rows = (await recordsOfBranch(ctx, actor, "checkIn", branchId)).map((record) => data(record.data)).filter((item) => item.branchId === branchId && item.decision !== "blocked");
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const todayRows = rows.filter((item) => businessDate(stringValue(item.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today);
      return { branchId, current: rows.filter((item) => new Date(stringValue(item.occurredAt)).getTime() >= cutoff).length, capacity: branch.capacity ?? 120, checkInsToday: todayRows.length, peakHour: peakHour(todayRows, actor.organization.timezone || TZ_FALLBACK) };
    }
    case "transactions.list": {
      requirePermission(actor, "reports.financial.read");
      let items = await toTransactionSummaries(ctx, actor, (await paymentRecords(ctx, actor)).map((record) => data(record.data)));
      if (input.branchId) items = items.filter((item) => item.branchId === input.branchId);
      if (input.memberId) items = items.filter((item) => item.memberId === input.memberId);
      if (input.method) items = items.filter((item) => item.method === input.method);
      if (input.type) items = items.filter((item) => item.type === input.type);
      if (input.from) items = items.filter((item) => stringValue(item.occurredAt) >= input.from);
      if (input.to) items = items.filter((item) => stringValue(item.occurredAt) <= `${input.to}T23:59:59.999Z`);
      items = items.filter((item) => matchesSearch([item.memberName, item.memberNumber, item.receiptNumber], optionalString(input.search)));
      items = sortRecords(items, input.sort ?? "-occurredAt", (item, key) => key === "amount" ? amountOf(item.amount) : stringValue(item[key]));
      return page(items, input);
    }
    case "receipts.get": {
      requirePermission(actor, "members.read");
      return await receiptDetail(ctx, actor, recordId(input.receiptId));
    }
    case "shifts.current": {
      requirePermission(actor, "reconciliation.open_shift");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const shifts = (await recordsOf(ctx, actor, "shift")).map((record) => data(record.data));
      const shift = shifts.find((item) => item.branchId === branchId && item.status === "open");
      return shift ? { shift, totals: await shiftTotals(ctx, actor, shift) } : null;
    }
    case "shifts.list": {
      requirePermission(actor, "reconciliation.read");
      let shifts = (await recordsOf(ctx, actor, "shift")).map((record) => data(record.data));
      if (input.branchId) shifts = shifts.filter((shift) => shift.branchId === input.branchId);
      shifts.sort((a, b) => stringValue(b.openedAt).localeCompare(stringValue(a.openedAt)));
      return page(shifts, input);
    }
    case "reconciliation.daily": {
      requirePermission(actor, "reconciliation.read");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      return await dailyReconciliation(ctx, actor, branchId, recordId(input.date));
    }
    case "automations.rules": {
      requirePermission(actor, "automations.manage");
      const rules = (await recordsOf(ctx, actor, "automationRule")).map((record) => data(record.data));
      return rules;
    }
    case "automations.rule": {
      requirePermission(actor, "automations.manage");
      return data((await recordOf(ctx, actor, "automationRule", recordId(input.id))).data);
    }
    case "automations.executions": {
      requirePermission(actor, "automations.manage");
      let executionRecords = await recordsOf(ctx, actor, "automationExecution");
      if (input.ruleId) executionRecords = executionRecords.filter((record) => data(record.data).ruleId === input.ruleId);
      const executions = await Promise.all(executionRecords.map((record) => automationExecutionView(ctx, actor, record)));
      executions.sort((a, b) => stringValue(b.executedAt).localeCompare(stringValue(a.executedAt)));
      return page(executions, input);
    }
    case "automations.execution": {
      requirePermission(actor, "automations.manage");
      return await automationExecutionView(ctx, actor, await recordOf(ctx, actor, "automationExecution", recordId(input.id)));
    }
    case "automations.run.preview": {
      requirePermission(actor, "automations.manage");
      const ruleRecord = await recordOf(ctx, actor, "automationRule", recordId(input.ruleId));
      const candidates = await automationCandidates(ctx, actor, ruleRecord);
      return {
        ruleId: ruleRecord.publicId,
        ruleName: stringValue(data(ruleRecord.data).name),
        eligibleCount: candidates.filter((candidate) => !candidate.duplicate).length,
        duplicateCount: candidates.filter((candidate) => candidate.duplicate).length,
        candidates: candidates.map((candidate) => ({
          subjectType: candidate.subjectType,
          subjectId: candidate.subjectId,
          subjectName: candidate.subjectName,
          branchId: candidate.branchId,
          duplicate: candidate.duplicate,
        })),
      };
    }
    case "automations.templates": {
      requirePermission(actor, "automations.manage");
      return (await recordsOf(ctx, actor, "messageTemplate")).map((record) => data(record.data));
    }
    case "operationalEmails.list": {
      requirePermission(actor, "automations.manage");
      let deliveries: Data[] = (await recordsOf(ctx, actor, "operationalEmailDelivery")).map((record): Data => ({ id: record.publicId, ...data(record.data) }));
      deliveries = deliveries.filter((delivery) => matchesSearch([delivery.kind, delivery.templateVersion, delivery.recipientReference, delivery.recipientEmail, delivery.status], optionalString(input.search)));
      deliveries.sort((left, right) => stringValue(right.queuedAt).localeCompare(stringValue(left.queuedAt)));
      return page(deliveries, input);
    }
    case "audit.list":
      return await auditPage(ctx, actor, input);
    case "approvals.list": {
      requirePermission(actor, "audit.read");
      let rows = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id)).order("desc").collect();
      if (actor.branchScope === "selected") rows = rows.filter((row) => (!row.branchId && !row.destinationBranchId) || actor.branchIds.includes(row.branchId!) || actor.branchIds.includes(row.destinationBranchId!));
      const reviews = await recordsOf(ctx, actor, "approvalReview");
      const reviewedIds = new Set(reviews.map((review) => optionalString(data(review.data).auditEventId)).filter(Boolean));
      return await Promise.all(rows.filter((row) => row.approvalStatus === "pending" && !reviewedIds.has(row.publicId)).map(async (row) => ({ id: row.publicId, organizationId: orgId, branchId: row.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.branchId) : undefined, destinationBranchId: row.destinationBranchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.destinationBranchId) : undefined, actorId: row.actorPublicId, actorName: row.actorName, actorRole: row.actorRole === "member" ? "member" : frontendRole(row.actorRole), category: row.category, action: row.action, entityType: row.entityType, entityId: row.entityPublicId, entityLabel: row.entityLabel, summary: row.summary, reason: row.reason, before: row.before, after: row.after, approvalStatus: row.approvalStatus, correlationId: row.correlationId, occurredAt: utcIso(row.occurredAt) })));
    }
    case "users.list": {
      if (!hasPermission(actor, "users.manage") && !hasPermission(actor, "crm.assign")) requirePermission(actor, "users.manage");
      const users = await ctx.db.query("users").collect();
      const output: Data[] = [];
      for (const user of users) {
        const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
        if (!membership) continue;
        const row: Data = { id: publicUserId(user), organizationId: orgId, name: user.fullName, email: user.email, phone: user.phone ?? "", role: frontendRole(membership.role), branchScope: membership.branchScope ?? (membership.role === "owner" || membership.role === "manager" ? "all" : "selected"), branchIds: await Promise.all(membership.branchIds.map((id) => publicBranchIdFromId(ctx, actor.organization._id, id))), status: organizationUserStatus(user, membership), invitedAt: membership.invitedAt ? utcIso(membership.invitedAt) : undefined };
        output.push(row);
      }
      const filtered = output.filter((user) => (!input.role || user.role === input.role) && (!input.status || user.status === input.status) && matchesSearch([user.name, user.email, user.phone], optionalString(input.search)));
      return page(sortRecords(filtered, input.sort ?? "name", (user, key) => stringValue(user[key])), input);
    }
    case "dashboard":
      return await dashboardData(ctx, actor, input);
    case "operations.products.list":
    case "operations.suppliers.list":
    case "operations.inventory.list":
    case "operations.stock_movements.list":
    case "operations.low_stock.list":
    case "operations.purchase_orders.list":
    case "operations.facility_tasks.list":
    case "operations.equipment_assets.list":
    case "operations.equipment_issues.list":
    case "operations.equipment_work_orders.list":
    case "operations.equipment.recommendation":
      return await operationsQuery(ctx, actor, operation, input);
    case "accounting.accounts.list":
    case "finance.accounts.list":
    case "accounting.periods.list":
    case "finance.periods.list":
    case "accounting.journal_entries.list":
    case "finance.journal_entries.list":
    case "accounting.journal_entries.get":
    case "finance.journal_entries.get":
    case "accounting.trial_balance":
    case "finance.trial_balance":
    case "accounting.source_postings.list":
    case "finance.source_postings.list":
      return await accountingQuery(ctx, actor, operation, input);
    case "reports.income_statement":
    case "reports.balance_sheet":
    case "reports.cashflow_statement":
    case "reports.gm_analysis":
      return await managementReportQuery(ctx, actor, operation, input);
    default:
      domainError("NOT_FOUND", `Unknown query operation ${operation}.`, { correlationId: actor.correlationId });
  }
}

function peakHour(rows: Data[], timezone: string): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    try {
      const hour = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(new Date(stringValue(row.occurredAt)));
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    } catch {
      // Keep the projection resilient if a tenant has a malformed timezone.
    }
  }
  let best = "—";
  let count = 0;
  for (const [hour, value] of counts) if (value > count) { best = `${hour}:00`; count = value; }
  return best;
}

async function evaluateCheckIn(ctx: ReadContext, actor: ActorContext, member: Data, branchId: string, forCreation: boolean): Promise<Data> {
  const policies = (await settingsData(ctx, actor)).operationalPolicies;
  const entryPolicy = data(data(policies).entry);
  const membership = await currentMembership(ctx, actor, stringValue(member.id));
  const plan = membership ? await recordOfOptional(ctx, actor, "plan", stringValue(membership.planId)) : null;
  const checks = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data));
  const duplicateWindow = numberValue(entryPolicy.duplicateScanWindowMinutes, 2);
  const duplicate = checks.some((checkin) => checkin.memberId === member.id && checkin.branchId === branchId && checkin.decision !== "blocked" && Date.now() - new Date(stringValue(checkin.occurredAt)).getTime() < duplicateWindow * 60_000);
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const codes: string[] = [];
  let decision = "allowed";
  let message = "Membership valid. Welcome in.";
  if (!isBranchOpen(data(policies), branchId, actor.organization.timezone || TZ_FALLBACK)) {
    decision = "blocked"; codes.push("OUTSIDE_OPERATING_HOURS"); message = "This branch is currently closed. A manager override is required for entry.";
  } else if (duplicate) {
    decision = "blocked"; codes.push("DUPLICATE_SCAN"); message = "Already checked in moments ago. Duplicate scan ignored.";
  } else if (stringValue(member.status) !== "active") {
    decision = "blocked"; codes.push("MEMBER_INACTIVE"); message = "This member account is not active.";
  } else if (!membership) {
    decision = "blocked"; codes.push("NO_ACTIVE_MEMBERSHIP"); message = "No membership on file. Sell or renew a membership to allow entry.";
  } else {
    const status = statusOfMembership(membership, today);
    if (["expired", "scheduled", "cancelled"].includes(status)) {
      decision = "blocked"; codes.push("MEMBERSHIP_EXPIRED"); message = status === "cancelled" ? "Membership was cancelled. Entry requires a manager override." : "Membership is not currently valid. Renew to allow entry.";
    } else if (status === "frozen") {
      decision = "blocked"; codes.push("MEMBERSHIP_FROZEN"); message = "Membership is frozen. Unfreeze or ask a manager to override.";
    } else if (status === "depleted" || (membership.remainingVisits != null && numberValue(membership.remainingVisits) <= 0)) {
      decision = "blocked"; codes.push("VISITS_DEPLETED"); message = "No visits remaining on this pass.";
    } else {
      const planData = plan ? data(plan.data) : {};
      const allowed = stringValue(planData.branchAccess, "all") === "all" || arrayValue(planData.branchIds).includes(branchId) || branchId === member.homeBranchId;
      if (!allowed) {
        decision = "blocked"; codes.push("WRONG_BRANCH"); message = "This membership does not include access to this branch.";
      } else {
        const daysLeft = diffDays(today, stringValue(membership.endDate));
        if (daysLeft <= numberValue(entryPolicy.expiryWarningDays, 7)) codes.push("EXPIRES_SOON");
        const outstanding = amountOf(await outstandingForMember(ctx, actor, stringValue(member.id))) > 0;
        const balancePolicy = stringValue(entryPolicy.outstandingBalance, "warn");
        if (outstanding && balancePolicy !== "allow") codes.push("OUTSTANDING_BALANCE");
        if (outstanding && balancePolicy === "block") {
          decision = "blocked";
          message = "Entry blocked because this member has an outstanding balance.";
        }
        if (codes.length > 0) {
          if (decision !== "blocked") decision = "warning";
          const parts: string[] = [];
          if (codes.includes("EXPIRES_SOON")) parts.push(daysLeft === 0 ? "membership expires today" : `membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
          if (codes.includes("OUTSTANDING_BALANCE")) parts.push("outstanding balance due");
          if (decision !== "blocked") message = `Allowed with notice — ${parts.join("; ")}.`;
        }
      }
    }
  }
  const summary = await toMemberSummary(ctx, actor, member);
  const membershipSummary = membership ? await toMembershipSummary(ctx, actor, membership) : undefined;
  return {
    ...(forCreation ? { checkInId: undefined } : { found: true }),
    member: summary,
    membership: membershipSummary,
    decision,
    reasonCodes: codes.length ? codes : ["OK"],
    message,
    criticalNotes: hasPermission(actor, "members.sensitive_notes.read") ? optionalString(member.sensitiveNotes) : undefined,
  };
}

async function allocateSequence(ctx: MutationCtx, actor: ActorContext, key: string, initial: number): Promise<number> {
  const existing = await ctx.db
    .query("sequenceCounters")
    .withIndex("by_organization_key", (q) => q.eq("organizationId", actor.organization._id).eq("key", key))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { nextValue: existing.nextValue + 1, updatedAt: now });
    return existing.nextValue;
  }
  await ctx.db.insert("sequenceCounters", { organizationId: actor.organization._id, key, nextValue: initial + 1, updatedAt: now });
  return initial;
}

async function allocateReceipt(ctx: MutationCtx, actor: ActorContext): Promise<{ id: string; number: string }> {
  const current = actor.organization.nextReceiptNumber ?? 1001;
  await ctx.db.patch(actor.organization._id, { nextReceiptNumber: current + 1, updatedAt: Date.now() });
  const prefix = actor.organization.receiptPrefix ?? "RV";
  const number = `${prefix}-${String(current).padStart(6, "0")}`;
  return { id: newPublicId(), number };
}

async function findOpenShift(ctx: ReadContext, actor: ActorContext, branchId: string): Promise<DomainRecord | null> {
  const shifts = await recordsOf(ctx, actor, "shift");
  return shifts.find((record) => {
    const value = data(record.data);
    return value.branchId === branchId && value.status === "open";
  }) ?? null;
}

function paymentStatusForCharge(total: number, paid: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

async function paymentRecord(
  ctx: MutationCtx,
  actor: ActorContext,
  input: Data,
  idempotencyKey: string,
): Promise<{ payment: Data; receipt: Data; receiptId: string; replayed: boolean }> {
  const requestHash = JSON.stringify({ input, idempotencyKey });
  const existing = await ctx.db
    .query("idempotencyRecords")
    .withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "payment.create").eq("key", idempotencyKey))
    .unique();
  if (existing) {
    if (existing.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different payment.", { correlationId: actor.correlationId });
    const result = data(existing.result);
    const payment = await recordOf(ctx, actor, "payment", stringValue(result.paymentId));
    const receipt = await recordOf(ctx, actor, "receipt", stringValue(result.receiptId));
    return { payment: data(payment.data), receipt: data(receipt.data), receiptId: stringValue(result.receiptId), replayed: true };
  }
  const memberId = recordId(input.memberId);
  const memberRecord = await recordOf(ctx, actor, "member", memberId);
  const branchId = optionalString(input.branchId) ?? stringValue(memberRecord.data && data(memberRecord.data).homeBranchId);
  const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
  assertBranchAccess(actor, branch);
  const amount = amountOf(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) domainError("VALIDATION_ERROR", "Payment amount must be greater than zero.", { correlationId: actor.correlationId });
  if (currencyOf(input.amount, actor.organization.currency) !== actor.organization.currency) domainError("VALIDATION_ERROR", "Payment currency does not match the organization.", { correlationId: actor.correlationId });
  const chargeRecordsList = await chargeRecords(ctx, actor);
  const requestedChargeId = optionalString(input.chargeId);
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const charge = chargeRecordsList
    .find((record) => requestedChargeId ? record.publicId === requestedChargeId : data(record.data).memberId === memberId && collectibleOutstandingValue(data(record.data), today) > 0);
  if (!charge) domainError("NO_OUTSTANDING_BALANCE", "No outstanding balance is available for this member.", { correlationId: actor.correlationId });
  const chargeData = data(charge.data);
  if (chargeData.memberId !== memberId) domainError("NOT_FOUND", "Charge not found.", { correlationId: actor.correlationId });
  if (!chargeIsCollectibleValue(chargeData, today)) domainError("VALIDATION_ERROR", `This invoice becomes collectible on ${chargeDueDateValue(chargeData)}.`, { correlationId: actor.correlationId, fieldErrors: { chargeId: ["Upcoming invoices cannot be paid before their due date"] } });
  const outstanding = amountOf(chargeData.outstandingAmount);
  const allocation = paymentAllocation(amount, outstanding);
  if (!allocation.ok) domainError("VALIDATION_ERROR", allocation.code === "AMOUNT_EXCEEDS_OUTSTANDING" ? "Payment cannot exceed the outstanding balance." : "Payment amount must be greater than zero.", { correlationId: actor.correlationId, fieldErrors: { amount: [allocation.code === "AMOUNT_EXCEEDS_OUTSTANDING" ? "Cannot exceed outstanding balance" : "Must be a positive integer"] } });
  const method = stringValue(input.method, "cash");
  const externalReference = optionalString(input.externalReference)?.trim();
  if (["card", "bank_transfer", "cliq"].includes(method) && !externalReference) {
    domainError("VALIDATION_ERROR", "An external reference is required for card, bank transfer, and CliQ payments.", { correlationId: actor.correlationId, fieldErrors: { externalReference: ["Required for this payment method"] } });
  }
  const settings = await settingsData(ctx, actor);
  const paymentMethod = arrayValue(settings.paymentMethods).map(data).find((item) => item.key === method);
  if (paymentMethod && !booleanValue(paymentMethod.enabled, true)) domainError("VALIDATION_ERROR", "This payment method is disabled.", { correlationId: actor.correlationId });
  let shiftId: string | undefined;
  if (booleanValue(paymentMethod?.affectsCashDrawer) || method === "cash") {
    const shift = await findOpenShift(ctx, actor, branchId);
    if (!shift) domainError("NO_OPEN_SHIFT", "Open a cash shift before collecting cash.", { correlationId: actor.correlationId });
    shiftId = stringValue(data(shift.data).id);
  }
  const allocated = await allocateReceipt(ctx, actor);
  const now = isoNow();
  const payment = {
    id: newPublicId(),
    organizationId: publicOrganizationId(actor.organization),
    branchId,
    memberId,
    chargeId: charge.publicId,
    type: "payment",
    amount: money(amount, actor.organization.currency),
    method,
    status: "completed",
    receiptId: allocated.id,
    receiptNumber: allocated.number,
    collectedById: publicUserId(actor.user),
    collectedByName: actor.user.fullName,
    shiftId,
    externalReference,
    idempotencyKey,
    occurredAt: now,
  };
  const receipt = { id: allocated.id, receiptNumber: allocated.number, paymentId: payment.id, issuedAt: now };
  await insertRecord(ctx, actor, "payment", payment, { branchId, memberPublicId: memberId });
  await insertRecord(ctx, actor, "receipt", receipt, { branchId, memberPublicId: memberId });
  const paid = amountOf(chargeData.paidAmount) + amount;
  await patchRecord(ctx, actor, charge, { paidAmount: money(paid, actor.organization.currency), outstandingAmount: money(Math.max(0, outstanding - amount), actor.organization.currency), status: paymentStatusForCharge(amountOf(chargeData.total), paid) });
  if (paid >= amountOf(chargeData.total)) await activatePtOrderForCharge(ctx, actor, charge.publicId);
  await insertTimeline(ctx, actor, { memberId, type: "payment_collected", title: `Payment collected — ${actor.organization.currency} ${(amount / 1000).toFixed(3)} ${method.replace("_", " ")}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { receiptNumber: allocated.number, receiptId: allocated.id } });
  await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "payment.create", key: idempotencyKey, requestHash, result: { paymentId: payment.id, receiptId: receipt.id }, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 * 365 });
  const member = data(memberRecord.data);
  await queueOperationalEmail(ctx, {
    organizationId: actor.organization._id,
    branchId: branch?._id,
    kind: "payment_receipt",
    templateVersion: "payment-receipt-v1",
    language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en",
    recipientReference: memberId,
    recipientEmail: optionalString(member.email),
    dedupeKey: `payment-receipt:${receipt.id}`,
  });
  return { payment, receipt, receiptId: receipt.id, replayed: false };
}

async function paymentAuditEntityLabel(ctx: ReadContext, actor: ActorContext, payment: Data): Promise<string> {
  const member = await recordOfOptional(ctx, actor, "member", stringValue(payment.memberId));
  const memberData = member ? data(member.data) : undefined;
  return formatPaymentAuditEntityLabel({
    receiptNumber: payment.receiptNumber,
    memberName: memberData?.fullName,
    memberNumber: memberData?.memberNumber,
    memberId: payment.memberId,
  });
}

async function auditPaymentCollection(ctx: MutationCtx, actor: ActorContext, payment: Data): Promise<Data> {
  return await insertAudit(ctx, actor, {
    category: "payments",
    action: "payment.collect",
    entityType: "payment",
    entityId: stringValue(payment.id),
    entityLabel: await paymentAuditEntityLabel(ctx, actor, payment),
    summary: `Collected ${actor.organization.currency} ${(amountOf(payment.amount) / 1000).toFixed(3)} (${stringValue(payment.method).replace("_", " ")})`,
    after: { amount: amountOf(payment.amount), method: payment.method },
    branchId: optionalString(payment.branchId),
  });
}

async function shiftTotals(ctx: ReadContext, actor: ActorContext, shift: Data): Promise<Data> {
  const payments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => payment.shiftId === shift.id && payment.status !== "voided");
  const isCollection = (payment: Data) => payment.type === "payment" || payment.type === "retail_sale";
  const total = (method: string, type?: string) => payments.filter((payment) => payment.method === method && (type ? payment.type === type : isCollection(payment))).reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
  const discounts = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).filter((charge) => payments.some((payment) => payment.chargeId === charge.id)).reduce((sum, charge) => sum + amountOf(charge.discount), 0);
  return { cashPayments: money(total("cash"), actor.organization.currency), cashRefunds: money(total("cash", "refund"), actor.organization.currency), cardPayments: money(total("card"), actor.organization.currency), transferPayments: money(total("bank_transfer") + total("cliq"), actor.organization.currency), otherPayments: money(total("other"), actor.organization.currency), paymentCount: payments.filter(isCollection).length, refundCount: payments.filter((payment) => payment.type === "refund").length, discountsTotal: money(discounts, actor.organization.currency) };
}

async function dailyReconciliation(ctx: ReadContext, actor: ActorContext, branchId: string, date: string): Promise<Data> {
  const payments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => payment.branchId === branchId && payment.status !== "voided" && businessDate(stringValue(payment.occurredAt), actor.organization.timezone || TZ_FALLBACK) === date);
  const isCollection = (payment: Data) => payment.type === "payment" || payment.type === "retail_sale";
  const methods = ["cash", "card", "bank_transfer", "cliq", "other"];
  const totalsByMethod = methods.map((method) => {
    const rows = payments.filter((payment) => payment.method === method);
    const collected = rows.filter(isCollection).reduce((sum, payment) => sum + amountOf(payment.amount), 0);
    const refunded = rows.filter((payment) => payment.type === "refund").reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
    return { method, payments: money(collected, actor.organization.currency), refunds: money(refunded, actor.organization.currency), net: signedMoney(collected - refunded, actor.organization.currency), count: rows.length };
  }).filter((item) => item.count > 0);
  const shifts = (await recordsOf(ctx, actor, "shift")).map((record) => data(record.data)).filter((shift) => shift.branchId === branchId && businessDate(stringValue(shift.openedAt), actor.organization.timezone || TZ_FALLBACK) === date);
  return { branchId, date, totalsByMethod, totalCollected: money(payments.filter(isCollection).reduce((sum, payment) => sum + amountOf(payment.amount), 0), actor.organization.currency), totalRefunded: money(payments.filter((payment) => payment.type === "refund").reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0), actor.organization.currency), discountsTotal: money(0, actor.organization.currency), shifts, totalVariance: signedMoney(shifts.reduce((sum, shift) => sum + amountOf(shift.variance), 0), actor.organization.currency) };
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function firstHeader(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

async function previewMemberImport(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "members.write");
  const branchId = recordId(input.branchId);
  assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
  const csv = stringValue(input.csv);
  if (!csv.trim()) domainError("VALIDATION_ERROR", "CSV content is required.", { correlationId: actor.correlationId });
  const rows = parseCsv(csv);
  const headers = (rows.shift() ?? []).map(normalizedHeader);
  const nameIndex = firstHeader(headers, ["full_name", "name", "member_name"]);
  const phoneIndex = firstHeader(headers, ["phone", "mobile", "mobile_number"]);
  const emailIndex = firstHeader(headers, ["email", "email_address"]);
  if (nameIndex < 0 || phoneIndex < 0) domainError("VALIDATION_ERROR", "CSV headers must include full name and phone columns.", { correlationId: actor.correlationId, fieldErrors: { csv: ["Required headers: full_name, phone"] } });
  const existing = (await memberRecords(ctx, actor)).map((record) => data(record.data)).filter((member) => member.status !== "archived");
  const seen = new Set<string>();
  const previewRows: Data[] = rows.map((values, index) => {
    const fullName = stringValue(values[nameIndex]).trim();
    const phone = stringValue(values[phoneIndex]).trim();
    const email = optionalString(values[emailIndex]);
    const duplicateMemberIds = existing.filter((member) => normalize(member.phone) === normalize(phone) || (email && normalize(optionalString(member.email)) === normalize(email))).map((member) => stringValue(member.id));
    const duplicateKey = `${normalize(phone)}:${normalize(email)}`;
    if (seen.has(duplicateKey) && phone) duplicateMemberIds.push(`csv-row-${index}`);
    if (phone) seen.add(duplicateKey);
    const errors = [
      ...(fullName ? [] : ["Full name is required"]),
      ...(phone ? [] : ["Phone is required"]),
      ...(duplicateMemberIds.length ? ["A member with this phone or email already exists"] : []),
    ];
    return { rowNumber: index + 2, fullName, phone, email, status: duplicateMemberIds.length ? "duplicate" : errors.length ? "invalid" : "valid", errors, duplicateMemberIds };
  });
  const id = newPublicId();
  const now = Date.now();
  await insertRecord(ctx, actor, "memberImport", { id, branchId, rows: previewRows, totalRows: previewRows.length, nextCursor: 0, status: "preview", createdAt: isoNow(), createdById: publicUserId(actor.user) }, { branchId });
  await insertAudit(ctx, actor, { category: "members", action: "member.import_preview", entityType: "member_import", entityId: id, entityLabel: `Member CSV · ${previewRows.length} rows`, summary: `Previewed ${previewRows.length} member rows`, branchId });
  return { id, branchId, totalRows: previewRows.length, validRows: previewRows.filter((row) => row.status === "valid").length, duplicateRows: previewRows.filter((row) => row.status === "duplicate").length, errorRows: previewRows.filter((row) => row.status === "invalid").length, rows: previewRows, createdAt: utcIso(now) };
}

async function commitMemberImport(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "members.write");
  const importId = recordId(input.importId);
  const idempotencyKey = recordId(input.idempotencyKey);
  const requestHash = JSON.stringify({ importId, cursor: numberValue(input.cursor), chunkSize: numberValue(input.chunkSize), idempotencyKey });
  const existingIdempotency = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "member-import.commit").eq("key", idempotencyKey)).unique();
  if (existingIdempotency) {
    if (existingIdempotency.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This import idempotency key was already used for a different chunk.", { correlationId: actor.correlationId });
    return data(existingIdempotency.result);
  }
  const record = await recordOf(ctx, actor, "memberImport", importId);
  const importData = data(record.data);
  const rows = arrayValue(importData.rows).map(data);
  const cursor = Math.max(0, Math.floor(numberValue(input.cursor, numberValue(importData.nextCursor))));
  if (cursor !== numberValue(importData.nextCursor)) domainError("CONFLICT", "Import cursor is stale. Resume from the latest cursor.", { correlationId: actor.correlationId });
  const chunkSize = Math.min(100, Math.max(1, Math.floor(numberValue(input.chunkSize, 25))));
  const end = Math.min(rows.length, cursor + chunkSize);
  const createdMemberIds: string[] = [];
  const errors: Data[] = [];
  let skippedCount = 0;
  const failedCount = 0;
  for (let index = cursor; index < end; index += 1) {
    const row = rows[index];
    if (!row || row.status !== "valid") {
      skippedCount += 1;
      if (row) rows[index] = { ...row, status: "skipped" };
      continue;
    }
    const duplicate = (await memberRecords(ctx, actor)).map((item) => data(item.data)).find((member) => member.status !== "archived" && (normalize(member.phone) === normalize(stringValue(row.phone)) || (row.email && normalize(optionalString(member.email)) === normalize(optionalString(row.email)))));
    if (duplicate) {
      skippedCount += 1;
      rows[index] = { ...row, status: "duplicate", errors: [...arrayValue(row.errors).map(String), "A member with this phone or email already exists"], duplicateMemberIds: [stringValue(duplicate.id)] };
      continue;
    }
    const result = await createMemberMutation(ctx, actor, { fullName: row.fullName, phone: row.phone, email: row.email, homeBranchId: importData.branchId, preferredLanguage: "en" });
    const member = data(result.member);
    createdMemberIds.push(stringValue(member.id));
    rows[index] = { ...row, status: "committed", memberId: member.id };
  }
  const nextCursor = end;
  const status = nextCursor >= rows.length ? "completed" : "processing";
  await patchRecord(ctx, actor, record, { rows, nextCursor, status, committedAt: status === "completed" ? isoNow() : undefined });
  const result = { importId, status, cursor: nextCursor, totalRows: rows.length, committedCount: createdMemberIds.length, skippedCount, failedCount, createdMemberIds, errors };
  await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "member-import.commit", key: idempotencyKey, requestHash, result, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 });
  await insertAudit(ctx, actor, { category: "members", action: "member.import_commit", entityType: "member_import", entityId: importId, entityLabel: `Member CSV · rows ${cursor + 1}-${end}`, summary: `Committed ${createdMemberIds.length} members`, branchId: optionalString(importData.branchId) });
  return result;
}

async function createMemberMutation(ctx: MutationCtx, actor: ActorContext, input: Data, options: { rejectDuplicates?: boolean } = {}): Promise<{ member: Data; duplicates: Data[] }> {
  requirePermission(actor, "members.write");
  const fullName = stringValue(input.fullName).trim();
  const phone = stringValue(input.phone).trim();
  if (!fullName || !phone) domainError("VALIDATION_ERROR", "Name and phone are required.", { correlationId: actor.correlationId, fieldErrors: { ...(fullName ? {} : { fullName: ["Full name is required"] }), ...(phone ? {} : { phone: ["Phone is required"] }) } });
  const homeBranchId = recordId(input.homeBranchId);
  const branch = await branchByPublicId(ctx, actor.organization._id, homeBranchId);
  assertBranchAccess(actor, branch);
  const existingMembers = await memberRecords(ctx, actor);
  const duplicates = duplicateMemberMatches(
    existingMembers.map((record) => data(record.data)),
    { phone, email: input.email },
  ) as Data[];
  if (options.rejectDuplicates && duplicates.length > 0) {
    domainError("DUPLICATE_MEMBER", "This lead matches an existing member. Open that member instead of creating a duplicate.", {
      correlationId: actor.correlationId,
      details: { matches: duplicates },
    });
  }
  const sequence = await allocateSequence(ctx, actor, `member:${branch.code}`, 1000);
  const preference = marketingPreferenceRecord(input, actor);
  const member = await insertRecord(ctx, actor, "member", {
    id: newPublicId(),
    organizationId: publicOrganizationId(actor.organization),
    memberNumber: `${branch.code}-${sequence}`,
    fullName,
    fullNameAr: optionalString(input.fullNameAr),
    phone,
    email: optionalString(input.email),
    gender: optionalString(input.gender),
    dateOfBirth: optionalString(input.dateOfBirth),
    homeBranchId,
    status: "active",
    tags: arrayValue(input.tags),
    preferredLanguage: stringValue(input.preferredLanguage, "en"),
    emergencyContactName: optionalString(input.emergencyContactName),
    emergencyContactRelationship: optionalString(input.emergencyContactRelationship),
    emergencyContactPhone: optionalString(input.emergencyContactPhone),
    addressLine1: optionalString(input.addressLine1),
    city: optionalString(input.city),
    source: optionalString(input.source),
    assignedSalespersonId: optionalString(input.assignedSalespersonId),
    marketingOptIn: preference.optedIn,
    marketingPreference: preference,
    notes: optionalString(input.notes),
    createdAt: isoNow(),
  }, { branchId: homeBranchId });
  await insertTimeline(ctx, actor, { memberId: member.id, type: "member_created", title: "Member profile created", actorId: publicUserId(actor.user), actorName: actor.user.fullName, branchId: homeBranchId });
  await insertAudit(ctx, actor, { category: "members", action: "member.create", entityType: "member", entityId: member.id, entityLabel: `${member.fullName} · ${member.memberNumber}`, summary: "Member profile created", branchId: homeBranchId });
  return { member: await toMemberDetail(ctx, actor, member), duplicates };
}

async function createMembershipMutation(
  ctx: MutationCtx,
  actor: ActorContext,
  input: Data,
  previousMembershipId?: string,
  options: { operation?: "sale" | "renewal" | "plan_change"; reason?: string; previousPlanId?: string; effectiveDate?: "immediate" | "next_renewal"; standardStartDate?: string } = {},
): Promise<Data> {
  requirePermission(actor, "memberships.sell");
  const member = await recordOf(ctx, actor, "member", recordId(input.memberId));
  const memberData = data(member.data);
  const plan = await recordOf(ctx, actor, "plan", recordId(input.planId));
  const planData = data(plan.data);
  if (stringValue(planData.status, "active") !== "active") domainError("NOT_FOUND", "Plan not found or inactive.", { correlationId: actor.correlationId });
  const memberBranchId = stringValue(memberData.homeBranchId);
  if (stringValue(planData.branchAccess, "all") === "selected" && !arrayValue(planData.branchIds).map(String).includes(memberBranchId)) {
    domainError("NOT_FOUND", "This plan is not available at the member's home branch.", { correlationId: actor.correlationId });
  }
  const startDate = stringValue(input.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) domainError("VALIDATION_ERROR", "Start date must be a calendar date.", { correlationId: actor.correlationId });
  const override = input.priceOverride != null;
  const priceOverride = override && amountOf(input.priceOverride) !== amountOf(planData.basePrice);
  const dateOverride = Boolean(options.standardStartDate && startDate !== options.standardStartDate);
  if (priceOverride || dateOverride) {
    requirePermission(actor, "memberships.override_dates");
    requireReason(input.overrideReason, actor.correlationId, "overrideReason");
  }
  const price = override ? amountOf(input.priceOverride) : amountOf(planData.basePrice);
  const discount = Math.min(amountOf(input.discount), price);
  if (discount > 0) {
    requirePermission(actor, "payments.discount");
    requireReason(input.discountReason, actor.correlationId, "discountReason");
  }
  const roleDefinition = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", actor.role)).unique();
  const approvalPending = discount > roleDiscountLimit(actor.role, roleDefinition?.discountLimitMinor);
  const operation = options.operation ?? (previousMembershipId ? "renewal" : "sale");
  const idempotencyKey = optionalString(input.idempotencyKey);
  const requestHash = idempotencyKey ? JSON.stringify({ input, previousMembershipId, options }) : undefined;
  if (idempotencyKey && requestHash) {
    const existing = await ctx.db
      .query("idempotencyRecords")
      .withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", `membership.${operation}`).eq("key", idempotencyKey))
      .unique();
    if (existing) {
      if (existing.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different membership sale.", { correlationId: actor.correlationId });
      const stored = data(existing.result);
      const replayMembership = await recordOf(ctx, actor, "membership", stringValue(stored.membershipId));
      const replayCharge = await recordOf(ctx, actor, "charge", stringValue(stored.chargeId));
      const replayPayment = stored.paymentId ? await recordOf(ctx, actor, "payment", stringValue(stored.paymentId)) : null;
      const replayReceipt = stored.receiptId ? await recordOf(ctx, actor, "receipt", stringValue(stored.receiptId)) : null;
      return {
        membership: await toMembership(ctx, actor, data(replayMembership.data)),
        charge: data(replayCharge.data),
        payment: replayPayment ? data(replayPayment.data) : undefined,
        receipt: replayReceipt ? data(replayReceipt.data) : undefined,
        timelineEventIds: arrayValue(stored.timelineEventIds).map(String),
      };
    }
  }
  const duration = stringValue(planData.kind) === "visits" ? numberValue(planData.visitValidityDays, 90) : numberValue(planData.durationDays, 30);
  const endDate = addDays(startDate, duration);
  const allowOverlappingMemberships = booleanValue(data(data((await settingsData(ctx, actor)).operationalPolicies).membership).allowOverlappingMemberships);
  if (!allowOverlappingMemberships) {
    const overlaps = (await membershipRecords(ctx, actor)).map((candidate) => data(candidate.data)).some((candidate) =>
      candidate.memberId === memberData.id &&
      candidate.id !== previousMembershipId &&
      !candidate.cancelledAt &&
      startDate <= stringValue(candidate.endDate) &&
      stringValue(candidate.startDate) <= endDate,
    );
    if (overlaps) domainError("CONFLICT", "This member already has a membership covering part of the selected term.", { correlationId: actor.correlationId });
  }
  const membershipId = newPublicId();
  const adjustments = operation === "plan_change" ? [{
    id: newPublicId(),
    membershipId,
    type: "plan_change",
    reason: options.reason ?? "Membership plan changed",
    actorId: publicUserId(actor.user),
    before: { planId: options.previousPlanId ?? previousMembershipId ?? "" },
    after: { planId: planData.id, effectiveDate: startDate },
    approvalStatus: "not_required",
    createdAt: isoNow(),
  }] : [];
  const membership = await insertRecord(ctx, actor, "membership", {
    id: membershipId, organizationId: publicOrganizationId(actor.organization), memberId: memberData.id, planId: planData.id, homeBranchId: stringValue(memberData.homeBranchId), startDate, endDate, totalVisits: stringValue(planData.kind) === "visits" ? numberValue(planData.visitAllowance) : undefined, remainingVisits: stringValue(planData.kind) === "visits" ? numberValue(planData.visitAllowance) : undefined, salePrice: money(price, actor.organization.currency), discount: money(discount, actor.organization.currency), discountReason: optionalString(input.discountReason), discountApprovalStatus: discount > 0 ? (approvalPending ? "pending" : "approved") : "none", soldById: publicUserId(actor.user), previousMembershipId, frozenDaysUsed: 0, freezes: [], adjustments, createdAt: isoNow(),
  }, { branchId: stringValue(memberData.homeBranchId), memberPublicId: memberData.id });
  await grantIncludedPtCredits(ctx, actor, membership, planData);
  const total = price - discount;
  const issueDate = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const charge = await insertRecord(ctx, actor, "charge", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), memberId: memberData.id, membershipId: membership.id, description: `${stringValue(planData.name)} membership`, subtotal: money(price, actor.organization.currency), discount: money(discount, actor.organization.currency), tax: money(0, actor.organization.currency), total: money(total, actor.organization.currency), paidAmount: money(0, actor.organization.currency), outstandingAmount: money(total, actor.organization.currency), status: total === 0 ? "paid" : "unpaid", issueDate, dueDate: startDate > issueDate ? startDate : issueDate, createdAt: isoNow() }, { branchId: stringValue(memberData.homeBranchId), memberPublicId: memberData.id });
  const renewal = operation === "renewal";
  const event = await insertTimeline(ctx, actor, {
    memberId: memberData.id,
    branchId: memberData.homeBranchId,
    type: operation === "plan_change" ? "membership_plan_changed" : renewal ? "membership_renewed" : "membership_sold",
    title: operation === "plan_change" ? `Membership plan changed to ${stringValue(planData.name)}` : `${stringValue(planData.name)} membership ${renewal ? "renewed" : "sold"}`,
    body: operation === "plan_change" ? `${options.reason ?? "Plan change"} Effective ${membership.startDate}; no proration applied.` : `Term ${membership.startDate} → ${membership.endDate}.`,
    actorId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    meta: { membershipId: membership.id, previousMembershipId, previousPlanId: options.previousPlanId, effectiveDate: operation === "plan_change" ? options.effectiveDate : undefined },
  });
  if (priceOverride) await insertAudit(ctx, actor, { category: "payments", action: "membership.price_override", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `Price override: ${actor.organization.currency} ${(price / 1000).toFixed(3)}`, reason: stringValue(input.overrideReason), before: { price: amountOf(planData.basePrice) }, after: { price }, branchId: memberData.homeBranchId });
  if (dateOverride) await insertAudit(ctx, actor, { category: "memberships", action: "membership.date_override", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `Start date overridden to ${startDate}`, reason: stringValue(input.overrideReason), before: { startDate: options.standardStartDate }, after: { startDate }, branchId: memberData.homeBranchId });
  if (discount > 0) await insertAudit(ctx, actor, { category: "payments", action: "membership.discount", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `Discount applied: ${actor.organization.currency} ${(discount / 1000).toFixed(3)}`, reason: stringValue(input.discountReason), before: { price, discount: 0, approvalStatus: "none" }, after: { price, discount, approvalStatus: approvalPending ? "pending" : "approved" }, approvalStatus: approvalPending ? "pending" : "approved", branchId: memberData.homeBranchId });
  await insertAudit(ctx, actor, { category: "memberships", action: operation === "plan_change" ? "membership.plan_change" : renewal ? "membership.renew" : "membership.sale", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `${stringValue(planData.name)} — ${actor.organization.currency} ${(total / 1000).toFixed(3)}${operation === "plan_change" ? " · no proration" : ""}`, reason: options.reason, before: operation === "plan_change" ? { planId: options.previousPlanId } : undefined, after: { startDate: membership.startDate, endDate: membership.endDate, total, planId: planData.id }, branchId: memberData.homeBranchId });
  let payment: Data | undefined;
  let receipt: Data | undefined;
  if (input.payment && amountOf(data(input.payment).amount) > 0) {
    const paymentResult = await paymentRecord(ctx, actor, { ...data(input.payment), memberId: memberData.id, chargeId: charge.id, branchId: memberData.homeBranchId }, `sale-${membership.id}`);
    payment = paymentResult.payment;
    receipt = paymentResult.receipt;
    await auditPaymentCollection(ctx, actor, payment);
  }
  const result = { membership: await toMembership(ctx, actor, membership), charge, payment, receipt, timelineEventIds: [event.id] };
  if (idempotencyKey && requestHash) {
    await ctx.db.insert("idempotencyRecords", {
      organizationId: actor.organization._id,
      operation: `membership.${operation}`,
      key: idempotencyKey,
      requestHash,
      result: { membershipId: membership.id, chargeId: charge.id, paymentId: payment?.id, receiptId: receipt?.id, timelineEventIds: result.timelineEventIds },
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000 * 365,
    });
  }
  await syncCustomerMembershipProjection(ctx, actor, membership, memberData, planData);
  return result;
}

async function createTaskMutation(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "crm.write");
  const ownerId = recordId(input.ownerId);
  const owner = await userByPublicId(ctx, actor.organization._id, ownerId);
  if (!owner) domainError("NOT_FOUND", "Task owner not found.", { correlationId: actor.correlationId });
  const lead = input.leadId ? await recordOf(ctx, actor, "lead", stringValue(input.leadId)) : null;
  const member = input.memberId ? await recordOf(ctx, actor, "member", stringValue(input.memberId)) : null;
  const subject = lead ? data(lead.data).fullName : member ? data(member.data).fullName : "—";
  const task = await insertRecord(ctx, actor, "task", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), type: stringValue(input.type, "general"), title: stringValue(input.title), ownerId, ownerName: owner.fullName, dueAt: stringValue(input.dueAt), priority: stringValue(input.priority, "normal"), status: "open", leadId: optionalString(input.leadId), memberId: optionalString(input.memberId), subjectName: stringValue(subject), createdById: publicUserId(actor.user), createdAt: isoNow() }, { branchId: lead ? optionalString(data(lead.data).branchId) : member ? optionalString(data(member.data).homeBranchId) : undefined, memberPublicId: optionalString(input.memberId), leadPublicId: optionalString(input.leadId) });
  if (member) await insertTimeline(ctx, actor, { memberId: member.publicId, type: "task_created", title: `Task: ${task.title}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName });
  return task;
}

function automationQuietHours(timezone: string, start: string, end: string): boolean {
  const current = localSchedulePosition(timezone).time;
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

async function automationTaskOwner(ctx: MutationCtx, actor: ActorContext, requestedRole: string): Promise<User | null> {
  const normalizedRole = requestedRole === "salesperson" ? "sales" : requestedRole;
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const membership = memberships.find((item) => item.active && item.role === normalizedRole && (actor.branchScope === "all" || item.branchIds.some((id) => actor.branchIds.includes(id))));
  return membership ? await ctx.db.get(membership.userId) : null;
}

async function executeAutomationCandidate(
  ctx: MutationCtx,
  actor: ActorContext,
  ruleRecord: DomainRecord,
  candidate: AutomationCandidate,
): Promise<Data> {
  const rule = data(ruleRecord.data);
  const now = Date.now();
  const executionId = newPublicId();
  await ctx.db.insert("idempotencyRecords", {
    organizationId: actor.organization._id,
    operation: "automation.execute",
    key: candidate.dedupeKey,
    requestHash: candidate.dedupeKey,
    result: { executionId },
    createdAt: now,
    expiresAt: now + Math.max(1, numberValue(rule.dedupeWindowHours, 24)) * 3_600_000,
  });

  const settings = await settingsData(ctx, actor);
  const notifications = data(settings.notifications);
  const quiet = automationQuietHours(
    actor.organization.timezone || TZ_FALLBACK,
    stringValue(notifications.quietHoursStart, "22:00"),
    stringValue(notifications.quietHoursEnd, "08:00"),
  );
  const deliveryMode = stringValue(notifications.automationDeliveryMode, "sandbox");
  const actionResults: Data[] = [];
  const attemptHistory: Data[] = [];
  const memberId = candidate.subjectType === "member" ? candidate.subjectId : optionalString(candidate.value.memberId);
  const leadId = candidate.subjectType === "lead" ? candidate.subjectId : optionalString(candidate.value.leadId);
  const linkedMember = memberId && candidate.subjectType !== "member" ? await recordOfOptional(ctx, actor, "member", memberId) : undefined;
  const marketingRecipient = linkedMember ? data(linkedMember.data) : candidate.value;
  const marketingSuppression = marketingSuppressionReason(marketingRecipient);
  const occurredAt = isoNow();

  for (const action of arrayValue(rule.actions).map(data)) {
    const key = stringValue(action.key);
    if (key === "create_task") {
      const owner = await automationTaskOwner(ctx, actor, stringValue(action.taskOwnerRole, "salesperson"));
      const task = await insertRecord(ctx, actor, "task", {
        id: newPublicId(),
        title: stringValue(action.taskTitle, `Follow up with ${candidate.subjectName}`),
        type: "general",
        status: "open",
        ownerId: owner ? publicUserId(owner) : undefined,
        ownerName: owner?.fullName,
        memberId,
        leadId,
        subjectName: candidate.subjectName,
        dueAt: occurredAt,
        createdById: publicUserId(actor.user),
        createdAt: occurredAt,
        automationExecutionId: executionId,
      }, { branchId: candidate.branchId, memberPublicId: memberId, leadPublicId: leadId });
      actionResults.push({ key, taskId: task.id, status: "completed" });
      attemptHistory.push({ action: key, attempt: 1, status: "completed", occurredAt });
      continue;
    }
    if (key === "queue_message") {
      const suppressionReason = marketingSuppression
        ?? (quiet
          ? "Tenant quiet hours"
          : deliveryMode === "live"
            ? "Outbound delivery is not enabled for this message type"
            : undefined);
      const status = suppressionReason ? "suppressed" : "queued";
      const message = await insertRecord(ctx, actor, "messageDelivery", {
        id: newPublicId(),
        status,
        messageClass: "marketing",
        channel: "sandbox",
        requestedChannel: stringValue(action.channel, "whatsapp"),
        language: stringValue(candidate.value.preferredLanguage, "en"),
        templateId: optionalString(action.templateId),
        memberId,
        leadId,
        queuedAt: occurredAt,
        suppressionReason,
        retryPolicy: { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
        attempts: [{ attempt: 1, status, occurredAt, reason: suppressionReason }],
        automationExecutionId: executionId,
      }, { branchId: candidate.branchId, memberPublicId: memberId, leadPublicId: leadId });
      actionResults.push({ key, messageId: message.id, status, suppressionReason });
      attemptHistory.push({ action: key, attempt: 1, status, occurredAt, reason: suppressionReason });
      continue;
    }
    if (key === "notify_manager") {
      await notifyOrganizationRoles(ctx, {
        organizationId: actor.organization._id,
        branchId: candidate.record.branchId,
        roles: ["owner", "manager"],
        kind: "automation_attention",
        title: stringValue(rule.name, "Automation requires attention"),
        body: candidate.subjectName,
        href: automationAttentionHref(memberId, leadId),
        dedupeKey: `automation-notification:${executionId}`,
      });
      actionResults.push({ key, status: "completed" });
      attemptHistory.push({ action: key, attempt: 1, status: "completed", occurredAt });
    }
  }

  const status = actionResults.length > 0 && actionResults.every((item) => item.status === "suppressed")
    ? "suppressed"
    : actionResults.some((item) => item.status === "queued")
      ? "queued"
      : "completed";
  return await insertRecord(ctx, actor, "automationExecution", {
    id: executionId,
    ruleId: ruleRecord.publicId,
    ruleName: stringValue(rule.name),
    subjectType: candidate.subjectType,
    subjectId: candidate.subjectId,
    subjectName: candidate.subjectName,
    dedupeKey: candidate.dedupeKey,
    status,
    executedAt: occurredAt,
    actionResults,
    attemptHistory,
    retryPolicy: { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
    suppressionReason: status === "suppressed" ? actionResults.map((item) => stringValue(item.suppressionReason)).filter(Boolean).join("; ") : undefined,
  }, { branchId: candidate.branchId, memberPublicId: memberId, leadPublicId: leadId });
}

async function insertPtLedger(ctx: MutationCtx, actor: ActorContext, input: {
  entitlementId: Id<"ptEntitlements">;
  memberPublicId: string;
  bookingPublicId?: string;
  type: Doc<"ptCreditLedger">["type"];
  quantity: number;
  reason?: string;
}): Promise<void> {
  await ctx.db.insert("ptCreditLedger", {
    organizationId: actor.organization._id,
    publicId: newPublicId(),
    entitlementId: input.entitlementId,
    memberPublicId: input.memberPublicId,
    bookingPublicId: input.bookingPublicId,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason,
    actorUserId: actor.user._id,
    occurredAt: Date.now(),
  });
}

async function grantIncludedPtCredits(ctx: MutationCtx, actor: ActorContext, membership: Data, plan: Data): Promise<void> {
  const sessions = numberValue(plan.includedPtSessions);
  if (!Number.isInteger(sessions) || sessions <= 0) return;
  const membershipId = stringValue(membership.id);
  const existing = await ctx.db.query("ptEntitlements").withIndex("by_membership", (q) => q.eq("organizationId", actor.organization._id).eq("membershipPublicId", membershipId)).unique();
  if (existing) return;
  const now = Date.now();
  const startsAt = ptWallTime(stringValue(membership.startDate), 0, actor.organization.timezone || TZ_FALLBACK);
  const entitlementId = await ctx.db.insert("ptEntitlements", {
    organizationId: actor.organization._id,
    publicId: newPublicId(),
    memberPublicId: stringValue(membership.memberId),
    source: "included",
    membershipPublicId: membershipId,
    granted: sessions,
    reserved: 0,
    consumed: 0,
    revoked: 0,
    startsAt,
    expiresAt: ptWallTime(addDays(stringValue(membership.endDate), 1), 0, actor.organization.timezone || TZ_FALLBACK) - 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await insertPtLedger(ctx, actor, { entitlementId, memberPublicId: stringValue(membership.memberId), type: "grant", quantity: sessions, reason: `Included with ${stringValue(plan.name)} membership term` });
  const scheduled = startsAt > now;
  await insertTimeline(ctx, actor, { memberId: membership.memberId, branchId: membership.homeBranchId, type: "pt_credit_granted", title: `${sessions} included PT session${sessions === 1 ? "" : "s"} ${scheduled ? "scheduled" : "granted"}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId, entitlementId: (await ctx.db.get(entitlementId))?.publicId, startsAt: utcIso(startsAt) } });
  await insertAudit(ctx, actor, { category: "memberships", action: scheduled ? "pt.credit.schedule" : "pt.credit.grant", entityType: "pt_entitlement", entityId: (await ctx.db.get(entitlementId))?.publicId ?? membershipId, entityLabel: stringValue(membership.memberId), summary: `${scheduled ? "Scheduled" : "Granted"} ${sessions} included PT session${sessions === 1 ? "" : "s"}`, branchId: stringValue(membership.homeBranchId), after: { sessions, membershipId, startsAt: utcIso(startsAt) } });
}

async function syncCustomerMembershipProjection(ctx: MutationCtx, actor: ActorContext, membership: Data, member: Data, plan: Data): Promise<void> {
  const email = optionalString(member.email)?.trim().toLowerCase();
  if (!email) return;
  const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
  if (!user || user.status === "deactivated") return;
  const staffMemberships = await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
  if (staffMemberships.some((item) => item.active)) return;
  const profile = await customerProfileForUser(ctx, publicUserId(user));
  const marketplace = (await marketplaceRows(ctx)).find((row) => row.organizationId === actor.organization._id);
  const marketplaceValue = data(marketplace?.data);
  const branch = await branchByPublicId(ctx, actor.organization._id, stringValue(membership.homeBranchId));
  const directoryBranch = arrayValue(marketplaceValue.branches).map(data).find((item) => item.internalBranchId === membership.homeBranchId);
  if (profile) {
    const memberRecord = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", stringValue(member.id))).unique();
    if (memberRecord) {
      await syncCustomerProfileToMemberRecord(ctx, user, memberRecord, profile, [...CUSTOMER_PROFILE_MEMBER_FIELDS], `membership-link-${stringValue(membership.id)}`);
      member = { ...member, ...customerProfileMemberFields(profile, utcIso(Date.now())) };
    }
  }
  const checks = (await recordsOf(ctx, actor, "checkIn")).map((row) => data(row.data)).filter((item) => item.memberId === member.id && item.decision !== "blocked").sort((left, right) => stringValue(right.occurredAt).localeCompare(stringValue(left.occurredAt)));
  const month = todayIn(actor.organization.timezone || TZ_FALLBACK).slice(0, 7);
  const visitsThisMonth = checks.filter((item) => businessDate(stringValue(item.occurredAt), actor.organization.timezone || TZ_FALLBACK).startsWith(month)).length;
  const value = {
    customerUserId: publicUserId(user),
    customerId: optionalString(profile?.id),
    gymId: marketplace?.publicId ?? publicOrganizationId(actor.organization),
    branchId: optionalString(directoryBranch?.id) ?? (branch ? publicBranchId(branch) : stringValue(membership.homeBranchId)),
    internalBranchId: branch ? publicBranchId(branch) : stringValue(membership.homeBranchId),
    memberId: stringValue(member.id),
    membershipId: stringValue(membership.id),
    memberNumber: stringValue(member.memberNumber),
    planName: stringValue(plan.name),
    status: statusOfMembership(membership, todayIn(actor.organization.timezone || TZ_FALLBACK)),
    startDate: stringValue(membership.startDate),
    endDate: stringValue(membership.endDate),
    visitsThisMonth,
    remainingVisits: membership.remainingVisits,
    balanceMinor: amountOf(await outstandingForMember(ctx, actor, stringValue(member.id))),
    lastCheckInAt: optionalString(checks[0]?.occurredAt),
  };
  const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "customerMembership").eq("publicId", stringValue(membership.id))).unique();
  if (existing) await ctx.db.patch(existing._id, { branchId: branch?._id, memberPublicId: stringValue(member.id), data: { ...data(existing.data), ...value }, updatedAt: Date.now() });
  else await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "customerMembership", publicId: stringValue(membership.id), branchId: branch?._id, memberPublicId: stringValue(member.id), createdAt: Date.now(), updatedAt: Date.now(), data: value });
}

async function revokeUnusedIncludedPtCredits(ctx: MutationCtx, actor: ActorContext, membershipId: string, reason: string): Promise<void> {
  const entitlement = await ctx.db.query("ptEntitlements").withIndex("by_membership", (q) => q.eq("organizationId", actor.organization._id).eq("membershipPublicId", membershipId)).unique();
  if (!entitlement || entitlement.status !== "active") return;
  const unused = ptAvailable(entitlement);
  if (unused <= 0) return;
  await ctx.db.patch(entitlement._id, { revoked: entitlement.revoked + unused, status: entitlement.reserved > 0 ? "active" : "revoked", updatedAt: Date.now() });
  await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, type: "adjustment", quantity: -unused, reason });
  await insertTimeline(ctx, actor, { memberId: entitlement.memberPublicId, type: "pt_credit_refunded", title: `${unused} unused included PT session${unused === 1 ? "" : "s"} revoked`, body: reason, meta: { membershipId, entitlementId: entitlement.publicId } });
  await insertAudit(ctx, actor, { category: "memberships", action: "pt.credit.revoke", entityType: "pt_entitlement", entityId: entitlement.publicId, entityLabel: entitlement.memberPublicId, summary: `Revoked ${unused} unused included PT session${unused === 1 ? "" : "s"}`, reason, before: { available: unused }, after: { available: 0 } });
}

async function activatePtOrderForCharge(ctx: MutationCtx, actor: ActorContext, chargeId: string): Promise<void> {
  const order = await ctx.db.query("ptPackageOrders").withIndex("by_charge", (q) => q.eq("organizationId", actor.organization._id).eq("chargePublicId", chargeId)).unique();
  if (!order || order.status !== "pending_payment") return;
  const [charge, ptPackage] = await Promise.all([
    recordOf(ctx, actor, "charge", chargeId),
    ctx.db.get(order.packageId),
  ]);
  const terms = ptPackageTerms(order, ptPackage ?? undefined);
  if (terms.sessionCount < 1 || terms.validityDays < 1 || amountOf(data(charge.data).outstandingAmount) > 0 || stringValue(data(charge.data).status) !== "paid") return;
  const now = Date.now();
  const entitlementId = await ctx.db.insert("ptEntitlements", {
    organizationId: actor.organization._id,
    publicId: newPublicId(),
    memberPublicId: order.memberPublicId,
    source: "package",
    packageOrderId: order._id,
    granted: terms.sessionCount,
    reserved: 0,
    consumed: 0,
    revoked: 0,
    startsAt: now,
    expiresAt: ptWallTime(addDays(todayIn(actor.organization.timezone || TZ_FALLBACK), terms.validityDays + 1), 0, actor.organization.timezone || TZ_FALLBACK) - 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(order._id, { status: "active", entitlementId, paidAt: now, updatedAt: now });
  await insertPtLedger(ctx, actor, { entitlementId, memberPublicId: order.memberPublicId, type: "grant", quantity: terms.sessionCount, reason: `Activated ${terms.name} after full payment` });
  await insertTimeline(ctx, actor, { memberId: order.memberPublicId, type: "pt_package_activated", title: `${terms.name} activated`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { orderId: order.publicId, entitlementId: (await ctx.db.get(entitlementId))?.publicId, chargeId } });
  await notifyOrganizationRoles(ctx, { organizationId: actor.organization._id, roles: ["owner", "manager", "receptionist"], kind: "pt_package_activated", title: "PT package activated", body: terms.name, href: `/members/${order.memberPublicId}`, dedupeKey: `pt-package-activated:${order.publicId}` });
  const memberRecord = await recordOfOptional(ctx, actor, "member", order.memberPublicId);
  const member = data(memberRecord?.data);
  await queueOperationalEmail(ctx, { organizationId: actor.organization._id, kind: "pt_package_paid", templateVersion: "pt-package-paid-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: order.memberPublicId, recipientEmail: optionalString(member.email), dedupeKey: `pt-package-paid:${order.publicId}` });
}

async function reverseUnusedPtOrderAfterVoid(ctx: MutationCtx, actor: ActorContext, chargeId: string, reason: string): Promise<void> {
  const order = await ctx.db.query("ptPackageOrders").withIndex("by_charge", (q) => q.eq("organizationId", actor.organization._id).eq("chargePublicId", chargeId)).unique();
  if (!order || order.status === "pending_payment" || !order.entitlementId) return;
  const entitlement = await ctx.db.get(order.entitlementId);
  if (!entitlement) domainError("NOT_FOUND", "PT package entitlement not found.", { correlationId: actor.correlationId });
  if (entitlement.reserved > 0 || entitlement.consumed > 0 || entitlement.revoked > 0) {
    domainError("VALIDATION_ERROR", "This payment cannot be voided after PT credits were reserved, used, or refunded. Use the audited PT package refund workflow.", { correlationId: actor.correlationId });
  }
  const available = ptAvailable(entitlement);
  await ctx.db.patch(entitlement._id, { revoked: entitlement.revoked + available, status: "revoked", updatedAt: Date.now() });
  await ctx.db.patch(order._id, { status: "pending_payment", updatedAt: Date.now() });
  await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, type: "adjustment", quantity: -available, reason });
  await insertTimeline(ctx, actor, { memberId: order.memberPublicId, type: "pt_credit_refunded", title: "PT package activation reversed after payment void", body: reason, meta: { orderId: order.publicId, chargeId } });
  await insertAudit(ctx, actor, { category: "payments", action: "pt.package.activation_reverse", entityType: "pt_package_order", entityId: order.publicId, entityLabel: order.memberPublicId, summary: `Revoked ${available} unused PT credit${available === 1 ? "" : "s"} after payment void`, reason, before: { orderStatus: order.status, available }, after: { orderStatus: "pending_payment", available: 0 } });
}

async function selectPtEntitlementForBooking(ctx: MutationCtx, actor: ActorContext, memberId: string, membershipId: string, startsAt: number): Promise<Doc<"ptEntitlements">> {
  const candidates = (await ctx.db.query("ptEntitlements").withIndex("by_organization_member", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", memberId)).collect())
    .filter((item) => item.status === "active" && (item.startsAt ?? 0) <= startsAt && item.expiresAt >= startsAt && ptAvailable(item) > 0)
    .filter((item) => item.source !== "included" || item.membershipPublicId === membershipId)
    .sort((left, right) => left.expiresAt - right.expiresAt || (left.source === "included" ? -1 : right.source === "included" ? 1 : 0));
  const entitlement = candidates[0];
  if (!entitlement) domainError("VALIDATION_ERROR", "No PT session credit is available for this booking.", { correlationId: actor.correlationId });
  return entitlement;
}

async function customerPtContext(ctx: ReadContext, membershipId: string) {
  const { user } = await requireMember(ctx);
  const userId = publicUserId(user);
  const profile = await customerProfileForUser(ctx, userId);
  const projectionRecord = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "customerMembership").eq("publicId", membershipId)).unique();
  const projection = projectionRecord && belongsToAuthenticatedCustomer(data(projectionRecord.data), userId, optionalString(profile?.id)) ? projectionRecord : null;
  if (!projection) domainError("NOT_FOUND", "Membership not found.");
  const organization = await ctx.db.get(projection.organizationId);
  if (!organization || !["trial", "active", "past_due"].includes(organization.status)) domainError("NOT_FOUND", "Membership not found.");
  const projectionData = data(projection.data);
  const internalMembershipId = optionalString(projectionData.membershipId) ?? projection.publicId;
  const membership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership").eq("publicId", internalMembershipId)).unique();
  const memberId = optionalString(projectionData.memberId) ?? optionalString(data(membership?.data).memberId);
  const member = memberId ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", memberId)).unique() : null;
  if (!membership || !member) domainError("CONFIGURATION_ERROR", "This member portal membership is not linked to an operational membership. Ask the gym to refresh the membership record.");
  return { user, organization, projection, membership, member };
}

async function insertCustomerPtTimeline(ctx: MutationCtx, input: { organization: Organization; memberId: string; branchId?: Id<"branches">; type: string; title: string; body?: string; meta?: Data; user: User }): Promise<void> {
  const now = Date.now();
  const id = newPublicId();
  await ctx.db.insert("domainRecords", {
    organizationId: input.organization._id,
    entityType: "timeline",
    publicId: id,
    branchId: input.branchId,
    memberPublicId: input.memberId,
    createdAt: now,
    updatedAt: now,
    data: { id, organizationId: publicOrganizationId(input.organization), memberId: input.memberId, type: input.type, title: input.title, body: input.body, actorId: publicUserId(input.user), actorName: input.user.fullName, occurredAt: utcIso(now), meta: input.meta },
  });
}

async function insertCustomerPtAudit(ctx: MutationCtx, input: { organization: Organization; user: User; branchId?: Id<"branches">; action: string; entityType: string; entityId: string; entityLabel: string; summary: string; reason?: string; before?: Data; after?: Data; correlationId?: string }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: input.organization._id,
    publicId: newPublicId(),
    branchId: input.branchId,
    actorUserId: input.user._id,
    actorPublicId: publicUserId(input.user),
    actorName: input.user.fullName,
    actorRole: "member",
    category: "memberships",
    action: input.action,
    entityType: input.entityType,
    entityPublicId: input.entityId,
    entityLabel: input.entityLabel,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: input.correlationId ?? newPublicId(),
    occurredAt: Date.now(),
  });
}

async function mutationData(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "bootstrap.ensure") {
    const { user } = await requireAuthenticated(ctx);
    return user._id;
  }

  if (operation === "platform.marketingMigration.apply") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    requireReason(input.reason, admin.correlationId);
    const batchSize = Math.max(1, Math.min(100, numberValue(input.batchSize, 100)));
    const migrationPublicId = optionalString(input.migrationId) ?? `MKT-MIG-${newPublicId()}`;
    let migration = await ctx.db.query("marketingPreferenceMigrations").withIndex("by_public_id", (q) => q.eq("publicId", migrationPublicId)).unique();
    if (migration?.status === "completed") return { id: migration.publicId, status: migration.status, previewCount: migration.previewCount, processedCount: migration.processedCount, failedCount: migration.failedCount, remainingCount: 0 };
    const profiles = (await ctx.db.query("customerProfiles").collect()).filter((profile) => !profile.marketingPreferenceStatus || profile.marketingPreferenceSource === "system_default");
    const members = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect()).filter((record) => {
      const preference = data(data(record.data).marketingPreference);
      return !optionalString(preference.status) && (!optionalString(preference.source) || preference.source === "system_default");
    });
    const previewCount = migration?.previewCount ?? profiles.length + members.length;
    const now = Date.now();
    if (!migration) {
      const id = await ctx.db.insert("marketingPreferenceMigrations", {
        publicId: migrationPublicId,
        status: "running",
        previewCount,
        processedCount: 0,
        failedCount: 0,
        startedByUserId: admin.user._id,
        correlationId: admin.correlationId,
        reason: stringValue(input.reason),
        createdAt: now,
        updatedAt: now,
      });
      migration = (await ctx.db.get(id))!;
    }
    const targets = [...profiles.map((value) => ({ kind: "profile" as const, value })), ...members.map((value) => ({ kind: "member" as const, value }))].slice(0, batchSize);
    let processed = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        if (target.kind === "profile") {
          await ctx.db.patch(target.value._id, {
            marketingOptIn: false,
            marketingPreferenceStatus: "unknown",
            marketingPreferenceSource: "system_default",
            marketingPreferenceChangedAt: undefined,
            marketingPreferenceWordingVersion: undefined,
            updatedAt: now,
          });
        } else {
          const current = data(target.value.data);
          await ctx.db.patch(target.value._id, {
            data: { ...current, marketingOptIn: false, marketingPreference: { optedIn: false, status: "unknown", source: "system_default" } },
            updatedAt: now,
          });
        }
        processed += 1;
      } catch {
        failed += 1;
      }
    }
    const remainingCount = Math.max(0, profiles.length + members.length - targets.length + failed);
    const status = remainingCount === 0 ? "completed" as const : failed > 0 && processed === 0 ? "failed" as const : "running" as const;
    await ctx.db.patch(migration._id, {
      status,
      processedCount: migration.processedCount + processed,
      failedCount: migration.failedCount + failed,
      updatedAt: now,
    });
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      actorUserId: admin.user._id,
      actorPublicId: publicUserId(admin.user),
      actorName: admin.user.fullName,
      action: status === "completed" ? "marketing_preferences.migration_completed" : "marketing_preferences.migration_batch",
      entityType: "marketing_preference_migration",
      entityPublicId: migrationPublicId,
      entityLabel: "Historical marketing preferences",
      summary: `Marked ${processed} historical preference record${processed === 1 ? "" : "s"} as unknown`,
      reason: stringValue(input.reason),
      before: { eligible: profiles.length + members.length },
      after: { processed, failed, remaining: remainingCount, status },
      correlationId: admin.correlationId,
      occurredAt: now,
    });
    return { id: migrationPublicId, status, previewCount, processedCount: migration.processedCount + processed, failedCount: migration.failedCount + failed, remainingCount };
  }

  if (operation === "customer.register") return await registerCustomer(ctx, input);
  if (operation === "customer.profile.update") return await registerCustomer(ctx, input);
  if (operation === "customer.marketingPreference.update") return await updateCustomerMarketingPreference(ctx, input);
  if (operation === "customer.trial.create") return await createCustomerTrial(ctx, input);
  if (operation === "customer.entryPass") return await createEntryPass(ctx, input);
  if (operation === "customer.pt.package.request") {
    const context = await customerPtContext(ctx, recordId(input.membershipId));
    const idempotencyKey = stringValue(input.idempotencyKey).trim();
    if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: request.correlationId });
    const requestHash = JSON.stringify({ membershipId: input.membershipId, packageId: input.packageId });
    const existingKey = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", context.organization._id).eq("operation", "customer.pt.package.request").eq("key", idempotencyKey)).unique();
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different package request.", { correlationId: request.correlationId });
      const order = await ctx.db.query("ptPackageOrders").withIndex("by_organization_public_id", (q) => q.eq("organizationId", context.organization._id).eq("publicId", stringValue(data(existingKey.result).orderId))).unique();
      if (!order) domainError("NOT_FOUND", "PT package order not found.");
      return await ptPackageOrderView(ctx, context.organization, order);
    }
    const membership = data(context.membership.data);
    const today = todayIn(context.organization.timezone || TZ_FALLBACK);
    if (!["active", "expiring"].includes(statusOfMembership(membership, today))) domainError("MEMBERSHIP_NOT_ACTIVE", "An active, unfrozen membership is required to request a PT package.");
    const ptPackage = await ctx.db.query("ptPackages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", context.organization._id).eq("publicId", recordId(input.packageId))).unique();
    if (!ptPackage || ptPackage.status !== "active") domainError("NOT_FOUND", "PT package not found.");
    const branch = await branchByPublicId(ctx, context.organization._id, stringValue(membership.homeBranchId));
    if (!branch || (ptPackage.branchAccess === "selected" && !ptPackage.branchIds.includes(branch._id))) domainError("NOT_FOUND", "This PT package is not available for the membership branch.");
    const chargeId = newPublicId();
    const now = Date.now();
    const issueDate = todayIn(context.organization.timezone || TZ_FALLBACK);
    await ctx.db.insert("domainRecords", { organizationId: context.organization._id, entityType: "charge", publicId: chargeId, branchId: branch._id, memberPublicId: context.member.publicId, createdAt: now, updatedAt: now, data: { id: chargeId, organizationId: publicOrganizationId(context.organization), memberId: context.member.publicId, membershipId: context.membership.publicId, description: ptPackage.name, subtotal: money(ptPackage.totalPriceMinor, context.organization.currency), discount: money(0, context.organization.currency), tax: money(0, context.organization.currency), total: money(ptPackage.totalPriceMinor, context.organization.currency), paidAmount: money(0, context.organization.currency), outstandingAmount: money(ptPackage.totalPriceMinor, context.organization.currency), status: "unpaid", issueDate, dueDate: issueDate, createdAt: utcIso(now) } });
    const orderId = await ctx.db.insert("ptPackageOrders", {
      organizationId: context.organization._id,
      publicId: newPublicId(),
      memberPublicId: context.member.publicId,
      membershipPublicId: context.membership.publicId,
      packageId: ptPackage._id,
      chargePublicId: chargeId,
      packageNameSnapshot: ptPackage.name,
      sessionCountSnapshot: ptPackage.sessionCount,
      totalPriceMinorSnapshot: ptPackage.totalPriceMinor,
      currencySnapshot: ptPackage.currency,
      validityDaysSnapshot: ptPackage.validityDays,
      branchAccessSnapshot: ptPackage.branchAccess,
      branchIdsSnapshot: [...ptPackage.branchIds],
      status: "pending_payment",
      createdAt: now,
      updatedAt: now,
    });
    const order = (await ctx.db.get(orderId))!;
    await ctx.db.insert("idempotencyRecords", { organizationId: context.organization._id, operation: "customer.pt.package.request", key: idempotencyKey, requestHash, result: { orderId: order.publicId }, createdAt: now, expiresAt: now + 365 * 86_400_000 });
    await insertCustomerPtTimeline(ctx, { organization: context.organization, user: context.user, memberId: context.member.publicId, branchId: branch._id, type: "pt_package_requested", title: `${ptPackage.name} requested`, meta: { orderId: order.publicId, chargeId } });
    await insertCustomerPtAudit(ctx, { organization: context.organization, user: context.user, branchId: branch._id, action: "pt.package.request", entityType: "pt_package_order", entityId: order.publicId, entityLabel: context.member.publicId, summary: `Member requested ${ptPackage.name}`, after: { sessions: ptPackage.sessionCount, amount: ptPackage.totalPriceMinor, chargeId }, correlationId: request.correlationId });
    await notifyOrganizationRoles(ctx, { organizationId: context.organization._id, branchId: branch._id, roles: ["owner", "manager", "sales", "receptionist"], kind: "pt_package_request", title: "PT package payment requested", body: `${stringValue(data(context.member.data).fullName, "Member")} · ${ptPackage.name}`, href: `/members/${context.member.publicId}`, dedupeKey: `pt-package-request:${order.publicId}` });
    return await ptPackageOrderView(ctx, context.organization, order);
  }
  if (operation === "customer.pt.booking.create") {
    const context = await customerPtContext(ctx, recordId(input.membershipId));
    const idempotencyKey = stringValue(input.idempotencyKey).trim();
    if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: request.correlationId });
    const existing = await ctx.db.query("ptBookings").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", context.organization._id).eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.membershipPublicId !== context.membership.publicId || (await ctx.db.get(existing.trainerProfileId))?.publicId !== input.trainerProfileId || existing.startsAt !== Date.parse(stringValue(input.startsAt))) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different PT booking.", { correlationId: request.correlationId });
      return await ptBookingView(ctx, context.organization, existing);
    }
    const membership = data(context.membership.data);
    const startsAt = Date.parse(stringValue(input.startsAt));
    if (!Number.isFinite(startsAt)) domainError("VALIDATION_ERROR", "PT booking start time is invalid.", { correlationId: request.correlationId });
    const endsAt = startsAt + 3_600_000;
    const sessionDate = businessDate(stringValue(input.startsAt), context.organization.timezone || TZ_FALLBACK);
    const today = todayIn(context.organization.timezone || TZ_FALLBACK);
    const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", context.organization._id).eq("entityType", "settings").eq("publicId", "settings")).unique();
    const policies = { ...DEFAULT_OPERATIONAL_POLICIES.personalTraining, ...data(data(data(settings?.data).operationalPolicies).personalTraining) };
    if (startsAt <= Date.now() || diffDays(today, sessionDate) > numberValue(policies.bookingHorizonDays, 30)) domainError("VALIDATION_ERROR", `PT sessions may be booked up to ${numberValue(policies.bookingHorizonDays, 30)} days ahead.`);
    if (membership.cancelledAt || sessionDate < stringValue(membership.startDate) || sessionDate > stringValue(membership.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover this PT session date.");
    const freeze = data(membership.activeFreeze);
    if (freeze.status === "active" && sessionDate >= stringValue(freeze.startDate) && sessionDate <= stringValue(freeze.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "Frozen memberships cannot book PT sessions during the freeze.");
    const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", context.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique();
    const branch = await branchByPublicId(ctx, context.organization._id, recordId(input.branchId));
    if (!trainer || trainer.status !== "published" || !branch || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer slot not found.");
    const plan = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", context.organization._id).eq("entityType", "plan").eq("publicId", stringValue(membership.planId))).unique();
    if (!plan) domainError("NOT_FOUND", "Membership plan not found.");
    const planData = data(plan.data);
    if (stringValue(planData.branchAccess, "all") === "selected" && !arrayValue(planData.branchIds).map(String).includes(publicBranchId(branch))) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover this PT branch.");
    const slots = await ptSlots(ctx, context.organization, trainer, branch, sessionDate, sessionDate);
    if (!slots.some((slot) => stringValue(slot.startsAt) === new Date(startsAt).toISOString())) domainError("CONFLICT", "This PT slot is no longer available.");
    const memberCollision = await ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", context.organization._id).eq("memberPublicId", context.member.publicId).gte("startsAt", startsAt - 3_600_000).lte("startsAt", endsAt)).collect();
    if (memberCollision.some((booking) => ["reserved", "confirmed"].includes(booking.status) && booking.startsAt < endsAt && startsAt < booking.endsAt)) domainError("CONFLICT", "You already have a PT booking at this time.");
    const entitlements = (await ctx.db.query("ptEntitlements").withIndex("by_organization_member", (q) => q.eq("organizationId", context.organization._id).eq("memberPublicId", context.member.publicId)).collect())
      .filter((item) => item.status === "active" && (item.startsAt ?? 0) <= startsAt && item.expiresAt >= startsAt && ptAvailable(item) > 0 && (item.source !== "included" || item.membershipPublicId === context.membership.publicId))
      .sort((left, right) => left.expiresAt - right.expiresAt || (left.source === "included" ? -1 : right.source === "included" ? 1 : 0));
    const entitlement = entitlements[0];
    if (!entitlement) domainError("VALIDATION_ERROR", "No PT session credit is available for this booking.");
    await ctx.db.patch(entitlement._id, { reserved: entitlement.reserved + 1, updatedAt: Date.now() });
    const now = Date.now();
    const bookingId = await ctx.db.insert("ptBookings", { organizationId: context.organization._id, publicId: newPublicId(), memberPublicId: context.member.publicId, membershipPublicId: context.membership.publicId, trainerProfileId: trainer._id, branchId: branch._id, entitlementId: entitlement._id, startsAt, endsAt, status: "reserved", bookedByUserId: context.user._id, idempotencyKey, createdAt: now, updatedAt: now });
    const booking = (await ctx.db.get(bookingId))!;
    await ctx.db.insert("ptCreditLedger", { organizationId: context.organization._id, publicId: newPublicId(), entitlementId: entitlement._id, memberPublicId: context.member.publicId, bookingPublicId: booking.publicId, type: "reserve", quantity: -1, reason: "Member reserved PT booking", actorUserId: context.user._id, occurredAt: now });
    await insertCustomerPtTimeline(ctx, { organization: context.organization, user: context.user, memberId: context.member.publicId, branchId: branch._id, type: "pt_booking_reserved", title: `PT booked with ${trainer.displayName}`, meta: { bookingId: booking.publicId, entitlementId: entitlement.publicId, startsAt: utcIso(startsAt) } });
    await insertCustomerPtAudit(ctx, { organization: context.organization, user: context.user, branchId: branch._id, action: "pt.booking.create", entityType: "pt_booking", entityId: booking.publicId, entityLabel: `${stringValue(data(context.member.data).fullName)} · ${trainer.displayName}`, summary: "Member reserved one PT credit", after: { startsAt: utcIso(startsAt), trainerId: trainer.publicId, entitlementId: entitlement.publicId }, correlationId: request.correlationId });
    await insertOperationalNotification(ctx, { recipientUserId: trainer.userId, organizationId: context.organization._id, branchId: branch._id, kind: "pt_booking", title: "New PT booking", body: `${stringValue(data(context.member.data).fullName, "Member")} · ${utcIso(startsAt)}`, href: `/pt?booking=${booking.publicId}`, dedupeKey: `pt-booking:${booking.publicId}` });
    await queueOperationalEmail(ctx, { organizationId: context.organization._id, branchId: branch._id, kind: "pt_booking_confirmation", templateVersion: "pt-booking-confirmation-v1", language: stringValue(data(context.member.data).preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: publicUserId(context.user), recipientEmail: context.user.email, dedupeKey: `pt-booking-confirmation:${booking.publicId}` });
    return await ptBookingView(ctx, context.organization, booking);
  }
  if (operation === "customer.pt.booking.cancel") {
    const { user } = await requireMember(ctx);
    requireReason(input.reason, request.correlationId);
    const userId = publicUserId(user);
    const profile = await customerProfileForUser(ctx, userId);
    const booking = await ctx.db.query("ptBookings").withIndex("by_public_id", (q) => q.eq("publicId", recordId(input.bookingId))).unique();
    if (!booking) domainError("NOT_FOUND", "PT booking not found.");
    const ownedProjection = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", booking.organizationId).eq("entityType", "customerMembership")).collect())
      .find((record) => (optionalString(data(record.data).memberId) === booking.memberPublicId || optionalString(data(record.data).membershipId) === booking.membershipPublicId) && belongsToAuthenticatedCustomer(data(record.data), userId, optionalString(profile?.id)));
    if (!ownedProjection || !["reserved", "confirmed"].includes(booking.status)) domainError("NOT_FOUND", "PT booking not found.");
    const organization = await ctx.db.get(booking.organizationId);
    const entitlement = await ctx.db.get(booking.entitlementId);
    if (!organization || !entitlement) domainError("NOT_FOUND", "PT booking not found.");
    const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "settings").eq("publicId", "settings")).unique();
    const policy = { ...DEFAULT_OPERATIONAL_POLICIES.personalTraining, ...data(data(data(settings?.data).operationalPolicies).personalTraining) };
    const timely = booking.startsAt - Date.now() >= numberValue(policy.cancellationCutoffHours, 12) * 3_600_000;
    const status = timely ? "cancelled" : "late_cancelled";
    await ctx.db.patch(entitlement._id, { reserved: Math.max(0, entitlement.reserved - 1), consumed: entitlement.consumed + (timely ? 0 : 1), updatedAt: Date.now() });
    await ctx.db.patch(booking._id, { status, cancellationReason: stringValue(input.reason).trim(), updatedAt: Date.now() });
    await ctx.db.insert("ptCreditLedger", { organizationId: organization._id, publicId: newPublicId(), entitlementId: entitlement._id, memberPublicId: booking.memberPublicId, bookingPublicId: booking.publicId, type: timely ? "release" : "consume", quantity: timely ? 1 : -1, reason: stringValue(input.reason), actorUserId: user._id, occurredAt: Date.now() });
    await insertCustomerPtTimeline(ctx, { organization, user, memberId: booking.memberPublicId, branchId: booking.branchId, type: "pt_booking_cancelled", title: timely ? "PT booking cancelled — credit restored" : "PT booking cancelled after cutoff — credit used", body: stringValue(input.reason), meta: { bookingId: booking.publicId } });
    await insertCustomerPtAudit(ctx, { organization, user, branchId: booking.branchId, action: "pt.booking.cancel", entityType: "pt_booking", entityId: booking.publicId, entityLabel: booking.memberPublicId, summary: timely ? "Member cancelled PT booking and restored credit" : "Member late-cancelled PT booking and consumed credit", reason: stringValue(input.reason), before: { status: booking.status }, after: { status }, correlationId: request.correlationId });
    await queueOperationalEmail(ctx, { organizationId: organization._id, branchId: booking.branchId, kind: "pt_booking_update", templateVersion: "pt-booking-cancelled-v1", recipientReference: publicUserId(user), recipientEmail: user.email, dedupeKey: `pt-booking-cancelled:${booking.publicId}:${status}` });
    return await ptBookingView(ctx, organization, (await ctx.db.get(booking._id))!);
  }
  if (operation === "customer.pt.booking.reschedule") {
    const { user } = await requireMember(ctx);
    requireReason(input.reason, request.correlationId);
    const idempotencyKey = stringValue(input.idempotencyKey).trim();
    if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: request.correlationId });
    const booking = await ctx.db.query("ptBookings").withIndex("by_public_id", (q) => q.eq("publicId", recordId(input.bookingId))).unique();
    if (!booking) domainError("NOT_FOUND", "PT booking not found.", { correlationId: request.correlationId });
    const organization = await ctx.db.get(booking.organizationId);
    const profile = await customerProfileForUser(ctx, publicUserId(user));
    const ownedProjection = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", booking.organizationId).eq("entityType", "customerMembership")).collect())
      .find((record) => (optionalString(data(record.data).memberId) === booking.memberPublicId || optionalString(data(record.data).membershipId) === booking.membershipPublicId) && belongsToAuthenticatedCustomer(data(record.data), publicUserId(user), optionalString(profile?.id)));
    if (!organization || !ownedProjection || !["reserved", "confirmed"].includes(booking.status)) domainError("NOT_FOUND", "PT booking not found.", { correlationId: request.correlationId });
    const requestHash = JSON.stringify({ bookingId: booking.publicId, trainerProfileId: input.trainerProfileId, branchId: input.branchId, startsAt: input.startsAt });
    const existingKey = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", organization._id).eq("operation", "customer.pt.booking.reschedule").eq("key", idempotencyKey)).unique();
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for another reschedule.", { correlationId: request.correlationId });
      return await ptBookingView(ctx, organization, booking);
    }
    const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "settings").eq("publicId", "settings")).unique();
    const policy = { ...DEFAULT_OPERATIONAL_POLICIES.personalTraining, ...data(data(data(settings?.data).operationalPolicies).personalTraining) };
    if (booking.startsAt - Date.now() < numberValue(policy.cancellationCutoffHours, 12) * 3_600_000) domainError("VALIDATION_ERROR", "This booking is inside the cancellation cutoff and cannot be rescheduled by the member.", { correlationId: request.correlationId });
    const startsAt = Date.parse(stringValue(input.startsAt));
    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) domainError("VALIDATION_ERROR", "PT booking start time is invalid.", { correlationId: request.correlationId });
    const endsAt = startsAt + 3_600_000;
    const membership = data(ownedProjection.data);
    const sessionDate = businessDate(stringValue(input.startsAt), organization.timezone || TZ_FALLBACK);
    const today = todayIn(organization.timezone || TZ_FALLBACK);
    if (diffDays(today, sessionDate) > numberValue(policy.bookingHorizonDays, 30) || membership.cancelledAt || sessionDate < stringValue(membership.startDate) || sessionDate > stringValue(membership.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover the new PT session date.", { correlationId: request.correlationId });
    const freeze = data(membership.activeFreeze);
    if (freeze.status === "active" && sessionDate >= stringValue(freeze.startDate) && sessionDate <= stringValue(freeze.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "Frozen memberships cannot reschedule PT sessions into the freeze.", { correlationId: request.correlationId });
    const [trainer, branch, entitlement] = await Promise.all([
      ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", recordId(input.trainerProfileId))).unique(),
      branchByPublicId(ctx, organization._id, recordId(input.branchId)),
      ctx.db.get(booking.entitlementId),
    ]);
    if (!trainer || trainer.status !== "published" || !branch || !trainer.branchIds.includes(branch._id) || !entitlement || (entitlement.startsAt ?? 0) > startsAt || entitlement.expiresAt < startsAt) domainError("NOT_FOUND", "The new PT slot or its reserved credit is unavailable.", { correlationId: request.correlationId });
    const slots = await ptSlots(ctx, organization, trainer, branch, sessionDate, sessionDate);
    if (!slots.some((slot) => stringValue(slot.startsAt) === new Date(startsAt).toISOString())) domainError("CONFLICT", "This PT slot is no longer available.", { correlationId: request.correlationId });
    const memberCollision = await ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", organization._id).eq("memberPublicId", booking.memberPublicId).gte("startsAt", startsAt - 3_600_000).lte("startsAt", endsAt)).collect();
    if (memberCollision.some((item) => item._id !== booking._id && ["reserved", "confirmed"].includes(item.status) && item.startsAt < endsAt && startsAt < item.endsAt)) domainError("CONFLICT", "You already have a PT booking at this time.", { correlationId: request.correlationId });
    const before = { startsAt: utcIso(booking.startsAt), trainerProfileId: (await ctx.db.get(booking.trainerProfileId))?.publicId, branchId: await publicBranchIdFromId(ctx, organization._id, booking.branchId) };
    await ctx.db.patch(booking._id, { trainerProfileId: trainer._id, branchId: branch._id, startsAt, endsAt, updatedAt: Date.now() });
    await ctx.db.insert("ptCreditLedger", { organizationId: organization._id, publicId: newPublicId(), entitlementId: entitlement._id, memberPublicId: booking.memberPublicId, bookingPublicId: booking.publicId, type: "release", quantity: 1, reason: `Reschedule: ${stringValue(input.reason)}`, actorUserId: user._id, occurredAt: Date.now() });
    await ctx.db.insert("ptCreditLedger", { organizationId: organization._id, publicId: newPublicId(), entitlementId: entitlement._id, memberPublicId: booking.memberPublicId, bookingPublicId: booking.publicId, type: "reserve", quantity: -1, reason: `Reschedule: ${stringValue(input.reason)}`, actorUserId: user._id, occurredAt: Date.now() });
    await ctx.db.insert("idempotencyRecords", { organizationId: organization._id, operation: "customer.pt.booking.reschedule", key: idempotencyKey, requestHash, result: { bookingId: booking.publicId }, createdAt: Date.now(), expiresAt: Date.now() + 365 * 86_400_000 });
    await insertCustomerPtTimeline(ctx, { organization, user, memberId: booking.memberPublicId, branchId: branch._id, type: "pt_booking_rescheduled", title: `PT rescheduled with ${trainer.displayName}`, body: stringValue(input.reason), meta: { bookingId: booking.publicId, startsAt: utcIso(startsAt) } });
    await insertCustomerPtAudit(ctx, { organization, user, branchId: branch._id, action: "pt.booking.reschedule", entityType: "pt_booking", entityId: booking.publicId, entityLabel: booking.memberPublicId, summary: "Member rescheduled PT booking without changing credit balance", reason: stringValue(input.reason), before, after: { startsAt: utcIso(startsAt), trainerProfileId: trainer.publicId, branchId: publicBranchId(branch) }, correlationId: request.correlationId });
    await insertOperationalNotification(ctx, { recipientUserId: trainer.userId, organizationId: organization._id, branchId: branch._id, kind: "pt_booking_rescheduled", title: "PT booking rescheduled", body: utcIso(startsAt), href: `/pt?booking=${booking.publicId}`, dedupeKey: `pt-reschedule:${booking.publicId}:${startsAt}` });
    await queueOperationalEmail(ctx, { organizationId: organization._id, branchId: branch._id, kind: "pt_booking_update", templateVersion: "pt-booking-rescheduled-v1", recipientReference: publicUserId(user), recipientEmail: user.email, dedupeKey: `pt-booking-rescheduled:${booking.publicId}:${startsAt}` });
    return await ptBookingView(ctx, organization, (await ctx.db.get(booking._id))!);
  }
  if (operation === "notifications.read" || operation === "notifications.readAll") {
    const { user } = await requireAuthenticated(ctx);
    if (operation === "notifications.readAll") {
      const rows = await ctx.db.query("operationalNotifications").withIndex("by_recipient_created", (q) => q.eq("recipientUserId", user._id)).collect();
      const readAt = Date.now();
      await Promise.all(rows.filter((row) => !row.readAt && (!row.expiresAt || row.expiresAt > readAt)).map((row) => ctx.db.patch(row._id, { readAt })));
      return undefined;
    }
    const notificationId = recordId(input.notificationId);
    if (typeof input.read !== "boolean") domainError("VALIDATION_ERROR", "Notification read state must be a boolean.", { correlationId: request.correlationId });
    const notification = await ctx.db.query("operationalNotifications").withIndex("by_public_id", (q) => q.eq("publicId", notificationId)).unique();
    if (!notification || notification.recipientUserId !== user._id) domainError("NOT_FOUND", "Notification not found.", { correlationId: request.correlationId });
    await ctx.db.patch(notification._id, { readAt: input.read ? Date.now() : undefined });
    const updated = await ctx.db.get(notification._id);
    if (!updated) domainError("NOT_FOUND", "Notification not found.", { correlationId: request.correlationId });
    return await notificationView(ctx, updated);
  }
  if (operation === "platform.application.note") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const applicationId = stringValue(input.applicationId);
    const application = await ctx.db
      .query("gymApplications")
      .withIndex("by_public_id", (q) => q.eq("publicId", applicationId))
      .unique();
    if (!application) domainError("NOT_FOUND", "Gym application not found.", { correlationId: admin.correlationId });
    if (typeof input.note !== "string") domainError("VALIDATION_ERROR", "Review note must be text.", { correlationId: admin.correlationId, fieldErrors: { note: ["Must be text"] } });
    const note = input.note.trim();
    if (note.length > 2_000) domainError("VALIDATION_ERROR", "Review note must be 2,000 characters or fewer.", { correlationId: admin.correlationId, fieldErrors: { note: ["Must be 2,000 characters or fewer"] } });
    const previousNote = application.reviewNotes;
    await ctx.db.patch(application._id, { reviewNotes: note || undefined, updatedAt: Date.now() });
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      actorUserId: admin.user._id,
      actorPublicId: publicUserId(admin.user),
      actorName: admin.user.fullName,
      action: "gym_application.review_note_update",
      entityType: "gym_application",
      entityPublicId: application.publicId,
      entityLabel: application.gymName,
      summary: note ? "Updated gym application review note" : "Cleared gym application review note",
      before: { reviewNotes: previousNote ?? null },
      after: { reviewNotes: note || null },
      correlationId: admin.correlationId,
      occurredAt: Date.now(),
    });
    const updated = await ctx.db.get(application._id);
    if (!updated) domainError("NOT_FOUND", "Gym application not found.", { correlationId: admin.correlationId });
    return gymApplicationView(updated);
  }
  if (operation === "platform.gym.archive") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const gymId = recordId(input.gymId);
    requireReason(input.reason, admin.correlationId);
    if (typeof input.confirmation !== "string") {
      domainError("VALIDATION_ERROR", "Type the gym name exactly to confirm archiving.", { correlationId: admin.correlationId, fieldErrors: { confirmation: ["Must match the gym name exactly"] } });
    }
    const record = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "marketplaceGym").eq("publicId", gymId)).unique();
    if (!record) domainError("NOT_FOUND", "Gym not found.", { correlationId: admin.correlationId });
    const current = data(record.data);
    const gymName = optionalString(current.name);
    if (!gymName) domainError("CONFIGURATION_ERROR", "This gym has no canonical name to confirm archiving.", { correlationId: admin.correlationId });
    if (input.confirmation !== gymName) {
      domainError("VALIDATION_ERROR", "Type the gym name exactly to confirm archiving.", { correlationId: admin.correlationId, fieldErrors: { confirmation: ["Must match the gym name exactly"] } });
    }
    const targetOrganizationId = optionalString(current.targetOrganizationId);
    const targetOrganization = targetOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
      : null;
    const organization = targetOrganization && record.organizationId === targetOrganization._id ? targetOrganization : null;
    const entitlement = organization
      ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique()
      : null;
    if (organization?.archivedAt || booleanValue(current.isArchived)) {
      domainError("CONFLICT", "This gym is already archived and cannot be changed through the subscription controls.", { correlationId: admin.correlationId });
    }
    const now = Date.now();
    const reason = input.reason.trim();
    const updated = {
      ...current,
      subscriptionStatus: "suspended",
      isPublic: false,
      isArchived: true,
      archivedAt: new Date(now).toISOString(),
      archiveReason: reason,
      subscriptionStatusReason: reason,
    };
    await ctx.db.patch(record._id, { data: updated, updatedAt: now });
    let updatedOrganization: Organization | null = organization;
    if (organization) {
      await ctx.db.patch(organization._id, {
        status: "suspended",
        archivedAt: now,
        archiveReason: reason,
        archivedByUserId: admin.user._id,
        subscriptionStatusReason: reason,
        updatedAt: now,
      });
      updatedOrganization = await ctx.db.get(organization._id);
      if (!updatedOrganization) domainError("NOT_FOUND", "The linked organization no longer exists.", { correlationId: admin.correlationId });
    }
    await insertPlatformAudit(ctx, admin, {
      action: "gym.archive",
      entityType: "platform_gym",
      entityPublicId: gymId,
      entityLabel: gymName,
      summary: `Archived ${gymName} and removed platform access`,
      reason,
      before: platformSubscriptionSnapshot(current, organization, entitlement),
      after: platformSubscriptionSnapshot(updated, updatedOrganization, entitlement),
    });
    return marketplaceView(platformMarketplaceProjection(updated, updatedOrganization, entitlement), true);
  }

  if (operation === "platform.gym.update") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const gymId = recordId(input.gymId);
    const requestedStatus = optionalString(input.status);
    const requestedPlan = optionalString(input.plan);
    const requestedBillingInterval = input.billingInterval;
    const requestedPublic = input.isPublic === undefined ? undefined : input.isPublic;
    requireReason(input.reason, admin.correlationId);
    const reason = input.reason.trim();
    const statuses = ["trial", "active", "overdue", "suspended", "cancelled"] as const;
    const plans = ["Starter", "Growth", "Pro", "Enterprise"] as const;
    if (requestedStatus && !statuses.includes(requestedStatus as (typeof statuses)[number])) domainError("VALIDATION_ERROR", "Subscription status is invalid.", { correlationId: request.correlationId });
    if (requestedPlan && !plans.includes(requestedPlan as (typeof plans)[number])) domainError("VALIDATION_ERROR", "Subscription plan is invalid.", { correlationId: request.correlationId });
    if (requestedBillingInterval !== undefined && requestedBillingInterval !== "monthly" && requestedBillingInterval !== "annual") domainError("VALIDATION_ERROR", "Billing cadence is invalid.", { correlationId: request.correlationId });
    if (input.isPublic !== undefined && typeof input.isPublic !== "boolean") domainError("VALIDATION_ERROR", "Public listing must be a boolean.", { correlationId: request.correlationId });
    // Trial, subscription-start, and cancellation timestamps remain
    // server-owned. The current paid period boundary is the one lifecycle
    // value an admin may select for a material membership change.
    const lifecycleInputs = [input.trialEndsAt, input.subscriptionStartedAt, input.cancelledAt];
    if (lifecycleInputs.some((value) => value !== undefined)) {
      domainError("VALIDATION_ERROR", "Trial, subscription start, and cancellation dates are derived automatically.", { correlationId: admin.correlationId });
    }
    const requestedPeriodEndsAtInput = input.currentPeriodEndsAt;
    const requestedPeriodEndsAt = requestedPeriodEndsAtInput === undefined ? undefined : validSubscriptionTimestamp(requestedPeriodEndsAtInput);
    if (requestedPeriodEndsAtInput !== undefined && requestedPeriodEndsAt === undefined) {
      domainError("VALIDATION_ERROR", "The membership end date must be a valid calendar date.", { correlationId: admin.correlationId });
    }
    if (!requestedStatus && !requestedPlan && requestedBillingInterval === undefined && requestedPeriodEndsAtInput === undefined && requestedPublic === undefined && lifecycleInputs.every((value) => value === undefined)) domainError("VALIDATION_ERROR", "Choose a status, plan, billing cadence, listing, or lifecycle change.", { correlationId: request.correlationId });
    const record = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "marketplaceGym").eq("publicId", gymId)).unique();
    if (!record) domainError("NOT_FOUND", "Gym not found.", { correlationId: request.correlationId });
    const current = data(record.data);
    const targetOrganizationId = optionalString(current.targetOrganizationId);
    const targetOrganization = targetOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
      : null;
    const organization = targetOrganization && record.organizationId === targetOrganization._id ? targetOrganization : null;
    if (organization?.archivedAt || booleanValue(current.isArchived)) {
      domainError("CONFLICT", "Archived gyms cannot be changed through the subscription controls.", { correlationId: admin.correlationId });
    }
    const entitlementBefore = organization
      ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique()
      : null;
    const hasTenantMutation = Boolean(requestedStatus || requestedPlan || requestedBillingInterval !== undefined || requestedPeriodEndsAtInput !== undefined || lifecycleInputs.some((value) => value !== undefined));
    if (!organization) {
      // Directory-only and mismatched rows stay in the platform snapshot for
      // cleanup, but cannot claim a tenant lifecycle/plan update succeeded.
      // The only safe mutation is an explicit hide operation.
      if (hasTenantMutation || requestedPublic !== false) {
        domainError("CONFIGURATION_ERROR", "This directory row is not linked to a provisioned organization; only hiding it is supported.", { correlationId: admin.correlationId });
      }
      const hidden = { ...current, isPublic: false };
      await ctx.db.patch(record._id, { data: hidden, updatedAt: Date.now() });
      await insertPlatformAudit(ctx, admin, {
        action: "gym.subscription.update",
        entityType: "platform_gym",
        entityPublicId: gymId,
        entityLabel: stringValue(current.name, gymId),
        summary: "Hid an unprovisioned gym directory row",
        reason,
        before: platformSubscriptionSnapshot(current, null, null),
        after: platformSubscriptionSnapshot(hidden, null, null),
      });
      return marketplaceView(platformMarketplaceProjection(hidden, null), true);
    }
    const organizationStatus = organization ? platformSubscriptionStatusForOrganization(organization.status) : undefined;
    const previousSubscriptionStatus = organizationStatus ?? optionalString(current.subscriptionStatus);
    const statusTransitioned = requestedStatus !== undefined && requestedStatus !== previousSubscriptionStatus;
    const rawStatus = requestedStatus ?? organizationStatus ?? optionalString(current.subscriptionStatus);
    if (!rawStatus || !statuses.includes(rawStatus as (typeof statuses)[number])) {
      domainError("CONFIGURATION_ERROR", "This gym does not have a complete platform subscription status.", { correlationId: admin.correlationId });
    }
    const nextStatus = rawStatus as (typeof statuses)[number];
    if (nextStatus === "trial" && previousSubscriptionStatus !== "trial") {
      domainError("VALIDATION_ERROR", "A provisioned gym cannot be moved back into trial; trials start automatically during onboarding.", { correlationId: admin.correlationId });
    }
    // A provisioned organization is the authoritative source for its plan. A
    // directory row can therefore be repaired by a status/listing save even
    // when an older projection contains a stale plan value.
    // The organization owns the subscription. Existing entitlement/listing
    // values are repairable projections and must not override an org plan on a
    // status-only save or a plan change.
    const rawPlan = requestedPlan ?? organization?.subscriptionPlan ?? optionalString(entitlementBefore?.subscriptionPlan) ?? optionalString(current.rivetPlan);
    if (!rawPlan || !plans.includes(rawPlan as (typeof plans)[number])) {
      domainError("CONFIGURATION_ERROR", "This gym does not have a complete platform subscription plan.", { correlationId: admin.correlationId });
    }
    const nextPlan = rawPlan as (typeof plans)[number];
    // Once a row is linked, organization lifecycle timestamps are authoritative.
    // Never promote stale directory dates into the tenant on an unrelated save.
    const storedTrialEndsAt = organization?.trialEndsAt;
    const storedSubscriptionStartedAt = organization?.subscriptionStartedAt;
    const storedCurrentPeriodEndsAt = organization?.currentPeriodEndsAt;
    const nowMs = Date.now();
    const existingInterval = billingInterval(organization?.billingInterval ?? current.billingInterval);
    const interval = requestedBillingInterval === undefined ? existingInterval : requestedBillingInterval;
    const materialMembershipChange = (requestedStatus !== undefined && requestedStatus !== previousSubscriptionStatus)
      || (requestedPlan !== undefined && requestedPlan !== organization?.subscriptionPlan)
      || (requestedBillingInterval !== undefined && interval !== existingInterval);
    const storedPeriodEndsAt = storedCurrentPeriodEndsAt === undefined ? undefined : validSubscriptionTimestamp(new Date(storedCurrentPeriodEndsAt).toISOString());
    const periodBoundaryChanged = requestedPeriodEndsAt !== undefined && !sameCalendarDate(requestedPeriodEndsAt, storedPeriodEndsAt);
    if (nextStatus === "trial" && requestedPeriodEndsAtInput !== undefined) {
      domainError("VALIDATION_ERROR", "Trial end is fixed automatically from onboarding; do not provide a paid period end date.", { correlationId: admin.correlationId });
    }
    // A material change that lands on an active subscription starts a new paid
    // term today: the server derives the boundary and issues the invoice, so
    // monthly and annual changes always bill through the same path. Unused
    // paid days on the outgoing term roll into the new one as a day credit.
    const startsNewPaidTerm = materialMembershipChange && nextStatus === "active";
    const DAY_MS = 86_400_000;
    const creditDays = startsNewPaidTerm
      && (previousSubscriptionStatus === "active" || previousSubscriptionStatus === "overdue")
      && storedPeriodEndsAt !== undefined && storedPeriodEndsAt > nowMs
      ? Math.ceil((storedPeriodEndsAt - nowMs) / DAY_MS)
      : 0;
    const computedPeriodEndsAt = startsNewPaidTerm
      ? addCalendarMonths(nowMs, interval === "annual" ? 12 : 1) + creditDays * DAY_MS
      : undefined;
    const nextSubscriptionStartedAt = storedSubscriptionStartedAt
      ?? ((nextStatus === "trial" || nextStatus === "active") ? nowMs : undefined);
    const nextTrialEndsAt = nextStatus === "trial"
      ? storedTrialEndsAt ?? (nextSubscriptionStartedAt === undefined ? undefined : addCalendarMonths(nextSubscriptionStartedAt, 1))
      : storedTrialEndsAt;
    if (nextStatus === "trial" && nextTrialEndsAt !== undefined && nextTrialEndsAt <= nowMs) {
      domainError("VALIDATION_ERROR", "A trial must end in the future; its end date is derived from onboarding.", { correlationId: admin.correlationId });
    }
    // An explicit admin date remains an override; otherwise the server-derived
    // term applies, and non-billing changes keep the stored boundary.
    const selectedPeriodEndsAt = periodBoundaryChanged ? requestedPeriodEndsAt : computedPeriodEndsAt ?? storedPeriodEndsAt;
    if ((materialMembershipChange || periodBoundaryChanged) && selectedPeriodEndsAt !== undefined && storedSubscriptionStartedAt !== undefined && selectedPeriodEndsAt < storedSubscriptionStartedAt) {
      domainError("VALIDATION_ERROR", "The membership end date must be on or after the subscription start date.", { correlationId: admin.correlationId });
    }
    if ((materialMembershipChange || periodBoundaryChanged) && nextStatus === "active" && selectedPeriodEndsAt !== undefined && selectedPeriodEndsAt <= nowMs) {
      domainError("VALIDATION_ERROR", "An active subscription must end in the future.", { correlationId: admin.correlationId });
    }
    const nextCurrentPeriodEndsAt = nextStatus === "trial" ? undefined : selectedPeriodEndsAt;
    const nextCancelledAt = nextStatus === "cancelled" ? nowMs : undefined;
    if (nextStatus === "trial" && nextTrialEndsAt === undefined) {
      domainError("CONFIGURATION_ERROR", "A trial cannot start until its onboarding date is established.", { correlationId: admin.correlationId });
    }
    const now = new Date(nowMs).toISOString();
    const nextPublic = organization && (nextStatus === "active" || nextStatus === "trial")
      ? requestedPublic ?? booleanValue(current.isPublic)
      : false;
    const updated = {
      ...current,
      subscriptionStatus: nextStatus,
      rivetPlan: nextPlan,
      isPublic: nextPublic,
      trialEndsAt: nextTrialEndsAt !== undefined ? new Date(nextTrialEndsAt).toISOString() : undefined,
      subscriptionStartedAt: nextSubscriptionStartedAt !== undefined ? new Date(nextSubscriptionStartedAt).toISOString() : undefined,
      currentPeriodEndsAt: nextCurrentPeriodEndsAt !== undefined ? new Date(nextCurrentPeriodEndsAt).toISOString() : undefined,
      ...(nextStatus === "cancelled" ? { cancelledAt: new Date(nextCancelledAt!).toISOString() } : { cancelledAt: undefined }),
      subscriptionStatusReason: reason,
      billingInterval: interval,
      ...(nextStatus === "active" || nextStatus === "trial" ? { lastActiveAt: now } : {}),
    };
    await ctx.db.patch(record._id, { data: updated, updatedAt: Date.now() });
    const previousModulePlan = workspacePlan(organization?.subscriptionPlan);
    let updatedOrganization: Organization | null = organization;
    let updatedEntitlement: Doc<"organizationEntitlements"> | null = entitlementBefore;
    let issuedTermInvoice: { invoiceId: string; amountMinor: number; creditDays: number; periodEnd: string } | undefined;
    if (organization) {
      const modulePlan = workspacePlan(nextPlan);
      if (!modulePlan) domainError("CONFIGURATION_ERROR", "This organization has no configured workspace entitlement plan.", { correlationId: admin.correlationId });
      const organizationStatus = nextStatus === "overdue" ? "past_due" : nextStatus;
      await ctx.db.patch(organization._id, {
        status: organizationStatus,
        subscriptionPlan: modulePlan,
        billingInterval: interval,
        ...(nextTrialEndsAt !== undefined ? { trialEndsAt: nextTrialEndsAt } : { trialEndsAt: undefined }),
        ...(nextSubscriptionStartedAt !== undefined ? { subscriptionStartedAt: nextSubscriptionStartedAt } : {}),
        ...(nextCurrentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: nextCurrentPeriodEndsAt } : { currentPeriodEndsAt: undefined }),
        ...(nextStatus === "cancelled" ? { cancelledAt: nextCancelledAt } : { cancelledAt: undefined }),
        subscriptionStatusReason: reason,
        updatedAt: nowMs,
      });
      updatedOrganization = await ctx.db.get(organization._id);
      if (!updatedOrganization) domainError("NOT_FOUND", "The linked organization no longer exists.", { correlationId: admin.correlationId });
      const catalog = await platformPlans(ctx);
      const catalogPlan = catalog.find((candidate) => stringValue(candidate.name) === modulePlan);
      const entitledModules = entitledModulesForPlanSelection(modulePlan, catalogPlan?.entitledModules);
      const entitlementUpdatedAt = Date.now();
      const entitlementNeedsSync = !entitlementBefore
        || requestedPlan !== undefined
        || entitlementBefore.subscriptionPlan !== modulePlan
        || entitlementBefore.catalogVersion !== WORKSPACE_MODULE_CATALOG_VERSION
        || entitlementBefore.source !== "subscription_plan"
        || JSON.stringify(entitlementBefore.entitledModules) !== JSON.stringify(entitledModules);
      if (entitlementBefore && entitlementNeedsSync) {
        await ctx.db.patch(entitlementBefore._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: modulePlan, entitledModules, source: "subscription_plan", updatedAt: entitlementUpdatedAt });
        updatedEntitlement = await ctx.db.get(entitlementBefore._id);
      } else if (!entitlementBefore) {
        const entitlementId = await ctx.db.insert("organizationEntitlements", { organizationId: organization._id, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: modulePlan, entitledModules, source: "subscription_plan", createdAt: entitlementUpdatedAt, updatedAt: entitlementUpdatedAt });
        updatedEntitlement = await ctx.db.get(entitlementId);
      }
      // Newly purchased modules start enabled so a plan upgrade is immediately
      // usable. Keep the stored preference row intact on downgrades so an
      // upgrade can restore the tenant's prior choices; read-time entitlement
      // filtering still locks those modules while the tenant is below the tier.
      if (requestedPlan !== undefined && previousModulePlan !== modulePlan) {
        const preferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
        if (preferences) {
          const previousEntitled = previousModulePlan ? entitledModulesForPlanSelection(previousModulePlan, catalog.find((candidate) => stringValue(candidate.name) === previousModulePlan)?.entitledModules) : [];
          const newlyEntitled = entitledModules.filter((module) => !previousEntitled.includes(module));
          if (newlyEntitled.length > 0) {
            const candidate = [...preferences.enabledModules, ...newlyEntitled];
            let enabledModules: WorkspaceModuleKey[];
            try {
              enabledModules = validateWorkspaceModuleSelection(candidate, entitledModules);
            } catch {
              enabledModules = defaultWorkspacePreferences(entitledModules);
            }
            if (JSON.stringify(enabledModules) !== JSON.stringify(preferences.enabledModules)) {
              await ctx.db.patch(preferences._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedAt: entitlementUpdatedAt });
            }
          }
        }
      }
      if (startsNewPaidTerm && nextCurrentPeriodEndsAt !== undefined) {
        // The new paid term is billed the moment it is granted. Earlier unpaid
        // subscription invoices cover a term this change supersedes, so they
        // are voided instead of double-billing the tenant. Manually created
        // invoices (no cycle key) are never touched.
        const appliedCreditDays = periodBoundaryChanged ? 0 : creditDays;
        const invoiceRows = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice")).collect();
        for (const row of invoiceRows) {
          const invoice = data(row.data);
          const invoiceStatus = stringValue(invoice.status);
          const key = optionalString(invoice.cycleKey);
          if (!key || !["draft", "open", "past_due", "failed"].includes(invoiceStatus)) continue;
          await ctx.db.patch(row._id, { data: { ...invoice, status: "void", voidedAt: now, updatedAt: now }, updatedAt: nowMs });
          await insertPlatformAudit(ctx, admin, {
            action: "invoice.void",
            entityType: "platform_invoice",
            entityPublicId: row.publicId,
            entityLabel: row.publicId,
            summary: "Voided a subscription invoice superseded by a subscription change",
            reason,
            before: { status: invoiceStatus },
            after: { status: "void" },
          });
        }
        const catalogPrice = numberValue(catalog.find((candidate) => stringValue(candidate.name) === modulePlan)?.priceMinor);
        if (!Number.isSafeInteger(catalogPrice) || catalogPrice <= 0) {
          domainError("CONFIGURATION_ERROR", "The plan catalog has no valid price for this plan, so the term invoice cannot be issued.", { correlationId: admin.correlationId });
        }
        const amountMinor = interval === "annual" ? annualPrice(catalogPrice) : catalogPrice;
        const invoiceId = `INV-${newPublicId()}`;
        const periodEndIso = new Date(nextCurrentPeriodEndsAt).toISOString();
        await ctx.db.insert("domainRecords", {
          organizationId: organization._id,
          entityType: "platformInvoice",
          publicId: invoiceId,
          createdAt: nowMs,
          updatedAt: nowMs,
          data: {
            id: invoiceId,
            gymId,
            gym: stringValue(current.name, "Gym"),
            amountMinor,
            amount: platformInvoiceAmount(amountMinor, JOD),
            currency: JOD,
            date: now,
            issuedAt: now,
            dueAt: now,
            periodStart: now,
            periodEnd: periodEndIso,
            cycleKey: `change:${targetOrganizationId}:${nowMs}`,
            billingInterval: interval,
            ...(appliedCreditDays > 0 ? { creditDays: appliedCreditDays } : {}),
            status: "open",
            createdAt: now,
            updatedAt: now,
          },
        });
        issuedTermInvoice = { invoiceId, amountMinor, creditDays: appliedCreditDays, periodEnd: periodEndIso };
        const billedRecipient = await platformGymOwnerRecipient(ctx, gymId);
        if (billedRecipient && billedRecipient.organization._id === organization._id) await queueOperationalEmail(ctx, {
          organizationId: billedRecipient.organization._id,
          kind: "platform_invoice_issued",
          templateVersion: "platform-invoice-issued-v1",
          recipientReference: publicUserId(billedRecipient.user),
          recipientEmail: billedRecipient.user.email,
          dedupeKey: `subscription-change-invoice:${invoiceId}`,
        });
      }
    }
    await insertPlatformAudit(ctx, admin, {
      action: "gym.subscription.update",
      entityType: "platform_gym",
      entityPublicId: gymId,
      entityLabel: stringValue(current.name, gymId),
      summary: issuedTermInvoice
        ? `Updated gym subscription controls and issued ${issuedTermInvoice.invoiceId} for the new term`
        : "Updated gym subscription controls",
      reason,
      before: platformSubscriptionSnapshot(current, organization, entitlementBefore),
      after: { ...platformSubscriptionSnapshot(updated, updatedOrganization, updatedEntitlement), ...(issuedTermInvoice ? { termInvoice: issuedTermInvoice } : {}) },
    });
    if (organization && statusTransitioned && (requestedStatus === "suspended" || requestedStatus === "cancelled")) {
      const recipient = await platformGymOwnerRecipient(ctx, gymId);
      if (recipient && recipient.organization._id === organization._id) await queueOperationalEmail(ctx, {
        organizationId: recipient.organization._id,
        kind: requestedStatus === "suspended" ? "platform_subscription_suspended" : "platform_subscription_cancelled",
        templateVersion: requestedStatus === "suspended" ? "subscription-suspended-v1" : "subscription-cancelled-v1",
        recipientReference: publicUserId(recipient.user),
        recipientEmail: recipient.user.email,
        dedupeKey: `subscription-${requestedStatus}:${gymId}`,
      });
    }
    return marketplaceView(platformMarketplaceProjection(updated, updatedOrganization, updatedEntitlement), true);
  }

  if (operation === "platform.gym.profile.publish") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const gymId = recordId(input.gymId);
    requireReason(input.reason, admin.correlationId);
    const reason = input.reason.trim();
    const record = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "marketplaceGym").eq("publicId", gymId)).unique();
    if (!record) domainError("NOT_FOUND", "Gym not found.", { correlationId: admin.correlationId });
    const current = data(record.data);
    const targetOrganizationId = optionalString(current.targetOrganizationId);
    const targetOrganization = targetOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
      : null;
    const organization = targetOrganization && record.organizationId === targetOrganization._id ? targetOrganization : null;
    if (!organization) domainError("CONFIGURATION_ERROR", "This gym is not linked to a provisioned organization.", { correlationId: admin.correlationId });
    const draft = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
    if (!draft) domainError("VALIDATION_ERROR", "This gym has not saved a public-page draft yet.", { correlationId: admin.correlationId });
    const draftValue = data(draft.data);
    if (!stringValue(draftValue.taglineEn).trim() || !stringValue(draftValue.descriptionEn).trim()) domainError("VALIDATION_ERROR", "The saved draft is missing its English tagline or description.", { correlationId: admin.correlationId });
    const draftVersion = numberValue(draftValue.version);
    if (stringValue(draftValue.status) === "published" && booleanValue(current.profilePublished, false) && numberValue(current.profileVersion) === draftVersion) {
      return { id: gymId, publishedVersion: draftVersion };
    }
    const { versionId, listingBefore } = await applyGymProfilePublish(ctx, organization, record, draft);
    await insertPlatformAudit(ctx, admin, {
      action: "gym.profile.publish",
      entityType: "platform_gym",
      entityPublicId: gymId,
      entityLabel: stringValue(current.name, gymId),
      summary: `Reviewed and published the public page draft v${draftVersion}`,
      reason,
      before: { profilePublished: booleanValue(listingBefore.profilePublished, false), profileVersion: listingBefore.profileVersion },
      after: { profilePublished: true, profileVersion: draftVersion, versionId },
    });
    return { id: gymId, publishedVersion: draftVersion };
  }

  if (operation === "platform.plan.update") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const name = stringValue(input.name);
    requireReason(input.reason, admin.correlationId);
    const reason = input.reason.trim();
    if (!["Starter", "Growth", "Pro", "Enterprise"].includes(name)) domainError("VALIDATION_ERROR", "Plan name is invalid.", { correlationId: admin.correlationId });
    const record = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect()).find((row) => stringValue(data(row.data).name) === name);
    const defaultPlan = DEFAULT_PLATFORM_PLANS.find((plan) => stringValue(plan.name) === name);
    if (!record && !defaultPlan) domainError("NOT_FOUND", "Plan not found.", { correlationId: admin.correlationId });
    const current: Data = record
      ? { id: record.publicId, ...(defaultPlan ?? {}), ...data(record.data) }
      : { id: name, ...(defaultPlan ?? {}) };
    const numeric = (key: string, fallback: number) => input[key] === undefined ? fallback : numberValue(input[key], -1);
    const priceMinor = numeric("priceMinor", numberValue(current.priceMinor));
    const branches = numeric("branches", numberValue(current.branches));
    const staff = numeric("staff", numberValue(current.staff));
    const members = numeric("members", numberValue(current.members));
    if (![priceMinor, branches, staff, members].every((value) => Number.isSafeInteger(value) && value >= 0) || branches < 1 || staff < 1 || members < 1) {
      domainError("VALIDATION_ERROR", "Plan limits and price must be valid positive integers.", { correlationId: admin.correlationId });
    }
    const modulePlan = workspacePlan(name);
    if (!modulePlan) domainError("VALIDATION_ERROR", "Plan name is invalid.", { correlationId: admin.correlationId });
    const defaultEntitledModules = entitledModulesForPlan(modulePlan);
    let entitledModules = entitledModulesForPlanSelection(modulePlan, current.entitledModules);
    if (input.entitledModules !== undefined) {
      if (!Array.isArray(input.entitledModules)) domainError("VALIDATION_ERROR", "Workspace capabilities must be an array.", { correlationId: admin.correlationId });
      if (input.entitledModules.some((module: unknown) => typeof module !== "string")) {
        domainError("VALIDATION_ERROR", "Workspace capabilities must use canonical module keys.", { correlationId: admin.correlationId });
      }
      const unsupported = input.entitledModules.filter((module): module is string => typeof module === "string" && !allWorkspaceModuleKeys().includes(module as WorkspaceModuleKey));
      if (unsupported.length > 0) domainError("VALIDATION_ERROR", `Unknown workspace capabilities: ${unsupported.join(", ")}.`, { correlationId: admin.correlationId });
      try {
        entitledModules = validateWorkspaceModuleSelection(input.entitledModules, allWorkspaceModuleKeys());
      } catch (error) {
        domainError("VALIDATION_ERROR", error instanceof Error ? error.message : "Workspace capabilities are invalid.", { correlationId: admin.correlationId });
      }
    }
    const updated = { ...current, name, priceMinor, branches, staff, members, entitledModules };
    const updatedAt = Date.now();
    const planRecord = record ?? await (async () => {
      const organization = await ctx.db.query("organizations").first();
      if (!organization) domainError("CONFIGURATION_ERROR", "A platform organization is required before the plan catalog can be persisted.", { correlationId: admin.correlationId });
      const id = await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "platformPlan", publicId: name, createdAt: updatedAt, updatedAt, data: updated });
      return await ctx.db.get(id);
    })();
    if (!planRecord) domainError("CONFIGURATION_ERROR", "The platform plan catalog row could not be persisted.", { correlationId: admin.correlationId });
    if (record) await ctx.db.patch(record._id, { data: updated, updatedAt });

    // Catalog capability edits are authoritative for gyms already assigned to
    // this tier. Materialize the same selection into each tenant entitlement
    // so navigation, direct-route guards, and server module checks converge
    // without waiting for a later subscription mutation.
    const assignedOrganizations = (await ctx.db.query("organizations").collect()).filter((organization) => organization.subscriptionPlan === modulePlan);
    for (const organization of assignedOrganizations) {
      const entitlement = await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
      const previousEntitled = entitlement?.entitledModules ?? entitledModulesForPlan(modulePlan);
      const entitlementUpdatedAt = Date.now();
      if (entitlement) {
        await ctx.db.patch(entitlement._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: modulePlan, entitledModules, source: "subscription_plan", updatedAt: entitlementUpdatedAt });
      } else {
        await ctx.db.insert("organizationEntitlements", { organizationId: organization._id, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: modulePlan, entitledModules, source: "subscription_plan", createdAt: entitlementUpdatedAt, updatedAt: entitlementUpdatedAt });
      }
      const preferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
      if (preferences) {
        const newlyEntitled = entitledModules.filter((module) => !previousEntitled.includes(module));
        const candidate = [...preferences.enabledModules.filter((module) => entitledModules.includes(module)), ...newlyEntitled];
        let enabledModules: WorkspaceModuleKey[];
        try {
          enabledModules = validateWorkspaceModuleSelection(candidate, entitledModules);
        } catch {
          enabledModules = defaultWorkspacePreferences(entitledModules);
        }
        if (JSON.stringify(enabledModules) !== JSON.stringify(preferences.enabledModules)) {
          await ctx.db.patch(preferences._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedAt: entitlementUpdatedAt });
        }
      }
    }
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      actorUserId: admin.user._id,
      actorPublicId: publicUserId(admin.user),
      actorName: admin.user.fullName,
      action: "plan.catalog_update",
      entityType: "platform_plan",
      entityPublicId: planRecord.publicId,
      entityLabel: name,
      summary: `Updated ${name} plan catalog limits and capabilities`,
      reason,
      before: { priceMinor: current.priceMinor, branches: current.branches, staff: current.staff, members: current.members, entitledModules: current.entitledModules ?? defaultEntitledModules },
      after: { priceMinor, branches, staff, members, entitledModules },
      correlationId: admin.correlationId,
      occurredAt: Date.now(),
    });
    return { id: planRecord.publicId, ...updated };
  }

  if (operation === "platform.invoice.create") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const gymId = recordId(input.gymId);
    const amountMinor = numberValue(input.amountMinor, -1);
    const currency = input.currency === undefined
      ? JOD
      : typeof input.currency === "string"
        ? input.currency.trim().toUpperCase()
        : "";
    const dueAtValue = stringValue(input.dueAt);
    const periodStartValue = stringValue(input.periodStart);
    const periodEndValue = stringValue(input.periodEnd);
    const dueAt = validTimestamp(dueAtValue);
    const periodStart = validTimestamp(periodStartValue);
    const periodEnd = validTimestamp(periodEndValue);
    const cycleKey = input.cycleKey === undefined ? undefined : stringValue(input.cycleKey).trim() || undefined;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      domainError("VALIDATION_ERROR", "Invoice amount must be a positive integer in minor units.", { correlationId: admin.correlationId });
    }
    if (currency !== JOD) domainError("VALIDATION_ERROR", "Platform invoices must use JOD in the MVP.", { correlationId: admin.correlationId, fieldErrors: { currency: ["Only JOD is supported"] } });
    if (dueAt === undefined || periodStart === undefined || periodEnd === undefined || periodEnd < periodStart) {
      domainError("VALIDATION_ERROR", "Invoice dates are invalid.", { correlationId: admin.correlationId });
    }
    const gymRecord = (await marketplaceRows(ctx)).find((row) => row.publicId === gymId);
    if (!gymRecord) domainError("NOT_FOUND", "Gym not found.", { correlationId: admin.correlationId });
    const gym = data(gymRecord.data);
    const targetOrganizationId = optionalString(gym.targetOrganizationId);
    const organization = targetOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique()
      : null;
    if (!organization) domainError("CONFIGURATION_ERROR", "This gym is not linked to a provisioned organization.", { correlationId: admin.correlationId });
    if (gymRecord.organizationId !== organization._id) domainError("CONFIGURATION_ERROR", "The gym directory record is linked to a different organization.", { correlationId: admin.correlationId });
    if (cycleKey) {
      const existingCycle = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice")).collect())
        .find((row) => {
          const existing = data(row.data);
          return stringValue(existing.gymId) === gymId && stringValue(existing.cycleKey) === cycleKey && stringValue(existing.status) !== "void";
        });
      if (existingCycle) return { id: existingCycle.publicId, ...data(existingCycle.data) };
    }
    const interval = billingInterval(organization.billingInterval ?? gym.billingInterval);
    const invoiceId = `INV-${newPublicId()}`;
    const createdAt = isoNow();
    const invoice: Data = {
      id: invoiceId,
      gymId,
      gym: stringValue(gym.name, "Gym"),
      amountMinor,
      amount: platformInvoiceAmount(amountMinor, currency),
      currency,
      date: "",
      dueAt: new Date(dueAt).toISOString(),
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      ...(cycleKey ? { cycleKey } : {}),
      billingInterval: interval,
      status: "draft",
      createdAt,
      updatedAt: createdAt,
    };
    await ctx.db.insert("domainRecords", {
      organizationId: organization._id,
      entityType: "platformInvoice",
      publicId: invoiceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      data: invoice,
    });
    await insertPlatformAudit(ctx, admin, {
      action: "invoice.create",
      entityType: "platform_invoice",
      entityPublicId: invoiceId,
      entityLabel: invoiceId,
      summary: `Created draft invoice for ${stringValue(gym.name, "gym")}`,
      after: { gymId, amountMinor, currency, dueAt: invoice.dueAt, periodStart: invoice.periodStart, periodEnd: invoice.periodEnd, status: "draft" },
    });
    return invoice;
  }

  if (["platform.invoice.issue", "platform.invoice.past_due", "platform.invoice.payment", "platform.invoice.void"].includes(operation)) {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const invoiceId = recordId(input.invoiceId);
    const record = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "platformInvoice").eq("publicId", invoiceId)).unique();
    if (!record) domainError("NOT_FOUND", "Invoice not found.", { correlationId: admin.correlationId });
    const current = data(record.data);
    const status = stringValue(current.status);
    const now = isoNow();
    let updated: Data;
    let action: string;
    let summary: string;
    let reason: string | undefined;

    if (operation === "platform.invoice.issue") {
      if (status !== "draft") domainError("VALIDATION_ERROR", "Only draft invoices can be issued.", { correlationId: admin.correlationId });
      updated = { ...current, status: "open", issuedAt: now, date: now, updatedAt: now };
      action = "invoice.issue";
      summary = "Issued platform invoice";
    } else if (operation === "platform.invoice.past_due") {
      if (status !== "open") domainError("VALIDATION_ERROR", "Only an open invoice can be marked past due.", { correlationId: admin.correlationId });
      requireReason(input.reason, admin.correlationId);
      reason = input.reason.trim();
      updated = { ...current, status: "past_due", pastDueAt: now, updatedAt: now };
      action = "invoice.mark_past_due";
      summary = "Marked platform invoice past due";
    } else if (operation === "platform.invoice.payment") {
      if (!["open", "past_due", "failed"].includes(status)) domainError("VALIDATION_ERROR", "Only an outstanding invoice can be marked paid.", { correlationId: admin.correlationId });
      requireReason(input.reason, admin.correlationId);
      reason = input.reason.trim();
      const reference = stringValue(input.reference).trim();
      if (!reference) domainError("VALIDATION_ERROR", "A manual payment reference is required.", { correlationId: admin.correlationId, fieldErrors: { reference: ["Required"] } });
      const paidTimestamp = input.paidAt === undefined ? Date.now() : validTimestamp(stringValue(input.paidAt));
      if (paidTimestamp === undefined) domainError("VALIDATION_ERROR", "Payment date is invalid.", { correlationId: admin.correlationId });
      updated = { ...current, status: "paid", paidAt: new Date(paidTimestamp).toISOString(), paymentReference: reference, updatedAt: now };
      action = "invoice.manual_payment";
      summary = "Recorded an offline payment against platform invoice";
    } else {
      if (status === "paid" || status === "void") domainError("VALIDATION_ERROR", "Paid or void invoices cannot be voided.", { correlationId: admin.correlationId });
      requireReason(input.reason, admin.correlationId);
      reason = input.reason.trim();
      updated = { ...current, status: "void", voidedAt: now, updatedAt: now };
      action = "invoice.void";
      summary = "Voided platform invoice";
    }

    await ctx.db.patch(record._id, { data: updated, updatedAt: Date.now() });
    if (operation === "platform.invoice.payment") {
      const gymId = stringValue(current.gymId);
      const listing = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).collect()).find((row) => row.publicId === gymId);
      const listingData = data(listing?.data);
      const targetOrganizationId = optionalString(listingData.targetOrganizationId);
      const organization = targetOrganizationId ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrganizationId)).unique() : null;
      if (organization?.archivedAt) domainError("CONFLICT", "Archived gyms cannot be reactivated by recording a subscription payment.", { correlationId: admin.correlationId });
      const periodEndTimestamp = validTimestamp(stringValue(current.periodEnd));
      if (listing && organization && listing.organizationId === organization._id && organization.status !== "cancelled" && periodEndTimestamp !== undefined) {
        const billing = billingInterval(current.billingInterval ?? organization.billingInterval);
        const startedAt = organization.subscriptionStartedAt ?? validTimestamp(stringValue(current.periodStart)) ?? Date.now();
        await ctx.db.patch(organization._id, {
          status: "active",
          billingInterval: billing,
          subscriptionStartedAt: startedAt,
          trialEndsAt: undefined,
          currentPeriodEndsAt: periodEndTimestamp,
          cancelledAt: undefined,
          subscriptionStatusReason: reason,
          updatedAt: Date.now(),
        });
        await ctx.db.patch(listing._id, {
          data: {
            ...listingData,
            subscriptionStatus: "active",
            billingInterval: billing,
            isPublic: true,
            subscriptionStartedAt: utcIso(startedAt),
            trialEndsAt: undefined,
            currentPeriodEndsAt: utcIso(periodEndTimestamp),
            cancelledAt: undefined,
            subscriptionStatusReason: reason,
            lastActiveAt: now,
          },
          updatedAt: Date.now(),
        });
      }
    }
    await insertPlatformAudit(ctx, admin, {
      action,
      entityType: "platform_invoice",
      entityPublicId: invoiceId,
      entityLabel: invoiceId,
      summary,
      reason,
      before: { status: current.status, paidAt: current.paidAt, paymentReference: current.paymentReference, pastDueAt: current.pastDueAt, voidedAt: current.voidedAt },
      after: { status: updated.status, paidAt: updated.paidAt, paymentReference: updated.paymentReference, pastDueAt: updated.pastDueAt, voidedAt: updated.voidedAt },
    });
    if (["platform.invoice.issue", "platform.invoice.past_due", "platform.invoice.payment"].includes(operation)) {
      const recipient = await platformGymOwnerRecipient(ctx, stringValue(current.gymId));
      if (recipient) await queueOperationalEmail(ctx, {
        organizationId: recipient.organization._id,
        kind: operation === "platform.invoice.issue" ? "platform_invoice_issued" : operation === "platform.invoice.past_due" ? "platform_invoice_past_due" : "platform_invoice_paid",
        templateVersion: operation === "platform.invoice.issue" ? "platform-invoice-issued-v1" : operation === "platform.invoice.past_due" ? "platform-invoice-past-due-v1" : "platform-invoice-paid-v1",
        recipientReference: publicUserId(recipient.user),
        recipientEmail: recipient.user.email,
        dedupeKey: `${operation}:${invoiceId}:${now}`,
      });
      if (recipient && operation === "platform.invoice.past_due") {
        await notifyOrganizationRoles(ctx, {
          organizationId: recipient.organization._id,
          roles: ["owner", "manager"],
          kind: "platform_invoice_past_due",
          title: "RIVET invoice marked past due",
          body: `${invoiceId} · ${platformInvoiceAmount(numberValue(current.amountMinor), stringValue(current.currency, "JOD"))}`,
          href: "/support",
          dedupeKey: `platform-invoice-past-due:${invoiceId}`,
        });
      }
    }
    return { id: record.publicId, ...updated };
  }

  if (["platform.support.resolve", "platform.support.reply", "platform.support.reopen", "platform.support.assign"].includes(operation)) {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const publicId = recordId(input.caseId);
    const record = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "supportCase")).collect()).find((row) => row.publicId === publicId);
    if (!record) domainError("NOT_FOUND", "Support case not found.", { correlationId: admin.correlationId });
    const current = data(record.data);
    const now = isoNow();
    let updated: Data;
    let action: string;
    let summary: string;

    if (operation === "platform.support.reply") {
      const body = stringValue(input.body).trim();
      if (!body) domainError("VALIDATION_ERROR", "A support reply is required.", { correlationId: admin.correlationId, fieldErrors: { body: ["Required"] } });
      const messageId = `SUP-MSG-${newPublicId()}`;
      await ctx.db.insert("domainRecords", {
        organizationId: record.organizationId,
        entityType: "supportMessage",
        publicId: messageId,
        branchId: record.branchId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: { id: messageId, caseId: publicId, authorType: "platform", authorId: publicUserId(admin.user), authorName: admin.user.fullName, body, createdAt: now },
      });
      updated = { ...current, status: "waiting", firstResponseAt: optionalString(current.firstResponseAt) ?? now, updatedAt: now };
      action = "support.reply";
      summary = "Replied to gym support case";
    } else if (operation === "platform.support.resolve") {
      const resolutionSummary = stringValue(input.resolutionSummary).trim();
      if (!resolutionSummary) domainError("VALIDATION_ERROR", "A resolution summary is required.", { correlationId: admin.correlationId, fieldErrors: { resolutionSummary: ["Required"] } });
      if (stringValue(current.status) === "resolved") domainError("VALIDATION_ERROR", "This support case is already resolved.", { correlationId: admin.correlationId });
      updated = { ...current, status: "resolved", resolutionSummary, resolvedAt: now, updatedAt: now };
      action = "support.resolve";
      summary = "Resolved gym support case";
    } else if (operation === "platform.support.reopen") {
      if (stringValue(current.status) !== "resolved") domainError("VALIDATION_ERROR", "Only a resolved support case can be reopened.", { correlationId: admin.correlationId });
      updated = { ...current, status: "open", resolutionSummary: undefined, resolvedAt: undefined, updatedAt: now };
      action = "support.reopen";
      summary = "Reopened gym support case";
    } else {
      const assigneeId = optionalString(input.assigneeId);
      const assignee = assigneeId ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", assigneeId)).unique() : null;
      if (assigneeId && (!assignee || !assignee.platformAdmin || assignee.status !== "active")) domainError("NOT_FOUND", "Platform operator not found.", { correlationId: admin.correlationId });
      updated = { ...current, assigneeId: assignee ? publicUserId(assignee) : undefined, assigneeName: assignee?.fullName, updatedAt: now };
      action = assignee ? "support.assign" : "support.unassign";
      summary = assignee ? "Assigned gym support case" : "Unassigned gym support case";
    }
    await ctx.db.patch(record._id, { data: updated, updatedAt: Date.now() });
    await insertPlatformAudit(ctx, admin, {
      action,
      entityType: "support_case",
      entityPublicId: publicId,
      entityLabel: stringValue(current.subject, publicId),
      summary,
      before: { status: current.status, assigneeId: current.assigneeId, resolutionSummary: current.resolutionSummary },
      after: { status: updated.status, assigneeId: updated.assigneeId, resolutionSummary: updated.resolutionSummary },
    });
    if (operation === "platform.support.reply" || operation === "platform.support.resolve") {
      const creatorId = optionalString(current.creatorId);
      const creator = creatorId ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", creatorId)).unique() : null;
      if (creator && creator.status !== "deactivated") await insertOperationalNotification(ctx, {
        recipientUserId: creator._id,
        organizationId: record.organizationId,
        branchId: record.branchId,
        kind: operation === "platform.support.reply" ? "support_reply" : "support_resolved",
        title: operation === "platform.support.reply" ? "RIVET replied to your support case" : "RIVET resolved your support case",
        body: stringValue(current.subject, publicId),
        href: `/support?case=${publicId}`,
        dedupeKey: `${operation}:${publicId}:${now}`,
      });
      await queueOperationalEmail(ctx, {
        organizationId: record.organizationId,
        branchId: record.branchId,
        kind: operation === "platform.support.reply" ? "support_reply" : "support_resolved",
        templateVersion: operation === "platform.support.reply" ? "support-reply-v1" : "support-resolved-v1",
        recipientReference: creatorId ?? stringValue(current.creatorEmail),
        recipientEmail: optionalString(current.creatorEmail),
        dedupeKey: `${operation}:email:${publicId}:${now}`,
      });
    }
    if (operation === "platform.support.assign" && updated.assigneeId) {
      const assignee = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", stringValue(updated.assigneeId))).unique();
      if (assignee) await insertOperationalNotification(ctx, {
        recipientUserId: assignee._id,
        organizationId: record.organizationId,
        branchId: record.branchId,
        kind: "support_assignment",
        title: "Support case assigned to you",
        body: `${stringValue(current.gym, "Gym")} · ${stringValue(current.subject, publicId)}`,
        href: `/platform/support?case=${publicId}`,
        dedupeKey: `support-assigned:${publicId}:${publicUserId(assignee)}`,
      });
    }
    const refreshed = await ctx.db.get(record._id);
    if (!refreshed) domainError("NOT_FOUND", "Support case not found.", { correlationId: admin.correlationId });
    return await supportCaseView(ctx, refreshed);
  }

  const actor = await requireActor(ctx, request);
  const orgId = publicOrganizationId(actor.organization);

  switch (operation) {
    case "support.reply": {
      const body = stringValue(input.body).trim();
      if (!body) domainError("VALIDATION_ERROR", "A support reply is required.", { correlationId: actor.correlationId, fieldErrors: { body: ["Required"] } });
      const record = await recordOf(ctx, actor, "supportCase", recordId(input.caseId));
      const current = data(record.data);
      if (actor.role !== "owner" && actor.role !== "manager" && stringValue(current.creatorId) !== publicUserId(actor.user)) {
        domainError("NOT_FOUND", "Support case not found.", { correlationId: actor.correlationId });
      }
      if (stringValue(current.status) === "resolved") domainError("VALIDATION_ERROR", "Resolved support cases cannot receive new replies.", { correlationId: actor.correlationId });
      const now = isoNow();
      const messageId = `SUP-MSG-${newPublicId()}`;
      await insertRecord(ctx, actor, "supportMessage", {
        id: messageId,
        caseId: record.publicId,
        authorType: "gym",
        authorId: publicUserId(actor.user),
        authorName: actor.user.fullName,
        body,
        createdAt: now,
      }, { branchId: optionalString(current.branchId) });
      const updated = { ...current, status: "open", updatedAt: now };
      await ctx.db.patch(record._id, { data: updated, updatedAt: Date.now() });
      await insertAudit(ctx, actor, {
        category: "settings",
        action: "support.case.reply",
        entityType: "support_case",
        entityId: record.publicId,
        entityLabel: stringValue(current.subject, record.publicId),
        summary: "Replied to RIVET support case",
        branchId: optionalString(current.branchId),
        after: { status: "open", messageId },
      });
      const platformOperators = (await ctx.db.query("users").collect()).filter((user) => user.platformAdmin && user.status !== "deactivated");
      await Promise.all(platformOperators.map((operator) => insertOperationalNotification(ctx, {
        recipientUserId: operator._id,
        organizationId: actor.organization._id,
        branchId: record.branchId,
        kind: "support_gym_reply",
        title: "New gym reply on support case",
        body: `${actor.organization.name} · ${stringValue(current.subject, record.publicId)}`,
        href: `/platform/support?case=${record.publicId}`,
        dedupeKey: `support-gym-reply:${messageId}`,
      })));
      return await supportCaseView(ctx, (await ctx.db.get(record._id))!);
    }
    case "support.create": {
      const email = stringValue(input.email).trim().toLowerCase();
      const subject = stringValue(input.subject).trim();
      const body = stringValue(input.body).trim();
      const priority = stringValue(input.priority, "normal");
      const requestType = stringValue(input.requestType, "general");
      const requestedPlan = optionalString(input.requestedPlan);
      const billingInterval = optionalString(input.billingInterval);
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) domainError("VALIDATION_ERROR", "A valid contact email is required.", { correlationId: actor.correlationId, fieldErrors: { email: ["Enter a valid email"] } });
      if (!subject) domainError("VALIDATION_ERROR", "A support subject is required.", { correlationId: actor.correlationId, fieldErrors: { subject: ["Required"] } });
      if (!body) domainError("VALIDATION_ERROR", "A support message is required.", { correlationId: actor.correlationId, fieldErrors: { body: ["Required"] } });
      if (!["normal", "urgent"].includes(priority)) domainError("VALIDATION_ERROR", "Support priority is invalid.", { correlationId: actor.correlationId });
      if (!["general", "plan_upgrade"].includes(requestType)) domainError("VALIDATION_ERROR", "Support request type is invalid.", { correlationId: actor.correlationId });
      if (requestType === "plan_upgrade" && !["Starter", "Growth", "Pro", "Enterprise"].includes(requestedPlan ?? "")) domainError("VALIDATION_ERROR", "A requested plan is required for upgrade requests.", { correlationId: actor.correlationId });
      if (billingInterval && !["monthly", "annual"].includes(billingInterval)) domainError("VALIDATION_ERROR", "Billing cadence is invalid.", { correlationId: actor.correlationId });
      const requestedBranchId = optionalString(input.branchId);
      const branch = requestedBranchId ? await branchByPublicId(ctx, actor.organization._id, requestedBranchId) : undefined;
      if (requestedBranchId) assertBranchAccess(actor, branch ?? null);
      const caseId = `SUP-${newPublicId()}`;
      const createdAt = isoNow();
      await insertRecord(ctx, actor, "supportCase", {
        id: caseId,
        gymId: publicOrganizationId(actor.organization),
        gym: actor.organization.name,
        branchId: branch ? publicBranchId(branch) : undefined,
        branchName: branch?.name,
        creatorId: publicUserId(actor.user),
        creatorName: actor.user.fullName,
        creatorEmail: email,
        subject,
        body,
        priority,
        requestType,
        requestedPlan: requestType === "plan_upgrade" ? requestedPlan : undefined,
        billingInterval: requestType === "plan_upgrade" ? billingInterval : undefined,
        status: "open",
        createdAt,
        updatedAt: createdAt,
      }, { branchId: branch ? publicBranchId(branch) : undefined });
      await insertRecord(ctx, actor, "supportMessage", {
        id: `SUP-MSG-${newPublicId()}`,
        caseId,
        authorType: "gym",
        authorId: publicUserId(actor.user),
        authorName: actor.user.fullName,
        body,
        createdAt,
      }, { branchId: branch ? publicBranchId(branch) : undefined });
      const record = await recordOf(ctx, actor, "supportCase", caseId);
      await insertAudit(ctx, actor, { category: "settings", action: "support.case.create", entityType: "support_case", entityId: caseId, entityLabel: subject, summary: "Created a RIVET support case", branchId: branch ? publicBranchId(branch) : undefined });
      const platformOperators = (await ctx.db.query("users").collect()).filter((user) => user.platformAdmin && user.status !== "deactivated");
      await Promise.all(platformOperators.map((operator) => insertOperationalNotification(ctx, {
        recipientUserId: operator._id,
        organizationId: actor.organization._id,
        branchId: branch?._id,
        kind: "support_case_created",
        title: priority === "urgent" ? "Urgent gym support case" : "New gym support case",
        body: `${actor.organization.name} · ${subject}`,
        href: `/platform/support?case=${caseId}`,
        dedupeKey: `support-created:${caseId}`,
      })));
      await queueOperationalEmail(ctx, {
        organizationId: actor.organization._id,
        branchId: branch?._id,
        kind: "support_acknowledgement",
        templateVersion: "support-ack-v1",
        recipientReference: publicUserId(actor.user),
        recipientEmail: email,
        dedupeKey: `support-ack:${caseId}`,
      });
      return await supportCaseView(ctx, record);
    }
    case "members.import.preview":
      return await previewMemberImport(ctx, actor, input);
    case "members.import.commit":
      return await commitMemberImport(ctx, actor, input);
    case "members.create":
      return await createMemberMutation(ctx, actor, input);
    case "members.update": {
      requirePermission(actor, "members.write");
      const record = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const patch: Data = { ...input };
      delete patch.memberId;
      const homeBranch = patch.homeBranchId ? await branchByPublicId(ctx, actor.organization._id, stringValue(patch.homeBranchId)) : null;
      if (patch.homeBranchId) assertBranchAccess(actor, homeBranch);
      const previous = data(record.data);
      const memberOwnedFields = ["fullName", "fullNameAr", "phone", "email", "dateOfBirth", "gender", "preferredLanguage", "addressLine1", "city", "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone"];
      if (previous.customerProfileId && memberOwnedFields.some((field) => input[field] !== undefined && stringValue(input[field]) !== stringValue(previous[field]))) {
        domainError("FORBIDDEN", "Personal profile fields are managed by the member account. Update gym-owned notes, tags, or membership details here.", { correlationId: actor.correlationId });
      }
      const marketingChanged = input.marketingOptIn !== undefined || input.marketingPreferenceSource !== undefined;
      delete patch.marketingPreferenceSource;
      delete patch.marketingOptIn;
      delete patch.marketingPreference;
      if (marketingChanged) {
        const preferenceInput = { marketingOptIn: input.marketingOptIn, marketingPreferenceSource: input.marketingPreferenceSource };
        const nextPreference = marketingPreferenceRecord(preferenceInput, actor, marketingPreference(previous.marketingOptIn));
        patch.marketingOptIn = nextPreference.optedIn;
        patch.marketingPreference = nextPreference;
      }
      const before = { fullName: previous.fullName, phone: previous.phone, email: previous.email, homeBranchId: previous.homeBranchId };
      const updated = await patchRecord(ctx, actor, record, patch);
      if (homeBranch) await ctx.db.patch(record._id, { branchId: homeBranch._id, updatedAt: Date.now() });
      await insertAudit(ctx, actor, { category: "members", action: "member.update", entityType: "member", entityId: record.publicId, entityLabel: `${updated.fullName} · ${updated.memberNumber}`, summary: "Member profile updated", before, after: { fullName: updated.fullName, phone: updated.phone, email: updated.email, homeBranchId: updated.homeBranchId }, branchId: optionalString(updated.homeBranchId) });
      if (marketingChanged) {
        await insertTimeline(ctx, actor, {
          memberId: record.publicId,
          branchId: optionalString(updated.homeBranchId),
          type: "marketing_preference_changed",
          title: `Marketing messages ${updated.marketingOptIn ? "enabled" : "disabled"}`,
          body: `Preference changed from ${marketingPreference(previous.marketingOptIn) ? "opted in" : "opted out"} to ${updated.marketingOptIn ? "opted in" : "opted out"}.`,
          actorId: publicUserId(actor.user),
          actorName: actor.user.fullName,
          meta: { optedIn: Boolean(updated.marketingOptIn), source: stringValue(data(updated.marketingPreference).source, "staff_selected") },
        });
        await insertAudit(ctx, actor, {
          category: "members",
          action: "member.marketing_preference.update",
          entityType: "member",
          entityId: record.publicId,
          entityLabel: `${updated.fullName} · ${updated.memberNumber}`,
          summary: `Marketing messages ${updated.marketingOptIn ? "enabled" : "disabled"}`,
          before: { optedIn: marketingPreference(previous.marketingOptIn), source: data(previous.marketingPreference).source ?? "system_default" },
          after: { optedIn: Boolean(updated.marketingOptIn), source: stringValue(data(updated.marketingPreference).source, "staff_selected") },
          branchId: optionalString(updated.homeBranchId),
        });
      }
      return await toMemberDetail(ctx, actor, updated);
    }
    case "members.archive": {
      requirePermission(actor, "members.archive");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const updated = await patchRecord(ctx, actor, record, { status: "archived", archivedAt: isoNow() });
      const photos = (await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", actor.organization._id).eq("ownerType", "member_photo").eq("ownerPublicId", record.publicId)).collect()).filter((asset) => asset.status === "active");
      const deleteAfter = Date.now() + 90 * 86_400_000;
      await Promise.all(photos.map((asset) => ctx.db.patch(asset._id, { status: "scheduled_for_deletion", deleteAfter, updatedAt: Date.now() })));
      await insertAudit(ctx, actor, { category: "members", action: "member.archive", entityType: "member", entityId: record.publicId, entityLabel: `${updated.fullName} · ${updated.memberNumber}`, summary: "Member archived", reason: stringValue(input.reason), before: { status: data(record.data).status }, after: { status: "archived", privatePhotosScheduledForDeletion: photos.length, photoDeleteAfter: photos.length ? utcIso(deleteAfter) : undefined }, branchId: optionalString(updated.homeBranchId) });
      return undefined;
    }
    case "members.delete": {
      requirePermission(actor, "members.archive");
      requireReason(input.reason, actor.correlationId);
      if (actor.role !== "owner" && actor.role !== "manager") {
        domainError("FORBIDDEN", "Only an owner or manager can permanently delete a member.", { correlationId: actor.correlationId });
      }
      const record = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const member = data(record.data);
      if (stringValue(member.status, "active") !== "archived") {
        domainError("VALIDATION_ERROR", "Only archived members can be permanently deleted.", { correlationId: actor.correlationId });
      }
      if (stringValue(input.confirmation).trim() !== stringValue(member.fullName)) {
        domainError("VALIDATION_ERROR", "Type the member's full name to confirm deletion.", { correlationId: actor.correlationId });
      }
      const memberships = (await membershipRecords(ctx, actor)).map((membership) => data(membership.data)).filter((membership) => membership.memberId === record.publicId);
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      if (memberships.some((membership) => ["active", "expiring", "frozen", "scheduled"].includes(statusOfMembership(membership, today)))) {
        domainError("CONFLICT", "This archived member still has an active or scheduled membership.", { correlationId: actor.correlationId });
      }
      if (amountOf(await outstandingForMember(ctx, actor, record.publicId)) > 0) {
        domainError("CONFLICT", "Settle the member's outstanding balance before deletion.", { correlationId: actor.correlationId });
      }
      const [reservedBookings, confirmedBookings] = await Promise.all([
        ctx.db.query("ptBookings").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "reserved")).collect(),
        ctx.db.query("ptBookings").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "confirmed")).collect(),
      ]);
      if ([...reservedBookings, ...confirmedBookings].some((booking) => booking.memberPublicId === record.publicId && booking.startsAt > Date.now())) {
        domainError("CONFLICT", "Cancel or reassign future PT bookings before deletion.", { correlationId: actor.correlationId });
      }
      const [customerMemberships, memberPhotos] = await Promise.all([
        ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "customerMembership")).collect(),
        ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", actor.organization._id).eq("ownerType", "member_photo").eq("ownerPublicId", record.publicId)).collect(),
      ]);
      const customerMembershipProjections = customerMemberships.filter((projection) => stringValue(data(projection.data).memberId) === record.publicId);
      await insertAudit(ctx, actor, {
        category: "members",
        action: "member.delete",
        entityType: "member",
        entityId: record.publicId,
        entityLabel: stringValue(member.fullName) + " · " + stringValue(member.memberNumber),
        summary: "Archived member permanently deleted",
        reason: stringValue(input.reason),
        before: { status: member.status, fullName: member.fullName, phone: member.phone, email: member.email },
        after: { deleted: true, customerMembershipProjectionsRemoved: customerMembershipProjections.length, privatePhotosRemoved: memberPhotos.length },
        branchId: optionalString(member.homeBranchId),
      });
      await Promise.all(customerMembershipProjections.map((projection) => ctx.db.delete(projection._id)));
      await Promise.all(memberPhotos.map(async (asset) => {
        await ctx.storage.delete(asset.storageId);
        await ctx.db.delete(asset._id);
      }));
      await ctx.db.delete(record._id);
      return undefined;
    }
    case "members.note": {
      requirePermission(actor, "members.write");
      const member = await recordOf(ctx, actor, "member", recordId(input.memberId));
      requireReason(input.body, actor.correlationId, "body");
      return await insertTimeline(ctx, actor, { memberId: member.publicId, type: "note", title: "Note added", body: stringValue(input.body), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
    }
    case "members.contact": {
      requirePermission(actor, "members.write");
      const member = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const outcome = stringValue(input.outcome);
      if (!outcome) domainError("VALIDATION_ERROR", "Contact outcome is required.", { correlationId: actor.correlationId });
      return await insertTimeline(ctx, actor, { memberId: member.publicId, type: "call_attempt", title: `Contact — ${outcome.replaceAll("_", " ")}`, body: optionalString(input.notes), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { outcome }, occurredAt: isoNow() });
    }
    case "plans.create": {
      requirePermission(actor, "settings.manage");
      const name = stringValue(input.name).trim();
      const code = stringValue(input.code).trim().toUpperCase();
      if (!name || !code) domainError("VALIDATION_ERROR", "Plan name and code are required.", { correlationId: actor.correlationId });
      const branches = arrayValue(input.branchIds).map(String);
      if (stringValue(input.branchAccess, "all") === "selected") for (const branchId of branches) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const includedPtSessions = numberValue(input.includedPtSessions);
      if (!Number.isInteger(includedPtSessions) || includedPtSessions < 0 || includedPtSessions > 100) domainError("VALIDATION_ERROR", "Included PT sessions must be between 0 and 100.", { correlationId: actor.correlationId });
      const plan = await insertRecord(ctx, actor, "plan", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), name, code, kind: stringValue(input.kind, "time"), durationDays: input.durationDays, visitAllowance: input.visitAllowance, visitValidityDays: input.visitValidityDays, basePrice: money(amountOf(input.basePrice), actor.organization.currency), branchAccess: stringValue(input.branchAccess, "all"), branchIds: branches, freezeAllowanceDays: numberValue(input.freezeAllowanceDays), includedPtSessions, status: "active" });
      await insertAudit(ctx, actor, { category: "settings", action: "plan.create", entityType: "plan", entityId: plan.id, entityLabel: `${plan.name} · ${plan.code}`, summary: "Membership plan created" });
      return await toPlan(ctx, actor, plan);
    }
    case "plans.update": {
      requirePermission(actor, "settings.manage");
      const record = await recordOf(ctx, actor, "plan", recordId(input.planId));
      const patch: Data = { ...input };
      delete patch.planId;
      if (patch.basePrice) patch.basePrice = money(amountOf(patch.basePrice), actor.organization.currency);
      if (patch.includedPtSessions !== undefined && (!Number.isInteger(patch.includedPtSessions) || numberValue(patch.includedPtSessions) < 0 || numberValue(patch.includedPtSessions) > 100)) domainError("VALIDATION_ERROR", "Included PT sessions must be between 0 and 100.", { correlationId: actor.correlationId });
      if (patch.branchIds) for (const branchId of arrayValue(patch.branchIds).map(String)) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const updated = await patchRecord(ctx, actor, record, patch);
      await insertAudit(ctx, actor, { category: "settings", action: "plan.update", entityType: "plan", entityId: record.publicId, entityLabel: stringValue(updated.name), summary: "Membership plan updated" });
      return await toPlan(ctx, actor, updated);
    }
    case "profiles.gym.save": {
      requirePermission(actor, "profiles.manage");
      const shortName = stringValue(input.shortName).trim();
      const taglineEn = stringValue(input.taglineEn).trim();
      const descriptionEn = stringValue(input.descriptionEn).trim();
      const accentColor = stringValue(input.accentColor).trim();
      if (!shortName || !taglineEn || !descriptionEn) domainError("VALIDATION_ERROR", "Short name, English tagline, and English description are required.", { correlationId: actor.correlationId });
      if (shortName.length > 24 || taglineEn.length > 180 || descriptionEn.length > 2_000) domainError("VALIDATION_ERROR", "Public profile text exceeds the allowed length.", { correlationId: actor.correlationId });
      if (!/^#[0-9a-f]{6}$/i.test(accentColor)) domainError("VALIDATION_ERROR", "Accent color must be a six-digit hex color.", { correlationId: actor.correlationId });
      for (const field of ["websiteUrl", "instagramUrl"] as const) {
        const candidate = optionalString(input[field])?.trim();
        if (candidate) { try { const parsed = new URL(candidate); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { domainError("VALIDATION_ERROR", `${field === "websiteUrl" ? "Website" : "Instagram"} URL must be a valid HTTP or HTTPS address.`, { correlationId: actor.correlationId }); } }
      }
      const assetIds = [optionalString(input.logoAssetId), optionalString(input.coverAssetId), ...arrayValue(input.galleryAssetIds).map((item) => optionalString(item))].filter((item): item is string => Boolean(item));
      const referencedAssets: Doc<"mediaAssets">[] = [];
      for (const assetId of assetIds) {
        const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", assetId)).unique();
        if (!asset || asset.visibility !== "public" || !asset.ownerType.startsWith("gym_") || !["pending", "active"].includes(asset.status)) domainError("NOT_FOUND", "Public profile media was not found.", { correlationId: actor.correlationId });
        referencedAssets.push(asset);
      }
      const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
      const versions = await recordsOf(ctx, actor, "gymProfileVersion");
      const publishedVersion = Math.max(0, ...versions.map((record) => numberValue(data(record.data).version)));
      const now = Date.now();
      const value = { shortName, taglineEn, taglineAr: optionalString(input.taglineAr)?.trim(), descriptionEn, descriptionAr: optionalString(input.descriptionAr)?.trim(), category: stringValue(input.category, "Gym").trim(), audience: stringValue(input.audience, "All members").trim(), amenities: arrayValue(input.amenities).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 40), contactEmail: optionalString(input.contactEmail)?.trim().toLowerCase(), contactPhone: optionalString(input.contactPhone)?.trim(), websiteUrl: optionalString(input.websiteUrl)?.trim(), instagramUrl: optionalString(input.instagramUrl)?.trim(), accentColor, logoAssetId: optionalString(input.logoAssetId), coverAssetId: optionalString(input.coverAssetId), galleryAssetIds: arrayValue(input.galleryAssetIds).map(String), version: publishedVersion + 1, status: "draft", updatedAt: utcIso(now) };
      if (existing) await ctx.db.patch(existing._id, { data: { ...data(existing.data), ...value }, updatedAt: now });
      else await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "gymProfileDraft", publicId: "current", createdAt: now, updatedAt: now, data: value });
      for (const asset of referencedAssets) {
        if (asset.status === "pending") await ctx.db.patch(asset._id, { status: "active", deleteAfter: undefined, updatedAt: now });
      }
      await insertAudit(ctx, actor, { category: "settings", action: "gym_profile.save_draft", entityType: "gym_public_profile", entityId: "current", entityLabel: actor.organization.name, summary: `Saved public profile draft v${publishedVersion + 1}`, before: existing ? { version: data(existing.data).version, status: data(existing.data).status } : undefined, after: { version: publishedVersion + 1, status: "draft" } });
      return await currentGymProfile(ctx, actor);
    }
    case "profiles.gym.publish": {
      requirePermission(actor, "profiles.manage");
      const draft = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
      if (!draft) domainError("VALIDATION_ERROR", "Save the public profile draft before publishing.", { correlationId: actor.correlationId });
      const draftValue = data(draft.data);
      if (!stringValue(draftValue.taglineEn).trim() || !stringValue(draftValue.descriptionEn).trim()) domainError("VALIDATION_ERROR", "Complete the English tagline and description before publishing.", { correlationId: actor.correlationId });
      const listing = (await marketplaceRows(ctx)).find((record) => record.organizationId === actor.organization._id);
      if (!listing) domainError("CONFIGURATION_ERROR", "The platform listing must exist before this gym profile can be published.", { correlationId: actor.correlationId });
      const listingValue = data(listing.data);
      const draftVersion = numberValue(draftValue.version);
      // Publishing is a retryable command. If the draft and listing already
      // agree on the published version, return the authoritative projection
      // without creating another immutable snapshot or audit event.
      if (stringValue(draftValue.status) === "published" && booleanValue(listingValue.profilePublished, false) && numberValue(listingValue.profileVersion) === draftVersion) {
        return await currentGymProfile(ctx, actor);
      }
      const allVersions = await recordsOf(ctx, actor, "gymProfileVersion");
      // Only the very first publish is self-serve. Every later change is
      // reviewed by the platform team: the tenant keeps saving drafts and
      // sends a support case; RIVET publishes the draft from the console.
      if (allVersions.length > 0) {
        domainError("VALIDATION_ERROR", "The public page locks after its first publish. Save your draft, then ask RIVET support to review and publish it.", { correlationId: actor.correlationId });
      }
      const { versionId, listingBefore } = await applyGymProfilePublish(ctx, actor.organization, listing, draft);
      await insertAudit(ctx, actor, { category: "settings", action: "gym_profile.publish", entityType: "gym_public_profile", entityId: versionId, entityLabel: actor.organization.name, summary: `Published gym profile v${draftVersion}`, before: { profilePublished: booleanValue(listingBefore.profilePublished, true), version: listingBefore.profileVersion }, after: { profilePublished: true, version: draftVersion } });
      return await currentGymProfile(ctx, actor);
    }
    case "profiles.gym.unpublish": {
      requirePermission(actor, "profiles.manage");
      // Removing the live page is a platform decision, like every change
      // after the first publish. Support routes it to the RIVET team, which
      // hides the listing from the console.
      domainError("VALIDATION_ERROR", "Ask RIVET support to take the public page down; the platform team removes it from discovery for you.", { correlationId: actor.correlationId });
    }
    case "pt.trainer.upsert": {
      requirePermission(actor, "pt.manage");
      const displayName = stringValue(input.displayName).trim();
      if (displayName.length < 2) domainError("VALIDATION_ERROR", "Trainer name is required.", { correlationId: actor.correlationId, fieldErrors: { displayName: ["Required"] } });
      const user = await userByPublicId(ctx, actor.organization._id, recordId(input.userId));
      if (!user || user.status === "deactivated") domainError("NOT_FOUND", "Active trainer account not found.", { correlationId: actor.correlationId });
      const staffMembership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
      if (!staffMembership?.active || staffMembership.role !== "trainer") domainError("VALIDATION_ERROR", "Trainer profiles must link to an active staff member with the trainer role.", { correlationId: actor.correlationId });
      const requestedBranchIds = arrayValue(input.branchIds).map(String);
      if (requestedBranchIds.length === 0) domainError("VALIDATION_ERROR", "Select at least one trainer branch.", { correlationId: actor.correlationId });
      const branches = await Promise.all(requestedBranchIds.map((id) => branchByPublicId(ctx, actor.organization._id, id)));
      if (branches.some((branch) => !branch)) domainError("NOT_FOUND", "Trainer branch not found.", { correlationId: actor.correlationId });
      for (const branch of branches) assertBranchAccess(actor, branch);
      if (branches.some((branch) => staffMembership.branchScope !== "all" && !staffMembership.branchIds.includes(branch!._id))) domainError("FORBIDDEN", "Trainer profile cannot include a branch outside the staff member's access.", { correlationId: actor.correlationId });
      const status = stringValue(input.status, "draft");
      if (!(["draft", "published", "archived"] as string[]).includes(status)) domainError("VALIDATION_ERROR", "Trainer profile status is invalid.", { correlationId: actor.correlationId });
      const existingById = input.id ? await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", stringValue(input.id))).unique() : null;
      const existingByUser = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
      const existing = existingById ?? existingByUser;
      // Editing without selecting a replacement must not silently unlink the
      // current photo. New uploads remain pending until this mutation links
      // them to the canonical trainer public id.
      const photoAssetId = optionalString(input.photoAssetId) ?? existing?.photoAssetId;
      if (status === "published" && photoAssetId && !stringValue(input.photoAlt).trim() && !existing?.photoAlt?.trim()) domainError("VALIDATION_ERROR", "Published trainer photos require alt text.", { correlationId: actor.correlationId, fieldErrors: { photoAlt: ["Required for published photos"] } });
      let photoAsset: Doc<"mediaAssets"> | null = null;
      if (photoAssetId) {
        const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", photoAssetId)).unique();
        const expectedOwnerPublicId = existing?.publicId ?? optionalString(input.id);
        if (!asset || !expectedOwnerPublicId || asset.ownerType !== "trainer_photo" || asset.ownerPublicId !== expectedOwnerPublicId || asset.visibility !== "public" || !["pending", "active"].includes(asset.status)) domainError("NOT_FOUND", "Trainer photo not found.", { correlationId: actor.correlationId });
        photoAsset = asset;
      }
      if (existingById && existingByUser && existingById._id !== existingByUser._id) domainError("CONFLICT", "This trainer account already has a profile.", { correlationId: actor.correlationId });
      if (existing && status === "archived") {
        const future = await ctx.db.query("ptBookings").withIndex("by_trainer_start", (q) => q.eq("trainerProfileId", existing._id).gte("startsAt", Date.now())).collect();
        if (future.some((booking) => ["reserved", "confirmed"].includes(booking.status))) domainError("CONFLICT", "Reassign or cancel future bookings before archiving this trainer.", { correlationId: actor.correlationId });
      }
      const now = Date.now();
      const value = {
        userId: user._id,
        displayName,
        bioEn: optionalString(input.bioEn),
        bioAr: optionalString(input.bioAr),
        specialties: arrayValue(input.specialties).map(String).map((item) => item.trim()).filter(Boolean),
        languages: arrayValue(input.languages).map(String).filter((item): item is "en" | "ar" => item === "en" || item === "ar"),
        branchIds: branches.map((branch) => branch!._id),
        photoAssetId,
        photoAlt: optionalString(input.photoAlt) ?? existing?.photoAlt,
        status: status as "draft" | "published" | "archived",
        updatedAt: now,
      };
      let profile: Doc<"ptTrainerProfiles">;
      if (existing) {
        const before = { displayName: existing.displayName, status: existing.status, branchCount: existing.branchIds.length };
        await ctx.db.patch(existing._id, value);
        profile = (await ctx.db.get(existing._id))!;
        await insertAudit(ctx, actor, { category: "users", action: "pt.trainer.update", entityType: "pt_trainer", entityId: profile.publicId, entityLabel: displayName, summary: "Updated trainer profile", before, after: { displayName, status, branchCount: branches.length } });
        if (photoAssetId && existing.photoAssetId && existing.photoAssetId !== photoAssetId) {
          const replaced = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", existing.photoAssetId!)).unique();
          if (replaced?.status === "active") await ctx.db.patch(replaced._id, { status: "scheduled_for_deletion", deleteAfter: now + 30 * 86_400_000, updatedAt: now });
        }
      } else {
        const id = await ctx.db.insert("ptTrainerProfiles", { organizationId: actor.organization._id, publicId: newPublicId(), ...value, createdAt: now });
        profile = (await ctx.db.get(id))!;
        await insertAudit(ctx, actor, { category: "users", action: "pt.trainer.create", entityType: "pt_trainer", entityId: profile.publicId, entityLabel: displayName, summary: "Created trainer profile", after: { status, branchCount: branches.length } });
      }
      // An upload alone is never publicly projectable. Linking it to the
      // authorized trainer profile is the atomic activation boundary.
      if (photoAsset?.status === "pending") await ctx.db.patch(photoAsset._id, { status: "active", deleteAfter: undefined, updatedAt: now });
      return await ptTrainerView(ctx, actor.organization, profile);
    }
    case "pt.package.upsert": {
      requirePermission(actor, "pt.manage");
      const name = stringValue(input.name).trim();
      const sessionCount = numberValue(input.sessionCount);
      const totalPriceMinor = amountOf(input.totalPrice);
      const validityDays = numberValue(input.validityDays);
      if (!name || !Number.isSafeInteger(sessionCount) || sessionCount < 1 || sessionCount > 1_000) domainError("VALIDATION_ERROR", "PT packages must contain between 1 and 1,000 whole sessions.", { correlationId: actor.correlationId });
      if (!Number.isSafeInteger(totalPriceMinor) || totalPriceMinor <= 0 || !Number.isInteger(validityDays) || validityDays < 1 || validityDays > 730) domainError("VALIDATION_ERROR", "Package price and validity must be positive.", { correlationId: actor.correlationId });
      if (currencyOf(input.totalPrice, actor.organization.currency) !== actor.organization.currency) domainError("VALIDATION_ERROR", "Package currency does not match the organization.", { correlationId: actor.correlationId });
      const branchAccess = stringValue(input.branchAccess, "all");
      const requestedBranches = branchAccess === "selected" ? arrayValue(input.branchIds).map(String) : [];
      if (branchAccess === "selected" && requestedBranches.length === 0) domainError("VALIDATION_ERROR", "Select at least one package branch.", { correlationId: actor.correlationId });
      const branches = await Promise.all(requestedBranches.map((id) => branchByPublicId(ctx, actor.organization._id, id)));
      if (branches.some((branch) => !branch)) domainError("NOT_FOUND", "Package branch not found.", { correlationId: actor.correlationId });
      for (const branch of branches) assertBranchAccess(actor, branch);
      const status = stringValue(input.status, "active");
      if (status !== "active" && status !== "archived") domainError("VALIDATION_ERROR", "Package status is invalid.", { correlationId: actor.correlationId });
      const existing = input.id ? await ctx.db.query("ptPackages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", stringValue(input.id))).unique() : null;
      if (input.id && !existing) domainError("NOT_FOUND", "PT package not found.", { correlationId: actor.correlationId });
      const activePackages = await ctx.db.query("ptPackages").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect();
      const candidate = [...activePackages.filter((item) => item._id !== existing?._id).map((item) => ({ sessionCount: item.sessionCount, totalPriceMinor: item.totalPriceMinor })), ...(status === "active" ? [{ sessionCount, totalPriceMinor }] : [])];
      if (!ptPackageLadderIsValid(candidate)) domainError("VALIDATION_ERROR", "Larger PT packages cannot cost more per session than smaller packages.", { correlationId: actor.correlationId });
      const now = Date.now();
      const value = { name, sessionCount, totalPriceMinor, currency: actor.organization.currency, validityDays, branchAccess: branchAccess as "all" | "selected", branchIds: branches.map((branch) => branch!._id), status: status as "active" | "archived", updatedAt: now };
      let ptPackage: Doc<"ptPackages">;
      if (existing) {
        await snapshotMissingPtPackageOrders(ctx, actor, existing);
        await ctx.db.patch(existing._id, value);
        ptPackage = (await ctx.db.get(existing._id))!;
      }
      else { const id = await ctx.db.insert("ptPackages", { organizationId: actor.organization._id, publicId: newPublicId(), ...value, createdAt: now }); ptPackage = (await ctx.db.get(id))!; }
      await insertAudit(ctx, actor, { category: "settings", action: existing ? "pt.package.update" : "pt.package.create", entityType: "pt_package", entityId: ptPackage.publicId, entityLabel: name, summary: existing ? "Updated PT package" : "Created PT package", before: existing ? { sessions: existing.sessionCount, price: existing.totalPriceMinor, status: existing.status } : undefined, after: { sessions: sessionCount, price: totalPriceMinor, status } });
      return await ptPackageView(ctx, actor.organization, ptPackage);
    }
    case "pt.package.delete": {
      requirePermission(actor, "pt.manage");
      const reason = stringValue(input.reason).trim();
      requireReason(reason, actor.correlationId);
      const packageId = recordId(input.packageId);
      const ptPackage = await ctx.db.query("ptPackages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", packageId)).unique();
      if (!ptPackage) domainError("NOT_FOUND", "PT package not found.", { correlationId: actor.correlationId });
      const historicalOrder = (await ctx.db.query("ptPackageOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()).find((order) => order.packageId === ptPackage._id);
      if (historicalOrder) domainError("CONFLICT", "Packages with historical orders cannot be deleted; archive them instead.", { correlationId: actor.correlationId });
      await ctx.db.delete(ptPackage._id);
      await insertAudit(ctx, actor, {
        category: "settings",
        action: "pt.package.delete",
        entityType: "pt_package",
        entityId: packageId,
        entityLabel: ptPackage.name,
        summary: "Deleted unused PT package",
        reason,
        before: { sessions: ptPackage.sessionCount, price: ptPackage.totalPriceMinor, status: ptPackage.status },
      });
      return { id: packageId };
    }
    case "pt.availability.replace": {
      const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique();
      if (!trainer) domainError("NOT_FOUND", "Trainer profile not found.", { correlationId: actor.correlationId });
      if (trainer.userId === actor.user._id) requirePermission(actor, "pt.schedule.self"); else requirePermission(actor, "pt.manage");
      const rules = arrayValue(input.rules).map(data);
      const resolvedRules: Array<{ branch: Branch; weekday: typeof WEEKDAYS[number]; startMinute: number; endMinute: number; active: boolean }> = [];
      for (const rule of rules) {
        const branch = await branchByPublicId(ctx, actor.organization._id, stringValue(rule.branchId));
        const weekday = stringValue(rule.weekday) as typeof WEEKDAYS[number];
        const startMinute = numberValue(rule.startMinute);
        const endMinute = numberValue(rule.endMinute);
        if (!branch || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer branch not found.", { correlationId: actor.correlationId });
        assertBranchAccess(actor, branch);
        if (!WEEKDAYS.includes(weekday) || !Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute < 0 || endMinute > 1_440 || endMinute - startMinute < 60) domainError("VALIDATION_ERROR", "Availability must contain complete 60-minute sessions.", { correlationId: actor.correlationId });
        if (resolvedRules.some((item) => item.branch._id === branch._id && item.weekday === weekday && startMinute < item.endMinute && item.startMinute < endMinute)) domainError("CONFLICT", "Trainer availability windows cannot overlap.", { correlationId: actor.correlationId });
        resolvedRules.push({ branch, weekday, startMinute, endMinute, active: booleanValue(rule.active, true) });
      }
      const exceptions = arrayValue(input.exceptions).map(data);
      const resolvedExceptions: Array<{ branch: Branch; date: string; startMinute?: number; endMinute?: number; reason?: string }> = [];
      for (const exception of exceptions) {
        const branch = await branchByPublicId(ctx, actor.organization._id, stringValue(exception.branchId));
        const date = stringValue(exception.date);
        if (!branch || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer branch not found.", { correlationId: actor.correlationId });
        assertBranchAccess(actor, branch);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) domainError("VALIDATION_ERROR", "Availability exception date is invalid.", { correlationId: actor.correlationId });
        const startMinute = exception.startMinute === undefined ? undefined : numberValue(exception.startMinute);
        const endMinute = exception.endMinute === undefined ? undefined : numberValue(exception.endMinute);
        if ((startMinute === undefined) !== (endMinute === undefined) || (startMinute !== undefined && (startMinute < 0 || endMinute! > 1_440 || startMinute >= endMinute!))) domainError("VALIDATION_ERROR", "Availability exception time is invalid.", { correlationId: actor.correlationId });
        resolvedExceptions.push({ branch, date, startMinute, endMinute, reason: optionalString(exception.reason) });
      }
      const [oldRules, oldExceptions] = await Promise.all([
        ctx.db.query("ptAvailabilityRules").withIndex("by_trainer", (q) => q.eq("trainerProfileId", trainer._id)).collect(),
        ctx.db.query("ptAvailabilityExceptions").withIndex("by_trainer_date", (q) => q.eq("trainerProfileId", trainer._id)).collect(),
      ]);
      await Promise.all([...oldRules.map((item) => ctx.db.delete(item._id)), ...oldExceptions.map((item) => ctx.db.delete(item._id))]);
      const now = Date.now();
      await Promise.all(resolvedRules.map((rule) => ctx.db.insert("ptAvailabilityRules", { organizationId: actor.organization._id, publicId: newPublicId(), trainerProfileId: trainer._id, branchId: rule.branch._id, weekday: rule.weekday, startMinute: rule.startMinute, endMinute: rule.endMinute, active: rule.active, createdAt: now, updatedAt: now })));
      await Promise.all(resolvedExceptions.map((exception) => ctx.db.insert("ptAvailabilityExceptions", { organizationId: actor.organization._id, publicId: newPublicId(), trainerProfileId: trainer._id, branchId: exception.branch._id, date: exception.date, startMinute: exception.startMinute, endMinute: exception.endMinute, reason: exception.reason, createdAt: now })));
      await insertAudit(ctx, actor, { category: "settings", action: "pt.availability.replace", entityType: "pt_trainer", entityId: trainer.publicId, entityLabel: trainer.displayName, summary: "Replaced trainer availability", before: { rules: oldRules.length, exceptions: oldExceptions.length }, after: { rules: resolvedRules.length, exceptions: resolvedExceptions.length } });
      return await ptTrainerView(ctx, actor.organization, trainer);
    }
    case "pt.package.request": {
      requirePermission(actor, "pt.book_for_member");
      const idempotencyKey = stringValue(input.idempotencyKey).trim();
      if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
      const requestHash = JSON.stringify({ membershipId: input.membershipId, packageId: input.packageId });
      // Prove the requested member and membership branch before consulting a
      // known idempotency key. A key from another branch must never turn into
      // an order projection for a selected-branch actor.
      const membershipRecord = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const membership = data(membershipRecord.data);
      await recordOf(ctx, actor, "member", stringValue(membership.memberId));
      const membershipBranch = await branchByPublicId(ctx, actor.organization._id, stringValue(membership.homeBranchId));
      if (!membershipBranch || membershipBranch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Membership branch not found.", { correlationId: actor.correlationId });
      if (actor.branchScope === "selected" && !actor.branchIds.includes(membershipBranch._id)) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
      const idempotency = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "pt.package.request").eq("key", idempotencyKey)).unique();
      if (idempotency) {
        if (idempotency.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different package request.", { correlationId: actor.correlationId });
        const order = await ctx.db.query("ptPackageOrders").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", stringValue(data(idempotency.result).orderId))).unique();
        if (!order) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
        await ptPackageOrderScope(ctx, actor, order);
        return await ptPackageOrderView(ctx, actor.organization, order);
      }
      const status = statusOfMembership(membership, todayIn(actor.organization.timezone || TZ_FALLBACK));
      if (!["active", "expiring"].includes(status)) domainError("MEMBERSHIP_NOT_ACTIVE", "An active, unfrozen membership is required to request a PT package.", { correlationId: actor.correlationId });
      const ptPackage = await ctx.db.query("ptPackages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.packageId))).unique();
      if (!ptPackage || ptPackage.status !== "active") domainError("NOT_FOUND", "PT package not found.", { correlationId: actor.correlationId });
      const branch = membershipBranch;
      assertBranchAccess(actor, branch);
      if (ptPackage.branchAccess === "selected" && !ptPackage.branchIds.includes(branch._id)) domainError("NOT_FOUND", "This PT package is not available at the membership branch.", { correlationId: actor.correlationId });
      const issueDate = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const charge = await insertRecord(ctx, actor, "charge", { id: newPublicId(), memberId: membership.memberId, membershipId: membershipRecord.publicId, description: ptPackage.name, subtotal: money(ptPackage.totalPriceMinor, actor.organization.currency), discount: money(0, actor.organization.currency), tax: money(0, actor.organization.currency), total: money(ptPackage.totalPriceMinor, actor.organization.currency), paidAmount: money(0, actor.organization.currency), outstandingAmount: money(ptPackage.totalPriceMinor, actor.organization.currency), status: "unpaid", issueDate, dueDate: issueDate, createdAt: isoNow() }, { branchId: publicBranchId(branch), memberPublicId: stringValue(membership.memberId) });
      const now = Date.now();
      const orderId = await ctx.db.insert("ptPackageOrders", {
        organizationId: actor.organization._id,
        publicId: newPublicId(),
        memberPublicId: stringValue(membership.memberId),
        membershipPublicId: membershipRecord.publicId,
        packageId: ptPackage._id,
        chargePublicId: stringValue(charge.id),
        packageNameSnapshot: ptPackage.name,
        sessionCountSnapshot: ptPackage.sessionCount,
        totalPriceMinorSnapshot: ptPackage.totalPriceMinor,
        currencySnapshot: ptPackage.currency,
        validityDaysSnapshot: ptPackage.validityDays,
        branchAccessSnapshot: ptPackage.branchAccess,
        branchIdsSnapshot: [...ptPackage.branchIds],
        status: "pending_payment",
        createdAt: now,
        updatedAt: now,
      });
      const order = (await ctx.db.get(orderId))!;
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "pt.package.request", key: idempotencyKey, requestHash, result: { orderId: order.publicId }, createdAt: now, expiresAt: now + 365 * 86_400_000 });
      await insertTimeline(ctx, actor, { memberId: membership.memberId, branchId: membership.homeBranchId, type: "pt_package_requested", title: `${ptPackage.name} requested`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { orderId: order.publicId, chargeId: charge.id } });
      await insertAudit(ctx, actor, { category: "memberships", action: "pt.package.request", entityType: "pt_package_order", entityId: order.publicId, entityLabel: stringValue(membership.memberId), summary: `Created unpaid charge for ${ptPackage.name}`, branchId: stringValue(membership.homeBranchId), after: { sessions: ptPackage.sessionCount, amount: ptPackage.totalPriceMinor, chargeId: charge.id } });
      return await ptPackageOrderView(ctx, actor.organization, order);
    }
    case "pt.package.cancel": {
      requirePermission(actor, "pt.refund");
      requireReason(input.reason, actor.correlationId);
      const orderId = recordId(input.orderId);
      const idempotencyKey = stringValue(input.idempotencyKey).trim();
      if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
      const requestHash = JSON.stringify({ orderId, reason: stringValue(input.reason).trim() });
      // Resolve and authorize the target order before looking up the key. A
      // known cancellation key must not bypass organization/member/branch
      // scope checks for a selected-branch actor.
      const order = await ctx.db.query("ptPackageOrders").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", orderId)).unique();
      if (!order) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
      const orderScope = await ptPackageOrderScope(ctx, actor, order);
      const existingIdempotency = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "pt.package.cancel").eq("key", idempotencyKey)).unique();
      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different PT cancellation.", { correlationId: actor.correlationId });
        const replay = await ctx.db.query("ptPackageOrders").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", stringValue(data(existingIdempotency.result).orderId))).unique();
        if (!replay) domainError("NOT_FOUND", "PT package order not found.", { correlationId: actor.correlationId });
        if (replay.publicId !== order.publicId) domainError("CONFLICT", "The cancellation idempotency record does not match the requested order.", { correlationId: actor.correlationId });
        await ptPackageOrderScope(ctx, actor, replay);
        return await ptPackageOrderView(ctx, actor.organization, replay);
      }
      assertBranchAccess(actor, orderScope.branch);
      if (order.status !== "pending_payment") domainError("VALIDATION_ERROR", "Only a pending PT package order can be cancelled. Use the PT refund flow after activation.", { correlationId: actor.correlationId });
      const charge = orderScope.charge;
      const chargeData = data(charge.data);
      if (amountOf(chargeData.paidAmount) > 0 || stringValue(chargeData.status) === "partial" || stringValue(chargeData.status) === "paid") {
        domainError("VALIDATION_ERROR", "Refund or void the collected payment before cancelling this PT order.", { correlationId: actor.correlationId });
      }
      const now = Date.now();
      const reason = stringValue(input.reason).trim();
      await patchRecord(ctx, actor, charge, { status: "void", paidAmount: money(0, actor.organization.currency), outstandingAmount: money(0, actor.organization.currency), voidReason: reason, voidedAt: utcIso(now) });
      await ctx.db.patch(order._id, { status: "cancelled", cancelledAt: now, cancellationReason: reason, updatedAt: now });
      await insertTimeline(ctx, actor, { memberId: order.memberPublicId, type: "pt_package_cancelled", title: "PT package order cancelled", body: reason, meta: { orderId: order.publicId, chargeId: order.chargePublicId } });
      await insertAudit(ctx, actor, { category: "payments", action: "pt.package.cancel", entityType: "pt_package_order", entityId: order.publicId, entityLabel: order.memberPublicId, summary: "Cancelled pending PT package order and voided unpaid charge", reason, before: { orderStatus: order.status, chargeStatus: chargeData.status }, after: { orderStatus: "cancelled", chargeStatus: "void" } });
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "pt.package.cancel", key: idempotencyKey, requestHash, result: { orderId: order.publicId }, createdAt: now, expiresAt: now + 365 * 86_400_000 });
      return await ptPackageOrderView(ctx, actor.organization, (await ctx.db.get(order._id))!);
    }
    case "pt.introductory.apply": {
      requirePermission(actor, "pt.manage");
      requireReason(input.reason, actor.correlationId);
      const sessionCount = numberValue(input.sessionCount, 2);
      if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 100) domainError("VALIDATION_ERROR", "Introductory PT credits must be between 1 and 100 sessions.", { correlationId: actor.correlationId });
      const idempotencyKey = stringValue(input.idempotencyKey).trim();
      if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
      const requestHash = JSON.stringify({ sessionCount, reason: stringValue(input.reason).trim() });
      const existingKey = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "pt.introductory.apply").eq("key", idempotencyKey)).unique();
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for another credit grant.", { correlationId: actor.correlationId });
        return data(existingKey.result);
      }
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const memberships = (await membershipRecords(ctx, actor)).filter((record) => ["active", "expiring"].includes(statusOfMembership(data(record.data), today)));
      const existingGrants = await ctx.db.query("ptEntitlements").withIndex("by_expiry", (q) => q.eq("organizationId", actor.organization._id).eq("status", "active")).collect();
      const grantedMembershipIds = new Set(existingGrants.filter((item) => item.grantKind === "introductory").map((item) => item.membershipPublicId));
      let grantedMemberships = 0;
      const migrationId = newPublicId();
      for (const membershipRecord of memberships.slice(0, 500)) {
        if (grantedMembershipIds.has(membershipRecord.publicId)) continue;
        const membership = data(membershipRecord.data);
        const now = Date.now();
        const entitlementId = await ctx.db.insert("ptEntitlements", { organizationId: actor.organization._id, publicId: newPublicId(), memberPublicId: stringValue(membership.memberId), source: "manual", grantKind: "introductory", membershipPublicId: membershipRecord.publicId, granted: sessionCount, reserved: 0, consumed: 0, revoked: 0, startsAt: now, expiresAt: ptWallTime(addDays(stringValue(membership.endDate), 1), 0, actor.organization.timezone || TZ_FALLBACK) - 1, status: "active", createdAt: now, updatedAt: now });
        const entitlement = (await ctx.db.get(entitlementId))!;
        await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, type: "grant", quantity: sessionCount, reason: stringValue(input.reason) });
        await insertTimeline(ctx, actor, { memberId: entitlement.memberPublicId, type: "pt_credit_granted", title: `${sessionCount} introductory PT credits granted`, body: stringValue(input.reason), meta: { entitlementId: entitlement.publicId, migrationId } });
        grantedMemberships += 1;
      }
      const result = { eligibleMemberships: Math.max(0, memberships.length - grantedMembershipIds.size - grantedMemberships), alreadyGranted: grantedMembershipIds.size + grantedMemberships, sessionCount, grantedMemberships, migrationId };
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "pt.introductory.apply", key: idempotencyKey, requestHash, result, createdAt: Date.now(), expiresAt: Date.now() + 365 * 86_400_000 });
      await insertAudit(ctx, actor, { category: "memberships", action: "pt.introductory_credits.apply", entityType: "pt_credit_migration", entityId: migrationId, entityLabel: "Existing active memberships", summary: `Granted ${sessionCount} introductory PT credits to ${grantedMemberships} memberships`, reason: stringValue(input.reason), after: result });
      return result;
    }
    case "pt.package.refund": {
      requirePermission(actor, "pt.refund");
      requireReason(input.reason, actor.correlationId);
      const sessions = numberValue(input.sessions);
      if (!Number.isInteger(sessions) || sessions < 1) domainError("VALIDATION_ERROR", "Refund at least one unused PT session.", { correlationId: actor.correlationId });
      const order = await ctx.db.query("ptPackageOrders").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.orderId))).unique();
      if (!order || !order.entitlementId || !["active", "partially_refunded"].includes(order.status)) domainError("NOT_FOUND", "Active PT package order not found.", { correlationId: actor.correlationId });
      const [entitlement, ptPackage, charge] = await Promise.all([ctx.db.get(order.entitlementId), ctx.db.get(order.packageId), recordOf(ctx, actor, "charge", order.chargePublicId)]);
      const terms = ptPackageTerms(order, ptPackage ?? undefined);
      if (!entitlement || terms.sessionCount < 1 || terms.validityDays < 1) domainError("NOT_FOUND", "PT package entitlement not found.", { correlationId: actor.correlationId });
      const available = ptAvailable(entitlement);
      if (sessions > available) domainError("VALIDATION_ERROR", "Only unused, unreserved PT sessions can be refunded.", { correlationId: actor.correlationId, details: { availableSessions: available } });
      const previousSessions = order.refundedSessions ?? 0;
      const nextSessions = previousSessions + sessions;
      const previousMinor = order.refundedMinor ?? 0;
      const cumulativeMinor = Math.floor((terms.totalPriceMinor * nextSessions) / terms.sessionCount);
      const refundMinor = cumulativeMinor - previousMinor;
      if (refundMinor <= 0) domainError("VALIDATION_ERROR", "No refundable package amount remains.", { correlationId: actor.correlationId });
      const originalPayments = (await paymentRecords(ctx, actor)).filter((record) => {
        const payment = data(record.data);
        return payment.chargeId === order.chargePublicId && payment.type === "payment" && payment.status !== "voided";
      }).sort((left, right) => right.createdAt - left.createdAt);
      const refundable = originalPayments.reduce((total, record) => total + Math.max(0, amountOf(data(record.data).amount) - amountOf(data(record.data).refundedAmount)), 0);
      if (refundMinor > refundable) domainError("VALIDATION_ERROR", "Recorded payments do not cover this PT refund.", { correlationId: actor.correlationId });
      let remaining = refundMinor;
      for (const originalRecord of originalPayments) {
        if (remaining <= 0) break;
        const original = data(originalRecord.data);
        const alreadyRefunded = amountOf(original.refundedAmount);
        const part = Math.min(remaining, Math.max(0, amountOf(original.amount) - alreadyRefunded));
        if (part <= 0) continue;
        const allocated = await allocateReceipt(ctx, actor);
        const occurredAt = isoNow();
        const refund = { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), branchId: original.branchId, memberId: order.memberPublicId, chargeId: order.chargePublicId, type: "refund", amount: signedMoney(-part, actor.organization.currency), method: original.method, status: "completed", receiptId: allocated.id, receiptNumber: allocated.number, collectedById: publicUserId(actor.user), collectedByName: actor.user.fullName, shiftId: original.shiftId, idempotencyKey: `pt-refund:${order.publicId}:${nextSessions}:${original.id}`, originalPaymentId: original.id, refundReason: stringValue(input.reason), occurredAt };
        await insertRecord(ctx, actor, "payment", refund, { branchId: stringValue(original.branchId), memberPublicId: order.memberPublicId });
        await insertRecord(ctx, actor, "receipt", { id: allocated.id, receiptNumber: allocated.number, paymentId: refund.id, issuedAt: occurredAt }, { branchId: stringValue(original.branchId), memberPublicId: order.memberPublicId });
        const newRefunded = alreadyRefunded + part;
        await patchRecord(ctx, actor, originalRecord, { refundedAmount: money(newRefunded, actor.organization.currency), refundReason: stringValue(input.reason), status: newRefunded >= amountOf(original.amount) ? "refunded" : "partially_refunded" });
        remaining -= part;
      }
      await ctx.db.patch(entitlement._id, { revoked: entitlement.revoked + sessions, status: ptAvailable({ ...entitlement, revoked: entitlement.revoked + sessions }) === 0 && entitlement.reserved === 0 ? "revoked" : "active", updatedAt: Date.now() });
      await ctx.db.patch(order._id, { refundedSessions: nextSessions, refundedMinor: cumulativeMinor, status: nextSessions >= terms.sessionCount ? "refunded" : "partially_refunded", updatedAt: Date.now() });
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: order.memberPublicId, type: "refund_revoke", quantity: -sessions, reason: stringValue(input.reason) });
      await insertTimeline(ctx, actor, { memberId: order.memberPublicId, type: "pt_credit_refunded", title: `${sessions} PT credit${sessions === 1 ? "" : "s"} refunded`, body: `${actor.organization.currency} ${(refundMinor / 1_000).toFixed(3)} · ${stringValue(input.reason)}`, meta: { orderId: order.publicId, chargeId: charge.publicId, sessions, refundMinor } });
      await insertAudit(ctx, actor, { category: "payments", action: "pt.package.refund", entityType: "pt_package_order", entityId: order.publicId, entityLabel: order.memberPublicId, summary: `Refunded ${sessions} unused PT session${sessions === 1 ? "" : "s"} — ${actor.organization.currency} ${(refundMinor / 1_000).toFixed(3)}`, reason: stringValue(input.reason), before: { available, refundedSessions: previousSessions, refundedMinor: previousMinor }, after: { available: available - sessions, refundedSessions: nextSessions, refundedMinor: cumulativeMinor } });
      return await ptPackageOrderView(ctx, actor.organization, (await ctx.db.get(order._id))!);
    }
    case "pt.booking.create": {
      requirePermission(actor, "pt.book_for_member");
      const idempotencyKey = stringValue(input.idempotencyKey).trim();
      if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
      const existing = await ctx.db.query("ptBookings").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", idempotencyKey)).unique();
      if (existing) {
        if (existing.membershipPublicId !== input.membershipId || (await ctx.db.get(existing.trainerProfileId))?.publicId !== input.trainerProfileId || existing.startsAt !== Date.parse(stringValue(input.startsAt))) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different PT booking.", { correlationId: actor.correlationId });
        return await ptBookingView(ctx, actor.organization, existing);
      }
      const membershipRecord = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const membership = data(membershipRecord.data);
      const startsAt = Date.parse(stringValue(input.startsAt));
      if (!Number.isFinite(startsAt)) domainError("VALIDATION_ERROR", "PT booking start time is invalid.", { correlationId: actor.correlationId });
      const endsAt = startsAt + 3_600_000;
      const sessionDate = businessDate(stringValue(input.startsAt), actor.organization.timezone || TZ_FALLBACK);
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const policies = data(data((await settingsData(ctx, actor)).operationalPolicies).personalTraining);
      if (startsAt <= Date.now() || diffDays(today, sessionDate) > numberValue(policies.bookingHorizonDays, 30)) domainError("VALIDATION_ERROR", `PT sessions may be booked up to ${numberValue(policies.bookingHorizonDays, 30)} days ahead.`, { correlationId: actor.correlationId });
      if (membership.cancelledAt || sessionDate < stringValue(membership.startDate) || sessionDate > stringValue(membership.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover this PT session date.", { correlationId: actor.correlationId });
      const freeze = data(membership.activeFreeze);
      if (freeze.status === "active" && sessionDate >= stringValue(freeze.startDate) && sessionDate <= stringValue(freeze.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "Frozen memberships cannot book PT sessions during the freeze.", { correlationId: actor.correlationId });
      const [trainer, branch, plan] = await Promise.all([
        ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique(),
        branchByPublicId(ctx, actor.organization._id, recordId(input.branchId)),
        recordOf(ctx, actor, "plan", stringValue(membership.planId)),
      ]);
      if (!trainer || trainer.status !== "published" || !branch || !trainer.branchIds.includes(branch._id)) domainError("NOT_FOUND", "Trainer slot not found.", { correlationId: actor.correlationId });
      assertBranchAccess(actor, branch);
      const planData = data(plan.data);
      if (stringValue(planData.branchAccess, "all") === "selected" && !arrayValue(planData.branchIds).map(String).includes(publicBranchId(branch))) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover this PT branch.", { correlationId: actor.correlationId });
      const slots = await ptSlots(ctx, actor.organization, trainer, branch, sessionDate, sessionDate);
      if (!slots.some((slot) => stringValue(slot.startsAt) === new Date(startsAt).toISOString())) domainError("CONFLICT", "This PT slot is no longer available.", { correlationId: actor.correlationId });
      const memberCollision = await ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", stringValue(membership.memberId)).gte("startsAt", startsAt - 3_600_000).lte("startsAt", endsAt)).collect();
      if (memberCollision.some((booking) => ["reserved", "confirmed"].includes(booking.status) && booking.startsAt < endsAt && startsAt < booking.endsAt)) domainError("CONFLICT", "The member already has a PT booking at this time.", { correlationId: actor.correlationId });
      const entitlement = await selectPtEntitlementForBooking(ctx, actor, stringValue(membership.memberId), membershipRecord.publicId, startsAt);
      await ctx.db.patch(entitlement._id, { reserved: entitlement.reserved + 1, updatedAt: Date.now() });
      const now = Date.now();
      const bookingId = await ctx.db.insert("ptBookings", { organizationId: actor.organization._id, publicId: newPublicId(), memberPublicId: stringValue(membership.memberId), membershipPublicId: membershipRecord.publicId, trainerProfileId: trainer._id, branchId: branch._id, entitlementId: entitlement._id, startsAt, endsAt, status: "reserved", bookedByUserId: actor.user._id, idempotencyKey, createdAt: now, updatedAt: now });
      const booking = (await ctx.db.get(bookingId))!;
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, bookingPublicId: booking.publicId, type: "reserve", quantity: -1, reason: "PT booking reserved" });
      await insertTimeline(ctx, actor, { memberId: membership.memberId, branchId: publicBranchId(branch), type: "pt_booking_reserved", title: `PT booked with ${trainer.displayName}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { bookingId: booking.publicId, entitlementId: entitlement.publicId, startsAt: utcIso(startsAt) } });
      await insertAudit(ctx, actor, { category: "memberships", action: "pt.booking.create", entityType: "pt_booking", entityId: booking.publicId, entityLabel: `${stringValue(data((await recordOf(ctx, actor, "member", stringValue(membership.memberId))).data).fullName)} · ${trainer.displayName}`, summary: "Reserved one PT credit", branchId: publicBranchId(branch), after: { startsAt: utcIso(startsAt), trainerId: trainer.publicId, entitlementId: entitlement.publicId } });
      await insertOperationalNotification(ctx, { recipientUserId: trainer.userId, organizationId: actor.organization._id, branchId: branch._id, kind: "pt_booking", title: "New PT booking", body: utcIso(startsAt), href: `/pt?booking=${booking.publicId}`, dedupeKey: `pt-booking:${booking.publicId}` });
      const memberRecord = await recordOf(ctx, actor, "member", stringValue(membership.memberId));
      const member = data(memberRecord.data);
      await queueOperationalEmail(ctx, { organizationId: actor.organization._id, branchId: branch._id, kind: "pt_booking_confirmation", templateVersion: "pt-booking-confirmation-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: stringValue(membership.memberId), recipientEmail: optionalString(member.email), dedupeKey: `pt-booking-confirmation:${booking.publicId}` });
      return await ptBookingView(ctx, actor.organization, booking);
    }
    case "pt.booking.cancel": {
      requireReason(input.reason, actor.correlationId);
      const booking = await ctx.db.query("ptBookings").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.bookingId))).unique();
      if (!booking || (actor.branchScope === "selected" && !actor.branchIds.includes(booking.branchId))) domainError("NOT_FOUND", "PT booking not found.", { correlationId: actor.correlationId });
      if (!["reserved", "confirmed"].includes(booking.status)) domainError("VALIDATION_ERROR", "Only an upcoming PT booking can be cancelled.", { correlationId: actor.correlationId });
      const trainer = await ctx.db.get(booking.trainerProfileId);
      const cancelledByGym = booleanValue(input.cancelledByGym);
      if (trainer?.userId === actor.user._id) requirePermission(actor, "pt.outcome.self"); else requirePermission(actor, "pt.book_for_member");
      const policy = data(data((await settingsData(ctx, actor)).operationalPolicies).personalTraining);
      const timely = cancelledByGym || booking.startsAt - Date.now() >= numberValue(policy.cancellationCutoffHours, 12) * 3_600_000;
      const entitlement = await ctx.db.get(booking.entitlementId);
      if (!entitlement) domainError("NOT_FOUND", "PT entitlement not found.", { correlationId: actor.correlationId });
      await ctx.db.patch(entitlement._id, { reserved: Math.max(0, entitlement.reserved - 1), consumed: entitlement.consumed + (timely ? 0 : 1), updatedAt: Date.now() });
      const status = cancelledByGym ? "gym_cancelled" : timely ? "cancelled" : "late_cancelled";
      await ctx.db.patch(booking._id, { status, cancellationReason: stringValue(input.reason).trim(), updatedAt: Date.now() });
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, bookingPublicId: booking.publicId, type: timely ? "release" : "consume", quantity: timely ? 1 : -1, reason: stringValue(input.reason) });
      await insertTimeline(ctx, actor, { memberId: booking.memberPublicId, type: "pt_booking_cancelled", title: timely ? "PT booking cancelled — credit restored" : "PT booking cancelled after cutoff — credit used", body: stringValue(input.reason), meta: { bookingId: booking.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "pt.booking.cancel", entityType: "pt_booking", entityId: booking.publicId, entityLabel: booking.memberPublicId, summary: timely ? "Cancelled PT booking and restored credit" : "Late-cancelled PT booking and consumed credit", reason: stringValue(input.reason), before: { status: booking.status }, after: { status }, branchId: await publicBranchIdFromId(ctx, actor.organization._id, booking.branchId) });
      const memberRecord = await recordOfOptional(ctx, actor, "member", booking.memberPublicId);
      const member = data(memberRecord?.data);
      await queueOperationalEmail(ctx, { organizationId: actor.organization._id, branchId: booking.branchId, kind: "pt_booking_update", templateVersion: cancelledByGym ? "pt-booking-gym-cancelled-v1" : "pt-booking-cancelled-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: booking.memberPublicId, recipientEmail: optionalString(member.email), dedupeKey: `pt-booking-cancelled:${booking.publicId}:${status}` });
      return await ptBookingView(ctx, actor.organization, (await ctx.db.get(booking._id))!);
    }
    case "pt.booking.reschedule": {
      requirePermission(actor, "pt.book_for_member");
      requireReason(input.reason, actor.correlationId);
      const idempotencyKey = stringValue(input.idempotencyKey).trim();
      if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
      const booking = await ctx.db.query("ptBookings").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.bookingId))).unique();
      if (!booking || (actor.branchScope === "selected" && !actor.branchIds.includes(booking.branchId))) domainError("NOT_FOUND", "PT booking not found.", { correlationId: actor.correlationId });
      if (!["reserved", "confirmed"].includes(booking.status)) domainError("VALIDATION_ERROR", "Only an upcoming PT booking can be rescheduled.", { correlationId: actor.correlationId });
      const requestHash = JSON.stringify({ bookingId: booking.publicId, trainerProfileId: input.trainerProfileId, branchId: input.branchId, startsAt: input.startsAt });
      const existingKey = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "pt.booking.reschedule").eq("key", idempotencyKey)).unique();
      if (existingKey) {
        if (existingKey.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for another reschedule.", { correlationId: actor.correlationId });
        return await ptBookingView(ctx, actor.organization, booking);
      }
      const membershipRecord = await recordOf(ctx, actor, "membership", booking.membershipPublicId);
      const membership = data(membershipRecord.data);
      const startsAt = Date.parse(stringValue(input.startsAt));
      if (!Number.isFinite(startsAt) || startsAt <= Date.now()) domainError("VALIDATION_ERROR", "PT booking start time is invalid.", { correlationId: actor.correlationId });
      const endsAt = startsAt + 3_600_000;
      const sessionDate = businessDate(stringValue(input.startsAt), actor.organization.timezone || TZ_FALLBACK);
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const policies = data(data((await settingsData(ctx, actor)).operationalPolicies).personalTraining);
      if (diffDays(today, sessionDate) > numberValue(policies.bookingHorizonDays, 30) || membership.cancelledAt || sessionDate < stringValue(membership.startDate) || sessionDate > stringValue(membership.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "The membership does not cover the new PT session date.", { correlationId: actor.correlationId });
      const freeze = data(membership.activeFreeze);
      if (freeze.status === "active" && sessionDate >= stringValue(freeze.startDate) && sessionDate <= stringValue(freeze.endDate)) domainError("MEMBERSHIP_NOT_ACTIVE", "Frozen memberships cannot reschedule PT sessions into the freeze.", { correlationId: actor.correlationId });
      const [trainer, branch, entitlement, oldTrainer] = await Promise.all([
        ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.trainerProfileId))).unique(),
        branchByPublicId(ctx, actor.organization._id, recordId(input.branchId)),
        ctx.db.get(booking.entitlementId),
        ctx.db.get(booking.trainerProfileId),
      ]);
      if (!trainer || trainer.status !== "published" || !branch || !trainer.branchIds.includes(branch._id) || !entitlement || (entitlement.startsAt ?? 0) > startsAt || entitlement.expiresAt < startsAt) domainError("NOT_FOUND", "The new PT slot or its reserved credit is unavailable.", { correlationId: actor.correlationId });
      assertBranchAccess(actor, branch);
      const slots = await ptSlots(ctx, actor.organization, trainer, branch, sessionDate, sessionDate);
      if (!slots.some((slot) => stringValue(slot.startsAt) === new Date(startsAt).toISOString())) domainError("CONFLICT", "This PT slot is no longer available.", { correlationId: actor.correlationId });
      const memberCollision = await ctx.db.query("ptBookings").withIndex("by_member_start", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", booking.memberPublicId).gte("startsAt", startsAt - 3_600_000).lte("startsAt", endsAt)).collect();
      if (memberCollision.some((item) => item._id !== booking._id && ["reserved", "confirmed"].includes(item.status) && item.startsAt < endsAt && startsAt < item.endsAt)) domainError("CONFLICT", "The member already has a PT booking at this time.", { correlationId: actor.correlationId });
      const before = { startsAt: utcIso(booking.startsAt), trainerProfileId: oldTrainer?.publicId, branchId: await publicBranchIdFromId(ctx, actor.organization._id, booking.branchId) };
      await ctx.db.patch(booking._id, { trainerProfileId: trainer._id, branchId: branch._id, startsAt, endsAt, updatedAt: Date.now() });
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, bookingPublicId: booking.publicId, type: "release", quantity: 1, reason: `Reschedule: ${stringValue(input.reason)}` });
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, bookingPublicId: booking.publicId, type: "reserve", quantity: -1, reason: `Reschedule: ${stringValue(input.reason)}` });
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "pt.booking.reschedule", key: idempotencyKey, requestHash, result: { bookingId: booking.publicId }, createdAt: Date.now(), expiresAt: Date.now() + 365 * 86_400_000 });
      await insertTimeline(ctx, actor, { memberId: booking.memberPublicId, branchId: publicBranchId(branch), type: "pt_booking_rescheduled", title: `PT rescheduled with ${trainer.displayName}`, body: stringValue(input.reason), meta: { bookingId: booking.publicId, startsAt: utcIso(startsAt) } });
      await insertAudit(ctx, actor, { category: "memberships", action: "pt.booking.reschedule", entityType: "pt_booking", entityId: booking.publicId, entityLabel: booking.memberPublicId, summary: "Rescheduled PT booking without changing credit balance", reason: stringValue(input.reason), before, after: { startsAt: utcIso(startsAt), trainerProfileId: trainer.publicId, branchId: publicBranchId(branch) }, branchId: publicBranchId(branch) });
      if (oldTrainer && oldTrainer.userId !== trainer.userId) await insertOperationalNotification(ctx, { recipientUserId: oldTrainer.userId, organizationId: actor.organization._id, branchId: booking.branchId, kind: "pt_booking_reassigned", title: "PT booking reassigned", body: utcIso(booking.startsAt), href: `/pt?booking=${booking.publicId}`, dedupeKey: `pt-reassigned-old:${booking.publicId}:${startsAt}` });
      await insertOperationalNotification(ctx, { recipientUserId: trainer.userId, organizationId: actor.organization._id, branchId: branch._id, kind: "pt_booking_rescheduled", title: "PT booking rescheduled", body: utcIso(startsAt), href: `/pt?booking=${booking.publicId}`, dedupeKey: `pt-reschedule:${booking.publicId}:${startsAt}` });
      const memberRecord = await recordOfOptional(ctx, actor, "member", booking.memberPublicId);
      const member = data(memberRecord?.data);
      await queueOperationalEmail(ctx, { organizationId: actor.organization._id, branchId: branch._id, kind: "pt_booking_update", templateVersion: "pt-booking-rescheduled-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: booking.memberPublicId, recipientEmail: optionalString(member.email), dedupeKey: `pt-booking-rescheduled:${booking.publicId}:${startsAt}` });
      return await ptBookingView(ctx, actor.organization, (await ctx.db.get(booking._id))!);
    }
    case "pt.booking.complete":
    case "pt.booking.no_show": {
      const booking = await ctx.db.query("ptBookings").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", recordId(input.bookingId))).unique();
      if (!booking || (actor.branchScope === "selected" && !actor.branchIds.includes(booking.branchId))) domainError("NOT_FOUND", "PT booking not found.", { correlationId: actor.correlationId });
      if (!["reserved", "confirmed"].includes(booking.status)) domainError("VALIDATION_ERROR", "Only an active PT booking can receive an outcome.", { correlationId: actor.correlationId });
      if (booking.startsAt > Date.now()) domainError("VALIDATION_ERROR", "PT outcomes can only be recorded after the session begins.", { correlationId: actor.correlationId });
      const trainer = await ctx.db.get(booking.trainerProfileId);
      if (trainer?.userId === actor.user._id) requirePermission(actor, "pt.outcome.self"); else requirePermission(actor, "pt.manage");
      const entitlement = await ctx.db.get(booking.entitlementId);
      if (!entitlement) domainError("NOT_FOUND", "PT entitlement not found.", { correlationId: actor.correlationId });
      const status = operation === "pt.booking.complete" ? "completed" : "no_show";
      if (status === "no_show") requireReason(input.reason, actor.correlationId);
      await ctx.db.patch(entitlement._id, { reserved: Math.max(0, entitlement.reserved - 1), consumed: entitlement.consumed + 1, updatedAt: Date.now() });
      await ctx.db.patch(booking._id, { status, outcomeReason: optionalString(input.reason), updatedAt: Date.now() });
      await insertPtLedger(ctx, actor, { entitlementId: entitlement._id, memberPublicId: entitlement.memberPublicId, bookingPublicId: booking.publicId, type: "consume", quantity: -1, reason: status === "completed" ? "PT session completed" : "PT session no-show" });
      await insertTimeline(ctx, actor, { memberId: booking.memberPublicId, type: status === "completed" ? "pt_session_completed" : "pt_session_no_show", title: status === "completed" ? "PT session completed" : "PT session marked no-show", body: optionalString(input.reason), meta: { bookingId: booking.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: `pt.booking.${status}`, entityType: "pt_booking", entityId: booking.publicId, entityLabel: booking.memberPublicId, summary: status === "completed" ? "Completed PT session and consumed credit" : "Recorded PT no-show and consumed credit", reason: optionalString(input.reason), before: { status: booking.status }, after: { status }, branchId: await publicBranchIdFromId(ctx, actor.organization._id, booking.branchId) });
      if (status === "no_show") {
        const memberRecord = await recordOfOptional(ctx, actor, "member", booking.memberPublicId);
        const member = data(memberRecord?.data);
        await queueOperationalEmail(ctx, { organizationId: actor.organization._id, branchId: booking.branchId, kind: "pt_booking_update", templateVersion: "pt-booking-no-show-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: booking.memberPublicId, recipientEmail: optionalString(member.email), dedupeKey: `pt-booking-no-show:${booking.publicId}` });
      }
      const remainingCredits = ptAvailable({ ...entitlement, reserved: Math.max(0, entitlement.reserved - 1), consumed: entitlement.consumed + 1 });
      if (remainingCredits <= 2) {
        const memberRecord = await recordOfOptional(ctx, actor, "member", booking.memberPublicId);
        const member = data(memberRecord?.data);
        await queueOperationalEmail(ctx, { organizationId: actor.organization._id, branchId: booking.branchId, kind: "pt_low_balance", templateVersion: "pt-low-balance-v1", language: stringValue(member.preferredLanguage, "en") === "ar" ? "ar" : "en", recipientReference: booking.memberPublicId, recipientEmail: optionalString(member.email), dedupeKey: `pt-low-balance:${entitlement.publicId}:${remainingCredits}` });
      }
      return await ptBookingView(ctx, actor.organization, (await ctx.db.get(booking._id))!);
    }
    case "memberships.sale": {
      return await createMembershipMutation(ctx, actor, input, undefined, { standardStartDate: todayIn(actor.organization.timezone || TZ_FALLBACK) });
    }
    case "memberships.renew": {
      requirePermission(actor, "memberships.sell");
      const old = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const oldData = data(old.data);
      if (statusOfMembership(oldData, todayIn(actor.organization.timezone || TZ_FALLBACK)) === "cancelled") domainError("MEMBERSHIP_NOT_ACTIVE", "Cancelled memberships cannot be renewed; create a new sale.", { correlationId: actor.correlationId });
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const renewInput: Data = { ...input, memberId: oldData.memberId, planId: input.planId ?? oldData.planId, startDate: input.startDate ?? (stringValue(oldData.endDate) >= today ? addDays(stringValue(oldData.endDate), 1) : today) };
      delete renewInput.membershipId;
      const standardStartDate = stringValue(oldData.endDate) >= today ? addDays(stringValue(oldData.endDate), 1) : today;
      return await createMembershipMutation(ctx, actor, renewInput, old.publicId, { operation: "renewal", standardStartDate });
    }
    case "memberships.plan_change": {
      requirePermission(actor, "memberships.sell");
      requireReason(input.reason, actor.correlationId);
      const old = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const oldData = data(old.data);
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const status = statusOfMembership(oldData, today);
      if (status === "cancelled") domainError("MEMBERSHIP_NOT_ACTIVE", "Cancelled memberships cannot change plans.", { correlationId: actor.correlationId });
      if (stringValue(input.planId) === stringValue(oldData.planId)) domainError("VALIDATION_ERROR", "Choose a different plan.", { correlationId: actor.correlationId });
      const effectiveDate = stringValue(input.effectiveDate, "next_renewal");
      if (effectiveDate !== "next_renewal" && effectiveDate !== "immediate") domainError("VALIDATION_ERROR", "Effective date must be immediate or next renewal.", { correlationId: actor.correlationId });
      if (effectiveDate === "immediate") {
        requirePermission(actor, "memberships.override_dates");
        if (status !== "active" && status !== "expiring") domainError("MEMBERSHIP_NOT_ACTIVE", "Immediate plan changes require an active membership.", { correlationId: actor.correlationId });
      }
      const changeInput: Data = {
        ...input,
        memberId: oldData.memberId,
        planId: input.planId,
        startDate: effectiveDate === "immediate" ? today : stringValue(oldData.endDate) >= today ? addDays(stringValue(oldData.endDate), 1) : today,
      };
      delete changeInput.membershipId;
      delete changeInput.effectiveDate;
      const result = await createMembershipMutation(ctx, actor, changeInput, old.publicId, { operation: "plan_change", reason: stringValue(input.reason), previousPlanId: oldData.planId, effectiveDate });
      if (effectiveDate === "immediate") {
        await patchRecord(ctx, actor, old, {
          cancelledAt: isoNow(),
          cancellationReason: `Superseded by plan change: ${stringValue(input.reason)}`,
          adjustments: [...arrayValue(oldData.adjustments), { id: newPublicId(), membershipId: old.publicId, type: "plan_change", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { planId: oldData.planId, endDate: oldData.endDate }, after: { planId: input.planId, successorMembershipId: data(result.membership).id }, approvalStatus: "not_required", createdAt: isoNow() }],
        });
        await revokeUnusedIncludedPtCredits(ctx, actor, old.publicId, `Superseded by immediate plan change: ${stringValue(input.reason)}`);
      }
      return result;
    }
    case "memberships.freeze": {
      requirePermission(actor, "memberships.freeze");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      let value = data(record.data);
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const previousFreeze = data(value.activeFreeze);
      if (previousFreeze.status === "active") {
        if (stringValue(previousFreeze.endDate) >= today) domainError("CONFLICT", "This membership already has a scheduled or active freeze.", { correlationId: actor.correlationId });
        const used = diffDays(stringValue(previousFreeze.startDate), stringValue(previousFreeze.endDate)) + 1;
        value = await patchRecord(ctx, actor, record, { activeFreeze: undefined, frozenDaysUsed: numberValue(value.frozenDaysUsed) + Math.max(0, used), freezes: arrayValue(value.freezes).map((item) => data(item).id === previousFreeze.id ? { ...data(item), status: "completed" } : item) });
      }
      const status = statusOfMembership(value, today);
      if (!(status === "active" || status === "expiring")) domainError("MEMBERSHIP_NOT_ACTIVE", `Cannot freeze a membership in “${status}” state.`, { correlationId: actor.correlationId });
      const plan = await recordOf(ctx, actor, "plan", stringValue(value.planId));
      const planData = data(plan.data);
      const freezeStartDate = stringValue(input.startDate);
      const freezeEndDate = stringValue(input.endDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(freezeStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(freezeEndDate)) domainError("VALIDATION_ERROR", "Freeze dates must be calendar dates.", { correlationId: actor.correlationId });
      if (freezeStartDate < today) domainError("VALIDATION_ERROR", "A freeze cannot begin before today.", { correlationId: actor.correlationId });
      if (freezeStartDate > stringValue(value.endDate)) domainError("VALIDATION_ERROR", "A freeze must begin during the current membership term.", { correlationId: actor.correlationId });
      const days = diffDays(freezeStartDate, freezeEndDate) + 1;
      if (days <= 0) domainError("VALIDATION_ERROR", "Freeze end must be on or after the start date.", { correlationId: actor.correlationId });
      const minimumFreezeDays = numberValue(data(data((await settingsData(ctx, actor)).operationalPolicies).membership).minimumFreezeDays, 1);
      if (days < minimumFreezeDays) domainError("VALIDATION_ERROR", `A freeze must be at least ${minimumFreezeDays} day${minimumFreezeDays === 1 ? "" : "s"}.`, { correlationId: actor.correlationId });
      const allowance = numberValue(planData.freezeAllowanceDays) - numberValue(value.frozenDaysUsed);
      if (days > allowance) domainError("FREEZE_ALLOWANCE_EXCEEDED", `This plan allows ${numberValue(planData.freezeAllowanceDays)} freeze days total; ${Math.max(0, allowance)} remain.`, { correlationId: actor.correlationId });
      const freeze = { id: newPublicId(), membershipId: record.publicId, startDate: freezeStartDate, endDate: freezeEndDate, status: "active", reason: stringValue(input.reason), createdById: publicUserId(actor.user), createdAt: isoNow() };
      const newEndDate = addDays(stringValue(value.endDate), days);
      const adjustment = { id: newPublicId(), membershipId: record.publicId, type: "freeze", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { endDate: value.endDate }, after: { endDate: newEndDate }, approvalStatus: "not_required", createdAt: isoNow() };
      const updated = await patchRecord(ctx, actor, record, { activeFreeze: freeze, freezes: [...arrayValue(value.freezes), freeze], endDate: newEndDate, adjustments: [...arrayValue(value.adjustments), adjustment] });
      await insertTimeline(ctx, actor, { memberId: value.memberId, type: "membership_frozen", title: `Membership frozen ${freeze.startDate} → ${freeze.endDate}`, body: freeze.reason, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.freeze", entityType: "membership", entityId: record.publicId, entityLabel: stringValue(value.memberId), summary: `Frozen ${days} day${days === 1 ? "" : "s"}`, reason: stringValue(input.reason), before: { endDate: value.endDate }, after: { endDate: newEndDate }, branchId: stringValue(value.homeBranchId) });
      return await toMembershipDetail(ctx, actor, updated);
    }
    case "memberships.unfreeze": {
      requirePermission(actor, "memberships.freeze");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const value = data(record.data);
      const freeze = data(value.activeFreeze);
      if (freeze.status !== "active") domainError("NOT_FOUND", "No active freeze on this membership.", { correlationId: actor.correlationId });
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      if (stringValue(freeze.startDate) > today || stringValue(freeze.endDate) < today) domainError("VALIDATION_ERROR", "Only a freeze currently in progress can be ended early.", { correlationId: actor.correlationId });
      const plannedDays = diffDays(stringValue(freeze.startDate), stringValue(freeze.endDate)) + 1;
      const usedDays = Math.max(1, diffDays(stringValue(freeze.startDate), today) + 1);
      const unusedDays = Math.max(0, plannedDays - usedDays);
      const newEndDate = addDays(stringValue(value.endDate), -unusedDays);
      const completed = { ...freeze, status: "completed", endDate: today };
      const adjustment = { id: newPublicId(), membershipId: record.publicId, type: "unfreeze", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { endDate: value.endDate }, after: { endDate: newEndDate }, approvalStatus: "not_required", createdAt: isoNow() };
      const updated = await patchRecord(ctx, actor, record, { activeFreeze: undefined, freezes: arrayValue(value.freezes).map((item) => data(item).id === freeze.id ? completed : item), frozenDaysUsed: numberValue(value.frozenDaysUsed) + usedDays, endDate: newEndDate, adjustments: [...arrayValue(value.adjustments), adjustment] });
      await insertTimeline(ctx, actor, { memberId: value.memberId, type: "membership_unfrozen", title: "Freeze ended early", body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.unfreeze", entityType: "membership", entityId: record.publicId, entityLabel: stringValue(value.memberId), summary: "Freeze ended early", reason: stringValue(input.reason), before: { endDate: value.endDate }, after: { endDate: newEndDate }, branchId: stringValue(value.homeBranchId) });
      return await toMembershipDetail(ctx, actor, updated);
    }
    case "memberships.extend": {
      requirePermission(actor, "memberships.override_dates");
      requireReason(input.reason, actor.correlationId);
      const days = numberValue(input.days);
      const maximumExtensionDays = numberValue(data(data((await settingsData(ctx, actor)).operationalPolicies).membership).maximumExtensionDays, 365);
      if (days <= 0 || days > maximumExtensionDays) domainError("VALIDATION_ERROR", `Extension must be between 1 and ${maximumExtensionDays} days.`, { correlationId: actor.correlationId });
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const value = data(record.data);
      const newEndDate = addDays(stringValue(value.endDate), days);
      const adjustment = { id: newPublicId(), membershipId: record.publicId, type: "extension", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { endDate: value.endDate }, after: { endDate: newEndDate }, approvalStatus: "not_required", createdAt: isoNow() };
      const updated = await patchRecord(ctx, actor, record, { endDate: newEndDate, adjustments: [...arrayValue(value.adjustments), adjustment] });
      await insertTimeline(ctx, actor, { memberId: value.memberId, type: "membership_extended", title: `Membership extended by ${days} day${days === 1 ? "" : "s"}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.date_override", entityType: "membership", entityId: record.publicId, entityLabel: stringValue(value.memberId), summary: `Extended ${days} days`, reason: stringValue(input.reason), before: { endDate: value.endDate }, after: { endDate: newEndDate }, branchId: stringValue(value.homeBranchId) });
      return await toMembershipDetail(ctx, actor, updated);
    }
    case "memberships.cancel": {
      requirePermission(actor, "memberships.freeze");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const value = data(record.data);
      if (value.cancelledAt) domainError("VALIDATION_ERROR", "Membership is already cancelled.", { correlationId: actor.correlationId });
      const adjustment = { id: newPublicId(), membershipId: record.publicId, type: "cancellation", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { status: value.status ?? "active" }, after: { status: "cancelled" }, approvalStatus: "not_required", createdAt: isoNow() };
      const updated = await patchRecord(ctx, actor, record, { cancelledAt: isoNow(), cancellationReason: stringValue(input.reason), activeFreeze: undefined, adjustments: [...arrayValue(value.adjustments), adjustment] });
      if (statusOfMembership(value, todayIn(actor.organization.timezone || TZ_FALLBACK)) === "scheduled") {
        const futureCharge = (await chargeRecords(ctx, actor)).find((candidate) => data(candidate.data).membershipId === record.publicId);
        if (futureCharge && amountOf(data(futureCharge.data).paidAmount) === 0) {
          await patchRecord(ctx, actor, futureCharge, { status: "void", outstandingAmount: money(0, actor.organization.currency), voidReason: stringValue(input.reason), voidedAt: isoNow() });
        }
      }
      await insertTimeline(ctx, actor, { memberId: value.memberId, type: "membership_cancelled", title: "Membership cancelled", body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.cancel", entityType: "membership", entityId: record.publicId, entityLabel: stringValue(value.memberId), summary: "Membership cancelled", reason: stringValue(input.reason), before: { status: value.status ?? "active" }, after: { status: "cancelled" }, branchId: stringValue(value.homeBranchId) });
      return await toMembershipDetail(ctx, actor, updated);
    }
    case "memberships.transfer": {
      requirePermission(actor, "memberships.override_dates");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const value = data(record.data);
      const status = statusOfMembership(value, todayIn(actor.organization.timezone || TZ_FALLBACK));
      if (["cancelled", "expired", "depleted"].includes(status) || (value.status !== undefined && stringValue(value.status) !== "active")) domainError("MEMBERSHIP_NOT_ACTIVE", `Cannot transfer a membership in “${status}” state.`, { correlationId: actor.correlationId });
      const member = await recordOf(ctx, actor, "member", stringValue(value.memberId));
      const memberValue = data(member.data);
      if (["inactive", "archived"].includes(stringValue(memberValue.status))) domainError("MEMBERSHIP_NOT_ACTIVE", "Cannot transfer a membership for an inactive member.", { correlationId: actor.correlationId });
      const destinationBranchId = recordId(input.branchId);
      const destination = await branchByPublicId(ctx, actor.organization._id, destinationBranchId);
      assertBranchAccess(actor, destination);
      if (!destination || !destination.active || destination.status === "inactive") domainError("NOT_FOUND", "Destination branch not found or inactive.", { correlationId: actor.correlationId });
      const idempotencyKey = optionalString(input.idempotencyKey);
      const requestHash = idempotencyKey ? JSON.stringify({ membershipId: record.publicId, branchId: destinationBranchId, reason: stringValue(input.reason) }) : undefined;
      if (idempotencyKey && requestHash) {
        const existing = await ctx.db
          .query("idempotencyRecords")
          .withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "membership.transfer").eq("key", idempotencyKey))
          .unique();
        if (existing) {
          if (existing.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different membership transfer.", { correlationId: actor.correlationId });
          return await toMembershipDetail(ctx, actor, data(record.data));
        }
      }
      const previousBranchId = stringValue(value.homeBranchId);
      if (previousBranchId === destinationBranchId) domainError("VALIDATION_ERROR", "Membership is already assigned to this branch.", { correlationId: actor.correlationId });
      const plan = await recordOf(ctx, actor, "plan", stringValue(value.planId));
      const planData = data(plan.data);
      if (stringValue(planData.branchAccess, "all") === "selected" && !arrayValue(planData.branchIds).map(String).includes(destinationBranchId)) {
        domainError("VALIDATION_ERROR", "This membership plan is not available at the destination branch.", { correlationId: actor.correlationId });
      }
      const adjustment = { id: newPublicId(), membershipId: record.publicId, type: "branch_transfer", reason: stringValue(input.reason), actorId: publicUserId(actor.user), before: { branchId: previousBranchId }, after: { branchId: destinationBranchId }, approvalStatus: "not_required", createdAt: isoNow() };
      const nextValue = { ...value, homeBranchId: destinationBranchId, adjustments: [...arrayValue(value.adjustments), adjustment] };
      await ctx.db.patch(record._id, { branchId: destination._id, data: nextValue, updatedAt: Date.now() });
      if (stringValue(memberValue.homeBranchId) === previousBranchId) {
        await ctx.db.patch(member._id, { branchId: destination._id, data: { ...memberValue, homeBranchId: destinationBranchId }, updatedAt: Date.now() });
      }
      const previousBranch = await branchByPublicId(ctx, actor.organization._id, previousBranchId);
      await insertTimeline(ctx, actor, { memberId: value.memberId, branchId: destinationBranchId, type: "membership_transferred", title: `Membership transferred to ${destination.name}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId, previousBranchId, branchId: destinationBranchId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.branch_transfer", entityType: "membership", entityId: record.publicId, entityLabel: `${memberValue.fullName} · ${memberValue.memberNumber}`, summary: `Transferred ${previousBranch?.name ?? "branch"} → ${destination.name}`, reason: stringValue(input.reason), before: { branchId: previousBranchId }, after: { branchId: destinationBranchId }, branchId: destinationBranchId });
      if (idempotencyKey && requestHash) {
        await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "membership.transfer", key: idempotencyKey, requestHash, result: { membershipId: record.publicId }, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 * 365 });
      }
      return await toMembershipDetail(ctx, actor, nextValue);
    }
    case "leads.create": {
      requirePermission(actor, "crm.write");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const fullName = normalizedLeadName(input.fullName, actor);
      const phone = normalizedLeadPhone(input.phone, actor);
      const email = normalizedLeadEmail(input.email, actor);
      const requestedOwnerId = input.ownerId === undefined ? undefined : input.ownerId === "unassigned" ? "unassigned" : recordId(input.ownerId);
      const ownerId: string | undefined = requestedOwnerId === "unassigned" ? undefined : requestedOwnerId ?? publicUserId(actor.user);
      if (ownerId && ownerId !== publicUserId(actor.user)) requirePermission(actor, "crm.assign");
      if (ownerId) await assertLeadOwner(ctx, actor, ownerId);
      const lead = await insertRecord(ctx, actor, "lead", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), branchId, fullName, phone, email, stage: "new", source: stringValue(input.source, "other"), ownerId, expectedValue: input.expectedValue ? { amount: amountOf(input.expectedValue), currency: actor.organization.currency } : undefined, nextFollowUpAt: optionalString(input.nextFollowUpAt), notes: optionalString(input.notes), createdAt: isoNow(), updatedAt: isoNow() }, { branchId });
      await insertTimeline(ctx, actor, { leadId: lead.id, branchId, type: "member_created", title: "Lead captured", body: optionalString(input.notes), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return { ...(await toLeadSummary(ctx, actor, lead)), notes: optionalString(lead.notes), activities: [], offers: [] };
    }
    case "leads.update": {
      requirePermission(actor, "crm.write");
      const record = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const current = data(record.data);
      const patch: Data = { ...input, updatedAt: isoNow() };
      delete patch.leadId;
      if (Object.prototype.hasOwnProperty.call(input, "ownerId")) {
        const requestedOwnerId = input.ownerId === "unassigned" ? undefined : recordId(input.ownerId);
        if (requestedOwnerId && requestedOwnerId !== current.ownerId) requirePermission(actor, "crm.assign");
        if (requestedOwnerId) await assertLeadOwner(ctx, actor, requestedOwnerId);
        patch.ownerId = requestedOwnerId;
      }
      const updated = await patchRecord(ctx, actor, record, patch);
      return { ...(await toLeadSummary(ctx, actor, updated)), notes: optionalString(updated.notes), activities: [], offers: [] };
    }
    case "leads.update_contact": {
      requirePermission(actor, "crm.write");
      const record = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const current = data(record.data);
      const fullName = normalizedLeadName(input.fullName, actor);
      const phone = normalizedLeadPhone(input.phone, actor);
      const email = normalizedLeadEmail(input.email, actor);
      const currentEmail = typeof current.email === "string" ? current.email.trim().toLowerCase() || null : null;
      const before = { fullName: stringValue(current.fullName), phone: stringValue(current.phone), email: currentEmail };
      const after = { fullName, phone, email: email ?? null };
      const changedFields = Object.entries(after).filter(([field, value]) => before[field as keyof typeof before] !== value).map(([field]) => field);
      if (changedFields.length === 0) {
        const activities = (await recordsOf(ctx, actor, "timeline")).map((item) => data(item.data)).filter((event) => event.leadId === record.publicId);
        const offers = (await recordsOf(ctx, actor, "offer")).map((item) => offerProjection(data(item.data))).filter((offer) => offer.leadId === record.publicId);
        return { ...(await toLeadSummary(ctx, actor, current)), notes: optionalString(current.notes), activities, offers };
      }
      const updated = await patchRecord(ctx, actor, record, { fullName, phone, email, updatedAt: isoNow() });
      await insertAudit(ctx, actor, { category: "crm", action: "lead.contact.update", entityType: "lead", entityId: record.publicId, entityLabel: fullName, summary: "Lead contact details corrected", before, after, branchId: optionalString(current.branchId) });
      await insertTimeline(ctx, actor, { leadId: record.publicId, branchId: optionalString(current.branchId), type: "lead_contact_updated", title: "Lead contact details corrected", body: "Contact details were updated; pipeline status was unchanged.", actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { fields: changedFields.join(",") } });
      const activities = (await recordsOf(ctx, actor, "timeline")).map((item) => data(item.data)).filter((event) => event.leadId === record.publicId);
      const offers = (await recordsOf(ctx, actor, "offer")).map((item) => offerProjection(data(item.data))).filter((offer) => offer.leadId === record.publicId);
      return { ...(await toLeadSummary(ctx, actor, updated)), notes: optionalString(updated.notes), activities, offers };
    }
    case "leads.contact": {
      requirePermission(actor, "crm.write");
      const record = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const current = data(record.data);
      const updatedLead = await patchRecord(ctx, actor, record, { ...(input.stage ? { stage: input.stage } : { stage: current.stage === "new" ? "attempted" : current.stage }), ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt || undefined } : {}), updatedAt: isoNow() });
      await insertTimeline(ctx, actor, { leadId: record.publicId, branchId: current.branchId, type: "call_attempt", title: `Call — ${stringValue(input.outcome).replaceAll("_", " ")}`, body: optionalString(input.notes), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { outcome: input.outcome } });
      const activities = (await recordsOf(ctx, actor, "timeline")).map((item) => data(item.data)).filter((event) => event.leadId === record.publicId);
      return { ...(await toLeadSummary(ctx, actor, updatedLead)), notes: optionalString(updatedLead.notes), activities, offers: [] };
    }
    case "trials.schedule_for_lead": {
      requirePermission(actor, "crm.write");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const leadValue = data(lead.data);
      if (["won", "lost"].includes(stringValue(leadValue.stage))) domainError("VALIDATION_ERROR", "Closed leads cannot be scheduled for a trial.", { correlationId: actor.correlationId });
      if (await linkedTrialBooking(ctx, actor, lead.publicId)) domainError("CONFLICT", "This lead already has a trial.", { correlationId: actor.correlationId });
      const branchId = stringValue(leadValue.branchId);
      const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
      assertBranchAccess(actor, branch);
      if (!branch || !branch.active || branch.status === "inactive") domainError("NOT_FOUND", "The lead's branch is not active.", { correlationId: actor.correlationId });

      const preferredDate = stringValue(input.preferredDate);
      const preferredTime = stringValue(input.preferredTime);
      const weekday = validatedWeekdayForDate(preferredDate);
      if (!weekday || !TIME_PATTERN.test(preferredTime)) domainError("VALIDATION_ERROR", "Choose a valid trial date and time.", { correlationId: actor.correlationId });
      const settings = await settingsData(ctx, actor);
      const schedule = arrayValue(data(data(settings).operationalPolicies).trialSchedules).map(data).find((candidate) => candidate.branchId === branchId);
      if (!schedule) domainError("VALIDATION_ERROR", "Trial scheduling is not configured for this branch yet.", { correlationId: actor.correlationId });
      const trialWindow = normalizedTrialWindow(data(data(schedule.days)[weekday]));
      if (!booleanValue(trialWindow.enabled) || preferredTime < stringValue(trialWindow.opensAt) || preferredTime > stringValue(trialWindow.closesAt)) {
        domainError("CONFLICT", "That trial time is outside this branch's trial hours.", { correlationId: actor.correlationId });
      }
      const [hour = 0, minute = 0] = preferredTime.split(":").map(Number);
      const requestedAt = ptWallTime(preferredDate, hour * 60 + minute, actor.organization.timezone || TZ_FALLBACK);
      if (requestedAt <= Date.now()) domainError("VALIDATION_ERROR", "Choose a future trial time.", { correlationId: actor.correlationId });

      const booking = await insertRecord(ctx, actor, "trialBooking", {
        id: newPublicId(),
        organizationId: publicOrganizationId(actor.organization),
        gymId: publicOrganizationId(actor.organization),
        branchId,
        leadId: lead.publicId,
        fullName: stringValue(leadValue.fullName),
        email: optionalString(leadValue.email) ?? "",
        phone: stringValue(leadValue.phone),
        preferredDate,
        preferredTime,
        goal: optionalString(input.goal) ?? "Gym trial",
        status: "confirmed",
        createdAt: isoNow(),
        updatedAt: isoNow(),
      }, { branchId, leadPublicId: lead.publicId });
      const updatedLead = await patchRecord(ctx, actor, lead, { stage: "trial_booked", nextFollowUpAt: utcIso(requestedAt), updatedAt: isoNow() });
      await insertTimeline(ctx, actor, { leadId: lead.publicId, branchId, type: "trial_confirmed", title: "Trial scheduled", body: `${preferredDate} · ${preferredTime}${optionalString(input.goal) ? ` · ${optionalString(input.goal)}` : ""}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { bookingId: booking.id } });
      await insertAudit(ctx, actor, { category: "crm", action: "trial.scheduled", entityType: "trial_booking", entityId: booking.id, entityLabel: `${stringValue(leadValue.fullName)} · ${preferredDate} ${preferredTime}`, summary: "Trial scheduled by staff", branchId });
      const activities = (await recordsOf(ctx, actor, "timeline")).map((item) => data(item.data)).filter((event) => event.leadId === lead.publicId);
      const offers = (await recordsOf(ctx, actor, "offer")).map((item) => offerProjection(data(item.data))).filter((offer) => offer.leadId === lead.publicId);
      return { ...(await toLeadSummary(ctx, actor, updatedLead)), notes: optionalString(updatedLead.notes), activities, offers, trialBooking: booking };
    }
    case "trials.update": {
      requirePermission(actor, "crm.write");
      const booking = await recordOf(ctx, actor, "trialBooking", recordId(input.bookingId));
      const current = data(booking.data);
      const currentStatus = stringValue(current.status, "requested");
      const nextStatus = stringValue(input.status);
      if (!trialTransitionAllowed(currentStatus, nextStatus)) domainError("VALIDATION_ERROR", `Trial cannot move from ${currentStatus.replaceAll("_", " ")} to ${nextStatus.replaceAll("_", " ")}.`, { correlationId: actor.correlationId });
      const note = optionalString(input.note);
      if ((nextStatus === "no_show" || nextStatus === "cancelled") && !note) domainError("VALIDATION_ERROR", "Record a reason for this trial outcome.", { correlationId: actor.correlationId });
      const leadId = optionalString(current.leadId);
      if (!leadId) domainError("NOT_FOUND", "This trial is not linked to a lead.", { correlationId: actor.correlationId });
      const lead = await recordOf(ctx, actor, "lead", leadId);
      const leadValue = data(lead.data);
      const occurredAt = isoNow();
      const labels: Record<string, string> = { confirmed: "Trial confirmed", completed: "Trial completed", no_show: "Trial marked as no-show", cancelled: "Trial cancelled" };
      const eventTypes: Record<string, string> = { confirmed: "trial_confirmed", completed: "trial_completed", no_show: "trial_no_show", cancelled: "trial_cancelled" };
      const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
      const leadPatch: Data = nextStatus === "completed"
        ? { stage: "trial_completed", nextFollowUpAt: followUpAt, updatedAt: occurredAt }
        : nextStatus === "cancelled"
          ? { stage: "lost", lostReason: `Trial cancelled${note ? ` — ${note}` : ""}`, nextFollowUpAt: undefined, updatedAt: occurredAt }
          : nextStatus === "no_show"
            ? { stage: "contacted", nextFollowUpAt: followUpAt, updatedAt: occurredAt }
            : { stage: "trial_booked", updatedAt: occurredAt };
      const updatedBooking = await patchRecord(ctx, actor, booking, { status: nextStatus, updatedAt: occurredAt });
      const updatedLead = await patchRecord(ctx, actor, lead, leadPatch);
      await insertTimeline(ctx, actor, { leadId, branchId: optionalString(leadValue.branchId), type: eventTypes[nextStatus], title: labels[nextStatus], body: note, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { bookingId: booking.publicId, status: nextStatus } });
      if (nextStatus === "completed" || nextStatus === "no_show") {
        const existing = (await recordsOf(ctx, actor, "task")).find((record) => {
          const task = data(record.data);
          return task.leadId === leadId && task.type === "trial_follow_up" && task.status === "open";
        });
        if (!existing) await createTaskMutation(ctx, actor, { leadId, type: "trial_follow_up", title: nextStatus === "no_show" ? "Reschedule missed trial" : "Follow up after trial", ownerId: optionalString(leadValue.ownerId) ?? publicUserId(actor.user), dueAt: followUpAt, priority: nextStatus === "no_show" ? "high" : "normal" });
      }
      await insertAudit(ctx, actor, { category: "crm", action: `trial.${nextStatus}`, entityType: "trial_booking", entityId: booking.publicId, entityLabel: `${stringValue(current.fullName)} · ${stringValue(current.preferredDate)} ${stringValue(current.preferredTime)}`, summary: stringValue(labels[nextStatus]), reason: note, before: { status: currentStatus }, after: { status: nextStatus }, branchId: optionalString(leadValue.branchId) });
      await queueOperationalEmail(ctx, {
        organizationId: actor.organization._id,
        branchId: booking.branchId,
        kind: "trial_status",
        templateVersion: `trial-${nextStatus}-v1`,
        language: stringValue(current.preferredLanguage, "en") === "ar" ? "ar" : "en",
        recipientReference: stringValue(current.customerUserId, booking.publicId),
        recipientEmail: optionalString(current.email) ?? optionalString(leadValue.email),
        dedupeKey: `trial-status:${booking.publicId}:${nextStatus}`,
      });
      const customerUserId = optionalString(current.customerUserId);
      const customerUser = customerUserId ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", customerUserId)).unique() : null;
      if (customerUser && customerUser.status !== "deactivated") {
        await insertOperationalNotification(ctx, {
          recipientUserId: customerUser._id,
          organizationId: actor.organization._id,
          branchId: booking.branchId,
          kind: "trial_status",
          title: stringValue(labels[nextStatus]),
          body: `${actor.organization.name} · ${stringValue(current.preferredDate)} ${stringValue(current.preferredTime)}`,
          href: "/customer/my-gyms",
          dedupeKey: `trial-status:${booking.publicId}:${nextStatus}`,
        });
      }
      const activities = (await recordsOf(ctx, actor, "timeline")).map((item) => data(item.data)).filter((event) => event.leadId === leadId);
      const offers = (await recordsOf(ctx, actor, "offer")).map((item) => offerProjection(data(item.data))).filter((offer) => offer.leadId === leadId);
      return { ...(await toLeadSummary(ctx, actor, updatedLead)), notes: optionalString(updatedLead.notes), activities, offers, trialBooking: updatedBooking };
    }
    case "offers.create": {
      requirePermission(actor, "crm.write");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const plan = await recordOf(ctx, actor, "plan", recordId(input.planId));
      const offer = await insertRecord(ctx, actor, "offer", { id: newPublicId(), leadId: lead.publicId, planId: plan.publicId, planName: stringValue(data(plan.data).name), price: { amount: amountOf(input.price), currency: actor.organization.currency }, expiresAt: input.expiresInDays ? new Date(Date.now() + numberValue(input.expiresInDays) * 86_400_000).toISOString() : undefined, status: "draft", createdById: publicUserId(actor.user), createdAt: isoNow() }, { branchId: optionalString(data(lead.data).branchId), leadPublicId: lead.publicId });
      await insertTimeline(ctx, actor, { leadId: lead.publicId, branchId: optionalString(data(lead.data).branchId), type: "offer_drafted", title: `Offer drafted — ${stringValue(data(plan.data).name)}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { offerId: offer.id } });
      return offer;
    }
    case "offers.deliver": {
      requirePermission(actor, "crm.write");
      const offerRecord = await recordOf(ctx, actor, "offer", recordId(input.offerId));
      const current = data(offerRecord.data);
      if (stringValue(current.status, "draft") !== "draft") domainError("CONFLICT", "This offer has already been delivered or closed.", { correlationId: actor.correlationId });
      const channel = stringValue(input.channel);
      if (!["email", "whatsapp", "sms", "manual"].includes(channel)) domainError("VALIDATION_ERROR", "Choose a valid delivery channel.", { correlationId: actor.correlationId, fieldErrors: { channel: ["Choose a valid delivery channel"] } });
      const leadId = optionalString(current.leadId);
      if (!leadId) domainError("NOT_FOUND", "Offer not found.", { correlationId: actor.correlationId });
      const lead = await recordOf(ctx, actor, "lead", leadId);
      const leadData = data(lead.data);
      const email = optionalString(leadData.email);
      const phone = optionalString(leadData.phone);
      if ((channel === "email" && !email) || ((channel === "whatsapp" || channel === "sms") && !phone)) {
        domainError("VALIDATION_ERROR", `This lead has no ${channel === "email" ? "email address" : "phone number"} to record delivery against.`, { correlationId: actor.correlationId });
      }
      const deliveredAt = isoNow();
      const reference = typeof input.reference === "string" ? input.reference.trim() : undefined;
      const updated = await patchRecord(ctx, actor, offerRecord, { status: "sent", deliveryChannel: channel, deliveredAt, deliveredById: publicUserId(actor.user), deliveryReference: reference || undefined });
      await patchRecord(ctx, actor, lead, { stage: "offer_sent", updatedAt: deliveredAt });
      await insertTimeline(ctx, actor, { leadId, branchId: optionalString(leadData.branchId), type: "offer_sent", title: `Offer delivery confirmed — ${stringValue(current.planName)}`, body: `${channel === "manual" ? "Manual delivery" : channel} confirmed${reference ? ` · ${reference}` : ""}.`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { offerId: offerRecord.publicId, channel } });
      await insertAudit(ctx, actor, { category: "crm", action: "offer.delivered", entityType: "offer", entityId: offerRecord.publicId, entityLabel: `${stringValue(current.planName)} · ${stringValue(leadData.fullName)}`, summary: `Offer delivery confirmed via ${channel}`, reason: reference || `Manual ${channel} delivery confirmation`, before: { status: "draft" }, after: { status: "sent", deliveryChannel: channel }, branchId: optionalString(leadData.branchId) });
      return updated;
    }
    case "offers.respond": {
      requirePermission(actor, "crm.write");
      const offerRecord = await recordOf(ctx, actor, "offer", recordId(input.offerId));
      const current = data(offerRecord.data);
      if (stringValue(current.status) !== "sent") domainError("CONFLICT", "Only a delivered offer can receive an outcome.", { correlationId: actor.correlationId });
      const expiresAt = optionalString(current.expiresAt);
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        domainError("CONFLICT", "This offer has expired.", { correlationId: actor.correlationId });
      }
      const outcome = stringValue(input.outcome);
      if (outcome !== "accepted" && outcome !== "declined") domainError("VALIDATION_ERROR", "Choose a valid offer outcome.", { correlationId: actor.correlationId });
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (outcome === "declined" && reason.length < 3) domainError("VALIDATION_ERROR", "Record why the offer was declined.", { correlationId: actor.correlationId, fieldErrors: { reason: ["Record why the offer was declined"] } });
      const leadId = optionalString(current.leadId);
      if (!leadId) domainError("NOT_FOUND", "Offer not found.", { correlationId: actor.correlationId });
      const lead = await recordOf(ctx, actor, "lead", leadId);
      const leadData = data(lead.data);
      const respondedAt = isoNow();
      const updated = await patchRecord(ctx, actor, offerRecord, { status: outcome, respondedAt, respondedById: publicUserId(actor.user), responseReason: reason || undefined });
      if (outcome === "declined") await patchRecord(ctx, actor, lead, { stage: "contacted", nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(), updatedAt: respondedAt });
      else await patchRecord(ctx, actor, lead, { updatedAt: respondedAt });
      await insertTimeline(ctx, actor, { leadId, branchId: optionalString(leadData.branchId), type: outcome === "accepted" ? "offer_accepted" : "offer_declined", title: `Offer ${outcome} — ${stringValue(current.planName)}`, body: reason || undefined, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { offerId: offerRecord.publicId, outcome } });
      await insertAudit(ctx, actor, { category: "crm", action: `offer.${outcome}`, entityType: "offer", entityId: offerRecord.publicId, entityLabel: `${stringValue(current.planName)} · ${stringValue(leadData.fullName)}`, summary: `Offer ${outcome}`, reason: reason || undefined, before: { status: "sent" }, after: { status: outcome }, branchId: optionalString(leadData.branchId) });
      return updated;
    }
    case "tasks.create":
      return await createTaskMutation(ctx, actor, input);
    case "tasks.complete": {
      requirePermission(actor, "crm.write");
      const record = await recordOf(ctx, actor, "task", recordId(input.taskId));
      const value = data(record.data);
      const updated = await patchRecord(ctx, actor, record, { status: "completed", outcome: stringValue(input.outcome), completedAt: isoNow() });
      if (value.memberId) await insertTimeline(ctx, actor, { memberId: value.memberId, type: "task_completed", title: `Task completed: ${value.title}`, body: stringValue(input.outcome), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return await toTask(ctx, actor, updated);
    }
    case "leads.complete_sale": {
      requirePermission(actor, "crm.write");
      requirePermission(actor, "members.write");
      requirePermission(actor, "memberships.sell");

      const leadId = recordId(input.leadId);
      const idempotencyKey = recordId(input.idempotencyKey);
      const requestHash = JSON.stringify({ ...input, idempotencyKey });
      const existingIdempotency = await ctx.db
        .query("idempotencyRecords")
        .withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "lead.complete_sale").eq("key", idempotencyKey))
        .unique();
      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This sale key was already used for a different lead sale.", { correlationId: actor.correlationId });
        const stored = data(existingIdempotency.result);
        const memberRecord = await recordOf(ctx, actor, "member", stringValue(stored.memberId));
        const planRecord = await recordOf(ctx, actor, "plan", stringValue(stored.planId));
        const membershipRecord = await recordOf(ctx, actor, "membership", stringValue(stored.membershipId));
        const chargeRecord = await recordOf(ctx, actor, "charge", stringValue(stored.chargeId));
        return {
          member: await toMemberDetail(ctx, actor, data(memberRecord.data)),
          plan: await toPlan(ctx, actor, data(planRecord.data)),
          membership: await toMembership(ctx, actor, data(membershipRecord.data)),
          charge: data(chargeRecord.data),
        };
      }

      const lead = await recordOf(ctx, actor, "lead", leadId);
      const leadData = data(lead.data);
      if (leadData.stage === "won" && leadData.convertedMemberId) domainError("VALIDATION_ERROR", "Lead was already converted.", { correlationId: actor.correlationId });
      const trialBooking = await linkedTrialBooking(ctx, actor, lead.publicId);
      if (!trialBooking || stringValue(data(trialBooking.data).status) !== "completed") {
        domainError("VALIDATION_ERROR", "Complete the trial before recording a successful membership sale.", { correlationId: actor.correlationId });
      }

      const selection = data(input.membership);
      const mode = stringValue(selection.mode);
      let planRecord: DomainRecord;
      if (mode === "existing") {
        planRecord = await recordOf(ctx, actor, "plan", recordId(selection.planId));
      } else if (mode === "custom") {
        const name = stringValue(selection.name).trim();
        const durationDays = numberValue(selection.durationDays);
        const includedPtSessions = numberValue(selection.includedPtSessions);
        const price = amountOf(selection.price);
        if (name.length < 2 || name.length > 80) domainError("VALIDATION_ERROR", "Custom membership name must be between 2 and 80 characters.", { correlationId: actor.correlationId, fieldErrors: { name: ["Enter a membership name"] } });
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 730) domainError("VALIDATION_ERROR", "Membership duration must be between 1 and 730 days.", { correlationId: actor.correlationId, fieldErrors: { durationDays: ["Enter 1 to 730 days"] } });
        if (!Number.isInteger(includedPtSessions) || includedPtSessions < 0 || includedPtSessions > 100) domainError("VALIDATION_ERROR", "Included PT sessions must be between 0 and 100.", { correlationId: actor.correlationId, fieldErrors: { includedPtSessions: ["Enter 0 to 100 sessions"] } });
        if (!Number.isInteger(price) || price < 0) domainError("VALIDATION_ERROR", "Membership price must be zero or greater.", { correlationId: actor.correlationId, fieldErrors: { price: ["Enter a valid price"] } });
        const homeBranchId = recordId(input.homeBranchId);
        assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, homeBranchId));
        const publicId = newPublicId();
        const plan = await insertRecord(ctx, actor, "plan", {
          id: publicId,
          organizationId: publicOrganizationId(actor.organization),
          name,
          code: `CRM-${publicId.slice(0, 8).toUpperCase()}`,
          kind: "time",
          durationDays,
          basePrice: money(price, actor.organization.currency),
          branchAccess: "selected",
          branchIds: [homeBranchId],
          freezeAllowanceDays: 0,
          includedPtSessions,
          status: "active",
        }, { branchId: homeBranchId });
        await insertAudit(ctx, actor, { category: "settings", action: "plan.create_from_crm", entityType: "plan", entityId: plan.id, entityLabel: `${name} · ${plan.code}`, summary: "Custom membership created during CRM sale", branchId: homeBranchId });
        planRecord = await recordOf(ctx, actor, "plan", plan.id);
      } else {
        domainError("VALIDATION_ERROR", "Choose an existing plan or enter a custom membership.", { correlationId: actor.correlationId });
      }

      const planData = data(planRecord.data);
      if (stringValue(planData.status, "active") !== "active") domainError("NOT_FOUND", "Plan not found or inactive.", { correlationId: actor.correlationId });
      const matchingMembers = duplicateMemberMatches(
        (await memberRecords(ctx, actor)).map((record) => data(record.data)),
        { phone: leadData.phone, email: leadData.email },
      );
      const matchingMemberIds = [...new Set(matchingMembers.map((match) => match.memberId))];
      if (matchingMemberIds.length > 1) {
        domainError("DUPLICATE_MEMBER", "More than one member matches this lead. Open the correct member and resolve the duplicate records before selling a membership.", {
          correlationId: actor.correlationId,
          details: { matches: matchingMembers },
        });
      }
      const existingMemberRecord = matchingMemberIds[0]
        ? await recordOf(ctx, actor, "member", matchingMemberIds[0])
        : undefined;
      if (existingMemberRecord && stringValue(data(existingMemberRecord.data).status) !== "active") {
        domainError("VALIDATION_ERROR", "The matching member is inactive. Reactivate the member before selling a membership.", { correlationId: actor.correlationId });
      }
      const created = existingMemberRecord
        ? undefined
        : await createMemberMutation(ctx, actor, {
          ...input,
          fullName: leadData.fullName,
          phone: leadData.phone,
          email: leadData.email,
          homeBranchId: input.homeBranchId,
          preferredLanguage: input.preferredLanguage,
          source: leadData.source,
          assignedSalespersonId: leadData.ownerId,
        }, { rejectDuplicates: true });
      const memberDetail = created?.member ?? await toMemberDetail(ctx, actor, data(existingMemberRecord!.data));
      const member = data(memberDetail);
      const sale = await createMembershipMutation(ctx, actor, {
        memberId: member.id,
        planId: planData.id,
        startDate: input.startDate,
        idempotencyKey: `lead-sale:${idempotencyKey}`,
      });

      const completedAt = isoNow();
      await patchRecord(ctx, actor, lead, { stage: "won", convertedMemberId: member.id, nextFollowUpAt: undefined, updatedAt: completedAt });
      await patchRecord(ctx, actor, trialBooking, { status: "converted", updatedAt: completedAt });
      for (const task of (await recordsOf(ctx, actor, "task")).filter((record) => {
        const taskData = data(record.data);
        return taskData.leadId === lead.publicId && taskData.status === "open";
      })) {
        await patchRecord(ctx, actor, task, { status: "completed", outcome: "Membership sold", completedAt });
      }
      await insertTimeline(ctx, actor, {
        leadId: lead.publicId,
        memberId: member.id,
        branchId: optionalString(leadData.branchId),
        type: "lead_converted",
        title: `Membership sold — ${stringValue(planData.name)}`,
        body: existingMemberRecord
          ? `${stringValue(member.memberNumber)} received a new active membership record.`
          : `${stringValue(leadData.fullName)} became ${stringValue(member.memberNumber)} with an active membership record.`,
        actorId: publicUserId(actor.user),
        actorName: actor.user.fullName,
        meta: { membershipId: data(sale.membership).id, planId: planData.id },
      });
      await insertAudit(ctx, actor, {
        category: "crm",
        action: "lead.membership_sale_completed",
        entityType: "lead",
        entityId: lead.publicId,
        entityLabel: stringValue(leadData.fullName),
        summary: `${existingMemberRecord ? "Existing member sold" : "Lead converted with"} ${stringValue(planData.name)} membership`,
        before: { stage: leadData.stage },
        after: { stage: "won", memberId: member.id, membershipId: data(sale.membership).id, planId: planData.id, reusedExistingMember: Boolean(existingMemberRecord) },
        branchId: optionalString(leadData.branchId),
      });
      await ctx.db.insert("idempotencyRecords", {
        organizationId: actor.organization._id,
        operation: "lead.complete_sale",
        key: idempotencyKey,
        requestHash,
        result: { memberId: member.id, planId: planData.id, membershipId: data(sale.membership).id, chargeId: data(sale.charge).id },
        createdAt: Date.now(),
        expiresAt: Date.now() + 86_400_000 * 365,
      });
      return { member: memberDetail, plan: await toPlan(ctx, actor, planData), membership: sale.membership, charge: sale.charge };
    }
    case "leads.convert": {
      requirePermission(actor, "crm.write");
      domainError("VALIDATION_ERROR", "Member-only conversion is no longer supported. Complete the trial and record a membership sale.", { correlationId: actor.correlationId });
    }
    case "checkins.create": {
      requirePermission(actor, "members.read");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const entryPassToken = optionalString(input.entryPassToken);
      const entryPass = entryPassToken ? await resolveEntryPass(ctx, actor, entryPassToken, branchId) : null;
      if (entryPassToken && !entryPass) domainError("NOT_FOUND", "Entry pass is invalid, expired, or already used.", { correlationId: actor.correlationId });
      const memberRecord = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const member = data(memberRecord.data);
      if (entryPass && entryPass.payload.memberId && entryPass.payload.memberId !== member.id) domainError("NOT_FOUND", "Entry pass is not valid for this member.", { correlationId: actor.correlationId });
      const evaluation = await evaluateCheckIn(ctx, actor, member, branchId, true);
      const decision = stringValue(evaluation.decision);
      const checkIn = { id: newPublicId(), memberId: member.id, memberName: member.fullName, memberNumber: member.memberNumber, branchId, branchName: (await branchByPublicId(ctx, actor.organization._id, branchId))?.name ?? "—", decision, reasonCodes: evaluation.reasonCodes, actorId: publicUserId(actor.user), actorName: actor.user.fullName, occurredAt: isoNow() };
      await insertRecord(ctx, actor, "checkIn", checkIn, { branchId, memberPublicId: member.id });
      if (decision !== "blocked") {
        const membership = await currentMembership(ctx, actor, member.id);
        if (membership && membership.remainingVisits != null) {
          const membershipRecord = await recordOf(ctx, actor, "membership", stringValue(membership.id));
          await patchRecord(ctx, actor, membershipRecord, { remainingVisits: Math.max(0, numberValue(membership.remainingVisits) - 1) });
        }
        await insertTimeline(ctx, actor, { memberId: member.id, branchId, type: "check_in", title: `Checked in — ${checkIn.branchName}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { decision } });
        if (entryPass) await ctx.db.patch(entryPass.pass._id, { consumedAt: Date.now(), lastValidatedAt: Date.now() });
      }
      return { checkInId: checkIn.id, decision, reasonCodes: evaluation.reasonCodes, member: await toMemberSummary(ctx, actor, member), membership: evaluation.membership, occurredAt: checkIn.occurredAt, message: evaluation.message };
    }
    case "checkins.override": {
      requirePermission(actor, "checkins.override");
      requireReason(input.reason, actor.correlationId);
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const entryPassToken = optionalString(input.entryPassToken);
      const entryPass = entryPassToken ? await resolveEntryPass(ctx, actor, entryPassToken, branchId) : null;
      if (entryPassToken && !entryPass) domainError("NOT_FOUND", "Entry pass is invalid, expired, or already used.", { correlationId: actor.correlationId });
      const memberRecord = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const member = data(memberRecord.data);
      if (entryPass && entryPass.payload.memberId && entryPass.payload.memberId !== member.id) domainError("NOT_FOUND", "Entry pass is not valid for this member.", { correlationId: actor.correlationId });
      const evaluation = await evaluateCheckIn(ctx, actor, member, branchId, true);
      const checkIn = { id: newPublicId(), memberId: member.id, memberName: member.fullName, memberNumber: member.memberNumber, branchId, branchName: (await branchByPublicId(ctx, actor.organization._id, branchId))?.name ?? "—", decision: "overridden", reasonCodes: [...arrayValue(evaluation.reasonCodes).filter((code) => code !== "OK"), "MANUAL_OVERRIDE"], actorId: publicUserId(actor.user), actorName: actor.user.fullName, overrideReason: stringValue(input.reason), occurredAt: isoNow() };
      await insertRecord(ctx, actor, "checkIn", checkIn, { branchId, memberPublicId: member.id });
      const membership = await currentMembership(ctx, actor, member.id);
      if (membership && membership.remainingVisits != null) { const membershipRecord = await recordOf(ctx, actor, "membership", stringValue(membership.id)); await patchRecord(ctx, actor, membershipRecord, { remainingVisits: Math.max(0, numberValue(membership.remainingVisits) - 1) }); }
      await insertTimeline(ctx, actor, { memberId: member.id, branchId, type: "check_in", title: `Checked in — ${checkIn.branchName}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { decision: "overridden" } });
      if (entryPass) await ctx.db.patch(entryPass.pass._id, { consumedAt: Date.now(), lastValidatedAt: Date.now() });
      await insertAudit(ctx, actor, { category: "checkins", action: "checkin.override", entityType: "member", entityId: member.id, entityLabel: `${member.fullName} · ${member.memberNumber}`, summary: `Manual check-in override (${arrayValue(evaluation.reasonCodes).join(", ")})`, reason: stringValue(input.reason), before: { decision: evaluation.decision }, after: { decision: "overridden" }, branchId });
      const overrideBranch = await branchByPublicId(ctx, actor.organization._id, branchId);
      await notifyOrganizationRoles(ctx, { organizationId: actor.organization._id, branchId: overrideBranch?._id, roles: ["owner", "manager"], kind: "checkin_override", title: "Check-in override recorded", body: `${member.fullName} · ${checkIn.branchName} · ${actor.user.fullName}`, href: `/members/${member.id}`, dedupeKey: `checkin-override:${checkIn.id}` });
      return { checkInId: checkIn.id, decision: "overridden", reasonCodes: checkIn.reasonCodes, member: await toMemberSummary(ctx, actor, member), membership: evaluation.membership, occurredAt: checkIn.occurredAt, message: `Overridden by ${actor.user.fullName}: ${input.reason}` };
    }
    case "payments.create": {
      requirePermission(actor, "payments.collect");
      if (!optionalString(input.chargeId)) {
        domainError("VALIDATION_ERROR", "Select the specific outstanding charge before collecting payment.", { correlationId: actor.correlationId, fieldErrors: { chargeId: ["Required"] } });
      }
      const idempotencyKey = recordId(input.idempotencyKey);
      const result = await paymentRecord(ctx, actor, input, idempotencyKey);
      const payment = result.payment;
      if (!result.replayed) await auditPaymentCollection(ctx, actor, payment);
      return await receiptDetail(ctx, actor, result.receiptId);
    }
    case "payments.refund": {
      requirePermission(actor, "payments.refund");
      requireReason(input.reason, actor.correlationId);
      const paymentId = recordId(input.paymentId);
      const idempotencyKey = recordId(input.idempotencyKey);
      const requestHash = JSON.stringify({ paymentId, amount: input.amount, reason: input.reason, idempotencyKey });
      const existing = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "payment.refund").eq("key", idempotencyKey)).unique();
      if (existing) {
        if (existing.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different refund.", { correlationId: actor.correlationId });
        return await receiptDetail(ctx, actor, stringValue(data(existing.result).receiptId));
      }
      const originalRecord = await recordOf(ctx, actor, "payment", paymentId);
      const original = data(originalRecord.data);
      if (original.type !== "payment") domainError("VALIDATION_ERROR", "Only payments can be refunded.", { correlationId: actor.correlationId });
      if (original.status === "voided") domainError("PAYMENT_ALREADY_VOIDED", "Voided payments cannot be refunded.", { correlationId: actor.correlationId });
      const ptOrder = original.chargeId
        ? await ctx.db.query("ptPackageOrders").withIndex("by_charge", (q) => q.eq("organizationId", actor.organization._id).eq("chargePublicId", stringValue(original.chargeId))).unique()
        : null;
      if (ptOrder && ptOrder.status !== "pending_payment") {
        domainError("VALIDATION_ERROR", "Use the PT package refund workflow so refundable credits and money remain synchronized.", { correlationId: actor.correlationId });
      }
      const related = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => payment.originalPaymentId === original.id && payment.type === "refund");
      const alreadyRefunded = related.reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
      const remaining = amountOf(original.amount) - alreadyRefunded;
      if (input.amount != null && currencyOf(input.amount, "") !== actor.organization.currency) {
        domainError("VALIDATION_ERROR", "Refund currency does not match the organization.", { correlationId: actor.correlationId });
      }
      const allocation = refundAllocation(input.amount == null ? undefined : amountOf(input.amount), remaining);
      if (!allocation.ok && allocation.code === "PAYMENT_ALREADY_REFUNDED") domainError(allocation.code, "This payment was already fully refunded.", { correlationId: actor.correlationId });
      if (!allocation.ok) domainError(allocation.code, "Refund amount exceeds the refundable balance.", { correlationId: actor.correlationId });
      const amount = allocation.amount;
      const allocated = await allocateReceipt(ctx, actor);
      const refund = { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), branchId: original.branchId, memberId: original.memberId, chargeId: original.chargeId, type: "refund", amount: signedMoney(-amount, actor.organization.currency), method: original.method, status: "completed", receiptId: allocated.id, receiptNumber: allocated.number, collectedById: publicUserId(actor.user), collectedByName: actor.user.fullName, shiftId: (await findOpenShift(ctx, actor, stringValue(original.branchId))) ? stringValue(data((await findOpenShift(ctx, actor, stringValue(original.branchId)))!.data).id) : undefined, idempotencyKey: `refund-${original.id}-${allocated.id}`, originalPaymentId: original.id, refundReason: stringValue(input.reason), occurredAt: isoNow() };
      const receipt = { id: allocated.id, receiptNumber: allocated.number, paymentId: refund.id, issuedAt: refund.occurredAt };
      await insertRecord(ctx, actor, "payment", refund, { branchId: optionalString(original.branchId), memberPublicId: optionalString(original.memberId) });
      await insertRecord(ctx, actor, "receipt", receipt, { branchId: optionalString(original.branchId), memberPublicId: optionalString(original.memberId) });
      const updatedStatus = alreadyRefunded + amount >= amountOf(original.amount) ? "refunded" : "partially_refunded";
      await patchRecord(ctx, actor, originalRecord, { status: updatedStatus, refundedAmount: money(alreadyRefunded + amount, actor.organization.currency), refundReason: stringValue(input.reason) });
      if (original.chargeId) {
        const charge = await recordOf(ctx, actor, "charge", stringValue(original.chargeId));
        const chargeData = data(charge.data); const paid = Math.max(0, amountOf(chargeData.paidAmount) - amount); await patchRecord(ctx, actor, charge, { paidAmount: money(paid, actor.organization.currency), outstandingAmount: money(Math.max(0, amountOf(chargeData.total) - paid), actor.organization.currency), status: paid <= 0 ? "refunded" : "partial" });
      }
      await insertAudit(ctx, actor, { category: "payments", action: "payment.refund", entityType: "payment", entityId: original.id, entityLabel: await paymentAuditEntityLabel(ctx, actor, original), summary: `Refunded ${actor.organization.currency} ${(amount / 1000).toFixed(3)}`, reason: stringValue(input.reason), before: { paymentStatus: original.status }, after: { paymentStatus: updatedStatus, refunded: alreadyRefunded + amount }, approvalStatus: amount > 25_000 ? "pending" : "approved", branchId: optionalString(original.branchId) });
      await insertTimeline(ctx, actor, { memberId: original.memberId, branchId: original.branchId, type: "payment_refunded", title: `Payment refunded — ${actor.organization.currency} ${(amount / 1000).toFixed(3)}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "payment.refund", key: idempotencyKey, requestHash, result: { receiptId: receipt.id, paymentId: refund.id }, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 * 365 });
      const refundBranch = optionalString(original.branchId) ? await branchByPublicId(ctx, actor.organization._id, stringValue(original.branchId)) : null;
      await notifyOrganizationRoles(ctx, { organizationId: actor.organization._id, branchId: refundBranch?._id, roles: ["owner", "manager"], kind: "refund_review", title: "Payment refund recorded", body: `${actor.organization.currency} ${(amount / 1000).toFixed(3)} · ${actor.user.fullName}`, href: `/payments/receipts/${receipt.id}`, dedupeKey: `refund:${refund.id}` });
      return await receiptDetail(ctx, actor, receipt.id);
    }
    case "payments.void": {
      requirePermission(actor, "payments.void");
      requireReason(input.reason, actor.correlationId);
      const paymentId = recordId(input.paymentId);
      const idempotencyKey = recordId(input.idempotencyKey);
      const requestHash = JSON.stringify({ paymentId, reason: input.reason, idempotencyKey });
      const existing = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", actor.organization._id).eq("operation", "payment.void").eq("key", idempotencyKey)).unique();
      if (existing) {
        if (existing.requestHash !== requestHash) domainError("VALIDATION_ERROR", "This idempotency key was already used for a different void.", { correlationId: actor.correlationId });
        return await receiptDetail(ctx, actor, stringValue(data(existing.result).receiptId));
      }
      const originalRecord = await recordOf(ctx, actor, "payment", paymentId);
      const original = data(originalRecord.data);
      if (original.type !== "payment") domainError("VALIDATION_ERROR", "Only payments can be voided.", { correlationId: actor.correlationId });
      if (original.status === "voided") domainError("PAYMENT_ALREADY_VOIDED", "Payment is already voided.", { correlationId: actor.correlationId });
      if (original.status === "refunded" || original.status === "partially_refunded") domainError("PAYMENT_ALREADY_REFUNDED", "Refunded payments cannot be voided.", { correlationId: actor.correlationId });
      const paymentDay = todayIn(actor.organization.timezone || TZ_FALLBACK);
      if (businessDate(stringValue(original.occurredAt), actor.organization.timezone || TZ_FALLBACK) !== paymentDay) domainError("VOID_WINDOW_EXPIRED", "Payments can only be voided on the same business day. Issue a refund instead.", { correlationId: actor.correlationId });
      await patchRecord(ctx, actor, originalRecord, { status: "voided", voidReason: stringValue(input.reason) });
      if (original.chargeId) {
        const charge = await recordOf(ctx, actor, "charge", stringValue(original.chargeId));
        const chargeData = data(charge.data);
        const paid = Math.max(0, amountOf(chargeData.paidAmount) - amountOf(original.amount));
        await reverseUnusedPtOrderAfterVoid(ctx, actor, charge.publicId, stringValue(input.reason));
        await patchRecord(ctx, actor, charge, { paidAmount: money(paid, actor.organization.currency), outstandingAmount: money(Math.max(0, amountOf(chargeData.total) - paid), actor.organization.currency), status: paid <= 0 ? "unpaid" : "partial" });
      }
      await insertAudit(ctx, actor, { category: "payments", action: "payment.void", entityType: "payment", entityId: original.id, entityLabel: await paymentAuditEntityLabel(ctx, actor, original), summary: `Voided ${actor.organization.currency} ${(amountOf(original.amount) / 1000).toFixed(3)}`, reason: stringValue(input.reason), before: { status: "completed" }, after: { status: "voided" }, branchId: optionalString(original.branchId) });
      await insertTimeline(ctx, actor, { memberId: original.memberId, branchId: original.branchId, type: "payment_voided", title: `Payment voided — ${original.receiptNumber}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "payment.void", key: idempotencyKey, requestHash, result: { receiptId: original.receiptId, paymentId: original.id }, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 * 365 });
      const voidBranch = optionalString(original.branchId) ? await branchByPublicId(ctx, actor.organization._id, stringValue(original.branchId)) : null;
      await notifyOrganizationRoles(ctx, { organizationId: actor.organization._id, branchId: voidBranch?._id, roles: ["owner", "manager"], kind: "void_review", title: "Payment voided", body: `${actor.organization.currency} ${(amountOf(original.amount) / 1000).toFixed(3)} · ${actor.user.fullName}`, href: `/payments/receipts/${stringValue(original.receiptId)}`, dedupeKey: `void:${original.id}` });
      return await receiptDetail(ctx, actor, stringValue(original.receiptId));
    }
    case "shifts.open": {
      requirePermission(actor, "reconciliation.open_shift");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      if (await findOpenShift(ctx, actor, branchId)) domainError("SHIFT_ALREADY_OPEN", "A shift is already open at this branch.", { correlationId: actor.correlationId });
      const shift = await insertRecord(ctx, actor, "shift", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), branchId, openedById: publicUserId(actor.user), openedByName: actor.user.fullName, openedAt: isoNow(), openingFloat: { amount: amountOf(input.openingFloat), currency: actor.organization.currency }, status: "open", varianceApprovalStatus: "none" }, { branchId });
      await insertAudit(ctx, actor, { category: "reconciliation", action: "shift.open", entityType: "cash_shift", entityId: shift.id, entityLabel: branchId, summary: "Cash shift opened", branchId });
      return shift;
    }
    case "shifts.close": {
      requirePermission(actor, "reconciliation.close_shift");
      const record = await recordOf(ctx, actor, "shift", recordId(input.shiftId));
      const shift = data(record.data);
      if (shift.status !== "open") domainError("VALIDATION_ERROR", "This shift is already closed.", { correlationId: actor.correlationId });
      const totals = await shiftTotals(ctx, actor, shift);
      const expected = amountOf(shift.openingFloat) + amountOf(totals.cashPayments) - amountOf(totals.cashRefunds);
      const counted = amountOf(input.countedCash);
      const variance = counted - expected;
      if (variance !== 0) requireReason(input.varianceExplanation, actor.correlationId, "varianceExplanation");
      const updated = await patchRecord(ctx, actor, record, { status: "closed", closedAt: isoNow(), closedById: publicUserId(actor.user), expectedCash: money(expected, actor.organization.currency), countedCash: money(counted, actor.organization.currency), variance: signedMoney(variance, actor.organization.currency), varianceExplanation: optionalString(input.varianceExplanation), varianceApprovalStatus: varianceApprovalStatusForAmount(variance) });
      await insertAudit(ctx, actor, { category: "reconciliation", action: variance === 0 ? "shift.close" : "shift.close_variance", entityType: "cash_shift", entityId: record.publicId, entityLabel: stringValue(shift.branchId), summary: variance === 0 ? "Cash shift closed" : `Cash shift closed with variance ${actor.organization.currency} ${(variance / 1000).toFixed(3)}`, reason: optionalString(input.varianceExplanation), before: { status: "open" }, after: { status: "closed", expected, counted, variance }, approvalStatus: varianceAuditApprovalStatusForAmount(variance), branchId: optionalString(shift.branchId) });
      if (variance !== 0) {
        const shiftBranch = await branchByPublicId(ctx, actor.organization._id, stringValue(shift.branchId));
        await notifyOrganizationRoles(ctx, { organizationId: actor.organization._id, branchId: shiftBranch?._id, roles: ["owner", "manager"], kind: "cash_shift_variance", title: "Cash shift variance", body: `${actor.organization.currency} ${(variance / 1000).toFixed(3)} · ${actor.user.fullName}`, href: "/payments/shifts", dedupeKey: `shift-variance:${record.publicId}` });
      }
      return updated;
    }
    case "shifts.review": {
      requirePermission(actor, "reconciliation.approve_variance");
      requireReason(input.note, actor.correlationId, "note");
      const record = await recordOf(ctx, actor, "shift", recordId(input.shiftId));
      const shift = data(record.data);
      if (shift.varianceApprovalStatus !== "pending") domainError("VALIDATION_ERROR", "This shift has no pending variance approval.", { correlationId: actor.correlationId });
      const decision = stringValue(input.decision);
      if (decision !== "approved" && decision !== "rejected") domainError("VALIDATION_ERROR", "Approval decision is invalid.", { correlationId: actor.correlationId });
      const updated = await patchRecord(ctx, actor, record, { varianceApprovalStatus: decision });
      await insertAudit(ctx, actor, { category: "reconciliation", action: `shift.variance.${decision}`, entityType: "cash_shift", entityId: record.publicId, entityLabel: stringValue(shift.branchId), summary: `${decision === "approved" ? "Approved" : "Rejected"} cash variance`, reason: stringValue(input.note), before: { varianceApprovalStatus: "pending" }, after: { varianceApprovalStatus: decision }, branchId: optionalString(shift.branchId) });
      return updated;
    }
    case "automations.rule.create": {
      requirePermission(actor, "automations.manage");
      const normalized = normalizedAutomationRulePatch(input, undefined, actor.correlationId, true);
      await assertAutomationTemplateReferences(ctx, actor, arrayValue(normalized.actions).map(data));
      const rule = await insertRecord(ctx, actor, "automationRule", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), ...normalized, executionsLast30Days: 0, updatedAt: isoNow() });
      await insertAudit(ctx, actor, { category: "automations", action: "automation.rule_created", entityType: "automation_rule", entityId: rule.id, entityLabel: stringValue(rule.name), summary: "Automation rule created" });
      return rule;
    }
    case "automations.rule.update": {
      requirePermission(actor, "automations.manage");
      const record = await recordOf(ctx, actor, "automationRule", recordId(input.id));
      const patch: Data = normalizedAutomationRulePatch(input, data(record.data), actor.correlationId, false);
      if (patch.actions) await assertAutomationTemplateReferences(ctx, actor, arrayValue(patch.actions).map(data));
      patch.updatedAt = isoNow();
      const updated = await patchRecord(ctx, actor, record, patch);
      await insertAudit(ctx, actor, { category: "automations", action: "automation.rule_updated", entityType: "automation_rule", entityId: record.publicId, entityLabel: stringValue(updated.name), summary: "Automation rule updated" });
      return updated;
    }
    case "automations.run": {
      requirePermission(actor, "automations.manage");
      requireReason(input.reason, actor.correlationId);
      const ruleRecord = await recordOf(ctx, actor, "automationRule", recordId(input.ruleId));
      const rule = data(ruleRecord.data);
      const candidates = await automationCandidates(ctx, actor, ruleRecord);
      const eligible = candidates.filter((candidate) => !candidate.duplicate);
      for (const candidate of eligible) await executeAutomationCandidate(ctx, actor, ruleRecord, candidate);
      await patchRecord(ctx, actor, ruleRecord, {
        lastRunAt: isoNow(),
        executionsLast30Days: numberValue(rule.executionsLast30Days) + eligible.length,
        updatedAt: isoNow(),
      });
      await insertAudit(ctx, actor, {
        category: "automations",
        action: "automation.rule_run_now",
        entityType: "automation_rule",
        entityId: ruleRecord.publicId,
        entityLabel: stringValue(rule.name),
        summary: `Automation run created ${eligible.length} execution${eligible.length === 1 ? "" : "s"}`,
        reason: stringValue(input.reason),
        before: { eligible: eligible.length, duplicates: candidates.length - eligible.length },
        after: { created: eligible.length, skippedDuplicates: candidates.length - eligible.length },
      });
      return { created: eligible.length, skippedDuplicates: candidates.length - eligible.length };
    }
    case "automations.execution.retry": {
      requirePermission(actor, "automations.manage");
      requireReason(input.reason, actor.correlationId);
      const executionRecord = await recordOf(ctx, actor, "automationExecution", recordId(input.executionId));
      const execution = data(executionRecord.data);
      const actionResults = arrayValue(execution.actionResults).map(data);
      const failedActions = actionResults.filter((item) => item.status === "failed");
      if (stringValue(execution.status) !== "failed" && failedActions.length === 0) {
        domainError("VALIDATION_ERROR", "Only failed automation executions can be retried.", { correlationId: actor.correlationId });
      }
      const retryPolicy = data(execution.retryPolicy);
      const maxAttempts = Math.max(1, numberValue(retryPolicy.maxAttempts, 3));
      const attemptHistory = arrayValue(execution.attemptHistory).map(data);
      const currentAttempt = Math.max(0, ...attemptHistory.map((item) => numberValue(item.attempt)));
      if (currentAttempt >= maxAttempts) {
        await notifyOrganizationRoles(ctx, {
          organizationId: actor.organization._id,
          branchId: executionRecord.branchId,
          roles: ["owner", "manager"],
          kind: "automation_failed",
          title: "Automation retries exhausted",
          body: stringValue(execution.subjectName, stringValue(execution.ruleName)),
          href: "/audit?category=automations",
          dedupeKey: `automation-exhausted:${executionRecord.publicId}`,
        });
        domainError("VALIDATION_ERROR", "This execution has exhausted its retry limit.", { correlationId: actor.correlationId });
      }
      const occurredAt = isoNow();
      const retryActions = failedActions.length > 0 ? failedActions : actionResults;
      const nextActionResults = actionResults.map((item) => retryActions.some((failed) => failed.key === item.key) ? { ...item, status: "queued", suppressionReason: undefined } : item);
      const updated = await patchRecord(ctx, actor, executionRecord, {
        status: "retrying",
        actionResults: nextActionResults,
        attemptHistory: [
          ...attemptHistory,
          ...retryActions.map((item) => ({ action: item.key, attempt: currentAttempt + 1, status: "queued", occurredAt, reason: "Manual retry queued in sandbox" })),
        ],
        nextAttemptAt: occurredAt,
        detail: "Manual retry queued in sandbox.",
      });
      await insertAudit(ctx, actor, {
        category: "automations",
        action: "automation.execution_retry",
        entityType: "automation_execution",
        entityId: executionRecord.publicId,
        entityLabel: stringValue(execution.ruleName, executionRecord.publicId),
        summary: `Automation retry ${currentAttempt + 1} queued`,
        reason: stringValue(input.reason),
        before: { status: execution.status, attempt: currentAttempt },
        after: { status: "retrying", attempt: currentAttempt + 1 },
      });
      return await automationExecutionView(ctx, actor, { ...executionRecord, data: updated, updatedAt: Date.now() });
    }
    case "workspace.preferences.update": {
      if (actor.role !== "owner") domainError("FORBIDDEN", "Only an organization owner can change workspace module preferences.", { correlationId: actor.correlationId });
      const access = await workspaceAccessData(ctx, actor);
      const inputModules = arrayValue(input.enabledModules);
      let enabledModules: WorkspaceModuleKey[];
      try {
        enabledModules = validateWorkspaceModuleSelection(inputModules, access.entitlements.entitledModules as WorkspaceModuleKey[]);
      } catch (error) {
        domainError("VALIDATION_ERROR", error instanceof Error ? error.message : "Workspace module preferences are invalid.", { correlationId: actor.correlationId });
      }
      const existing = await workspacePreferencesRecord(ctx, actor);
      const before = access.preferences.enabledModules as WorkspaceModuleKey[];
      const changed = JSON.stringify(before) !== JSON.stringify(enabledModules);
      const now = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: actor.user._id, updatedAt: now });
      } else {
        await ctx.db.insert("workspaceModulePreferences", { organizationId: actor.organization._id, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: actor.user._id, createdAt: now, updatedAt: now });
      }
      if (changed) {
        await insertAudit(ctx, actor, {
          category: "settings",
          action: "workspace.module_preferences.update",
          entityType: "workspace_module_preferences",
          entityId: publicOrganizationId(actor.organization),
          entityLabel: actor.organization.name,
          summary: "Workspace module preferences updated",
          before: { enabledModules: before.join(",") },
          after: { enabledModules: enabledModules.join(",") },
        });
      }
      return await workspaceAccessData(ctx, actor);
    }
    case "settings.brand.update": {
      if (actor.role !== "owner") domainError("FORBIDDEN", "Only the organization owner can change the Brand Kit.", { correlationId: actor.correlationId });
      const paletteKeyInput = input.paletteKey;
      if (!isBrandPaletteKey(paletteKeyInput)) domainError("VALIDATION_ERROR", "Choose a supported Brand Kit palette.", { correlationId: actor.correlationId, fieldErrors: { paletteKey: ["Choose a supported palette."] } });
      const requestedColor = input.primaryColor === undefined || input.primaryColor === null || input.primaryColor === ""
        ? BRAND_PALETTE_PRESETS[paletteKeyInput]
        : normalizeBrandHex(input.primaryColor);
      if (!requestedColor) domainError("VALIDATION_ERROR", "Primary color must be a six-digit hex color.", { correlationId: actor.correlationId, fieldErrors: { primaryColor: ["Use #RRGGBB."] } });
      const requestedLogoId = input.logoAssetId === null || input.logoAssetId === "" ? undefined : optionalString(input.logoAssetId);
      let logo: Doc<"mediaAssets"> | null = null;
      if (requestedLogoId) {
        logo = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedLogoId)).unique();
        if (!logo || logo.ownerType !== "gym_logo" || logo.ownerPublicId !== publicOrganizationId(actor.organization) || logo.visibility !== "public" || !["pending", "active"].includes(logo.status)) {
          domainError("NOT_FOUND", "Brand logo was not found in this organization.", { correlationId: actor.correlationId });
        }
      }
      const previousLogoId = (actor.organization as Organization & { brandLogoAssetId?: string }).brandLogoAssetId;
      const now = Date.now();
      if (logo?.status === "pending") await ctx.db.patch(logo._id, { status: "active", deleteAfter: undefined, updatedAt: now });
      if (previousLogoId && previousLogoId !== requestedLogoId) {
        const previous = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", previousLogoId)).unique();
        if (previous && previous.status === "active") await ctx.db.patch(previous._id, { status: "scheduled_for_deletion", deleteAfter: now + 30 * 86_400_000, updatedAt: now });
      }
      const previousBrand = await brandKitView(ctx, actor.organization);
      const nextVersion = ((actor.organization as Organization & { brandVersion?: number }).brandVersion ?? 0) + 1;
      await ctx.db.patch(actor.organization._id, { brandLogoAssetId: requestedLogoId, brandPaletteKey: paletteKeyInput, brandPrimaryColor: requestedColor, brandVersion: nextVersion, brandUpdatedAt: now, brandUpdatedByUserId: actor.user._id, updatedAt: now });
      const nextBrand = await brandKitView(ctx, { ...actor.organization, brandLogoAssetId: requestedLogoId, brandPaletteKey: paletteKeyInput, brandPrimaryColor: requestedColor, brandVersion: nextVersion, brandUpdatedAt: now, brandUpdatedByUserId: actor.user._id });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.brand.update", entityType: "organization_brand", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: "Tenant Brand Kit updated", before: { paletteKey: previousBrand.paletteKey, primaryColor: previousBrand.primaryColor, logoAssetId: previousBrand.logoAssetId, version: previousBrand.version }, after: { paletteKey: nextBrand.paletteKey, primaryColor: nextBrand.primaryColor, logoAssetId: nextBrand.logoAssetId, version: nextBrand.version } });
      return nextBrand;
    }
    case "settings.organization.update": {
      requirePermission(actor, "settings.manage");
      const allowed = ["name", "timezone", "locale", "defaultLanguage", "taxRatePercent", "receiptPrefix", "receiptFooter"];
      const patch: Partial<Organization> = {};
      for (const key of allowed) if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
      await ctx.db.patch(actor.organization._id, { ...patch, updatedAt: Date.now() });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.organization_update", entityType: "organization", entityId: publicOrganizationId(actor.organization), entityLabel: stringValue(input.name, actor.organization.name), summary: "Organization settings updated", before: { name: actor.organization.name, receiptFooter: actor.organization.receiptFooter, taxRatePercent: actor.organization.taxRatePercent }, after: patch });
      return await settingsView(ctx, actor);
    }
    case "settings.paymentMethods": {
      requirePermission(actor, "settings.manage");
      const settings = await settingsRecord(ctx, actor);
      const value = { ...(settings ? data(settings.data) : {}), paymentMethods: input.paymentMethods ?? input };
      if (settings) await patchRecord(ctx, actor, settings, value);
      else await insertRecord(ctx, actor, "settings", { id: "settings", ...value });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.payment_methods", entityType: "organization", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: "Payment methods updated" });
      return await settingsView(ctx, actor);
    }
    case "settings.notifications": {
      requirePermission(actor, "settings.manage");
      const settings = await settingsRecord(ctx, actor);
      const value = { ...(settings ? data(settings.data) : {}), notifications: input.notifications ?? input };
      if (settings) await patchRecord(ctx, actor, settings, value);
      else await insertRecord(ctx, actor, "settings", { id: "settings", ...value });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.notifications", entityType: "organization", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: "Notification settings updated" });
      return await settingsView(ctx, actor);
    }
    case "settings.operationalEmail.update": {
      requirePermission(actor, "settings.manage");
      const enabledKinds = [...new Set(arrayValue(input.enabledKinds).map(String))];
      if (enabledKinds.some((kind) => !GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS.includes(kind as typeof GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS[number]))) domainError("VALIDATION_ERROR", "Only gym-controlled member service email types can be configured here.", { correlationId: actor.correlationId });
      const existing = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
      const changed = JSON.stringify([...enabledKinds].sort()) !== JSON.stringify([...(existing?.enabledKinds ?? [])].sort());
      const reason = stringValue(input.reason).trim();
      const nextKinds = new Set(enabledKinds);
      const disabledKinds = (existing?.enabledKinds ?? []).filter((kind) => !nextKinds.has(kind));
      if (changed && disabledKinds.length > 0) requireReason(reason, actor.correlationId);
      const now = Date.now();
      if (existing) await ctx.db.patch(existing._id, { enabledKinds, updatedByUserId: actor.user._id, reason, ownerConfirmedAt: now, ownerConfirmedByUserId: actor.user._id, updatedAt: now });
      else await ctx.db.insert("operationalEmailSettings", { organizationId: actor.organization._id, enabledKinds, updatedByUserId: actor.user._id, reason, ownerConfirmedAt: now, ownerConfirmedByUserId: actor.user._id, createdAt: now, updatedAt: now });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.operational_email.update", entityType: "organization", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: `Enabled ${enabledKinds.length} gym-controlled service email type${enabledKinds.length === 1 ? "" : "s"}`, reason: reason || undefined, before: { enabledKinds: existing?.enabledKinds ?? [] }, after: { enabledKinds } });
      const providerConfigured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
      return { enabledKinds, availableKinds: [...GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS], configurableKinds: [...GYM_CONTROLLED_OPERATIONAL_EMAIL_KINDS], mandatoryPlatformKinds: [...MANDATORY_PLATFORM_EMAIL_KINDS], liveWorkerEnabled: process.env.RIVET_OPERATIONAL_EMAIL_LIVE === "true" && providerConfigured, providerConfigured, webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()), ownerConfirmed: true, ownerConfirmedAt: utcIso(now), ownerConfirmedBy: actor.user.fullName, updatedAt: utcIso(now), updatedBy: actor.user.fullName, reason: reason || undefined };
    }
    case "settings.operationalPolicies": {
      requirePermission(actor, "settings.manage");
      const settings = await settingsRecord(ctx, actor);
      const before = (await settingsData(ctx, actor)).operationalPolicies;
      const operationalPolicies = await validatedOperationalPolicies(ctx, actor, input.operationalPolicies ?? input);
      const value = { ...(settings ? data(settings.data) : {}), operationalPolicies };
      if (settings) await patchRecord(ctx, actor, settings, value);
      else await insertRecord(ctx, actor, "settings", { id: "settings", ...value });
      await insertAudit(ctx, actor, { category: "settings", action: "settings.operational_policies", entityType: "organization", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: "Entry, membership, and operating-hour policies updated", before, after: operationalPolicies });
      return await settingsView(ctx, actor);
    }
    case "zones.upsert": {
      requirePermission(actor, "settings.manage");
      if (actor.role !== "owner" && actor.role !== "manager") domainError("FORBIDDEN", "Only an owner or manager can manage zones.", { correlationId: actor.correlationId });
      const branchId = optionalString(input.branchId);
      const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
      assertBranchAccess(actor, branch);
      const code = stringValue(input.code).trim().toUpperCase();
      const name = stringValue(input.name).trim();
      const nameAr = optionalString(input.nameAr)?.trim();
      const kind = stringValue(input.kind);
      if (!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(code)) domainError("VALIDATION_ERROR", "Zone code must be 1–16 letters, numbers, underscores, or hyphens.", { correlationId: actor.correlationId, fieldErrors: { code: ["Use 1–16 uppercase letters, numbers, underscores, or hyphens."] } });
      if (name.length < 1 || name.length > 80) domainError("VALIDATION_ERROR", "Zone name must be between 1 and 80 characters.", { correlationId: actor.correlationId, fieldErrors: { name: ["Required, up to 80 characters."] } });
      if (nameAr && nameAr.length > 80) domainError("VALIDATION_ERROR", "Arabic zone name must be 80 characters or fewer.", { correlationId: actor.correlationId, fieldErrors: { nameAr: ["Up to 80 characters."] } });
      if (!ZONE_KINDS.includes(kind as typeof ZONE_KINDS[number])) domainError("VALIDATION_ERROR", "Zone kind is not supported.", { correlationId: actor.correlationId, fieldErrors: { kind: ["Choose a supported zone kind."] } });
      const capacity = input.capacity === undefined || input.capacity === null || input.capacity === "" ? undefined : numberValue(input.capacity, Number.NaN);
      if (capacity !== undefined && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000)) domainError("VALIDATION_ERROR", "Zone capacity must be a positive whole number.", { correlationId: actor.correlationId, fieldErrors: { capacity: ["Use a positive whole number."] } });
      const inputId = optionalString(input.id);
      const existing = inputId ? await zoneByPublicId(ctx, actor.organization._id, inputId) : null;
      if (inputId && !existing) domainError("NOT_FOUND", "Zone not found.", { correlationId: actor.correlationId });
      if (existing) {
        assertBranchAccess(actor, await ctx.db.get(existing.branchId));
        if (existing.branchId !== branch._id) domainError("VALIDATION_ERROR", "A zone cannot be moved between branches.", { correlationId: actor.correlationId });
      }
      // Archived zones remain in history, but their human-facing code can be
      // reused by a new live zone. Query all historical matches and reserve
      // only the active code; using `.unique()` here made an archived code
      // look permanently occupied.
      const duplicate = (await ctx.db.query("zones").withIndex("by_branch_code", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).eq("code", code)).collect()).find((candidate) => candidate.status === "active");
      if (duplicate && duplicate._id !== existing?._id) domainError("CONFLICT", "That zone code is already used in this branch.", { correlationId: actor.correlationId });
      const status = input.status === "archived" ? "archived" as const : "active" as const;
      const now = Date.now();
      if (existing) {
        const before = zoneView(existing, orgId, publicBranchId(branch));
        await ctx.db.patch(existing._id, { code, name, nameAr, kind: kind as typeof ZONE_KINDS[number], capacity, status, updatedAt: now });
        const updated = await ctx.db.get(existing._id);
        if (!updated) domainError("NOT_FOUND", "Zone could not be loaded after update.", { correlationId: actor.correlationId });
        await insertAudit(ctx, actor, { category: "settings", action: "zone.update", entityType: "zone", entityId: updated.publicId, entityLabel: updated.name, summary: "Zone updated", before, after: zoneView(updated, orgId, publicBranchId(branch)), branchId: publicBranchId(branch) });
        return zoneView(updated, orgId, publicBranchId(branch));
      }
      const publicId = newPublicId();
      const zoneId = await ctx.db.insert("zones", { organizationId: actor.organization._id, branchId: branch._id, publicId, code, name, nameAr, kind: kind as typeof ZONE_KINDS[number], capacity, status, createdAt: now, updatedAt: now });
      const created = await ctx.db.get(zoneId);
      if (!created) domainError("NOT_FOUND", "Zone could not be created.", { correlationId: actor.correlationId });
      await insertAudit(ctx, actor, { category: "settings", action: "zone.create", entityType: "zone", entityId: created.publicId, entityLabel: created.name, summary: "Zone created", after: zoneView(created, orgId, publicBranchId(branch)), branchId: publicBranchId(branch) });
      return zoneView(created, orgId, publicBranchId(branch));
    }
    case "zones.archive": {
      requirePermission(actor, "settings.manage");
      if (actor.role !== "owner" && actor.role !== "manager") domainError("FORBIDDEN", "Only an owner or manager can archive zones.", { correlationId: actor.correlationId });
      const zone = await zoneByPublicId(ctx, actor.organization._id, optionalString(input.id));
      if (!zone) domainError("NOT_FOUND", "Zone not found.", { correlationId: actor.correlationId });
      const branch = await ctx.db.get(zone.branchId);
      assertBranchAccess(actor, branch);
      const branchPublicId = publicBranchId(branch);
      if (zone.status === "archived") return zoneView(zone, orgId, branchPublicId);
      const now = Date.now();
      await ctx.db.patch(zone._id, { status: "archived", updatedAt: now });
      const archived = await ctx.db.get(zone._id);
      if (!archived) domainError("NOT_FOUND", "Zone could not be loaded after archive.", { correlationId: actor.correlationId });
      await insertAudit(ctx, actor, { category: "settings", action: "zone.archive", entityType: "zone", entityId: zone.publicId, entityLabel: zone.name, summary: "Zone archived", before: zoneView(zone, orgId, branchPublicId), after: zoneView(archived, orgId, branchPublicId), branchId: branchPublicId });
      return zoneView(archived, orgId, branchPublicId);
    }
    case "branches.upsert": {
      requirePermission(actor, "settings.manage");
      const inputId = optionalString(input.id);
      if (inputId) {
        const branch = await branchByPublicId(ctx, actor.organization._id, inputId);
        if (!branch) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
        const updated = { name: stringValue(input.name), code: stringValue(input.code).toUpperCase(), address: stringValue(input.address), phone: stringValue(input.phone), capacity: numberValue(input.capacity, 120), active: input.status !== "inactive", status: input.status };
        await ctx.db.patch(branch._id, { ...updated, updatedAt: Date.now() });
        await insertAudit(ctx, actor, { category: "settings", action: "branch.update", entityType: "branch", entityId: inputId, entityLabel: updated.name, summary: "Branch updated", branchId: inputId });
        const latest = await ctx.db.get(branch._id);
        return branchView(latest ?? branch, publicOrganizationId(actor.organization));
      }
      const branchId = await ctx.db.insert("branches", { publicId: newPublicId(), organizationId: actor.organization._id, name: stringValue(input.name), code: stringValue(input.code).toUpperCase(), address: stringValue(input.address), phone: stringValue(input.phone), capacity: numberValue(input.capacity, 120), active: input.status !== "inactive", status: stringValue(input.status, "active") === "inactive" ? "inactive" : "active", createdAt: Date.now(), updatedAt: Date.now() });
      const branch = await ctx.db.get(branchId);
      if (!branch) domainError("NOT_FOUND", "Branch could not be created.", { correlationId: actor.correlationId });
      await insertAudit(ctx, actor, { category: "settings", action: "branch.create", entityType: "branch", entityId: publicBranchId(branch), entityLabel: branch.name, summary: "Branch created", branchId: publicBranchId(branch) });
      return branchView(branch, publicOrganizationId(actor.organization));
    }
    case "users.invite":
      domainError("NOT_FOUND", "Staff invitations use the server-only Clerk invitation action.", { correlationId: actor.correlationId });
    case "users.update": {
      requirePermission(actor, "users.manage");
      const userId = recordId(input.userId);
      const users = await ctx.db.query("users").collect();
      const user = users.find((item) => publicUserId(item) === userId);
      if (!user) domainError("NOT_FOUND", "User not found.", { correlationId: actor.correlationId });
      if (user._id === actor.user._id && input.status === "deactivated") domainError("VALIDATION_ERROR", "You cannot deactivate your own account.", { correlationId: actor.correlationId });
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
      if (!membership) domainError("NOT_FOUND", "User not found.", { correlationId: actor.correlationId });
      if (input.status === "deactivated") {
        const trainerProfile = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
        if (trainerProfile) {
          const futureBookings = await ctx.db.query("ptBookings").withIndex("by_trainer_start", (q) => q.eq("trainerProfileId", trainerProfile._id).gte("startsAt", Date.now())).collect();
          if (futureBookings.some((booking) => ["reserved", "confirmed"].includes(booking.status))) domainError("CONFLICT", "Reassign or cancel this trainer's future PT bookings before deactivating the account.", { correlationId: actor.correlationId });
        }
      }
      if (membership.role === "owner" && actor.role !== "owner") domainError("FORBIDDEN", "Only an owner can change owner access.", { correlationId: actor.correlationId });
      const branchIds = input.branchIds ? arrayValue(input.branchIds).map(String) : membership.branchIds.map((id) => id);
      const branchScope = input.branchScope ? (input.branchScope === "all" ? "all" : "selected") : (membership.branchScope ?? "selected");
      if (branchScope === "all" && actor.branchScope !== "all") domainError("FORBIDDEN", "You cannot grant access to every branch.", { correlationId: actor.correlationId });
      if (branchScope === "selected" && branchIds.length === 0) domainError("VALIDATION_ERROR", "Select at least one branch for selected branch access.", { correlationId: actor.correlationId });
      const resolvedBranches = input.branchIds ? await Promise.all(branchIds.map((id) => branchByPublicId(ctx, actor.organization._id, id))) : [];
      if (input.branchIds) {
        if (resolvedBranches.some((branch) => !branch)) domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
        for (const branch of resolvedBranches) assertBranchAccess(actor, branch);
      }
      const role = input.role ? roleFromFrontend(input.role) : membership.role;
      if (role === "owner" && actor.role !== "owner") domainError("FORBIDDEN", "Only an owner can grant the owner role.", { correlationId: actor.correlationId });
      const targetDefinition = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", role)).unique();
      const targetPermissions = rolePermissions(role, targetDefinition?.permissions, targetDefinition?.catalogVersion);
      if (targetPermissions.some((permission) => !actor.permissions.includes(permission))) domainError("FORBIDDEN", "You cannot grant permissions your role does not possess.", { correlationId: actor.correlationId });
      const nextActive = input.status ? input.status !== "deactivated" : membership.active;
      const nextMembershipValues = { ...membership, role, branchIds: input.branchIds ? resolvedBranches.map((branch) => branch!._id) : membership.branchIds, branchScope, active: nextActive };
      await ctx.db.patch(membership._id, { role, branchIds: nextMembershipValues.branchIds, branchScope, active: nextActive, updatedAt: Date.now() });
      const beforeStatus = organizationUserStatus(user, membership);
      const afterStatus = organizationUserStatus(user, nextMembershipValues);
      await insertAudit(ctx, actor, { category: "users", action: input.status === "deactivated" ? "user.access_deactivate" : "user.access_update", entityType: "user", entityId: publicUserId(user), entityLabel: user.fullName, summary: input.status === "deactivated" ? "Organization access deactivated" : "Organization access updated", reason: input.status === "deactivated" ? "Deactivated by administrator" : undefined, before: { role: membership.role, status: beforeStatus, membershipActive: membership.active }, after: { role, status: afterStatus, membershipActive: nextActive } });
      const updated = await ctx.db.get(user._id);
      const nextMembership = await ctx.db.get(membership._id);
      return { id: publicUserId(updated ?? user), organizationId: publicOrganizationId(actor.organization), name: (updated ?? user).fullName, email: (updated ?? user).email, phone: (updated ?? user).phone ?? "", role: frontendRole((nextMembership ?? membership).role), branchScope: (nextMembership ?? membership).branchScope ?? "selected", branchIds: await Promise.all((nextMembership ?? membership).branchIds.map((id) => publicBranchIdFromId(ctx, actor.organization._id, id))), status: organizationUserStatus(updated ?? user, nextMembership ?? membership) };
    }
    case "roles.update": {
      requirePermission(actor, "users.manage");
      const role = roleFromFrontend(input.role);
      if (role === "owner") domainError("VALIDATION_ERROR", "The owner role always has full access.", { correlationId: actor.correlationId });
      const current = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", role)).unique();
      const fallback = DEFAULT_ROLE_DEFINITIONS[role];
      if (!current) domainError("NOT_FOUND", "Role not found.", { correlationId: actor.correlationId });
      const effectiveCurrentPermissions = rolePermissions(role, current.permissions, current.catalogVersion);
      const requestedPermissions = input.permissions === undefined ? effectiveCurrentPermissions : arrayValue(input.permissions).map(String);
      const invalidPermissions = requestedPermissions.filter((permission) => !PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]));
      if (invalidPermissions.length > 0) domainError("VALIDATION_ERROR", "One or more permissions are not recognized.", { correlationId: actor.correlationId, details: { permissions: invalidPermissions } });
      if (requestedPermissions.some((permission) => !actor.permissions.includes(permission))) domainError("FORBIDDEN", "You cannot grant permissions your role does not possess.", { correlationId: actor.correlationId });
      const discountLimitMinor = input.discountLimitMinor === undefined ? current.discountLimitMinor : numberValue(input.discountLimitMinor);
      if (!Number.isSafeInteger(discountLimitMinor) || discountLimitMinor < 0) domainError("VALIDATION_ERROR", "Discount limit must be a non-negative integer amount.", { correlationId: actor.correlationId });
      const updated = { permissions: requestedPermissions, catalogVersion: PERMISSION_CATALOG_VERSION, discountLimitMinor, updatedAt: Date.now() };
      await ctx.db.patch(current._id, updated);
      await insertAudit(ctx, actor, { category: "users", action: "role.permissions_change", entityType: "role", entityId: publicOrganizationId(actor.organization), entityLabel: current.label, summary: `Permissions updated for the ${current.label} role`, before: { permissions: current.permissions.length, discountLimit: current.discountLimitMinor }, after: { permissions: updated.permissions.length, discountLimit: updated.discountLimitMinor } });
      return { key: frontendRole(role), label: current.label ?? fallback.label, description: current.description ?? fallback.description, permissions: rolePermissions(role, updated.permissions, updated.catalogVersion), catalogVersion: updated.catalogVersion, discountLimitMinor: updated.discountLimitMinor, isSystem: current.isSystem };
    }
    case "approvals.review": {
      requirePermission(actor, "audit.read");
      const eventId = recordId(input.auditEventId);
      const event = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id)).collect().then((rows) => rows.find((row) => row.publicId === eventId));
      if (!event) domainError("NOT_FOUND", "Approval not found.", { correlationId: actor.correlationId });
      if (event.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(event.branchId)) domainError("NOT_FOUND", "Approval not found.", { correlationId: actor.correlationId });
      if (event.approvalStatus !== "pending") domainError("VALIDATION_ERROR", "This approval is not pending.", { correlationId: actor.correlationId });
      const decision = stringValue(input.decision);
      if (decision !== "approved" && decision !== "rejected") domainError("VALIDATION_ERROR", "Approval decision must be approved or rejected.", { correlationId: actor.correlationId });
      const reviews = await recordsOf(ctx, actor, "approvalReview");
      if (reviews.some((review) => data(review.data).auditEventId === eventId)) domainError("VALIDATION_ERROR", "This approval has already been reviewed.", { correlationId: actor.correlationId });
      const approvalPermission = approvalPermissionForAction(event.action);
      if (!approvalPermission) domainError("VALIDATION_ERROR", "This audit event does not support approval review.", { correlationId: actor.correlationId });
      requirePermission(actor, approvalPermission);
      const note = stringValue(input.note);
      requireReason(note, actor.correlationId, "note");
      const before = { ...data(event.before), approvalStatus: "pending" };
      const after = { ...data(event.after), approvalStatus: decision };
      await insertRecord(ctx, actor, "approvalReview", { id: newPublicId(), auditEventId: eventId, decision, note, before, after, reviewedById: publicUserId(actor.user), reviewedAt: isoNow() }, { branchId: event.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, event.branchId) : undefined });
      if (event.entityType === "membership") { const membership = await recordOf(ctx, actor, "membership", event.entityPublicId); await patchRecord(ctx, actor, membership, { discountApprovalStatus: decision }); }
      if (event.entityType === "cash_shift") { const shift = await recordOf(ctx, actor, "shift", event.entityPublicId); await patchRecord(ctx, actor, shift, { varianceApprovalStatus: decision }); }
      await insertAudit(ctx, actor, { category: event.category, action: `${event.action}.${decision}`, entityType: event.entityType, entityId: event.entityPublicId, entityLabel: event.entityLabel, summary: `${decision === "approved" ? "Approved" : "Rejected"}: ${event.summary}`, reason: note, before, after, branchId: event.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, event.branchId) : undefined });
      return undefined;
    }
    case "operations.product.upsert":
    case "operations.product.delete":
    case "operations.product.archive":
    case "operations.supplier.upsert":
    case "operations.supplier.archive":
    case "operations.stock_movement.record":
    case "operations.inventory.transfer":
    case "operations.retail.checkout":
    case "operations.retail.refund":
    case "operations.retail.void":
    case "operations.low_stock.refresh":
    case "operations.low_stock.dismiss":
    case "operations.purchase_order.create":
    case "operations.purchase_order.approve":
    case "operations.purchase_order.receive":
    case "operations.supplier_notification.preview":
    case "operations.facility_task.upsert":
    case "operations.equipment_asset.upsert":
    case "operations.equipment_issue.report":
    case "operations.equipment_issue.update":
    case "operations.equipment_work_order.upsert":
      return await operationsMutation(ctx, actor, operation, input);
    case "accounting.manual_journal.post":
    case "finance.manual_journal.post":
    case "accounting.source.post":
    case "finance.source.post":
    case "accounting.source_postings.refresh":
    case "finance.source_postings.refresh":
    case "accounting.entry.reverse":
    case "finance.entry.reverse":
    case "accounting.period.close":
    case "finance.period.close":
    case "accounting.period.reopen":
    case "finance.period.reopen":
      return await accountingMutation(ctx, actor, operation, input);
    case "demo.reset":
      requirePermission(actor, "settings.manage");
      return undefined;
    default:
      domainError("NOT_FOUND", `Unknown mutation operation ${operation}.`, { correlationId: actor.correlationId });
  }
}

async function settingsView(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const settings = await settingsData(ctx, actor);
  const branches = await accessibleBranches(ctx, actor);
  const brand = await brandKitView(ctx, actor.organization);
  return { organization: { ...organizationView(actor.organization), brand }, brand, branches: branches.map((branch) => branchView(branch, publicOrganizationId(actor.organization))), paymentMethods: settings.paymentMethods, roles: await roleViews(ctx, actor), notifications: settings.notifications, operationalPolicies: settings.operationalPolicies, workspace: await workspaceAccessData(ctx, actor) };
}

async function dashboardData(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "members.read");
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const from = optionalString(input.from) ?? addDays(today, -29);
  const to = optionalString(input.to) ?? today;
  const branchId = optionalString(input.branchId);
  if (branchId) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
  const inBranch = (value: Data) => !branchId || value.branchId === branchId || value.homeBranchId === branchId;
  const inRange = (value: Data, field: string) => {
    const date = businessDate(stringValue(value[field]), actor.organization.timezone || TZ_FALLBACK);
    return date >= from && date <= to;
  };
  const allPayments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch);
  const validPayments = allPayments.filter((payment) => payment.status !== "voided" && inRange(payment, "occurredAt"));
  const allValidPayments = allPayments.filter((payment) => payment.status !== "voided");
  const revenueSummary = dashboardRevenueSummary(
    allPayments.map((payment) => ({ type: stringValue(payment.type), status: optionalString(payment.status), amount: amountOf(payment.amount), occurredAt: stringValue(payment.occurredAt) })),
    { today, from, to, timezone: actor.organization.timezone || TZ_FALLBACK },
  );
  const members = (await memberRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch);
  const memberships = (await membershipRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch);
  const leads = (await recordsOf(ctx, actor, "lead")).map((record) => data(record.data)).filter(inBranch);
  const tasks = (await recordsOf(ctx, actor, "task")).map((record) => data(record.data)).filter(inBranch);
  const checkins = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data)).filter((checkin) => inBranch(checkin) && inRange(checkin, "occurredAt"));
  const outstanding = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch).reduce((sum, charge) => sum + collectibleOutstandingValue(charge, today), 0);
  const activeLeads = leads.filter((lead) => !["won", "lost"].includes(stringValue(lead.stage))).length;
  const overdue = tasks.filter((task) => task.status === "open" && stringValue(task.dueAt) < isoNow()).length;
  const renewals = memberships.filter((membership) => { const status = statusOfMembership(membership, today); const days = diffDays(today, stringValue(membership.endDate)); return (status === "expiring" || status === "active") && days <= 7 && days >= 0; }).length;
  const expiredUnactioned = memberships.filter((membership) => statusOfMembership(membership, today) === "expired" && !memberships.some((other) => other.previousMembershipId === membership.id)).length;
  const checkinsToday = checkins.filter((checkin) => checkin.decision !== "blocked" && businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today).length;
  const branchRows = await accessibleBranches(ctx, actor);
  const branchRevenue = await Promise.all(branchRows.map(async (branch) => { const id = publicBranchId(branch); const collected = validPayments.filter((payment) => payment.branchId === id && ["payment", "retail_sale"].includes(stringValue(payment.type))).reduce((sum, payment) => sum + amountOf(payment.amount), 0); const branchMembers = members.filter((member) => member.homeBranchId === id); return { branchId: id, branchName: branch.name, collected: money(collected, actor.organization.currency), checkInsToday: checkins.filter((checkin) => checkin.branchId === id && businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today).length, activeMembers: branchMembers.filter((member) => member.status === "active").length }; }));
  const funnelStages = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];
  const funnel = funnelStages.map((stage) => ({ stage, label: stage.replaceAll("_", " "), count: leads.filter((lead) => lead.stage === stage).length }));
  const organizationMemberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const users = (await Promise.all(organizationMemberships.filter((membership) => membership.active).map((membership) => ctx.db.get(membership.userId)))).filter((user): user is User => Boolean(user));
  const leaderboard = await Promise.all(users.map(async (user) => { const id = publicUserId(user); const userPayments = allValidPayments.filter((payment) => payment.collectedById === id && ["payment", "retail_sale"].includes(stringValue(payment.type)) && businessDate(stringValue(payment.occurredAt), actor.organization.timezone || TZ_FALLBACK).slice(0, 7) === today.slice(0, 7)); return { userId: id, name: user.fullName, revenueCollected: money(userPayments.reduce((sum, payment) => sum + amountOf(payment.amount), 0), actor.organization.currency), newSales: memberships.filter((membership) => membership.soldById === id && !membership.previousMembershipId).length, renewals: memberships.filter((membership) => membership.soldById === id && Boolean(membership.previousMembershipId)).length, leadsConverted: leads.filter((lead) => lead.ownerId === id && lead.stage === "won").length, followUpsCompleted: tasks.filter((task) => task.ownerId === id && task.status === "completed").length, overdueFollowUps: tasks.filter((task) => task.ownerId === id && task.status === "open" && stringValue(task.dueAt) < isoNow()).length }; }));
  const audits = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id)).order("desc").take(12);
  const approvalReviews = await recordsOf(ctx, actor, "approvalReview");
  const reviewedApprovalIds = new Set(approvalReviews.map((review) => stringValue(data(review.data).auditEventId)));
  const alerts = audits
    .filter((event) => event.approvalStatus === "pending" && !reviewedApprovalIds.has(event.publicId))
    .slice(0, 8)
    .map((event) => ({ id: event.publicId, kind: event.action.includes("variance") ? "pending_variance" : event.action.includes("discount") ? "pending_discount" : "approval", title: event.summary, detail: event.reason ?? "Review required", actorName: event.actorName, href: event.entityType === "cash_shift" ? "/payments/shifts" : "/audit", severity: "warning", occurredAt: utcIso(event.occurredAt) }));
  const timeline = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt))).slice(0, 10);
  return { kpis: { revenueToday: money(revenueSummary.revenueToday, actor.organization.currency), revenueThisMonth: money(revenueSummary.revenueThisMonth, actor.organization.currency), revenuePrevMonth: money(revenueSummary.revenuePrevMonth, actor.organization.currency), outstandingTotal: money(outstanding, actor.organization.currency), newMembersThisMonth: members.filter((member) => businessDate(stringValue(member.createdAt), actor.organization.timezone || TZ_FALLBACK).slice(0, 7) === today.slice(0, 7)).length, renewalsDueNext7Days: renewals, expiredUnactioned, checkInsToday: checkinsToday, activeLeads, overdueFollowUps: overdue }, revenueSeries: revenueSummary.revenueSeries, branchRevenue, funnel, leaderboard, alerts, recentActivity: timeline };
}

export const query = convexQuery({
  args: OPERATION_ARGS,
  handler: async (ctx, args) => {
    try {
      return await queryData(ctx, args.operation, data(args.input), args);
    } catch (error) {
      logRedactedServerError({ operation: args.operation, correlationId: args.correlationId, error });
      throw error;
    }
  },
});

export const mutate = convexMutation({
  args: OPERATION_ARGS,
  handler: async (ctx, args) => {
    try {
      return await mutationData(ctx, args.operation, data(args.input), args);
    } catch (error) {
      logRedactedServerError({ operation: args.operation, correlationId: args.correlationId, error });
      throw error;
    }
  },
});
