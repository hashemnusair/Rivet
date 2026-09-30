"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { formatTime } from "@/lib/utils/dates";

/**
 * "Needs attention" on the owner and manager dashboards: one plain sentence
 * per kind of unresolved work, each linking to the page where it is done.
 * Every number comes from the server for the viewer's own branches and role.
 * The Today list below it stays the one ordered list of individual tasks.
 *
 * It loads when the dashboard opens and when someone presses Refresh; it does
 * not poll. The cache key includes the viewer, their role and their branches,
 * so a manager with fewer branches never sees an owner's numbers.
 */
export function NeedsAttention({ branchId }: { branchId?: string }) {
  const { session } = useApp();
  const viewer = session ? `${session.user.id}:${session.roles[0] ?? ""}:${session.branches.map((branch) => branch.id).join(",")}` : "anonymous";
  const query = useApiQuery(qk.operatingBrief(viewer, branchId), (api) => api.getOperatingBrief(branchId ? { branchId } : {}), { enabled: Boolean(session), staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false });
  // A server that has not been updated yet still sends the old brief. Show the
  // load error for it instead of crashing or showing a wrong "All clear".
  const brief = Array.isArray(query.data?.attention) ? query.data : undefined;
  const updated = brief ? formatTime(brief.generatedAt) : undefined;

  return (
    <section className="panel overflow-hidden" aria-labelledby="needs-attention-title" data-testid="needs-attention">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="needs-attention-title" className="text-[15px] font-semibold tracking-[-0.01em]">Needs attention</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-3" data-testid="needs-attention-scope">
            {brief ? <>Updated {updated}.</> : "Checking your gym…"}
            {query.isError && brief ? <span className="ms-1 text-warning-deep" data-testid="needs-attention-stale">Could not update. These numbers are from {updated}.</span> : null}
          </p>
        </div>
        <Button type="button" size="xs" variant="ghost" onClick={() => void query.refetch()} loading={query.isFetching} disabled={query.isFetching} data-testid="needs-attention-refresh">
          <RefreshCw /> Refresh
        </Button>
      </header>

      {query.isLoading ? (
        <div className="space-y-2 p-4 sm:px-5" aria-label="Loading">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : !brief ? (
        <p className="px-4 py-6 text-[13px] text-ink-3 sm:px-5" role="status" data-testid="needs-attention-error">
          This could not be loaded.{" "}
          <Button type="button" size="xs" variant="secondary" className="ms-1" onClick={() => void query.refetch()}>Try again</Button>
        </p>
      ) : brief.attention.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-5 text-[13.5px] text-ink-2 sm:px-5" data-testid="needs-attention-clear">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          All clear. Nothing needs attention right now.
        </p>
      ) : (
        <ul className="divide-y divide-line" data-testid="needs-attention-lines">
          {brief.attention.map((line) => (
            <li key={line.key} data-testid="needs-attention-line" data-key={line.key}>
              <Link href={line.href} className="flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/40 focus-visible:bg-sunken/40 sm:px-5">
                {line.urgent ? <AlertTriangle className="size-4 shrink-0 text-danger" aria-label="Urgent" /> : <Circle className="size-2 shrink-0 fill-ink-4 text-ink-4" aria-hidden />}
                <span className={line.urgent ? "min-w-0 flex-1 text-[13.5px] font-medium text-ink" : "min-w-0 flex-1 text-[13.5px] text-ink-2"}>{line.text}</span>
                {line.money ? <MoneyText money={line.money} className="shrink-0 text-[13px] font-medium text-warning-deep" /> : null}
                <ArrowRight className="size-3.5 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {brief?.missing.length ? (
        <p className="border-t border-line px-4 py-2 text-[12px] text-warning-deep sm:px-5" data-testid="needs-attention-missing">
          Could not load {brief.missing.join(", ")}. Press Refresh to try again.
        </p>
      ) : null}
      {brief?.truncated ? (
        <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3 sm:px-5">Very long lists stop at 2,000 items, so some numbers may be higher.</p>
      ) : null}
    </section>
  );
}
