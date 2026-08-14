"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarCheck, Check, Clock, Dumbbell, MapPin, ShieldCheck, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { isTimeInTrialWindow, trialWindowForDate } from "@/lib/public/trial-schedule";

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

export default function GymDetailClient({ gymId }: { gymId: string }) {
  const gyms = useMarketplaceGyms();
  const gym = gyms.find((item) => item.id === gymId);
  const customer = useCustomerPersona();
  const { bookTrial, customerSignedIn, previewSessionReady } = useExperience();
  const router = useRouter();
  const [booked, setBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      branchId: gym?.branches[0]?.id ?? "",
      preferredDate: defaultDate,
      preferredTime: trialWindowForDate(gym?.branches[0], defaultDate)?.opensAt ?? "",
      goal: "Try the gym and discuss the right membership",
    },
  });

  useEffect(() => {
    if (!gym) return;
    if (initializedFormContextRef.current === formContextKey) return;
    initializedFormContextRef.current = formContextKey;
    reset({
      fullName: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      branchId: gym.branches[0]?.id ?? "",
      preferredDate: defaultDate,
      preferredTime: trialWindowForDate(gym.branches[0], defaultDate)?.opensAt ?? "",
      goal: "Try the gym and discuss the right membership",
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
  const selectedBranch = gym?.branches.find((branch) => branch.id === selectedBranchId) ?? gym?.branches[0];
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
  if (!gym) return <main className="px-5 py-20 text-center"><h1 className="text-[26px] font-semibold">Gym not found</h1><Button asChild className="mt-5"><Link href="/customer/discover">Back to discovery</Link></Button></main>;
  const confirmedBranch = selectedBranch ?? gym.branches[0]!;

  const submit = handleSubmit(async (values) => {
    if (isConvexMode() && !customerSignedIn) {
      router.push("/login");
      return;
    }
    setSubmitting(true);
    try {
      await bookTrial({ gymId: gym.id, ...values });
      setBooked(true);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main>
      <section className="relative overflow-hidden bg-cover bg-center px-5 py-14 text-white sm:px-8 lg:px-12 lg:py-20" style={{ backgroundColor: gym.accent, backgroundImage: gym.cover?.url ? `linear-gradient(rgb(0 0 0 / .58), rgb(0 0 0 / .58)), url(${gym.cover.url})` : undefined }}>
        <div className="absolute inset-0 opacity-20 marketing-grid" />
        <div className="relative mx-auto max-w-[1344px]">
          <Link href="/customer/discover" className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/75 hover:text-white"><ArrowLeft className="size-3.5" /> All gyms</Link>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr] lg:items-end">
            <div><div className="flex items-center gap-3"><span className="size-12 rounded-full border border-white/50 bg-cover bg-center" role="img" aria-label={`${gym.name} logo`} style={{ backgroundColor: gym.accent, backgroundImage: gym.logo?.url ? `url(${gym.logo.url})` : undefined }} /> <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">{gym.category} · {gym.city}</p></div><h1 className="marketing-display mt-4 max-w-5xl text-[clamp(4rem,8vw,8rem)] leading-[0.87]">{gym.name}</h1><p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-white/85">{gym.tagline}</p></div>
            <dl className="grid grid-cols-2 gap-px bg-white/25"><GymStat label="Branches" value={String(gym.branchCount)} /><GymStat label="Members" value={gym.memberCount.toLocaleString()} /><GymStat label="PT trainers" value={String(gym.trainers?.length ?? 0)} /><GymStat label="From" value={gym.fromPriceMinor > 0 ? `JD ${gym.fromPriceMinor / 1000}` : "Contact gym"} /></dl>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto grid max-w-[1344px] gap-10 lg:grid-cols-[1fr_430px]">
          <div>
            <p className="eyebrow">About the club</p><h2 className="mt-3 text-[30px] font-semibold tracking-tight">Train somewhere built for consistency.</h2><p className="mt-5 max-w-3xl text-[15px] leading-[1.75] text-ink-2">{gym.description}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {gym.branches.map((branch) => <div key={branch.id} className="border border-line bg-surface p-5"><MapPin className="size-5 text-signal" /><h3 className="mt-5 text-[17px] font-semibold">{branch.name}</h3><p className="mt-2 text-[12px] leading-relaxed text-ink-3">{branch.address}</p><p className="mt-4 font-mono text-[9px] uppercase tracking-[0.13em] text-ink-3">{branch.trialSchedule ? "Trial request hours available by date" : "Trial scheduling not configured"}</p></div>)}
            </div>
            <div className="mt-10"><p className="eyebrow">What is inside</p><div className="mt-4 flex flex-wrap gap-2">{gym.amenities.map((amenity) => <span key={amenity} className="border border-line bg-sunken px-3 py-2 text-[12px] text-ink-2">{amenity}</span>)}</div></div>
            {gym.plans?.length ? <div className="mt-10"><p className="eyebrow">Membership plans</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{gym.plans.map((plan) => <article key={plan.id} className="border border-line bg-surface p-5"><h3 className="text-[16px] font-semibold">{plan.name}</h3><p className="mt-2 text-[12px] text-ink-3">{plan.kind === "time" ? `${plan.durationDays ?? 0} days` : `${plan.visitAllowance ?? 0} visits${plan.visitValidityDays ? ` · valid ${plan.visitValidityDays} days` : ""}`} · {plan.branchAccess === "all" ? "All branches" : `${plan.branchIds.length} selected branch${plan.branchIds.length === 1 ? "" : "es"}`}</p>{plan.includedPtSessions > 0 ? <p className="mt-2 text-[11px] text-ink-3">Includes {plan.includedPtSessions} PT session{plan.includedPtSessions === 1 ? "" : "s"}</p> : null}<p className="mt-4 text-[17px] font-semibold">{plan.basePrice.currency} {(plan.basePrice.amount / 1000).toFixed(3)}</p></article>)}</div></div> : null}
            {gym.trainers?.length ? <div className="mt-10"><p className="eyebrow">Personal trainers</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{gym.trainers.map((trainer) => <article key={trainer.id} className="border border-line bg-surface p-5">{trainer.photoUrl ? <div role="img" aria-label={trainer.photoAlt ?? `${trainer.displayName} profile photo`} className="size-16 rounded-full bg-cover bg-center" style={{ backgroundImage: `url(${trainer.photoUrl})` }} /> : <div className="flex size-10 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-paper">{trainer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2)}</div>}<h3 className="mt-4 text-[16px] font-semibold">{trainer.displayName}</h3>{trainer.bioEn ? <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{trainer.bioEn}</p> : null}<p className="mt-3 text-[10.5px] text-ink-3">{trainer.specialties.join(" · ") || "Personal training"}</p></article>)}</div></div> : null}
            {gym.gallery?.length ? <div className="mt-10"><p className="eyebrow">Gym gallery</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{gym.gallery.map((asset) => <div key={asset.id} role="img" aria-label={asset.altText ?? "Gym gallery image"} className="aspect-[4/3] bg-sunken bg-cover bg-center" style={{ backgroundImage: asset.url ? `url(${asset.url})` : undefined }} />)}</div></div> : null}
            {gym.ptPackages?.length ? <div className="mt-10"><p className="eyebrow">PT packages</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{gym.ptPackages.map((item) => <article key={item.id} className="border border-line bg-surface p-4"><Ticket className="size-4 text-signal" /><h3 className="mt-3 text-[14px] font-semibold">{item.name}</h3><p className="mt-1 text-[11px] text-ink-3">{item.sessionCount} sessions · {item.validityDays} days</p><p className="mt-3 text-[15px] font-semibold">{item.totalPrice.currency} {(item.totalPrice.amount / 1000).toFixed(3)}</p></article>)}</div><p className="mt-3 text-[11px] text-ink-3">An active membership is required to book. Package credits activate after the gym records full payment.</p></div> : null}
            <div className="mt-10 grid gap-4 sm:grid-cols-3"><Proof icon={<Users />} value={gym.memberCount.toLocaleString()} label="active member records" /><Proof icon={<Dumbbell />} value={String(gym.trainers?.length ?? 0)} label="published PT trainers" /><Proof icon={<ShieldCheck />} value="Verified" label="RIVET operating gym" /></div>
          </div>

          <aside id="book-trial" className="h-fit border border-ink bg-surface p-6 shadow-pop lg:sticky lg:top-24">
            {booked ? (
              <div className="py-5 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-bg text-success"><Check className="size-6" /></span><p className="mt-6 eyebrow">Sent to {gym.shortName}</p><h2 className="mt-2 text-[24px] font-semibold">Your free trial request is recorded.</h2><p className="mt-3 text-[13px] leading-relaxed text-ink-2">The request is now in the gym&rsquo;s follow-ups. The team can review it and record the outcome.</p><div className="mt-6 border border-line bg-sunken p-4 text-start"><p className="text-[13px] font-medium">{confirmedBranch.name}</p><p className="mt-1 text-[11px] text-ink-3">{customerSignedIn ? "Your request is saved under My Gyms." : "Sign in or create a member account to keep future bookings under your name."}</p></div><Button asChild className="mt-6 w-full"><Link href={customerSignedIn ? "/customer/my-gyms" : "/login"}>{customerSignedIn ? "Open My Gyms" : "Sign in to RIVET"}</Link></Button></div>
            ) : (
              <>
                <p className="eyebrow">Free first visit</p><h2 className="mt-2 text-[24px] font-semibold tracking-tight">Book a trial at {gym.shortName}</h2><p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">No payment required. Choose a branch and preferred time; the gym will confirm.</p>
                {!customerSignedIn ? <div className="mt-5 border border-warning/30 bg-warning-bg p-3 text-[11.5px] text-warning-deep">You can fill the form now. <Link href="/login" className="font-semibold underline">Sign in</Link> or <Link href="/login/member/create" className="font-semibold underline">create a free account</Link> to keep it under your name.</div> : null}
                <form onSubmit={submit} className="mt-6 space-y-4">
                  <TrialField label="Full name" error={errors.fullName?.message}><Input {...register("fullName")} /></TrialField>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><TrialField label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></TrialField><TrialField label="Email" error={errors.email?.message}><Input type="email" {...register("email")} /></TrialField></div>
                  <TrialField label="Branch" error={errors.branchId?.message}><select {...register("branchId")} className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]">{gym.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></TrialField>
                  <div className="grid grid-cols-2 gap-3"><TrialField label="Preferred date" error={errors.preferredDate?.message}><Input type="date" min={new Date().toISOString().slice(0, 10)} {...register("preferredDate")} /></TrialField><TrialField label="Time" error={errors.preferredTime?.message}><Input type="time" min={availableTrialWindow?.opensAt} max={availableTrialWindow?.closesAt} disabled={!availableTrialWindow} {...register("preferredTime")} /></TrialField></div>
                  {availableTrialWindow ? <p role="status" className="text-[10.5px] text-ink-3">Choose any time from {availableTrialWindow.opensAt} to {availableTrialWindow.closesAt}. The gym will confirm your request.</p> : <p role="status" className="border border-line bg-sunken p-3 text-[11.5px] text-ink-3">{selectedBranch?.trialSchedule ? "This branch is closed for trial requests on the selected date. Choose another date." : "This branch has not configured online trial hours yet. Contact the gym directly."}</p>}
                  <TrialField label="What are you looking for?" error={errors.goal?.message}><Textarea {...register("goal")} /></TrialField>
                  <Button type="submit" variant="signal" size="lg" className="w-full" loading={submitting} disabled={!availableTrialWindow}><CalendarCheck /> Send trial request</Button>
                </form>
                <p className="mt-4 flex items-center justify-center gap-2 text-[10.5px] text-ink-3"><Clock className="size-3.5" /> The gym controls confirmation and follow-up.</p>
              </>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function GymStat({ label, value }: { label: string; value: string }) { return <div className="bg-black/15 p-4"><dt className="font-mono text-[8px] uppercase tracking-[0.13em] text-white/65">{label}</dt><dd className="mt-2 text-[17px] font-semibold">{value}</dd></div>; }
function Proof({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) { return <div className="border-t border-line pt-4"><span className="text-signal [&_svg]:size-4">{icon}</span><p className="mt-3 text-[18px] font-semibold">{value}</p><p className="mt-1 text-[11px] text-ink-3">{label}</p></div>; }
function TrialField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium">{label}</span>{children}{error ? <span className="mt-1 block text-[10.5px] text-danger">{error}</span> : null}</label>; }
