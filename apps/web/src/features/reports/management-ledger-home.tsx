"use client";
import { useT } from "@/lib/i18n/provider";

import { ArrowRight, Banknote, LockKeyhole, Scale, SlidersHorizontal, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { TKey } from "@/lib/i18n/core";
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

const STATEMENT_CARDS: readonly { kind: "income" | "balance" | "cashflow"; title: TKey; description: TKey; href: string; icon: LucideIcon }[] = [
  { kind: "income", title: "ledgerWorkspace.incomeStatement", description: "ledgerWorkspace.incomeHint", href: "/finance/income-statement", icon: TrendingUp },
  { kind: "balance", title: "ledgerWorkspace.balanceSheet", description: "ledgerWorkspace.balanceHint", href: "/finance/balance-sheet", icon: Scale },
  { kind: "cashflow", title: "ledgerWorkspace.cashflowStatement", description: "ledgerWorkspace.cashflowHint", href: "/finance/cash-flow", icon: Banknote },
];

export function ManagementLedgerHome() {
  const t = useT();
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
    return <><PageHeader title={t("nav.section.managementLedger")} description={t("ledgerWorkspace.loadingReports")} /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label={t("ledgerWorkspace.loadingLedger")}><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (!canRead) return <ForbiddenState description={t("ledgerWorkspace.noStatementsAccess")} />;
  if (workspaceQuery.isLoading) {
    return <><PageHeader title={t("nav.section.managementLedger")} description={t("ledgerWorkspace.loadingReports")} /><div className="grid gap-4 sm:grid-cols-3" role="status" aria-label={t("ledgerWorkspace.loadingLedger")}><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div></>;
  }
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title={t("ledgerWorkspace.statementsPlanMissing")} description={t("ledgerWorkspace.statementsPlanHint")} className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title={t("ledgerWorkspace.statementsOff")} description={t("ledgerWorkspace.ownerEnableStatements")} className="mt-4" />;

  return (
    <div className="space-y-6" data-testid="management-ledger-home">
      <PageHeader title={t("nav.section.managementLedger")} description={t("ledgerWorkspace.homeHint")} />
      <div className={canManageControls ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-4 sm:grid-cols-3"} aria-label={t("ledgerWorkspace.financialStatements")}>
        {STATEMENT_CARDS.map((card) => (
          <Link key={card.kind} href={scopedStatementHref(card.href, fromDate, toDate, branchFilter)} data-testid={`statement-card-${card.kind}`} className="group panel flex min-h-44 flex-col p-5 transition-colors hover:border-ink-3 hover:bg-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><card.icon className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">{t(card.title)}</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">{t(card.description)}</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">{t("ledgerWorkspace.openStatement")}{" "}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden /></span>
          </Link>
        ))}
        {canManageControls ? (
          <Link href="/finance/controls" aria-label={t("ledgerWorkspace.bookkeeping")} data-testid="ledger-card-controls" className="group panel flex min-h-44 flex-col p-5 transition-colors hover:border-ink-3 hover:bg-sunken/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink">
            <span className="flex size-10 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper"><SlidersHorizontal className="size-5" aria-hidden /></span>
            <h2 className="mt-5 text-[17px] font-semibold">{t("ledgerWorkspace.bookkeeping")}</h2>
            <p className="mt-2 max-w-[26rem] text-[12.5px] leading-relaxed text-ink-3">{t("ledgerWorkspace.controlsHint")}</p>
            <span className="mt-auto flex items-center gap-1.5 pt-5 text-[12px] font-medium text-ink-2">{t("ledgerWorkspace.openBookkeeping")}{" "}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden /></span>
          </Link>
        ) : null}
      </div>
      <LedgerTutorial />
      <p className="text-[12px] text-ink-3">{t("ledgerWorkspace.postedOnlyHint")}</p>
    </div>
  );
}
