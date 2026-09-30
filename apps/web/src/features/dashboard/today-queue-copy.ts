import type { TodayQueueItem } from "@/lib/domain/types";
import type { TFunction, TKey } from "@/lib/i18n/provider";

/**
 * Today items arrive with English titles, details and button words written by
 * the server. Where that text follows a known pattern around a name, a plan or a
 * count, it is rebuilt here from the pattern's parts so it can be shown in the
 * reader's language. Anything that does not match exactly (a task someone typed,
 * a support subject, a detail with free text) is returned as the server wrote it.
 *
 * English is always returned untouched: the server's text is the source of truth
 * there, and the two mock and Convex builders differ in a few words.
 */
export interface TodayItemCopyOptions {
  t: TFunction;
  locale: string;
  isolate: (value: string | number) => string;
}

const ACTION_KEYS: Record<string, TKey> = {
  Done: "dashboard.today.action.done",
  Open: "dashboard.today.action.open",
  "Log contact": "dashboard.today.action.logContact",
  Renew: "dashboard.today.action.renew",
  Collect: "dashboard.today.action.collect",
  Review: "dashboard.today.action.review",
  "Follow up": "dashboard.today.action.followUp",
  "Open case": "dashboard.today.action.openCase",
};

export function todayActionLabel({ t, locale }: TodayItemCopyOptions, label: string): string {
  if (locale === "en") return label;
  const key = ACTION_KEYS[label];
  return key ? t(key) : label;
}

export function todayItemTitle({ t, locale, isolate }: TodayItemCopyOptions, item: TodayQueueItem): string {
  const { title, subjectName, branchName, id } = item;
  if (locale === "en") return title;

  if (subjectName) {
    const name = isolate(subjectName);
    if (item.kind === "outstanding_balance" && title === `Collect from ${subjectName}`) return t("dashboard.today.item.collectFrom", { name });
    if (item.kind === "renewal" && id.startsWith("renewal:") && title === `Renew ${subjectName}`) return t("dashboard.today.item.renew", { name });
    if (item.kind === "renewal" && id.startsWith("expired:") && title === `Win back ${subjectName}`) return t("dashboard.today.item.winBack", { name });
    if (item.kind === "at_risk" && title === `Contact ${subjectName}`) return t("dashboard.today.item.contact", { name });
    if (item.kind === "access_denial" && title === `${subjectName} was refused entry`) return t("dashboard.today.item.refusedEntry", { name });
    if (item.kind === "follow_up" && id.startsWith("lead-follow-up:") && title === `Follow up — ${subjectName}`) return t("dashboard.today.item.followUpLead", { name });
  }

  if (item.kind === "cash_variance") {
    if (branchName && title === `Check the cash difference at ${branchName}`) return t("dashboard.today.item.cashDifferenceAt", { branch: isolate(branchName) });
    if (title === "Check the cash difference at the branch") return t("dashboard.today.item.cashDifferenceAtBranch");
  }

  if (item.kind === "branch_checklist") {
    if (id.startsWith("checklist-due:")) {
      if (title.startsWith("Late: ")) return t("dashboard.today.item.checklistLate", { name: isolate(title.slice("Late: ".length)) });
      if (title.startsWith("Due: ")) return t("dashboard.today.item.checklistDue", { name: isolate(title.slice("Due: ".length)) });
    }
    const failed = /^Fix (\d+) failed (.+) items?$/.exec(title);
    if (id.startsWith("checklist-failed:") && failed) {
      const count = Number(failed[1]);
      if (title.endsWith(count === 1 ? " item" : " items")) return t("dashboard.today.item.checklistFailed", { count, name: isolate(failed[2]!) });
    }
  }

  if (item.kind === "low_stock" && id.startsWith("stock:") && title.startsWith("Reorder ")) {
    return t("dashboard.today.item.reorder", { name: isolate(title.slice("Reorder ".length)) });
  }
  return title;
}

export function todayItemDetail({ t, locale, isolate }: TodayItemCopyOptions, item: TodayQueueItem): string {
  const { detail } = item;
  if (locale === "en") return detail;

  if (item.kind === "outstanding_balance" && detail === "Owes money") return t("dashboard.today.item.owesMoney");
  if (item.kind === "follow_up" && detail === "Lead · not contacted yet") return t("dashboard.today.item.leadNotContacted");

  if (item.kind === "renewal") {
    const left = /^(.+) · (?:ends today|(\d+) days? left)$/.exec(detail);
    if (left && item.id.startsWith("renewal:")) {
      const plan = isolate(left[1]!);
      return left[2] === undefined ? t("dashboard.today.item.planEndsToday", { plan }) : t("dashboard.today.item.planDaysLeft", { plan, count: Number(left[2]) });
    }
    const ended = /^(.+) · (?:ended|expired) (?:today|(\d+) days? ago), not renewed$/.exec(detail);
    if (ended && item.id.startsWith("expired:")) {
      const plan = isolate(ended[1]!);
      return ended[2] === undefined ? t("dashboard.today.item.planEndedToday", { plan }) : t("dashboard.today.item.planEndedDaysAgo", { plan, count: Number(ended[2]) });
    }
  }

  if (item.kind === "low_stock") {
    const stock = /^(\d+) available · reorder at (\d+)$/.exec(detail);
    if (stock) return t("dashboard.today.item.stockAvailable", { available: stock[1]!, reorderAt: stock[2]! });
  }
  return detail;
}
