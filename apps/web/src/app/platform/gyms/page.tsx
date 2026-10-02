"use client";

import { useLocale, useT, type TFunction } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { ArrowRight, Building2, MapPin, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import type { PlatformSnapshot } from "@/lib/api/GymOSApi";
import { Button } from "@/components/ui/button";
import { PlatformGymLogo } from "@/components/platform/platform-gym-logo";
import { FilterPills, PlatformPage, PlatformPanel, StaleNotice } from "@/components/platform/platform-page";
import { SubscriptionStatusBadge, subscriptionStatusLabel } from "@/components/platform/platform-status";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { sortGymDirectory } from "@/lib/platform/gym-directory";
import { PageHeader } from "@/components/shared/chrome";
import { ContextLabel } from "@/components/ui/typography";
import { searchKey } from "@/lib/utils/text";

type GymFilter = "all" | MarketplaceGym["subscriptionStatus"];

const PLATFORM_SNAPSHOT_KEY = ["platform", "snapshot"] as const;
const EMPTY_GYMS: MarketplaceGym[] = [];
const STATUS_FILTERS: GymFilter[] = ["active", "all", "trial", "overdue", "suspended", "cancelled"];
const DEFAULT_FILTER: GymFilter = "active";

function parseFilter(value: string | null): GymFilter {
  return STATUS_FILTERS.some((item) => item === value) ? (value as GymFilter) : DEFAULT_FILTER;
}

function filterLabel(value: GymFilter, t: TFunction): string {
  switch (value) {
    case "active": return t("platformFinance.gyms.activeFilter");
    case "all": return t("platformFinance.gyms.allFilter");
    case "trial": return t("platformFinance.gyms.trialFilter");
    case "overdue": return t("platformFinance.gyms.pastDueFilter");
    case "suspended": return t("platformFinance.gyms.suspendedFilter");
    case "cancelled": return t("platformFinance.gyms.cancelledFilter");
  }
}

export default function PlatformGymsPage() {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // The status and search live in the URL so a filtered directory can be
  // shared and survives refresh; local state keeps typing immediate.
  const urlFilter = parseFilter(searchParams.get("status"));
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [filter, setFilter] = useState<GymFilter>(urlFilter);
  useEffect(() => { setFilter(urlFilter); }, [urlFilter]);
  useEffect(() => { setQuery((current) => current.trim() === urlQuery ? current : urlQuery); }, [urlQuery]);

  const sync = (nextFilter: GymFilter, nextQuery: string) => {
    const params = new URLSearchParams();
    if (nextFilter !== DEFAULT_FILTER) params.set("status", nextFilter);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };
  const changeFilter = (next: GymFilter) => { setFilter(next); sync(next, query); };
  const changeQuery = (next: string) => { setQuery(next); sync(filter, next); };
  const clearFilters = () => { setQuery(""); setFilter(DEFAULT_FILTER); sync(DEFAULT_FILTER, ""); };

  const directoryQuery = useRealtimeApiQuery<PlatformSnapshot>({
    queryKey: PLATFORM_SNAPSHOT_KEY,
    query: (api) => api.getPlatformSnapshot(),
    subscribe: (api, onValue, onError) => api.subscribePlatformSnapshot(onValue, onError),
  });
  const directory = (directoryQuery.data?.gyms ?? EMPTY_GYMS).filter((gym) => !isArchivedGym(gym));
  const normalizedQuery = searchKey(query);
  const gyms = useMemo(
    () => sortGymDirectory(directory.filter((gym) => {
      const matchesSearch = !normalizedQuery || searchKey(`${gym.id} ${gym.name} ${gym.areas.join(" ")} ${gym.rivetPlan}`).includes(normalizedQuery);
      return matchesSearch && (filter === "all" || gym.subscriptionStatus === filter);
    })),
    [directory, filter, normalizedQuery],
  );
  const statusCounts = useMemo(
    () => STATUS_FILTERS.reduce<Record<GymFilter, number>>((counts, item) => {
      counts[item] = item === "all" ? directory.length : directory.filter((gym) => gym.subscriptionStatus === item).length;
      return counts;
    }, { all: 0, active: 0, trial: 0, overdue: 0, suspended: 0, cancelled: 0 }),
    [directory],
  );
  const hasFilters = Boolean(normalizedQuery) || filter !== DEFAULT_FILTER;
  const showingStaleDirectory = directoryQuery.isBackgroundError || directoryQuery.streamState === "fallback";

  if (directoryQuery.isLoading && !directoryQuery.data) return <GymDirectoryLoading />;
  if (directoryQuery.isError && !directoryQuery.data) {
    return <PlatformPage><ErrorState title={t("platformFinance.gyms.unavailable")} description={t("platformFinance.gyms.unavailableDescription")} onRetry={() => directoryQuery.refetch()} /></PlatformPage>;
  }

  return (
    <PlatformPage>
      <PageHeader
        title={t("platformFinance.gyms.title")}
        description={t("platformFinance.gyms.description")}
        actions={<Button asChild variant="secondary"><Link href="/platform/applications">{t("platformFinance.gyms.reviewApplications")} <ArrowRight /></Link></Button>}
      />

      {showingStaleDirectory ? <div className="mt-5"><StaleNotice onRetry={() => directoryQuery.refetch()}>{t("platformFinance.detail.stale")}</StaleNotice></div> : null}

      <PlatformPanel className="mt-5 grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <label className="relative block" htmlFor="gym-directory-search">
          <span className="sr-only">{t("platformFinance.gyms.searchLabel")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input id="gym-directory-search" value={query} onChange={(event) => changeQuery(event.target.value)} className="ps-9" placeholder={t("platformFinance.gyms.searchPlaceholder")} />
        </label>
        <FilterPills
          label={t("platformFinance.gyms.filterLabel")}
          value={filter}
          items={STATUS_FILTERS.map((value) => ({ value, label: filterLabel(value, t), count: statusCounts[value] }))}
          onChange={changeFilter}
        />
      </PlatformPanel>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3" aria-live="polite">
        <p>{t("platformFinance.gyms.filterResults", { count: gyms.length })}{hasFilters ? t("platformFinance.gyms.withCurrentFilters") : ""}</p>
        {hasFilters ? <Button variant="link" size="sm" onClick={clearFilters}>{t("common.action.clearFilters")}</Button> : null}
      </div>

      {gyms.length > 0 ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gyms.map((gym) => <GymCard key={gym.id} gym={gym} />)}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            layout="section"
            icon={Building2}
            title={t(hasFilters ? "platformFinance.gyms.noMatchTitle" : "platformFinance.gyms.emptyTitle")}
            description={t(hasFilters ? "platformFinance.gyms.noMatchDescription" : "platformFinance.gyms.emptyDescription")}
            action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>{t("common.action.clearFilters")}</Button> : <Button asChild variant="secondary" size="sm"><Link href="/platform/applications">{t("platformFinance.gyms.reviewApplications")} <ArrowRight className="rtl:rotate-180" /></Link></Button>}
          />
        </div>
      )}
    </PlatformPage>
  );
}

