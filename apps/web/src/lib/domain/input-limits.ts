/**
 * Text lengths the API enforces. Inputs use the same numbers as `maxLength`,
 * so an operator is stopped while typing rather than by an error after Save
 * (or, for a search, by an error panel that "Try again" cannot clear).
 */
export const TEXT_LIMITS = {
  /** Members, leads, imported rows and checkout guests. */
  personName: 120,
  /** The Search RIVET palette and the supplier-bill search. */
  search: 120,
  planName: 80,
  className: 80,
  classNotes: 500,
  coachName: 60,
  zoneName: 80,
  taskTitle: 160,
  automationRuleName: 120,
  productName: 120,
  supplierName: 120,
  equipmentName: 120,
  equipmentProblemTitle: 160,
  repairDescription: 240,
  guestPhone: 40,
} as const;

/**
 * Typed plan counts. Days and visits feed expiry and visit maths, so the API
 * refuses anything but a whole number in these ranges ("1e3" is not 1000).
 */
export const PLAN_COUNT_LIMITS = {
  durationDays: { min: 1, max: 3650 },
  visitAllowance: { min: 1, max: 1000 },
  visitValidityDays: { min: 1, max: 3650 },
  freezeAllowanceDays: { min: 0, max: 180 },
} as const;

/**
 * Automation timings. A trigger looks at most a year away in days or a month
 * away in hours, and a rule waits at most a year before it repeats for the
 * same member; larger numbers were stored and simply never fired.
 */
export const AUTOMATION_LIMITS = {
  days: 365,
  hours: 720,
  repeatWaitHours: 8760,
} as const;

/**
 * Free text the API bounds by field name, at any depth of a request to
 * `domain.mutate`. Each limit is at or above the ceiling of every form that
 * sends the field (a line stops at 255, the gym address at 300, a text area
 * at 2,000; `components/ui/input.tsx`), so typing in RIVET never meets it.
 * It stops a direct caller from storing pages of text that every list,
 * receipt and timeline would then echo. Tighter rules of a field's own (a
 * payment note, a plan name) still apply after this.
 */
export const FREE_TEXT_LIMITS = {
  notes: 2000,
  note: 2000,
  activationNote: 2000,
  body: 2000,
  description: 2000,
  resolutionSummary: 2000,
  subject: 255,
  address: 500,
  addressLine: 500,
  addressLine1: 500,
  city: 255,
} as const;

/** `reason`, and every field named like it (`overrideReason`, `discountReason`, `lostReason`…). */
export const REASON_TEXT_LIMIT = 2000;

export function freeTextLimit(field: string): number | undefined {
  if (Object.prototype.hasOwnProperty.call(FREE_TEXT_LIMITS, field)) return FREE_TEXT_LIMITS[field as keyof typeof FREE_TEXT_LIMITS];
  return field === "reason" || field.endsWith("Reason") ? REASON_TEXT_LIMIT : undefined;
}
