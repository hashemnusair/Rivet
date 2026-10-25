"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { preselectedMachine, suggestMachines, suggestedTitle } from "@/lib/ai/fault-triage";
import type { EquipmentAsset, EquipmentIssue } from "@/lib/domain/types";
import { useLocale } from "@/lib/i18n/provider";
import { capabilityAvailable, useAiSettings } from "./use-assist";

type Suggestion = { assetId?: string; title: string; candidates: string[]; evidence?: string };

/**
 * "Suggest the machine" in the machine-problem intake. RIVET reads the
 * description against the registered machines (codes, names, machine words in
 * English or Arabic) and preselects one only when it is unambiguous. It shows
 * that machine's open problems so nobody files the same fault twice. Severity
 * and safety stay with the person who saw the machine.
 */
export function MachineSuggestion({ description, machines, issues, branchId, onSuggest }: { description: string; machines: EquipmentAsset[]; issues: EquipmentIssue[]; branchId: string; onSuggest: (suggestion: { assetId?: string; title: string }) => void }) {
  const { data: settings } = useAiSettings();
  if (!capabilityAvailable(settings, "ops_triage")) return null;
  return <MachineSuggestionControl description={description} machines={machines} issues={issues} branchId={branchId} onSuggest={onSuggest} />;
}

function MachineSuggestionControl({ description, machines, issues, branchId, onSuggest }: { description: string; machines: EquipmentAsset[]; issues: EquipmentIssue[]; branchId: string; onSuggest: (suggestion: { assetId?: string; title: string }) => void }) {
  const { t, locale } = useLocale();
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>();
  const label = (id: string) => { const machine = machines.find((item) => item.id === id); return machine ? `${machine.code} · ${machine.name}` : ""; };
  const suggest = () => {
    const list = machines.map((machine) => ({ id: machine.id, code: machine.code, name: machine.name }));
    const chosen = preselectedMachine(description, list);
    const next: Suggestion = { ...(chosen ? { assetId: chosen.id, evidence: chosen.evidence } : {}), title: suggestedTitle(description), candidates: chosen ? [] : suggestMachines(description, list).map((match) => match.id) };
    setSuggestion(next);
    onSuggest({ ...(next.assetId ? { assetId: next.assetId } : {}), title: next.title });
  };
  const open = suggestion?.assetId ? issues.filter((issue) => issue.assetId === suggestion.assetId && !["resolved", "cancelled"].includes(issue.status)) : [];
  return (
    <div className="space-y-1.5 text-[12.5px]" data-testid="machine-suggestion">
      <Button type="button" size="xs" variant="secondary" disabled={description.length < 3 || machines.length === 0} onClick={suggest} data-testid="machine-suggestion-run">{t("aiWork.triage.suggest")}</Button>
      {suggestion ? (
        <div role="status" className="space-y-1">
          {suggestion.assetId
            ? <p className="text-ink-2" data-testid="machine-suggestion-match">{t("aiWork.triage.matched", { machine: label(suggestion.assetId), evidence: suggestion.evidence ?? "" })}</p>
            : suggestion.candidates.length
              ? <p className="text-ink-2">{t("aiWork.triage.several", { machines: suggestion.candidates.map(label).join(locale === "ar" ? "، " : ", ") })}</p>
              : <p className="text-ink-2">{t("aiWork.triage.none")}</p>}
          {open.length ? (
            <p className="text-warning-deep" data-testid="machine-suggestion-open">
              {t("aiWork.triage.openProblems", { count: open.length, title: open[0]!.title })} <Link href={`/maintenance?branch=${encodeURIComponent(branchId)}`} className="underline underline-offset-2">{t("aiWork.triage.checkFirst")}</Link>
            </p>
          ) : null}
          <p className="text-ink-3">{t("aiWork.triage.youDecide")}</p>
        </div>
      ) : null}
    </div>
  );
}
