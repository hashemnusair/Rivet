"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { MemberImportField } from "@/lib/api/GymOSApi";
import type { AssistStatus, MembershipPlan } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import {
  IMPORT_FIELD_SPECS,
  columnCompatibleWith,
  columnValueKinds,
  describePlanTerms,
  parseLegacyPlanLabel,
  resolveColumnSuggestion,
  resolvePlanSuggestion,
  type ImportColumnSummary,
  type ImportField,
  type PlanTerms,
  type TermComparison,
} from "../../../convex/jevImportState";

/**
 * Import assistance surfaces. Both suggestions are asked for explicitly, are
 * answered from headings, value-shape summaries and plan labels only, and
 * change nothing until the person accepts them. The normal mapping selects
 * stay the source of truth: an accepted suggestion sets a select the same way
 * a hand would, and a select that is already set is never overwritten.
 */
export function useImportAssist(enabled: boolean): { ready: boolean; status?: AssistStatus } {
  const statusQuery = useApiQuery(qk.assistStatus, (api) => api.getAssistStatus(), { enabled, staleTime: 60_000, refetchOnWindowFocus: false });
  const feature = statusQuery.data?.features.find((candidate) => candidate.key === "import");
  return { ready: enabled && Boolean(feature?.ready), status: statusQuery.data };
}

export function describeColumnShape(summary: ImportColumnSummary): string {
  const kinds = columnValueKinds(summary);
  const kind = kinds.includes("any") ? "empty" : kinds.includes("email") ? "email addresses" : kinds.includes("date") ? "dates" : kinds.includes("phone") ? "phone numbers" : kinds.includes("number") ? "numbers" : kinds.includes("category") ? "a few repeated values" : "text";
  return `${kind} · ${summary.filled} of ${summary.filled + summary.empty} filled${summary.arabicScript ? " · Arabic" : ""}`;
}

export function planTermsOf(plan: MembershipPlan): PlanTerms {
  return { id: plan.id, name: plan.name, code: plan.code, kind: plan.kind, durationDays: plan.durationDays, visitAllowance: plan.visitAllowance, visitValidityDays: plan.visitValidityDays, priceMinor: plan.basePrice.amount, currency: plan.basePrice.currency, branchAccess: plan.branchAccess, branchIds: plan.branchIds, status: plan.status };
}

const FIELD_LABEL = new Map(IMPORT_FIELD_SPECS.map((spec) => [spec.field, spec.label] as const));

export type UseFieldResult = "applied" | "taken";

