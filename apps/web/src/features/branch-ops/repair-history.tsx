"use client";

import { History, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EquipmentAsset, EquipmentIssue, EquipmentWorkOrder, SameFaultReading } from "@/lib/domain/types";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { StatusBadge } from "@/features/operations/operations-shared";
import { DateTimeText } from "@/components/shared/data-display";
import { OPEN_ISSUE_STATUSES, recurringSummary, relatedRepairHistory, resolveSameFaultReading } from "../../../convex/branchOpsAssist";

function SameFaultCheck({ current, other, onReading }: { current: { id: string }; other: { id: string }; onReading: (otherIssueId: string, reading: SameFaultReading | undefined) => void }) {
  const suggestion = useAssistJudgment({ questionKey: "branchops.same_fault", subject: { issueId: current.id, otherIssueId: other.id }, enabled: true, auto: false });
  const reading = suggestion.state.status === "ready" ? resolveSameFaultReading(suggestion.state.result.judgment) : undefined;
  const verdictKey = reading ? `${reading.verdict}:${reading.probability.toFixed(3)}` : "";
  useEffect(() => { onReading(other.id, reading); }, [other.id, verdictKey, onReading]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!suggestion.status || !suggestion.featureReady) return null;
  return (
    <div className="space-y-2">
      {suggestion.state.status === "idle" ? <Button type="button" size="xs" variant="secondary" data-testid={`same-fault-check-${other.id}`} onClick={suggestion.request}><Sparkles /> Compare with Jev</Button> : null}
      <AssistSuggestion
        suggestion={suggestion}
        title="Same fault?"
        testId={`same-fault-${other.id}`}
        render={() => reading ? <p><span className="font-semibold text-ink" data-testid={`same-fault-verdict-${other.id}`}>{reading.label}</span> · {reading.explanation}</p> : null}
      />
    </div>
  );
}

/**
 * Related repair history for the selected machine. The relationship is the
 * record: every report on this one machine, with its linked work orders,
 * newest first. Similar wording only proposes a comparison; an explicit Jev
 * check says whether an earlier report is the same fault, a separate fault,
 * or unclear. Severity, safety status and the repair decision are untouched.
 */
export function RepairHistoryPanel({ asset, issues, workOrders }: { asset: EquipmentAsset; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[] }) {
  const machineIssues = useMemo(() => issues.filter((issue) => issue.assetId === asset.id).sort((left, right) => right.reportedAt.localeCompare(left.reportedAt)), [issues, asset.id]);
  const anchor = machineIssues.find((issue) => OPEN_ISSUE_STATUSES.has(issue.status)) ?? machineIssues[0];
  const [readings, setReadings] = useState<Record<string, SameFaultReading | undefined>>({});
  const onReading = useMemo(() => (otherIssueId: string, reading: SameFaultReading | undefined) => setReadings((current) => (current[otherIssueId] === reading ? current : { ...current, [otherIssueId]: reading })), []);
  if (!anchor) {
    return <section className="space-y-2 border-t border-line p-5" aria-label="Related repair history" data-testid="repair-history"><ContextLine /><p className="text-[12.5px] text-ink-3">No report exists for this machine yet. Other machines and other branches are not included, even with the same name.</p></section>;
  }
  const history = relatedRepairHistory(anchor, machineIssues, workOrders);
  const confirmed = Object.values(readings).filter((reading) => reading?.verdict === "same_fault" && reading.probability >= 0.7).length;
  return (
    <section className="space-y-3 border-t border-line p-5" aria-label="Related repair history" data-testid="repair-history">
      <ContextLine />
      <div className="rounded-md border border-line bg-sunken/40 p-3">
        <p className="text-[12px] text-ink-3">{OPEN_ISSUE_STATUSES.has(anchor.status) ? "Current report" : "Latest report"}</p>
        <p className="mt-0.5 text-[13px] font-medium">{anchor.title}</p>
        <p className="mt-0.5 text-[12px] text-ink-3"><StatusBadge status={anchor.status} /> · {anchor.severity} · <StatusBadge status={anchor.safetyStatus} /> · reported <DateTimeText iso={anchor.reportedAt} /></p>
      </div>
      <p className="text-[12px] text-ink-3" data-testid="repair-history-disclosure">{history.disclosure}</p>
      <p className="text-[12.5px] text-ink-2" data-testid="repair-history-recurring">{recurringSummary(confirmed)}</p>
      {history.entries.length ? (
        <ul className="space-y-2" data-testid="repair-history-entries">
          {history.entries.map((entry) => (
            <li key={entry.issue.id} className="rounded-md border border-line p-3" data-testid="repair-history-entry" data-issue-id={entry.issue.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{entry.issue.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{entry.issue.severity} · <StatusBadge status={entry.issue.safetyStatus} /> · reported <DateTimeText iso={entry.issue.reportedAt} />{entry.issue.resolvedAt ? <> · resolved <DateTimeText iso={entry.issue.resolvedAt} /></> : null}</p>
                  {entry.issue.description ? <p className="mt-1 text-[12.5px] text-ink-2">{entry.issue.description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1"><StatusBadge status={entry.issue.status} />{entry.similarWording ? <Badge variant="outline" data-testid="repair-history-similar">similar wording</Badge> : null}{readings[entry.issue.id]?.verdict === "same_fault" && (readings[entry.issue.id]?.probability ?? 0) >= 0.7 ? <Badge variant="warning" data-testid="repair-history-recurring-badge">recurring</Badge> : null}</div>
              </div>
              {entry.workOrders.length ? <ul className="mt-2 space-y-1 text-[12px] text-ink-2">{entry.workOrders.map((order) => <li key={order.id}>Work order: {order.description} · <StatusBadge status={order.status} />{order.vendorName ? ` · ${order.vendorName}` : ""}</li>)}</ul> : null}
              {entry.similarWording && anchor.id !== entry.issue.id ? <div className="mt-2"><SameFaultCheck current={anchor} other={entry.issue} onReading={onReading} /></div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ContextLine() {
  return <p className="context-label flex items-center gap-1.5"><History className="size-3.5" aria-hidden /> Related repair history</p>;
}
