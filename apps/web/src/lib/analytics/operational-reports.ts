/**
 * Pure aggregation math for the read-only operational analytics reports.
 *
 * Both adapters (Convex and mock) map their storage rows to the plain input
 * shapes below and call the same functions, so the numbers a gym sees cannot
 * drift between modes. Every function takes the tenant timezone and works on
 * tenant-local calendar boundaries; nothing here mutates or fabricates data.
 */

export interface LocalDateRange {
  /** Inclusive tenant-local calendar date, YYYY-MM-DD. */
  from: string;
  /** Inclusive tenant-local calendar date, YYYY-MM-DD. */
  to: string;
}

// --- tenant-local time helpers ---------------------------------------------

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const partFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hour12: false });
    partFormatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Tenant-local calendar date of an ISO instant. */
export function localDateOf(isoInstant: string, timeZone: string): string {
  const parsed = Date.parse(isoInstant);
  if (Number.isNaN(parsed)) return isoInstant.slice(0, 10);
  return dateFormatter(timeZone).format(parsed);
}

/** Tenant-local weekday (0=Sunday) and hour (0-23) of an ISO instant. */
export function localWeekdayHourOf(isoInstant: string, timeZone: string): { weekday: number; hour: number } {
  const parts = partFormatter(timeZone).formatToParts(Date.parse(isoInstant));
  const weekday = WEEKDAY_INDEX[parts.find((part) => part.type === "weekday")?.value ?? "Sun"] ?? 0;
  const rawHour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  // Intl may render midnight as 24 with hour12: false in some engines.
  return { weekday, hour: rawHour === 24 ? 0 : rawHour };
}

function inLocalRange(isoInstant: string, range: LocalDateRange, timeZone: string): boolean {
  const day = localDateOf(isoInstant, timeZone);
  return day >= range.from && day <= range.to;
}

/** Add calendar months to a YYYY-MM-DD date, clamping the day of month. */
export function addMonthsIso(isoDate: string, months: number): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, daysInTarget));
  return base.toISOString().slice(0, 10);
}

