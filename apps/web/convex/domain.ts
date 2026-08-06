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
  requirePermission,
  requirePlatformAdmin,
  requireReason,
  type ActorContext,
  type OrganizationRole,
  type RequestArgs,
} from "./security";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSIONS, roleDiscountLimit, toFrontendRole } from "./permissions";
import { approvalPermissionForAction, deriveServerMembershipStatus, isValidMinorUnit, paymentAllocation, refundAllocation } from "./invariants";

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
const DEFAULT_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true },
  { key: "card", label: "Card", enabled: true, affectsCashDrawer: false },
  { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false },
  { key: "cliq", label: "CliQ", enabled: true, affectsCashDrawer: false },
  { key: "other", label: "Other", enabled: false, affectsCashDrawer: false },
];
const DEFAULT_NOTIFICATIONS = {
  managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true },
  automationDeliveryMode: "sandbox",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};
const ENTRY_PASS_PREFIX = "rivet-pass";
const ENTRY_PASS_TTL_MS = 15 * 60_000;

function data(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function businessDate(value: string, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return value.slice(0, 10);
  }
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

async function recordsOf(ctx: ReadContext, actor: ActorContext, entityType: string): Promise<DomainRecord[]> {
  const records = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType))
    .collect();
  if (actor.branchScope === "all") return records;
  return records.filter((record) => !record.branchId || actor.branchIds.includes(record.branchId));
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
  return {
    paymentMethods: current.paymentMethods ?? DEFAULT_PAYMENT_METHODS,
    notifications: current.notifications ?? DEFAULT_NOTIFICATIONS,
  };
}

function organizationView(org: Organization): Data {
  return {
    id: publicOrganizationId(org),
    name: org.name,
    slug: org.slug,
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
      permissions: definition?.permissions ?? fallback.permissions,
      discountLimitMinor: definition?.discountLimitMinor ?? fallback.discountLimitMinor,
      isSystem: definition?.isSystem ?? true,
    };
  });
}

async function buildSession(ctx: ReadContext, actor: ActorContext, activeBranchId?: string): Promise<Data> {
  const branches = await accessibleBranches(ctx, actor);
  let selected: Branch | undefined;
  if (activeBranchId) {
    selected = branches.find((branch) => publicBranchId(branch) === activeBranchId);
    if (!selected) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  } else if (actor.branchScope === "selected") {
    selected = branches[0];
  }
  return {
    user: { id: publicUserId(actor.user), name: actor.user.fullName, email: actor.user.email },
    organization: {
      id: publicOrganizationId(actor.organization),
      name: actor.organization.name,
      currency: actor.organization.currency,
      timezone: actor.organization.timezone,
      locale: actor.organization.locale ?? "en-JO",
    },
    branches: branches.map((branch) => ({ id: publicBranchId(branch), name: branch.name, code: branch.code })),
    activeBranchId: selected ? publicBranchId(selected) : undefined,
    roles: [frontendRole(actor.role)],
    permissions: actor.permissions,
  };
}

function statusOfMembership(value: Data, today: string): string {
  return deriveServerMembershipStatus({ cancelledAt: value.cancelledAt, freezeStatus: data(value.activeFreeze).status, startDate: stringValue(value.startDate), endDate: stringValue(value.endDate), totalVisits: value.totalVisits, remainingVisits: value.remainingVisits }, today);
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
  const usable = terms.filter((item) => ["active", "expiring", "frozen", "scheduled", "depleted"].includes(item.status));
  return (usable.length ? usable : terms).sort((a, b) => stringValue(b.membership.endDate).localeCompare(stringValue(a.membership.endDate)))[0]?.membership;
}

async function outstandingForMember(ctx: ReadContext, actor: ActorContext, memberId: string): Promise<Data> {
  const total = (await chargeRecords(ctx, actor))
    .map((record) => data(record.data))
    .filter((charge) => charge.memberId === memberId && charge.status !== "refunded")
    .reduce((sum, charge) => sum + Math.max(0, amountOf(charge.outstandingAmount)), 0);
  return money(total, actor.organization.currency);
}

async function toMemberSummary(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const membership = await currentMembership(ctx, actor, stringValue(value.id));
  const plan = membership ? await recordOfOptional(ctx, actor, "plan", stringValue(membership.planId)) : null;
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
    outstanding: await outstandingForMember(ctx, actor, stringValue(value.id)),
    lastCheckInAt: checkins[0] ? optionalString(checkins[0].occurredAt) : undefined,
    createdAt: stringValue(value.createdAt, isoNow()),
  };
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
  const detail: Data = {
    ...summary,
    gender: optionalString(value.gender),
    dateOfBirth: optionalString(value.dateOfBirth),
    preferredLanguage: stringValue(value.preferredLanguage, "en"),
    emergencyContactName: optionalString(value.emergencyContactName),
    emergencyContactPhone: optionalString(value.emergencyContactPhone),
    source: optionalString(value.source),
    assignedSalespersonId: optionalString(value.assignedSalespersonId),
    marketingOptIn: booleanValue(value.marketingOptIn),
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
  return { ...value, activeSubscribers: subscribers, basePrice: { ...data(value.basePrice), currency: currencyOf(value.basePrice, actor.organization.currency) } };
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
  return {
    ...membership,
    memberName: memberRecord ? stringValue(data(memberRecord.data).fullName) : "Unknown member",
    memberNumber: memberRecord ? stringValue(data(memberRecord.data).memberNumber) : "—",
    planName: planRecord ? stringValue(data(planRecord.data).name) : "Unknown plan",
    branchName: branch?.name ?? "—",
    planFreezeAllowanceDays: planRecord ? numberValue(data(planRecord.data).freezeAllowanceDays) : 0,
    outstanding: charge?.outstandingAmount ?? money(0, actor.organization.currency),
  };
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
    charge: chargeRecord ? data(chargeRecord.data) : undefined,
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

async function toTransaction(ctx: ReadContext, actor: ActorContext, value: Data): Promise<Data> {
  const member = await recordOfOptional(ctx, actor, "member", stringValue(value.memberId));
  const branch = await branchByPublicId(ctx, actor.organization._id, optionalString(value.branchId));
  return {
    ...value,
    memberName: member ? stringValue(data(member.data).fullName) : "—",
    memberNumber: member ? stringValue(data(member.data).memberNumber) : "—",
    branchName: branch?.name ?? "—",
  };
}

async function receiptDetail(ctx: ReadContext, actor: ActorContext, receiptId: string): Promise<Data> {
  const receipt = await recordOf(ctx, actor, "receipt", receiptId);
  const receiptData = data(receipt.data);
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
  if (actor.branchScope === "selected") rows = rows.filter((row) => !row.branchId || actor.branchIds.includes(row.branchId));
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
    (!branch || row.branchId === branch._id) &&
    (!from || row.occurredAt >= new Date(from).getTime()) &&
    (!to || row.occurredAt <= new Date(`${to}T23:59:59.999Z`).getTime()) &&
    matchesSearch([row.summary, row.entityLabel, row.actorName, row.action], optionalString(input.search)),
  );
  const mapped = await Promise.all(rows.map(async (row) => ({
    id: row.publicId,
    organizationId: publicOrganizationId(actor.organization),
    branchId: row.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.branchId) : undefined,
    actorId: row.actorPublicId,
    actorName: row.actorName,
    actorRole: frontendRole(row.actorRole),
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
    rating: numberValue(value.rating),
    reviewCount: numberValue(value.reviewCount),
    memberCount: numberValue(value.memberCount),
    branchCount: numberValue(value.branchCount),
    fromPriceMinor: numberValue(value.fromPriceMinor),
    amenities: arrayValue(value.amenities),
    accent: stringValue(value.accent),
    featured: booleanValue(value.featured),
    subscriptionStatus: stringValue(value.subscriptionStatus),
    rivetPlan: stringValue(value.rivetPlan),
    joinedAt: stringValue(value.joinedAt),
    lastActiveAt: stringValue(value.lastActiveAt),
    // Revenue is platform-private. Public discovery receives a zero placeholder
    // to preserve the existing view model without disclosing tenant finances.
    monthlyRevenueMinor: includePlatformFields ? numberValue(value.monthlyRevenueMinor) : 0,
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

function gymApplicationView(application: Doc<"gymApplications">): Data {
  return {
    id: application.publicId,
    gymName: application.gymName,
    ownerName: application.ownerName,
    email: application.email,
    contactNumber: application.contactNumber,
    plan: application.plan,
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
  };
}

async function marketplaceRows(ctx: ReadContext): Promise<DomainRecord[]> {
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym"))
    .collect();
}

async function customerExperience(ctx: QueryCtx): Promise<Data> {
  const { user } = await requireAuthenticated(ctx);
  const userId = publicUserId(user);
  const records = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerProfile")).collect();
  const profile = records.map((record) => data(record.data)).find((value) => value.userId === userId || normalize(optionalString(value.email)) === normalize(user.email));
  const memberships = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership")).collect())
    .map((record): Data => ({ id: record.publicId, ...data(record.data) }))
    .filter((value) => value.customerUserId === userId || value.customerId === profile?.id)
    .map((value) => ({ ...value, qrValue: "" }));
  const bookings = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect())
    .map((record): Data => ({ id: record.publicId, ...data(record.data) }))
    .filter((value) => value.customerUserId === userId || value.customerId === profile?.id);
  return {
    customer: profile
      ? {
          id: stringValue(profile.id),
          name: stringValue(profile.name),
          nameAr: stringValue(profile.nameAr, stringValue(profile.name)),
          email: stringValue(profile.email),
          phone: stringValue(profile.phone),
          initials: stringValue(profile.initials),
          context: stringValue(profile.context, "RIVET member"),
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
  const { user } = await requireAuthenticated(ctx);
  const membershipId = recordId(input.membershipId);
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerMembership")).collect();
  const membership = rows.find((row) => row.publicId === membershipId && data(row.data).customerUserId === publicUserId(user));
  if (!membership) domainError("NOT_FOUND", "Membership not found.");
  const organization = await ctx.db.get(membership.organizationId);
  if (!organization) domainError("NOT_FOUND", "Gym not found.");
  const membershipData = data(membership.data);
  const member = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", membership.organizationId).eq("entityType", "member")).collect())
    .find((row) => data(row.data).id === membershipData.memberId || data(row.data).memberNumber === membershipData.memberNumber);
  const passId = crypto.randomUUID();
  const expiresAt = Date.now() + ENTRY_PASS_TTL_MS;
  const branch = membership.branchId ? await ctx.db.get(membership.branchId) : null;
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    v: 1,
    passId,
    organizationId: publicOrganizationId(organization),
    membershipId: membership.publicId,
    customerUserId: publicUserId(user),
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
  const { user } = await requireAuthenticated(ctx);
  const profileRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "customerProfile")).collect();
  const existing = profileRows.find((record) => data(record.data).userId === publicUserId(user) || normalize(optionalString(data(record.data).email)) === normalize(user.email));
  const fullName = stringValue(input.fullName, user.fullName).trim() || user.fullName;
  const email = stringValue(input.email, user.email).trim().toLowerCase();
  const initials = fullName.split(/\s+/).filter(Boolean).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase();
  const value = { id: existing?.publicId ?? newPublicId(), userId: publicUserId(user), name: fullName, nameAr: fullName, email, phone: stringValue(input.phone, user.phone ?? ""), initials, context: "RIVET member" };
  const organization = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "forge-fitness")).unique();
  if (!organization) domainError("CONFIGURATION_ERROR", "The customer directory is not initialized.");
  if (existing) await ctx.db.patch(existing._id, { data: value, updatedAt: Date.now() });
  else await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "customerProfile", publicId: value.id, createdAt: Date.now(), updatedAt: Date.now(), data: value });
  return value;
}

