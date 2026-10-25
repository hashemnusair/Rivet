"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { suggestColumns, suggestPlans, type AssistField, type ColumnSuggestion, type PlanLike, type PlanSuggestion } from "@/lib/ai/import-assist";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { capabilityAvailable, useAiSettings } from "./use-assist";

const FIELD_LABEL: Record<AssistField, TKey> = {
  fullName: "common.label.fullName",
  phone: "common.label.phone",
  gender: "memberProfile.details.gender",
  email: "common.label.email",
  membershipStartDate: "aiWork.importAssist.field.membershipStartDate",
  membershipEndDate: "aiWork.importAssist.field.membershipEndDate",
};

/**
 * "Suggest columns and plans" in the member-import mapping step. RIVET fills
 * only choices that are still empty, says what each suggestion was based on,
 * and the person reviews them and runs the usual preview before committing.
 */
export function ImportSuggestions(props: { matrix: string[][]; mapping: Partial<Record<AssistField, number>>; sourcePlans: string[]; plans: PlanLike[]; planMappings: Record<string, string>; onApply: (columns: ColumnSuggestion[], plans: PlanSuggestion[]) => void }) {
  const { data: settings } = useAiSettings();
  if (!capabilityAvailable(settings, "import_assist")) return null;
  return <ImportSuggestionsControl {...props} />;
}

function ImportSuggestionsControl({ matrix, mapping, sourcePlans, plans, planMappings, onApply }: { matrix: string[][]; mapping: Partial<Record<AssistField, number>>; sourcePlans: string[]; plans: PlanLike[]; planMappings: Record<string, string>; onApply: (columns: ColumnSuggestion[], plans: PlanSuggestion[]) => void }) {
  const { t } = useLocale();
  const [applied, setApplied] = useState<{ columns: ColumnSuggestion[]; plans: PlanSuggestion[] } | undefined>();
  const header = matrix[0] ?? [];
  const planName = (id: string) => plans.find((plan) => plan.id === id)?.name ?? "";
  return (
    <div className="space-y-2 border-t border-line px-5 py-3 text-[12.5px]" data-testid="import-suggestions">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => {
          const columns = suggestColumns(matrix, mapping);
          const planSuggestions = suggestPlans(sourcePlans, plans, planMappings);
          setApplied({ columns, plans: planSuggestions });
          onApply(columns, planSuggestions);
        }} data-testid="import-suggestions-run">{t("aiWork.importAssist.run")}</Button>
        <span className="text-[12px] text-ink-3">{t("aiWork.importAssist.hint")}</span>
      </div>
      {applied ? (
        <div role="status" data-testid="import-suggestions-applied">
          {applied.columns.length || applied.plans.length ? (
            <ul className="ms-4 list-disc space-y-0.5 text-ink-2">
              {applied.columns.map((item) => <li key={item.field}>{t("aiWork.importAssist.column", { field: t(FIELD_LABEL[item.field]), column: header[item.index] ?? "", basis: t(`aiWork.importAssist.basis.${item.basis}`) })}</li>)}
              {applied.plans.map((item) => <li key={item.sourceName}>{t("aiWork.importAssist.plan", { source: item.sourceName, plan: planName(item.planId), basis: t(`aiWork.importAssist.basis.${item.basis}`) })}</li>)}
            </ul>
          ) : <p className="text-ink-2">{t("aiWork.importAssist.nothing")}</p>}
          <p className="mt-1 text-[12px] text-ink-3">{t("aiWork.importAssist.review")}</p>
        </div>
      ) : null}
    </div>
  );
}
