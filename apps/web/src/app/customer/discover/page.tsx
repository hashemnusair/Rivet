"use client";
import { searchKey } from "@/lib/utils/text";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { isolate } from "@/lib/i18n/bidi";
import { useT } from "@/lib/i18n/provider";

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
import { money } from "@/lib/utils/money";

const ALL = "All gyms";

export default function DiscoverGymsPage() {
  const t = useT();
  return (
    <Suspense fallback={<main className="px-4 py-16 text-center text-[13px] text-ink-3" role="status">{t("customerPortal.loadingGyms")}</main>}>
      <DiscoverGyms />
    </Suspense>
  );
}

function DiscoverGyms() {
  const t = useT();
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
    const haystack = searchKey(`${gym.name} ${gym.areas.join(" ")} ${gym.city} ${gym.category}`);
    return haystack.includes(searchKey(search)) && (category === ALL || gym.category === category);
  }), [category, gyms, search]);
  const clear = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
  };

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header>
        <p className="text-[12px] font-medium text-ink-3">{t("customerPortal.directoryLocation")}</p>
        <h1 className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight">{t("marketing.actions.findGym")}</h1>
        <p className="mt-1 max-w-xl text-[13.5px] text-ink-2">{t("customerPortal.discoverDescription")}</p>
      </header>

      {experienceStatus !== "ready" || gyms.length === 0 ? (
        <div className="mt-6">
          <ExperienceDataState
            status={experienceStatus}
            error={experienceError}
            onRetry={retryExperience}
            emptyTitle={t("customerPortal.noGyms")}
            emptyDescription={t("customerPortal.noGymsDescription")}
            emptyAction={<Button asChild variant="secondary" size="sm"><Link href="/signup">{t("marketing.actions.apply")}{" "}<ArrowRight className="rtl:rotate-180" /></Link></Button>}
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} type="search" inputMode="search" placeholder={t("customerPortal.searchPlaceholder")} aria-label={t("customerPortal.searchGyms")} className="h-11 ps-9 sm:h-10" />
            </div>
            <div className={cn("mt-3", tabListClassName)} role="group" aria-label={t("customerPortal.gymCategory")}>
              {categories.map((item) => (
                <button key={item} type="button" aria-pressed={category === item} className={tabTriggerClassName} onClick={() => setParams({ category: item === ALL ? undefined : item })}>
                  {item === ALL ? t("customerPortal.allGyms") : item}
                </button>
              ))}
            </div>
          </div>

          {filtered.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((gym) => <GymCard key={gym.id} gym={gym} />)}
            </div>
          ) : (
            <EmptyState layout="section" className="mt-5" icon={SearchX} title={t("customerPortal.noMatches")} description={t("customerPortal.noMatchesDescription")} action={<Button variant="secondary" size="sm" onClick={clear}>{t("customerPortal.clearSearch")}</Button>} />
          )}
        </>
      )}
    </main>
  );
}

function GymCard({ gym }: { gym: MarketplaceGym }) {
  const { locale } = useLocale();
  const f = useFormat();
  const t = useT();
  const href = `/customer/gyms/${gym.id}`;
  const cover = gym.cover?.url;
  return (
    <article className="panel flex h-full flex-col overflow-hidden" aria-labelledby={`gym-${gym.id}-title`}>
      {cover ? <div className="h-32 bg-cover bg-center" role="img" aria-label={t("customerPortal.coverAlt", { gym: locale === "ar" ? isolate(gym.name) : gym.name })} style={{ backgroundImage: `url(${cover})` }} /> : null}
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <GymMark name={gym.name} shortName={gym.shortName} logoUrl={gym.logo?.url} accent={gym.accent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id={`gym-${gym.id}-title`} className="text-[17px] font-semibold leading-tight">
                <Link href={href} className="rounded-xs hover:underline">{gym.name}</Link>
              </h2>
              {gym.featured ? <Badge variant="neutral">{t("customerPortal.featured")}</Badge> : null}
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{gym.category} · {gym.areas.join(", ") || gym.city}</p>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{locale === "ar" ? gym.taglineAr || gym.tagline : gym.tagline}</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[12px]">
          <CardFact label={t("customerPortal.branches")} value={String(gym.branchCount)} />
          <CardFact label={t("palette.groups.members")} value={f.number(gym.memberCount)} />
          <CardFact label={t("customerPortal.ptTrainers")} value={String(gym.trainers?.length ?? 0)} />
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-[12px] text-ink-3">{t("common.label.from")}</p>
            <p className={cn("mt-0.5 font-semibold tabular text-ink", gym.fromPriceMinor > 0 ? "text-[16px]" : "text-[13.5px]")}>
              {gym.fromPriceMinor > 0 ? <>{f.money(money(gym.fromPriceMinor))}<span className="text-[12px] font-normal text-ink-3"> {" "}{t("customerPortal.perMonth")}</span></> : t("customerPortal.askGym")}
            </p>
          </div>
          <Button asChild size="sm" variant="secondary"><Link href={href}>{t("customerPortal.viewGym")}{" "}<ArrowRight className="rtl:rotate-180" /></Link></Button>
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
