"use client";
import { useT } from "@/lib/i18n/provider";

import { AlertTriangle, ArrowRight, Check, CheckCircle2, Mail, Phone, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PublicDocumentPage } from "@/components/public/public-document-page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { PlatformSaasPlan, SubmitGymApplicationResult } from "@/lib/api/GymOSApi";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useExperience } from "@/lib/providers/experience-provider";
import {
  calculatePlanPrice,
  formatJodMinor,
  isBillingInterval,
  isPublicPricingPlanName,
  publicPlanFeatures,
  resolvePublicPricingPlans,
  type BillingInterval,
  type PublicPricingPlanName,
} from "@/lib/public/pricing";
import { cn } from "@/lib/utils/cn";

type FormErrors = Partial<Record<"ownerName" | "gymName" | "gymAddress" | "email" | "contactNumber", string>>;

export default function GymApplicationPage() {
  const t = useT();
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
    if (ownerName.trim().length < 2) nextErrors.ownerName = "Enter the owner name.";
    if (gymName.trim().length < 2) nextErrors.gymName = "Enter the gym name.";
    if (gymAddress.trim().length < 5) nextErrors.gymAddress = "Enter the gym's address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (contactNumber.replace(/\D/g, "").length < 7) nextErrors.contactNumber = "Enter a phone number we can call.";
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
        contactNumber: contactNumber.trim(),
        plan: plan as PlatformSaasPlan["name"],
        billingInterval,
        idempotencyKey: applicationRequestKeyRef.current ?? (applicationRequestKeyRef.current = crypto.randomUUID()),
        ...(typeof website === "string" && website.trim() ? { website: website.trim() } : {}),
      });
      applicationRequestKeyRef.current = undefined;
      setResult(submitted);
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "We could not send your application. Please try again.");
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
                <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight">Send a gym application.</h1>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
                  Tell us about your gym. We read every application and contact you. If we approve it, we set up RIVET for your gym.
                </p>
              </div>

              <form onSubmit={submit} data-billing-interval={billingInterval} className="mt-6 grid gap-6 rounded-lg border border-line bg-surface p-5 sm:p-8 lg:grid-cols-[1fr_0.9fr] lg:gap-10">
                <label htmlFor="application-website" className="absolute -start-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                  Website
                  <input id="application-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
                <section>
                  <h2 className="text-[15px] font-semibold">Who should we contact?</h2>
                  <div className="mt-4 grid gap-4">
                    <Field label="Owner name" htmlFor="application-owner" error={errors.ownerName} required>
                      <Input id="application-owner" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Omar Khalil" autoComplete="name" disabled={!hydrated} />
                    </Field>
                    <Field label={t("auth.signIn.emailLabel")} htmlFor="application-email" error={errors.email} hint="We’ll send your application confirmation here." required>
                      <div className="relative"><Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" autoComplete="email" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                    <Field label="Contact number" htmlFor="application-phone" error={errors.contactNumber} hint="Use a number where our team can reach you." required>
                      <div className="relative"><Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input id="application-phone" type="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder="Enter your phone number" autoComplete="tel" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                  </div>

                  <div className="mt-6 border-t border-line pt-5">
                    <p className="text-[13px] font-medium text-ink">RIVET sets up your gym&apos;s account after we approve your application.</p>
                  </div>
                </section>

                <section className="border-t border-line pt-6 lg:border-s lg:border-t-0 lg:ps-10 lg:pt-0">
                  <h2 className="text-[15px] font-semibold">Which plan fits?</h2>
                  <Field label="Gym name" htmlFor="application-gym" error={errors.gymName} className="mt-4" required>
                    <Input id="application-gym" value={gymName} onChange={(event) => setGymName(event.target.value)} placeholder="Northstar Fitness" disabled={!hydrated} />
                  </Field>
                  <Field label="Gym address" htmlFor="application-address" error={errors.gymAddress} hint="Where your gym is." className="mt-4" required>
                    <Textarea id="application-address" value={gymAddress} onChange={(event) => setGymAddress(event.target.value)} placeholder="Street, area, city" autoComplete="street-address" maxLength={300} disabled={!hydrated} />
                  </Field>
                  <fieldset className="mt-5">
                    <legend className="text-[13px] font-medium text-ink-2">How often you pay</legend>
                    <div role="tablist" aria-label="How often you pay" className="mt-1.5 grid grid-cols-2 rounded-md border border-line bg-sunken p-1">
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
                            {interval === "monthly" ? "Monthly" : "Annual · Save 20%"}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                  {usingFallbackCatalog ? (
                    <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12.5px] text-warning-deep" role="status">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">{experienceStatus === "error" ? (experienceError ?? "We could not load the latest prices.") : "Loading the latest prices. Showing our launch prices for now."}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={retryExperience} className="-my-1 shrink-0 px-1.5 text-warning-deep" aria-label="Try loading prices again"><RefreshCcw /></Button>
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-2" role="radiogroup" aria-label="RIVET plan">
                    {plans.map((item) => {
                      const selected = plan === item.name;
                      const price = calculatePlanPrice(item, billingInterval);
                      const featureList = publicPlanFeatures(item);
                      const capacitySummary = featureList.slice(0, 3).join(" · ");
                      const capabilitySummary = featureList.slice(3).filter((feature) => feature !== "Member app and marketplace listing" && feature !== "Staff permissions and audit history").join(" · ");
                      return (
                        <button key={item.name} type="button" role="radio" aria-checked={selected} onClick={() => setPlan(item.name)} disabled={!hydrated} className={cn("flex items-center gap-3 rounded-md border p-3.5 text-start transition-colors disabled:pointer-events-none disabled:opacity-60", selected ? "border-ink bg-sunken/60" : "border-line-2 hover:border-line-3")}>
                          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-ink bg-ink text-paper" : "border-line-3")} aria-hidden>{selected ? <Check className="size-3" /> : null}</span>
                          <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold">{item.name}</span><span className="mt-0.5 block text-[12.5px] text-ink-2">JD {formatJodMinor(price.effectiveMonthlyMinor)} a month{billingInterval === "annual" ? ` · JD ${formatJodMinor(price.annualTotalMinor)} billed annually` : ""}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">{capacitySummary}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">Includes: {capabilitySummary}</span></span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">You do not pay anything now. We will talk about the plan with you.</p>
                  {formError ? <p className="mt-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger" role="alert">{formError}</p> : null}
                  <Button type="submit" size="lg" loading={submitting || !hydrated} disabled={!hydrated || plans.length === 0} className="mt-6 w-full">{t("marketing.actions.applyShort")}{" "}<ArrowRight /></Button>
                  <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-3">By sending this application you agree to RIVET’s <Link href="/terms" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.terms")}</Link> and <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">{t("auth.chrome.privacy")}</Link>. The gym owner signs the subscription agreement later, in RIVET.</p>
                  <p className="mt-3 text-center text-[12.5px] text-ink-3">Already have RIVET access? <Link href="/login/gym" className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">{t("common.action.signIn")}</Link>{t("members.bulk.toast.end")}</p>
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
  const t = useT();
  const confirmation = result.notificationStatus === "sent"
    ? `We sent a confirmation to ${email}.`
    : result.notificationStatus === "pending"
      ? `We will send a confirmation to ${email} soon.`
      : "We could not send a confirmation email yet, but we have your application.";
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-line bg-surface p-6 text-center sm:p-10" role="status">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg text-success-deep" aria-hidden><CheckCircle2 className="size-6" /></span>
      <p className="mt-5 text-[12px] font-medium text-ink-3">Application received</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">We’ll be in touch soon.</h1>
      <p className="relative mt-3 text-[14px] leading-relaxed text-ink-2">We received the application for <strong className="text-ink">{gymName || "your gym"}</strong>{t("members.bulk.toast.end")}{" "}{result.notificationStatus === "sent" || result.notificationStatus === "pending" ? <>{confirmation} </> : null}Our team will contact you after we review it.</p>
      {result.notificationStatus !== "sent" && result.notificationStatus !== "pending" ? <p className="mt-3 text-[12.5px] text-ink-3">{confirmation}</p> : null}
      {result.duplicate ? <p className="mt-3 text-[12.5px] text-ink-3">We already have this application.</p> : null}
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button asChild size="lg"><Link href="/login/gym">{t("common.action.signIn")}{" "}<ArrowRight /></Link></Button>
        <Button asChild variant="secondary" size="lg"><Link href="/">Return home</Link></Button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">You can sign in after we approve your gym and email you an invitation.</p>
    </div>
  );
}
