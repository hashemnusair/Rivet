import type { MemberFollowUpContext } from "../../../convex/followupAssist";
import { addDays, diffDays } from "../utils/dates";
import type { AiBriefLine, AiErrorCategory, AiMemberBrief, AiMemoryView, AiMessage, AiRunStatus, AiSourceKind, AiSourceRef } from "./contracts";
import { normalizeNoteText, timeOfDayIn } from "./relative-dates";

/**
 * The member context shown beside a contact action. Every line is computed
 * from records RIVET already holds and links to them; staff statements are
 * labelled as statements ("travelling, according to the last call"), never as
 * verified facts; a missing source becomes a visible gap instead of silence.
 * No model is involved, so this works when assistance is off or a provider
 * is unavailable.
 */

export const MEMBER_BRIEF_VERSION = "member-brief.v1";

export interface MemberAttendance {
  /** False when the gym records no check-ins at all for this member's branch: absence is unknown, not zero. */
  captured: boolean;
  lastVisitAt?: string;
  lastVisitId?: string;
  visitsLast28Days: number;
  visitsPrior56Days: number;
}

export interface MemberClassOptions {
  branchName?: string;
  eveningNext7Days: number;
  morningNext7Days: number;
}

export interface MemberBriefInput {
  context: MemberFollowUpContext;
  attendance: MemberAttendance;
  memories: readonly AiMemoryView[];
  activeFreeze?: { startDate: string; endDate?: string; sourceId?: string };
  classOptions?: MemberClassOptions;
  today: string;
  now: string;
  extraction: { available: boolean; reason?: AiErrorCategory };
  openRun?: { id: string; status: AiRunStatus };
  source?: AiSourceKind;
}

function memberHref(memberId: string, tab?: string, anchor?: string): string {
  return `/members/${memberId}${tab ? `?tab=${tab}` : ""}${anchor ? `#${anchor}` : ""}`;
}

function timelineRef(memberId: string, id: string, occurredAt?: string): AiSourceRef {
  return { kind: "timeline", id, href: memberHref(memberId, "timeline", `timeline-event-${id}`), ...(occurredAt ? { occurredAt } : {}) };
}

/** Whether an active travel statement covers a date (inclusive of its last day). */
export function travelCovers(memories: readonly AiMemoryView[], date: string): AiMemoryView | undefined {
  return memories.find((memory) => memory.status === "active" && memory.topic === "travel" && memory.effectiveFrom.slice(0, 10) <= date && (!memory.effectiveUntil || memory.effectiveUntil >= date));
}

export function mentionsEveningClasses(text: string): boolean {
  const normalized = normalizeNoteText(text).toLowerCase();
  const classWords = /\b(class(es)?|session|spin|yoga|zumba|crossfit|pilates)\b/.test(normalized) || /(حصة|حصص|كلاس|كلاسات)/u.test(normalized);
  return classWords && timeOfDayIn(normalized)?.value === "evening";
}

function mentionsSchedule(text: string): boolean {
  const normalized = normalizeNoteText(text).toLowerCase();
  return /\b(schedule|timing|class times?|no time|busy|work hours|shift)\b/.test(normalized) || /(الوقت|المواعيد|ما عنده وقت|مشغول|الدوام)/u.test(normalized);
}

function line(key: string, basis: AiBriefLine["basis"], message: AiMessage, sources: AiSourceRef[], tone: AiBriefLine["tone"] = "neutral"): AiBriefLine {
  return { key, basis, message, sources, tone };
}

