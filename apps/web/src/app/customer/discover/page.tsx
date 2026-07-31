"use client";

import { ArrowRight, Dumbbell, MapPin, Search, SlidersHorizontal, Star, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";

export default function DiscoverGymsPage() {
  const gyms = useMarketplaceGyms();
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings } = useExperience();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All gyms");

  const categories = ["All gyms", ...Array.from(new Set(gyms.map((gym) => gym.category)))];
  const filtered = useMemo(() => gyms.filter((gym) => {
    const matchesSearch = `${gym.name} ${gym.areas.join(" ")} ${gym.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === "All gyms" || gym.category === category);
  }), [category, gyms, search]);

  return (
    <main>
      <section className="marketing-grid border-b border-ink/10 px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <div className="mx-auto max-w-[1344px]">
          <p className="eyebrow">RIVET network · Amman</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="marketing-display max-w-4xl text-[clamp(3.4rem,7vw,7.2rem)] leading-[0.88]">Find a gym that fits <span className="text-signal">your life.</span></h1>
              <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-2">Compare gyms operating on RIVET, choose a branch, and book a free trial that lands directly on the gym team’s follow-up queue.</p>
            </div>
            {customer ? <div className="border border-line bg-surface px-4 py-3"><p className="eyebrow">Signed in as</p><p className="mt-1 text-[13px] font-medium">{customer.name}</p></div> : <Button asChild><Link href="/customer/login">Sign in to book</Link></Button>}
          </div>
        </div>
      </section>

      {customerMemberships.length > 0 || customerBookings.length > 0 ? (
        <section className="border-b border-line bg-sunken px-5 py-6 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-[1344px] flex-wrap items-center justify-between gap-4">
            <div><p className="eyebrow">Your activity</p><p className="mt-1 text-[13px] text-ink-2">{customerMemberships.length} active gym · {customerBookings.length} trial request</p></div>
            <Button asChild variant="secondary"><Link href="/customer/my-gyms">Open My Gyms <ArrowRight /></Link></Button>
          </div>
        </section>
      ) : null}

      <section className="px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[1344px]">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by gym, area, or training style" className="h-11 ps-10" /></label>
            <div className="flex flex-wrap gap-2">
              {categories.slice(0, 4).map((item) => <Button key={item} type="button" variant={category === item ? "primary" : "secondary"} onClick={() => setCategory(item)}>{item === "All gyms" ? <SlidersHorizontal /> : null}{item}</Button>)}
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((gym) => (
              <article key={gym.id} className="group flex flex-col overflow-hidden border border-line bg-surface transition-all hover:-translate-y-1 hover:border-ink hover:shadow-pop">
                <div className="relative min-h-[188px] p-6 text-white" style={{ backgroundColor: gym.accent }}>
                  <div className="absolute inset-0 opacity-20 marketing-grid" />
                  <div className="relative flex items-start justify-between"><span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]">{gym.shortName}</span>{gym.featured ? <span className="border border-white/40 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em]">Featured</span> : null}</div>
                  <div className="relative mt-14"><p className="text-[12px] text-white/75">{gym.category}</p><h2 className="mt-1 text-[27px] font-semibold tracking-tight">{gym.name}</h2></div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[13px] leading-relaxed text-ink-2">{gym.tagline}</p>
                  <div className="mt-5 grid grid-cols-3 gap-2 border-y border-line py-4 text-[11px] text-ink-3">
                    <span className="flex items-center gap-1.5"><Star className="size-3.5 fill-warning text-warning" /> {gym.rating}</span>
                    <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {gym.memberCount.toLocaleString()}</span>
                    <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {gym.areas[0]}</span>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-4"><div><p className="eyebrow">Memberships from</p><p className="mt-1 text-[18px] font-semibold">JD {gym.fromPriceMinor / 1000}<span className="text-[11px] font-normal text-ink-3"> / month</span></p></div><Button asChild variant="signal"><Link href={`/customer/gyms/${gym.id}`}>View & book <ArrowRight /></Link></Button></div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 ? <div className="mt-8 border border-dashed border-line-3 p-12 text-center"><Dumbbell className="mx-auto size-7 text-ink-3" /><h2 className="mt-4 text-[18px] font-semibold">No gyms match that search</h2><p className="mt-2 text-[13px] text-ink-3">Try another area or clear the category filter.</p></div> : null}
        </div>
      </section>
    </main>
  );
}
