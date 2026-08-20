"use client";

import { ArrowRight, Building2, CircleAlert, MapPin, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import type { PlatformSnapshot } from "@/lib/api/GymOSApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { formatMoney } from "@/lib/utils/money";

type GymFilter = "all" | MarketplaceGym["subscriptionStatus"];

const PLATFORM_SNAPSHOT_KEY = ["platform", "snapshot"] as const;
const EMPTY_GYMS: MarketplaceGym[] = [];
const STATUS_FILTERS: Array<{ value: GymFilter; label: string }> = [
  { value: "all", label: "All gyms" },
  { value: "active", label: "Active" },
  { value: "trial", label: "Trial" },
  { value: "overdue", label: "Past due" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
];

export default function PlatformGymsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GymFilter>("all");
  const directoryQuery = useRealtimeApiQuery<PlatformSnapshot>({
    queryKey: PLATFORM_SNAPSHOT_KEY,
    query: (api) => api.getPlatformSnapshot(),
    subscribe: (api, onValue, onError) => api.subscribePlatformSnapshot(onValue, onError),
  });
  const directory = directoryQuery.data?.gyms ?? EMPTY_GYMS;
  const normalizedQuery = query.trim().toLowerCase();
  const gyms = useMemo(
    () => directory.filter((gym) => {
      const matchesSearch = !normalizedQuery || `${gym.id} ${gym.name} ${gym.areas.join(" ")} ${gym.rivetPlan}`.toLowerCase().includes(normalizedQuery);
      return matchesSearch && (filter === "all" || gym.subscriptionStatus === filter);
    }),
    [directory, filter, normalizedQuery],
  );
  const statusCounts = useMemo(
    () => STATUS_FILTERS.reduce<Record<GymFilter, number>>((counts, item) => {
      counts[item.value] = item.value === "all" ? directory.length : directory.filter((gym) => gym.subscriptionStatus === item.value).length;
      return counts;
    }, { all: 0, active: 0, trial: 0, overdue: 0, suspended: 0, cancelled: 0 }),
    [directory],
  );
  const unsafeListings = useMemo(
    () => directory.filter((gym) => !isPublicSubscriptionStatus(gym.subscriptionStatus) && gym.isPublic !== false),
    [directory],
  );
  const hasFilters = Boolean(normalizedQuery) || filter !== "all";
  const showingStaleDirectory = directoryQuery.isBackgroundError || directoryQuery.streamState === "fallback";
  const clearFilters = () => {
    setQuery("");
    setFilter("all");
  };

  if (directoryQuery.isLoading && !directoryQuery.data) {
    return <GymDirectoryLoading />;
  }

  if (directoryQuery.isError && !directoryQuery.data) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1480px]">
          <ErrorState
            title="Gym directory unavailable"
            description="RIVET could not load the platform tenant directory. No listing changes were made."
            onRetry={() => directoryQuery.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="eyebrow">Tenant directory</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Gym organizations</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] text-ink-2">Manage every gym organization, its branches, subscription state, and public directory visibility.</p>
          </div>
          <Button asChild variant="signal">
            <Link href="/platform/applications"><Plus />Add gym</Link>
          </Button>
        </div>

        {showingStaleDirectory ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning-deep" role="status" aria-live="polite">
            <span>Showing the last known tenant directory while the live connection recovers.</span>
            <Button variant="secondary" size="sm" onClick={() => directoryQuery.refetch()}>Retry</Button>
          </div>
        ) : null}

        {unsafeListings.length > 0 ? (
          <div className="mt-5 flex items-start gap-3 border border-danger/30 bg-danger-bg px-4 py-3 text-[11.5px] text-danger" role="alert">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p><strong>{unsafeListings.length} non-public-eligible {unsafeListings.length === 1 ? "gym still carries" : "gyms still carry"} a public flag.</strong> Public discovery is suppressed for past-due, suspended, and cancelled statuses; open each record to save the hidden listing state and preserve the audit trail.</p>
          </div>
        ) : null}

        <div className="mt-7 grid gap-3 border border-line bg-surface p-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="relative block" htmlFor="gym-directory-search">
            <span className="sr-only">Search gym organizations</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input id="gym-directory-search" value={query} onChange={(event) => setQuery(event.target.value)} className="ps-9" placeholder="Search gyms, areas, plans, or IDs" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter gym organizations by subscription status">
            {STATUS_FILTERS.map((item) => (
              <Button
                key={item.value}
                variant={filter === item.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
              >
                {item.label} <span className="font-mono text-[10px] opacity-70">{statusCounts[item.value]}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3" aria-live="polite">
          <p>{gyms.length} {gyms.length === 1 ? "gym" : "gyms"} shown{hasFilters ? " with the current filters" : ""}.</p>
          {hasFilters ? <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
        </div>

        {gyms.length > 0 ? (
          <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {gyms.map((gym) => <GymCard key={gym.id} gym={gym} />)}
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              icon={Building2}
              title={hasFilters ? "No gyms match these filters" : "No gyms in the directory"}
              description={hasFilters ? "Try another search or subscription status, or clear the filters to see every tenant." : "No provisioned gym organizations are available yet. Review applications to add the first tenant."}
              action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}>Clear filters</Button> : <Button asChild variant="secondary" size="sm"><Link href="/platform/applications">Review applications <ArrowRight className="rtl:rotate-180" /></Link></Button>}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function GymCard({ gym }: { gym: MarketplaceGym }) {
  const status = statusPresentation(gym.subscriptionStatus);
  const listing = listingPresentation(gym);
  const titleId = `gym-card-${gym.id}`;
  return (
    <article aria-labelledby={titleId} className="group border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-pop">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center font-mono text-[10px] font-semibold text-white" style={{ backgroundColor: gym.accent }} aria-hidden>
          {gym.shortName.slice(0, 3)}
        </span>
        <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.1em] ${status.className}`} aria-label={`Subscription status: ${status.label}`}>{status.label}</span>
          <span className={`rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.1em] ${listing.className}`} aria-label={`Public directory status: ${listing.label}`}>{listing.label}</span>
        </div>
      </div>
      <h2 id={titleId} className="mt-5 truncate text-[19px] font-semibold">{gym.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3"><MapPin className="size-3 shrink-0" aria-hidden />{gym.areas.length > 0 ? gym.areas.join(" · ") : "Area not configured"}</p>
      <div className="mt-6 grid grid-cols-3 gap-px border-y border-line bg-line py-px">
        <Metric icon={<Building2 />} value={String(gym.branchCount)} label="branches" />
        <Metric icon={<Users />} value={gym.memberCount.toLocaleString()} label="members" />
        <Metric value={gym.rivetPlan} label="plan" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Gym revenue</p>
          <p className="mt-1 truncate text-[13px] font-semibold">{formatMoney({ amount: gym.monthlyRevenueMinor, currency: "JOD" })}</p>
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
    <div className="space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" role="status" aria-label="Loading gym directory">
      <div className="mx-auto max-w-[1480px]">
        <div className="h-3 w-28 animate-pulse bg-sunken" />
        <div className="mt-3 h-9 w-64 animate-pulse bg-sunken" />
        <div className="mt-2 h-4 w-full max-w-xl animate-pulse bg-sunken" />
        <div className="mt-7 h-20 animate-pulse border border-line bg-surface" />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {["one", "two", "three"].map((key) => <div key={key} className="h-64 animate-pulse border border-line bg-surface" />)}
        </div>
      </div>
    </div>
  );
}

function statusPresentation(status: MarketplaceGym["subscriptionStatus"]) {
  if (status === "active") return { label: "Active", className: "bg-success-bg text-success" };
  if (status === "trial") return { label: "Trial", className: "bg-info-bg text-info" };
  if (status === "overdue") return { label: "Past due", className: "bg-warning-bg text-warning" };
  return { label: status === "cancelled" ? "Cancelled" : "Suspended", className: "bg-danger-bg text-danger" };
}

function listingPresentation(gym: MarketplaceGym) {
  if (!isPublicSubscriptionStatus(gym.subscriptionStatus)) {
    return { label: "Suppressed", className: "bg-danger-bg text-danger" };
  }
  if (gym.isPublic === false) return { label: "Hidden", className: "bg-warning-bg text-warning" };
  return { label: "Public", className: "bg-success-bg text-success" };
}

function isPublicSubscriptionStatus(status: MarketplaceGym["subscriptionStatus"]): boolean {
  return status === "active" || status === "trial";
}

function Metric({ icon, value, label }: { icon?: React.ReactNode; value: string; label: string }) {
  return <div className="min-w-0 bg-surface px-3 py-3"><div className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold"><span className="shrink-0 text-ink-3 [&_svg]:size-3" aria-hidden>{icon}</span><span className="truncate">{value}</span></div><p className="mt-1 font-mono text-[7.5px] uppercase tracking-[.1em] text-ink-3">{label}</p></div>;
}
