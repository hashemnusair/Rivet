"use client";
import { useT } from "@/lib/i18n/provider";

import { ClipboardCheck, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { ContextLabel } from "@/components/ui/typography";
import type { EquipmentAsset } from "@/lib/domain/types";
import { BRANCHOPS_DESCRIPTION_MAX_LENGTH, BRANCHOPS_DESCRIPTION_MIN_LENGTH, type ReportSpaceLike } from "../../../convex/branchOpsAssist";

export interface ReportIntakeFiling {
  assetId?: string;
  description: string;
}

/**
 * A short manual entry point for the existing machine issue form. Staff write
 * the details and choose the registered machine themselves; severity, safety
 * and the final filing remain in the existing reviewed form.
 */
export function ReportIntake({ branchId, machines, spaces, onFileIssue }: { branchId: string; machines: EquipmentAsset[]; spaces: ReportSpaceLike[]; onFileIssue: (filing: ReportIntakeFiling) => void }) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [assetId, setAssetId] = useState(machines[0]?.id ?? "");
  useEffect(() => {
    if (!machines.some((machine) => machine.id === assetId)) setAssetId(machines[0]?.id ?? "");
  }, [assetId, machines]);

  const trimmed = draft.trim();
  const ready = trimmed.length >= BRANCHOPS_DESCRIPTION_MIN_LENGTH;
  const maintenanceHref = `/maintenance?branch=${encodeURIComponent(branchId)}`;
  const machineLabel = machines.find((machine) => machine.id === assetId)?.name;

  return (
    <section className="panel space-y-3 p-4" aria-label={t("operationsWorkspace.reportMachine")} data-testid="report-intake">
      <div>
        <ContextLabel as="span">{t("operationsWorkspace.reportMachine")}</ContextLabel>
        <p className="mt-1 text-[12px] text-ink-3">{t("operationsWorkspace.intakeHint")}</p>
      </div>
      <Field label={t("operationsWorkspace.whatFound")} hint={t("operationsWorkspace.intakeLength", { min: BRANCHOPS_DESCRIPTION_MIN_LENGTH, max: BRANCHOPS_DESCRIPTION_MAX_LENGTH })}>
        <Textarea value={draft} maxLength={BRANCHOPS_DESCRIPTION_MAX_LENGTH} onChange={(event) => setDraft(event.target.value)} placeholder={t("operationsWorkspace.intakeExample")} data-testid="report-intake-text" className="min-h-20" />
      </Field>
      <Field label={t("dashboard.today.kind.equipment_issue")} required hint={machineLabel ? undefined : t("operationsWorkspace.chooseMachineFirst")}>
        <Select value={assetId} onValueChange={setAssetId}>
          <SelectTrigger aria-label={t("dashboard.today.kind.equipment_issue")}><SelectValue placeholder={t("operationsWorkspace.chooseMachine")} /></SelectTrigger>
          <SelectContent>{machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.code} · {machine.name}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {spaces.length ? <p className="text-[12px] text-ink-3">{t("operationsWorkspace.spaceProblemHint")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" data-testid="report-intake-file-issue" disabled={!ready || !assetId || !machines.length} onClick={() => onFileIssue({ assetId, description: trimmed })}><ShieldAlert /> {" "}{t("operationsWorkspace.reportMachineAction")}</Button>
        <Button asChild type="button" size="sm" variant="ghost"><Link href={maintenanceHref} data-testid="report-intake-open-maintenance"><ClipboardCheck /> {" "}{t("operationsWorkspace.goMaintenance")}</Link></Button>
      </div>
    </section>
  );
}
