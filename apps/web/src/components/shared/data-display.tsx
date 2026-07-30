import type { ComponentProps } from "react";
import type { Money } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatDateTime, formatRelative, formatTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

/** Money always in tabular mono — the ledger voice of the product. */
export function MoneyText({
  money,
  hideCurrency,
  compact,
  className,
  signed,
}: {
  money: Money | undefined | null;
  hideCurrency?: boolean;
  compact?: boolean;
  signed?: boolean;
  className?: string;
}) {
  if (!money) return <span className={cn("tabular text-ink-3", className)}>—</span>;
  const negative = money.amount < 0;
  const abs = { ...money, amount: Math.abs(money.amount) };
  const formatted = formatMoney(abs, { hideCurrency, compact });
  return (
    <span className={cn("tabular", negative && "text-danger", className)}>
      {signed && money.amount > 0 ? "+" : null}
      {negative ? "−" : null}
      {formatted}
    </span>
  );
}

export function DateText({ iso, className }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap", className)}>{formatDate(iso)}</span>;
}

export function TimeText({ iso, className }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap tabular", className)}>{formatTime(iso)}</span>;
}

export function DateTimeText({ iso, className }: { iso?: string | null; className?: string }) {
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap tabular", className)}>{formatDateTime(iso)}</span>;
}

export function RelativeText({ iso, className, ...rest }: { iso?: string | null } & ComponentProps<"span">) {
  if (!iso) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("whitespace-nowrap", className)} title={formatDateTime(iso)} {...rest}>
      {formatRelative(iso)}
    </span>
  );
}

/** Days-until label for membership end dates: "in 4 days" / "3 days ago". */
export function DaysUntilText({ date, className }: { date: string; className?: string }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  let label: string;
  let tone = "text-ink-2";
  if (days === 0) {
    label = "today";
    tone = "text-warning-deep font-medium";
  } else if (days === 1) {
    label = "tomorrow";
    tone = "text-warning-deep font-medium";
  } else if (days > 1) {
    label = `in ${days} days`;
  } else if (days === -1) {
    label = "yesterday";
    tone = "text-danger";
  } else {
    label = `${-days} days ago`;
    tone = "text-danger";
  }
  return <span className={cn("whitespace-nowrap", tone, className)}>{label}</span>;
}
