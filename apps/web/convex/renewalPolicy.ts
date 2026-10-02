export type RenewalMessageChannel = "whatsapp" | "sms";
export type RenewalConsentStatus = "explicit_opt_in" | "explicit_opt_out" | "unknown";
export type RenewalCheckpointKey = "14_day" | "7_day" | "3_day" | "1_day_call";

export const RENEWAL_POLICY_VERSION = "renewal-policy-v1";

export const RENEWAL_CHECKPOINTS = [
  { days: 14 as const, key: "14_day" as const, templateVersion: "renewal-14-day-v1" },
  { days: 7 as const, key: "7_day" as const, templateVersion: "renewal-7-day-v1" },
  { days: 3 as const, key: "3_day" as const, templateVersion: "renewal-3-day-v1" },
  { days: 1 as const, key: "1_day_call" as const, templateVersion: "renewal-call-v1" },
] as const;

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function checkpointForDays(daysLeft: number) {
  return RENEWAL_CHECKPOINTS.find((checkpoint) => checkpoint.days === daysLeft);
}

export function renewalDedupeKey(input: { organizationId: string; membershipId: string; membershipEndDate: string; checkpoint: RenewalCheckpointKey; channel: RenewalMessageChannel | "staff_task" }): string {
  return `renewal:${input.organizationId}:${input.membershipId}:${input.membershipEndDate}:${input.checkpoint}:${input.channel}:${RENEWAL_POLICY_VERSION}`;
}

export function consentForRenewalChannel(member: UnknownRecord, channel: RenewalMessageChannel): {
  status: RenewalConsentStatus;
  source?: string;
  changedAt?: number;
  channelOptedOut: boolean;
} {
  const preference = record(member.marketingPreference);
  const directStatus = text(member.marketingPreferenceStatus);
  const legacyStatus: RenewalConsentStatus = directStatus === "explicit_opt_in" || directStatus === "explicit_opt_out" || directStatus === "unknown"
    ? directStatus
    : text(preference.status) === "explicit_opt_in" || text(preference.status) === "explicit_opt_out" || text(preference.status) === "unknown"
      ? text(preference.status) as RenewalConsentStatus
      : bool(preference.optedIn) !== undefined && text(preference.source) && text(preference.source) !== "system_default"
        ? bool(preference.optedIn) ? "explicit_opt_in" : "explicit_opt_out"
        : member.marketingOptIn === false || preference.optedIn === false ? "explicit_opt_out" : "unknown";
  const channelOptOut = bool(member[`${channel}OptedOut`]) ?? bool(member[`${channel}MarketingOptOut`]);
  const channelOptIn = bool(member[`${channel}OptIn`]) ?? bool(member[`${channel}MarketingOptIn`]);
  const status = channelOptOut === true ? "explicit_opt_out" : channelOptIn === true ? "explicit_opt_in" : legacyStatus;
  return {
    status,
    source: text(member.marketingPreferenceSource) ?? text(preference.source) ?? (channelOptOut !== undefined || channelOptIn !== undefined ? "member_channel_selected" : undefined),
    changedAt: finiteNumber(member.marketingPreferenceChangedAt) ?? finiteNumber(preference.changedAt),
    channelOptedOut: status === "explicit_opt_out" || channelOptOut === true,
  };
}

export function renewalMessageSuppressionReason(consent: RenewalConsentStatus, phone: string | undefined): string | undefined {
  if (!phone) return "A valid member phone number is not available";
  if (consent === "explicit_opt_out") return "Recipient opted out of renewal messages";
  if (consent !== "explicit_opt_in") return "Explicit consent is required for renewal messages";
  return undefined;
}

export function renewalStopReason(input: {
  membership?: UnknownRecord;
  member?: UnknownRecord;
  today: string;
  hasSuccessor?: boolean;
}): string | undefined {
  const membership = input.membership;
  const member = input.member;
  if (!membership || !member) return "member_or_membership_not_found";
  if (input.hasSuccessor) return "membership_renewed";
  if (membership.cancelledAt || membership.status === "cancelled") return "membership_cancelled";
  if (member.status === "archived" || member.status === "inactive") return "member_not_active";
  if (member.doNotContact === true || member.renewalSuppressed === true) return text(member.renewalSuppressionReason) ?? "member_requested_no_contact";
  const freeze = record(membership.activeFreeze);
  if (freeze.status === "active" && text(freeze.startDate)! <= input.today && input.today <= text(freeze.endDate)!) return "membership_frozen";
  if ((text(membership.startDate) ?? "") > input.today) return "membership_not_started";
  if ((text(membership.endDate) ?? "") < input.today) return "membership_expired";
  if (typeof membership.remainingVisits === "number" && membership.remainingVisits <= 0) return "membership_depleted";
  return undefined;
}

export function isRenewalQuietHours(timezone: string, start: string, end: string, now: Date): boolean {
  const parse = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return (hour || 0) * 60 + (minute || 0);
  };
  const from = parse(start);
  const to = parse(end);
  if (from === to) return false;
  let current = now.getUTCHours() * 60 + now.getUTCMinutes();
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    current = hour * 60 + minute;
  } catch {
    // Keep the UTC fallback for invalid tenant timezone data.
  }
  return from < to ? current >= from && current < to : current >= from || current < to;
}

export function nextRenewalQuietHoursEnd(now: number, timezone: string, start: string, end: string): number {
  for (let minute = 1; minute <= 48 * 60; minute += 1) {
    const candidate = now + minute * 60_000;
    if (!isRenewalQuietHours(timezone, start, end, new Date(candidate))) return candidate;
  }
  return now + 86_400_000;
}
