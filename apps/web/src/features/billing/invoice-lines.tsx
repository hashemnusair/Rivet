"use client";

import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

export interface InvoiceLine {
  key: "subscription" | "onboarding" | "website" | "promo" | "credit";
  amountMinor: number;
  /** A free website still shows what it would have cost. */
  listMinor?: number;
  free?: boolean;
}

/**
 * The lines a RIVET invoice is made of, from its stored amounts. The
 * subscription line is what is left of the subtotal once the one-time parts
 * are taken out, so the lines always add up to the total.
 */
export function invoiceLines(invoice: PlatformBillingInvoice): InvoiceLine[] {
  const total = invoice.amountMinor ?? 0;
  const onboarding = invoice.onboardingFeeMinor ?? 0;
  const website = invoice.websiteMinor ?? 0;
  const discount = invoice.discountMinor ?? 0;
  const credit = invoice.creditMinor ?? 0;
  const subtotal = invoice.subtotalMinor ?? total + discount + credit;
  const lines: InvoiceLine[] = [{ key: "subscription", amountMinor: subtotal - onboarding - website }];
  if (onboarding > 0) lines.push({ key: "onboarding", amountMinor: onboarding });
  if (invoice.websiteFree !== undefined) lines.push({ key: "website", amountMinor: website, listMinor: invoice.websiteListMinor, free: invoice.websiteFree });
  if (discount > 0) lines.push({ key: "promo", amountMinor: -discount });
  if (credit > 0) lines.push({ key: "credit", amountMinor: -credit });
  return lines;
}

export function InvoiceLines({ invoice, plan, className }: { invoice: PlatformBillingInvoice; plan?: string; className?: string }) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const currency = invoice.currency ?? "JOD";
  const money = (minor: number) => isolateLtr(f.money({ amount: minor, currency }));
  const cadence = t(invoice.billingInterval === "annual" ? "commerce.lines.annual" : "commerce.lines.monthly");
  const label = (line: InvoiceLine) => {
    if (line.key === "subscription") return plan ? t("commerce.lines.subscription", { plan, cadence }) : t("commerce.lines.subscription", { plan: "RIVET", cadence });
    if (line.key === "onboarding") return t("commerce.lines.onboarding");
    if (line.key === "website") return t("commerce.lines.website");
    if (line.key === "promo") return t("commerce.lines.promo", { code: invoice.promoCode ?? "" });
    return t("commerce.lines.credit");
  };
  return (
    <dl className={cn("divide-y divide-line text-[13.5px]", className)}>
      {invoiceLines(invoice).map((line) => (
        <div key={line.key} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-ink-2">{label(line)}</dt>
          <dd className="tabular shrink-0 text-end">
            {line.key === "website" && line.free ? (
              <span className="flex items-baseline gap-2">
                {line.listMinor ? <s className="text-ink-3">{money(line.listMinor)}</s> : null}
                <span className="font-medium text-success">{t("commerce.lines.websiteFree")}</span>
              </span>
            ) : line.amountMinor < 0 ? (
              <span className="text-success">{isolateLtr(`−${f.money({ amount: -line.amountMinor, currency })}`)}</span>
            ) : (
              money(line.amountMinor)
            )}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 pt-3">
        <dt className="font-semibold">{t("commerce.lines.total")}</dt>
        <dd className="tabular text-[17px] font-semibold">{money(invoice.amountMinor ?? 0)}</dd>
      </div>
    </dl>
  );
}
