import type { CheckInReasonCode } from "@/lib/domain/types";

/** Front-desk wording for every check-in reason code — plain, no jargon. */
export const REASON_CODE_LABELS: Record<CheckInReasonCode, string> = {
  OK: "Membership is active",
  EXPIRES_SOON: "Membership ends soon",
  OUTSTANDING_BALANCE: "Member owes money",
  MEMBERSHIP_EXPIRED: "Membership has ended",
  MEMBERSHIP_NOT_STARTED: "Membership has not started yet",
  NO_ACTIVE_MEMBERSHIP: "No membership",
  WRONG_BRANCH: "Membership is not for this branch",
  VISITS_DEPLETED: "No visits left",
  MEMBERSHIP_FROZEN: "Membership is frozen",
  MEMBER_INACTIVE: "Member is not active",
  DUPLICATE_SCAN: "Already scanned a moment ago",
  OUTSIDE_OPERATING_HOURS: "Branch is closed now",
  MANUAL_OVERRIDE: "Staff let them in anyway",
};
