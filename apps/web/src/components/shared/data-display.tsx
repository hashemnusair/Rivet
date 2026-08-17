"use client";

import type { ComponentProps } from "react";
import type { Money } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { TENANT_TIMEZONE } from "@/lib/utils/dates";

/**
 * Every date and money value in the product renders through this file, so
 * these are the components that make the workspace bilingual: they read the
 * reader's language from `useFormat` rather than the module-scope English
 * formatters in `lib/utils`.
 *
 * The signs stay as they are in both languages. A minus in front of a figure is
 * read the same way in Arabic, and the direction of the surrounding text does
 * not change what the number means.
 */

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
    <span className={cn("tabular", negative && "text-danger", className)} dir="ltr">
      {signed && money.amount > 0 ? "+" : null}
      {negative ? "−" : null}
      {formatted}
    </span>
  );
}

export function DateText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap", className)}>{format.date(iso)}</span>;
}

export function TimeText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("whitespace-nowrap tabular", className)} dir="ltr">
      {format.time(iso)}
    </span>
  );
}

export function DateTimeText({ iso, className }: { iso?: string | null; className?: string }) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap tabular", className)}>{format.dateTime(iso)}</span>;
}

export function RelativeText({ iso, className, ...rest }: { iso?: string | null } & ComponentProps<"span">) {
  const format = useFormat();
  if (!iso) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("whitespace-nowrap", className)} title={format.dateTime(iso)} {...rest}>
      {format.relative(iso)}
    </span>
  );
}

/**
 * Days-until label for membership end dates: "in 4 days" / "3 days ago".
 *
 * `Intl.RelativeTimeFormat` handles this in one call per language and gets
 * Arabic's plural agreement right — "خلال يومين" for two days, not a template
 * with the number substituted in.
 */
export function DaysUntilText({ date, className }: { date: string; className?: string }) {
  const format = useFormat();
  const t = useT();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TENANT_TIMEZONE });
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  const days = Math.round(ms / 86_400_000);

  let label: string;
  let tone = "text-ink-2";
  if (days === 0) {
    label = t("common.time.today");
    tone = "text-warning-deep font-medium";
  } else if (days === 1) {
    label = t("common.time.tomorrow");
    tone = "text-warning-deep font-medium";
  } else if (days === -1) {
    label = t("common.time.yesterday");
    tone = "text-danger";
  } else {
    // `numeric: "auto"` already gave us today/yesterday/tomorrow above; the rest
    // are plain counted days in whichever direction.
    label = format.relativeDays(days);
    if (days < 0) tone = "text-danger";
  }

  return <span className={cn("whitespace-nowrap", tone, className)}>{label}</span>;
}
