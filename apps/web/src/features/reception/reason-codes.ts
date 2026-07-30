import type { CheckInReasonCode } from "@/lib/domain/types";

/** Front-desk wording for every check-in reason code — plain, no jargon. */
export const REASON_CODE_LABELS: Record<CheckInReasonCode, string> = {
  OK: "Membership valid",
  EXPIRES_SOON: "Membership expires soon",
  OUTSTANDING_BALANCE: "Outstanding balance on the account",
  MEMBERSHIP_EXPIRED: "Membership has expired",
  NO_ACTIVE_MEMBERSHIP: "No membership on file",
  WRONG_BRANCH: "Membership does not cover this branch",
  VISITS_DEPLETED: "No visits left on the pass",
  MEMBERSHIP_FROZEN: "Membership is frozen",
  MEMBER_INACTIVE: "Member account is not active",
  DUPLICATE_SCAN: "Already scanned moments ago",
  MANUAL_OVERRIDE: "Let in by manual override",
};
