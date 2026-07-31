"use client";

import { ArrowLeft, CalendarDays, Clock, CreditCard, MapPin, QrCode as QrIcon, ScanLine } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { gymById } from "@/lib/public/experience-data";
import { useExperience } from "@/lib/providers/experience-provider";

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  const { memberships } = useExperience();
  const membership = memberships.find((item) => item.id === membershipId);
  if (!membership) return <main className="px-5 py-20 text-center"><h1 className="text-[24px] font-semibold">Membership not found</h1><Button asChild className="mt-5"><Link href="/customer/my-gyms">Back to My Gyms</Link></Button></main>;
  const gym = gymById(membership.gymId)!;
  const branch = gym.branches.find((item) => item.id === membership.branchId)!;

  return <main className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14"><div className="mx-auto max-w-6xl">
    <Link href="/customer/my-gyms" className="inline-flex items-center gap-2 text-[12px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5"/> My Gyms</Link>
    <div className="mt-7 grid overflow-hidden border border-ink bg-surface lg:grid-cols-[420px_1fr]">
      <section className="night-surface flex flex-col bg-night p-7 text-night-ink sm:p-9">
        <div className="flex items-center justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.17em]">RIVET MEMBER</p><span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success"><span className="size-1.5 rounded-full bg-success"/>Active identity</span></div>
        <div className="mt-8 bg-white p-7"><QRCodeSVG value={membership.qrValue} size={244} level="H" bgColor="#ffffff" fgColor="#15140f" className="h-auto w-full" aria-label="Membership entry QR code" /></div>
        <p className="mt-5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">Show at the desk · rotates securely in production</p>
        <div className="mt-8 border-t border-night-line pt-6"><p className="eyebrow-night">Member number</p><p className="mt-2 font-mono text-[22px]">{membership.memberNumber}</p><p className="mt-2 text-[11px] text-night-ink-3">{gym.name} · {branch.name}</p></div>
      </section>
      <section className="p-7 sm:p-9 lg:p-12">
        <p className="eyebrow">{membership.status} membership</p><h1 className="mt-2 text-[35px] font-semibold tracking-tight">{gym.name}</h1><p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3"><MapPin className="size-3.5"/>{branch.address}</p>
        <div className="mt-9 grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2"><MemberStat icon={<CalendarDays/>} label="Plan" value={membership.planName}/><MemberStat icon={<Clock/>} label="Valid until" value={membership.endDate}/><MemberStat icon={<ScanLine/>} label="Visits this month" value={String(membership.visitsThisMonth)}/><MemberStat icon={<CreditCard/>} label="Outstanding balance" value={`JD ${(membership.balanceMinor/1000).toFixed(3)}`}/></div>
        <div className="mt-9"><p className="eyebrow">Recent activity</p><div className="mt-4 space-y-0 border-s border-line ps-5"><Timeline title="Checked in" detail={`${branch.name} · ${new Date(membership.lastCheckInAt).toLocaleString("en-JO",{dateStyle:"medium",timeStyle:"short"})}`}/><Timeline title="Renewal reminder scheduled" detail="12 days before membership end date"/><Timeline title="Receipt #4412" detail="Card · JD 180.000 · Paid"/></div></div>
        <div className="mt-9 flex flex-wrap gap-3"><Button variant="signal">Renew membership</Button><Button variant="secondary">View receipts</Button><Button variant="secondary">Contact gym</Button></div>
      </section>
    </div>
    <div className="mt-5 flex items-start gap-3 border border-line bg-sunken p-4 text-[11.5px] leading-relaxed text-ink-2"><QrIcon className="mt-0.5 size-4 shrink-0 text-signal"/>This preview QR encodes a demo member identity. The production version will use a short-lived signed token and server-side check-in validation.</div>
  </div></main>;
}

function MemberStat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="bg-surface p-5"><span className="text-signal [&_svg]:size-4">{icon}</span><p className="mt-5 eyebrow">{label}</p><p className="mt-2 text-[17px] font-semibold">{value}</p></div>}
function Timeline({title,detail}:{title:string;detail:string}){return <div className="relative pb-6 before:absolute before:-start-[24px] before:top-1 before:size-2 before:rounded-full before:bg-signal"><p className="text-[13px] font-medium">{title}</p><p className="mt-1 text-[11.5px] text-ink-3">{detail}</p></div>}
