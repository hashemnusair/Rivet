import { createTranslator } from "../i18n/core";
import { makeFormatters } from "../i18n/formatters";
import type { Locale } from "../i18n/locale";
import type { CustomerMembership } from "./experience-data";
import { daysFromToday } from "@/lib/utils/dates";

export type MembershipDisplayTone = "green" | "amber" | "red" | "neutral";

export interface MembershipDisplayStatus {
  key: "active" | "ending" | "ended" | "frozen";
  /** Short chip text. */
  label: string;
  tone: MembershipDisplayTone;
  /** One line a member would say aloud, anchored to the tenant-local date. */
  summary: string;
  daysLeft: number;
  ended: boolean;
}

/**
 * The member projection carries the gym's recorded status, but a status alone
 * cannot tell a member whether their card still opens the door today. Derive
 * the spoken state from the tenant-local date so an end date in the past never
 * reads as "subscribed until".
 */
export function membershipDisplayStatus(
  membership: Pick<CustomerMembership, "status" | "endDate">,
  now: Date = new Date(),
  context: { locale?: Locale; timeZone?: string } = {},
): MembershipDisplayStatus {
  const t = createTranslator(context.locale ?? "en");
  const days = daysFromToday(membership.endDate, context.timeZone, now);
  const end = makeFormatters(context.locale ?? "en", "", context.timeZone).date(membership.endDate);
  if (membership.status === "frozen") {
    return { key: "frozen", label: t("memberExperience.frozen"), tone: "neutral", summary: t("memberExperience.frozenUntil", { date: end }), daysLeft: Math.max(days, 0), ended: false };
  }
  if (days < 0) {
    return { key: "ended", label: t("memberExperience.ended"), tone: "red", summary: t("memberExperience.endedOn", { date: end }), daysLeft: 0, ended: true };
  }
  if (days === 0) {
    return { key: "ending", label: t("memberExperience.endsToday"), tone: "amber", summary: t("memberExperience.endsTodayDate", { date: end }), daysLeft: 0, ended: false };
  }
  if (days <= 14 || membership.status === "expiring") {
    return { key: "ending", label: t("memberExperience.endsSoon"), tone: "amber", summary: t("memberExperience.endsInDays", { days: t("memberExperience.dayCount", { count: days }), date: end }), daysLeft: days, ended: false };
  }
  return { key: "active", label: t("memberExperience.active"), tone: "green", summary: t("memberExperience.validUntil", { count: days, date: end }), daysLeft: days, ended: false };
}
