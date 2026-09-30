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
  { kind: "income", title: "Income statement", description: "What the gym earned and spent, and the profit or loss.", href: "/finance/income-statement", icon: TrendingUp },
  { kind: "balance", title: "Balance sheet", description: "What the gym owns and owes on one day.", href: "/finance/balance-sheet", icon: Scale },
  { kind: "cashflow", title: "Cash flow statement", description: "Where cash came from and where it went.", href: "/finance/cash-flow", icon: Banknote },
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
    return <><PageHeader title="Management ledger" description="Loading your reports…" /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading management ledger"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (!canRead) return <ForbiddenState description="You don't have access to the financial statements. Ask the gym owner if you need them." />;
  if (workspaceQuery.isLoading) {
    return <><PageHeader title="Management ledger" description="Loading your reports…" /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label="Loading management ledger"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title="Financial statements are not in your plan" description="Your plan does not include the income statement, balance sheet and cash flow statement. Contact RIVET to add them." className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title="Financial statements are turned off" description="The gym owner can turn them on in Settings." className="mt-4" />;

  return (
    <div className="space-y-6" data-testid="management-ledger-home">
      <PageHeader title="Management ledger" description="See if the gym makes money, what it owns and owes, and where cash went." />
      <div className={canManageControls ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"} aria-label="Financial statements">
        {STATEMENT_CARDS.map((card) => (
          <Link key={card.kind} href={scopedStatementHref(card.href, fromDate, toDate, branchFilter)} data-testid={`statement-card-${card.kind}`} className="group panel flex min-h-44 flex-col p-5 transition-colors hover:border-ink-3 hover:bg-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><card.icon className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">{card.title}</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">{card.description}</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">Open statement <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
        ))}
        {canManageControls ? (
          <Link href="/finance/controls" aria-label="Bookkeeping" data-testid="ledger-card-controls" className="group panel flex min-h-44 flex-col p-5 transition-colors hover:border-ink-3 hover:bg-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><SlidersHorizontal className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">Bookkeeping</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">Add sales and costs to the books, fix mistakes, and close each month.</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">Open bookkeeping <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
        ) : null}
      </div>
      <LedgerTutorial />
      <p className="text-[12px] text-ink-3">The numbers only include what has been added to the books. Each statement warns you if something may be missing.</p>
    </div>
  );
}