async function createCustomerTrial(ctx: MutationCtx, input: Data): Promise<Data> {
  const { user } = await requireAuthenticated(ctx);
  const gyms = await marketplaceRows(ctx);
  const gymRecord = gyms.find((record) => record.publicId === stringValue(input.gymId));
  if (!gymRecord || !booleanValue(data(gymRecord.data).isPublic)) domainError("NOT_FOUND", "Gym not found.");
  const gym = data(gymRecord.data);
  const targetOrgPublicId = optionalString(gym.targetOrganizationId);
  const targetOrganization = targetOrgPublicId
    ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", targetOrgPublicId)).unique()
    : null;
  if (!targetOrganization) domainError("NOT_FOUND", "This gym is not accepting online trial requests yet.");
  const storageOrganization = targetOrganization;
  const directoryBranch = arrayValue(gym.branches).map(data).find((branch) => branch.id === input.branchId);
  const actualBranchId = optionalString(directoryBranch?.internalBranchId);
  const branch = actualBranchId
    ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("publicId", actualBranchId)).unique()
    : null;
  if (!branch) domainError("NOT_FOUND", "The selected gym branch is not accepting online trial requests yet.");
  const bookingId = newPublicId();
  const createdAt = isoNow();
  const base = {
    id: bookingId,
    customerUserId: publicUserId(user),
    customerId: optionalString(input.customerId),
    gymId: stringValue(input.gymId),
    branchId: stringValue(input.branchId),
    fullName: stringValue(input.fullName, user.fullName),
    email: stringValue(input.email, user.email).trim().toLowerCase(),
    phone: stringValue(input.phone, user.phone ?? ""),
    preferredDate: stringValue(input.preferredDate),
    preferredTime: stringValue(input.preferredTime),
    goal: stringValue(input.goal),
    status: "requested",
    createdAt,
  };
  await ctx.db.insert("domainRecords", { organizationId: storageOrganization._id, entityType: "trialBooking", publicId: bookingId, branchId: branch?._id, createdAt: Date.now(), updatedAt: Date.now(), data: base });

  let leadId: string | undefined;
  if (branch) {
    leadId = newPublicId();
    const branchPublicId = publicBranchId(branch);
    const lead = { id: leadId, organizationId: publicOrganizationId(targetOrganization), branchId: branchPublicId, fullName: base.fullName, phone: base.phone, email: base.email, stage: "trial_booked", source: "other", expectedValue: money(numberValue(gym.fromPriceMinor), targetOrganization.currency), nextFollowUpAt: new Date(`${base.preferredDate}T${base.preferredTime}:00+03:00`).toISOString(), notes: `Free trial requested through RIVET Member. Goal: ${base.goal}`, createdAt, updatedAt: createdAt };
    await ctx.db.insert("domainRecords", { organizationId: targetOrganization._id, entityType: "lead", publicId: leadId, branchId: branch._id, leadPublicId: leadId, createdAt: Date.now(), updatedAt: Date.now(), data: lead });
    await ctx.db.patch((await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", storageOrganization._id).eq("entityType", "trialBooking").eq("publicId", bookingId)).unique())!._id, { data: { ...base, leadId }, updatedAt: Date.now() });
  }
  return { ...base, ...(leadId ? { leadId } : {}) };
}

async function queryData(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "session") {
    const actor = await requireActor(ctx, request);
    return await buildSession(ctx, actor, request.activeBranchId);
  }

  if (operation === "health") {
    return { status: "ok", serverTime: Date.now() };
  }

  if (operation === "public.marketplace") {
    const rows = await marketplaceRows(ctx);
    return rows.filter((row) => booleanValue(data(row.data).isPublic)).map((row) => marketplaceView(data(row.data)));
  }
  if (operation === "public.catalog") {
    return (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect()).map((row): Data => ({ id: row.publicId, ...data(row.data) }));
  }
  if (operation === "customer.experience") return await customerExperience(ctx);
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
  if (operation === "platform.snapshot") {
    await requirePlatformAdmin(ctx, request.correlationId);
    const gyms = (await marketplaceRows(ctx)).map((row) => marketplaceView(data(row.data), true));
    const bookings = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "trialBooking")).collect()).map((row): Data => ({ id: row.publicId, ...data(row.data) }));
    const invoices = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect()).map((row): Data => ({ id: row.publicId, ...data(row.data) }));
    const supportCases = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "supportCase")).collect()).map((row): Data => ({ id: row.publicId, ...data(row.data) }));
    const plans = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect()).map((row): Data => ({ id: row.publicId, ...data(row.data) }));
    return { gyms, bookings, invoices, supportCases, plans };
  }

  const actor = await requireActor(ctx, request);
  const orgId = publicOrganizationId(actor.organization);

  switch (operation) {
    case "settings.get": {
      const branches = await accessibleBranches(ctx, actor);
      const settings = await settingsData(ctx, actor);
      return {
        organization: organizationView(actor.organization),
        branches: branches.map((branch) => branchView(branch, orgId)),
        paymentMethods: settings.paymentMethods,
        roles: await roleViews(ctx, actor),
        notifications: settings.notifications,
      };
    }
    case "branches.list":
      return (await accessibleBranches(ctx, actor)).map((branch) => branchView(branch, orgId));
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
    case "members.list": {
      requirePermission(actor, "members.read");
      const branchId = optionalString(input.branchId);
      if (branchId) {
        const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
        assertBranchAccess(actor, branch);
      }
      const records = await memberRecords(ctx, actor);
      let items = await Promise.all(records.map((record) => toMemberSummary(ctx, actor, data(record.data))));
      if (branchId) items = items.filter((member) => member.homeBranchId === branchId);
      if (input.status) items = items.filter((member) => member.status === input.status);
      if (input.planId) {
        const memberships = await membershipRecords(ctx, actor);
        const memberIds = memberships.map((record) => data(record.data)).filter((membership) => membership.planId === input.planId).map((membership) => membership.memberId);
        items = items.filter((member) => memberIds.includes(member.id));
      }
      if (input.membershipStatus) {
        if (input.membershipStatus === "outstanding") items = items.filter((member) => amountOf(member.outstanding) > 0);
        else items = items.filter((member) => member.membershipStatus === input.membershipStatus);
      }
      items = items.filter((member) => matchesSearch([member.fullName, member.fullNameAr, member.phone, member.memberNumber, member.email], optionalString(input.search)));
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
      if (branchId) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      let items = await Promise.all((await membershipRecords(ctx, actor)).map((record) => toMembershipSummary(ctx, actor, data(record.data))));
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
      let items = await Promise.all((await recordsOf(ctx, actor, "lead")).map((record) => toLeadSummary(ctx, actor, data(record.data))));
      if (input.branchId) {
        assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, stringValue(input.branchId)));
        items = items.filter((lead) => lead.branchId === input.branchId);
      }
      if (input.stage) {
        const stages = Array.isArray(input.stage) ? input.stage : [input.stage];
        items = items.filter((lead) => stages.includes(lead.stage));
      }
      if (input.ownerId === "unassigned") items = items.filter((lead) => !lead.ownerId);
      else if (input.ownerId) items = items.filter((lead) => lead.ownerId === input.ownerId);
      if (input.overdueOnly) items = items.filter((lead) => lead.overdue);
      items = items.filter((lead) => matchesSearch([lead.fullName, lead.phone, lead.email], optionalString(input.search)));
      items = sortRecords(items, input.sort ?? "-createdAt", (lead, key) => stringValue(lead[key]));
      return page(items, input);
    }
    case "leads.get": {
      requirePermission(actor, "crm.read");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const leadId = stringValue(data(lead.data).id);
      const activities = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).filter((event) => event.leadId === leadId);
      const offers = (await recordsOf(ctx, actor, "offer")).map((record) => data(record.data)).filter((offer) => offer.leadId === leadId);
      return { ...(await toLeadSummary(ctx, actor, data(lead.data))), notes: optionalString(data(lead.data).notes), activities, offers };
    }
    case "tasks.list": {
      requirePermission(actor, "crm.read");
      let items = await Promise.all((await recordsOf(ctx, actor, "task")).map((record) => toTask(ctx, actor, data(record.data))));
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
      const items: Data[] = [];
      const memberships = await membershipRecords(ctx, actor);
      const memberRows = await memberRecords(ctx, actor);
      const terms = memberships.map((record) => data(record.data));
      for (const term of terms) {
        const member = memberRows.map((record) => data(record.data)).find((item) => item.id === term.memberId);
        if (!member || member.status !== "active") continue;
        if (terms.some((other) => other.previousMembershipId === term.id)) continue;
        const daysUntil = diffDays(today, stringValue(term.endDate));
        const status = statusOfMembership(term, today);
        if (input.bucket === "expired") {
          if (status !== "expired" || daysUntil < -45) continue;
        } else if (!(status === "expiring" || (status === "active" && daysUntil <= 14))) continue;
        const memberSummary = await toMemberSummary(ctx, actor, member);
        const membershipSummary = await toMembershipSummary(ctx, actor, term);
        const calls = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).filter((event) => event.memberId === member.id && event.type === "call_attempt").sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt)));
        const openTask = (await recordsOf(ctx, actor, "task")).map((record) => data(record.data)).find((task) => task.memberId === member.id && task.status === "open" && task.type === "renewal_call");
        items.push({ member: memberSummary, membership: membershipSummary, daysUntilExpiry: daysUntil, lastContactAt: calls[0]?.occurredAt, lastContactOutcome: optionalString(data(calls[0]?.meta).outcome), openTaskId: optionalString(openTask?.id) });
      }
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
      let items = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data));
      if (input.branchId) {
        assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, stringValue(input.branchId)));
        items = items.filter((item) => item.branchId === input.branchId);
      }
      if (input.memberId) items = items.filter((item) => item.memberId === input.memberId);
      if (input.since) items = items.filter((item) => stringValue(item.occurredAt) >= stringValue(input.since));
      return page(items, input);
    }
    case "checkins.occupancy": {
      requirePermission(actor, "members.read");
      const branchId = recordId(input.branchId);
      const branch = await branchByPublicId(ctx, actor.organization._id, branchId);
      assertBranchAccess(actor, branch);
      const cutoff = Date.now() - 90 * 60_000;
      const rows = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data)).filter((item) => item.branchId === branchId && item.decision !== "blocked");
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const todayRows = rows.filter((item) => businessDate(stringValue(item.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today);
      return { branchId, current: rows.filter((item) => new Date(stringValue(item.occurredAt)).getTime() >= cutoff).length, capacity: branch.capacity ?? 120, checkInsToday: todayRows.length, peakHour: peakHour(todayRows, actor.organization.timezone || TZ_FALLBACK) };
    }
    case "transactions.list": {
      requirePermission(actor, "reports.financial.read");
      let items = await Promise.all((await paymentRecords(ctx, actor)).map((record) => toTransaction(ctx, actor, data(record.data))));
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
      let executions = (await recordsOf(ctx, actor, "automationExecution")).map((record) => data(record.data));
      if (input.ruleId) executions = executions.filter((execution) => execution.ruleId === input.ruleId);
      executions.sort((a, b) => stringValue(b.executedAt).localeCompare(stringValue(a.executedAt)));
      return page(executions, input);
    }
    case "automations.templates": {
      requirePermission(actor, "automations.manage");
      return (await recordsOf(ctx, actor, "messageTemplate")).map((record) => data(record.data));
    }
    case "audit.list":
      return await auditPage(ctx, actor, input);
    case "approvals.list": {
      requirePermission(actor, "audit.read");
      let rows = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id)).order("desc").collect();
      if (actor.branchScope === "selected") rows = rows.filter((row) => !row.branchId || actor.branchIds.includes(row.branchId));
      const reviews = await recordsOf(ctx, actor, "approvalReview");
      const reviewedIds = new Set(reviews.map((review) => optionalString(data(review.data).auditEventId)).filter(Boolean));
      return await Promise.all(rows.filter((row) => row.approvalStatus === "pending" && !reviewedIds.has(row.publicId)).map(async (row) => ({ id: row.publicId, organizationId: orgId, branchId: row.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, row.branchId) : undefined, actorId: row.actorPublicId, actorName: row.actorName, actorRole: frontendRole(row.actorRole), category: row.category, action: row.action, entityType: row.entityType, entityId: row.entityPublicId, entityLabel: row.entityLabel, summary: row.summary, reason: row.reason, before: row.before, after: row.after, approvalStatus: row.approvalStatus, correlationId: row.correlationId, occurredAt: utcIso(row.occurredAt) })));
    }
    case "users.list": {
      requirePermission(actor, "users.manage");
      const users = await ctx.db.query("users").collect();
      const output: Data[] = [];
      for (const user of users) {
        const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id)).unique();
        if (!membership) continue;
        const row: Data = { id: publicUserId(user), organizationId: orgId, name: user.fullName, email: user.email, phone: user.phone ?? "", role: frontendRole(membership.role), branchScope: membership.branchScope ?? (membership.role === "owner" || membership.role === "manager" ? "all" : "selected"), branchIds: await Promise.all(membership.branchIds.map((id) => publicBranchIdFromId(ctx, actor.organization._id, id))), status: user.status ?? (membership.invitationStatus === "pending" ? "invited" : "active"), invitedAt: membership.invitedAt ? utcIso(membership.invitedAt) : undefined };
        output.push(row);
      }
      const filtered = output.filter((user) => (!input.role || user.role === input.role) && (!input.status || user.status === input.status) && matchesSearch([user.name, user.email, user.phone], optionalString(input.search)));
      return page(sortRecords(filtered, input.sort ?? "name", (user, key) => stringValue(user[key])), input);
    }
    case "dashboard":
      return await dashboardData(ctx, actor, input);
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
  const membership = await currentMembership(ctx, actor, stringValue(member.id));
  const plan = membership ? await recordOfOptional(ctx, actor, "plan", stringValue(membership.planId)) : null;
  const checks = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data));
  const duplicate = checks.some((checkin) => checkin.memberId === member.id && checkin.branchId === branchId && checkin.decision !== "blocked" && Date.now() - new Date(stringValue(checkin.occurredAt)).getTime() < 2 * 60_000);
  const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
  const codes: string[] = [];
  let decision = "allowed";
  let message = "Membership valid. Welcome in.";
  if (duplicate) {
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
        if (daysLeft <= 7) codes.push("EXPIRES_SOON");
        if (amountOf(await outstandingForMember(ctx, actor, stringValue(member.id))) > 0) codes.push("OUTSTANDING_BALANCE");
        if (codes.length > 0) {
          decision = "warning";
          const parts: string[] = [];
          if (codes.includes("EXPIRES_SOON")) parts.push(daysLeft === 0 ? "membership expires today" : `membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
          if (codes.includes("OUTSTANDING_BALANCE")) parts.push("outstanding balance due");
          message = `Allowed with notice — ${parts.join("; ")}.`;
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
): Promise<{ payment: Data; receipt: Data; receiptId: string }> {
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
    return { payment: data(payment.data), receipt: data(receipt.data), receiptId: stringValue(result.receiptId) };
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
  const charge = chargeRecordsList
    .find((record) => requestedChargeId ? record.publicId === requestedChargeId : data(record.data).memberId === memberId && amountOf(data(record.data).outstandingAmount) > 0);
  if (!charge) domainError("NO_OUTSTANDING_BALANCE", "No outstanding balance is available for this member.", { correlationId: actor.correlationId });
  const chargeData = data(charge.data);
  if (chargeData.memberId !== memberId) domainError("NOT_FOUND", "Charge not found.", { correlationId: actor.correlationId });
  const outstanding = amountOf(chargeData.outstandingAmount);
  const allocation = paymentAllocation(amount, outstanding);
  if (!allocation.ok) domainError("VALIDATION_ERROR", allocation.code === "AMOUNT_EXCEEDS_OUTSTANDING" ? "Payment cannot exceed the outstanding balance." : "Payment amount must be greater than zero.", { correlationId: actor.correlationId, fieldErrors: { amount: [allocation.code === "AMOUNT_EXCEEDS_OUTSTANDING" ? "Cannot exceed outstanding balance" : "Must be a positive integer"] } });
  const method = stringValue(input.method, "cash");
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
    externalReference: optionalString(input.externalReference),
    idempotencyKey,
    occurredAt: now,
  };
  const receipt = { id: allocated.id, receiptNumber: allocated.number, paymentId: payment.id, issuedAt: now };
  await insertRecord(ctx, actor, "payment", payment, { branchId, memberPublicId: memberId });
  await insertRecord(ctx, actor, "receipt", receipt, { branchId, memberPublicId: memberId });
  const paid = amountOf(chargeData.paidAmount) + amount;
  await patchRecord(ctx, actor, charge, { paidAmount: money(paid, actor.organization.currency), outstandingAmount: money(Math.max(0, outstanding - amount), actor.organization.currency), status: paymentStatusForCharge(amountOf(chargeData.total), paid) });
  await insertTimeline(ctx, actor, { memberId, type: "payment_collected", title: `Payment collected — ${actor.organization.currency} ${(amount / 1000).toFixed(3)} ${method.replace("_", " ")}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { receiptNumber: allocated.number, receiptId: allocated.id } });
  await ctx.db.insert("idempotencyRecords", { organizationId: actor.organization._id, operation: "payment.create", key: idempotencyKey, requestHash, result: { paymentId: payment.id, receiptId: receipt.id }, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 * 365 });
  return { payment, receipt, receiptId: receipt.id };
}

