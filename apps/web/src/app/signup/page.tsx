"use client";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { AlertTriangle, ArrowRight, Check, CheckCircle2, Mail, Phone, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
    <PublicDocumentPage path="/signup" signedOutOnly>
      <div className="px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          {result ? (
            <ApplicationReceived result={result} gymName={gymName} email={email} />
          ) : (
            <>
              <div className="max-w-2xl">
                <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">{t("publicCompletion.signup.title")}</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  {t("publicCompletion.signup.intro")}
                </p>
              </div>

              <form onSubmit={submit} data-billing-interval={billingInterval} className="mt-6 grid gap-6 rounded-lg border border-line bg-surface p-5 sm:p-8 lg:grid-cols-[1fr_0.9fr] lg:gap-10">
                <label htmlFor="application-website" className="absolute -start-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                  {t("publicCompletion.signup.websiteLabel")}
                  <input id="application-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
                <section>
                  <h2 className="text-[15px] font-semibold">{t("publicCompletion.signup.contactHeading")}</h2>
                  <div className="mt-4 grid gap-4">
                    <Field label={t("publicCompletion.signup.ownerName")} htmlFor="application-owner" error={errors.ownerName ? t(errors.ownerName) : undefined} required>
                      <Input id="application-owner" dir="auto" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Omar Khalil" autoComplete="name" disabled={!hydrated} />
                    </Field>
                    <Field label={t("auth.signIn.emailLabel")} htmlFor="application-email" error={errors.email ? t(errors.email) : undefined} hint={t("publicCompletion.signup.emailHint")} required>
                      <div className="relative"><Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-email" dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" autoComplete="email" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                    <Field label={t("publicCompletion.signup.contactNumber")} htmlFor="application-phone" error={errors.contactNumber ? t(errors.contactNumber) : undefined} hint={t("publicCompletion.signup.phoneHint")} required>
                      <div className="relative"><Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-phone" dir="ltr" type="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder={t("publicCompletion.signup.phonePlaceholder")} autoComplete="tel" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                  </div>

                  <div className="mt-6 border-t border-line pt-5">
                    <p className="text-[13px] font-medium text-ink">{t("publicCompletion.signup.accountSetup")}</p>
                  </div>
                </section>

                <section className="border-t border-line pt-6 lg:border-s lg:border-t-0 lg:ps-10 lg:pt-0">
                  <h2 className="text-[15px] font-semibold">{t("publicCompletion.signup.planHeading")}</h2>
                  <Field label={t("publicCompletion.signup.gymName")} htmlFor="application-gym" error={errors.gymName ? t(errors.gymName) : undefined} className="mt-4" required>
                    <Input id="application-gym" dir="auto" value={gymName} onChange={(event) => setGymName(event.target.value)} placeholder="Northstar Fitness" disabled={!hydrated} />
                  </Field>
                  <Field label={t("publicCompletion.signup.gymAddress")} htmlFor="application-address" error={errors.gymAddress ? t(errors.gymAddress) : undefined} hint={t("publicCompletion.signup.addressHint")} className="mt-4" required>
                    <Textarea id="application-address" dir="auto" value={gymAddress} onChange={(event) => setGymAddress(event.target.value)} placeholder={t("publicCompletion.signup.addressPlaceholder")} autoComplete="street-address" maxLength={300} disabled={!hydrated} />
                  </Field>
                  <fieldset className="mt-5">
                    <legend className="text-[13px] font-medium text-ink-2">{t("publicCompletion.signup.billingFrequency")}</legend>
                    <div role="tablist" aria-label={t("publicCompletion.signup.billingFrequency")} className="mt-1.5 grid grid-cols-2 rounded-md border border-line bg-sunken p-1">
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
                            className={cn("rounded-sm px-3 py-2 text-[12.5px] font-medium transition-colors", selected ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
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
                  </fieldset>
                  {usingFallbackCatalog ? (
                    <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12.5px] text-warning-deep" role="status">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">{experienceStatus === "error" ? (experienceError ?? t("publicCompletion.signup.pricingLoadFailed")) : t("publicCompletion.signup.pricingLoadingFallback")}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={retryExperience} className="-my-1 shrink-0 px-1.5 text-warning-deep" aria-label={t("publicCompletion.signup.retryPrices")}><RefreshCcw /></Button>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label={t("publicCompletion.signup.planPicker")}>
                    {plans.map((item) => {
                      const selected = plan === item.name;
                      const price = calculatePlanPrice(item, billingInterval);
                      const featureList = localizedPublicPlanFeatures(item, f, t);
                      const quoteOnly = isPublicQuotePlan(item);
                      const cadence = t(billingInterval === "annual" ? "publicCompletion.signup.annualCadence" : "publicCompletion.signup.monthlyCadence");
                      const capacitySummary = quoteOnly ? (featureList[0] ?? "") : featureList.slice(0, 4).join(" · ");
                      const capabilitySummary = quoteOnly ? featureList.slice(1, featureList.length - 2).join(" · ") : featureList.slice(4, featureList.length - 2).join(" · ");
                      return (
                        <button key={item.name} type="button" role="radio" aria-checked={selected} onClick={() => setPlan(item.name)} disabled={!hydrated} className={cn("flex items-center gap-3 rounded-md border p-3.5 text-start transition-colors disabled:pointer-events-none disabled:opacity-60", selected ? "border-ink bg-sunken/60" : "border-line-2 hover:border-line-3")}>
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-ink bg-ink text-paper" : "border-line-3")} aria-hidden>{selected ? <Check className="size-3" /> : null}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold"><bdi dir="ltr">{item.name}</bdi></span>
                            {quoteOnly ? (
                              <span className="mt-0.5 block text-[12.5px] text-ink-2">{t("publicCompletion.landing.pricing.customQuoteCadence", { cadence })}. {t("publicCompletion.landing.pricing.customQuotePriceDetails")}</span>
                            ) : (
                              <span className="mt-0.5 block text-[12.5px] text-ink-2">{t("publicCompletion.signup.monthlyPrice", { amount: isolateLtr(formatPublicJod(price.effectiveMonthlyMinor, f, locale)) })}{billingInterval === "annual" ? ` · ${t("publicCompletion.signup.annualPrice", { amount: isolateLtr(formatPublicJod(price.annualTotalMinor, f, locale)) })}` : ""}</span>
                            )}
                            {capacitySummary ? <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">{capacitySummary}</span> : null}
                            <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.signup.included")} {capabilitySummary}</span>
                            {quoteOnly ? (
                              <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.signup.customOnboarding")} {t("publicCompletion.signup.customFirstPayment")}</span>
                            ) : (
                              <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.landing.pricing.oneTimeOnboarding", { amount: isolateLtr(formatPublicJod(price.onboardingFeeMinor ?? 0, f, locale)) })} · {t("publicCompletion.landing.pricing.firstPayment", { amount: isolateLtr(formatPublicJod(price.firstPaymentMinor, f, locale)) })}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.landing.pricing.activeMemberAllowanceNote")}</p>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{t("publicCompletion.signup.noImmediatePayment")}</p>
                  {formError ? <p className="mt-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{formError}</p> : null}
                  <Button type="submit" size="lg" loading={submitting || !hydrated} disabled={!hydrated || plans.length === 0} className="mt-6 w-full">{t("marketing.actions.applyShort")}{" "}<ArrowRight /></Button>
                  <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.signup.consent")} <Link href="/terms" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.terms")}</Link> {t("publicCompletion.signup.consentJoiner")} <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.privacy")}</Link>. {t("publicCompletion.signup.agreementLater")}</p>
                  <p className="mt-3 text-center text-[12.5px] text-ink-3">{t("publicCompletion.signup.existingAccess")} <Link href="/login/gym" className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">{t("common.action.signIn")}</Link></p>
                </section>
              </form>
            </>
          )}
        </div>
      </div>
    </PublicDocumentPage>
  );
}

function ApplicationReceived({ result, gymName, email }: { result: SubmitGymApplicationResult; gymName: string; email: string }) {
  const { t, isolate } = useLocale();
  const confirmation = result.notificationStatus === "sent"
    ? t("publicCompletion.signup.confirmationSent", { email: isolate(email) })
    : result.notificationStatus === "pending"
      ? t("publicCompletion.signup.confirmationPending", { email: isolate(email) })
      : t("publicCompletion.signup.confirmationUnavailable");
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6 text-center sm:p-10" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg text-success-deep" aria-hidden><CheckCircle2 className="size-6" /></span>
      <p className="mt-5 text-[12px] font-medium text-ink-3">{t("publicCompletion.signup.received")}</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">{t("publicCompletion.signup.receivedTitle")}</h1>
      <p className="relative mt-3 text-[14px] leading-relaxed text-ink-2">{t("publicCompletion.signup.receivedFor")} <strong className="text-ink"><bdi dir="auto">{isolate(gymName || t("publicCompletion.signup.gymFallback"))}</bdi></strong>. {confirmation} {t("publicCompletion.signup.reviewedNext")}</p>
      {result.duplicate ? <p className="mt-3 text-[12.5px] text-ink-3">{t("publicCompletion.signup.duplicate")}</p> : null}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button asChild size="lg"><Link href="/login/gym">{t("common.action.signIn")}{" "}<ArrowRight /></Link></Button>
        <Button asChild variant="secondary" size="lg"><Link href="/">{t("publicCompletion.signup.returnHome")}</Link></Button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">{t("publicCompletion.signup.invitation")}</p>
    </div>
  );
}