function GymCard({ gym }: { gym: MarketplaceGym }) {
  const t = useT();
  const { isolate } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const titleId = `gym-card-${gym.id}`;
  const lifecycle = lifecycleDeadline(gym, f, t);
  return (
    <article aria-labelledby={titleId} className="flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-3 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <PlatformGymLogo name={gym.name} shortName={gym.shortName} accent={gym.accent} logoUrl={gym.logoUrl} className="size-11 rounded-md text-[11px]" />
        <SubscriptionStatusBadge status={gym.subscriptionStatus} aria-label={t("platformFinance.gyms.status", { status: isolate(subscriptionStatusLabel(gym.subscriptionStatus)) })} />
      </div>
      <h2 id={titleId} className="mt-4 truncate text-[15px] font-semibold">{gym.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3"><MapPin className="size-3.5 shrink-0" aria-hidden />{gym.areas.length > 0 ? gym.areas.join(" · ") : t("platformFinance.gyms.areaNotConfigured")}</p>
      <dl className="mt-4 grid grid-cols-3 gap-px border-y border-line bg-line py-px">
        <Metric icon={<Building2 />} value={f.number(gym.branchCount)} label={t("platformFinance.gyms.branches", { count: gym.branchCount })} />
        <Metric icon={<Users />} value={f.number(gym.memberCount)} label={t("platformFinance.gyms.members", { count: gym.memberCount })} />
        <Metric value={<bdi dir="ltr">{gym.rivetPlan}</bdi>} label={t("platformFinance.gyms.plan")} />
      </dl>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <ContextLabel>{lifecycle.label}</ContextLabel>
          <p className="mt-0.5 truncate text-[13px] font-medium">{lifecycle.value}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/platform/gyms/${gym.id}`} aria-label={t("platformFinance.gyms.openDetails", { gym: isolate(gym.name) })}>{t("dashboard.today.action.open")} <ArrowRight className="rtl:rotate-180" /></Link>
        </Button>
      </div>
    </article>
  );
}

function GymDirectoryLoading() {
  const t = useT();
  return (
    <PlatformPage>
      <div role="status" aria-label={t("platformFinance.gyms.loading")}>
        <div className="h-7 w-56 animate-pulse rounded-md bg-sunken" />
        <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded-md bg-sunken" />
        <div className="mt-5 h-16 animate-pulse rounded-lg border border-line bg-surface" />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["one", "two", "three"].map((key) => <div key={key} className="h-60 animate-pulse rounded-lg border border-line bg-surface" />)}
        </div>
      </div>
    </PlatformPage>
  );
}

function lifecycleDeadline(gym: MarketplaceGym, f: ReturnType<typeof useFormat>, t: TFunction): { label: string; value: string } {
  if (gym.subscriptionStatus === "trial") return { label: t("platformFinance.gyms.trialEnds"), value: formatLifecycleDate(gym.trialEndsAt, f, t) };
  if (gym.subscriptionStatus === "cancelled") return { label: t("platformFinance.gyms.cancelled"), value: formatLifecycleDate(gym.cancelledAt, f, t) };
  return { label: t("platformFinance.gyms.periodEnds"), value: formatLifecycleDate(gym.currentPeriodEndsAt, f, t) };
}

function formatLifecycleDate(value: string | undefined, f: ReturnType<typeof useFormat>, t: TFunction): string {
  return value ? f.dateTime(value) : t("platformFinance.gyms.dateNotConfigured");
}

function isArchivedGym(gym: MarketplaceGym): boolean {
  const lifecycle = gym as MarketplaceGym & { isArchived?: boolean; archivedAt?: string | null };
  return lifecycle.isArchived === true || Boolean(lifecycle.archivedAt);
}

function Metric({ icon, value, label }: { icon?: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2.5">
      <dd className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">{icon ? <span className="shrink-0 text-ink-3 [&_svg]:size-3.5" aria-hidden>{icon}</span> : null}<span className="truncate tabular">{value}</span></dd>
      <dt className="mt-0.5 text-[12px] font-medium text-ink-3">{label}</dt>
    </div>
  );
}
