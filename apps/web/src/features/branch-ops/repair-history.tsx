"use client";
import { useT } from "@/lib/i18n/provider";

import { History } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import type { EquipmentAsset, EquipmentIssue, EquipmentWorkOrder } from "@/lib/domain/types";
import { StatusBadge, severityLabel } from "@/features/operations/operations-shared";
import { DateTimeText } from "@/components/shared/data-display";
import { useFormat } from "@/lib/i18n/format";
import { OPEN_ISSUE_STATUSES, relatedRepairHistory } from "../../../convex/branchOpsAssist";

/**
 * Related repair history for the selected machine. The relationship is the
 * record: every report on this one machine, with its linked work orders,
 * newest first. Similar wording is disclosed for manual review; it does not
 * merge records or decide whether two reports are the same fault. Severity,
 * safety status and the repair decision are untouched.
 */
export function RepairHistoryPanel({ asset, issues, workOrders }: { asset: EquipmentAsset; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[] }) {
  const t = useT();
  const f = useFormat();
  const machineIssues = useMemo(() => issues.filter((issue) => issue.assetId === asset.id).sort((left, right) => right.reportedAt.localeCompare(left.reportedAt)), [issues, asset.id]);
  const anchor = machineIssues.find((issue) => OPEN_ISSUE_STATUSES.has(issue.status)) ?? machineIssues[0];
  if (!anchor) {
    return <section className="space-y-2 border-t border-line p-5" aria-label={t("operationsWorkspace.repairHistory")} data-testid="repair-history"><ContextLine /><p className="text-[12.5px] text-ink-3">{t("operationsWorkspace.noMachineProblems")}</p></section>;
  }
  const history = relatedRepairHistory(anchor, machineIssues, workOrders);
  const similarReports = history.entries.filter((entry) => entry.similarWording).length;
  const firstReportedAt = machineIssues[machineIssues.length - 1]?.reportedAt;
  return (
    <section className="space-y-3 border-t border-line p-5" aria-label={t("operationsWorkspace.repairHistory")} data-testid="repair-history">
      <ContextLine />
      <div className="rounded-md border border-line bg-sunken/40 p-3">
        <p className="text-[12px] text-ink-3">{OPEN_ISSUE_STATUSES.has(anchor.status) ? t("operationsWorkspace.currentProblem") : t("operationsWorkspace.latestProblem")}</p>
        <p className="mt-0.5 text-[13px] font-medium">{anchor.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-3"><StatusBadge status={anchor.status} /> {" "}{t("operationsWorkspace.severitySegment")}{" "}{severityLabel(anchor.severity, t)} · <StatusBadge status={anchor.safetyStatus} /> {" "}{t("operationsWorkspace.reportedSegment")}{" "}<DateTimeText iso={anchor.reportedAt} /></p>
      </div>
      <p className="text-[12px] text-ink-3" data-testid="repair-history-disclosure">{history.entries.length ? t("operationsWorkspace.historySince", { problems: t("operationsWorkspace.reportedProblems", { count: machineIssues.length }), date: firstReportedAt ? f.date(firstReportedAt) : "—" }) : t("operationsWorkspace.noEarlierProblems")}</p>
      <p className="text-[12.5px] text-ink-2" data-testid="repair-history-recurring">{similarReports ? t("operationsWorkspace.similarReports", { reports: t("operationsWorkspace.similarCount", { count: similarReports }) }) : t("operationsWorkspace.noSimilarWords")}</p>
      {history.entries.length ? (
        <ul className="space-y-2" data-testid="repair-history-entries">
          {history.entries.map((entry) => (
            <li key={entry.issue.id} className="rounded-md border border-line p-3" data-testid="repair-history-entry" data-issue-id={entry.issue.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{entry.issue.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{t("operationsWorkspace.severityPrefix")}{" "}{severityLabel(entry.issue.severity, t)} · <StatusBadge status={entry.issue.safetyStatus} /> {" "}{t("operationsWorkspace.reportedSegment")}{" "}<DateTimeText iso={entry.issue.reportedAt} />{entry.issue.resolvedAt ? <> {" "}{t("operationsWorkspace.fixedSegment")}{" "}<DateTimeText iso={entry.issue.resolvedAt} /></> : null}</p>
                  {entry.issue.description ? <p className="mt-1 text-[12.5px] text-ink-2">{entry.issue.description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1"><StatusBadge status={entry.issue.status} />{entry.similarWording ? <Badge variant="outline" data-testid="repair-history-similar">{t("operationsWorkspace.similarWords")}</Badge> : null}</div>
              </div>
              {entry.workOrders.length ? <ul className="mt-2 space-y-1 text-[12px] text-ink-2">{entry.workOrders.map((order) => <li key={order.id}>{t("operationsWorkspace.repairPrefix")}{" "}{order.description} · <StatusBadge status={order.status} />{order.vendorName ? ` · ${order.vendorName}` : ""}</li>)}</ul> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ContextLine() {
  const t = useT();
  return <p className="context-label flex items-center gap-1.5"><History className="size-3.5" aria-hidden /> {" "}{t("operationsWorkspace.repairHistory")}</p>;
}
