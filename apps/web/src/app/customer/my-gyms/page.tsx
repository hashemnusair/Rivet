"use client";

import { Search, UserRound } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CustomerMembership, MarketplaceGym } from "@/lib/public/experience-data";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { formatDate } from "@/lib/utils/dates";

export default function MemberDashboardPage() {
  const customer = useCustomerPersona();
  const { customerMemberships } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();

  if (!ready || !identitySignedIn) return <GateLoading />;
  if (!profileSelected || !customer) return <SignedOut />;

  const gymFor = (id: string) => gyms.find((gym) => gym.id === id);
  return <main className="mx-auto max-w-[1080px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">Member home</p><h1 className="mt-1 font-display text-[27px] font-semibold tracking-tight">Hi, {customer.name.split(" ")[0]}</h1><p className="mt-1 text-[13px] text-ink-2">Your gym subscriptions, all in one place.</p></div>
      <div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><Link href="/customer/profile"><UserRound /> Profile</Link></Button><Button asChild><Link href="/customer/discover"><Search /> Find a gym</Link></Button></div>
    </header>

    <section className="mt-9" aria-labelledby="subscribed-gyms-title">
      <div className="flex items-baseline justify-between gap-3"><div><p className="eyebrow">Your subscriptions</p><h2 id="subscribed-gyms-title" className="mt-1 text-[19px] font-semibold">Subscribed gyms</h2></div><span className="text-[12px] text-ink-3">{customerMemberships.length} {customerMemberships.length === 1 ? "gym" : "gyms"}</span></div>
      {customerMemberships.length > 0 ? <div className="mt-4 grid gap-4 md:grid-cols-2">{customerMemberships.map((membership) => <MembershipCard key={membership.id} membership={membership} gym={gymFor(membership.gymId)} />)}</div> : <div className="mt-4 rounded-lg border border-dashed border-line-2 bg-surface p-9 text-center"><p className="text-[14px] font-medium">You are not subscribed to a gym yet.</p><p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-3">Find a gym to start a membership. Your subscriptions will appear here once activated.</p><Button asChild className="mt-4"><Link href="/customer/discover">Find a gym</Link></Button></div>}
    </section>
  </main>;
}

function MembershipCard({ membership, gym }: { membership: CustomerMembership; gym?: MarketplaceGym }) {
  const name = membership.gymName ?? gym?.name ?? "Gym";
  const logo = membership.gymLogoUrl ?? gym?.logo?.url;
  const cover = membership.gymCoverUrl ?? gym?.cover?.url;
  return <Link href={`/customer/my-gyms/${membership.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
    <div className="h-28 bg-cover bg-center" role="img" aria-label={`${name} cover image`} style={{ backgroundColor: gym?.accent ?? "var(--color-ink)", backgroundImage: cover ? `linear-gradient(rgb(0 0 0 / .25), rgb(0 0 0 / .25)), url(${cover})` : undefined }} />
    <div className="flex items-center gap-3 p-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-md border-2 border-surface bg-cover bg-center font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm" style={{ backgroundColor: gym?.accent ?? "var(--color-ink)", backgroundImage: logo ? `url(${logo})` : undefined }} aria-hidden>{logo ? null : name.slice(0, 5)}</span><div className="min-w-0 flex-1"><h3 className="truncate text-[15px] font-semibold group-hover:underline group-focus-visible:underline">{name}</h3><p className="mt-1 text-[12.5px] text-ink-3">Subscribed until <time dateTime={membership.endDate}>{formatDate(membership.endDate)}</time></p></div><span className="text-lg text-ink-3" aria-hidden>→</span></div>
  </Link>;
}

function GateLoading() { return <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Checking access"><div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" /></main>; }

function SignedOut() { return <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center"><span className="flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface text-ink-2"><UserRound className="size-5" /></span><h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight">Sign in to your member account</h1><p className="mt-2 text-[13px] text-ink-2">Your gym subscriptions and personal profile are available after sign in.</p><div className="mt-6 flex gap-2"><Button asChild><Link href="/login">Sign in</Link></Button><Button asChild variant="secondary"><Link href="/login/member/create">Create an account</Link></Button></div></main>; }
