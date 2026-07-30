import type {
  CheckInDecision,
  LeadStage,
  MembershipEffectiveStatus,
  PaymentStatus,
  TransactionStatus,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";

/**
 * Status language for the whole product. One shape, few colors, meaning first:
 * ink = neutral/active, green = healthy, amber = needs attention, red = blocked/risk.
 */
const toneStyles = {
  ink: "bg-ink text-paper",
  green: "bg-success-bg text-success-deep",
  amber: "bg-warning-bg text-warning-deep",
  red: "bg-signal-bg text-signal-deep",
  neutral: "bg-sunken text-ink-2",
  outline: "border border-line-2 text-ink-2",
} as const;

type Tone = keyof typeof toneStyles;

export function StatusChip({ tone, children, className, dot }: { tone: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

const MEMBERSHIP_CHIP: Record<MembershipEffectiveStatus, { tone: Tone; label: string }> = {
  active: { tone: "green", label: "Active" },
  expiring: { tone: "amber", label: "Expiring" },
  frozen: { tone: "neutral", label: "Frozen" },
  expired: { tone: "red", label: "Expired" },
  cancelled: { tone: "outline", label: "Cancelled" },
  depleted: { tone: "amber", label: "Visits used up" },
  scheduled: { tone: "neutral", label: "Scheduled" },
};

export function MembershipStatusChip({ status, className }: { status?: MembershipEffectiveStatus; className?: string }) {
  if (!status) return <StatusChip tone="outline" className={className}>No membership</StatusChip>;
  const chip = MEMBERSHIP_CHIP[status];
  return <StatusChip tone={chip.tone} className={className}>{chip.label}</StatusChip>;
}

const PAYMENT_CHIP: Record<PaymentStatus, { tone: Tone; label: string }> = {
  paid: { tone: "green", label: "Paid" },
  partial: { tone: "amber", label: "Partial" },
  unpaid: { tone: "red", label: "Unpaid" },
  refunded: { tone: "neutral", label: "Refunded" },
};

export function PaymentStatusChip({ status, className }: { status: PaymentStatus; className?: string }) {
  const chip = PAYMENT_CHIP[status];
  return <StatusChip tone={chip.tone} className={className}>{chip.label}</StatusChip>;
}

const TRANSACTION_CHIP: Record<TransactionStatus, { tone: Tone; label: string }> = {
  completed: { tone: "green", label: "Completed" },
  voided: { tone: "outline", label: "Voided" },
  refunded: { tone: "neutral", label: "Refunded" },
  partially_refunded: { tone: "amber", label: "Part-refunded" },
};

export function TransactionStatusChip({ status, className }: { status: TransactionStatus; className?: string }) {
  const chip = TRANSACTION_CHIP[status];
  return <StatusChip tone={chip.tone} className={className}>{chip.label}</StatusChip>;
}

const LEAD_CHIP: Record<LeadStage, { tone: Tone; label: string }> = {
  new: { tone: "ink", label: "New" },
  attempted: { tone: "neutral", label: "Attempted" },
  contacted: { tone: "neutral", label: "Contacted" },
  trial_booked: { tone: "amber", label: "Trial booked" },
  trial_completed: { tone: "amber", label: "Trial done" },
  offer_sent: { tone: "amber", label: "Offer sent" },
  won: { tone: "green", label: "Won" },
  lost: { tone: "outline", label: "Lost" },
};

export function LeadStageChip({ stage, className }: { stage: LeadStage; className?: string }) {
  const chip = LEAD_CHIP[stage];
  return <StatusChip tone={chip.tone} className={className}>{chip.label}</StatusChip>;
}

const DECISION_CHIP: Record<CheckInDecision, { tone: Tone; label: string }> = {
  allowed: { tone: "green", label: "Allowed" },
  warning: { tone: "amber", label: "Warning" },
  blocked: { tone: "red", label: "Blocked" },
  overridden: { tone: "ink", label: "Override" },
};

export function CheckInDecisionChip({ decision, className }: { decision: CheckInDecision; className?: string }) {
  const chip = DECISION_CHIP[decision];
  return <StatusChip tone={chip.tone} className={className}>{chip.label}</StatusChip>;
}

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  walk_in: "Walk-in",
  referral: "Referral",
  whatsapp: "WhatsApp",
  google: "Google",
  phone_call: "Phone call",
  other: "Other",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
  cliq: "CliQ",
  other: "Other",
};
