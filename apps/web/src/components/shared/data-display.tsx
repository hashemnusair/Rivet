"use client";

import type { ComponentProps } from "react";
import type { Money } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { todayISODate } from "@/lib/utils/dates";

// Values are isolated independently of surrounding prose. Amount signs stay
// with Latin digits; the Arabic currency label follows the page's direction.
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
  const formatted = format.money(money, { hideCurrency, compact, signDisplay: signed ? "exceptZero" : "auto" });
  const numberPrefix = formatted.match(/^([+−-]?[0-9,.]+)(.*)$/);
  return (
    <bdi dir="auto" title={compact ? format.money(money) : undefined} className={cn("tabular", negative && "text-danger", className)}>
      {numberPrefix ? <><bdi dir="ltr">{numberPrefix[1]}</bdi>{numberPrefix[2]}</> : formatted}
    </bdi>
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
  return <bdi dir="auto" className={cn("whitespace-nowrap tabular", className)}>{format.time(iso)}</bdi>;
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
  const timeZone = useFormattingTimeZone();
  const today = todayISODate(timeZone);
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
