"use client";

import { ArrowRight, CalendarCheck, Dumbbell, MapPin, QrCode } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { gymById } from "@/lib/public/experience-data";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";

export default function MyGymsPage() {
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings, customerSignedIn } = useExperience();

  if (!customerSignedIn) return <main className="marketing-grid min-h-[620px] px-5 py-20 text-center"><Dumbbell className="mx-auto size-8 text-ink-3" /><h1 className="mt-5 text-[28px] font-semibold">Sign in to see My Gyms</h1><p className="mx-auto mt-3 max-w-md text-[13px] text-ink-2">Your memberships, trials, receipts, and entry QR live inside your RIVET Member account.</p><Button asChild className="mt-6"><Link href="/customer/login">Member login</Link></Button></main>;

  return (
    <main>
      <section className="marketing-grid border-b border-ink/10 px-5 py-14 sm:px-8 lg:px-12 lg:py-20"><div className="mx-auto max-w-[1344px]"><p className="eyebrow">RIVET Member</p><h1 className="marketing-display mt-4 text-[clamp(3.6rem,7vw,7.4rem)] leading-[0.88]">My gyms.</h1><p className="mt-5 text-[15px] text-ink-2">Welcome back, {customer?.name}. Every membership and trial in one account.</p></div></section>
      <section className="px-5 py-12 sm:px-8 lg:px-12 lg:py-16"><div className="mx-auto max-w-[1344px]">
        <div className="flex items-end justify-between"><div><p className="eyebrow">Active memberships</p><h2 className="mt-2 text-[25px] font-semibold">Your training access</h2></div><Button asChild variant="secondary"><Link href="/customer/discover">Discover another gym</Link></Button></div>
        {customerMemberships.length > 0 ? <div className="mt-7 grid gap-5 lg:grid-cols-2">{customerMemberships.map((membership) => { const gym = gymById(membership.gymId)!; const branch = gym.branches.find((item) => item.id === membership.branchId)!; return <Link key={membership.id} href={`/customer/my-gyms/${membership.id}`} className="group grid overflow-hidden border border-line bg-surface transition-all hover:border-ink hover:shadow-pop sm:grid-cols-[0.38fr_0.62fr]"><div className="relative flex min-h-[220px] flex-col justify-between p-6 text-white" style={{backgroundColor:gym.accent}}><div className="absolute inset-0 opacity-15 marketing-grid"/><p className="relative font-mono text-[10px] uppercase tracking-[0.16em]">{gym.shortName}</p><QrCode className="relative size-16" strokeWidth={1.2}/><p className="relative font-mono text-[9px] uppercase tracking-[0.13em]">Tap for entry QR</p></div><div className="flex flex-col p-6"><div className="flex items-start justify-between"><div><p className="eyebrow">{membership.status}</p><h3 className="mt-2 text-[23px] font-semibold">{gym.name}</h3><p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3"><MapPin className="size-3"/>{branch.name}</p></div><ArrowRight className="size-4 transition-transform group-hover:translate-x-1"/></div><div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-5"><div><p className="eyebrow">Plan</p><p className="mt-1 text-[13px] font-medium">{membership.planName}</p></div><div><p className="eyebrow">Renews</p><p className="mt-1 text-[13px] font-medium">{membership.endDate}</p></div><div><p className="eyebrow">Visits this month</p><p className="mt-1 text-[20px] font-semibold">{membership.visitsThisMonth}</p></div><div><p className="eyebrow">Balance</p><p className="mt-1 text-[20px] font-semibold">JD {(membership.balanceMinor/1000).toFixed(3)}</p></div></div></div></Link>; })}</div> : <EmptyMemberships />}

        <div className="mt-14"><p className="eyebrow">Free trials</p><h2 className="mt-2 text-[23px] font-semibold">Requests and visits</h2>{customerBookings.length > 0 ? <div className="mt-6 divide-y divide-line border-y border-line">{customerBookings.map((booking) => { const gym=gymById(booking.gymId)!; const branch=gym.branches.find((item)=>item.id===booking.branchId)!; return <div key={booking.id} className="grid gap-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-[14px] font-medium">{gym.name}</p><p className="mt-1 text-[11.5px] text-ink-3">{branch.name} · {booking.preferredDate} at {booking.preferredTime}</p></div><span className="w-fit bg-warning-bg px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-warning-deep">{booking.status}</span><Button asChild variant="ghost" size="sm"><Link href={`/customer/gyms/${gym.id}`}>Gym details <ArrowRight/></Link></Button></div>; })}</div> : <p className="mt-4 text-[13px] text-ink-3">No free trial requests yet.</p>}</div>
      </div></section>
    </main>
  );
}

function EmptyMemberships(){return <div className="mt-7 border border-dashed border-line-3 p-10 text-center"><CalendarCheck className="mx-auto size-7 text-ink-3"/><h3 className="mt-4 text-[18px] font-semibold">No active memberships yet</h3><p className="mx-auto mt-2 max-w-md text-[13px] text-ink-3">Browse participating gyms and book a free trial. Once a gym activates your membership, it appears here automatically.</p><Button asChild variant="signal" className="mt-6"><Link href="/customer/discover">Find a gym</Link></Button></div>}
