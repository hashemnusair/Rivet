import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { PLAN_CATALOGUE, type PlanDefinition } from "./planCatalogue";
import { domainError } from "./security";

type ReadContext = QueryCtx | MutationCtx;
type CapacityResource = "branches" | "staff" | "members";
type LooseRecord = { publicId?: string; memberPublicId?: string; data: unknown };

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hasStaffSeat(membership: Pick<Doc<"organizationMemberships">, "active" | "invitationStatus"> | null | undefined): boolean {
  return Boolean(membership?.active && membership.invitationStatus !== "revoked");
}

/**
 * Return the launch-catalogue plan with the platform's persisted overrides
 * applied. The result stays complete so billing and capacity consumers share
 * the same effective price and limit values.
 */
export async function effectivePlan(ctx: ReadContext, requestedName: string | undefined): Promise<PlanDefinition> {
  const base = PLAN_CATALOGUE.find((plan) => plan.name === requestedName) ?? PLAN_CATALOGUE[0];
  if (!base) throw new Error("The platform plan catalogue is empty.");

  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const persisted = rows.find((row) => {
    const value = object(row.data);
    return String(value.name ?? row.publicId ?? "").toLowerCase() === base.name.toLowerCase();
  });
  const value = object(persisted?.data);
  const result = { ...base };
  for (const key of ["priceMinor", "branches", "staff", "members", "onboardingFeeMinor", "operationalEmails"] as const) {
    const override = value[key];
    const minimum = key === "branches" || key === "staff" || key === "members" ? 1 : 0;
    if (typeof override === "number" && Number.isSafeInteger(override) && override >= minimum) {
      result[key] = override;
    }
  }
  return result;
}

/** Organization subscriptionPlan is billing authority; older rows fall back to their materialized entitlement, then Starter. */
export async function effectiveOrganizationPlan(ctx: ReadContext, organization: Doc<"organizations">): Promise<PlanDefinition> {
  const entitlement = await ctx.db.query("organizationEntitlements")
    .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
    .unique();
  return await effectivePlan(ctx, organization.subscriptionPlan ?? entitlement?.subscriptionPlan ?? "Starter");
}

function capacityExceeded(
  resource: CapacityResource,
  plan: PlanDefinition,
  limit: number,
  current: number,
  projected: number,
  correlationId?: string,
): never {
  domainError("VALIDATION_ERROR", `The ${plan.name} plan limit (${limit}) has been reached. Upgrade the plan or free capacity before continuing.`, {
    correlationId,
    message: { key: "apiErrors.planCapacity", params: { plan: plan.name, limit } },
    details: { resource, plan: plan.name, limit, current, projected },
  });
}

function assertTransitionWithinLimit(resource: CapacityResource, plan: PlanDefinition, limit: number, current: number, projected: number, correlationId?: string): void {
  if (projected > limit && projected > current) capacityExceeded(resource, plan, limit, current, projected, correlationId);
}

export async function enforceBranchCapacity(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: PlanDefinition,
  wasActive: boolean | null,
  willBeActive: boolean,
  correlationId?: string,
): Promise<void> {
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const current = branches.filter((branch) => branch.active && branch.status !== "inactive").length;
  const projected = current - (wasActive === true ? 1 : 0) + (willBeActive ? 1 : 0);
  assertTransitionWithinLimit("branches", plan, plan.branches, current, projected, correlationId);
}