async function shiftTotals(ctx: ReadContext, actor: ActorContext, shift: Data): Promise<Data> {
  const payments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => payment.shiftId === shift.id);
  const total = (method: string, type = "payment") => payments.filter((payment) => payment.method === method && payment.type === type).reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
  const discounts = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).filter((charge) => payments.some((payment) => payment.chargeId === charge.id)).reduce((sum, charge) => sum + amountOf(charge.discount), 0);
  return { cashPayments: money(total("cash"), actor.organization.currency), cashRefunds: money(total("cash", "refund"), actor.organization.currency), cardPayments: money(total("card"), actor.organization.currency), transferPayments: money(total("bank_transfer") + total("cliq"), actor.organization.currency), otherPayments: money(total("other"), actor.organization.currency), paymentCount: payments.filter((payment) => payment.type === "payment").length, refundCount: payments.filter((payment) => payment.type === "refund").length, discountsTotal: money(discounts, actor.organization.currency) };
}

async function dailyReconciliation(ctx: ReadContext, actor: ActorContext, branchId: string, date: string): Promise<Data> {
  const payments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => payment.branchId === branchId && businessDate(stringValue(payment.occurredAt), actor.organization.timezone || TZ_FALLBACK) === date);
  const methods = ["cash", "card", "bank_transfer", "cliq", "other"];
  const totalsByMethod = methods.map((method) => {
    const rows = payments.filter((payment) => payment.method === method);
    const collected = rows.filter((payment) => payment.type === "payment").reduce((sum, payment) => sum + amountOf(payment.amount), 0);
    const refunded = rows.filter((payment) => payment.type === "refund").reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
    return { method, payments: money(collected, actor.organization.currency), refunds: money(refunded, actor.organization.currency), net: signedMoney(collected - refunded, actor.organization.currency), count: rows.length };
  }).filter((item) => item.count > 0);
  const shifts = (await recordsOf(ctx, actor, "shift")).map((record) => data(record.data)).filter((shift) => shift.branchId === branchId && businessDate(stringValue(shift.openedAt), actor.organization.timezone || TZ_FALLBACK) === date);
  return { branchId, date, totalsByMethod, totalCollected: money(payments.filter((payment) => payment.type === "payment").reduce((sum, payment) => sum + amountOf(payment.amount), 0), actor.organization.currency), totalRefunded: money(payments.filter((payment) => payment.type === "refund").reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0), actor.organization.currency), discountsTotal: money(0, actor.organization.currency), shifts, totalVariance: signedMoney(shifts.reduce((sum, shift) => sum + amountOf(shift.variance), 0), actor.organization.currency) };
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
    const result = await createMemberMutation(ctx, actor, { fullName: row.fullName, phone: row.phone, email: row.email, homeBranchId: importData.branchId, preferredLanguage: "en", marketingOptIn: true });
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

