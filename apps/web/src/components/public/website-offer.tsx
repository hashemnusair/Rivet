"use client";

import { useEffect, useState } from "react";
import { getApi } from "@/lib/api/client";
import type { WebsiteOffer } from "@/lib/api/GymOSApi";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { formatPublicJod } from "@/components/public/public-plan-copy";
import { DEFAULT_WEBSITE_PLACES, DEFAULT_WEBSITE_PRICE_MINOR } from "../../../convex/firstPayment";

/**
 * The live free-website count, as the server reports it. Null until the first
 * value arrives or when it cannot be read: the offer is then shown without a
 * count rather than with a guessed one.
 */
export function useWebsiteOffer(): WebsiteOffer | null {
  const [offer, setOffer] = useState<WebsiteOffer | null>(null);
  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void getApi()
      .subscribeWebsiteOffer(
        (value) => { if (!cancelled) setOffer(value); },
        () => { if (!cancelled) setOffer(null); },
      )
      .then((dispose) => {
        if (cancelled) dispose();
        else stop = dispose;
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return offer;
}

function useOfferCopy() {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  const offer = useWebsiteOffer();
  const places = offer?.places ?? DEFAULT_WEBSITE_PLACES;
  const price = isolateLtr(formatPublicJod(offer?.priceMinor ?? DEFAULT_WEBSITE_PRICE_MINOR, f, locale));
  const claimed = Math.min(Math.max(0, offer?.claimed ?? 0), places);
  const left = places - claimed;
  return {
    offer,
    places,
    claimed,
    title: t("publicCompletion.landing.pricing.websiteOffer.title", { formatted: f.number(places) }),
    body: t("publicCompletion.landing.pricing.websiteOffer.body", { formatted: f.number(places), price }),
    status: left > 0
      ? t("publicCompletion.landing.pricing.websiteOffer.placesLeft", { count: left, formatted: f.number(left), total: f.number(places) })
      : t("publicCompletion.landing.pricing.websiteOffer.allTaken", { formatted: f.number(places) }),
  };
}

/** The offer on public pricing: what it is, and one box per place, filled once taken. */
export function WebsiteOfferPanel({ className }: { className?: string }) {
  const { offer, places, claimed, title, body, status } = useOfferCopy();
  // RIVET can switch the offer off in the console; the page then says nothing about it.
  if (offer?.enabled === false) return null;
  return (
    <div
      role="group"
      aria-labelledby="website-offer-title"
      data-testid="website-offer"
      className={cn("grid gap-6 rounded-lg border border-line bg-surface p-5 sm:p-6 lg:grid-cols-[1fr_minmax(15rem,20rem)] lg:items-center lg:gap-14", className)}
    >
      <div>
        <h3 id="website-offer-title" className="text-[19px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-ink-2">{body}</p>
      </div>
      {offer ? (
        <div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: places }, (_, index) => (
              <span
                key={index}
                data-taken={index < claimed ? "" : undefined}
                className={cn("h-2.5 flex-1 rounded-[2px] border transition-colors duration-500", index < claimed ? "border-ink bg-ink" : "border-line-3")}
              />
            ))}
          </div>
          <p aria-live="polite" className="tabular mt-3 text-[13.5px] font-medium">{status}</p>
        </div>
      ) : null}
    </div>
  );
}
