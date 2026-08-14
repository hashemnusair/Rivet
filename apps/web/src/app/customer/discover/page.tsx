"use client";

import { ArrowRight, Dumbbell, MapPin, Search, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";

export default function DiscoverGymsPage() {
  const gyms = useMarketplaceGyms();
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings, experienceError, experienceStatus, retryExperience } = useExperience();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All gyms");

  const categories = ["All gyms", ...Array.from(new Set(gyms.map((gym) => gym.category)))];
  const filtered = useMemo(() => gyms.filter((gym) => {
    const matchesSearch = `${gym.name} ${gym.areas.join(" ")} ${gym.category}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (category === "All gyms" || gym.category === category);
  }), [category, gyms, search]);

  return (
    <main>
      <section className="border-b border-line bg-surface px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">RIVET network · Amman</p>
            <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">Find a gym</h1>
            <p className="mt-1.5 max-w-xl text-[13.5px] text-ink-2">Compare gyms running on RIVET, pick a branch, and book a free trial that lands on the gym&rsquo;s follow-up queue.</p>
          </div>
          {/* Signing in lives in the header. Repeating it here (and again in the
              footer) gave one page three ways to do the same thing. */}
          {customer && (customerMemberships.length > 0 || customerBookings.length > 0) ? (
            <Button asChild variant="secondary"><Link href="/customer/my-gyms">My dashboard <ArrowRight /></Link></Button>
          ) : null}
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1280px]">
          {experienceStatus !== "ready" || gyms.length === 0 ? (
            <ExperienceDataState
              status={experienceStatus}
              error={experienceError}
              onRetry={retryExperience}
              emptyTitle="No RIVET gyms are live yet"
              emptyDescription="Gyms appear here after RIVET approves and publishes their workspace. Run a gym? Send an application and our team will follow up."
              emptyAction={
                <Button asChild variant="primary" size="sm">
                  <Link href="/signup">Send a gym application <ArrowRight /></Link>
                </Button>
              }
            />
          ) : <>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by gym, area, or training style" className="h-11 ps-10" /></label>
            <div className="flex flex-wrap gap-2">
              {categories.slice(0, 4).map((item) => <Button key={item} type="button" variant={category === item ? "primary" : "secondary"} onClick={() => setCategory(item)}>{item === "All gyms" ? <SlidersHorizontal /> : null}{item}</Button>)}
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((gym, index) => (
              <Reveal key={gym.id} delay={index * 70}>
                <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-ink hover:shadow-pop">
                  <div className="relative h-28 overflow-hidden bg-cover bg-center px-5 py-4 text-white" style={{ backgroundColor: gym.accent, backgroundImage: gym.cover?.url ? `linear-gradient(rgb(0 0 0 / .45), rgb(0 0 0 / .45)), url(${gym.cover.url})` : undefined }}>
                    <div className="absolute inset-0 opacity-20 marketing-grid" />
                    <div className="relative flex items-start justify-between">
                      <span className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em]"><span className="size-8 rounded-full border border-white/50 bg-cover bg-center" role="img" aria-label={`${gym.name} logo`} style={{ backgroundColor: gym.accent, backgroundImage: gym.logo?.url ? `url(${gym.logo.url})` : undefined }} />{gym.shortName}</span>
                      {gym.featured ? (
                        <span className="rounded-sm border border-white/40 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em]">Featured</span>
                      ) : null}
                    </div>
                    <Dumbbell className="absolute -bottom-3 end-3 size-20 opacity-20 transition-transform duration-500 group-hover:scale-110" strokeWidth={1.2} />
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <p className="eyebrow">{gym.category}</p>
                    <h2 className="mt-1.5 text-[21px] font-semibold tracking-tight">{gym.name}</h2>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{gym.tagline}</p>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-y border-line py-3 text-[11px] text-ink-3">
                      <span className="flex items-center gap-1.5"><Dumbbell className="size-3.5" /> {gym.trainers?.length ?? 0} PT</span>
                      <span className="flex items-center gap-1.5"><Users className="size-3.5" /> {gym.memberCount.toLocaleString()}</span>
                      <span className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {gym.areas[0]}</span>
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-4 pt-4">
                      <div>
                        <p className="eyebrow">From</p>
                        <p className="mt-1 text-[18px] font-semibold">
                          {gym.fromPriceMinor > 0 ? <>JD {gym.fromPriceMinor / 1000}<span className="text-[11px] font-normal text-ink-3"> / month</span></> : <span className="text-[14px]">Contact gym</span>}
                        </p>
                      </div>
                      <Button asChild variant="signal">
                        <Link href={`/customer/gyms/${gym.id}`}>View &amp; book <ArrowRight /></Link>
                      </Button>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>

          {filtered.length === 0 ? <div className="mt-8 border border-dashed border-line-3 p-12 text-center"><Dumbbell className="mx-auto size-7 text-ink-3" /><h2 className="mt-4 text-[18px] font-semibold">No gyms match that search</h2><p className="mt-2 text-[13px] text-ink-3">Try another area or clear the category filter.</p></div> : null}
          </>}
        </div>
      </section>
    </main>
  );
}
