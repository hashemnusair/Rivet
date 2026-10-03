import type { FollowUpDelivery } from "@/lib/domain/types";
import type { TFunction, TKey } from "@/lib/i18n/provider";
import { contactOutcomeLabel } from "@/features/crm/crm-labels";

const STOP_REASON_KEYS = {
  member_or_membership_not_found: "crmCompletion.followUpContext.stopReason.noCurrentMembership",
  membership_renewed: "crmCompletion.followUpContext.stopReason.alreadyRenewed",
  membership_cancelled: "crmCompletion.followUpContext.stopReason.membershipCancelled",
  member_not_active: "crmCompletion.followUpContext.stopReason.memberInactive",
  member_requested_no_contact: "crmCompletion.followUpContext.stopReason.memberNoContact",
  membership_frozen: "crmCompletion.followUpContext.stopReason.membershipFrozen",
  membership_not_started: "crmCompletion.followUpContext.stopReason.notStarted",
  membership_expired: "crmCompletion.followUpContext.stopReason.termEnded",
  membership_depleted: "crmCompletion.followUpContext.stopReason.visitsUsed",
  membership_term_changed: "crmCompletion.followUpContext.stopReason.termChanged",
  membership_not_found: "crmCompletion.followUpContext.stopReason.membershipNotFound",
  member_not_found: "crmCompletion.followUpContext.stopReason.memberNotFound",
} satisfies Record<string, TKey>;

const STOP_LABEL_KEYS = {
  "no current membership": STOP_REASON_KEYS.member_or_membership_not_found,
  "already renewed": STOP_REASON_KEYS.membership_renewed,
  "membership cancelled": STOP_REASON_KEYS.membership_cancelled,
  "member not active": STOP_REASON_KEYS.member_not_active,
  "member asked not to be contacted": STOP_REASON_KEYS.member_requested_no_contact,
  "membership frozen": STOP_REASON_KEYS.membership_frozen,
  "term has not started": STOP_REASON_KEYS.membership_not_started,
  "term has ended": STOP_REASON_KEYS.membership_expired,
  "visits used up": STOP_REASON_KEYS.membership_depleted,
  "term dates changed": STOP_REASON_KEYS.membership_term_changed,
  "membership not found": STOP_REASON_KEYS.membership_not_found,
  "member not found": STOP_REASON_KEYS.member_not_found,
} satisfies Record<string, TKey>;

const SUPPRESSION_REASON_KEYS = {
  "A valid member phone number is not available": "crmCompletion.followUpContext.suppressionReason.phoneUnavailable",
  "Recipient opted out of renewal messages": "crmCompletion.followUpContext.suppressionReason.recipientOptedOut",
  "Explicit consent is required for renewal messages": "crmCompletion.followUpContext.suppressionReason.consentRequired",
} satisfies Record<string, TKey>;

const DELIVERY_LABEL_KEYS = {
  queued: "crmCompletion.followUpContext.deliveryLabel.queued",
  sent: "crmCompletion.followUpContext.deliveryLabel.sent",
  sandboxed: "crmCompletion.followUpContext.deliveryLabel.sandboxed",
  deferred: "crmCompletion.followUpContext.deliveryLabel.deferred",
  suppressed: "crmCompletion.followUpContext.deliveryLabel.suppressed",
  cancelled: "crmCompletion.followUpContext.deliveryLabel.cancelled",
  failed: "crmCompletion.followUpContext.deliveryLabel.failed",
  completed: "crmCompletion.followUpContext.deliveryLabel.completed",
} satisfies Record<string, TKey>;

const DELIVERY_CHANNEL_KEYS = {
  staff_task: "crmCompletion.followUpContext.deliveryChannel.staffTask",
  sms: "crmCompletion.followUpContext.deliveryChannel.sms",
  whatsapp: "crmCompletion.followUpContext.deliveryChannel.whatsapp",
} satisfies Record<string, TKey>;

const DELIVERY_CHECKPOINT_KEYS = {
  "14_day": "crmCompletion.followUpContext.checkpointDays",
  "7_day": "crmCompletion.followUpContext.checkpointDays",
  "3_day": "crmCompletion.followUpContext.checkpointDays",
  "1_day_call": "crmCompletion.followUpContext.checkpointOneDayCall",
} satisfies Record<string, TKey>;

