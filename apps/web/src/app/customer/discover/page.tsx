"use client";

import { ArrowRight, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { GymMark } from "@/components/public/gym-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { cn } from "@/lib/utils/cn";
import { formatMoney, money } from "@/lib/utils/money";

const ALL = "All gyms";

export default function DiscoverGymsPage() {
  return (
    <Suspense fallback={<main className="px-4 py-16 text-center text-[13px] text-ink-3" role="status">Loading gyms…</main>}>
      <DiscoverGyms />
    </Suspense>
  );
}

function DiscoverGyms() {
  const gyms = useMarketplaceGyms();
  const { experienceError, experienceStatus, retryExperience } = useExperience();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const category = params.get("category") ?? ALL;
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search, 250);

  const setParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const value = next.toString();
    router.replace(value ? `${pathname}?${value}` : pathname, { scroll: false });
  };

  // The search text is shareable, but only once typing settles.
  useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedSearch) setParams({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const categories = [ALL, ...Array.from(new Set(gyms.map((gym) => gym.category)))];
  const filtered = useMemo(() => gyms.filter((gym) => {
    const haystack = `${gym.name} ${gym.areas.join(" ")} ${gym.city} ${gym.category}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase()) && (category === ALL || gym.category === category);
  }), [category, gyms, search]);
  const clear = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <p className="text-[12px] font-medium text-ink-3">Gyms on RIVET · Amman</p>
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight">Find a gym</h1>
        <p className="mt-1 max-w-xl text-[13.5px] text-ink-2">Compare gyms, pick a branch and book a free trial. The gym confirms your visit.</p>
      </header>

      {experienceStatus !== "ready" || gyms.length === 0 ? (
        <div className="mt-6">
          <ExperienceDataState
            status={experienceStatus}
            error={experienceError}
            onRetry={retryExperience}
            emptyTitle="No RIVET gyms are live yet"
            emptyDescription="Gyms appear here after RIVET approves and publishes their workspace. Run a gym? Send an application and our team will follow up."
            emptyAction={<Button asChild variant="secondary" size="sm"><Link href="/signup">Send a gym application <ArrowRight /></Link></Button>}
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} type="search" inputMode="search" placeholder="Search by gym, area or training style" aria-label="Search gyms" className="h-11 ps-9 sm:h-10" />
            </div>
            <div className={cn("mt-3", tabListClassName)} role="group" aria-label="Gym category">
              {categories.map((item) => (
                <button key={item} type="button" aria-pressed={category === item} className={tabTriggerClassName} onClick={() => setParams({ category: item === ALL ? undefined : item })}>
                  {item}
                </button>
              ))}
            </div>
          </div>

          {filtered.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((gym) => <GymCard key={gym.id} gym={gym} />)}
            </div>
          ) : (
            <EmptyState layout="section" className="mt-5" icon={SearchX} title="No gyms match" description="Try another area or training style, or clear the search." action={<Button variant="secondary" size="sm" onClick={clear}>Clear search</Button>} />
          )}
        </>
      )}
    </main>
  );
}

function GymCard({ gym }: { gym: MarketplaceGym }) {
  const href = `/customer/gyms/${gym.id}`;
  const cover = gym.cover?.url;
  return (
    <article className="panel flex h-full flex-col overflow-hidden" aria-labelledby={`gym-${gym.id}-title`}>
      {cover ? <div className="h-32 bg-cover bg-center" role="img" aria-label={`${gym.name} cover image`} style={{ backgroundImage: `url(${cover})` }} /> : null}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <GymMark name={gym.name} shortName={gym.shortName} logoUrl={gym.logo?.url} accent={gym.accent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id={`gym-${gym.id}-title`} className="text-[17px] font-semibold leading-tight">
                <Link href={href} className="rounded-xs hover:underline">{gym.name}</Link>
              </h2>
              {gym.featured ? <Badge variant="neutral">Featured</Badge> : null}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{gym.category} · {gym.areas.join(", ") || gym.city}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{gym.tagline}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
          <CardFact label="Branches" value={String(gym.branchCount)} />
          <CardFact label="Members" value={gym.memberCount.toLocaleString()} />
          <CardFact label="PT trainers" value={String(gym.trainers?.length ?? 0)} />
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-[12px] text-ink-3">From</p>
            <p className={cn("mt-0.5 font-semibold tabular text-ink", gym.fromPriceMinor > 0 ? "text-[16px]" : "text-[13.5px]")}>
              {gym.fromPriceMinor > 0 ? <>{formatMoney(money(gym.fromPriceMinor))}<span className="text-[12px] font-normal text-ink-3"> / month</span></> : "Ask the gym"}
            </p>
          </div>
          <Button asChild size="sm" variant="secondary"><Link href={href}>View gym <ArrowRight /></Link></Button>
        </div>
      </div>
    </article>
  );
}

function CardFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-medium tabular text-ink">{value}</dd>
    </div>
  );
}
