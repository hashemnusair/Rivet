import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  CreditCard,
  FileText,
  LogIn,
  MessageSquare,
  PhoneCall,
  PlusCircle,
  RotateCcw,
  ArrowRightLeft,
  Snowflake,
  Sun,
  UserCheck,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { TimelineEvent, TimelineEventType } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { receiptHref } from "@/lib/utils/receipt-links";
import { DateTimeText, RelativeText } from "./data-display";

const EVENT_ICON: Record<TimelineEventType, { icon: LucideIcon; tone: string }> = {
  member_created: { icon: PlusCircle, tone: "text-ink-2" },
  note: { icon: FileText, tone: "text-ink-2" },
  call_attempt: { icon: PhoneCall, tone: "text-ink-2" },
  message: { icon: MessageSquare, tone: "text-ink-2" },
  task_created: { icon: CalendarClock, tone: "text-warning-deep" },
  task_completed: { icon: CheckCircle2, tone: "text-success-deep" },
  offer_sent: { icon: FileText, tone: "text-warning-deep" },
  membership_sold: { icon: CreditCard, tone: "text-success-deep" },
  membership_renewed: { icon: RotateCcw, tone: "text-success-deep" },
  membership_frozen: { icon: Snowflake, tone: "text-ink-2" },
  membership_unfrozen: { icon: Sun, tone: "text-ink-2" },
  membership_extended: { icon: CalendarClock, tone: "text-ink-2" },
  membership_cancelled: { icon: CircleDot, tone: "text-danger" },
  membership_transferred: { icon: ArrowRightLeft, tone: "text-ink-2" },
  payment_collected: { icon: Banknote, tone: "text-success-deep" },
  payment_refunded: { icon: Banknote, tone: "text-danger" },
  payment_voided: { icon: Banknote, tone: "text-danger" },
  check_in: { icon: LogIn, tone: "text-ink-2" },
  trial_confirmed: { icon: CalendarClock, tone: "text-success-deep" },
  trial_completed: { icon: CheckCircle2, tone: "text-success-deep" },
  trial_no_show: { icon: CircleDot, tone: "text-warning-deep" },
  trial_cancelled: { icon: CircleDot, tone: "text-danger" },
  lead_converted: { icon: UserCheck, tone: "text-success-deep" },
  automation: { icon: Zap, tone: "text-ink-3" },
};

/**
 * The single chronological record. One visual language everywhere:
 * hairline spine, small square markers, actor + timestamp on the meta row.
 */
export function TimelineFeed({
  events,
  dense,
  showActor = true,
  empty = "Nothing recorded yet.",
}: {
  events: TimelineEvent[];
  dense?: boolean;
  showActor?: boolean;
  empty?: string;
}) {
  if (events.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-3">{empty}</p>;
  }
  return (
    <ol className="relative">
      {events.map((event, i) => {
        const { icon: Icon, tone } = EVENT_ICON[event.type] ?? { icon: CircleDot, tone: "text-ink-2" };
        const receiptId = event.meta?.receiptId ? String(event.meta.receiptId) : undefined;
        return (
          <li key={event.id} className={cn("relative flex gap-3", i < events.length - 1 && "pb-4")}>
            {i < events.length - 1 ? (
              <span aria-hidden className="absolute start-[7px] top-5 bottom-0 w-px bg-line" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-1 flex size-[15px] shrink-0 items-center justify-center rounded-[3px] border border-line-2 bg-surface",
                tone,
              )}
            >
              <Icon className="size-[9px]" strokeWidth={2.4} />
            </span>
            <div className={cn("min-w-0 flex-1", dense && "text-[12.5px]")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-[13px] font-medium leading-snug text-ink">
                  {event.title}
                  {receiptId ? (
                    <Link href={receiptHref(receiptId)} className="ms-1.5 font-mono text-[11px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">
                      receipt
                    </Link>
                  ) : null}
                </p>
                <span className="shrink-0 text-[11.5px] text-ink-3">
                  <RelativeText iso={event.occurredAt} />
                </span>
              </div>
              {event.body ? <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{event.body}</p> : null}
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                {showActor && event.actorName ? <span>{event.actorName} · </span> : null}
                <DateTimeText iso={event.occurredAt} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
