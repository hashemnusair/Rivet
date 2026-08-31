import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { domainError, requirePermission, publicBranchId, type ActorContext } from "./security";
import { occurrenceTimes, weeklySlot } from "./classes";
import { addDays } from "../src/lib/utils/dates";
import {
  classUtilizationReport,
  collectionsReport,
  controlTrendsReport,
  crmFunnelReport,
  peakHoursReport,
  renewalForecastReport,
  retentionReport,
  type CollectionsInputPayment,
  type LocalDateRange,
} from "../src/lib/analytics/operational-reports";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TZ_FALLBACK = "Asia/Amman";
const DAY_MS = 86_400_000;
/** Local-date classification can differ from row insert time by at most a day either side. */
const RANGE_MARGIN_MS = 2 * DAY_MS;
const MAX_RANGE_DAYS = 366;

function data(value: unknown): Data {
  return value && typeof value === "object" ? (value as Data) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function amountMinor(value: unknown): number {
  return num(data(value).amount);
}

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
}

function requireLocalDate(value: unknown, field: string, actor: ActorContext): string {
  const date = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) domainError("VALIDATION_ERROR", `${field} must be a calendar date.`, { correlationId: actor.correlationId });
  return date;
}

function requireRange(input: Data, actor: ActorContext): LocalDateRange {
  const from = requireLocalDate(input.from, "from", actor);
  const to = requireLocalDate(input.to, "to", actor);
  if (from > to) domainError("VALIDATION_ERROR", "The period start must not be after its end.", { correlationId: actor.correlationId });
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS > MAX_RANGE_DAYS) {
    domainError("VALIDATION_ERROR", "Reports cover at most one year at a time.", { correlationId: actor.correlationId });
  }
  return { from, to };
}

interface BranchScope {
  /** undefined = every branch the tenant has; otherwise the only visible public ids. */
  allowed?: Set<string>;
  /** Map of internal branch ids to public ids for row-level filtering. */
  publicById: Map<Id<"branches">, string>;
}

async function resolveBranchScope(ctx: ReadContext, actor: ActorContext, requestedBranchId: unknown): Promise<BranchScope> {
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const publicById = new Map<Id<"branches">, string>(branches.map((branch) => [branch._id, publicBranchId(branch)]));
  let allowed: Set<string> | undefined;
  if (actor.branchScope === "selected") {
    allowed = new Set(actor.branchIds.map((id) => publicById.get(id)).filter((id): id is string => Boolean(id)));
  }
  const requested = str(requestedBranchId) || undefined;
  if (requested) {
    const branch = branches.find((candidate) => publicBranchId(candidate) === requested);
    if (!branch || (allowed && !allowed.has(requested))) {
      domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
    }
    allowed = new Set([requested]);
  }
  return { allowed, publicById };
}

function branchVisible(scope: BranchScope, publicId: string | undefined): boolean {
  if (!scope.allowed) return true;
  if (!publicId) return false;
  return scope.allowed.has(publicId);
}

function rowBranchPublicId(scope: BranchScope, row: Doc<"domainRecords">, dataBranchField?: string): string | undefined {
  if (row.branchId) return scope.publicById.get(row.branchId);
  return dataBranchField ? str(data(row.data)[dataBranchField]) || undefined : undefined;
}

async function recordsInRange(ctx: ReadContext, actor: ActorContext, entityType: string, range: LocalDateRange): Promise<Array<Doc<"domainRecords">>> {
  const fromMs = Date.parse(`${range.from}T00:00:00Z`) - RANGE_MARGIN_MS;
  const toMs = Date.parse(`${range.to}T00:00:00Z`) + DAY_MS + RANGE_MARGIN_MS;
  return await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_created", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType).gte("createdAt", fromMs).lte("createdAt", toMs))
    .collect();
}

async function allRecords(ctx: ReadContext, actor: ActorContext, entityType: string): Promise<Array<Doc<"domainRecords">>> {
  return await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType)).collect();
}

async function memberBranchIndex(ctx: ReadContext, actor: ActorContext): Promise<{ branchByMember: Map<string, string>; nameByMember: Map<string, string> }> {
  const members = await allRecords(ctx, actor, "member");
  const branchByMember = new Map<string, string>();
  const nameByMember = new Map<string, string>();
  for (const row of members) {
    const value = data(row.data);
    branchByMember.set(str(value.id), str(value.homeBranchId));
    nameByMember.set(str(value.id), str(value.fullName, "Member"));
  }
  return { branchByMember, nameByMember };
}

/**
 * Read-only operational analytics. Every operation checks the reporting
 * permission, restricts rows to the actor's authorized branch scope, works on
 * tenant-local calendar boundaries, and writes nothing.
 */