async function createMemberMutation(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<{ member: Data; duplicates: Data[] }> {
  requirePermission(actor, "members.write");
  const fullName = stringValue(input.fullName).trim();
  const phone = stringValue(input.phone).trim();
  if (!fullName || !phone) domainError("VALIDATION_ERROR", "Name and phone are required.", { correlationId: actor.correlationId, fieldErrors: { ...(fullName ? {} : { fullName: ["Full name is required"] }), ...(phone ? {} : { phone: ["Phone is required"] }) } });
  const homeBranchId = recordId(input.homeBranchId);
  const branch = await branchByPublicId(ctx, actor.organization._id, homeBranchId);
  assertBranchAccess(actor, branch);
  const existingMembers = await memberRecords(ctx, actor);
  const duplicates = existingMembers.map((record) => data(record.data)).filter((member) => member.status !== "archived").flatMap((member) => {
    if (normalize(member.phone as string) === normalize(phone)) return [{ memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber, matchedOn: "phone" }];
    if (input.email && normalize(member.email as string) === normalize(stringValue(input.email))) return [{ memberId: member.id, fullName: member.fullName, memberNumber: member.memberNumber, matchedOn: "email" }];
    return [];
  });
  const sequence = await allocateSequence(ctx, actor, `member:${branch.code}`, 1000);
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
    emergencyContactPhone: optionalString(input.emergencyContactPhone),
    source: optionalString(input.source),
    assignedSalespersonId: optionalString(input.assignedSalespersonId),
    marketingOptIn: booleanValue(input.marketingOptIn, true),
    notes: optionalString(input.notes),
    createdAt: isoNow(),
  }, { branchId: homeBranchId });
  await insertTimeline(ctx, actor, { memberId: member.id, type: "member_created", title: "Member profile created", actorId: publicUserId(actor.user), actorName: actor.user.fullName, branchId: homeBranchId });
  await insertAudit(ctx, actor, { category: "members", action: "member.create", entityType: "member", entityId: member.id, entityLabel: `${member.fullName} · ${member.memberNumber}`, summary: "Member profile created", branchId: homeBranchId });
  return { member: await toMemberDetail(ctx, actor, member), duplicates };
}