export function buildMemberBrief(input: MemberBriefInput): AiMemberBrief {
  const { context, attendance, today } = input;
  const memberId = context.memberId;
  const name = context.memberName.trim().split(/\s+/)[0] || context.memberName;
  const lines: AiBriefLine[] = [];
  const gaps: AiMessage[] = [];
  const renewal = context.renewal;
  const membershipRef: AiSourceRef | undefined = renewal.membershipId ? { kind: "membership", id: renewal.membershipId, href: memberHref(memberId, "membership"), label: renewal.planName } : undefined;

  // Membership timing.
  if (!renewal.membershipId || renewal.endDate === undefined) {
    gaps.push({ key: "aiWork.brief.gapNoMembership" });
  } else if (renewal.hasSuccessor) {
    lines.push(line("renewal", "observed", { key: "aiWork.brief.renewed", params: { plan: renewal.planName ?? "" } }, membershipRef ? [membershipRef] : [], "positive"));
  } else if ((renewal.daysUntilExpiry ?? 0) >= 0) {
    lines.push(line("renewal", "observed", { key: "aiWork.brief.endsIn", params: { count: renewal.daysUntilExpiry ?? 0, date: { date: renewal.endDate } } }, membershipRef ? [membershipRef] : [], (renewal.daysUntilExpiry ?? 0) <= 14 ? "attention" : "neutral"));
  } else {
    lines.push(line("renewal", "observed", { key: "aiWork.brief.endedAgo", params: { count: Math.abs(renewal.daysUntilExpiry ?? 0), date: { date: renewal.endDate } } }, membershipRef ? [membershipRef] : [], "attention"));
  }

  // Staff statements first, so attendance can be read in their light.
  const statements = input.memories.filter((memory) => memory.status === "active" && (!memory.effectiveUntil || memory.effectiveUntil >= today));
  const travelling = travelCovers(statements, today);
  for (const memory of statements) {
    const sources: AiSourceRef[] = [{ kind: "memory", id: memory.id }];
    if (memory.provenance.sourceId) sources.push(timelineRef(memberId, memory.provenance.sourceId, memory.provenance.recordedAt));
    if (memory.topic === "travel") {
      lines.push(line(`statement-${memory.id}`, "staff_statement", memory.effectiveUntil
        ? { key: "aiWork.brief.travelStatement", params: { date: { date: memory.effectiveUntil }, name: memory.provenance.recordedByName } }
        : { key: "aiWork.brief.travelStatementNoDate", params: { name: memory.provenance.recordedByName } }, sources));
    } else if (memory.topic === "contact_time") {
      lines.push(line(`statement-${memory.id}`, "staff_statement", { key: "aiWork.brief.contactTimeStatement", params: { time: { enum: "timeOfDay", value: memory.text }, name: memory.provenance.recordedByName } }, sources));
    } else if (memory.topic === "no_contact") {
      lines.push(line(`statement-${memory.id}`, "staff_statement", { key: "aiWork.brief.noContactStatement", params: { name: memory.provenance.recordedByName } }, sources, "attention"));
    }
  }

  if (input.activeFreeze) {
    lines.push(line("freeze", "observed", input.activeFreeze.endDate ? { key: "aiWork.brief.frozenUntil", params: { date: { date: input.activeFreeze.endDate } } } : { key: "aiWork.brief.frozen" }, membershipRef ? [membershipRef] : []));
  }

  // Attendance against the member's own baseline. Unknown is shown as unknown.
  if (!attendance.captured) {
    gaps.push({ key: "aiWork.brief.gapNoAttendance" });
  } else if (!attendance.lastVisitAt) {
    lines.push(line("attendance", "observed", { key: "aiWork.brief.noVisitsYet" }, [{ kind: "member", id: memberId, href: memberHref(memberId, "visits") }]));
  } else {
    const lastVisitDate = attendance.lastVisitAt.slice(0, 10);
    const absentDays = Math.max(0, diffDays(lastVisitDate, today));
    const visitRef: AiSourceRef = attendance.lastVisitId ? { kind: "check_in", id: attendance.lastVisitId, href: memberHref(memberId, "visits"), occurredAt: attendance.lastVisitAt } : { kind: "member", id: memberId, href: memberHref(memberId, "visits") };
    const baselinePerWeek = attendance.visitsPrior56Days / 8;
    const recentPerWeek = attendance.visitsLast28Days / 4;
    if (absentDays >= 7) {
      const explained = travelling && travelling.effectiveFrom.slice(0, 10) <= addDays(lastVisitDate, 1);
      lines.push(line("attendance", "observed", explained
        ? { key: "aiWork.brief.absentWhileTravelling", params: { count: absentDays, date: { date: lastVisitDate } } }
        : baselinePerWeek >= 1
          ? { key: "aiWork.brief.absentAgainstBaseline", params: { count: absentDays, perWeek: Math.round(baselinePerWeek * 10) / 10, date: { date: lastVisitDate } } }
          : { key: "aiWork.brief.absentFor", params: { count: absentDays, date: { date: lastVisitDate } } }, [visitRef], explained ? "neutral" : "attention"));
    } else if (baselinePerWeek >= 1 && recentPerWeek < baselinePerWeek * 0.5) {
      lines.push(line("attendance", "observed", { key: "aiWork.brief.visitsDropped", params: { before: Math.round(baselinePerWeek * 10) / 10, now: Math.round(recentPerWeek * 10) / 10 } }, [visitRef], "attention"));
    } else {
      lines.push(line("attendance", "observed", { key: "aiWork.brief.visitedRecently", params: { count: absentDays, perWeek: Math.round(recentPerWeek * 10) / 10 } }, [visitRef], "positive"));
    }
  }

  // What recorded conversations mention: staff statements with their source.
  const eveningMention = context.evidence.find((item) => mentionsEveningClasses(`${item.title} ${item.excerpt ?? ""}`));
  const scheduleMention = eveningMention ?? context.evidence.find((item) => mentionsSchedule(`${item.title} ${item.excerpt ?? ""}`));
  if (eveningMention) {
    lines.push(line("topic-evening", "staff_statement", { key: "aiWork.brief.mentionedEveningClasses", params: { at: { at: eveningMention.occurredAt } } }, [timelineRef(memberId, eveningMention.id, eveningMention.occurredAt)]));
    if (input.classOptions && input.classOptions.eveningNext7Days > 0) {
      lines.push(line("classes-evening", "observed", { key: "aiWork.brief.eveningClassesAvailable", params: { count: input.classOptions.eveningNext7Days, branch: input.classOptions.branchName ?? "" } }, [{ kind: "class", id: "evening-next-7", href: "/classes" }], "positive"));
    }
  } else if (scheduleMention) {
    lines.push(line("topic-schedule", "staff_statement", { key: "aiWork.brief.mentionedSchedule", params: { at: { at: scheduleMention.occurredAt } } }, [timelineRef(memberId, scheduleMention.id, scheduleMention.occurredAt)]));
  }
  const complaint = context.evidence.find((item) => item.topics.includes("complaint"));
  if (complaint) lines.push(line("topic-complaint", "staff_statement", { key: "aiWork.brief.mentionedComplaint", params: { at: { at: complaint.occurredAt } } }, [timelineRef(memberId, complaint.id, complaint.occurredAt)], "attention"));

  if (context.lastContact) {
    lines.push(line("last-contact", "observed", { key: "aiWork.brief.lastContact", params: { outcome: { enum: "contactOutcome", value: context.lastContact.outcome }, at: { at: context.lastContact.at } } }, [timelineRef(memberId, context.lastContact.evidenceId, context.lastContact.at)]));
  } else {
    gaps.push({ key: "aiWork.brief.gapNoContact" });
  }
  if (context.callback?.dueAt && context.callback.future) {
    lines.push(line("callback", "staff_statement", { key: "aiWork.brief.callbackDue", params: { at: { at: context.callback.dueAt } } }, [timelineRef(memberId, context.callback.evidenceId, context.callback.requestedAt)], "attention"));
  }

  const optedOut = context.messaging.consent === "explicit_opt_out" || context.messaging.channelOptedOut;
  if (optedOut) lines.push(line("messages", "observed", { key: "aiWork.brief.optedOut" }, [{ kind: "member", id: memberId, href: memberHref(memberId) }], "attention"));
  if (renewal.outstanding.amount > 0) {
    lines.push(line("owes", "observed", { key: "aiWork.brief.owes", params: { amount: { amountMinor: renewal.outstanding.amount, currency: renewal.outstanding.currency } } }, [{ kind: "member", id: memberId, href: memberHref(memberId, "payments") }], "attention"));
  }
  const openWork = context.relatedWork.filter((task) => task.status === "open");
  if (openWork.length) {
    lines.push(line("open-work", "observed", { key: "aiWork.brief.openTasks", params: { count: openWork.length } }, openWork.slice(0, 3).map((task) => ({ kind: "task" as const, id: task.id, href: memberHref(memberId, "tasks"), label: task.title }))));
  }

  const endsSoon = !renewal.hasSuccessor && renewal.daysUntilExpiry !== undefined && renewal.daysUntilExpiry >= 0 && renewal.daysUntilExpiry <= 14;
  const ended = !renewal.hasSuccessor && renewal.daysUntilExpiry !== undefined && renewal.daysUntilExpiry < 0;
  const absentLine = lines.find((item) => item.key === "attendance" && item.tone === "attention");
  const headline: AiMessage = renewal.hasSuccessor
    ? { key: "aiWork.brief.headline.renewed", params: { name } }
    : travelling && (endsSoon || ended)
      ? { key: "aiWork.brief.headline.travellingRenewal", params: { name, date: { date: travelling.effectiveUntil ?? today } } }
      : endsSoon && eveningMention
        ? { key: "aiWork.brief.headline.eveningClasses", params: { name, count: renewal.daysUntilExpiry ?? 0 } }
        : endsSoon && absentLine
          ? { key: "aiWork.brief.headline.endingAbsent", params: { name, count: renewal.daysUntilExpiry ?? 0 } }
          : endsSoon
            ? { key: "aiWork.brief.headline.ending", params: { name, count: renewal.daysUntilExpiry ?? 0 } }
            : ended
              ? { key: "aiWork.brief.headline.ended", params: { name, count: Math.abs(renewal.daysUntilExpiry ?? 0) } }
              : absentLine
                ? { key: "aiWork.brief.headline.absent", params: { name } }
                : gaps.length
                  ? { key: "aiWork.brief.headline.incomplete", params: { name } }
                  : { key: "aiWork.brief.headline.noUrgent", params: { name } };

  const dates = [
    ...context.evidence.map((item) => item.occurredAt),
    ...(attendance.lastVisitAt ? [attendance.lastVisitAt] : []),
  ].sort();
  return {
    memberId,
    generatedAt: input.now,
    headline,
    lines,
    gaps,
    freshness: { oldestSourceAt: dates[0], newestSourceAt: dates.at(-1), stale: false },
    activeStatements: statements,
    ...(input.openRun ? { openRun: input.openRun } : {}),
    extraction: input.extraction,
    source: input.source ?? "rules",
  };
}
