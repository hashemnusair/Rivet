import type { CustomerMembership } from "./experience-data";
import { daysFromToday, formatDate } from "@/lib/utils/dates";

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
): MembershipDisplayStatus {
  const days = daysFromToday(membership.endDate, undefined, now);
  const end = formatDate(membership.endDate);
  if (membership.status === "frozen") {
    return { key: "frozen", label: "Frozen", tone: "neutral", summary: `Frozen · valid until ${end}`, daysLeft: Math.max(days, 0), ended: false };
  }
  if (days < 0) {
    return { key: "ended", label: "Ended", tone: "red", summary: `Ended ${end}`, daysLeft: 0, ended: true };
  }
  if (days === 0) {
    return { key: "ending", label: "Ends today", tone: "amber", summary: `Ends today, ${end}`, daysLeft: 0, ended: false };
  }
  if (days <= 14 || membership.status === "expiring") {
    return { key: "ending", label: "Ends soon", tone: "amber", summary: `Ends in ${days} day${days === 1 ? "" : "s"} · ${end}`, daysLeft: days, ended: false };
  }
  return { key: "active", label: "Active", tone: "green", summary: `Valid until ${end} · ${days} days left`, daysLeft: days, ended: false };
}
