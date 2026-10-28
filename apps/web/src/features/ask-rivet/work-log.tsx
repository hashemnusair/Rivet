"use client";

import { useId, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  FileBarChart,
  Gauge,
  KanbanSquare,
  ListChecks,
  RefreshCw,
  Search,
  Snowflake,
  Sun,
  Tag,
  UserMinus,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ChatPart, ChatToolKey } from "@/lib/ai/chat/contracts";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { RivetGlyph } from "./rivet-glyph";
import { useSmoothText } from "./use-smooth-text";

type ToolPart = Extract<ChatPart, { type: "tool" }>;
type ThinkingPart = Extract<ChatPart, { type: "thinking" }>;

const ICONS: Record<ChatToolKey, LucideIcon> = {
  search_members: Search,
  get_member: UserRound,
  search_leads: KanbanSquare,
  get_lead: KanbanSquare,
  list_tasks: ListChecks,
  renewals_due: RefreshCw,
  at_risk_members: UserMinus,
  today_overview: Gauge,
  list_payments: ArrowLeftRight,
  cash_shifts: Wallet,
  class_schedule: CalendarDays,
  gym_report: FileBarChart,
  list_plans: Tag,
  open_screen: ArrowUpRight,
  propose_renewal: RefreshCw,
  propose_freeze: Snowflake,
  propose_unfreeze: Sun,
};

const MEMBERSHIP_FILTERS = new Set(["outstanding", "expiring", "expired", "frozen", "active", "scheduled", "cancelled"]);
const REPORTS = new Set(["peak_hours", "class_utilization", "retention", "renewal_forecast", "collections", "crm_funnel"]);

/** A step's label in the reader's language: what it is doing, or what it found. */
export function useToolLabel(): (part: ToolPart) => string {
  const { t, isolate } = useLocale();
  return (part) => {
    const base = `askRivet.tool.${part.tool}`;
    if (part.status === "error") return t(`askRivet.failure.${part.outcome?.failure ?? "unavailable"}` as TKey);
    if (part.status === "done") {
      if (part.tool === "get_member" || part.tool === "get_lead") return part.outcome?.subject ? t(`${base}.done` as TKey, { subject: isolate(part.outcome.subject) }) : t(`${base}.running` as TKey);
      if (part.tool === "gym_report") return t(`${base}.done` as TKey, { report: REPORTS.has(String(part.input.report)) ? t(`askRivet.report.${part.input.report}` as TKey) : "" });
      if (part.tool === "today_overview" || part.tool === "open_screen" || part.tool.startsWith("propose_")) return t(`${base}.done` as TKey);
      return t(`${base}.done` as TKey, { count: part.outcome?.total ?? part.outcome?.count ?? 0 });
    }
    if (part.tool === "search_members") {
      if (typeof part.input.query === "string" && part.input.query) return t("askRivet.tool.search_members.query", { query: isolate(part.input.query) });
      if (MEMBERSHIP_FILTERS.has(String(part.input.membership))) return t("askRivet.tool.search_members.filter", { filter: t(`askRivet.filter.${part.input.membership}` as TKey) });
    }
    if (part.tool === "renewals_due" && part.input.bucket === "expired") return t("askRivet.tool.renewals_due.expired");
    if (part.tool === "gym_report") return t("askRivet.tool.gym_report.running", { report: REPORTS.has(String(part.input.report)) ? t(`askRivet.report.${part.input.report}` as TKey) : "" });
    return t(`${base}.running` as TKey);
  };
}

function seconds(start: number, end: number | undefined): number {
  return Math.max(1, Math.round(((end ?? Date.now()) - start) / 1000));
}

function ThinkingText({ part, live }: { part: ThinkingPart; live: boolean }) {
  const text = useSmoothText(part.text, live && part.endedAt === undefined);
  if (!text) return null;
  const paragraph = <p className="text-[12.5px] leading-[1.55] text-ink-3" dir="auto">{text}</p>;
  return live && part.endedAt === undefined ? <div className="ask-thinking-window">{paragraph}</div> : paragraph;
}