export async function analyticsQuery(ctx: ReadContext, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  requirePermission(actor, "reports.financial.read");
  const timezone = actor.organization.timezone || TZ_FALLBACK;
  const scope = await resolveBranchScope(ctx, actor, input.branchId);

  switch (operation) {
    case "analytics.peak_hours": {
      const range = requireRange(input, actor);
      const rows = await recordsInRange(ctx, actor, "checkIn", range);
      const checkIns = rows
        .map((row) => ({ row, value: data(row.data) }))
        .filter(({ row, value }) => branchVisible(scope, rowBranchPublicId(scope, row) ?? (str(value.branchId) || undefined)))
        .map(({ value }) => ({ occurredAt: str(value.occurredAt), decision: str(value.decision, "allowed") }));
      return peakHoursReport(checkIns, range, timezone);
    }

    case "analytics.class_utilization": {
      const range = requireRange(input, actor);
      const fromMs = Date.parse(`${range.from}T00:00:00Z`) - RANGE_MARGIN_MS;
      const toMs = Date.parse(`${range.to}T00:00:00Z`) + DAY_MS + RANGE_MARGIN_MS;
      const branchIds = [...scope.publicById.entries()]
        .filter(([, publicId]) => branchVisible(scope, publicId))
        .map(([branchId]) => branchId);
      const occurrenceRows: Array<Doc<"classOccurrences">> = [];
      const bookingRows: Array<Doc<"classBookings">> = [];
      for (const branchId of branchIds) {
        occurrenceRows.push(...await ctx.db.query("classOccurrences").withIndex("by_branch_start", (q) => q
          .eq("organizationId", actor.organization._id)
          .eq("branchId", branchId)
          .gte("startsAt", fromMs)
          .lte("startsAt", toMs)).collect());
        bookingRows.push(...await ctx.db.query("classBookings").withIndex("by_branch_start", (q) => q
          .eq("organizationId", actor.organization._id)
          .eq("branchId", branchId)
          .gte("startsAt", fromMs)
          .lte("startsAt", toMs)).collect());
      }
      const persistedKeys = new Set(occurrenceRows.map((occurrence) => `${occurrence.templatePublicId}:${occurrence.date}`));
      const projectedOccurrences = occurrenceRows.map((occurrence) => ({
          id: String(occurrence._id),
          templateId: occurrence.templatePublicId,
          name: occurrence.name,
          startsAt: new Date(occurrence.startsAt).toISOString(),
          capacity: occurrence.capacity,
          status: occurrence.status,
        }));
      const templates = (await ctx.db.query("classSessions").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect())
        .filter((template) => template.status !== "cancelled" && branchVisible(scope, scope.publicById.get(template.branchId)));
      for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
        const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
        for (const template of templates) {
          const slot = weeklySlot(template, timezone);
          if (slot.dayOfWeek !== weekday || persistedKeys.has(`${template.publicId}:${date}`)) continue;
          const times = occurrenceTimes(date, slot.startMinute, template.durationMinutes, timezone);
          projectedOccurrences.push({
            id: `virtual:${template.publicId}:${date}`,
            templateId: template.publicId,
            name: template.name,
            startsAt: new Date(times.startsAt).toISOString(),
            capacity: template.capacity,
            status: "scheduled",
          });
        }
      }
      return classUtilizationReport(
        projectedOccurrences,
        bookingRows.map((booking) => ({
          occurrenceId: String(booking.occurrenceId),
          status: booking.status,
          fromWaitlist: booking.fromWaitlist,
        })),
        range,
        timezone,
      );
    }

    case "analytics.retention": {
      const { branchByMember } = await memberBranchIndex(ctx, actor);
      const memberships = (await allRecords(ctx, actor, "membership"))
        .map((row) => data(row.data))
        .filter((value) => branchVisible(scope, branchByMember.get(str(value.memberId))))
        .map((value) => ({ memberId: str(value.memberId), startDate: str(value.startDate), endDate: str(value.endDate) }));
      return retentionReport(memberships, todayIn(timezone));
    }

    case "analytics.renewal_forecast": {
      const { branchByMember, nameByMember } = await memberBranchIndex(ctx, actor);
      const plans = new Map((await allRecords(ctx, actor, "plan")).map((row) => {
        const value = data(row.data);
        return [str(value.id), { name: str(value.name, "—"), priceMinor: amountMinor(value.basePrice) }] as const;
      }));
      const memberships = (await allRecords(ctx, actor, "membership"))
        .map((row) => data(row.data))
        .filter((value) => branchVisible(scope, branchByMember.get(str(value.memberId))))
        .map((value) => ({ id: str(value.id), memberId: str(value.memberId), planId: str(value.planId) || undefined, startDate: str(value.startDate), endDate: str(value.endDate) }));
      return renewalForecastReport(memberships, nameByMember, plans, todayIn(timezone));
    }

    case "analytics.collections": {
      const range = requireRange(input, actor);
      const { branchByMember } = await memberBranchIndex(ctx, actor);
      const chargeVisible = (row: Doc<"domainRecords">, value: Data) =>
        branchVisible(scope, rowBranchPublicId(scope, row) ?? branchByMember.get(str(value.memberId)));
      // Outstanding-now needs every open charge; period activity is bounded.
      const chargeRows = await allRecords(ctx, actor, "charge");
      const charges = chargeRows
        .map((row) => ({ row, value: data(row.data) }))
        .filter(({ row, value }) => chargeVisible(row, value))
        .map(({ value }) => ({ createdAt: str(value.createdAt), issueDate: str(value.issueDate) || undefined, totalMinor: amountMinor(value.total), outstandingMinor: amountMinor(value.outstandingAmount) }));
      const payments = (await recordsInRange(ctx, actor, "payment", range))
        .map((row) => ({ row, value: data(row.data) }))
        .filter(({ row, value }) => branchVisible(scope, rowBranchPublicId(scope, row) ?? (str(value.branchId) || undefined)))
        .map(({ value }) => ({ occurredAt: str(value.occurredAt), type: str(value.type, "payment"), status: str(value.status, "completed"), amountMinor: amountMinor(value.amount) }));
      return collectionsReport(charges, payments, range, timezone);
    }

    case "analytics.crm_funnel": {
      const range = requireRange(input, actor);
      const leadRows = await recordsInRange(ctx, actor, "lead", range);
      const leads = leadRows
        .map((row) => data(row.data))
        .filter((value) => branchVisible(scope, str(value.branchId) || undefined))
        .map((value) => ({ id: str(value.id), createdAt: str(value.createdAt), convertedMemberId: str(value.convertedMemberId) || undefined }));
      const leadIds = new Set(leads.map((lead) => lead.id));
      const activities = (await allRecords(ctx, actor, "timeline"))
        .map((row) => data(row.data))
        .filter((value) => leadIds.has(str(value.leadId)))
        .map((value) => ({ leadId: str(value.leadId) || undefined, type: str(value.type), occurredAt: str(value.occurredAt), outcome: str(data(value.meta).outcome) || undefined }));
      const trials = (await recordsInRange(ctx, actor, "trialBooking", range))
        .map((row) => data(row.data))
        .filter((value) => !str(value.leadId) || leadIds.has(str(value.leadId)) || branchVisible(scope, str(value.branchId) || undefined))
        .map((value) => ({ leadId: str(value.leadId) || undefined, createdAt: str(value.createdAt), status: str(value.status) }));
      return crmFunnelReport(leads, activities, trials, range, timezone);
    }

    case "analytics.control_trends": {
      const range = requireRange(input, actor);
      const fromMs = Date.parse(`${range.from}T00:00:00Z`) - RANGE_MARGIN_MS;
      const toMs = Date.parse(`${range.to}T00:00:00Z`) + DAY_MS + RANGE_MARGIN_MS;
      const auditRows = await ctx.db
        .query("auditEvents")
        .withIndex("by_organization_occurred", (q) => q.eq("organizationId", actor.organization._id).gte("occurredAt", fromMs).lte("occurredAt", toMs))
        .collect();
      const audits = auditRows
        .filter((event) => branchVisible(scope, event.branchId ? scope.publicById.get(event.branchId) : undefined) || !event.branchId)
        .map((event) => ({ id: event.publicId, action: event.action, occurredAt: new Date(event.occurredAt).toISOString(), summary: event.summary, actorName: event.actorName, reason: event.reason, entityPublicId: event.entityPublicId }));
      const { branchByMember } = await memberBranchIndex(ctx, actor);
      const payments: CollectionsInputPayment[] = (await recordsInRange(ctx, actor, "payment", range))
        .map((row) => ({ row, value: data(row.data) }))
        .filter(({ row, value }) => branchVisible(scope, rowBranchPublicId(scope, row) ?? (str(value.branchId) || undefined)))
        .map(({ value }) => ({ occurredAt: str(value.occurredAt), type: str(value.type, "payment"), status: str(value.status, "completed"), amountMinor: amountMinor(value.amount) }));
      const discounts = (await recordsInRange(ctx, actor, "charge", range))
        .map((row) => ({ row, value: data(row.data) }))
        .filter(({ row, value }) => branchVisible(scope, rowBranchPublicId(scope, row) ?? branchByMember.get(str(value.memberId))))
        .map(({ value }) => ({ createdAt: str(value.createdAt), issueDate: str(value.issueDate) || undefined, discountMinor: amountMinor(value.discount) }));
      const priceOverrides = auditRows
        .filter((event) => event.action === "membership.price_override")
        .map((event) => ({ occurredAt: new Date(event.occurredAt).toISOString(), amountMinor: num(data(event.after).price) }));
      return controlTrendsReport(audits, payments, discounts, priceOverrides, range, timezone);
    }

    default:
      domainError("VALIDATION_ERROR", `Unknown analytics operation: ${operation}`, { correlationId: actor.correlationId });
  }
}
