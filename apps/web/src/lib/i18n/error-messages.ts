import { apiErrors } from "./messages/en/apiErrors";
import type { MessageVars } from "./dictionary";

export type ErrorMessageKey = `apiErrors.${keyof typeof apiErrors}`;
export interface ErrorMessageDescriptor { key: ErrorMessageKey; params?: MessageVars }

/** Legacy compatibility lives here, never in screen-level English comparisons.
 * New envelopes carry the stable key; English remains for older clients.
 */
const LEGACY_MESSAGES = new Map<string, ErrorMessageKey>(Object.entries(apiErrors).map(([key, text]) => [text, `apiErrors.${key}` as ErrorMessageKey]));
export function legacyErrorDescriptor(message: string): ErrorMessageDescriptor | undefined {
  const key = LEGACY_MESSAGES.get(message);
  return key ? { key } : undefined;
}

export function parseErrorDescriptor(input: unknown): ErrorMessageDescriptor | undefined {
  if (!input || typeof input !== "object") return undefined;
  const { key, params } = input as Record<string, unknown>;
  if (typeof key !== "string" || !key.startsWith("apiErrors.") || !Object.hasOwn(apiErrors, key.slice(10))) return undefined;
  if (params !== undefined && (!params || typeof params !== "object" || Array.isArray(params) || Object.values(params).some(value => typeof value !== "string" && !(typeof value === "number" && Number.isFinite(value))))) return undefined;
  const values = params as MessageVars | undefined;
  const text = apiErrors[key.slice(10) as keyof typeof apiErrors];
  for (const placeholder of text.matchAll(/\{(\w+)\}/g)) if (values?.[placeholder[1]!] === undefined) return undefined;
  return { key: key as ErrorMessageKey, ...(values ? { params: values } : {}) };
}

const CODE_KEYS: Readonly<Record<string, keyof typeof apiErrors>> = {
  VALIDATION_ERROR: "validation", FORBIDDEN: "forbidden", UNAUTHENTICATED: "sessionEnded", NOT_FOUND: "notFound", CONFLICT: "conflict", RATE_LIMITED: "rateLimited",
  ORGANIZATION_SELECTION_REQUIRED: "selectOrganization", INVITATION_NOT_ACCEPTED: "invitationNotAccepted", INVITATION_REVOKED: "invitationRevoked", IDENTITY_EMAIL_CONFLICT: "identityConflict",
  DUPLICATE_MEMBER: "duplicateMember", MEMBERSHIP_NOT_ACTIVE: "membershipInactive", NO_OUTSTANDING_BALANCE: "noBalance", PAYMENT_ALREADY_REFUNDED: "alreadyRefunded", PAYMENT_ALREADY_VOIDED: "alreadyVoided", VOID_WINDOW_EXPIRED: "voidWindow", REFUND_EXCEEDS_AMOUNT: "refundAmount",
  SHIFT_ALREADY_OPEN: "shiftOpen", NO_OPEN_SHIFT: "noShift", FREEZE_ALLOWANCE_EXCEEDED: "freezeAllowance", APPROVAL_REQUIRED: "approval", CONFIGURATION_ERROR: "configuration", FEATURE_NOT_AVAILABLE: "featureUnavailable", PLAN_LIMIT_REACHED: "planLimitReached", EXTERNAL_SERVICE_ERROR: "externalService", ACCOUNT_CHANGED: "accountChanged",
  PAYMENT_OUTCOME_UNKNOWN: "unknownPayment", UNKNOWN_PAYMENT_OUTCOME: "unknownPayment",
};
export function defaultErrorDescriptor(code: string): ErrorMessageDescriptor { return { key: `apiErrors.${CODE_KEYS[code] ?? "unexpected"}` }; }
export function fieldErrorDescriptors(errors?: Record<string, string[]>, primary?: { message: string; descriptor: ErrorMessageDescriptor }): Record<string, ErrorMessageDescriptor[]> | undefined {
  return errors ? Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages.map(message => (message === primary?.message ? primary.descriptor : undefined) ?? legacyErrorDescriptor(message) ?? defaultErrorDescriptor("VALIDATION_ERROR"))])) : undefined;
}
