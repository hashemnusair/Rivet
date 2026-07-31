"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarCheck, Check, Clock, MapPin, ShieldCheck, Star, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { gymById } from "@/lib/public/experience-data";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";

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
  const gym = gymById(gymId);
  const customer = useCustomerPersona();
  const { bookTrial, customerSignedIn } = useExperience();
  const [booked, setBooked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return date.toISOString().slice(0, 10);
  }, []);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<TrialValues>({
    resolver: zodResolver(trialSchema),
    defaultValues: {
      fullName: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      branchId: gym?.branches[0]?.id ?? "",
      preferredDate: defaultDate,
      preferredTime: gym?.branches[0]?.trialSlots[0] ?? "18:00",
      goal: "Try the gym and discuss the right membership",
    },
  });

  if (!gym) return <main className="px-5 py-20 text-center"><h1 className="text-[26px] font-semibold">Gym not found</h1><Button asChild className="mt-5"><Link href="/customer/discover">Back to discovery</Link></Button></main>;
  const selectedBranch = gym.branches.find((branch) => branch.id === watch("branchId")) ?? gym.branches[0]!;

  const submit = handleSubmit(async (values) => {
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
      <section className="relative overflow-hidden px-5 py-14 text-white sm:px-8 lg:px-12 lg:py-20" style={{ backgroundColor: gym.accent }}>
        <div className="absolute inset-0 opacity-20 marketing-grid" />
        <div className="relative mx-auto max-w-[1344px]">
          <Link href="/customer/discover" className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/75 hover:text-white"><ArrowLeft className="size-3.5" /> All gyms</Link>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_0.45fr] lg:items-end">
            <div><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">{gym.category} · {gym.city}</p><h1 className="marketing-display mt-4 max-w-5xl text-[clamp(4rem,8vw,8rem)] leading-[0.87]">{gym.name}</h1><p className="mt-7 max-w-2xl text-[17px] leading-relaxed text-white/85">{gym.tagline}</p></div>
            <dl className="grid grid-cols-2 gap-px bg-white/25"><GymStat label="Rating" value={`${gym.rating} / 5`} /><GymStat label="Members" value={gym.memberCount.toLocaleString()} /><GymStat label="Branches" value={String(gym.branchCount)} /><GymStat label="From" value={`JD ${gym.fromPriceMinor / 1000}`} /></dl>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto grid max-w-[1344px] gap-10 lg:grid-cols-[1fr_430px]">
          <div>
            <p className="eyebrow">About the club</p><h2 className="mt-3 text-[30px] font-semibold tracking-tight">Train somewhere built for consistency.</h2><p className="mt-5 max-w-3xl text-[15px] leading-[1.75] text-ink-2">{gym.description}</p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {gym.branches.map((branch) => <div key={branch.id} className="border border-line bg-surface p-5"><MapPin className="size-5 text-signal" /><h3 className="mt-5 text-[17px] font-semibold">{branch.name}</h3><p className="mt-2 text-[12px] leading-relaxed text-ink-3">{branch.address}</p><p className="mt-4 font-mono text-[9px] uppercase tracking-[0.13em] text-ink-3">Trial slots · {branch.trialSlots.join(" · ")}</p></div>)}
            </div>
            <div className="mt-10"><p className="eyebrow">What is inside</p><div className="mt-4 flex flex-wrap gap-2">{gym.amenities.map((amenity) => <span key={amenity} className="border border-line bg-sunken px-3 py-2 text-[12px] text-ink-2">{amenity}</span>)}</div></div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3"><Proof icon={<Star />} value={`${gym.rating}`} label={`${gym.reviewCount} member reviews`} /><Proof icon={<Users />} value={gym.memberCount.toLocaleString()} label="members on RIVET" /><Proof icon={<ShieldCheck />} value="Verified" label="RIVET operating gym" /></div>
          </div>

          <aside id="book-trial" className="h-fit border border-ink bg-surface p-6 shadow-pop lg:sticky lg:top-24">
            {booked ? (
              <div className="py-5 text-center"><span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-bg text-success"><Check className="size-6" /></span><p className="mt-6 eyebrow">Sent to {gym.shortName}</p><h2 className="mt-2 text-[24px] font-semibold">Your free trial is booked.</h2><p className="mt-3 text-[13px] leading-relaxed text-ink-2">The request is now in the gym’s RIVET sales queue. The team will confirm your time by phone or WhatsApp.</p><div className="mt-6 border border-line bg-sunken p-4 text-start"><p className="text-[13px] font-medium">{selectedBranch.name}</p><p className="mt-1 text-[11px] text-ink-3">Your booking is also saved under My Gyms.</p></div><Button asChild className="mt-6 w-full"><Link href="/customer/my-gyms">Open My Gyms</Link></Button></div>
            ) : (
              <>
                <p className="eyebrow">Free first visit</p><h2 className="mt-2 text-[24px] font-semibold tracking-tight">Book a trial at {gym.shortName}</h2><p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">No payment required. Choose a branch and preferred time; the gym will confirm.</p>
                {!customerSignedIn ? <div className="mt-5 border border-warning/30 bg-warning-bg p-3 text-[11.5px] text-warning-deep">You can fill the form now. <Link href="/login#member" className="font-semibold underline">Sign in</Link> or <Link href="/customer/signup" className="font-semibold underline">create a free account</Link> to keep it under your name.</div> : null}
                <form onSubmit={submit} className="mt-6 space-y-4">
                  <TrialField label="Full name" error={errors.fullName?.message}><Input {...register("fullName")} /></TrialField>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><TrialField label="Phone" error={errors.phone?.message}><Input {...register("phone")} /></TrialField><TrialField label="Email" error={errors.email?.message}><Input type="email" {...register("email")} /></TrialField></div>
                  <TrialField label="Branch" error={errors.branchId?.message}><select {...register("branchId")} className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]">{gym.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></TrialField>
                  <div className="grid grid-cols-2 gap-3"><TrialField label="Preferred date" error={errors.preferredDate?.message}><Input type="date" {...register("preferredDate")} /></TrialField><TrialField label="Time" error={errors.preferredTime?.message}><select {...register("preferredTime")} className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]">{selectedBranch.trialSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></TrialField></div>
                  <TrialField label="What are you looking for?" error={errors.goal?.message}><Textarea {...register("goal")} /></TrialField>
                  <Button type="submit" variant="signal" size="lg" className="w-full" loading={submitting}><CalendarCheck /> Book free trial</Button>
                </form>
                <p className="mt-4 flex items-center justify-center gap-2 text-[10.5px] text-ink-3"><Clock className="size-3.5" /> Gym response target: under 30 minutes</p>
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
