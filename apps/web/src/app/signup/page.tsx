"use client";

import { ArrowRight, Building2, Check, CheckCircle2, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader } from "@/components/public/public-shell";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PlatformSaasPlan, SubmitGymApplicationResult } from "@/lib/api/GymOSApi";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";

const DEFAULT_PLANS: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
];

type FormErrors = Partial<Record<"ownerName" | "gymName" | "email" | "contactNumber", string>>;

export default function GymApplicationPage() {
  const { saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  const plans = useMemo(() => (saasPlans.length > 0 ? saasPlans : isConvexMode() ? [] : DEFAULT_PLANS), [saasPlans]);
  const [ownerName, setOwnerName] = useState("");
  const [gymName, setGymName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [plan, setPlan] = useState<PlatformSaasPlan["name"]>("Growth");
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitGymApplicationResult>();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (plans.length > 0 && !plans.some((item) => item.name === plan)) setPlan(plans[0]!.name);
  }, [plan, plans]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (ownerName.trim().length < 2) nextErrors.ownerName = "Enter the owner name.";
    if (gymName.trim().length < 2) nextErrors.gymName = "Enter the gym name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (contactNumber.replace(/\D/g, "").length < 7) nextErrors.contactNumber = "Enter a reachable contact number.";
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
        email: email.trim().toLowerCase(),
        contactNumber: contactNumber.trim(),
        plan,
      });
      setResult(submitted);
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "We could not send your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main className="marketing-grid px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-5xl">
          {result ? (
            <ApplicationReceived result={result} gymName={gymName} email={email} />
          ) : (
            <>
              <div className="mb-8 max-w-2xl">
                <p className="eyebrow">Partner with RIVET</p>
                <h1 className="mt-3 text-[32px] font-semibold tracking-tight sm:text-[38px]">Send a gym application.</h1>
                <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
                  Tell us about your gym and the team behind it. We review every application, contact you directly, and create access for approved gyms.
                </p>
              </div>

              <form onSubmit={submit} className="grid gap-5 border border-ink bg-surface p-6 shadow-pop sm:p-9 lg:grid-cols-[1fr_0.9fr] lg:p-12">
                <section>
                  <p className="eyebrow">Your details</p>
                  <h2 className="mt-2 text-[21px] font-semibold">Who should we contact?</h2>
                  <div className="mt-7 grid gap-4">
                    <Field label="Owner name" htmlFor="application-owner" error={errors.ownerName} required>
                      <Input id="application-owner" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Omar Khalil" autoComplete="name" disabled={!hydrated} />
                    </Field>
                    <Field label="Email address" htmlFor="application-email" error={errors.email} hint="We’ll send your application confirmation here." required>
                      <div className="relative"><Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input id="application-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@example.com" autoComplete="email" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                    <Field label="Contact number" htmlFor="application-phone" error={errors.contactNumber} hint="Use a number where our team can reach you." required>
                      <div className="relative"><Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input id="application-phone" type="tel" value={contactNumber} onChange={(event) => setContactNumber(event.target.value)} placeholder="+962 79 555 0194" autoComplete="tel" className="ps-9" disabled={!hydrated} /></div>
                    </Field>
                  </div>

                  <div className="mt-8 border-t border-line pt-6">
                    <p className="flex items-center gap-2 text-[12px] text-ink-2"><Building2 className="size-4 text-signal" /> Gym access is issued by RIVET after approval.</p>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">There is no self-serve gym account. Members and gym teams with access use the sign-in portal.</p>
                  </div>
                </section>

                <section className="border-t border-line pt-6 lg:border-s lg:border-t-0 lg:ps-9 lg:pt-0">
                  <p className="eyebrow">Your gym</p>
                  <h2 className="mt-2 text-[21px] font-semibold">Which plan fits?</h2>
                  <Field label="Gym name" htmlFor="application-gym" error={errors.gymName} className="mt-7" required>
                    <Input id="application-gym" value={gymName} onChange={(event) => setGymName(event.target.value)} placeholder="Northstar Fitness" disabled={!hydrated} />
                  </Field>
                  {experienceStatus !== "ready" || plans.length === 0 ? (
                    <div className="mt-6"><ExperienceDataState status={experienceStatus} error={experienceError} onRetry={retryExperience} emptyTitle="Plans are not available yet" emptyDescription="The application catalog is not ready. Please try again shortly." compact /></div>
                  ) : <div className="mt-6 grid gap-2" role="radiogroup" aria-label="RIVET plan">
                    {plans.map((item) => (
                      <button key={item.name} type="button" role="radio" aria-checked={plan === item.name} onClick={() => setPlan(item.name)} disabled={!hydrated} className={cn("flex items-center gap-3 border p-3.5 text-start transition-colors disabled:pointer-events-none disabled:opacity-60", plan === item.name ? "border-signal bg-signal/[0.035]" : "border-line hover:border-ink")}>
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", plan === item.name ? "border-signal bg-signal text-white" : "border-line-3")}>{plan === item.name ? <Check className="size-3" /> : null}</span>
                        <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{item.name}</span><span className="mt-0.5 block text-[11px] text-ink-3">JD {(item.priceMinor / 1000).toFixed(3)} / month · {item.branches} branch{item.branches > 1 ? "es" : ""}</span></span>
                      </button>
                    ))}
                  </div>}
                  <p className="mt-4 text-[11px] leading-relaxed text-ink-3">Plan selection is a starting point for the conversation, not a payment or activation.</p>
                  {formError ? <p className="mt-5 text-[12.5px] text-danger" role="alert">{formError}</p> : null}
                  <Button type="submit" variant="signal" size="lg" loading={submitting || !hydrated} disabled={!hydrated || plans.length === 0 || experienceStatus !== "ready"} className="mt-7 w-full">Send gym application <ArrowRight /></Button>
                  <p className="mt-4 text-center text-[11px] text-ink-3">Already have RIVET access? <Link href="/login" className="font-medium text-ink-2 underline underline-offset-4">Sign in</Link>.</p>
                </section>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ApplicationReceived({ result, gymName, email }: { result: SubmitGymApplicationResult; gymName: string; email: string }) {
  return (
    <div className="mx-auto max-w-xl border border-ink bg-surface p-8 text-center shadow-pop sm:p-12">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-8" /></span>
      <p className="mt-7 eyebrow">Application received</p>
      <h1 className="mt-3 text-[32px] font-semibold tracking-tight">We’ll be in touch soon.</h1>
      <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">We received the application for <strong>{gymName || "your gym"}</strong>. We sent a confirmation to <strong>{email}</strong> and our team will contact you after review.</p>
      {result.duplicate ? <p className="mt-4 text-[11.5px] text-ink-3">This application is already in our review queue.</p> : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Button asChild variant="signal" size="lg"><Link href="/login">Sign in <ArrowRight /></Link></Button>
        <Button asChild variant="secondary" size="lg"><Link href="/">Return home</Link></Button>
      </div>
      <p className="mt-5 text-[11px] text-ink-3">Gym accounts are created and issued by RIVET after approval.</p>
    </div>
  );
}
