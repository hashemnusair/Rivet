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
