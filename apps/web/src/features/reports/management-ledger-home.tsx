"use client";

import { ArrowRight, Banknote, LockKeyhole, Scale, SlidersHorizontal, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import type { WorkspaceAccess } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { LedgerTutorial } from "./ledger-tutorial";
import { scopedStatementHref } from "./management-statements-workspace";
import { PageHeader } from "@/components/shared/chrome";
import { Skeleton } from "@/components/ui/misc";
import { ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";

const STATEMENT_CARDS: readonly { kind: "income" | "balance" | "cashflow"; title: string; description: string; href: string; icon: LucideIcon }[] = [
  { kind: "income", title: "Income statement", description: "See revenue, costs, and net income for a selected period.", href: "/finance/income-statement", icon: TrendingUp },
  { kind: "balance", title: "Balance sheet", description: "Review assets, liabilities, and equity at a selected date.", href: "/finance/balance-sheet", icon: Scale },
  { kind: "cashflow", title: "Cash flow statement", description: "Understand how cash moved through the business.", href: "/finance/cash-flow", icon: Banknote },
];

export function ManagementLedgerHome() {
  const { session, sessionLoading } = useApp();
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const canRead = can("reports.financial.read");
  const fromDate = searchParams.get("from") ?? searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("to") ?? searchParams.get("toDate") ?? "";
  const branchFilter = searchParams.get("branchId") || "all";
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) && canRead });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const reportingModule = workspace?.modules.find((module) => module.key === "reporting");
  const canManageControls = session?.roles.some((role) => role === "owner" || role === "manager") ?? false;

  if (sessionLoading && !session) {
    return <><PageHeader title="Management ledger" description="Loading your reporting workspace…" /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading management ledger"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (!canRead) return <ForbiddenState description="Management statements are limited to roles with financial reporting access." />;
  if (workspaceQuery.isLoading) {
    return <><PageHeader title="Management ledger" description="Loading your reporting workspace…" /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading management ledger"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title="Management reporting is not included" description="The Pro reporting workspace module adds the income statement, balance sheet, and cash flow statement." className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title="Management reporting is paused" description="An organization owner can enable the reporting module from workspace settings." className="mt-4" />;

  return (
    <div className="space-y-6" data-testid="management-ledger-home">
      <PageHeader title="Management ledger" description="Choose a statement to review the gym’s financial position." />
      <div className={canManageControls ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"} aria-label="Financial statements">
        {STATEMENT_CARDS.map((card) => (
          <Link key={card.kind} href={scopedStatementHref(card.href, fromDate, toDate, branchFilter)} data-testid={`statement-card-${card.kind}`} className="group flex min-h-48 flex-col rounded-lg border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink-3 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><card.icon className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">{card.title}</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">{card.description}</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">Open statement <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
        ))}
        {canManageControls ? (
          <Link href="/finance/controls" aria-label="Ledger controls" data-testid="ledger-card-controls" className="group flex min-h-48 flex-col rounded-lg border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink-3 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><SlidersHorizontal className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">Ledger controls</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">Refresh the queue, post or exclude facts, and run the month-end clicks that keep the statements current.</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">Open controls <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
        ) : null}
      </div>
      <LedgerTutorial />
      <p className="text-[11.5px] text-ink-3">Figures come from posted management-ledger entries for the selected branch and period. Each statement explains any incomplete source coverage.</p>
    </div>
  );
}