function Step({ part, live }: { part: ChatPart; live: boolean }) {
  const { t } = useLocale();
  const label = useToolLabel();
  if (part.type === "thinking") {
    const active = live && part.endedAt === undefined;
    return (
      <li className="ask-step animate-fade-in" data-testid="ask-step" data-kind="thinking" data-status={active ? "running" : "done"}>
        <div className="flex min-h-6 items-center gap-2">
          <span className="flex size-4 items-center justify-center">{active ? <RivetGlyph working className="h-3.5 text-ink-2" /> : <span className="size-1 rounded-full bg-ink-4" />}</span>
          <span className={cn("text-[12.5px]", active ? "text-ink-2" : "text-ink-3")}>{active ? t("askRivet.work.thinking") : t("askRivet.work.thoughtFor", { seconds: seconds(part.startedAt, part.endedAt) })}</span>
        </div>
        <div className="ps-6"><ThinkingText part={part} live={live} /></div>
      </li>
    );
  }
  if (part.type !== "tool") return null;
  const Icon = ICONS[part.tool] ?? Search;
  const running = part.status === "running" && live;
  return (
    <li className="ask-step flex min-h-6 animate-fade-in items-center gap-2" data-testid="ask-step" data-kind="tool" data-tool={part.tool} data-status={part.status}>
      <span className="flex size-4 items-center justify-center">
        {running ? <RivetGlyph working className="h-3.5 text-ink-2" /> : part.status === "error" ? <CircleAlert className="size-3.5 text-warning" aria-hidden /> : <Check className="size-3.5 text-success" aria-hidden />}
      </span>
      <Icon className="size-3.5 shrink-0 text-ink-3 rtl:[&.lucide-arrow-up-right]:-scale-x-100" aria-hidden />
      <span className={cn("min-w-0 truncate text-[12.5px]", running ? "text-ink-2" : "text-ink-3")} dir="auto">{label(part)}</span>
      {!running && part.endedAt ? <span className="ms-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-4" dir="ltr">{seconds(part.startedAt, part.endedAt)}s</span> : null}
    </li>
  );
}

/**
 * What RIVET did before answering. While it works, every step is visible and
 * the current one carries the lifting mark; once the answer is written the
 * log folds into one line that can be opened again.
 */
export function WorkLog({ parts, live }: { parts: ChatPart[]; live: boolean }) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const steps = parts.filter((part): part is ToolPart | ThinkingPart => part.type === "thinking" || part.type === "tool");
  if (!steps.length) return null;
  const tools = steps.filter((part): part is ToolPart => part.type === "tool");
  const lookups = tools.filter((part) => part.tool !== "open_screen").length;
  const start = Math.min(...steps.map((part) => part.startedAt));
  const end = Math.max(...steps.map((part) => part.endedAt ?? part.startedAt));
  const summary = lookups ? `${t("askRivet.work.workedFor", { seconds: seconds(start, end) })} · ${t("askRivet.work.lookups", { count: lookups })}` : t("askRivet.work.thoughtFor", { seconds: seconds(start, end) });
  // One structure in both states, so finishing folds the steps smoothly instead of swapping content.
  return (
    <div className="ask-worklog" data-testid="ask-worklog" data-state={live ? "live" : "done"}>
      <div className="ask-collapse" data-open={!live || undefined}>
        <div className="overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={listId}
            tabIndex={live ? -1 : 0}
            className="-ms-1 inline-flex min-h-7 items-center gap-1.5 rounded-sm px-1 text-[12.5px] text-ink-3 transition-colors hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-ink"
          >
            <span dir="auto">{summary}</span>
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", expanded && "rotate-180")} aria-hidden />
          </button>
        </div>
      </div>
      <div id={listId} className="ask-collapse" data-open={live || expanded || undefined}>
        <div className="overflow-hidden">
          <ol className={cn("space-y-1", !live && "pb-1 pt-1")} aria-live={live ? "polite" : undefined}>{steps.map((part) => <Step key={part.id} part={part} live={live} />)}</ol>
        </div>
      </div>
    </div>
  );
}