export function ImportColumnSuggestion({
  draftId,
  column,
  assignedFields,
  headers,
  mapping,
  onUseField,
  onLeaveUnmapped,
}: {
  draftId: string;
  column: ImportColumnSummary;
  assignedFields: ImportField[];
  headers: string[];
  mapping: Partial<Record<MemberImportField, number>>;
  onUseField: (field: ImportField, columnIndex: number) => UseFieldResult;
  onLeaveUnmapped: (columnIndex: number) => void;
}) {
  const suggestion = useAssistJudgment({ questionKey: "import.column_target", subject: { draftId, column: column.index, assigned: assignedFields.join(",") }, auto: false });
  const offered = IMPORT_FIELD_SPECS.map((spec) => spec.field).filter((field) => !assignedFields.includes(field) && columnCompatibleWith(column, field));
  const heading = column.heading || `Column ${column.index + 1}`;
  const loading = suggestion.state.status === "loading";

  const render = (result: AssistReadyResult) => {
    const outcome = resolveColumnSuggestion(result.judgment, offered);
    if (outcome.kind === "field") {
      const takenBy = mapping[outcome.field];
      return (
        <div>
          <p className="font-medium text-ink">Fill <strong>{outcome.label}</strong> from this column.</p>
          {takenBy != null && takenBy !== column.index ? <p className="mt-1 text-warning-deep">{outcome.label} is already matched to “{headers[takenBy] || `Column ${takenBy + 1}`}”. Clear that match first if this column is the right one.</p> : null}
        </div>
      );
    }
    if (outcome.kind === "leave_unmapped") return <p>This column holds nothing RIVET imports. Leave it out of the import.</p>;
    return <p>The heading and the value shape do not point to one RIVET field. Choose a field manually, or leave the column out.</p>;
  };

  const actions = (result: AssistReadyResult) => {
    const outcome = resolveColumnSuggestion(result.judgment, offered);
    if (outcome.kind === "field") {
      const takenBy = mapping[outcome.field];
      const blocked = takenBy != null && takenBy !== column.index;
      return (
        <>
          <Button type="button" size="sm" disabled={blocked} onClick={() => { if (onUseField(outcome.field, column.index) === "applied") suggestion.dismiss(); }}>Use as {outcome.label}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { onLeaveUnmapped(column.index); suggestion.dismiss(); }}>Leave unmapped</Button>
        </>
      );
    }
    if (outcome.kind === "leave_unmapped") return <Button type="button" size="sm" variant="secondary" onClick={() => { onLeaveUnmapped(column.index); suggestion.dismiss(); }}>Leave unmapped</Button>;
    return <Button type="button" size="sm" variant="ghost" onClick={() => { onLeaveUnmapped(column.index); suggestion.dismiss(); }}>Leave unmapped</Button>;
  };

  return (
    <div className="space-y-2" data-testid={`import-column-suggestion-${column.index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={suggestion.request} loading={loading} aria-label={`Suggest mapping for ${heading}`}>
          <Sparkles /> {suggestion.state.status === "ready" ? "Suggest again" : "Suggest mapping"}
        </Button>
        {suggestion.state.status === "disabled" && suggestion.state.message ? <span className="text-[12px] text-ink-3">{suggestion.state.message}</span> : null}
      </div>
      <AssistSuggestion suggestion={suggestion} title={`Column “${heading}”`} render={render} actions={actions} testId={`import-column-card-${column.index}`} />
    </div>
  );
}

const TERM_LABEL: Record<TermComparison, { text: string; variant: "success" | "warning" | "outline" }> = {
  match: { text: "matches", variant: "success" },
  mismatch: { text: "differs", variant: "warning" },
  unknown: { text: "not stated", variant: "outline" },
};

export type UsePlanResult = "applied" | "unavailable";

export function ImportPlanSuggestion({
  draftId,
  label,
  plans,
  currency,
  onUsePlan,
}: {
  draftId: string;
  label: string;
  plans: MembershipPlan[];
  currency: string;
  onUsePlan: (label: string, planId: string) => UsePlanResult;
}) {
  const suggestion = useAssistJudgment({ questionKey: "import.plan_match", subject: { draftId, label }, auto: false });
  const loading = suggestion.state.status === "loading";
  const terms = plans.map(planTermsOf);
  const parsed = parseLegacyPlanLabel(label, currency);

  const render = (result: AssistReadyResult) => {
    const outcome = resolvePlanSuggestion(result.judgment, terms, parsed, currency);
    if (outcome.kind === "no_equivalent") return <p>No current plan corresponds to “<span dir="auto">{label}</span>”. Create the plan first, or leave these members without a membership term.</p>;
    if (outcome.kind === "unclear") return <p>More than one current plan fits “<span dir="auto">{label}</span>”. Choose the plan manually.</p>;
    const { plan, comparison } = outcome;
    const stillCurrent = plans.some((candidate) => candidate.id === plan.id && candidate.status === "active");
    const rows: Array<{ key: string; label: string; value: TermComparison }> = [
      { key: "duration", label: "Duration", value: comparison.duration },
      { key: "visits", label: "Visits", value: comparison.visits },
      { key: "price", label: "Price", value: comparison.price },
      { key: "currency", label: "Currency", value: comparison.currency },
    ];
    return (
      <div className="space-y-2">
        <p><span className="text-ink-3">Source label</span> <span className="font-medium text-ink" dir="auto">{label}</span></p>
        <p><span className="text-ink-3">Proposed plan</span> <span className="font-medium text-ink">{plan.name}</span> <span className="text-ink-2">· {describePlanTerms(plan)}</span></p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Term comparison">
          {rows.map((row) => <li key={row.key}><Badge variant={TERM_LABEL[row.value].variant}>{row.label} {TERM_LABEL[row.value].text}</Badge></li>)}
        </ul>
        {outcome.kind === "incompatible" ? <p className="text-danger">Not a match: {comparison.differences.join(" ")}</p> : null}
        {outcome.kind === "needs_review" ? <p className="text-warning-deep">Needs review: {comparison.differences.join(" ")}</p> : null}
        {!stillCurrent ? <p className="text-warning-deep">This plan is no longer available. Refresh the plan list and ask again.</p> : null}
      </div>
    );
  };

  const actions = (result: AssistReadyResult) => {
    const outcome = resolvePlanSuggestion(result.judgment, terms, parsed, currency);
    if (outcome.kind !== "match" && outcome.kind !== "needs_review") return null;
    const stillCurrent = plans.some((candidate) => candidate.id === outcome.plan.id && candidate.status === "active");
    return (
      <Button type="button" size="sm" variant={outcome.kind === "match" ? "primary" : "secondary"} disabled={!stillCurrent} onClick={() => { if (onUsePlan(label, outcome.plan.id) === "applied") suggestion.dismiss(); }}>
        {outcome.kind === "match" ? "Use this plan" : "Use anyway"}
      </Button>
    );
  };

  return (
    <div className="space-y-2" data-testid={`import-plan-suggestion-${label}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={suggestion.request} loading={loading} aria-label={`Suggest plan for ${label}`}>
          <Sparkles /> {suggestion.state.status === "ready" ? "Suggest again" : "Suggest plan"}
        </Button>
        {suggestion.state.status === "disabled" && suggestion.state.message ? <span className="text-[12px] text-ink-3">{suggestion.state.message}</span> : null}
      </div>
      <AssistSuggestion suggestion={suggestion} title={`Plan for “${label}”`} render={render} actions={actions} testId={`import-plan-card-${label}`} />
    </div>
  );
}

export { FIELD_LABEL as IMPORT_FIELD_LABELS };