const DELIVERY_DETAIL_KEYS = {
  "The call task is open.": "crmCompletion.followUpContext.deliveryDetail.staffCallOpen",
  "Waiting for the outbound worker; nothing has reached the member yet.": "crmCompletion.followUpContext.deliveryDetail.waitingForWorker",
  "RIVET has no delivery receipt.": "crmCompletion.followUpContext.deliveryDetail.noDeliveryReceipt",
  "External delivery is off for this gym.": "crmCompletion.followUpContext.deliveryDetail.externalDeliveryOff",
  "Suppressed by RIVET's messaging rules.": "crmCompletion.followUpContext.deliveryDetail.suppressedByRules",
  "The call task was completed.": "crmCompletion.followUpContext.deliveryDetail.callTaskCompleted",
} satisfies Record<string, TKey>;

export function followUpStopReasonLabel(t: TFunction, reason?: string, legacyLabel?: string): string | undefined {
  if (reason && Object.hasOwn(STOP_REASON_KEYS, reason)) {
    return t(STOP_REASON_KEYS[reason as keyof typeof STOP_REASON_KEYS]);
  }
  if (reason) return reason;
  if (!legacyLabel) return undefined;
  return Object.hasOwn(STOP_LABEL_KEYS, legacyLabel)
    ? t(STOP_LABEL_KEYS[legacyLabel as keyof typeof STOP_LABEL_KEYS])
    : legacyLabel;
}

export function followUpSuppressionReasonLabel(t: TFunction, reason?: string): string | undefined {
  if (!reason) return undefined;
  return Object.hasOwn(SUPPRESSION_REASON_KEYS, reason)
    ? t(SUPPRESSION_REASON_KEYS[reason as keyof typeof SUPPRESSION_REASON_KEYS])
    : reason;
}

export function followUpOutcomeLabel(t: TFunction, outcome?: string | null, fallback?: string): string | undefined {
  return contactOutcomeLabel(t, outcome) ?? fallback;
}

export function followUpDeliveryLabel(t: TFunction, delivery: FollowUpDelivery): string {
  if (
    !Object.hasOwn(DELIVERY_LABEL_KEYS, delivery.status)
    || !Object.hasOwn(DELIVERY_CHANNEL_KEYS, delivery.channel)
    || !Object.hasOwn(DELIVERY_CHECKPOINT_KEYS, delivery.checkpointKey)
  ) {
    return delivery.label;
  }

  const checkpoint = delivery.checkpointKey === "1_day_call"
    ? t("crmCompletion.followUpContext.checkpointOneDayCall")
    : t("crmCompletion.followUpContext.checkpointDays", { count: Number.parseInt(delivery.checkpointKey, 10) });
  return t(DELIVERY_LABEL_KEYS[delivery.status as keyof typeof DELIVERY_LABEL_KEYS], {
    channel: t(DELIVERY_CHANNEL_KEYS[delivery.channel as keyof typeof DELIVERY_CHANNEL_KEYS]),
    checkpoint,
  });
}

export function followUpDeliveryDetailLabel(
  t: TFunction,
  delivery: FollowUpDelivery,
  formatClock: (value: string) => string,
): string | undefined {
  const detail = delivery.detail;
  if (!detail) return undefined;
  if (Object.hasOwn(DELIVERY_DETAIL_KEYS, detail)) {
    return t(DELIVERY_DETAIL_KEYS[detail as keyof typeof DELIVERY_DETAIL_KEYS]);
  }

  const suppressionReason = followUpSuppressionReasonLabel(t, detail);
  if (suppressionReason !== detail) return suppressionReason;

  const stopReason = Object.hasOwn(STOP_LABEL_KEYS, detail)
    ? t(STOP_LABEL_KEYS[detail as keyof typeof STOP_LABEL_KEYS])
    : undefined;
  if (stopReason) return stopReason;

  if (delivery.status === "deferred") {
    const resumesAt = /^Resumes at (\d{2}:\d{2})\.$/.exec(detail);
    if (resumesAt) return t("crmCompletion.followUpContext.deliveryDetail.resumesAt", { time: formatClock(resumesAt[1]!) });
  }

  if (delivery.status === "failed") {
    const failedAttempts = /^Failed after (\d+) attempts?; follow up by phone\.$/.exec(detail);
    if (failedAttempts) {
      return t("crmCompletion.followUpContext.deliveryDetail.failedAttempts", { count: Number(failedAttempts[1]) });
    }
  }
  return detail;
}
