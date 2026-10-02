"use client";
import { publicProfileLabel } from "@/lib/i18n/public-profile";
import { latinDigits } from "@/lib/utils/text";
import { localizeApiError, isApiError } from "@/lib/api/errors";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { isolate } from "@/lib/i18n/bidi";
import { useT } from "@/lib/i18n/provider";

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
import { money } from "@/lib/utils/money";

const trialSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().transform(latinDigits).pipe(z.string().min(8, "Enter a valid phone number")),
  branchId: z.string().min(1, "Choose a branch"),
  preferredDate: z.string().min(1, "Choose a date"),
  preferredTime: z.string().min(1, "Choose a time"),
  goal: z.string().min(4, "Tell the gym what you want from your trial"),
});
type TrialValues = z.infer<typeof trialSchema>;

const SELECT_CLASS = "h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] sm:h-9";


export function resolveRequestedBranchId(search: string, branchIds: readonly string[]): string | undefined {
  const candidate = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("branchId");
  return candidate && branchIds.includes(candidate) ? candidate : undefined;
}

export default function GymDetailClient({ gymId }: { gymId: string }) {
  const { locale } = useLocale();
  const f = useFormat();
  const [submitError, setSubmitError] = useState<unknown>();
  const t = useT();
  const defaultGoal = t("customerPortal.trialDefaultGoal");
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
      goal: defaultGoal,
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
      goal: defaultGoal,
    }, {
      // If identity or asynchronously loaded gym defaults change after the
      // visitor starts typing, retain their explicit input and refresh only
      // untouched fields. Subscribing to dirtyFields is required by RHF for
      // keepDirtyValues to preserve the correct controls.
      keepDirtyValues: Object.keys(dirtyFields).length > 0,
    });
  }, [customer, defaultDate, defaultGoal, dirtyFields, formContextKey, gym, reset]);

  useEffect(() => {
    if (!dirtyFields.goal) setValue("goal", defaultGoal, { shouldDirty: false });
  }, [defaultGoal, dirtyFields.goal, setValue]);

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
  if (!previewSessionReady) return <main className="px-5 py-20 text-center"><p role="status" className="text-[13px] text-ink-3">{t("customerPortal.loadingTrial")}</p></main>;
  if (experienceStatus !== "ready") {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20">
        <ExperienceDataState
          status={experienceStatus}
          error={experienceError}
          onRetry={retryExperience}
          emptyTitle={t("customerPortal.gymNotFound")}
          emptyDescription={t("customerPortal.gymUnavailable")}
        />
      </main>
    );
  }
  if (!gym) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">{t("customerPortal.gymNotFound")}</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">{t("customerPortal.gymUnavailable")}</p>
        <Button asChild className="mt-5"><Link href="/customer/discover">{t("customerPortal.backGyms")}</Link></Button>
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
    setSubmitError(undefined);
    try {
      const idempotencyKey = trialRequestKeyRef.current ?? (trialRequestKeyRef.current = crypto.randomUUID());
      await bookTrial({ gymId: gym.id, ...values, idempotencyKey, referralToken });
      trialRequestKeyRef.current = undefined;
      setBooked(true);
    } catch (error) {
      setSubmitError(error);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/discover" className="inline-flex min-h-8 items-center gap-1.5 rounded-xs text-[13px] text-ink-3 transition-colors hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden /> {" "}{t("customerPortal.allGyms")}</Link>

      {cover ? <div className="mt-4 h-40 overflow-hidden rounded-lg border border-line bg-cover bg-center sm:h-56" role="img" aria-label={t("customerPortal.coverAlt", { gym: locale === "ar" ? isolate(gym.name) : gym.name })} style={{ backgroundImage: `url(${cover})` }} /> : null}

      <header className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <GymMark name={gym.name} shortName={gym.shortName} logoUrl={gym.logo?.url} accent={gym.accent} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink-3">{publicProfileLabel(t, gym.category)} · {gym.city}</p>
          <h1 className="mt-0.5 font-display text-[26px] font-semibold leading-tight tracking-tight">{gym.name}</h1>
        </div>
        {!booked ? <Button asChild className="w-full sm:w-auto lg:hidden"><a href="#book-trial"><CalendarCheck /> {" "}{t("customerPortal.bookFreeTrial")}</a></Button> : null}
      </header>
      {gym.tagline ? <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-2">{locale === "ar" ? gym.taglineAr || gym.tagline : gym.tagline}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <GymFact label={t("customerPortal.branches")} value={String(gym.branchCount)} />
        <GymFact label={t("palette.groups.members")} value={f.number(gym.memberCount)} />
        <GymFact label={t("customerPortal.ptTrainers")} value={String(trainerCount)} />
        <GymFact label={t("common.label.from")} value={gym.fromPriceMinor > 0 ? t("customerPortal.monthlyPrice", { amount: f.money(money(gym.fromPriceMinor)) }) : t("customerPortal.askGym")} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="space-y-6">
          {gym.description ? (
            <section aria-labelledby="gym-about-title">
              <h2 id="gym-about-title" className="text-[17px] font-semibold">{t("customerPortal.aboutGym", { gym: locale === "ar" ? isolate(gym.name) : gym.name })}</h2>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-2">{locale === "ar" ? gym.descriptionAr || gym.description : gym.description}</p>
            </section>
          ) : null}

          <section>
            <h2 className="text-[17px] font-semibold">{t("customerPortal.branches")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {gym.branches.map((branch) => (
                <div key={branch.id} className="panel p-4">
                  <h3 className="text-[14px] font-semibold">{branch.name}</h3>
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden /> {branch.address}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-3"><Clock className="size-3.5 shrink-0" aria-hidden /> {branch.trialSchedule ? t("customerPortal.trialAvailable") : t("customerPortal.trialNotConfigured")}</p>
                </div>
              ))}
            </div>
          </section>

          {gym.amenities.length ? (
            <section aria-labelledby="gym-amenities-title">
              <h2 id="gym-amenities-title" className="text-[17px] font-semibold">{t("customerPortal.amenities")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">{gym.amenities.map((amenity) => <Badge key={amenity} variant="neutral" className="px-2.5 py-1 text-[12.5px]">{publicProfileLabel(t, amenity)}</Badge>)}</div>
            </section>
          ) : null}

          {gym.plans?.length ? (
            <section aria-labelledby="gym-plans-title">
              <h2 id="gym-plans-title" className="text-[17px] font-semibold">{t("customerPortal.membershipPlans")}</h2>
              <div className="panel mt-3 divide-y divide-line overflow-hidden">
                {gym.plans.map((plan) => (
                  <article key={plan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{plan.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">
                        {plan.kind === "time" ? t("customerPortal.days", { count: plan.durationDays ?? 0 }) : `${t("customerPortal.visits", { count: plan.visitAllowance ?? 0 })}${plan.visitValidityDays ? ` · ${t("customerPortal.useWithin", { days: t("customerPortal.days", { count: plan.visitValidityDays }) })}` : ""}`}
                        {" · "}{plan.branchAccess === "all" ? t("common.label.allBranches") : t("customerPortal.branchCount", { count: plan.branchIds.length })}
                        {plan.includedPtSessions > 0 ? ` · ${t("customerPortal.includesPt", { sessions: t("customerPortal.ptSessions", { count: plan.includedPtSessions }) })}` : ""}
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
              <h2 id="gym-trainers-title" className="text-[17px] font-semibold">{t("customerPortal.personalTrainers")}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {gym.trainers.map((trainer) => (
                  <article key={trainer.id} className="panel flex gap-3 p-4">
                    {trainer.photoUrl ? (
                      <div role="img" aria-label={trainer.photoAlt ?? t("customerPortal.trainerAlt", { name: locale === "ar" ? isolate(trainer.displayName) : trainer.displayName })} className="size-14 shrink-0 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${trainer.photoUrl})` }} />
                    ) : (
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sunken text-[15px] font-semibold text-ink-2" aria-hidden>{trainer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{trainer.displayName}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">{trainer.specialties.join(" · ") || t("customerPortal.personalTraining")}</p>
                      {(trainer.bioEn || trainer.bioAr) ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{locale === "ar" ? trainer.bioAr || trainer.bioEn : trainer.bioEn || trainer.bioAr}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {gym.gallery?.length ? (
            <section aria-labelledby="gym-gallery-title">
              <h2 id="gym-gallery-title" className="text-[17px] font-semibold">{t("customerPortal.gallery")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {gym.gallery.map((asset) => <div key={asset.id} role="img" aria-label={asset.altText ?? t("customerPortal.galleryAlt")} className="aspect-[4/3] rounded-md bg-sunken bg-cover bg-center" style={{ backgroundImage: asset.url ? `url(${asset.url})` : undefined }} />)}
              </div>
            </section>
          ) : null}

          {gym.ptPackages?.length ? (
            <section aria-labelledby="gym-packages-title">
              <h2 id="gym-packages-title" className="text-[17px] font-semibold">{t("memberProfile.pt.packages")}</h2>
              <div className="panel mt-3 divide-y divide-line overflow-hidden">
                {gym.ptPackages.map((item) => (
                  <article key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-[14px] font-semibold">{item.name}</h3>
                      <p className="mt-0.5 text-[12.5px] text-ink-3">{t("customerPortal.sessions", { count: item.sessionCount })}{" · "}{t("customerPortal.useWithin", { days: t("customerPortal.days", { count: item.validityDays }) })}</p>
                    </div>
                    <MoneyText money={item.totalPrice} className="text-[15px] font-semibold" />
                  </article>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">{t("customerPortal.ptPaymentRequired")}</p>
            </section>
          ) : null}

          <p className="border-t border-line pt-4 text-[12.5px] text-ink-3">{t("customerPortal.verifiedGym")}{" · "}{f.number(gym.memberCount)} {t("customerPortal.activeMembers")}{" · "}{trainerCount} {t("customerPortal.ptTrainers")}</p>
        </div>

        <aside id="book-trial" className="panel h-fit scroll-mt-24 p-4 sm:p-5 lg:sticky lg:top-24" aria-labelledby="book-trial-title">
          {booked ? (
            <div className="py-3 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-bg text-success-deep"><Check className="size-6" aria-hidden /></span>
              <p className="mt-4 text-[12px] font-medium text-ink-3">{t("customerPortal.sentTo", { gym: locale === "ar" ? isolate(gym.name) : gym.name })}</p>
              <h2 id="book-trial-title" className="mt-1 text-[20px] font-semibold leading-tight">{t("customerPortal.trialRecorded")}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{t("customerPortal.trialReview")}</p>
              <div className="mt-4 rounded-md border border-line bg-sunken p-3 text-start">
                <p className="text-[13.5px] font-medium">{confirmedBranch?.name ?? t("customerPortal.selectedBranch")}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{referralToken ? t("customerPortal.trialReferral") : customerSignedIn ? t("customerPortal.trialContactSaved") : t("customerPortal.trialSignIn")}</p>
              </div>
              <Button asChild className="mt-4 w-full"><Link href={customerSignedIn ? "/customer/my-gyms" : "/login/member"}>{customerSignedIn ? t("customerPortal.openGyms") : t("common.action.signIn")}</Link></Button>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-medium text-ink-3">{t("customerPortal.freeFirstVisit")}</p>
              <h2 id="book-trial-title" className="mt-0.5 text-[20px] font-semibold leading-tight">{t("customerPortal.trialAt", { gym: locale === "ar" ? isolate(gym.shortName) : gym.shortName })}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{t("customerPortal.trialInstructions")}</p>
              {!customerSignedIn ? (
                <p className="mt-4 rounded-md border border-line bg-sunken px-3 py-2.5 text-[12.5px] text-ink-2">
                  {" "}{t("customerPortal.trialFillNow")}{" "}<Link href={memberSignupHref} className="font-semibold text-ink underline underline-offset-4">{t("customerPortal.trialCreateAccount")}</Link> {" "}{t("customerPortal.trialKeepName")}{" "}</p>
              ) : null}
              <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
                <Field label={t("common.label.fullName")} htmlFor="trial-name" error={errors.fullName ? t("customerPortal.fullName") : undefined}>
                  <Input dir="auto" id="trial-name" className="h-11 sm:h-9" autoComplete="name" aria-invalid={Boolean(errors.fullName) || undefined} {...register("fullName")} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Field label={t("common.label.phone")} htmlFor="trial-phone" error={errors.phone ? t("customerPortal.validPhone") : undefined}>
                    <Input dir="ltr" id="trial-phone" type="tel" inputMode="tel" autoComplete="tel" className="h-11 sm:h-9" aria-invalid={Boolean(errors.phone) || undefined} {...register("phone")} />
                  </Field>
                  <Field label={t("common.label.email")} htmlFor="trial-email" error={errors.email ? t("customerPortal.validEmail") : undefined}>
                    <Input dir="ltr" id="trial-email" type="email" inputMode="email" autoComplete="email" className="h-11 sm:h-9" aria-invalid={Boolean(errors.email) || undefined} {...register("email")} />
                  </Field>
                </div>
                <Field label={t("common.label.branch")} htmlFor="trial-branch" error={errors.branchId ? t("customerPortal.chooseBranch") : undefined}>
                  <select id="trial-branch" className={SELECT_CLASS} aria-invalid={Boolean(errors.branchId) || undefined} {...register("branchId")}>
                    <option value="">{t("members.bulk.chooseBranch")}</option>
                    {gym.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t("customerPortal.preferredDate")} htmlFor="trial-date" error={errors.preferredDate ? t("customerPortal.chooseDate") : undefined}>
                    <Input id="trial-date" type="date" className="h-11 sm:h-9" min={new Date().toISOString().slice(0, 10)} aria-invalid={Boolean(errors.preferredDate) || undefined} {...register("preferredDate")} />
                  </Field>
                  <Field label={t("common.label.time")} htmlFor="trial-time" error={errors.preferredTime ? t("customerPortal.chooseTime") : undefined}>
                    <Input id="trial-time" type="time" className="h-11 sm:h-9" min={availableTrialWindow?.opensAt} max={availableTrialWindow?.closesAt} disabled={!availableTrialWindow} aria-invalid={Boolean(errors.preferredTime) || undefined} {...register("preferredTime")} />
                  </Field>
                </div>
                {availableTrialWindow ? (
                  <p role="status" className="text-[12.5px] text-ink-2">{t("customerPortal.trialWindow", { from: f.clock(availableTrialWindow.opensAt), to: f.clock(availableTrialWindow.closesAt) })}</p>
                ) : (
                  <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[12.5px] text-ink-2">{selectedBranch?.trialSchedule ? t("customerPortal.trialNoTimes") : selectedBranch ? t("customerPortal.trialNoOnline") : t("customerPortal.trialChooseBranch")}</p>
                )}
                <Field label={t("customerPortal.trialGoal")} htmlFor="trial-goal" error={errors.goal ? t("customerPortal.trialGoalRequired") : undefined}>
                  <Textarea dir="auto" id="trial-goal" aria-invalid={Boolean(errors.goal) || undefined} {...register("goal")} />
                </Field>
                {submitError ? <p role="alert" className="text-[13px] text-danger">{isApiError(submitError) ? localizeApiError(submitError, locale).message : t("apiErrors.unexpected")}</p> : null}
                <Button type="submit" variant="signal" size="lg" className="w-full" loading={submitting} disabled={!selectedBranch || !availableTrialWindow}><CalendarCheck /> {" "}{t("customerPortal.sendTrial")}</Button>
              </form>
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
