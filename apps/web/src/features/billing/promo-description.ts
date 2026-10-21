"use client";

import { formatPublicJod } from "@/components/public/public-plan-copy";
import type { PromoDiscount } from "@/lib/api/GymOSApi";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";

/** How a promo reads to people: "50% off the first month or year". */
export function usePromoDescription() {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  return (promo: Pick<PromoDiscount, "target" | "percentOff" | "amountOffMinor">) => {
    const target = t(`commerce.offer.targets.${promo.target}`);
    return promo.percentOff !== undefined
      ? t("commerce.offer.discountPercent", { percent: f.number(promo.percentOff), target })
      : t("commerce.offer.discountAmount", { amount: isolateLtr(formatPublicJod(promo.amountOffMinor ?? 0, f, locale)), target });
  };
}
