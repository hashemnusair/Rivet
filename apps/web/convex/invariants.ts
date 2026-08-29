import { canonicalPhoneKey } from "../src/lib/utils/contact";

export type ServerMembershipStatus = "active" | "expiring" | "frozen" | "expired" | "cancelled" | "depleted" | "scheduled";

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / 86_400_000);
}

function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function deriveServerMembershipStatus(input: { cancelledAt?: unknown; freezeStatus?: unknown; freezeStartDate?: unknown; freezeEndDate?: unknown; startDate: string; endDate: string; totalVisits?: unknown; remainingVisits?: unknown }, today: string): ServerMembershipStatus {
  if (typeof input.cancelledAt === "string" && input.cancelledAt) return "cancelled";
  if (input.freezeStatus === "active" && typeof input.freezeStartDate === "string" && typeof input.freezeEndDate === "string" && input.freezeStartDate <= today && today <= input.freezeEndDate) return "frozen";
  if (diffDays(input.startDate, today) < 0) return "scheduled";
  if (diffDays(today, input.endDate) < 0) return "expired";
  if (input.totalVisits != null && typeof input.remainingVisits === "number" && input.remainingVisits <= 0) return "depleted";
  if (diffDays(today, input.endDate) <= 14) return "expiring";
  return "active";
}

export function isValidMinorUnit(amount: unknown, allowNegative = false): amount is number {
  return typeof amount === "number" && Number.isSafeInteger(amount) && (allowNegative || amount >= 0);
}

/** A boolean is explicit only when it is truly a boolean; omitted legacy data
 * is represented as false at boolean-only compatibility boundaries and its
 * separate preference status remains `unknown`. */
export function marketingPreference(value: unknown): boolean {
  return value === true;
}

export interface DuplicateMemberCandidate {
  id?: unknown;
  fullName?: unknown;
  memberNumber?: unknown;
  phone?: unknown;
  email?: unknown;
  status?: unknown;
}

export interface DuplicateMemberMatch {
  memberId: string;
  fullName: string;
  memberNumber: string;
  matchedOn: "phone" | "email";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Finds active member matches without deciding whether the caller should
 * merely warn or reject. Manual member creation warns; lead conversion rejects.
 */
export function duplicateMemberMatches(
  members: readonly DuplicateMemberCandidate[],
  input: { phone?: unknown; email?: unknown },
): DuplicateMemberMatch[] {
  const phone = typeof input.phone === "string" ? canonicalPhoneKey(input.phone) : "";
  const email = normalizeEmail(input.email);
  if (!phone && !email) return [];

  return members.flatMap<DuplicateMemberMatch>((member) => {
    if (member.status === "archived") return [];
    const memberId = typeof member.id === "string" ? member.id : "";
    if (!memberId) return [];
    if (phone && typeof member.phone === "string" && canonicalPhoneKey(member.phone) === phone) {
      return [{ memberId, fullName: typeof member.fullName === "string" ? member.fullName : "", memberNumber: typeof member.memberNumber === "string" ? member.memberNumber : "", matchedOn: "phone" }];
    }
    if (email && normalizeEmail(member.email) === email) {
      return [{ memberId, fullName: typeof member.fullName === "string" ? member.fullName : "", memberNumber: typeof member.memberNumber === "string" ? member.memberNumber : "", matchedOn: "email" }];
    }
    return [];
  });
}

export function paymentAllocation(amount: number, outstanding: number): { ok: true; remaining: number } | { ok: false; code: "VALIDATION_ERROR" | "AMOUNT_EXCEEDS_OUTSTANDING" } {
  if (!isValidMinorUnit(amount) || amount <= 0 || !isValidMinorUnit(outstanding)) return { ok: false, code: "VALIDATION_ERROR" };
  if (amount > outstanding) return { ok: false, code: "AMOUNT_EXCEEDS_OUTSTANDING" };
  return { ok: true, remaining: outstanding - amount };
}

export function refundAllocation(requested: number | undefined, remaining: number):
  | { ok: true; amount: number }
  | { ok: false; code: "PAYMENT_ALREADY_REFUNDED" | "REFUND_EXCEEDS_AMOUNT" } {
  if (!isValidMinorUnit(remaining) || remaining <= 0) return { ok: false, code: "PAYMENT_ALREADY_REFUNDED" };
  const amount = requested ?? remaining;
  if (!isValidMinorUnit(amount) || amount <= 0 || amount > remaining) return { ok: false, code: "REFUND_EXCEEDS_AMOUNT" };
  return { ok: true, amount };
}

export function formatPaymentAuditEntityLabel(input: {
  receiptNumber?: unknown;
  memberName?: unknown;
  memberNumber?: unknown;
  memberId?: unknown;
}): string {
  const part = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const receipt = part(input.receiptNumber) ?? "Payment";
  const member = [part(input.memberName), part(input.memberNumber)].filter((value): value is string => Boolean(value)).join(" · ");
  return `${receipt} · ${member || part(input.memberId) || "Unknown member"}`;
}

export function approvalPermissionForAction(action: string):
  | "payments.discount"
  | "payments.refund"
  | "reconciliation.approve_variance"
  | null {
  if (action === "membership.discount") return "payments.discount";
  if (action === "payment.refund") return "payments.refund";
  if (action === "shift.close_variance") return "reconciliation.approve_variance";
  return null;
}

export function checkInDecisionOrder(input: {
  duplicate: boolean;
  memberActive: boolean;
  hasMembership: boolean;
  membershipStatus?: ServerMembershipStatus;
  visitsRemaining?: number;
  branchAllowed: boolean;
  expiresSoon: boolean;
  outstanding: boolean;
}): "duplicate" | "inactive" | "no_membership" | "membership_blocked" | "visits_depleted" | "wrong_branch" | "warning" | "allowed" {
  if (input.duplicate) return "duplicate";
  if (!input.memberActive) return "inactive";
  if (!input.hasMembership) return "no_membership";
  if (input.membershipStatus === "expired" || input.membershipStatus === "scheduled" || input.membershipStatus === "cancelled" || input.membershipStatus === "frozen") return "membership_blocked";
  if (input.visitsRemaining != null && input.visitsRemaining <= 0) return "visits_depleted";
  if (!input.branchAllowed) return "wrong_branch";
  if (input.expiresSoon || input.outstanding) return "warning";
  return "allowed";
}

export type TrialLifecycleStatus = "requested" | "confirmed" | "completed" | "no_show" | "cancelled" | "converted";

const TRIAL_STATUS_TRANSITIONS: Record<TrialLifecycleStatus, readonly TrialLifecycleStatus[]> = {
  requested: ["confirmed", "completed", "no_show", "cancelled"],
  confirmed: ["completed", "no_show", "cancelled"],
  completed: [],
  no_show: [],
  cancelled: [],
  converted: [],
};

export function trialTransitionAllowed(current: string, next: string): boolean {
  return (TRIAL_STATUS_TRANSITIONS[current as TrialLifecycleStatus] ?? []).includes(next as TrialLifecycleStatus);
}

export interface DashboardPaymentInput {
  type: string;
  status?: string;
  amount: number;
  occurredAt: string;
}

export interface DashboardRevenueSummary {
  revenueToday: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  revenueSeries: Array<{ date: string; collected: number; refunds: number }>;
  validPayments: DashboardPaymentInput[];
  rangePayments: DashboardPaymentInput[];
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

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) + days)).toISOString().slice(0, 10);
}

