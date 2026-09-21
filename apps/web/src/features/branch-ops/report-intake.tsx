"use client";

import { ClipboardCheck, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { ContextLabel } from "@/components/ui/typography";
import type { EquipmentAsset } from "@/lib/domain/types";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { percent } from "@/features/assist/assist-judgment";
import { useAssistJudgment } from "@/features/assist/use-assist-judgment";
import { BRANCHOPS_DESCRIPTION_MAX_LENGTH, BRANCHOPS_DESCRIPTION_MIN_LENGTH, resolveReportCategoryReading, resolveReportTargetReading, type ReportSpaceLike } from "../../../convex/branchOpsAssist";

export interface ReportIntakeFiling {
  assetId?: string;
  description: string;
}

/**
 * "Describe what you found": one written description, then Jev suggests the
 * existing report kind and the registered machine or space it points at.
 * Filing still goes through the existing forms, where staff set severity,
 * safety status and location themselves; an unclear or uncertain answer
 * leaves every choice to them. Rendered only while the gym's switch is on;
 * the ordinary "Report issue" and "New task" actions are unchanged.
 */
export function ReportIntake({ branchId, machines, spaces, onFileIssue }: { branchId: string; machines: EquipmentAsset[]; spaces: ReportSpaceLike[]; onFileIssue: (filing: ReportIntakeFiling) => void }) {
  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState<string>();
  const subject = { branchId, description: asked ?? "" };
  const category = useAssistJudgment({ questionKey: "branchops.report_category", subject, enabled: true, auto: Boolean(asked) });
  const target = useAssistJudgment({ questionKey: "branchops.report_target", subject, enabled: true, auto: Boolean(asked) });
  if (!category.status || !category.featureReady) return null;

  const trimmed = draft.trim();
  const ready = trimmed.length >= BRANCHOPS_DESCRIPTION_MIN_LENGTH;
  const ask = () => {
    if (!ready) return;
    if (asked === trimmed) { category.request(); target.request(); return; }
    setAsked(trimmed);
  };
  const categoryReading = category.state.status === "ready" ? resolveReportCategoryReading(category.state.result.judgment) : undefined;
  const targetReading = target.state.status === "ready" ? resolveReportTargetReading(target.state.result.judgment, { machines, spaces }) : undefined;
  const machineHint = targetReading?.kind === "machine" ? targetReading.machine : undefined;
  const spaceHint = targetReading?.kind === "space" ? targetReading.space : undefined;
  const maintenanceHref = `/maintenance?branch=${encodeURIComponent(branchId)}${spaceHint ? `&zone=${encodeURIComponent(spaceHint.id)}&action=new-task` : ""}`;

  return (
    <section className="panel space-y-3 p-4" aria-label="Describe what you found" data-testid="report-intake">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-ink-3" aria-hidden />
        <ContextLabel as="span">Describe what you found</ContextLabel>
        <span className="text-[12px] text-ink-3">Jev suggests the report kind and the machine or space. You still choose severity, safety and who is responsible.</span>
      </div>
      <Field label="What did you find?" hint={`${BRANCHOPS_DESCRIPTION_MIN_LENGTH} to ${BRANCHOPS_DESCRIPTION_MAX_LENGTH} characters, in English or Arabic.`}>
        <Textarea value={draft} maxLength={BRANCHOPS_DESCRIPTION_MAX_LENGTH} onChange={(event) => setDraft(event.target.value)} placeholder="TREAD-01 belt slipping again under load, grinding noise at speed 10" data-testid="report-intake-text" className="min-h-20" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" data-testid="report-intake-run" disabled={!ready} loading={category.state.status === "loading" || target.state.status === "loading"} onClick={ask}><Sparkles /> {asked ? "Suggest again" : "Suggest where to file it"}</Button>
      </div>
      <AssistSuggestion
        suggestion={category}
        title="Report kind"
        testId="report-intake-category"
        render={() => categoryReading?.category
          ? <div><p><span className="font-semibold text-ink" data-testid="report-intake-category-label">{categoryReading.category.label}</span> · {categoryReading.category.description}</p>{categoryReading.alternatives.length ? <p className="mt-1 text-[12.5px] text-ink-3">Could also be: {categoryReading.alternatives.map((alternative) => alternative.label).join(", ")}. Choose yourself if in doubt.</p> : null}</div>
          : <p data-testid="report-intake-category-unclear">Unclear from the description. Choose the report kind yourself; nothing is filed for you.</p>}
      />
      <AssistSuggestion
        suggestion={target}
        title="Machine or space"
        testId="report-intake-target"
        render={() => {
          if (!targetReading || targetReading.kind === "none") return <p data-testid="report-intake-target-none">No registered machine or space at this branch is named. Choose one in the form{targetReading?.alternatives.length ? `; possible: ${targetReading.alternatives.map((alternative) => alternative.machine ? `${alternative.machine.code} ${alternative.machine.name}` : alternative.space?.name ?? "").join(", ")}` : ""}.</p>;
          return (
            <div className="space-y-1">
              <p data-testid="report-intake-target-label">{machineHint ? <><span className="font-mono text-[12.5px]">{machineHint.code}</span> · {machineHint.name}{machineHint.model ? ` · ${machineHint.model}` : ""}</> : <>Space: {spaceHint?.name}</>} <Badge variant={targetReading.uncertain ? "warning" : "outline"}>{targetReading.uncertain ? `uncertain · ${percent(targetReading.probability)}` : percent(targetReading.probability)}</Badge></p>
              {targetReading.alternatives.length ? <p className="text-[12.5px] text-ink-3" data-testid="report-intake-target-alternatives">Equally possible: {targetReading.alternatives.map((alternative) => alternative.machine ? `${alternative.machine.code} · ${alternative.machine.name}` : alternative.space?.name ?? "").join(" / ")}. Check the machine code before filing.</p> : null}
              <p className="text-[12px] text-ink-3">Only machines and spaces registered at this branch were offered; a same-named machine elsewhere is a different machine.</p>
            </div>
          );
        }}
        actions={() => (
          <>
            <Button type="button" size="sm" variant="secondary" data-testid="report-intake-file-issue" onClick={() => onFileIssue({ assetId: machineHint?.id, description: asked ?? trimmed })}><ShieldAlert /> {machineHint ? `File machine issue for ${machineHint.code}` : "File as machine issue"}</Button>
            <Button asChild size="sm" variant="ghost"><Link href={maintenanceHref} data-testid="report-intake-open-maintenance"><ClipboardCheck /> {spaceHint ? `Open maintenance task in ${spaceHint.name}` : "Open maintenance tasks"}</Link></Button>
          </>
        )}
      />
    </section>
  );
}
