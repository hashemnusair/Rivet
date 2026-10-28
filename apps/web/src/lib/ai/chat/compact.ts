import { exponentFor } from "../../utils/money";

/**
 * Turns domain read results into the smallest faithful text the assistant
 * needs. Records keep their ids (so answers can link back), names, dates and
 * money; photos, internal references and empty fields are dropped, long text
 * is cut and long lists are truncated with an honest "more" count.
 *
 * Inputs are treated as unknown: these are RIVET's own projections, but
 * nothing here assumes a field exists.
 */

export type Row = Record<string, unknown>;

export const TEXT_FIELD_MAX = 280;
/** Characters of one source or tool result sent to the assistant. */
export const RESULT_CHARS_MAX = 7_000;

export function isRecord(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isMoney(value: unknown): value is { amount: number; currency: string } {
  return isRecord(value) && typeof value.amount === "number" && typeof value.currency === "string" && Object.keys(value).length <= 3;
}

/** "JOD 40.000": the currency's real precision, never a rounded float. */
export function moneyText(value: unknown): string | undefined {
  if (!isMoney(value)) return undefined;
  const exponent = exponentFor(value.currency);
  const sign = value.amount < 0 ? "-" : "";
  const absolute = Math.abs(Math.round(value.amount));
  const major = Math.floor(absolute / 10 ** exponent);
  const minor = String(absolute % 10 ** exponent).padStart(exponent, "0");
  return `${sign}${value.currency.toUpperCase()} ${major}${exponent ? `.${minor}` : ""}`;
}

function cut(text: string, max = TEXT_FIELD_MAX): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Recursively drops empty values, formats money and cuts text. */
export function clean(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() ? cut(value.trim()) : undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (isMoney(value)) return moneyText(value);
  if (depth > 4) return undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => clean(item, depth + 1)).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (isRecord(value)) {
    const out: Row = {};
    for (const [key, item] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key) || key.endsWith("Url")) continue;
      const cleaned = clean(item, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}

/** Internal references and presentation details the assistant never needs. */
const DROPPED_KEYS = new Set(["organizationId", "idempotencyKey", "createdById", "collectedById", "soldById", "openedById", "closedById", "actorId", "templateId", "titleMessage", "bodyMessage", "progressFacts", "photoUrl", "imageUrl", "imageAltText", "outstandingCharges", "receiptId", "chargeId", "shiftId", "href", "action", "meta"]);

export function pick(row: unknown, fields: readonly string[]): Row {
  if (!isRecord(row)) return {};
  const out: Row = {};
  for (const field of fields) if (row[field] !== undefined) out[field] = row[field];
  return (clean(out) as Row | undefined) ?? {};
}

/** A page of rows: the first `limit`, the count read and how many matched in all. */
export function listOf(page: unknown, limit: number, project: (row: unknown) => Row): { rows: Row[]; count: number; total: number } {
  const items = Array.isArray(page) ? page : isRecord(page) && Array.isArray(page.items) ? page.items : [];
  const total = isRecord(page) && typeof page.totalItems === "number" ? page.totalItems : items.length;
  const rows = items.slice(0, limit).map(project).filter((row) => Object.keys(row).length > 0);
  return { rows, count: rows.length, total: Math.max(total, rows.length) };
}

/** Compact JSON, cut at a whole row when it would exceed the budget. */
export function serialize(value: unknown, max = RESULT_CHARS_MAX): string {
  const text = JSON.stringify(clean(value) ?? {});
  if (text.length <= max) return text;
  if (isRecord(value) && Array.isArray(value.rows)) {
    const rows = [...value.rows];
    while (rows.length > 1) {
      rows.pop();
      const shorter = JSON.stringify(clean({ ...value, rows, truncated: `showing ${rows.length} of ${value.rows.length} rows read` }) ?? {});
      if (shorter.length <= max) return shorter;
    }
  }
  return `${text.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// Projections of the domain read models
// ---------------------------------------------------------------------------

export const memberRow = (row: unknown) => pick(row, ["id", "memberNumber", "fullName", "fullNameAr", "phone", "status", "membershipStatus", "currentPlanName", "membershipEndDate", "outstanding", "lastCheckInAt", "tags"]);

export function memberDetail(row: unknown): Row {
  const base = pick(row, ["id", "memberNumber", "fullName", "fullNameAr", "phone", "email", "preferredLanguage", "gender", "dateOfBirth", "status", "membershipStatus", "currentPlanName", "membershipEndDate", "outstanding", "lastCheckInAt", "tags", "source", "marketingOptIn", "createdAt", "notes"]);
  const stats = isRecord(row) ? pick(row.stats, ["checkInsLast30Days", "totalCheckIns", "lifetimeValue", "daysSinceLastCheckIn"]) : {};
  return Object.keys(stats).length ? { ...base, stats } : base;
}

export const leadRow = (row: unknown) => pick(row, ["id", "fullName", "phone", "stage", "source", "ownerName", "branchName", "expectedValue", "nextFollowUpAt", "lastContactOutcome", "lastContactAt", "overdue", "lostReason", "createdAt"]);

export function leadDetail(row: unknown): Row {
  const base = leadRow(row);
  if (!isRecord(row)) return base;
  const doNotContact = isRecord(row.doNotContact) ? { doNotContact: pick(row.doNotContact, ["since", "reason"]) } : {};
  const activities = Array.isArray(row.activities) ? row.activities.slice(0, 8).map(timelineRow) : [];
  const offers = Array.isArray(row.offers) ? row.offers.slice(0, 5).map((offer) => pick(offer, ["id", "status", "planName", "price", "expiresAt", "createdAt"])) : [];
  return { ...base, ...pick(row, ["notes"]), ...doNotContact, ...(activities.length ? { activities } : {}), ...(offers.length ? { offers } : {}) };
}

export const timelineRow = (row: unknown) => pick(row, ["type", "title", "body", "actorName", "occurredAt"]);

export const taskRow = (row: unknown) => pick(row, ["id", "type", "title", "subjectName", "memberId", "leadId", "ownerName", "dueAt", "priority", "status", "outcome"]);

export function renewalRow(row: unknown): Row {
  if (!isRecord(row)) return {};
  return { member: pick(row.member, ["id", "fullName", "phone", "outstanding"]), ...pick(row.membership, ["planName", "endDate", "status", "paymentStatus"]), ...pick(row, ["daysUntilExpiry", "lastContactAt", "lastContactOutcome"]), ...(row.openTaskId ? { hasOpenTask: true } : {}) };
}

export function atRiskRow(row: unknown): Row {
  if (!isRecord(row)) return {};
  const reasons = Array.isArray(row.reasons) ? row.reasons.map((reason) => pick(reason, ["kind", "daysInactive", "daysUntilExpiry", "daysSinceExpiry"])) : [];
  return { member: pick(row.member, ["id", "fullName", "phone"]), ...pick(row.membership, ["planName", "endDate", "status"]), ...pick(row, ["priority", "lastVisitAt", "lastContactAt", "lastContactOutcome"]), reasons };
}

export const paymentRow = (row: unknown) => pick(row, ["id", "occurredAt", "memberName", "memberNumber", "memberId", "type", "amount", "method", "status", "receiptNumber", "collectedByName", "branchName", "refundedAmount", "refundReason", "voidReason"]);

export const shiftRow = (row: unknown) => pick(row, ["id", "openedByName", "openedAt", "closedAt", "openingFloat", "expectedCash", "countedCash", "variance", "varianceExplanation", "varianceApprovalStatus", "status"]);

export const classRow = (row: unknown) => pick(row, ["id", "name", "date", "startsAt", "endsAt", "branchName", "coachName", "substituted", "capacity", "bookedCount", "waitlistCount", "spotsRemaining", "status", "cancelReason"]);

export const planRow = (row: unknown) => pick(row, ["id", "name", "kind", "durationDays", "visitAllowance", "basePrice", "freezeAllowanceDays", "includedPtSessions", "status", "activeSubscribers"]);

export function dashboardSummary(value: unknown): Row {
  if (!isRecord(value)) return {};
  const queue = isRecord(value.todayQueue) ? value.todayQueue : {};
  const items = Array.isArray(queue.items) ? queue.items.slice(0, 15).map((item) => {
    const subject = isRecord(item) && isRecord(item.subject) ? { subject: pick(item.subject, ["kind", "id"]) } : {};
    return { ...pick(item, ["kind", "priority", "title", "detail", "subjectName", "branchName", "dueAt", "overdue", "amount"]), ...subject };
  }) : [];
  const alerts = Array.isArray(value.alerts) ? value.alerts.slice(0, 8).map((alert) => pick(alert, ["kind", "title", "detail", "amount", "severity", "occurredAt"])) : [];
  return {
    kpis: clean(value.kpis),
    todayQueue: { totalItems: num(queue.totalItems), urgentItems: num(queue.urgentItems), overdueItems: num(queue.overdueItems), items },
    ...(alerts.length ? { alerts } : {}),
  };
}

/** Reports are already summaries; keep their shape and cut long series. */
export function reportSummary(value: unknown): unknown {
  if (!isRecord(value)) return clean(value);
  const out: Row = {};
  for (const [key, item] of Object.entries(value)) out[key] = Array.isArray(item) ? item.slice(0, 31) : item;
  return clean(out);
}
