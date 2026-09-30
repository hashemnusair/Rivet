"use client";

import type { ComponentProps } from "react";
import type { Money } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { TENANT_TIMEZONE } from "@/lib/utils/dates";

// Every date, time, amount and relative label in the product renders through
// this file, so these are the components that make the workspace bilingual:
// they read the reader's language from `useFormat` instead of the module-scope
// English formatters in `lib/utils`.
//
// Direction rules (verified in Arabic, see the bidi notes in CURRENT_STATE):
// - Money is `JOD 40.000` with Latin digits in both languages, so it is pinned
//   left-to-right; the sign is prepended inside the pinned run.
// - Clock times are digits only, so they are pinned left-to-right.
// - Dates contain a month word, so they take their direction from their own
//   first strong character (`dir="auto"`): "18 Oct 2026" stays left-to-right
//   and "18 تشرين الأول 2026" reads right-to-left.

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
  const format = useFormat();
  if (!money) return <span className={cn("tabular text-ink-3", className)}>—</span>;
  const negative = money.amount < 0;
  const abs = { ...money, amount: Math.abs(money.amount) };
  const formatted = format.money(abs, { hideCurrency, compact });
  return (
    <span dir="ltr" className={cn("tabular", negative && "text-danger", className)}>
      {signed && money.amount > 0 ? "+" : null}
      {negative ? "−" : null}
      {formatted}
    </span>
  );
}

export function DateText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span dir="auto" className={cn("whitespace-nowrap", className)}>{format.date(iso)}</span>;
}

export function TimeText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span dir="ltr" className={cn("whitespace-nowrap tabular", className)}>{format.time(iso)}</span>;
}

export function DateTimeText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span dir="auto" className={cn("whitespace-nowrap tabular", className)}>{format.dateTime(iso)}</span>;
}

export function RelativeText({ iso, className, ...rest }: { iso?: string | null } & ComponentProps<"span">) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return (
    <span dir="auto" className={cn("whitespace-nowrap", className)} title={format.dateTime(iso)} {...rest}>
      {format.relative(iso)}
    </span>
  );
}

/** Days-until label for membership end dates: "in 4 days" / "3 days ago". */
export function DaysUntilText({ date, className }: { date: string; className?: string }) {
  const format = useFormat();
  const { t } = useLocale();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TENANT_TIMEZONE });
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);
  let label: string;
  let tone = "text-ink-2";
  if (days === 0) {
    label = t("common.time.today").toLowerCase();
    tone = "text-warning-deep font-medium";
  } else if (days === 1) {
    label = t("common.time.tomorrow").toLowerCase();
    tone = "text-warning-deep font-medium";
  } else if (days === -1) {
    label = t("common.time.yesterday").toLowerCase();
    tone = "text-danger";
  } else {
    // Intl.RelativeTimeFormat gets the Arabic dual and plural agreement right.
    label = format.relativeDays(days);
    if (days < 0) tone = "text-danger";
  }
  return <span className={cn("whitespace-nowrap", tone, className)}>{label}</span>;
}
