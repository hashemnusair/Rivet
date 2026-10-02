"use client";

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
import { formatDateTime } from "@/lib/utils/dates";
import { sortGymDirectory } from "@/lib/platform/gym-directory";
import { PageHeader } from "@/components/shared/chrome";
import { ContextLabel } from "@/components/ui/typography";

type GymFilter = "all" | MarketplaceGym["subscriptionStatus"];

const PLATFORM_SNAPSHOT_KEY = ["platform", "snapshot"] as const;
const EMPTY_GYMS: MarketplaceGym[] = [];
const STATUS_FILTERS: Array<{ value: GymFilter; label: string }> = [
  { value: "active", label: "Active gyms" },
  { value: "all", label: "All gyms" },
  { value: "trial", label: "Trial" },
  { value: "overdue", label: "Past due" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
];
const DEFAULT_FILTER: GymFilter = "active";

function parseFilter(value: string | null): GymFilter {
  return STATUS_FILTERS.some((item) => item.value === value) ? (value as GymFilter) : DEFAULT_FILTER;
}

export default function PlatformGymsPage() {
  const router = useRouter();
  const pathname = usePathname();
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
  const normalizedQuery = query.trim().toLowerCase();
  const gyms = useMemo(
    () => sortGymDirectory(directory.filter((gym) => {
      const matchesSearch = !normalizedQuery || `${gym.id} ${gym.name} ${gym.areas.join(" ")} ${gym.rivetPlan}`.toLowerCase().includes(normalizedQuery);
      return matchesSearch && (filter === "all" || gym.subscriptionStatus === filter);
    })),
    [directory, filter, normalizedQuery],
  );
  const statusCounts = useMemo(
    () => STATUS_FILTERS.reduce<Record<GymFilter, number>>((counts, item) => {
      counts[item.value] = item.value === "all" ? directory.length : directory.filter((gym) => gym.subscriptionStatus === item.value).length;
      return counts;
    }, { all: 0, active: 0, trial: 0, overdue: 0, suspended: 0, cancelled: 0 }),
    [directory],
  );
  const hasFilters = Boolean(normalizedQuery) || filter !== DEFAULT_FILTER;
  const showingStaleDirectory = directoryQuery.isBackgroundError || directoryQuery.streamState === "fallback";

  if (directoryQuery.isLoading && !directoryQuery.data) {
    return <GymDirectoryLoading />;
  }

  if (directoryQuery.isError && !directoryQuery.data) {
    return (
      <PlatformPage>
        <ErrorState
          title="Gym directory unavailable"
          description="RIVET could not load the platform tenant directory. No listing changes were made."
          onRetry={() => directoryQuery.refetch()}
        />
      </PlatformPage>
    );
  }

  return (
    <PlatformPage>
      <PageHeader
        title="Gym organizations"
        description="Every gym organization, its branches, subscription state and public directory visibility."
        actions={<Button asChild variant="secondary"><Link href="/platform/applications">Review applications <ArrowRight /></Link></Button>}
      />

      {showingStaleDirectory ? (
        <div className="mt-5">
          <StaleNotice onRetry={() => directoryQuery.refetch()}>Showing the last known tenant directory while the live connection recovers.</StaleNotice>
        </div>
      ) : null}

      <PlatformPanel className="mt-5 grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <label className="relative block" htmlFor="gym-directory-search">
          <span className="sr-only">Search gym organizations</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input id="gym-directory-search" value={query} onChange={(event) => changeQuery(event.target.value)} className="ps-9" placeholder="Search gyms, areas, plans, or IDs" />
        </label>
        <FilterPills
          label="Filter gym organizations by subscription status"
          value={filter}
          items={STATUS_FILTERS.map((item) => ({ ...item, count: statusCounts[item.value] }))}
          onChange={changeFilter}
        />
      </PlatformPanel>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3" aria-live="polite">
        <p>{gyms.length} {gyms.length === 1 ? "gym" : "gyms"} shown{hasFilters ? " with the current filters" : ""}.</p>
        {hasFilters ? <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
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
            title={hasFilters ? "No gyms match these filters" : "No gyms in the directory"}
            description={hasFilters ? "Try another search or subscription status, or clear the filters to see every tenant." : "No provisioned gym organizations are available yet. Review applications to add the first tenant."}
            action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button asChild variant="secondary" size="sm"><Link href="/platform/applications">Review applications <ArrowRight className="rtl:rotate-180" /></Link></Button>}
          />
        </div>
      )}
    </PlatformPage>
  );
}

function GymCard({ gym }: { gym: MarketplaceGym }) {
  const titleId = `gym-card-${gym.id}`;
  const lifecycle = lifecycleDeadline(gym);
  return (
    <article aria-labelledby={titleId} className="flex flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-3 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <PlatformGymLogo name={gym.name} shortName={gym.shortName} accent={gym.accent} logoUrl={gym.logoUrl} className="size-11 rounded-md text-[11px]" />
        <SubscriptionStatusBadge status={gym.subscriptionStatus} aria-label={`Subscription status: ${subscriptionStatusLabel(gym.subscriptionStatus)}`} />
      </div>
      <h2 id={titleId} className="mt-4 truncate text-[15px] font-semibold">{gym.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-3"><MapPin className="size-3.5 shrink-0" aria-hidden />{gym.areas.length > 0 ? gym.areas.join(" · ") : "Area not configured"}</p>
      <dl className="mt-4 grid grid-cols-3 gap-px border-y border-line bg-line py-px">
        <Metric icon={<Building2 />} value={String(gym.branchCount)} label="branches" />
        <Metric icon={<Users />} value={gym.memberCount.toLocaleString()} label="members" />
        <Metric value={gym.rivetPlan} label="plan" />
      </dl>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <ContextLabel>{lifecycle.label}</ContextLabel>
          <p className="mt-0.5 truncate text-[13px] font-medium">{lifecycle.value}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/platform/gyms/${gym.id}`} aria-label={`Open ${gym.name} admin details`}>Open <ArrowRight className="rtl:rotate-180" /></Link>
        </Button>
      </div>
    </article>
  );
}

function GymDirectoryLoading() {
  return (
    <PlatformPage>
      <div role="status" aria-label="Loading gym directory">
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

function lifecycleDeadline(gym: MarketplaceGym): { label: string; value: string } {
  if (gym.subscriptionStatus === "trial") return { label: "Trial ends", value: formatLifecycleDate(gym.trialEndsAt) };
  if (gym.subscriptionStatus === "cancelled") return { label: "Cancelled", value: formatLifecycleDate(gym.cancelledAt) };
  return { label: "Period ends", value: formatLifecycleDate(gym.currentPeriodEndsAt) };
}

function formatLifecycleDate(value: string | undefined): string {
  return value ? formatDateTime(value) : "Date not configured";
}

function isArchivedGym(gym: MarketplaceGym): boolean {
  const lifecycle = gym as MarketplaceGym & { isArchived?: boolean; archivedAt?: string | null };
  return lifecycle.isArchived === true || Boolean(lifecycle.archivedAt);
}

function Metric({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return (
    <div className="min-w-0 bg-surface px-3 py-2.5">
      <dd className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">{icon ? <span className="shrink-0 text-ink-3 [&_svg]:size-3.5" aria-hidden>{icon}</span> : null}<span className="truncate tabular">{value}</span></dd>
      <dt className="mt-0.5 text-[12px] font-medium text-ink-3">{label}</dt>
    </div>
  );
}
