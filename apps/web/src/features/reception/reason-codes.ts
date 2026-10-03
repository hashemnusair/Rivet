import type { CheckInReasonCode } from "@/lib/domain/types";
import type { TFunction, TKey } from "@/lib/i18n/core";

export const REASON_CODE_KEYS: Record<CheckInReasonCode, TKey> = {
  OK: "deskCompletion.reception.reason.ok",
  EXPIRES_SOON: "deskCompletion.reception.reason.expiresSoon",
  OUTSTANDING_BALANCE: "deskCompletion.reception.reason.outstanding",
  MEMBERSHIP_EXPIRED: "deskCompletion.reception.reason.expired",
  MEMBERSHIP_NOT_STARTED: "deskCompletion.reception.reason.notStarted",
  NO_ACTIVE_MEMBERSHIP: "deskCompletion.reception.reason.noMembership",
  WRONG_BRANCH: "deskCompletion.reception.reason.wrongBranch",
  VISITS_DEPLETED: "deskCompletion.reception.reason.noVisits",
  MEMBERSHIP_FROZEN: "deskCompletion.reception.reason.frozen",
  MEMBER_INACTIVE: "deskCompletion.reception.reason.inactive",
  DUPLICATE_SCAN: "deskCompletion.reception.reason.duplicate",
  OUTSIDE_OPERATING_HOURS: "deskCompletion.reception.reason.branchClosed",
  MANUAL_OVERRIDE: "deskCompletion.reception.reason.manualOverride",
};

/** Display only the known structured reason key; keep future and historical values intact. */
export function checkInReasonLabel(code: string, t: TFunction): string {
  return Object.hasOwn(REASON_CODE_KEYS, code)
    ? t(REASON_CODE_KEYS[code as CheckInReasonCode])
    : code;
}
