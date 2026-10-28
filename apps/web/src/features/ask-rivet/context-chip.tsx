"use client";

import {
  ArrowLeftRight,
  CalendarDays,
  FileBarChart,
  FileText,
  Gauge,
  History,
  KanbanSquare,
  ListChecks,
  RefreshCw,
  Tag,
  UserMinus,
  UserRound,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ChatContextItem, ChatSourceKind } from "@/lib/ai/chat/contracts";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

export const CONTEXT_ICONS: Record<ChatSourceKind, LucideIcon> = {
  member: UserRound,
  member_payments: ArrowLeftRight,
  member_timeline: History,
  lead: KanbanSquare,
  member_list: UsersRound,
  lead_list: KanbanSquare,
  today: Gauge,
  renewals: RefreshCw,
  at_risk: UserMinus,
  tasks: ListChecks,
  payments: ArrowLeftRight,
  shifts: Wallet,
  classes: CalendarDays,
  report: FileBarChart,
  plans: Tag,
};

export { FileText };

/** A record or list attached to a message: on the message box it can be removed, in the conversation it is a label. */
export function ContextChip({ item, onRemove, tone = "box", className }: { item: Pick<ChatContextItem, "kind" | "label">; onRemove?: () => void; tone?: "box" | "message"; className?: string }) {
  const { t } = useLocale();
  const Icon = CONTEXT_ICONS[item.kind];
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-sm text-[12px]",
        tone === "box" ? "border border-line bg-paper ps-1.5 text-ink-2" : "px-0 text-ink-3",
        tone === "box" && !onRemove && "pe-1.5",
        className,
      )}
      data-testid="ask-context-chip"
      data-kind={item.kind}
    >
      <Icon className="size-3 shrink-0 text-ink-3" aria-hidden />
      <bdi className="truncate">{item.label}</bdi>
      {onRemove ? (
        <button type="button" onClick={onRemove} className="ms-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.composer.remove", { label: item.label })}>
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
