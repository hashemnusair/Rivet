"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWebsiteOffer } from "@/components/public/website-offer";
import { formatPublicJod } from "@/components/public/public-plan-copy";
import { getApi } from "@/lib/api/client";
import type { PromoDiscount, PromoUnavailableReason } from "@/lib/api/GymOSApi";
import { useFormat } from "@/lib/i18n/format";
import { usePromoDescription } from "@/features/billing/promo-description";
import { useLocale } from "@/lib/i18n/provider";
import { calculatePlanPrice, isPublicQuotePlan, type BillingInterval, type PublicPricingPlan } from "@/lib/public/pricing";
import { cn } from "@/lib/utils/cn";
import { DEFAULT_WEBSITE_PLACES, DEFAULT_WEBSITE_PRICE_MINOR, firstPaymentQuote, normalizePromoCode } from "../../../convex/firstPayment";

/**
 * The application's launch offers: the website add-on, a promo code, and what
 * the first payment comes to with them. The website is shown as free while
 * free places remain; the price is fixed when RIVET approves the gym.
 */
export function FirstPaymentOptions({
  plan,
  interval,
  websiteRequested,
  onWebsiteChange,
  promo,
  onPromoChange,
  promoError,
  disabled,
}: {
  plan: PublicPricingPlan;
  interval: BillingInterval;
  websiteRequested: boolean;
  onWebsiteChange: (value: boolean) => void;
  promo?: PromoDiscount;
  onPromoChange: (promo?: PromoDiscount) => void;
  /** A code the server refused when the form was sent. */
  promoError?: PromoUnavailableReason;
  disabled?: boolean;
}) {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  const describePromo = usePromoDescription();
  const offer = useWebsiteOffer();
  const [code, setCode] = useState(promo?.code ?? "");
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<PromoUnavailableReason | "failed">();
  const places = offer?.places ?? DEFAULT_WEBSITE_PLACES;
  const priceMinor = offer?.priceMinor ?? DEFAULT_WEBSITE_PRICE_MINOR;
  const left = Math.max(0, places - (offer?.claimed ?? 0));
  const freeNow = offer ? offer.enabled !== false && left > 0 : false;
  const quoteOnly = isPublicQuotePlan(plan);
  const price = calculatePlanPrice(plan, interval);
  const quote = firstPaymentQuote({
    subscriptionMinor: interval === "annual" ? price.annualTotalMinor : price.monthlyMinor,
    onboardingFeeMinor: price.onboardingFeeMinor,
    website: { requested: websiteRequested, free: freeNow, priceMinor },
    promo,
  });
  const jod = (minor: number) => isolateLtr(formatPublicJod(minor, f, locale));
  const shownError = checkError ?? promoError;

  const apply = async () => {
    const normalized = normalizePromoCode(code);
    if (!normalized) return;
    setChecking(true);
    setCheckError(undefined);
    try {
      const result = await getApi().checkPromoCode({ code: normalized, plan: plan.name });
      if (result.valid && result.promo) onPromoChange(result.promo);
      else {
        onPromoChange(undefined);
        setCheckError(result.reason ?? "not_found");
      }
    } catch {
      setCheckError("failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="grid gap-6">
      <label
        htmlFor="application-website-addon"
        className={cn("flex cursor-pointer items-start gap-3 border bg-surface p-5 transition-colors", websiteRequested ? "border-ink-2" : "border-line hover:border-line-3")}
      >
        <input id="application-website-addon" type="checkbox" checked={websiteRequested} onChange={(event) => onWebsiteChange(event.target.checked)} disabled={disabled} className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--color-ink)]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{t("commerce.offer.websiteTitle")}</span>
            <span className="tabular text-[14px]">
              {freeNow ? (
                <span className="flex items-baseline gap-2"><s className="text-ink-3">{jod(priceMinor)}</s><span className="font-medium text-success">{t("commerce.lines.websiteFree")}</span></span>
              ) : (
                t("commerce.offer.websitePrice", { amount: jod(priceMinor) })
              )}
            </span>
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{t("commerce.offer.websiteBody")}</span>
          {offer && offer.enabled !== false ? (
            <span className="mt-2 block text-[12.5px] leading-relaxed text-ink-3">
              {t("commerce.offer.websiteFreeNow", { places: f.number(places) })}
              {" · "}
              {left > 0 ? t("commerce.offer.placesLeft", { count: left, formatted: f.number(left) }) : t("commerce.offer.allTaken")}
              {freeNow ? <span className="mt-0.5 block">{t("commerce.offer.freeNote")}</span> : null}
            </span>
          ) : null}
        </span>
      </label>

      <div>
        <label htmlFor="application-promo" className="text-[13px] font-medium text-ink-2">{t("commerce.offer.promoLabel")}</label>
        <div className="mt-2 flex max-w-md gap-2">
          <Input
            id="application-promo"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setCheckError(undefined);
              if (promo) onPromoChange(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void apply();
              }
            }}
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={24}
            disabled={disabled}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={shownError || promo ? "application-promo-status" : undefined}
            className="uppercase"
          />
          {promo ? (
            <Button type="button" variant="secondary" onClick={() => { onPromoChange(undefined); setCode(""); }} disabled={disabled}>{t("commerce.offer.promoRemove")}</Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void apply()} loading={checking} disabled={disabled || !normalizePromoCode(code)}>{t("commerce.offer.promoApply")}</Button>
          )}
        </div>
        {promo ? (
          <p id="application-promo-status" role="status" className="mt-2 text-[12.5px] font-medium text-success">{t("commerce.offer.promoApplied", { code: isolateLtr(promo.code), discount: describePromo(promo) })}</p>
        ) : shownError ? (
          <p id="application-promo-status" role="alert" className="mt-2 text-[12.5px] text-danger">{t(`commerce.offer.promoErrors.${shownError}`)}</p>
        ) : null}
      </div>

      {quoteOnly ? null : (
        <section aria-labelledby="first-payment-title" className="border border-line bg-surface p-5">
          <h3 id="first-payment-title" className="text-[15px] font-semibold tracking-[-0.01em]">{t("commerce.offer.summaryTitle")}</h3>
          <dl className="mt-3 divide-y divide-line text-[13.5px]">
            <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{t("commerce.lines.subscription", { plan: plan.name, cadence: t(interval === "annual" ? "commerce.lines.annual" : "commerce.lines.monthly") })}</dt><dd className="tabular">{jod(quote.subscriptionMinor)}</dd></div>
            {quote.onboardingFeeMinor > 0 ? <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{t("commerce.lines.onboarding")}</dt><dd className="tabular">{jod(quote.onboardingFeeMinor)}</dd></div> : null}
            {quote.websiteRequested ? (
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-ink-2">{t("commerce.lines.website")}</dt>
                <dd className="tabular">{quote.websiteFree ? <span className="font-medium text-success">{t("commerce.lines.websiteFree")}</span> : jod(quote.websiteMinor)}</dd>
              </div>
            ) : null}
            {quote.discountMinor > 0 && quote.promo ? <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{t("commerce.lines.promo", { code: isolateLtr(quote.promo.code) })}</dt><dd className="tabular text-success">{isolateLtr(`−${formatPublicJod(quote.discountMinor, f, locale)}`)}</dd></div> : null}
            <div className="flex justify-between gap-4 pt-3"><dt className="font-semibold">{t("commerce.lines.total")}</dt><dd className="tabular text-[16px] font-semibold">{jod(quote.totalMinor)}</dd></div>
          </dl>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{t("commerce.offer.summaryNote")}</p>
        </section>
      )}
    </div>
  );
}
