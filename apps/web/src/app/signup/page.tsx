"use client";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { AlertTriangle, ArrowRight, CheckCircle2, Mail, Phone, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { PlatformSaasPlan, SubmitGymApplicationResult } from "@/lib/api/GymOSApi";
import { getApi } from "@/lib/api/client";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useExperience } from "@/lib/providers/experience-provider";
import {
  ANNUAL_DISCOUNT_PERCENT,
  calculatePlanPrice,
  isPublicQuotePlan,
  isBillingInterval,
  isPublicPricingPlanName,
  resolvePublicPricingPlans,
  type BillingInterval,
  type PublicPricingPlanName,
} from "@/lib/public/pricing";
import { localizedPublicPlanFeatures, formatPublicJod } from "@/components/public/public-plan-copy";
import { latinDigits } from "@/lib/utils/text";
import { cn } from "@/lib/utils/cn";

type FormField = "ownerName" | "gymName" | "gymAddress" | "email" | "contactNumber";
type SignupValidationKey =
  | "publicCompletion.signup.validation.ownerName"
  | "publicCompletion.signup.validation.gymName"
  | "publicCompletion.signup.validation.gymAddress"
  | "publicCompletion.signup.validation.email"
  | "publicCompletion.signup.validation.contactNumber";
type FormErrors = Partial<Record<FormField, SignupValidationKey>>;
/** The fields in the order they are read, and the control each one is. */
const FIELD_ORDER: readonly FormField[] = ["ownerName", "email", "contactNumber", "gymName", "gymAddress"];
const FIELD_IDS: Record<FormField, string> = {
  ownerName: "application-owner",
  email: "application-email",
  contactNumber: "application-phone",
  gymName: "application-gym",
  gymAddress: "application-address",
};