/**
 * Dashboard KPIs need a wider history than the chart window. This keeps the
 * current/previous month totals correct even when the caller asks for only a
 * 30-day chart range.
 */
export function dashboardRevenueSummary(
  payments: readonly DashboardPaymentInput[],
  input: { today: string; from: string; to: string; timezone: string },
): DashboardRevenueSummary {
  const validPayments = payments.filter((payment) => payment.status !== "voided");
  const dated = validPayments.map((payment) => ({ payment, date: businessDate(payment.occurredAt, input.timezone) }));
  const rangePayments = dated
    .filter(({ date }) => date >= input.from && date <= input.to)
    .map(({ payment }) => payment);
  const currentMonth = input.today.slice(0, 7);
  const previousMonth = addCalendarDays(`${currentMonth}-01`, -1).slice(0, 7);
  const isCollection = (type: string) => type === "payment" || type === "retail_sale";
  const totalForMonth = (month: string) => dated
    .filter(({ date, payment }) => date.slice(0, 7) === month && isCollection(payment.type))
    .reduce((sum, { payment }) => sum + payment.amount, 0);
  const totalOn = (date: string, type: "payment" | "refund") => dated
    .filter(({ date: paymentDate, payment }) => paymentDate === date && (type === "payment" ? isCollection(payment.type) : payment.type === type))
    .reduce((sum, { payment }) => sum + (type === "refund" ? Math.abs(payment.amount) : payment.amount), 0);
  const rangeDated = rangePayments.map((payment) => ({ payment, date: businessDate(payment.occurredAt, input.timezone) }));
  const rangeTotalOn = (date: string, type: "payment" | "refund") => rangeDated
    .filter(({ date: paymentDate, payment }) => paymentDate === date && (type === "payment" ? isCollection(payment.type) : payment.type === type))
    .reduce((sum, { payment }) => sum + (type === "refund" ? Math.abs(payment.amount) : payment.amount), 0);

  return {
    revenueToday: totalOn(input.today, "payment"),
    revenueThisMonth: totalForMonth(currentMonth),
    revenuePrevMonth: totalForMonth(previousMonth),
    revenueSeries: Array.from({ length: 30 }, (_, index) => {
      const date = addCalendarDays(input.to, index - 29);
      return { date, collected: rangeTotalOn(date, "payment"), refunds: rangeTotalOn(date, "refund") };
    }),
    validPayments,
    rangePayments,
  };
}