async function createMembershipMutation(ctx: MutationCtx, actor: ActorContext, input: Data, previousMembershipId?: string): Promise<Data> {
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
  if (override && amountOf(input.priceOverride) !== amountOf(planData.basePrice)) requirePermission(actor, "memberships.override_dates");
  const price = override ? amountOf(input.priceOverride) : amountOf(planData.basePrice);
  const discount = Math.min(amountOf(input.discount), price);
  if (discount > 0) {
    requirePermission(actor, "payments.discount");
    requireReason(input.discountReason, actor.correlationId, "discountReason");
  }
  const roleDefinition = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", actor.role)).unique();
  const approvalPending = discount > roleDiscountLimit(actor.role, roleDefinition?.discountLimitMinor);
  const duration = stringValue(planData.kind) === "visits" ? numberValue(planData.visitValidityDays, 90) : numberValue(planData.durationDays, 30);
  const membership = await insertRecord(ctx, actor, "membership", {
    id: newPublicId(), organizationId: publicOrganizationId(actor.organization), memberId: memberData.id, planId: planData.id, homeBranchId: stringValue(memberData.homeBranchId), startDate, endDate: addDays(startDate, duration), totalVisits: stringValue(planData.kind) === "visits" ? numberValue(planData.visitAllowance) : undefined, remainingVisits: stringValue(planData.kind) === "visits" ? numberValue(planData.visitAllowance) : undefined, salePrice: money(price, actor.organization.currency), discount: money(discount, actor.organization.currency), discountReason: optionalString(input.discountReason), discountApprovalStatus: discount > 0 ? (approvalPending ? "pending" : "approved") : "none", soldById: publicUserId(actor.user), previousMembershipId, frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: isoNow(),
  }, { branchId: stringValue(memberData.homeBranchId), memberPublicId: memberData.id });
  const total = price - discount;
  const charge = await insertRecord(ctx, actor, "charge", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), memberId: memberData.id, membershipId: membership.id, description: `${stringValue(planData.name)} membership`, subtotal: money(price, actor.organization.currency), discount: money(discount, actor.organization.currency), tax: money(0, actor.organization.currency), total: money(total, actor.organization.currency), paidAmount: money(0, actor.organization.currency), outstandingAmount: money(total, actor.organization.currency), status: total === 0 ? "paid" : "unpaid", createdAt: isoNow() }, { branchId: stringValue(memberData.homeBranchId), memberPublicId: memberData.id });
  const renewal = Boolean(previousMembershipId);
  const event = await insertTimeline(ctx, actor, { memberId: memberData.id, branchId: memberData.homeBranchId, type: renewal ? "membership_renewed" : "membership_sold", title: `${stringValue(planData.name)} membership ${renewal ? "renewed" : "sold"}`, body: `Term ${membership.startDate} → ${membership.endDate}.`, actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: membership.id } });
  if (override) await insertAudit(ctx, actor, { category: "payments", action: "membership.price_override", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `Price override: ${actor.organization.currency} ${(price / 1000).toFixed(3)}`, before: { price: amountOf(planData.basePrice) }, after: { price }, branchId: memberData.homeBranchId });
  if (discount > 0) await insertAudit(ctx, actor, { category: "payments", action: "membership.discount", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `Discount applied: ${actor.organization.currency} ${(discount / 1000).toFixed(3)}`, reason: stringValue(input.discountReason), before: { price }, after: { discount }, approvalStatus: approvalPending ? "pending" : "approved", branchId: memberData.homeBranchId });
  await insertAudit(ctx, actor, { category: "memberships", action: renewal ? "membership.renew" : "membership.sale", entityType: "membership", entityId: membership.id, entityLabel: `${memberData.fullName} · ${memberData.memberNumber}`, summary: `${stringValue(planData.name)} — ${actor.organization.currency} ${(total / 1000).toFixed(3)}`, after: { startDate: membership.startDate, endDate: membership.endDate, total }, branchId: memberData.homeBranchId });
  let payment: Data | undefined;
  let receipt: Data | undefined;
  if (input.payment && amountOf(data(input.payment).amount) > 0) {
    const paymentResult = await paymentRecord(ctx, actor, { ...data(input.payment), memberId: memberData.id, chargeId: charge.id, branchId: memberData.homeBranchId }, `sale-${membership.id}`);
    payment = paymentResult.payment;
    receipt = paymentResult.receipt;
  }
  return { membership: await toMembership(ctx, actor, membership), charge, payment, receipt, timelineEventIds: [event.id] };
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

