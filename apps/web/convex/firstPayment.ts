/**
 * What a new gym pays first, and the launch offers that change it: the
 * website add-on (free for the first gyms that ask) and promo codes. Free of
 * Convex imports, so the application form, the invoice and the platform
 * console price a first payment with the same arithmetic.
 */

/** Gyms that ask for a website get it free until this many places are taken. */
export const DEFAULT_WEBSITE_PLACES = 5;
/** The website add-on once the free places are gone, in JOD minor units. */
export const DEFAULT_WEBSITE_PRICE_MINOR = 150_000;

/** Which part of the first payment a promo code takes money off. */
export type PromoTarget = "subscription" | "onboarding" | "website" | "total";
export const PROMO_TARGETS: readonly PromoTarget[] = ["subscription", "onboarding", "website", "total"];

export interface PromoDiscount {
  code: string;
  target: PromoTarget;
  /** Whole percent, 1–100. Exactly one of `percentOff` and `amountOffMinor` is set. */
  percentOff?: number;
  amountOffMinor?: number;
}

export interface FirstPaymentInput {
  /** The first term at the chosen cadence, already discounted for annual billing. */
  subscriptionMinor: number;
  onboardingFeeMinor: number;
  website: { requested: boolean; free: boolean; priceMinor: number };
  promo?: PromoDiscount;
}

export interface FirstPaymentQuote {
  subscriptionMinor: number;
  onboardingFeeMinor: number;
  websiteRequested: boolean;
  /** What the website adds to this payment: zero when it is free or not asked for. */
  websiteMinor: number;
  /** The add-on's price before the free place, so a free website can show what it saved. */
  websiteListMinor: number;
  websiteFree: boolean;
  /** Before any promo code. */
  subtotalMinor: number;
  discountMinor: number;
  /** The part of the discount that came off the subscription, for later term credits. */
  subscriptionDiscountMinor: number;
  promo?: PromoDiscount;
  totalMinor: number;
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** The amount a promo takes off, never more than the part it applies to. */
export function promoDiscountMinor(promo: PromoDiscount | undefined, parts: { subscriptionMinor: number; onboardingFeeMinor: number; websiteMinor: number }): number {
  if (!promo) return 0;
  const base = promo.target === "subscription" ? parts.subscriptionMinor
    : promo.target === "onboarding" ? parts.onboardingFeeMinor
      : promo.target === "website" ? parts.websiteMinor
        : parts.subscriptionMinor + parts.onboardingFeeMinor + parts.websiteMinor;
  if (promo.percentOff !== undefined) return Math.min(base, Math.round(base * Math.min(100, Math.max(0, promo.percentOff)) / 100));
  return Math.min(base, whole(promo.amountOffMinor ?? 0));
}

export function firstPaymentQuote(input: FirstPaymentInput): FirstPaymentQuote {
  const subscriptionMinor = whole(input.subscriptionMinor);
  const onboardingFeeMinor = whole(input.onboardingFeeMinor);
  const websiteListMinor = input.website.requested ? whole(input.website.priceMinor) : 0;
  const websiteFree = input.website.requested && input.website.free;
  const websiteMinor = websiteFree ? 0 : websiteListMinor;
  const subtotalMinor = subscriptionMinor + onboardingFeeMinor + websiteMinor;
  const discountMinor = promoDiscountMinor(input.promo, { subscriptionMinor, onboardingFeeMinor, websiteMinor });
  const subscriptionDiscountMinor = input.promo?.target === "subscription" ? discountMinor
    : input.promo?.target === "total" && subtotalMinor > 0 ? Math.round(discountMinor * subscriptionMinor / subtotalMinor)
      : 0;
  return {
    subscriptionMinor,
    onboardingFeeMinor,
    websiteRequested: input.website.requested,
    websiteMinor,
    websiteListMinor,
    websiteFree,
    subtotalMinor,
    discountMinor,
    subscriptionDiscountMinor,
    ...(input.promo && discountMinor > 0 ? { promo: input.promo } : {}),
    totalMinor: subtotalMinor - discountMinor,
  };
}

/** Promo codes are typed by people: letters and digits, upper case, 3–24 characters. */
export function normalizePromoCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export function validPromoCodeShape(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code);
}

/** Why a code cannot be used, in the words the form and the console show. */
export type PromoUnavailableReason = "not_found" | "paused" | "expired" | "used_up" | "plan";

export interface PromoCheck {
  valid: boolean;
  reason?: PromoUnavailableReason;
  promo?: PromoDiscount;
}

/**
 * What a gym writes in its CliQ or bank-transfer note: "INV-" and the first
 * eight characters of the invoice's id, short enough to type. Older ids that
 * are already short are used as they are.
 */
export function paymentNoteReference(invoiceId: string): string {
  const match = /^INV-([0-9a-f]{8})-[0-9a-f-]+$/i.exec(invoiceId);
  return match ? `INV-${match[1]!.toUpperCase()}` : invoiceId;
}
