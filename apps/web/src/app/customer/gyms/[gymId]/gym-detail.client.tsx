"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarCheck, Check, Clock, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { GymMark } from "@/components/public/gym-mark";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { isTimeInTrialWindow, trialWindowForDate } from "@/lib/public/trial-schedule";
import { formatMoney, money } from "@/lib/utils/money";

const trialSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(8, "Enter a valid phone number"),
  branchId: z.string().min(1, "Choose a branch"),
  preferredDate: z.string().min(1, "Choose a date"),
  preferredTime: z.string().min(1, "Choose a time"),
  goal: z.string().min(4, "Tell the gym what you want from your trial"),
});
type TrialValues = z.infer<typeof trialSchema>;

const SELECT_CLASS = "h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] sm:h-9";
const DEFAULT_GOAL = "Try the gym and discuss the right membership";

export function resolveRequestedBranchId(search: string, branchIds: readonly string[]): string | undefined {
  const candidate = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("branchId");
  return candidate && branchIds.includes(candidate) ? candidate : undefined;
}

export default function GymDetailClient({ gymId }: { gymId: string }) {
  const gyms = useMarketplaceGyms();
  const gym = gyms.find((item) => item.id === gymId);
  const customer = useCustomerPersona();
  const { bookTrial, customerSignedIn, experienceError, experienceStatus, previewSessionReady, retryExperience } = useExperience();
  const router = useRouter();
  const searchParams = useSearchParams();
  const referralToken = searchParams.get("ref")?.trim() || undefined;
  const [booked, setBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const trialRequestKeyRef = useRef<string | undefined>(undefined);
  const defaultDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toISOString().slice(0, 10);
  }, []);

  // The bundled preview gym is available on the first render, while Convex
  // gyms can arrive after hydration. Track the identity of the defaults we
  // actually initialized so background snapshot refreshes do not erase a
  // visitor's in-progress form with an equivalent gym/customer object.
  const formContextKey = gym ? `${gym.id}:${customer?.id ?? "guest"}` : "unavailable";
  const initializedFormContextRef = useRef(formContextKey);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, dirtyFields } } = useForm<TrialValues>({
    resolver: zodResolver(trialSchema),
    defaultValues: {
      fullName: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      branchId: "",
      preferredDate: defaultDate,
      preferredTime: "",
      goal: DEFAULT_GOAL,
    },
  });

  const branchQueryAppliedRef = useRef(false);
  useEffect(() => {
    if (branchQueryAppliedRef.current || !gym || typeof window === "undefined") return;
    branchQueryAppliedRef.current = true;
    const requestedBranchId = resolveRequestedBranchId(window.location.search, gym.branches.map((branch) => branch.id));
    if (requestedBranchId) setValue("branchId", requestedBranchId, { shouldDirty: false, shouldValidate: true });
  }, [gym, setValue]);

  useEffect(() => {
    if (!gym) return;
    if (initializedFormContextRef.current === formContextKey) return;
    initializedFormContextRef.current = formContextKey;
    reset({
      fullName: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      branchId: "",
      preferredDate: defaultDate,
      preferredTime: "",
      goal: DEFAULT_GOAL,
    }, {
      // If identity or asynchronously loaded gym defaults change after the
      // visitor starts typing, retain their explicit input and refresh only
      // untouched fields. Subscribing to dirtyFields is required by RHF for
      // keepDirtyValues to preserve the correct controls.
      keepDirtyValues: Object.keys(dirtyFields).length > 0,
    });
  }, [customer, defaultDate, dirtyFields, formContextKey, gym, reset]);

  const selectedBranchId = watch("branchId");
  const selectedDate = watch("preferredDate");
  const selectedTime = watch("preferredTime");
  const selectedBranch = gym?.branches.find((branch) => branch.id === selectedBranchId);
  const availableTrialWindow = useMemo(() => trialWindowForDate(selectedBranch, selectedDate), [selectedBranch, selectedDate]);

  useEffect(() => {
    if (isTimeInTrialWindow(selectedBranch, selectedDate, selectedTime)) return;
    setValue("preferredTime", availableTrialWindow?.opensAt ?? "", { shouldDirty: Boolean(selectedTime), shouldValidate: Boolean(selectedTime) });
  }, [availableTrialWindow, selectedBranch, selectedDate, selectedTime, setValue]);

  // The preview session is restored in a client effect. Do not expose the
  // server-rendered form before hydration, because a fast visitor (or assistive
  // automation) could type into DOM that React is about to reconcile with the
  // restored customer defaults.
  if (!previewSessionReady) return <main className="px-5 py-20 text-center"><p role="status" className="text-[13px] text-ink-3">Loading booking form…</p></main>;
  if (experienceStatus !== "ready") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <ExperienceDataState
          status={experienceStatus}
          error={experienceError}
          onRetry={retryExperience}
          emptyTitle="Gym not found"
          emptyDescription="This gym is not currently available in the RIVET network."
        />
      </main>
    );
  }
  if (!gym) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Gym not found</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">This gym is not currently available in the RIVET network.</p>
        <Button asChild className="mt-5"><Link href="/customer/discover">Back to all gyms</Link></Button>
      </main>
    );
  }
  const confirmedBranch = selectedBranch;
  const returnParams = new URLSearchParams();
  if (selectedBranch) returnParams.set("branchId", selectedBranch.id);
  if (referralToken) returnParams.set("ref", referralToken);
  const memberReturnTo = `/customer/gyms/${gym.id}${returnParams.size ? `?${returnParams.toString()}` : ""}`;
  const memberSignupHref = `/login/member/create?returnTo=${encodeURIComponent(memberReturnTo)}`;
  const cover = gym.cover?.url;
  const trainerCount = gym.trainers?.length ?? 0;

  const submit = handleSubmit(async (values) => {
    if (isConvexMode() && !customerSignedIn) {
      // Do not submit a trial as a browser-only visitor in production. Send
      // the visitor through the real member signup while retaining only the
      // public gym/branch path; the signup page validates it again.
      router.push(memberSignupHref);
      return;
    }
    setSubmitting(true);
    try {
      const idempotencyKey = trialRequestKeyRef.current ?? (trialRequestKeyRef.current = crypto.randomUUID());
      await bookTrial({ gymId: gym.id, ...values, idempotencyKey, referralToken });
      trialRequestKeyRef.current = undefined;
      setBooked(true);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/discover" className="inline-flex min-h-8 items-center gap-1.5 rounded-xs text-[13px] text-ink-3 transition-colors hover:text-ink"><ArrowLeft className="size-3.5" aria-hidden /> All gyms</Link>

      {cover ? <div className="mt-4 h-40 overflow-hidden rounded-lg border border-line bg-cover bg-center sm:h-56" role="img" aria-label={`${gym.name} cover image`} style={{ backgroundImage: `url(${cover})` }} /> : null}

      <header className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <GymMark name={gym.name} shortName={gym.shortName} logoUrl={gym.logo?.url} accent={gym.accent} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink-3">{gym.category} · {gym.city}</p>
          <h1 className="mt-0.5 font-display text-[26px] font-semibold leading-tight tracking-tight">{gym.name}</h1>
        </div>
        {!booked ? <Button asChild className="w-full sm:w-auto lg:hidden"><a href="#book-trial"><CalendarCheck /> Book a free trial</a></Button> : null}
      </header>
      {gym.tagline ? <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">{gym.tagline}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <GymFact label="Branches" value={String(gym.branchCount)} />
        <GymFact label="Members" value={gym.memberCount.toLocaleString()} />
        <GymFact label="PT trainers" value={String(trainerCount)} />
        <GymFact label="From" value={gym.fromPriceMinor > 0 ? `${formatMoney(money(gym.fromPriceMinor))} / month` : "Ask the gym"} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="space-y-6">
          {gym.description ? (
            <section aria-labelledby="gym-about-title">
              <h2 id="gym-about-title" className="text-[17px] font-semibold">About {gym.name}</h2>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">{gym.description}</p>
            </section>
          ) : null}

          <section>
            <h2 className="text-[17px] font-semibold">Branches</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {gym.branches.map((branch) => (
                <div key={branch.id} className="panel p-4">
                  <h3 className="text-[14px] font-semibold">{branch.name}</h3>
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden /> {branch.address}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3"><Clock className="size-3.5 shrink-0" aria-hidden /> {branch.trialSchedule ? "Trial times available by date" : "Trial hours not set yet. Contact the gym."}</p>
                </div>
              ))}
            </div>
          </section>

          {gym.amenities.length ? (
            <section aria-labelledby="gym-amenities-title">
              <h2 id="gym-amenities-title" className="text-[17px] font-semibold">What&apos;s inside</h2>
              <div className="mt-3 flex flex-wrap gap-2">{gym.amenities.map((amenity) => <Badge key={amenity} variant="neutral" className="px-2.5 py-1 text-[12.5px]">{amenity}</Badge>)}</div>
            </section>
          ) : null}

          {gym.plans?.length ? (
            <section aria-labelledby="gym-plans-title">
              <h2 id="gym-plans-title" className="text-[17px] font-semibold">Membership plans</h2>
              <div className="panel mt-3 divide-y divide-line overflow-hidden">
                {gym.plans.map((plan) => (
                  <article key={plan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{plan.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {plan.kind === "time" ? `${plan.durationDays ?? 0} days` : `${plan.visitAllowance ?? 0} visits${plan.visitValidityDays ? ` · valid ${plan.visitValidityDays} days` : ""}`}
                        {" · "}{plan.branchAccess === "all" ? "All branches" : `${plan.branchIds.length} selected branch${plan.branchIds.length === 1 ? "" : "es"}`}
                        {plan.includedPtSessions > 0 ? ` · includes ${plan.includedPtSessions} PT session${plan.includedPtSessions === 1 ? "" : "s"}` : ""}
                      </p>
                    </div>
                    <MoneyText money={plan.basePrice} className="text-[15px] font-semibold" />
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {gym.trainers?.length ? (
            <section aria-labelledby="gym-trainers-title">
              <h2 id="gym-trainers-title" className="text-[17px] font-semibold">Personal trainers</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {gym.trainers.map((trainer) => (
                  <article key={trainer.id} className="panel flex gap-3 p-4">
                    {trainer.photoUrl ? (
                      <div role="img" aria-label={trainer.photoAlt ?? `${trainer.displayName} profile photo`} className="size-14 shrink-0 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${trainer.photoUrl})` }} />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sunken text-[15px] font-semibold text-ink-2" aria-hidden>{trainer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{trainer.displayName}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">{trainer.specialties.join(" · ") || "Personal training"}</p>
                      {trainer.bioEn ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{trainer.bioEn}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {gym.gallery?.length ? (
            <section aria-labelledby="gym-gallery-title">
              <h2 id="gym-gallery-title" className="text-[17px] font-semibold">Gallery</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {gym.gallery.map((asset) => <div key={asset.id} role="img" aria-label={asset.altText ?? "Gym gallery image"} className="aspect-[4/3] rounded-md bg-sunken bg-cover bg-center" style={{ backgroundImage: asset.url ? `url(${asset.url})` : undefined }} />)}
              </div>
            </section>
          ) : null}

          {gym.ptPackages?.length ? (
            <section aria-labelledby="gym-packages-title">
              <h2 id="gym-packages-title" className="text-[17px] font-semibold">PT packages</h2>
              <div className="panel mt-3 divide-y divide-line overflow-hidden">
                {gym.ptPackages.map((item) => (
                  <article key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{item.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">{item.sessionCount} sessions · valid {item.validityDays} days</p>
                    </div>
                    <MoneyText money={item.totalPrice} className="text-[15px] font-semibold" />
                  </article>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">An active membership is required to book. Package credits activate after the gym records full payment.</p>
            </section>
          ) : null}

          <p className="border-t border-line pt-4 text-[12.5px] text-ink-3">A verified RIVET gym · {gym.memberCount.toLocaleString()} active member records · {trainerCount} published PT trainer{trainerCount === 1 ? "" : "s"}</p>
        </div>

        <aside id="book-trial" className="panel h-fit scroll-mt-24 p-4 sm:p-5 lg:sticky lg:top-24" aria-labelledby="book-trial-title">
          {booked ? (
            <div className="py-3 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg text-success-deep"><Check className="size-6" aria-hidden /></span>
              <p className="mt-4 text-[12px] font-medium text-ink-3">Sent to {gym.name}</p>
              <h2 id="book-trial-title" className="mt-1 text-[20px] font-semibold leading-tight">Your free trial request is recorded.</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">The request is now in the gym&rsquo;s follow-ups. The team can review it and record the outcome.</p>
              <div className="mt-4 rounded-md border border-line bg-sunken p-3 text-start">
                <p className="text-[13.5px] font-medium">{confirmedBranch?.name ?? "Selected branch"}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{referralToken ? "The member referral is attached to this request. The reward is considered only after your first membership is sold." : customerSignedIn ? "Your request is saved under My Gyms." : "Sign in or create a member account to keep future bookings under your name."}</p>
              </div>
              <Button asChild className="mt-4 w-full"><Link href={customerSignedIn ? "/customer/my-gyms" : "/login"}>{customerSignedIn ? "Open My Gyms" : "Sign in to RIVET"}</Link></Button>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-medium text-ink-3">Free first visit</p>
              <h2 id="book-trial-title" className="mt-0.5 text-[20px] font-semibold leading-tight">Book a trial at {gym.shortName}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">No payment required. Choose a branch and a time; the gym confirms.</p>
              {!customerSignedIn ? (
                <p className="mt-4 rounded-md border border-line bg-sunken px-3 py-2.5 text-[12.5px] text-ink-2">
                  You can fill this in now. <Link href={memberSignupHref} className="font-semibold text-ink underline underline-offset-4">Sign in or create a free account</Link> to keep it under your name.
                </p>
              ) : null}
              <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
                <Field label="Full name" htmlFor="trial-name" error={errors.fullName?.message}>
                  <Input id="trial-name" className="h-11 sm:h-9" autoComplete="name" aria-invalid={Boolean(errors.fullName) || undefined} {...register("fullName")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Field label="Phone" htmlFor="trial-phone" error={errors.phone?.message}>
                    <Input id="trial-phone" type="tel" inputMode="tel" autoComplete="tel" className="h-11 sm:h-9" aria-invalid={Boolean(errors.phone) || undefined} {...register("phone")} />
                  </Field>
                  <Field label="Email" htmlFor="trial-email" error={errors.email?.message}>
                    <Input id="trial-email" type="email" inputMode="email" autoComplete="email" className="h-11 sm:h-9" aria-invalid={Boolean(errors.email) || undefined} {...register("email")} />
                  </Field>
                </div>
                <Field label="Branch" htmlFor="trial-branch" error={errors.branchId?.message}>
                  <select id="trial-branch" className={SELECT_CLASS} aria-invalid={Boolean(errors.branchId) || undefined} {...register("branchId")}>
                    <option value="">Choose branch</option>
                    {gym.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Preferred date" htmlFor="trial-date" error={errors.preferredDate?.message}>
                    <Input id="trial-date" type="date" className="h-11 sm:h-9" min={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(errors.preferredDate) || undefined} {...register("preferredDate")} />
                  </Field>
                  <Field label="Time" htmlFor="trial-time" error={errors.preferredTime?.message}>
                    <Input id="trial-time" type="time" className="h-11 sm:h-9" min={availableTrialWindow?.opensAt} max={availableTrialWindow?.closesAt} disabled={!availableTrialWindow} aria-invalid={Boolean(errors.preferredTime) || undefined} {...register("preferredTime")} />
                  </Field>
                </div>
                {availableTrialWindow ? (
                  <p role="status" className="text-[12.5px] text-ink-2">Choose any time from {availableTrialWindow.opensAt} to {availableTrialWindow.closesAt}. The gym will confirm your request.</p>
                ) : (
                  <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[12.5px] text-ink-2">{selectedBranch?.trialSchedule ? "This branch is closed for trial requests on the selected date. Choose another date." : selectedBranch ? "This branch has not set online trial hours yet. Contact the gym directly." : "Choose a branch to see its trial hours."}</p>
                )}
                <Field label="What are you looking for?" htmlFor="trial-goal" error={errors.goal?.message}>
                  <Textarea id="trial-goal" aria-invalid={Boolean(errors.goal) || undefined} {...register("goal")} />
                </Field>
                <Button type="submit" variant="signal" size="lg" className="w-full" loading={submitting} disabled={!selectedBranch || !availableTrialWindow}><CalendarCheck /> Send trial request</Button>
              </form>
              <p className="mt-3 text-center text-[12.5px] text-ink-3">The gym controls confirmation and follow-up.</p>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

function GymFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-surface p-3 sm:p-4">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold tabular text-ink">{value}</dd>
    </div>
  );
}
