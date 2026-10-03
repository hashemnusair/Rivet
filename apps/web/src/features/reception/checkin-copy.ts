import type { TFunction } from "@/lib/i18n/core";
import type { Locale } from "@/lib/i18n/locale";
import type { MembershipSummary } from "@/lib/domain/types";
import { diffDays } from "@/lib/utils/dates";

/**
 * Localize only the stable server messages whose meaning is also present in
 * typed check-in fields. Unrecognized messages remain exactly as received.
 */
export function checkInMessage({
  message,
  reasonCodes,
  decision,
  locale,
  t,
  isolate,
  today,
  formatDate,
  membership,
  actorName,
}: {
  message: string;
  reasonCodes: readonly string[];
  decision: string;
  locale: Locale;
  t: TFunction;
  isolate: (value: string | number) => string;
  today: string;
  formatDate: (iso: string) => string;
  membership?: MembershipSummary;
  actorName?: string;
}): string {
  if (locale !== "ar") return message;

  if (decision === "overridden" && reasonCodes.includes("MANUAL_OVERRIDE") && actorName) {
    const prefix = "Overridden by " + actorName + ": ";
    if (message.startsWith(prefix)) {
      return t("deskCompletion.reception.message.overrideRecorded", {
        actor: isolate(actorName),
        reason: isolate(message.slice(prefix.length)),
      });
    }
  }

  if (decision === "warning") {
    const notices: string[] = [];
    const expectedNotices: string[] = [];
    let hasExactWarningInputs = true;
    if (reasonCodes.includes("EXPIRES_SOON")) {
      if (!membership?.endDate) {
        hasExactWarningInputs = false;
      } else {
        const daysLeft = diffDays(today, membership.endDate);
        if (daysLeft < 0) {
          hasExactWarningInputs = false;
        } else if (daysLeft === 0) {
          expectedNotices.push("membership expires today");
          notices.push(t("deskCompletion.reception.message.expiresToday"));
        } else {
          expectedNotices.push(`membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
          notices.push(t("deskCompletion.reception.message.expiresInDays", { count: daysLeft }));
        }
      }
    }
    if (reasonCodes.includes("OUTSTANDING_BALANCE")) {
      expectedNotices.push("outstanding balance due");
      notices.push(t("deskCompletion.reception.message.balanceDue"));
    }
    const expectedMessage = `Allowed with notice — ${expectedNotices.join("; ")}.`;
    if (
      hasExactWarningInputs &&
      notices.length > 0 &&
      reasonCodes.every((code) => code === "EXPIRES_SOON" || code === "OUTSTANDING_BALANCE") &&
      message === expectedMessage
    ) {
      return t("deskCompletion.reception.message.allowedWithNotices", { notices: notices.join(" ") });
    }
  }

  if (reasonCodes.length === 1 && reasonCodes[0] === "OK" && decision === "allowed" && message === "Membership valid. Welcome in.") {
    return t("deskCompletion.reception.message.welcome");
  }
  const code = reasonCodes.find((candidate) => candidate !== "OK");
  if (code === "DUPLICATE_SCAN" && message === "Already checked in moments ago. Duplicate scan ignored.") {
    return t("deskCompletion.reception.message.duplicateScan");
  }
  if (code === "MEMBER_INACTIVE" && message === "This member account is not active.") {
    return t("deskCompletion.reception.message.memberInactive");
  }
  if (code === "NO_ACTIVE_MEMBERSHIP" && message === "No membership on file. Sell or renew a membership to allow entry.") {
    return t("deskCompletion.reception.message.noMembership");
  }
  if (code === "MEMBERSHIP_NOT_STARTED") {
    const start = /^Membership starts on (\d{4}-\d{2}-\d{2})\. Entry before then needs a manager override\.$/.exec(message);
    if (start) return t("deskCompletion.reception.message.membershipStartsOn", { date: formatDate(start[1]!) });
    if (message === "Membership has not started yet. Entry before the start date needs a manager override.") {
      return t("deskCompletion.reception.message.membershipHasNotStarted");
    }
  }
  if (code === "MEMBERSHIP_EXPIRED") {
    if (membership?.status === "cancelled" && message === "Membership was cancelled. Entry requires a manager override.") {
      return t("deskCompletion.reception.message.membershipCancelled");
    }
    if (message === "Membership is not currently valid. Renew to allow entry.") {
      return t("deskCompletion.reception.message.membershipInvalid");
    }
  }
  if (code === "MEMBERSHIP_FROZEN" && message === "Membership is frozen. Unfreeze or ask a manager to override.") {
    return t("deskCompletion.reception.message.membershipFrozen");
  }
  if (code === "VISITS_DEPLETED" && message === "No visits remaining on this pass.") {
    return t("deskCompletion.reception.message.visitsDepleted");
  }
  if (code === "WRONG_BRANCH" && message === "This membership does not include access to this branch.") {
    return t("deskCompletion.reception.message.wrongBranch");
  }
  if (code === "OUTSIDE_OPERATING_HOURS" && message === "This branch is currently closed. A manager override is required for entry.") {
    return t("deskCompletion.reception.message.branchClosed");
  }
  if (code === "OUTSTANDING_BALANCE" && decision === "blocked" && message === "Entry blocked because this member has an unpaid amount.") {
    return t("deskCompletion.reception.message.unpaidBlocksEntry");
  }
  return message;
}

/** These exact no-match messages are generated from the current query, not member history. */
export function lookupMessage({
  message,
  query,
  candidateCount,
  locale,
  t,
  isolate,
}: {
  message: string;
  query: string;
  candidateCount?: number;
  locale: Locale;
  t: TFunction;
  isolate: (value: string | number) => string;
}): string {
  if (locale !== "ar") return message;

  const trimmed = query.trim();
  const safeQuery = isolate(trimmed);
  if (message === "Type a name, phone, or member number.") {
    return t("deskCompletion.reception.lookup.queryEmpty");
  }
  if (message === "Keep typing — at least 3 characters.") {
    return t("deskCompletion.reception.lookup.queryTooShort", { count: 3 });
  }
  if (candidateCount && message === String(candidateCount) + " members match “" + trimmed + "”. Choose the right person to continue.") {
    return t("deskCompletion.reception.lookup.matchCount", { count: candidateCount, query: safeQuery });
  }
  if (message === "No member matches “" + trimmed + "”.") {
    return t("deskCompletion.reception.lookup.noMatch", { query: safeQuery });
  }
  return message;
}