export async function enforceStaffCapacity(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: PlanDefinition,
  wasActive: boolean,
  willBeActive: boolean,
  correlationId?: string,
): Promise<void> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const current = memberships.filter((membership) => hasStaffSeat(membership)).length;
  const projected = current - (wasActive ? 1 : 0) + (willBeActive ? 1 : 0);
  assertTransitionWithinLimit("staff", plan, plan.staff, current, projected, correlationId);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function addDay(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`) + 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function termInterval(record: LooseRecord, today: string): { memberId: string; start: string; end: string } | undefined {
  const value = object(record.data);
  const status = typeof value.status === "string" ? value.status.toLowerCase() : "";
  if (value.cancelledAt || value.archivedAt || value.archived === true || ["cancelled", "archived", "inactive", "depleted"].includes(status)) return undefined;
  if (value.remainingVisits === 0 || (typeof value.remainingVisits === "number" && value.remainingVisits < 0)) return undefined;
  if (!isCalendarDate(value.startDate) || !isCalendarDate(value.endDate) || value.startDate > value.endDate || value.endDate < today) return undefined;
  const memberId = typeof value.memberId === "string" && value.memberId ? value.memberId : record.memberPublicId;
  if (!memberId) return undefined;
  return { memberId, start: value.startDate < today ? today : value.startDate, end: value.endDate };
}

function memberTermCountEvents(records: readonly LooseRecord[], today: string, archivedMemberIds: ReadonlySet<string>): Map<string, number> {
  const byMember = new Map<string, Array<{ start: string; end: string }>>();
  for (const record of records) {
    const interval = termInterval(record, today);
    if (interval && archivedMemberIds.has(interval.memberId)) continue;
    if (!interval) continue;
    const list = byMember.get(interval.memberId) ?? [];
    list.push({ start: interval.start, end: interval.end });
    byMember.set(interval.memberId, list);
  }

  const events = new Map<string, number>();
  for (const intervals of byMember.values()) {
    intervals.sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
    let mergedStart: string | undefined;
    let mergedEnd: string | undefined;
    const flush = () => {
      if (!mergedStart || !mergedEnd) return;
      events.set(mergedStart, (events.get(mergedStart) ?? 0) + 1);
      const afterEnd = addDay(mergedEnd);
      events.set(afterEnd, (events.get(afterEnd) ?? 0) - 1);
    };
    for (const interval of intervals) {
      if (!mergedStart) {
        mergedStart = interval.start;
        mergedEnd = interval.end;
      } else if (interval.start <= addDay(mergedEnd!)) {
        if (interval.end > mergedEnd!) mergedEnd = interval.end;
      } else {
        flush();
        mergedStart = interval.start;
        mergedEnd = interval.end;
      }
    }
    flush();
  }

  return events;
}

/** Peak simultaneous distinct members from today forward, counting future and frozen terms. */
export function peakConcurrentMemberTerms(records: readonly LooseRecord[], today: string, archivedMemberIds: ReadonlySet<string> = new Set()): number {
  const events = memberTermCountEvents(records, today, archivedMemberIds);
  let current = 0;
  let peak = 0;
  for (const date of [...events.keys()].sort()) {
    current += events.get(date) ?? 0;
    peak = Math.max(peak, current);
  }
  return peak;
}

export async function enforceMembershipCapacity(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: PlanDefinition,
  candidate: Record<string, unknown>,
  options: { existingPublicId?: string; today: string; correlationId?: string },
): Promise<void> {
  const existing = await ctx.db.query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "membership"))
    .collect();
  const members = await ctx.db.query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "member"))
    .collect();
  const archivedMemberIds = new Set(members.filter((member) => {
    const value = object(member.data);
    return value.status === "archived" || Boolean(value.archivedAt);
  }).map((member) => member.publicId));
  const currentEvents = memberTermCountEvents(existing, options.today, archivedMemberIds);
  const projectedRows: LooseRecord[] = existing
    .filter((row) => row.publicId !== options.existingPublicId)
    .map((row) => ({ publicId: row.publicId, memberPublicId: row.memberPublicId, data: row.data }));
  projectedRows.push({ publicId: options.existingPublicId ?? (typeof candidate.id === "string" ? candidate.id : undefined), data: candidate });
  const projectedEvents = memberTermCountEvents(projectedRows, options.today, archivedMemberIds);
  assertMemberEventTransitionWithinLimit(plan, currentEvents, projectedEvents, options.correlationId);
}

function assertMemberEventTransitionWithinLimit(
  plan: PlanDefinition,
  currentEvents: ReadonlyMap<string, number>,
  projectedEvents: ReadonlyMap<string, number>,
  correlationId?: string,
): void {
  let currentCount = 0;
  let projectedCount = 0;
  const dates = new Set([...currentEvents.keys(), ...projectedEvents.keys()]);
  for (const date of [...dates].sort()) {
    currentCount += currentEvents.get(date) ?? 0;
    projectedCount += projectedEvents.get(date) ?? 0;
    if (projectedCount > plan.members && projectedCount > currentCount) {
      capacityExceeded("members", plan, plan.members, currentCount, projectedCount, correlationId);
    }
  }
}

export async function enforceMemberRestoreCapacity(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: PlanDefinition,
  memberPublicId: string,
  options: { today: string; correlationId?: string },
): Promise<void> {
  const [memberships, members] = await Promise.all([
    ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "membership")).collect(),
    ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "member")).collect(),
  ]);
  const archivedMemberIds = new Set(members.filter((member) => {
    const value = object(member.data);
    return value.status === "archived" || Boolean(value.archivedAt);
  }).map((member) => member.publicId));
  const currentEvents = memberTermCountEvents(memberships, options.today, archivedMemberIds);
  const projectedArchivedMemberIds = new Set(archivedMemberIds);
  projectedArchivedMemberIds.delete(memberPublicId);
  const projectedEvents = memberTermCountEvents(memberships, options.today, projectedArchivedMemberIds);
  assertMemberEventTransitionWithinLimit(plan, currentEvents, projectedEvents, options.correlationId);
}

export function staffMembershipCounts(membership: Pick<Doc<"organizationMemberships">, "active" | "invitationStatus"> | null | undefined): boolean {
  return hasStaffSeat(membership);
}
