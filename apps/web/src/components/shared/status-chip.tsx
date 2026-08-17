import type {
  CheckInDecision,
  LeadStage,
  MembershipEffectiveStatus,
  PaymentMethodKey,
  PaymentStatus,
  TransactionStatus,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/i18n/provider";

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

const MEMBERSHIP_TONE: Record<MembershipEffectiveStatus, Tone> = {
  active: "green",
  expiring: "amber",
  frozen: "neutral",
  expired: "red",
  cancelled: "outline",
  depleted: "amber",
  scheduled: "neutral",
};

export function MembershipStatusChip({ status, className }: { status?: MembershipEffectiveStatus; className?: string }) {
  const t = useT();
  if (!status) {
    return <StatusChip tone="outline" className={className}>{t("domain.membershipStatus.none")}</StatusChip>;
  }
  return (
    <StatusChip tone={MEMBERSHIP_TONE[status]} className={className}>
      {t(`domain.membershipStatus.${status}`)}
    </StatusChip>
  );
}

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  paid: "green",
  partial: "amber",
  unpaid: "red",
  refunded: "neutral",
  void: "outline",
};

export function PaymentStatusChip({ status, className }: { status: PaymentStatus; className?: string }) {
  const t = useT();
  return (
    <StatusChip tone={PAYMENT_TONE[status]} className={className}>
      {t(`domain.paymentStatus.${status}`)}
    </StatusChip>
  );
}

const TRANSACTION_TONE: Record<TransactionStatus, Tone> = {
  completed: "green",
  voided: "outline",
  refunded: "neutral",
  partially_refunded: "amber",
};

export function TransactionStatusChip({ status, className }: { status: TransactionStatus; className?: string }) {
  const t = useT();
  return (
    <StatusChip tone={TRANSACTION_TONE[status]} className={className}>
      {t(`domain.transactionStatus.${status}`)}
    </StatusChip>
  );
}

const LEAD_TONE: Record<LeadStage, Tone> = {
  new: "ink",
  attempted: "neutral",
  contacted: "neutral",
  trial_booked: "amber",
  trial_completed: "amber",
  offer_sent: "amber",
  won: "green",
  lost: "outline",
};

export function LeadStageChip({ stage, className }: { stage: LeadStage; className?: string }) {
  const t = useT();
  return (
    <StatusChip tone={LEAD_TONE[stage]} className={className}>
      {t(`domain.leadStage.${stage}`)}
    </StatusChip>
  );
}

const DECISION_TONE: Record<CheckInDecision, Tone> = {
  allowed: "green",
  warning: "amber",
  blocked: "red",
  overridden: "ink",
};

export function CheckInDecisionChip({ decision, className }: { decision: CheckInDecision; className?: string }) {
  const t = useT();
  return (
    <StatusChip tone={DECISION_TONE[decision]} className={className}>
      {t(`domain.checkInDecision.${decision}`)}
    </StatusChip>
  );
}

/**
 * Ordered key lists for the pickers that offer these choices. The words live in
 * `domain.leadSource.*` and `domain.paymentMethod.*`; call sites translate, so
 * the order stays one decision made in one place.
 */
export const LEAD_SOURCE_KEYS = [
  "instagram",
  "walk_in",
  "referral",
  "whatsapp",
  "google",
  "phone_call",
  "other",
] as const;

export const PAYMENT_METHOD_KEYS: readonly PaymentMethodKey[] = [
  "cash",
  "card",
  "bank_transfer",
  "cliq",
  "other",
];