async function mutationData(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "bootstrap.ensure") {
    const { user } = await requireAuthenticated(ctx);
    return user._id;
  }

  if (operation === "customer.register") return await registerCustomer(ctx, input);
  if (operation === "customer.trial.create") return await createCustomerTrial(ctx, input);
  if (operation === "customer.entryPass") return await createEntryPass(ctx, input);
  if (operation === "platform.billing.retry" || operation === "platform.support.resolve" || operation === "platform.support.reply") {
    await requirePlatformAdmin(ctx, request.correlationId);
    const entityType = operation === "platform.billing.retry" ? "platformInvoice" : "supportCase";
    const publicId = stringValue(operation === "platform.billing.retry" ? input.invoiceId : input.caseId);
    const record = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", entityType)).collect()).find((row) => row.publicId === publicId);
    if (!record) domainError("NOT_FOUND", "Platform record not found.", { correlationId: request.correlationId });
    const current = data(record.data);
    const updated = operation === "platform.billing.retry"
      ? { ...current, status: "paid" }
      : operation === "platform.support.resolve"
        ? { ...current, status: "resolved" }
        : { ...current, lastReply: stringValue(input.body), lastReplyAt: isoNow() };
    await ctx.db.patch(record._id, { data: updated, updatedAt: Date.now() });
    return { id: record.publicId, ...updated };
  }

  const actor = await requireActor(ctx, request);

  switch (operation) {
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
      if (patch.homeBranchId) {
        const branch = await branchByPublicId(ctx, actor.organization._id, stringValue(patch.homeBranchId));
        assertBranchAccess(actor, branch);
      }
      const before = { fullName: data(record.data).fullName, phone: data(record.data).phone, email: data(record.data).email, homeBranchId: data(record.data).homeBranchId };
      const updated = await patchRecord(ctx, actor, record, patch);
      await insertAudit(ctx, actor, { category: "members", action: "member.update", entityType: "member", entityId: record.publicId, entityLabel: `${updated.fullName} · ${updated.memberNumber}`, summary: "Member profile updated", before, after: { fullName: updated.fullName, phone: updated.phone, email: updated.email, homeBranchId: updated.homeBranchId }, branchId: optionalString(updated.homeBranchId) });
      return await toMemberDetail(ctx, actor, updated);
    }
    case "members.archive": {
      requirePermission(actor, "members.archive");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "member", recordId(input.memberId));
      const updated = await patchRecord(ctx, actor, record, { status: "archived", archivedAt: isoNow() });
      await insertAudit(ctx, actor, { category: "members", action: "member.archive", entityType: "member", entityId: record.publicId, entityLabel: `${updated.fullName} · ${updated.memberNumber}`, summary: "Member archived", reason: stringValue(input.reason), before: { status: data(record.data).status }, after: { status: "archived" }, branchId: optionalString(updated.homeBranchId) });
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
      const plan = await insertRecord(ctx, actor, "plan", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), name, code, kind: stringValue(input.kind, "time"), durationDays: input.durationDays, visitAllowance: input.visitAllowance, visitValidityDays: input.visitValidityDays, basePrice: money(amountOf(input.basePrice), actor.organization.currency), branchAccess: stringValue(input.branchAccess, "all"), branchIds: branches, freezeAllowanceDays: numberValue(input.freezeAllowanceDays), status: "active" });
      await insertAudit(ctx, actor, { category: "settings", action: "plan.create", entityType: "plan", entityId: plan.id, entityLabel: `${plan.name} · ${plan.code}`, summary: "Membership plan created" });
      return await toPlan(ctx, actor, plan);
    }
    case "plans.update": {
      requirePermission(actor, "settings.manage");
      const record = await recordOf(ctx, actor, "plan", recordId(input.planId));
      const patch: Data = { ...input };
      delete patch.planId;
      if (patch.basePrice) patch.basePrice = money(amountOf(patch.basePrice), actor.organization.currency);
      if (patch.branchIds) for (const branchId of arrayValue(patch.branchIds).map(String)) assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const updated = await patchRecord(ctx, actor, record, patch);
      await insertAudit(ctx, actor, { category: "settings", action: "plan.update", entityType: "plan", entityId: record.publicId, entityLabel: stringValue(updated.name), summary: "Membership plan updated" });
      return await toPlan(ctx, actor, updated);
    }
    case "memberships.sale": {
      return await createMembershipMutation(ctx, actor, input);
    }
    case "memberships.renew": {
      requirePermission(actor, "memberships.sell");
      const old = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const oldData = data(old.data);
      if (statusOfMembership(oldData, todayIn(actor.organization.timezone || TZ_FALLBACK)) === "cancelled") domainError("MEMBERSHIP_NOT_ACTIVE", "Cancelled memberships cannot be renewed; create a new sale.", { correlationId: actor.correlationId });
      const today = todayIn(actor.organization.timezone || TZ_FALLBACK);
      const renewInput: Data = { ...input, memberId: oldData.memberId, planId: input.planId ?? oldData.planId, startDate: input.startDate ?? (stringValue(oldData.endDate) >= today ? addDays(stringValue(oldData.endDate), 1) : today) };
      delete renewInput.membershipId;
      return await createMembershipMutation(ctx, actor, renewInput, old.publicId);
    }
    case "memberships.freeze": {
      requirePermission(actor, "memberships.freeze");
      requireReason(input.reason, actor.correlationId);
      const record = await recordOf(ctx, actor, "membership", recordId(input.membershipId));
      const value = data(record.data);
      const status = statusOfMembership(value, todayIn(actor.organization.timezone || TZ_FALLBACK));
      if (!(status === "active" || status === "expiring")) domainError("MEMBERSHIP_NOT_ACTIVE", `Cannot freeze a membership in “${status}” state.`, { correlationId: actor.correlationId });
      const plan = await recordOf(ctx, actor, "plan", stringValue(value.planId));
      const planData = data(plan.data);
      const days = diffDays(stringValue(input.startDate), stringValue(input.endDate)) + 1;
      if (days <= 0) domainError("VALIDATION_ERROR", "Freeze end must be on or after the start date.", { correlationId: actor.correlationId });
      const allowance = numberValue(planData.freezeAllowanceDays) - numberValue(value.frozenDaysUsed);
      if (days > allowance) domainError("FREEZE_ALLOWANCE_EXCEEDED", `This plan allows ${numberValue(planData.freezeAllowanceDays)} freeze days total; ${Math.max(0, allowance)} remain.`, { correlationId: actor.correlationId });
      const freeze = { id: newPublicId(), membershipId: record.publicId, startDate: stringValue(input.startDate), endDate: stringValue(input.endDate), status: "active", reason: stringValue(input.reason), createdById: publicUserId(actor.user), createdAt: isoNow() };
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
      if (days <= 0 || days > 365) domainError("VALIDATION_ERROR", "Extension must be between 1 and 365 days.", { correlationId: actor.correlationId });
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
      await insertTimeline(ctx, actor, { memberId: value.memberId, type: "membership_cancelled", title: "Membership cancelled", body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName, meta: { membershipId: record.publicId } });
      await insertAudit(ctx, actor, { category: "memberships", action: "membership.cancel", entityType: "membership", entityId: record.publicId, entityLabel: stringValue(value.memberId), summary: "Membership cancelled", reason: stringValue(input.reason), before: { status: value.status ?? "active" }, after: { status: "cancelled" }, branchId: stringValue(value.homeBranchId) });
      return await toMembershipDetail(ctx, actor, updated);
    }
    case "leads.create": {
      requirePermission(actor, "crm.write");
      const branchId = recordId(input.branchId);
      assertBranchAccess(actor, await branchByPublicId(ctx, actor.organization._id, branchId));
      const lead = await insertRecord(ctx, actor, "lead", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), branchId, fullName: stringValue(input.fullName).trim(), phone: stringValue(input.phone).trim(), email: optionalString(input.email), stage: "new", source: stringValue(input.source, "other"), ownerId: optionalString(input.ownerId) ?? publicUserId(actor.user), expectedValue: input.expectedValue ? { amount: amountOf(input.expectedValue), currency: actor.organization.currency } : undefined, nextFollowUpAt: optionalString(input.nextFollowUpAt), notes: optionalString(input.notes), createdAt: isoNow(), updatedAt: isoNow() }, { branchId });
      await insertTimeline(ctx, actor, { leadId: lead.id, branchId, type: "member_created", title: "Lead captured", body: optionalString(input.notes), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return { ...(await toLeadSummary(ctx, actor, lead)), notes: optionalString(lead.notes), activities: [], offers: [] };
    }
    case "leads.update": {
      requirePermission(actor, "crm.write");
      const record = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const current = data(record.data);
      if (input.ownerId && input.ownerId !== current.ownerId) requirePermission(actor, "crm.assign");
      const patch: Data = { ...input, updatedAt: isoNow() };
      delete patch.leadId;
      const updated = await patchRecord(ctx, actor, record, patch);
      return { ...(await toLeadSummary(ctx, actor, updated)), notes: optionalString(updated.notes), activities: [], offers: [] };
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
    case "offers.create": {
      requirePermission(actor, "crm.write");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const plan = await recordOf(ctx, actor, "plan", recordId(input.planId));
      const offer = await insertRecord(ctx, actor, "offer", { id: newPublicId(), leadId: lead.publicId, planId: plan.publicId, planName: stringValue(data(plan.data).name), price: { amount: amountOf(input.price), currency: actor.organization.currency }, expiresAt: input.expiresInDays ? new Date(Date.now() + numberValue(input.expiresInDays) * 86_400_000).toISOString() : undefined, status: "sent", createdById: publicUserId(actor.user), createdAt: isoNow() }, { branchId: optionalString(data(lead.data).branchId), leadPublicId: lead.publicId });
      await patchRecord(ctx, actor, lead, { stage: "offer_sent", updatedAt: isoNow() });
      await insertTimeline(ctx, actor, { leadId: lead.publicId, branchId: optionalString(data(lead.data).branchId), type: "offer_sent", title: `Offer sent — ${stringValue(data(plan.data).name)}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return offer;
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
    case "leads.convert": {
      requirePermission(actor, "crm.write");
      const lead = await recordOf(ctx, actor, "lead", recordId(input.leadId));
      const leadData = data(lead.data);
      if (leadData.stage === "won" && leadData.convertedMemberId) domainError("VALIDATION_ERROR", "Lead was already converted.", { correlationId: actor.correlationId });
      const created = await createMemberMutation(ctx, actor, { ...input, fullName: leadData.fullName, phone: leadData.phone, email: leadData.email, homeBranchId: input.homeBranchId, preferredLanguage: input.preferredLanguage, source: leadData.source, assignedSalespersonId: leadData.ownerId });
      const member = data(created.member);
      await patchRecord(ctx, actor, lead, { stage: "won", convertedMemberId: member.id, nextFollowUpAt: undefined, updatedAt: isoNow() });
      const tasks = await recordsOf(ctx, actor, "task");
      for (const task of tasks) if (data(task.data).leadId === lead.publicId && data(task.data).status === "open") await patchRecord(ctx, actor, task, { status: "completed", outcome: "Converted to member", completedAt: isoNow() });
      await insertTimeline(ctx, actor, { leadId: lead.publicId, memberId: member.id, branchId: member.homeBranchId, type: "lead_converted", title: `Lead converted — ${member.fullName} became ${member.memberNumber}`, actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return member;
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
      return { checkInId: checkIn.id, decision: "overridden", reasonCodes: checkIn.reasonCodes, member: await toMemberSummary(ctx, actor, member), membership: evaluation.membership, occurredAt: checkIn.occurredAt, message: `Overridden by ${actor.user.fullName}: ${input.reason}` };
    }
    case "payments.create": {
      requirePermission(actor, "payments.collect");
      const idempotencyKey = recordId(input.idempotencyKey);
      const result = await paymentRecord(ctx, actor, input, idempotencyKey);
      const payment = result.payment;
      await insertAudit(ctx, actor, { category: "payments", action: "payment.collect", entityType: "payment", entityId: payment.id, entityLabel: `${payment.receiptNumber} · ${payment.memberId}`, summary: `Collected ${actor.organization.currency} ${(amountOf(payment.amount) / 1000).toFixed(3)} (${stringValue(payment.method).replace("_", " ")})`, after: { amount: amountOf(payment.amount), method: payment.method }, branchId: optionalString(payment.branchId) });
      return await receiptDetail(ctx, actor, result.receiptId);
    }
    case "payments.refund": {
      requirePermission(actor, "payments.refund");
      requireReason(input.reason, actor.correlationId);
      const originalRecord = await recordOf(ctx, actor, "payment", recordId(input.paymentId));
      const original = data(originalRecord.data);
      if (original.type !== "payment") domainError("VALIDATION_ERROR", "Only payments can be refunded.", { correlationId: actor.correlationId });
      if (original.status === "voided") domainError("PAYMENT_ALREADY_VOIDED", "Voided payments cannot be refunded.", { correlationId: actor.correlationId });
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
      await insertAudit(ctx, actor, { category: "payments", action: "payment.refund", entityType: "payment", entityId: original.id, entityLabel: `${original.receiptNumber} · ${original.memberId}`, summary: `Refunded ${actor.organization.currency} ${(amount / 1000).toFixed(3)}`, reason: stringValue(input.reason), before: { paymentStatus: original.status }, after: { paymentStatus: updatedStatus, refunded: alreadyRefunded + amount }, approvalStatus: amount > 25_000 ? "pending" : "approved", branchId: optionalString(original.branchId) });
      await insertTimeline(ctx, actor, { memberId: original.memberId, branchId: original.branchId, type: "payment_refunded", title: `Payment refunded — ${actor.organization.currency} ${(amount / 1000).toFixed(3)}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
      return await receiptDetail(ctx, actor, receipt.id);
    }
    case "payments.void": {
      requirePermission(actor, "payments.void");
      requireReason(input.reason, actor.correlationId);
      const originalRecord = await recordOf(ctx, actor, "payment", recordId(input.paymentId));
      const original = data(originalRecord.data);
      if (original.type !== "payment") domainError("VALIDATION_ERROR", "Only payments can be voided.", { correlationId: actor.correlationId });
      if (original.status === "voided") domainError("PAYMENT_ALREADY_VOIDED", "Payment is already voided.", { correlationId: actor.correlationId });
      if (original.status === "refunded" || original.status === "partially_refunded") domainError("PAYMENT_ALREADY_REFUNDED", "Refunded payments cannot be voided.", { correlationId: actor.correlationId });
      const paymentDay = todayIn(actor.organization.timezone || TZ_FALLBACK);
      if (businessDate(stringValue(original.occurredAt), actor.organization.timezone || TZ_FALLBACK) !== paymentDay) domainError("VOID_WINDOW_EXPIRED", "Payments can only be voided on the same business day. Issue a refund instead.", { correlationId: actor.correlationId });
      await patchRecord(ctx, actor, originalRecord, { status: "voided", voidReason: stringValue(input.reason) });
      if (original.chargeId) { const charge = await recordOf(ctx, actor, "charge", stringValue(original.chargeId)); const chargeData = data(charge.data); const paid = Math.max(0, amountOf(chargeData.paidAmount) - amountOf(original.amount)); await patchRecord(ctx, actor, charge, { paidAmount: money(paid, actor.organization.currency), outstandingAmount: money(Math.max(0, amountOf(chargeData.total) - paid), actor.organization.currency), status: paid <= 0 ? "unpaid" : "partial" }); }
      await insertAudit(ctx, actor, { category: "payments", action: "payment.void", entityType: "payment", entityId: original.id, entityLabel: `${original.receiptNumber} · ${original.memberId}`, summary: `Voided ${actor.organization.currency} ${(amountOf(original.amount) / 1000).toFixed(3)}`, reason: stringValue(input.reason), before: { status: "completed" }, after: { status: "voided" }, branchId: optionalString(original.branchId) });
      await insertTimeline(ctx, actor, { memberId: original.memberId, branchId: original.branchId, type: "payment_voided", title: `Payment voided — ${original.receiptNumber}`, body: stringValue(input.reason), actorId: publicUserId(actor.user), actorName: actor.user.fullName });
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
      const updated = await patchRecord(ctx, actor, record, { status: "closed", closedAt: isoNow(), closedById: publicUserId(actor.user), expectedCash: money(expected, actor.organization.currency), countedCash: money(counted, actor.organization.currency), variance: signedMoney(variance, actor.organization.currency), varianceExplanation: optionalString(input.varianceExplanation), varianceApprovalStatus: variance === 0 ? "approved" : "pending" });
      await insertAudit(ctx, actor, { category: "reconciliation", action: variance === 0 ? "shift.close" : "shift.close_variance", entityType: "cash_shift", entityId: record.publicId, entityLabel: stringValue(shift.branchId), summary: variance === 0 ? "Cash shift closed" : `Cash shift closed with variance ${actor.organization.currency} ${(variance / 1000).toFixed(3)}`, reason: optionalString(input.varianceExplanation), before: { status: "open" }, after: { status: "closed", expected, counted, variance }, approvalStatus: variance === 0 ? "approved" : "pending", branchId: optionalString(shift.branchId) });
      return updated;
    }
    case "shifts.review": {
      requirePermission(actor, "reconciliation.approve_variance");
      const record = await recordOf(ctx, actor, "shift", recordId(input.shiftId));
      const shift = data(record.data);
      if (shift.varianceApprovalStatus !== "pending") domainError("VALIDATION_ERROR", "This shift has no pending variance approval.", { correlationId: actor.correlationId });
      const decision = stringValue(input.decision);
      if (decision !== "approved" && decision !== "rejected") domainError("VALIDATION_ERROR", "Approval decision is invalid.", { correlationId: actor.correlationId });
      const updated = await patchRecord(ctx, actor, record, { varianceApprovalStatus: decision });
      await insertAudit(ctx, actor, { category: "reconciliation", action: `shift.variance.${decision}`, entityType: "cash_shift", entityId: record.publicId, entityLabel: stringValue(shift.branchId), summary: `${decision === "approved" ? "Approved" : "Rejected"} cash variance`, reason: optionalString(input.note), after: { varianceApprovalStatus: decision }, branchId: optionalString(shift.branchId) });
      return updated;
    }
    case "automations.rule.create": {
      requirePermission(actor, "automations.manage");
      const rule = await insertRecord(ctx, actor, "automationRule", { id: newPublicId(), organizationId: publicOrganizationId(actor.organization), name: stringValue(input.name), trigger: stringValue(input.trigger), triggerParams: data(input.triggerParams), actions: arrayValue(input.actions), enabled: booleanValue(input.enabled), dedupeWindowHours: numberValue(input.dedupeWindowHours, 24), executionsLast30Days: 0, updatedAt: isoNow() });
      await insertAudit(ctx, actor, { category: "automations", action: "automation.rule_created", entityType: "automation_rule", entityId: rule.id, entityLabel: stringValue(rule.name), summary: "Automation rule created" });
      return rule;
    }
    case "automations.rule.update": {
      requirePermission(actor, "automations.manage");
      const record = await recordOf(ctx, actor, "automationRule", recordId(input.id));
      const patch: Data = { ...input, updatedAt: isoNow() };
      delete patch.id;
      const updated = await patchRecord(ctx, actor, record, patch);
      await insertAudit(ctx, actor, { category: "automations", action: "automation.rule_updated", entityType: "automation_rule", entityId: record.publicId, entityLabel: stringValue(updated.name), summary: "Automation rule updated" });
      return updated;
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
      const targetPermissions = targetDefinition?.permissions ?? DEFAULT_ROLE_DEFINITIONS[role].permissions;
      if (targetPermissions.some((permission) => !actor.permissions.includes(permission))) domainError("FORBIDDEN", "You cannot grant permissions your role does not possess.", { correlationId: actor.correlationId });
      await ctx.db.patch(membership._id, { role, branchIds: input.branchIds ? resolvedBranches.map((branch) => branch!._id) : membership.branchIds, branchScope, active: input.status ? input.status !== "deactivated" : membership.active, updatedAt: Date.now() });
      await ctx.db.patch(user._id, { status: input.status ?? user.status ?? "active", updatedAt: Date.now() });
      await insertAudit(ctx, actor, { category: "users", action: input.status === "deactivated" ? "user.deactivate" : "user.access_update", entityType: "user", entityId: publicUserId(user), entityLabel: user.fullName, summary: input.status === "deactivated" ? "Account deactivated" : "Access updated", reason: input.status === "deactivated" ? "Deactivated by administrator" : undefined, before: { role: membership.role, status: user.status }, after: { role, status: input.status ?? user.status ?? "active" } });
      const updated = await ctx.db.get(user._id);
      const nextMembership = await ctx.db.get(membership._id);
      return { id: publicUserId(updated ?? user), organizationId: publicOrganizationId(actor.organization), name: (updated ?? user).fullName, email: (updated ?? user).email, phone: (updated ?? user).phone ?? "", role: frontendRole((nextMembership ?? membership).role), branchScope: (nextMembership ?? membership).branchScope ?? "selected", branchIds: await Promise.all((nextMembership ?? membership).branchIds.map((id) => publicBranchIdFromId(ctx, actor.organization._id, id))), status: (updated ?? user).status ?? "active" };
    }
    case "roles.update": {
      requirePermission(actor, "users.manage");
      const role = roleFromFrontend(input.role);
      if (role === "owner") domainError("VALIDATION_ERROR", "The owner role always has full access.", { correlationId: actor.correlationId });
      const current = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", role)).unique();
      const fallback = DEFAULT_ROLE_DEFINITIONS[role];
      if (!current) domainError("NOT_FOUND", "Role not found.", { correlationId: actor.correlationId });
      const requestedPermissions = input.permissions === undefined ? current.permissions : arrayValue(input.permissions).map(String);
      const invalidPermissions = requestedPermissions.filter((permission) => !PERMISSIONS.includes(permission as (typeof PERMISSIONS)[number]));
      if (invalidPermissions.length > 0) domainError("VALIDATION_ERROR", "One or more permissions are not recognized.", { correlationId: actor.correlationId, details: { permissions: invalidPermissions } });
      if (requestedPermissions.some((permission) => !actor.permissions.includes(permission))) domainError("FORBIDDEN", "You cannot grant permissions your role does not possess.", { correlationId: actor.correlationId });
      const discountLimitMinor = input.discountLimitMinor === undefined ? current.discountLimitMinor : numberValue(input.discountLimitMinor);
      if (!Number.isSafeInteger(discountLimitMinor) || discountLimitMinor < 0) domainError("VALIDATION_ERROR", "Discount limit must be a non-negative integer amount.", { correlationId: actor.correlationId });
      const updated = { permissions: requestedPermissions, discountLimitMinor, updatedAt: Date.now() };
      await ctx.db.patch(current._id, updated);
      await insertAudit(ctx, actor, { category: "users", action: "role.permissions_change", entityType: "role", entityId: publicOrganizationId(actor.organization), entityLabel: current.label, summary: `Permissions updated for the ${current.label} role`, before: { permissions: current.permissions.length, discountLimit: current.discountLimitMinor }, after: { permissions: updated.permissions.length, discountLimit: updated.discountLimitMinor } });
      return { key: frontendRole(role), label: current.label ?? fallback.label, description: current.description ?? fallback.description, permissions: updated.permissions, discountLimitMinor: updated.discountLimitMinor, isSystem: current.isSystem };
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
      await insertRecord(ctx, actor, "approvalReview", { id: newPublicId(), auditEventId: eventId, decision, note: optionalString(input.note), reviewedById: publicUserId(actor.user), reviewedAt: isoNow() }, { branchId: event.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, event.branchId) : undefined });
      if (event.entityType === "membership") { const membership = await recordOf(ctx, actor, "membership", event.entityPublicId); await patchRecord(ctx, actor, membership, { discountApprovalStatus: decision }); }
      if (event.entityType === "cash_shift") { const shift = await recordOf(ctx, actor, "shift", event.entityPublicId); await patchRecord(ctx, actor, shift, { varianceApprovalStatus: decision }); }
      await insertAudit(ctx, actor, { category: event.category, action: `${event.action}.${decision}`, entityType: event.entityType, entityId: event.entityPublicId, entityLabel: event.entityLabel, summary: `${decision === "approved" ? "Approved" : "Rejected"}: ${event.summary}`, reason: optionalString(input.note), branchId: event.branchId ? await publicBranchIdFromId(ctx, actor.organization._id, event.branchId) : undefined });
      return undefined;
    }
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
  return { organization: organizationView(actor.organization), branches: branches.map((branch) => branchView(branch, publicOrganizationId(actor.organization))), paymentMethods: settings.paymentMethods, roles: await roleViews(ctx, actor), notifications: settings.notifications };
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
  const payments = (await paymentRecords(ctx, actor)).map((record) => data(record.data)).filter((payment) => inBranch(payment) && inRange(payment, "occurredAt"));
  const validPayments = payments.filter((payment) => payment.status !== "voided");
  const members = (await memberRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch);
  const memberships = (await membershipRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch);
  const leads = (await recordsOf(ctx, actor, "lead")).map((record) => data(record.data)).filter(inBranch);
  const tasks = (await recordsOf(ctx, actor, "task")).map((record) => data(record.data)).filter(inBranch);
  const checkins = (await recordsOf(ctx, actor, "checkIn")).map((record) => data(record.data)).filter((checkin) => inBranch(checkin) && inRange(checkin, "occurredAt"));
  const collectedOn = (date: string) => validPayments.filter((payment) => payment.type === "payment" && businessDate(stringValue(payment.occurredAt), actor.organization.timezone || TZ_FALLBACK) === date).reduce((sum, payment) => sum + amountOf(payment.amount), 0);
  const refundsOn = (date: string) => validPayments.filter((payment) => payment.type === "refund" && businessDate(stringValue(payment.occurredAt), actor.organization.timezone || TZ_FALLBACK) === date).reduce((sum, payment) => sum + Math.abs(amountOf(payment.amount)), 0);
  const revenueSeries = Array.from({ length: 30 }, (_, index) => { const date = addDays(to, index - 29); return { date, collected: collectedOn(date), refunds: refundsOn(date) }; });
  const outstanding = (await chargeRecords(ctx, actor)).map((record) => data(record.data)).filter(inBranch).reduce((sum, charge) => sum + Math.max(0, amountOf(charge.outstandingAmount)), 0);
  const activeLeads = leads.filter((lead) => !["won", "lost"].includes(stringValue(lead.stage))).length;
  const overdue = tasks.filter((task) => task.status === "open" && stringValue(task.dueAt) < isoNow()).length;
  const renewals = memberships.filter((membership) => { const status = statusOfMembership(membership, today); const days = diffDays(today, stringValue(membership.endDate)); return (status === "expiring" || status === "active") && days <= 7 && days >= 0; }).length;
  const expiredUnactioned = memberships.filter((membership) => statusOfMembership(membership, today) === "expired" && !memberships.some((other) => other.previousMembershipId === membership.id)).length;
  const checkinsToday = checkins.filter((checkin) => checkin.decision !== "blocked" && businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today).length;
  const branchRows = await accessibleBranches(ctx, actor);
  const branchRevenue = await Promise.all(branchRows.map(async (branch) => { const id = publicBranchId(branch); const collected = validPayments.filter((payment) => payment.branchId === id && payment.type === "payment").reduce((sum, payment) => sum + amountOf(payment.amount), 0); const branchMembers = members.filter((member) => member.homeBranchId === id); return { branchId: id, branchName: branch.name, collected: money(collected, actor.organization.currency), checkInsToday: checkins.filter((checkin) => checkin.branchId === id && businessDate(stringValue(checkin.occurredAt), actor.organization.timezone || TZ_FALLBACK) === today).length, activeMembers: branchMembers.filter((member) => member.status === "active").length }; }));
  const funnelStages = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];
  const funnel = funnelStages.map((stage) => ({ stage, label: stage.replaceAll("_", " "), count: leads.filter((lead) => lead.stage === stage).length }));
  const organizationMemberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const users = (await Promise.all(organizationMemberships.filter((membership) => membership.active).map((membership) => ctx.db.get(membership.userId)))).filter((user): user is User => Boolean(user));
  const leaderboard = await Promise.all(users.map(async (user) => { const id = publicUserId(user); const userPayments = validPayments.filter((payment) => payment.collectedById === id && payment.type === "payment"); return { userId: id, name: user.fullName, revenueCollected: money(userPayments.reduce((sum, payment) => sum + amountOf(payment.amount), 0), actor.organization.currency), newSales: memberships.filter((membership) => membership.soldById === id && !membership.previousMembershipId).length, renewals: memberships.filter((membership) => membership.soldById === id && Boolean(membership.previousMembershipId)).length, leadsConverted: leads.filter((lead) => lead.ownerId === id && lead.stage === "won").length, followUpsCompleted: tasks.filter((task) => task.ownerId === id && task.status === "completed").length, overdueFollowUps: tasks.filter((task) => task.ownerId === id && task.status === "open" && stringValue(task.dueAt) < isoNow()).length }; }));
  const audits = await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id)).order("desc").take(12);
  const approvalReviews = await recordsOf(ctx, actor, "approvalReview");
  const reviewedApprovalIds = new Set(approvalReviews.map((review) => stringValue(data(review.data).auditEventId)));
  const alerts = audits.filter((event) => (event.approvalStatus === "pending" && !reviewedApprovalIds.has(event.publicId)) || event.category === "reconciliation").slice(0, 8).map((event) => ({ id: event.publicId, kind: event.action.includes("variance") ? "pending_variance" : event.action.includes("discount") ? "pending_discount" : "cash_variance", title: event.summary, detail: event.reason ?? event.entityLabel, actorName: event.actorName, href: event.entityType === "cash_shift" ? "/payments/shifts" : "/audit", severity: event.approvalStatus === "pending" && !reviewedApprovalIds.has(event.publicId) ? "warning" : "info", occurredAt: utcIso(event.occurredAt) }));
  const timeline = (await recordsOf(ctx, actor, "timeline")).map((record) => data(record.data)).sort((a, b) => stringValue(b.occurredAt).localeCompare(stringValue(a.occurredAt))).slice(0, 10);
  return { kpis: { revenueToday: money(collectedOn(today), actor.organization.currency), revenueThisMonth: money(validPayments.filter((payment) => payment.type === "payment" && stringValue(payment.occurredAt).slice(0, 7) === today.slice(0, 7)).reduce((sum, payment) => sum + amountOf(payment.amount), 0), actor.organization.currency), revenuePrevMonth: money(0, actor.organization.currency), outstandingTotal: money(outstanding, actor.organization.currency), newMembersThisMonth: members.filter((member) => stringValue(member.createdAt).slice(0, 7) === today.slice(0, 7)).length, renewalsDueNext7Days: renewals, expiredUnactioned, checkInsToday: checkinsToday, activeLeads, overdueFollowUps: overdue }, revenueSeries, branchRevenue, funnel, leaderboard, alerts, recentActivity: timeline };
}

export const query = convexQuery({
  args: OPERATION_ARGS,
  handler: async (ctx, args) => await queryData(ctx, args.operation, data(args.input), args),
});

export const mutate = convexMutation({
  args: OPERATION_ARGS,
  handler: async (ctx, args) => await mutationData(ctx, args.operation, data(args.input), args),
});