export default function GymApplicationPage() {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  const { saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  // Resolve the same four-tier public catalog used by the landing page. A
  // missing live catalog still leaves the application usable with launch
  // defaults while the platform catalog is being published.
  const plans = useMemo(() => resolvePublicPricingPlans(saasPlans), [saasPlans]);
  const usingFallbackCatalog = saasPlans.length === 0;
  const [ownerName, setOwnerName] = useState("");
  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [plan, setPlan] = useState<PublicPricingPlanName>("Growth");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitGymApplicationResult>();
  const [hydrated, setHydrated] = useState(false);
  const querySelectionApplied = useRef(false);
  const applicationRequestKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (querySelectionApplied.current) return;
    querySelectionApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const requestedPlan = params.get("plan");
    const requestedInterval = params.get("interval");
    if (isPublicPricingPlanName(requestedPlan) && plans.some((item) => item.name === requestedPlan)) setPlan(requestedPlan);
    else if (plans.length > 0) setPlan(plans[0]!.name);
    if (isBillingInterval(requestedInterval)) setBillingInterval(requestedInterval);
    setHydrated(true);
  }, [plans]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const website = formData.get("website");
    const nextErrors: FormErrors = {};
    if (ownerName.trim().length < 2) nextErrors.ownerName = "publicCompletion.signup.validation.ownerName";
    if (gymName.trim().length < 2) nextErrors.gymName = "publicCompletion.signup.validation.gymName";
    if (gymAddress.trim().length < 5) nextErrors.gymAddress = "publicCompletion.signup.validation.gymAddress";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "publicCompletion.signup.validation.email";
    if (latinDigits(contactNumber).replace(/\D/g, "").length < 7) nextErrors.contactNumber = "publicCompletion.signup.validation.contactNumber";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      // The button sits a screen below the fields: take the visitor to the first one that needs them.
      const first = FIELD_ORDER.find((field) => nextErrors[field]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }

    setErrors({});
    setFormError(undefined);
    setSubmitting(true);
    try {
      const submitted = await getApi().submitGymApplication({
        ownerName: ownerName.trim(),
        gymName: gymName.trim(),
        gymAddress: gymAddress.trim(),
        email: email.trim().toLowerCase(),
        contactNumber: latinDigits(contactNumber.trim()),
        plan: plan as PlatformSaasPlan["name"],
        billingInterval,
        language: locale,
        idempotencyKey: applicationRequestKeyRef.current ?? (applicationRequestKeyRef.current = crypto.randomUUID()),
        ...(typeof website === "string" && website.trim() ? { website: website.trim() } : {}),
      });
      applicationRequestKeyRef.current = undefined;
      setResult(submitted);
    } catch (error) {
      setFormError(isApiError(error) ? localizeApiError(error, locale).message : t("publicCompletion.signup.validation.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicDocumentPage path="/signup" tone="night" signedOutOnly>
      <div className="px-5 pb-20 pt-12 sm:px-8 lg:px-12 lg:pb-28 lg:pt-20">
        <div className="mx-auto max-w-[1344px]">
          {result ? (
            <ApplicationReceived result={result} gymName={gymName} email={email} />
          ) : (
            <>
              <div className={cn(ROW, "lg:items-baseline")}>
                <h1 className={TITLE}>{t("publicCompletion.signup.title")}</h1>
                <p className="max-w-[62ch] text-[14.5px] leading-[1.7] text-ink-2">{t("publicCompletion.signup.intro")}</p>
              </div>

              <form onSubmit={submit} data-night-form data-billing-interval={billingInterval} className="mt-12 lg:mt-16">
                <label htmlFor="application-website" className="absolute -start-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                  {t("publicCompletion.signup.websiteLabel")}
                  <input id="application-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>

                <FormSection title={t("publicCompletion.signup.contactHeading")} note={t("publicCompletion.signup.accountSetup")}>
                  <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                    <Field label={t("publicCompletion.signup.ownerName")} htmlFor="application-owner" error={errors.ownerName ? t(errors.ownerName) : undefined} required>
                      <Input id="application-owner" dir="auto" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Omar Khalil" autoComplete="name" disabled={!hydrated} />
                    </Field>
                    <Field label={t("auth.signIn.emailLabel")} htmlFor="application-email" error={errors.email ? t(errors.email) : undefined} hint={t("publicCompletion.signup.emailHint")} required>
                      <div className="relative"><Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-email" dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" autoComplete="email" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                    <Field label={t("publicCompletion.signup.contactNumber")} htmlFor="application-phone" error={errors.contactNumber ? t(errors.contactNumber) : undefined} hint={t("publicCompletion.signup.phoneHint")} required>
                      <div className="relative"><Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-phone" dir="ltr" type="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder={t("publicCompletion.signup.phonePlaceholder")} autoComplete="tel" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                    <Field label={t("publicCompletion.signup.gymName")} htmlFor="application-gym" error={errors.gymName ? t(errors.gymName) : undefined} required>
                      <Input id="application-gym" dir="auto" value={gymName} onChange={(event) => setGymName(event.target.value)} placeholder="Northstar Fitness" disabled={!hydrated} />
                    </Field>
                    <Field label={t("publicCompletion.signup.gymAddress")} htmlFor="application-address" error={errors.gymAddress ? t(errors.gymAddress) : undefined} hint={t("publicCompletion.signup.addressHint")} className="sm:col-span-2 xl:col-span-2" required>
                      <Textarea id="application-address" dir="auto" rows={2} value={gymAddress} onChange={(event) => setGymAddress(event.target.value)} placeholder={t("publicCompletion.signup.addressPlaceholder")} autoComplete="street-address" maxLength={300} className="min-h-[4.5rem]" disabled={!hydrated} />
                    </Field>
                  </div>
                </FormSection>

                <FormSection title={t("publicCompletion.signup.planHeading")} note={t("publicCompletion.signup.noImmediatePayment")}>
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <p id="application-billing" className="text-[13px] font-medium text-ink-2">{t("publicCompletion.signup.billingFrequency")}</p>
                    <div role="tablist" aria-labelledby="application-billing" className="grid w-full grid-cols-2 border border-line bg-surface p-1 sm:w-auto">
                      {(["monthly", "annual"] as const).map((interval) => {
                        const selected = billingInterval === interval;
                        return (
                          <button
                            key={interval}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setBillingInterval(interval)}
                            data-touch-target
                            className={cn("min-h-10 px-5 py-2 text-[12.5px] font-medium transition-colors", selected ? "bg-ink text-paper" : "text-ink-3 hover:text-ink")}
                          >
                            {interval === "monthly"
                              ? t("publicCompletion.landing.pricing.monthly")
                              : plan === "Enterprise"
                                ? t("publicCompletion.signup.annualQuoteTab")
                                : t("publicCompletion.landing.pricing.annualSave", { percent: f.number(ANNUAL_DISCOUNT_PERCENT) })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {usingFallbackCatalog ? (
                    <div className="mt-4 flex items-start gap-2 border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12.5px] text-warning-deep" role="status">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">{experienceStatus === "error" ? (experienceError ?? t("publicCompletion.signup.pricingLoadFailed")) : t("publicCompletion.signup.pricingLoadingFallback")}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={retryExperience} className="-my-1 shrink-0 px-1.5 text-warning-deep" aria-label={t("publicCompletion.signup.retryPrices")}><RefreshCcw /></Button>
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t("publicCompletion.signup.planPicker")}>
                    {plans.map((item) => {
                      const selected = plan === item.name;
                      const price = calculatePlanPrice(item, billingInterval);
                      const featureList = localizedPublicPlanFeatures(item, f, t);
                      const quoteOnly = isPublicQuotePlan(item);
                      const cadence = t(billingInterval === "annual" ? "publicCompletion.signup.annualCadence" : "publicCompletion.signup.monthlyCadence");
                      const capacitySummary = quoteOnly ? (featureList[0] ?? "") : featureList.slice(0, 4).join(" · ");
                      const capabilitySummary = quoteOnly ? featureList.slice(1, featureList.length - 2).join(" · ") : featureList.slice(4, featureList.length - 2).join(" · ");
                      return (
                        <button
                          key={item.name}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setPlan(item.name)}
                          disabled={!hydrated}
                          className={cn(
                            "group flex flex-col border p-5 text-start transition-colors duration-200 disabled:pointer-events-none disabled:opacity-60",
                            selected ? "border-ink-2 bg-surface" : "border-line hover:border-line-3",
                          )}
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="text-[15px] font-semibold tracking-[-0.01em]"><bdi dir="ltr">{item.name}</bdi></span>
                            {/* The chosen plan takes the pin, as a plate does in the mark. */}
                            <span className={cn("flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200", selected ? "border-signal" : "border-line-3 group-hover:border-ink-3")} aria-hidden>
                              <span className={cn("size-[7px] rounded-full bg-signal transition-[opacity,transform] duration-200 ease-out", selected ? "opacity-100" : "scale-50 opacity-0")} />
                            </span>
                          </span>
                          {quoteOnly ? (
                            <span className="mt-2 block text-[14px] leading-snug text-ink">{t("publicCompletion.landing.pricing.customQuoteCadence", { cadence })}. {t("publicCompletion.landing.pricing.customQuotePriceDetails")}</span>
                          ) : (
                            <span className="tabular mt-2 block text-[14px] leading-snug text-ink">{t("publicCompletion.signup.monthlyPrice", { amount: isolateLtr(formatPublicJod(price.effectiveMonthlyMinor, f, locale)) })}{billingInterval === "annual" ? ` · ${t("publicCompletion.signup.annualPrice", { amount: isolateLtr(formatPublicJod(price.annualTotalMinor, f, locale)) })}` : ""}</span>
                          )}
                          {capacitySummary ? <span className="mt-3 block text-[12.5px] leading-relaxed text-ink-2">{capacitySummary}</span> : null}
                          <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-3">{t("publicCompletion.signup.included")} {capabilitySummary}</span>
                          <span className="mt-auto block pt-4">
                            {quoteOnly ? (
                              <span className="block border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.signup.customOnboarding")} {t("publicCompletion.signup.customFirstPayment")}</span>
                            ) : (
                              <span className="tabular block border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.landing.pricing.oneTimeOnboarding", { amount: isolateLtr(formatPublicJod(price.onboardingFeeMinor ?? 0, f, locale)) })} · {t("publicCompletion.landing.pricing.firstPayment", { amount: isolateLtr(formatPublicJod(price.firstPaymentMinor, f, locale)) })}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.landing.pricing.activeMemberAllowanceNote")}</p>
                </FormSection>

                <div className={cn(ROW, "mt-10 border-t border-line pt-8 lg:mt-12 lg:pt-10")}>
                  <div aria-hidden className="hidden lg:block" />
                  <div>
                    {formError ? <p className="mb-5 border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{formError}</p> : null}
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
                      <Button type="submit" size="lg" loading={submitting || !hydrated} disabled={!hydrated || plans.length === 0} className="w-full sm:w-auto sm:min-w-64">{t("marketing.actions.applyShort")}{" "}<ArrowRight /></Button>
                      <p className="text-[12.5px] text-ink-3">{t("publicCompletion.signup.existingAccess")} <Link href="/login/gym" className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">{t("common.action.signIn")}</Link></p>
                    </div>
                    <p className="mt-5 max-w-[70ch] text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.signup.consent")} <Link href="/terms" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.terms")}</Link> {t("publicCompletion.signup.consentJoiner")} <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.privacy")}</Link>. {t("publicCompletion.signup.agreementLater")}</p>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </PublicDocumentPage>
  );
}

/** One axis down the page: what a row is about on the start side, the row itself beside it. */
const ROW = "grid gap-x-12 gap-y-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]";
/** The page's title, set as the landing sets a section's. */
const TITLE = "text-balance text-[clamp(2rem,3.4vw,3.1rem)] font-normal leading-[1.02] tracking-[-0.035em] text-ink [font-family:var(--font-marketing-display)]";

/** A part of the application: its question and the note that goes with it, then its controls. */
function FormSection({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className={cn(ROW, "mt-10 border-t border-line pt-8 first-of-type:mt-0 lg:mt-12 lg:pt-10")}>
      <div className="lg:sticky lg:top-28 lg:self-start">
        <h2 className="text-[1.3rem] font-normal leading-[1.15] tracking-[-0.025em] text-ink [font-family:var(--font-marketing-display)]">{title}</h2>
        <p className="mt-2.5 max-w-[36ch] text-[13.5px] leading-relaxed text-ink-3">{note}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ApplicationReceived({ result, gymName, email }: { result: SubmitGymApplicationResult; gymName: string; email: string }) {
  const { t, isolate } = useLocale();
  const confirmation = result.notificationStatus === "sent"
    ? t("publicCompletion.signup.confirmationSent", { email: isolate(email) })
    : result.notificationStatus === "pending"
      ? t("publicCompletion.signup.confirmationPending", { email: isolate(email) })
      : t("publicCompletion.signup.confirmationUnavailable");
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The receipt replaces a long form whose button was at the bottom: show it from its top, and continue from it.
  useEffect(() => {
    document.documentElement.scrollTop = 0;
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={cn(ROW, "min-h-[52svh] content-start lg:items-baseline")} role="status">
      <h1 ref={titleRef} tabIndex={-1} className={cn(TITLE, "outline-none")}>{t("publicCompletion.signup.receivedTitle")}</h1>
      <div className="max-w-[62ch]">
        <p className="flex items-center gap-2 text-[13px] font-medium text-success-deep"><CheckCircle2 className="size-4" aria-hidden />{t("publicCompletion.signup.received")}</p>
        <p className="mt-4 text-[14.5px] leading-[1.7] text-ink-2">{t("publicCompletion.signup.receivedFor")} <strong className="font-semibold text-ink"><bdi dir="auto">{isolate(gymName || t("publicCompletion.signup.gymFallback"))}</bdi></strong>. {confirmation} {t("publicCompletion.signup.reviewedNext")}</p>
        {result.duplicate ? <p className="mt-3 text-[12.5px] text-ink-3">{t("publicCompletion.signup.duplicate")}</p> : null}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="w-full sm:w-auto sm:min-w-48"><Link href="/login/gym">{t("common.action.signIn")}{" "}<ArrowRight /></Link></Button>
          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto sm:min-w-48"><Link href="/">{t("publicCompletion.signup.returnHome")}</Link></Button>
        </div>
        <p className="mt-5 text-[12.5px] text-ink-3">{t("publicCompletion.signup.invitation")}</p>
      </div>
    </div>
  );
}
