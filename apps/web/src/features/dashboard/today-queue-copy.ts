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
  clock?: (value: string) => string;
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

export function todayItemDetail(options: TodayItemCopyOptions, item: TodayQueueItem): string {
  const { t, locale, isolate, clock } = options;
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

  if (item.kind === "cash_variance" && item.id.startsWith("variance:")) {
    const closedBy = /^Shift closed by (.+)$/.exec(detail);
    if (closedBy) return t("deskCompletion.dashboard.queue.cashVarianceClosedBy", { actor: isolate(closedBy[1]!) });
  }

  if (item.kind === "branch_checklist" && item.id.startsWith("checklist-due:")) {
    const progress = /^(.+) · (\d+)\/(\d+) done · due ((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(detail);
    if (progress) {
      return t("deskCompletion.dashboard.queue.checklistProgress", {
        branch: isolate(progress[1]!),
        done: isolate(progress[2]!),
        total: isolate(progress[3]!),
        time: isolate(clock?.(progress[4]!) ?? progress[4]!),
      });
    }
  }

  if (item.kind === "facility_task" && item.id.startsWith("facility:")) {
    const task = /^(.+) · (open|in progress|blocked)$/.exec(detail);
    if (task) {
      const statusKey: Record<string, TKey> = {
        open: "deskCompletion.dashboard.queue.statusOpen",
        "in progress": "deskCompletion.dashboard.queue.statusInProgress",
        blocked: "deskCompletion.dashboard.queue.statusBlocked",
      };
      return t("deskCompletion.dashboard.queue.facilityStatus", {
        zone: isolate(task[1]!),
        status: t(statusKey[task[2]!]!),
      });
    }
  }

  if (item.kind === "equipment_issue" && item.id.startsWith("equipment:")) {
    const equipment = detail.split(" · ");
    const statusKeys: Record<string, TKey> = {
      open: "deskCompletion.dashboard.queue.issueOpen",
      "in progress": "deskCompletion.dashboard.queue.issueInProgress",
    };
    const safetyKeys: Record<string, TKey> = {
      unknown: "deskCompletion.dashboard.queue.safetyUnknown",
      "safe to operate": "deskCompletion.dashboard.queue.safetySafe",
      "out of service": "deskCompletion.dashboard.queue.safetyOutOfService",
    };
    const safety = equipment[2] ? /^safety: (unknown|safe to operate|out of service)$/.exec(equipment[2]) : null;
    const statusKey = statusKeys[equipment[1] ?? ""];
    const safetyKey = safety ? safetyKeys[safety[1]!] : undefined;
    if (equipment.length === 3 && statusKey && safetyKey) {
      return t("deskCompletion.dashboard.queue.equipmentIssue", {
        asset: isolate(equipment[0]!),
        status: t(statusKey),
        safety: t(safetyKey),
      });
    }
  }
  return detail;
}