function diffDaysIso(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

// --- A. Peak hours ----------------------------------------------------------

export interface PeakHoursInputCheckIn {
  occurredAt: string;
  decision: string;
  branchId?: string;
}

export interface PeakHoursCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface PeakHoursReport {
  cells: PeakHoursCell[];
  admittedTotal: number;
  excludedTotal: number;
  busiest?: PeakHoursCell;
}

/**
 * Accepted check-ins by tenant-local weekday and hour. "Accepted" follows the
 * existing entry contract: every decision except "blocked" admitted the
 * member (manual overrides included).
 */
export function peakHoursReport(checkIns: PeakHoursInputCheckIn[], range: LocalDateRange, timeZone: string): PeakHoursReport {
  const counts = new Map<string, PeakHoursCell>();
  let admittedTotal = 0;
  let excludedTotal = 0;
  for (const checkIn of checkIns) {
    if (!inLocalRange(checkIn.occurredAt, range, timeZone)) continue;
    if (checkIn.decision === "blocked") {
      excludedTotal += 1;
      continue;
    }
    const { weekday, hour } = localWeekdayHourOf(checkIn.occurredAt, timeZone);
    const key = `${weekday}:${hour}`;
    const cell = counts.get(key) ?? { weekday, hour, count: 0 };
    cell.count += 1;
    counts.set(key, cell);
    admittedTotal += 1;
  }
  const cells = [...counts.values()].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
  const busiest = cells.reduce<PeakHoursCell | undefined>((best, cell) => (!best || cell.count > best.count ? cell : best), undefined);
  return { cells, admittedTotal, excludedTotal, busiest };
}

// --- B. Retention cohorts ---------------------------------------------------

export interface RetentionInputMembership {
  memberId: string;
  startDate: string;
  endDate: string;
}

export interface RetentionCheckpoint {
  retained: number;
  /** Cohort members old enough for this checkpoint; 0 means "too new". */
  eligible: number;
}

export interface RetentionCohort {
  /** Tenant-local YYYY-MM of the member's first membership start. */
  cohortMonth: string;
  size: number;
  months1: RetentionCheckpoint;
  months3: RetentionCheckpoint;
  months6: RetentionCheckpoint;
  months12: RetentionCheckpoint;
}

export interface RetentionReport {
  cohorts: RetentionCohort[];
}

/**
 * Members grouped by the local month their first membership started. A member
 * counts as retained at a checkpoint when any membership term covers that
 * exact date (start ≤ checkpoint ≤ end). Frozen memberships still count as
 * retained; a cancellation ends coverage at its shortened end date; gaps mean
 * the checkpoint they span shows the member as lost even if they later
 * return; overlapping terms count once. Terms scheduled to start after a
 * checkpoint do not cover it. A cohort only enters a column's denominator
 * once the checkpoint date has been reached.
 */
export function retentionReport(memberships: RetentionInputMembership[], todayLocal: string, maxCohorts = 12): RetentionReport {
  const firstStartByMember = new Map<string, string>();
  const byMember = new Map<string, RetentionInputMembership[]>();
  for (const membership of memberships) {
    if (!membership.startDate) continue;
    const existing = firstStartByMember.get(membership.memberId);
    if (!existing || membership.startDate < existing) firstStartByMember.set(membership.memberId, membership.startDate);
    const list = byMember.get(membership.memberId) ?? [];
    list.push(membership);
    byMember.set(membership.memberId, list);
  }
  const cohorts = new Map<string, string[]>();
  for (const [memberId, firstStart] of firstStartByMember) {
    if (firstStart > todayLocal) continue; // migration-scheduled future starts have no cohort yet
    const month = firstStart.slice(0, 7);
    const list = cohorts.get(month) ?? [];
    list.push(memberId);
    cohorts.set(month, list);
  }
  const checkpoint = (memberIds: string[], monthsAfter: number): RetentionCheckpoint => {
    let retained = 0;
    let eligible = 0;
    for (const memberId of memberIds) {
      const anchor = firstStartByMember.get(memberId)!;
      const target = addMonthsIso(anchor, monthsAfter);
      if (target > todayLocal) continue;
      eligible += 1;
      const covered = (byMember.get(memberId) ?? []).some((membership) => membership.startDate <= target && membership.endDate >= target);
      if (covered) retained += 1;
    }
    return { retained, eligible };
  };
  return {
    cohorts: [...cohorts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, maxCohorts)
      .map(([cohortMonth, memberIds]) => ({
        cohortMonth,
        size: memberIds.length,
        months1: checkpoint(memberIds, 1),
        months3: checkpoint(memberIds, 3),
        months6: checkpoint(memberIds, 6),
        months12: checkpoint(memberIds, 12),
      })),
  };
}

// --- C. Renewal forecast ----------------------------------------------------

export interface RenewalInputMembership {
  id: string;
  memberId: string;
  planId?: string;
  startDate: string;
  endDate: string;
}

export interface RenewalForecastRow {
  membershipId: string;
  memberId: string;
  memberName: string;
  planName: string;
  endDate: string;
  valueMinor: number;
}

export interface RenewalForecastBucket {
  label: string;
  count: number;
  valueMinor: number;
  rows: RenewalForecastRow[];
}

export interface RenewalForecastReport {
  /** Mutually exclusive buckets: due in 0-7, 8-14, and 15-30 days. */
  buckets: RenewalForecastBucket[];
}

/**
 * Memberships whose term ends within 30 local days, excluding any that
 * already have a qualifying successor term (another membership for the same
 * member ending after this one). Buckets are mutually exclusive so a
 * membership is counted exactly once.
 */
export function renewalForecastReport(
  memberships: RenewalInputMembership[],
  memberNames: Map<string, string>,
  planFacts: Map<string, { name: string; priceMinor: number }>,
  todayLocal: string,
  rowCap = 50,
): RenewalForecastReport {
  const byMember = new Map<string, RenewalInputMembership[]>();
  for (const membership of memberships) {
    const list = byMember.get(membership.memberId) ?? [];
    list.push(membership);
    byMember.set(membership.memberId, list);
  }
  const horizon = addMonthsIso(todayLocal, 0); // alias for clarity below
  const buckets: RenewalForecastBucket[] = [
    { label: "Next 7 days", count: 0, valueMinor: 0, rows: [] },
    { label: "8–14 days", count: 0, valueMinor: 0, rows: [] },
    { label: "15–30 days", count: 0, valueMinor: 0, rows: [] },
  ];
  const expiring = memberships
    .filter((membership) => membership.endDate >= horizon && diffDaysIso(membership.endDate, todayLocal) <= 30)
    .filter((membership) => !(byMember.get(membership.memberId) ?? []).some((candidate) => candidate.id !== membership.id && candidate.endDate > membership.endDate))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  for (const membership of expiring) {
    const days = diffDaysIso(membership.endDate, todayLocal);
    const bucket = buckets[days <= 7 ? 0 : days <= 14 ? 1 : 2]!;
    const plan = membership.planId ? planFacts.get(membership.planId) : undefined;
    bucket.count += 1;
    bucket.valueMinor += plan?.priceMinor ?? 0;
    if (bucket.rows.length < rowCap) {
      bucket.rows.push({
        membershipId: membership.id,
        memberId: membership.memberId,
        memberName: memberNames.get(membership.memberId) ?? "Member",
        planName: plan?.name ?? "—",
        endDate: membership.endDate,
        valueMinor: plan?.priceMinor ?? 0,
      });
    }
  }
  return { buckets };
}

// --- D. Collection efficiency ----------------------------------------------

export interface CollectionsInputCharge {
  createdAt: string;
  issueDate?: string;
  totalMinor: number;
  outstandingMinor: number;
}

export interface CollectionsInputPayment {
  occurredAt: string;
  type: string;
  status: string;
  amountMinor: number;
}

export interface CollectionsReport {
  chargedCount: number;
  chargedMinor: number;
  collectedCount: number;
  collectedMinor: number;
  refundedCount: number;
  refundedMinor: number;
  voidedCount: number;
  voidedMinor: number;
  /** Current outstanding balance across all open charges — not period activity. */
  outstandingNowMinor: number;
}

/**
 * Period activity uses tenant-local dates: charges by issue date, payments and
 * refunds by collection instant. A voided payment never counts as collected;
 * refunds are reported as positive amounts. Outstanding is the balance as of
 * now across every open charge, deliberately separate from period activity.
 */
export function collectionsReport(charges: CollectionsInputCharge[], payments: CollectionsInputPayment[], range: LocalDateRange, timeZone: string): CollectionsReport {
  const report: CollectionsReport = { chargedCount: 0, chargedMinor: 0, collectedCount: 0, collectedMinor: 0, refundedCount: 0, refundedMinor: 0, voidedCount: 0, voidedMinor: 0, outstandingNowMinor: 0 };
  for (const charge of charges) {
    report.outstandingNowMinor += Math.max(0, charge.outstandingMinor);
    const day = charge.issueDate ?? localDateOf(charge.createdAt, timeZone);
    if (day >= range.from && day <= range.to) {
      report.chargedCount += 1;
      report.chargedMinor += charge.totalMinor;
    }
  }
  for (const payment of payments) {
    if (!inLocalRange(payment.occurredAt, range, timeZone)) continue;
    if (payment.type === "refund") {
      report.refundedCount += 1;
      report.refundedMinor += Math.abs(payment.amountMinor);
      continue;
    }
    if (payment.status === "voided") {
      report.voidedCount += 1;
      report.voidedMinor += Math.abs(payment.amountMinor);
      continue;
    }
    report.collectedCount += 1;
    report.collectedMinor += payment.amountMinor;
  }
  return report;
}

// --- E. CRM response and conversion ----------------------------------------

export const CRM_CONTACTED_OUTCOMES: ReadonlySet<string> = new Set([
  "answered_interested",
  "answered_call_back",
  "answered_not_interested",
  "whatsapp_sent",
  "whatsapp_opened",
  "trial_booked",
  "trial_completed",
]);

export interface CrmInputLead {
  id: string;
  createdAt: string;
  convertedMemberId?: string;
}

export interface CrmInputActivity {
  leadId?: string;
  type: string;
  occurredAt: string;
  outcome?: string;
}

export interface CrmInputTrial {
  leadId?: string;
  createdAt: string;
  status: string;
}

export interface CrmFunnelReport {
  leadsCreated: number;
  leadsContacted: number;
  medianFirstResponseHours?: number;
  trialsBooked: number;
  trialsAttended: number;
  membershipsSold: number;
  /** Attended trials in the period whose lead converted, over attended trials. */
  trialToSaleRate?: number;
}

/**
 * Cohort-honest funnel: lead counts cover leads created in the period, first
 * response uses the first recorded call attempt for those leads, and trial
 * figures cover trials requested in the period using their persisted status.
 * Conversion comes from the persisted convertedMemberId fact, never from the
 * current board column.
 */
export function crmFunnelReport(leads: CrmInputLead[], activities: CrmInputActivity[], trials: CrmInputTrial[], range: LocalDateRange, timeZone: string): CrmFunnelReport {
  const periodLeads = leads.filter((lead) => inLocalRange(lead.createdAt, range, timeZone));
  const leadIds = new Set(periodLeads.map((lead) => lead.id));
  const firstAttemptByLead = new Map<string, string>();
  const contactedLeads = new Set<string>();
  for (const activity of activities) {
    if (!activity.leadId || activity.type !== "call_attempt" || !leadIds.has(activity.leadId)) continue;
    const existing = firstAttemptByLead.get(activity.leadId);
    if (!existing || activity.occurredAt < existing) firstAttemptByLead.set(activity.leadId, activity.occurredAt);
    if (activity.outcome && CRM_CONTACTED_OUTCOMES.has(activity.outcome)) contactedLeads.add(activity.leadId);
  }
  const responseHours: number[] = [];
  for (const lead of periodLeads) {
    const first = firstAttemptByLead.get(lead.id);
    if (!first) continue;
    const hours = (Date.parse(first) - Date.parse(lead.createdAt)) / 3_600_000;
    if (Number.isFinite(hours) && hours >= 0) responseHours.push(hours);
  }
  responseHours.sort((a, b) => a - b);
  const median = responseHours.length === 0
    ? undefined
    : responseHours.length % 2 === 1
      ? responseHours[(responseHours.length - 1) / 2]
      : (responseHours[responseHours.length / 2 - 1]! + responseHours[responseHours.length / 2]!) / 2;
  const periodTrials = trials.filter((trial) => inLocalRange(trial.createdAt, range, timeZone));
  const attendedTrials = periodTrials.filter((trial) => trial.status === "completed" || trial.status === "converted");
  const convertedLeadIds = new Set(leads.filter((lead) => lead.convertedMemberId).map((lead) => lead.id));
  const attendedConverted = attendedTrials.filter((trial) => trial.leadId && convertedLeadIds.has(trial.leadId)).length;
  return {
    leadsCreated: periodLeads.length,
    leadsContacted: periodLeads.filter((lead) => contactedLeads.has(lead.id)).length,
    medianFirstResponseHours: median === undefined ? undefined : Math.round(median * 10) / 10,
    trialsBooked: periodTrials.length,
    trialsAttended: attendedTrials.length,
    membershipsSold: periodLeads.filter((lead) => lead.convertedMemberId).length,
    trialToSaleRate: attendedTrials.length > 0 ? Math.round((attendedConverted / attendedTrials.length) * 100) / 100 : undefined,
  };
}

// --- F. Commercial-control trends ------------------------------------------

export interface ControlInputAudit {
  id: string;
  action: string;
  occurredAt: string;
  summary: string;
  actorName: string;
  reason?: string;
  entityPublicId: string;
}

export interface ControlInputChargeDiscount {
  createdAt: string;
  issueDate?: string;
  discountMinor: number;
}

export interface ControlTrendCounter {
  count: number;
  amountMinor: number;
}

export interface ControlTrendsReport {
  refunds: ControlTrendCounter;
  voids: ControlTrendCounter;
  discounts: ControlTrendCounter;
  priceOverrides: ControlTrendCounter;
  staffOverrides: { count: number };
  /** Most recent control events for drill-down, capped. */
  recent: ControlInputAudit[];
}

const CONTROL_ACTIONS = new Set(["payment.refund", "payment.void", "membership.price_override", "membership.date_override", "checkin.override"]);

/**
 * Sensitive commercial controls in the period. Money comes from the payment
 * and charge facts (never re-derived from audit prose); counts and drill-down
 * rows come from the immutable audit trail the actor is already authorized to
 * read on the Audit page.
 */
export function controlTrendsReport(
  audits: ControlInputAudit[],
  payments: CollectionsInputPayment[],
  discounts: ControlInputChargeDiscount[],
  priceOverrideAmounts: Array<{ occurredAt: string; amountMinor: number }>,
  range: LocalDateRange,
  timeZone: string,
  recentCap = 50,
): ControlTrendsReport {
  const inRange = (iso: string) => inLocalRange(iso, range, timeZone);
  const periodAudits = audits.filter((audit) => CONTROL_ACTIONS.has(audit.action) && inRange(audit.occurredAt));
  const count = (action: string) => periodAudits.filter((audit) => audit.action === action).length;
  const refunds = payments.filter((payment) => payment.type === "refund" && inRange(payment.occurredAt));
  const voids = payments.filter((payment) => payment.type !== "refund" && payment.status === "voided" && inRange(payment.occurredAt));
  const periodDiscounts = discounts.filter((discount) => {
    const day = discount.issueDate ?? localDateOf(discount.createdAt, timeZone);
    return day >= range.from && day <= range.to && discount.discountMinor > 0;
  });
  const overrides = priceOverrideAmounts.filter((entry) => inRange(entry.occurredAt));
  return {
    refunds: { count: refunds.length, amountMinor: refunds.reduce((sum, payment) => sum + Math.abs(payment.amountMinor), 0) },
    voids: { count: voids.length, amountMinor: voids.reduce((sum, payment) => sum + Math.abs(payment.amountMinor), 0) },
    discounts: { count: periodDiscounts.length, amountMinor: periodDiscounts.reduce((sum, discount) => sum + discount.discountMinor, 0) },
    priceOverrides: { count: count("membership.price_override"), amountMinor: overrides.reduce((sum, entry) => sum + entry.amountMinor, 0) },
    staffOverrides: { count: count("checkin.override") + count("membership.date_override") },
    recent: periodAudits.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, recentCap),
  };
}
