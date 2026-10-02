"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { describeEquipmentRationale } from "@/lib/domain/equipment-rationale";
import { equipmentRationaleText } from "@/lib/i18n/operations";

import { isApiError } from "@/lib/api/errors";

import { Check, CheckCircle2, ChevronRight, Cog, Pencil, Plus, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { EquipmentAsset, EquipmentIssue, EquipmentRecommendation, EquipmentWorkOrder, UpsertEquipmentAssetInput, UpsertEquipmentWorkOrderInput } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { toMajor, toMajorString, money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { ASSET_STATUS_LABELS, FormPanel, LoadingGrid, ReadOnlyNotice, SEVERITY_LABELS, SectionHeader, StatusBadge, WORK_ORDER_STATUS_LABELS, minorValue, useOperationsNumberProblems, type OperationsMutations } from "./operations-shared";
import { ReportIntake, type ReportIntakeFiling } from "@/features/branch-ops/report-intake";
import { RepairHistoryPanel } from "@/features/branch-ops/repair-history";

export function EquipmentAssetForm({ currency, zones, branchId, asset, activeBlocked = false, pending, onCancel, onSubmit }: { currency: string; zones: Array<{ id: string; name: string }>; branchId?: string; asset?: EquipmentAsset; activeBlocked?: boolean; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentAssetInput) => void }) {
  const { t, locale } = useLocale();
  const validate = useOperationsNumberProblems();
  const [form, setForm] = useState(() => ({
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    serialNumber: asset?.serialNumber ?? "",
    zoneId: asset?.zoneId ?? "",
    purchaseDate: asset?.purchaseDate ?? "",
    purchaseCost: asset?.purchaseCost ? String(toMajor(asset.purchaseCost)) : "",
    warrantyEndDate: asset?.warrantyEndDate ?? "",
    status: asset?.status ?? "active",
    serviceInterval: asset?.expectedServiceIntervalDays ? String(asset.expectedServiceIntervalDays) : "",
    usefulLife: asset?.expectedUsefulLifeMonths ? String(asset.expectedUsefulLifeMonths) : "",
  }));
  const formId = useId();
  const editing = Boolean(asset);
  const statusOptions: EquipmentAsset["status"][] = !asset
    ? ["active"]
    : asset.status === "active"
      ? ["active", "maintenance", "retired", "replaced"]
      : asset.status === "maintenance"
        ? ["maintenance", "active", "retired", "replaced"]
        : [asset.status];
  const problems = { purchaseCost: validate.amount(form.purchaseCost, currency), serviceInterval: validate.integer(form.serviceInterval, 1), usefulLife: validate.integer(form.usefulLife, 1, 600) };
  const invalidNumbers = Object.values(problems).some(Boolean);
  return (
    <FormPanel title={editing ? t("operationsWorkspace.editMachine") : t("operationsWorkspace.addMachine")} description={t("operationsWorkspace.machineDetailsHint")} onCancel={onCancel} submitAction={<Button type="submit" form={formId} loading={pending} disabled={!branchId || invalidNumbers}><Cog /> {editing ? t("operationsWorkspace.saveMachine") : t("operationsWorkspace.addMachine")}</Button>}>
      <form id={formId} className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId || invalidNumbers) return;
        onSubmit({
          id: asset?.id,
          branchId,
          code: form.code,
          name: form.name,
          manufacturer: form.manufacturer || undefined,
          model: form.model || undefined,
          serialNumber: form.serialNumber || undefined,
          zoneId: form.zoneId || undefined,
          purchaseDate: form.purchaseDate || undefined,
          purchaseCost: minorValue(form.purchaseCost, currency),
          warrantyEndDate: form.warrantyEndDate || undefined,
          status: form.status as EquipmentAsset["status"],
          expectedServiceIntervalDays: form.serviceInterval ? Number(latinDigits(form.serviceInterval)) : undefined,
          expectedUsefulLifeMonths: form.usefulLife ? Number(latinDigits(form.usefulLife)) : undefined,
        });
      }}>
        <Field label={t("operationsWorkspace.machineCode")} hint={t("operationsWorkspace.machineCodeHint")} required><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="TREAD-02" required /></Field>
        <Field label={t("operationsWorkspace.machineName")} required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("operationsWorkspace.machineExample")} required /></Field>
        <Field label={t("operationsWorkspace.brand")}><Input value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Life Fitness" /></Field>
        <Field label={t("operationsWorkspace.model")}><Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="T5" /></Field>
        <Field label={t("operationsWorkspace.serialNumber")}><Input dir="ltr" value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} /></Field>
        <Field label={t("operationsWorkspace.area")}><Select value={form.zoneId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value === "none" ? "" : value }))}><SelectTrigger aria-label={t("operationsWorkspace.area")}><SelectValue placeholder={t("operationsWorkspace.noArea")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("operationsWorkspace.noArea")}</SelectItem>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("common.label.status")} hint={activeBlocked ? t("operationsWorkspace.unsafeActiveHint") : editing && (asset?.status === "retired" || asset?.status === "replaced") ? t("operationsWorkspace.retiredHint") : undefined}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentAsset["status"] }))}><SelectTrigger aria-label={t("operationsWorkspace.machineStatus")}><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status} disabled={status === "active" && activeBlocked}>{t(ASSET_STATUS_LABELS[status])}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.purchaseDate")}><Input type="date" lang={locale} dir="ltr" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>
        <Field label={t("operationsWorkspace.purchaseCost", { currency })} error={problems.purchaseCost}><Input type="text" inputMode="decimal" aria-invalid={Boolean(problems.purchaseCost) || undefined} dir="ltr" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} placeholder={toMajorString(money(0, currency))} /></Field>
        <Field label={t("operationsWorkspace.warrantyEnds")}><Input type="date" lang={locale} dir="ltr" value={form.warrantyEndDate} onChange={(event) => setForm((current) => ({ ...current, warrantyEndDate: event.target.value }))} /></Field>
        <Field label={t("operationsWorkspace.serviceDays")} error={problems.serviceInterval}><Input type="text" inputMode="numeric" aria-invalid={Boolean(problems.serviceInterval) || undefined} dir="ltr" value={form.serviceInterval} onChange={(event) => setForm((current) => ({ ...current, serviceInterval: latinDigits(event.target.value) }))} placeholder="90" /></Field>
        <Field label={t("operationsWorkspace.lifeMonths")} error={problems.usefulLife}><Input type="text" inputMode="numeric" aria-invalid={Boolean(problems.usefulLife) || undefined} dir="ltr" value={form.usefulLife} onChange={(event) => setForm((current) => ({ ...current, usefulLife: latinDigits(event.target.value) }))} placeholder="84" /></Field>
      </form>
    </FormPanel>
  );
}

export function EquipmentIssueForm({ assets, branchId, pending, initial, onCancel, onSubmit }: { assets: EquipmentAsset[]; branchId?: string; pending: boolean; initial?: ReportIntakeFiling; onCancel: () => void; onSubmit: (input: { branchId: string; assetId: string; title: string; description?: string; severity: EquipmentIssue["severity"]; downtimeDays?: number; safetyStatus: EquipmentIssue["safetyStatus"] }) => void }) {
  const t = useT();
  const validate = useOperationsNumberProblems();
  // A suggested machine only preselects the field; severity and safety start neutral for the person to set.
  const [form, setForm] = useState(() => ({ assetId: initial?.assetId && assets.some((asset) => asset.id === initial.assetId) ? initial.assetId : assets[0]?.id ?? "", title: "", description: initial?.description ?? "", severity: "medium", downtime: "", safety: "unknown" }));
  const problems = { downtime: validate.integer(form.downtime, 0) };
  const invalidNumbers = Object.values(problems).some(Boolean);
  return (
    <FormPanel title={t("operationsWorkspace.reportMachine")} description={t("operationsWorkspace.reportMachineHint")} onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId || invalidNumbers) return;
        onSubmit({ branchId, assetId: form.assetId, title: form.title, description: form.description || undefined, severity: form.severity as EquipmentIssue["severity"], downtimeDays: form.downtime ? Number(latinDigits(form.downtime)) : undefined, safetyStatus: form.safety as EquipmentIssue["safetyStatus"] });
      }}>
        <Field label={t("dashboard.today.kind.equipment_issue")} required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value }))}><SelectTrigger aria-label={t("dashboard.today.kind.equipment_issue")}><SelectValue placeholder={t("operationsWorkspace.chooseMachine")} /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.severity")} required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value }))}><SelectTrigger aria-label={t("operationsWorkspace.severity")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">{t("operationsWorkspace.low")}</SelectItem><SelectItem value="medium">{t("operationsWorkspace.medium")}</SelectItem><SelectItem value="high">{t("operationsWorkspace.high")}</SelectItem><SelectItem value="critical">{t("operationsWorkspace.critical")}</SelectItem></SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.safeQuestion")} hint={t("operationsWorkspace.safetyHint")} required><Select value={form.safety} onValueChange={(value) => setForm((current) => ({ ...current, safety: value }))}><SelectTrigger aria-label={t("operationsWorkspace.safeQuestion")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">{t("operationsWorkspace.notChecked")}</SelectItem><SelectItem value="safe_to_operate">{t("operationsWorkspace.safe")}</SelectItem><SelectItem value="out_of_service">{t("operationsWorkspace.unsafe")}</SelectItem></SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.downtimeDays")} error={problems.downtime}><Input type="text" inputMode="numeric" aria-invalid={Boolean(problems.downtime) || undefined} dir="ltr" value={form.downtime} onChange={(event) => setForm((current) => ({ ...current, downtime: latinDigits(event.target.value) }))} placeholder="0" /></Field>
        <Field label={t("operationsWorkspace.problemQuestion")} className="sm:col-span-2" required><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("operationsWorkspace.problemExample")} required /></Field>
        <Field label={t("common.label.details")} className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={t("operationsWorkspace.repairDetailsExample")} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0 || invalidNumbers}><ShieldAlert /> {" "}{t("operationsWorkspace.reportProblem")}</Button></div>
      </form>
    </FormPanel>
  );
}

export function EquipmentWorkOrderForm({ currency, assets, issues, branchId, order, pending, onCancel, onSubmit }: { currency: string; assets: EquipmentAsset[]; issues: EquipmentIssue[]; branchId?: string; order?: EquipmentWorkOrder; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentWorkOrderInput) => void }) {
  const t = useT();
  const validate = useOperationsNumberProblems();
  const [form, setForm] = useState(() => ({ assetId: order?.assetId ?? assets[0]?.id ?? "", issueId: order?.issueId ?? "", description: order?.description ?? "", vendorName: order?.vendorName ?? "", partsCost: order?.partsCost ? String(toMajor(order.partsCost)) : "", laborCost: order?.laborCost ? String(toMajor(order.laborCost)) : "", replacementEstimate: order?.replacementEstimate ? String(toMajor(order.replacementEstimate)) : "", status: order?.status ?? "draft" }));
  const assetIssues = issues.filter((issue) => issue.assetId === form.assetId && !["resolved", "cancelled"].includes(issue.status));
  const editing = Boolean(order);
  const statusOptions: EquipmentWorkOrder["status"][] = !order
    ? ["draft"]
    : order.status === "draft"
      ? ["draft", "approved", "cancelled"]
      : order.status === "approved"
        ? ["approved", "in_progress", "cancelled"]
        : order.status === "in_progress"
          ? ["in_progress", "completed", "cancelled"]
          : [order.status];
  const problems = { partsCost: validate.amount(form.partsCost, currency), laborCost: validate.amount(form.laborCost, currency), replacementEstimate: validate.amount(form.replacementEstimate, currency) };
  const invalidNumbers = Object.values(problems).some(Boolean);
  return (
    <FormPanel title={editing ? t("operationsWorkspace.editRepair") : t("operationsWorkspace.addRepair")} description={t("operationsWorkspace.repairHint")} onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId || invalidNumbers) return;
        onSubmit({ id: order?.id, branchId, assetId: form.assetId, issueId: form.issueId || undefined, description: form.description, vendorName: form.vendorName || undefined, partsCost: minorValue(form.partsCost, currency), laborCost: minorValue(form.laborCost, currency), replacementEstimate: minorValue(form.replacementEstimate, currency), status: form.status as EquipmentWorkOrder["status"] });
      }}>
        <Field label={t("dashboard.today.kind.equipment_issue")} required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value, issueId: "" }))}><SelectTrigger aria-label={t("dashboard.today.kind.equipment_issue")}><SelectValue placeholder={t("operationsWorkspace.chooseMachine")} /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.linkedProblem")}><Select value={form.issueId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, issueId: value === "none" ? "" : value }))}><SelectTrigger aria-label={t("operationsWorkspace.linkedProblem")}><SelectValue placeholder={t("operationsWorkspace.noLinkedProblem")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("operationsWorkspace.noLinkedProblem")}</SelectItem>{assetIssues.map((issue) => <SelectItem key={issue.id} value={issue.id}>{issue.title}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.jobQuestion")} className="sm:col-span-2" required><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder={t("operationsWorkspace.repairExample")} required /></Field>
        <Field label={t("operationsWorkspace.repairer")}><Input value={form.vendorName} onChange={(event) => setForm((current) => ({ ...current, vendorName: event.target.value }))} placeholder={t("operationsWorkspace.repairerExample")} /></Field>
        <Field label={t("common.label.status")} hint={!editing ? t("operationsWorkspace.newRepairHint") : t("operationsWorkspace.nextRepairHint")}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentWorkOrder["status"] }))}><SelectTrigger aria-label={t("operationsWorkspace.repairStatus")}><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status}>{t(WORK_ORDER_STATUS_LABELS[status])}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("operationsWorkspace.partsCost", { currency })} error={problems.partsCost}><Input type="text" inputMode="decimal" aria-invalid={Boolean(problems.partsCost) || undefined} dir="ltr" value={form.partsCost} onChange={(event) => setForm((current) => ({ ...current, partsCost: event.target.value }))} /></Field>
        <Field label={t("operationsWorkspace.laborCost", { currency })} error={problems.laborCost}><Input type="text" inputMode="decimal" aria-invalid={Boolean(problems.laborCost) || undefined} dir="ltr" value={form.laborCost} onChange={(event) => setForm((current) => ({ ...current, laborCost: event.target.value }))} /></Field>
        <Field label={t("operationsWorkspace.replacementCost", { currency })} error={problems.replacementEstimate}><Input type="text" inputMode="decimal" aria-invalid={Boolean(problems.replacementEstimate) || undefined} dir="ltr" value={form.replacementEstimate} onChange={(event) => setForm((current) => ({ ...current, replacementEstimate: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0 || invalidNumbers}><Wrench /> {editing ? t("operationsWorkspace.saveRepair") : t("operationsWorkspace.addRepair")}</Button></div>
      </form>
    </FormPanel>
  );
}

export function EquipmentRecommendationPanel({ asset, recommendation, loading, error }: { asset?: EquipmentAsset; recommendation?: EquipmentRecommendation; loading: boolean; error?: unknown }) {
  const t = useT();
  const f = useFormat();
  if (!asset) return <div className="flex min-h-40 items-center justify-center p-5 text-center text-[12px] text-ink-3">{t("operationsWorkspace.chooseMachineHistory")}</div>;
  if (loading) return <div className="space-y-3 p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-40" /></div>;
  if (error) return <div className="p-5 text-[12px] text-danger" role="alert">{t("operationsWorkspace.machineHistoryFailed")}</div>;
  if (!recommendation) return null;
  const decisionLabel = recommendation.decision === "fix" ? t("operationsWorkspace.repairReasonable") : recommendation.decision === "replace" ? t("operationsWorkspace.replacementBetter") : t("operationsWorkspace.moreInformation");
  const decisionTone = recommendation.decision === "fix" ? "success" : recommendation.decision === "replace" ? "danger" : "warning";
  const decisionBadge = recommendation.decision === "fix" ? t("operationsWorkspace.repair") : recommendation.decision === "replace" ? t("operationsWorkspace.replace") : t("operationsWorkspace.unsure");
  return <div className="space-y-3 p-5"><div><p className="context-label">{t("operationsWorkspace.repairOrReplace")}</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant={decisionTone} dot>{decisionBadge}</Badge><span className="text-[13px] font-medium">{decisionLabel}</span></div><p className="mt-1 text-[12px] text-ink-3">{t("operationsWorkspace.recommendationHint")}</p></div><div className="grid grid-cols-2 gap-3 text-[12px]"><div><p className="context-label">{t("operationsWorkspace.problems")}</p><p className="mt-1 tabular-nums text-[17px]" dir="ltr">{recommendation.issueCount}</p></div><div><p className="context-label">{t("operationsWorkspace.outOfUse")}</p><p className="mt-1 tabular-nums text-[17px]" dir="ltr">{t("operationsWorkspace.days", { count: recommendation.downtimeDays })}</p></div><div><p className="context-label">{t("operationsWorkspace.repairCosts")}</p><p className="mt-1"><MoneyText money={recommendation.repairCost} /></p></div><div><p className="context-label">{t("operationsWorkspace.replaceCost")}</p><p className="mt-1"><MoneyText money={recommendation.replacementEstimate} /></p></div></div><ul className="space-y-1 border-t border-line pt-3 text-[12px] text-ink-2">{recommendation.rationale.map((reason, index) => { const message = recommendation.rationaleMessages?.[index] ?? describeEquipmentRationale(reason); return <li key={reason} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />{message ? equipmentRationaleText(t, f, message) : reason}</li>; })}</ul></div>;
}

export function EquipmentTab({ branchId, currency, writeEnabled, zones, assets, issues, workOrders, loading, error, onRetry, mutations }: { branchId?: string; currency: string; writeEnabled: boolean; zones: Array<{ id: string; name: string }>; assets: EquipmentAsset[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
  const t = useT();
  const [assetForm, setAssetForm] = useState<EquipmentAsset | "new" | null>(null);
  const [issueForm, setIssueForm] = useState<false | ReportIntakeFiling | true>(false);
  const [workOrderForm, setWorkOrderForm] = useState<EquipmentWorkOrder | "new" | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>();
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];
  const actionAssets = assets.filter((asset) => !["retired", "replaced"].includes(asset.status));
  const recommendationQuery = useApiQuery(qk.operations({ kind: "equipment-recommendation", assetId: selectedAsset?.id }), (api) => api.getEquipmentRecommendation(selectedAsset!.id), { enabled: Boolean(selectedAsset?.id) });

  useEffect(() => {
    if (!assets.some((asset) => asset.id === selectedAssetId)) setSelectedAssetId(assets[0]?.id);
  }, [assets, selectedAssetId]);

  if (!branchId) return <StatePanel icon={Wrench} title={t("operationsWorkspace.chooseBranch")} description={t("operationsWorkspace.branchMachinesHint")} className="mt-2" />;
  if (loading) return <LoadingGrid />;
  if (error && (assets.length === 0 || (isApiError(error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.code)))) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription={t("operationsWorkspace.noEquipmentAccess")} />;

  const updateAssetStatus = (asset: EquipmentAsset, status: EquipmentAsset["status"]) => mutations.asset.mutate({ id: asset.id, branchId: asset.branchId, zoneId: asset.zoneId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate, installationDate: asset.installationDate, purchaseCost: asset.purchaseCost, warrantyEndDate: asset.warrantyEndDate, status, expectedServiceIntervalDays: asset.expectedServiceIntervalDays, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths });
  const updateWorkOrder = (order: EquipmentWorkOrder, status: EquipmentWorkOrder["status"]) => mutations.workOrder.mutate({ id: order.id, branchId: order.branchId, assetId: order.assetId, issueId: order.issueId, status, description: order.description, assigneeId: order.assigneeId, vendorName: order.vendorName, partsCost: order.partsCost, laborCost: order.laborCost, replacementEstimate: order.replacementEstimate });
  const hasUnsafeOpenIssue = (assetId: string) => issues.some((issue) => issue.assetId === assetId && !["resolved", "cancelled"].includes(issue.status) && issue.safetyStatus === "out_of_service");
  const openIssues = issues.filter((issue) => !["resolved", "cancelled"].includes(issue.status));
  const openOrders = workOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
  // Daily work lives in the open items; history stays visible below them.
  const sortedIssues = [...issues].sort((left, right) => Number(["resolved", "cancelled"].includes(left.status)) - Number(["resolved", "cancelled"].includes(right.status)));
  const sortedWorkOrders = [...workOrders].sort((left, right) => Number(["completed", "cancelled"].includes(left.status)) - Number(["completed", "cancelled"].includes(right.status)));
  return <div className="space-y-4" data-testid="operations-equipment">
    <div className="grid grid-cols-3 gap-2 sm:gap-3"><section className="panel p-3 sm:p-4"><p className="context-label">{t("operationsWorkspace.machines")}</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{assets.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">{t("operationsWorkspace.atBranch")}</p></section><section className={cn("panel p-3 sm:p-4", openIssues.length > 0 && "border-warning/50 bg-warning-bg/20")}><p className="context-label">{t("operationsWorkspace.openProblems")}</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openIssues.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">{t("operationsWorkspace.notFixed")}</p></section><section className="panel p-3 sm:p-4"><p className="context-label">{t("operationsWorkspace.openRepairs")}</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openOrders.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">{t("operationsWorkspace.notRepaired")}</p></section></div>
    {!writeEnabled ? <ReadOnlyNotice /> : null}
    {writeEnabled ? <ReportIntake branchId={branchId} machines={actionAssets} spaces={zones.map((zone) => ({ id: zone.id, name: zone.name, kind: "space" }))} onFileIssue={(filing) => setIssueForm(filing)} /> : null}
    <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title={t("operationsWorkspace.machines")} description={t("operationsWorkspace.chooseProblems")} actions={writeEnabled ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setIssueForm(true)} disabled={actionAssets.length === 0}><ShieldAlert /> {" "}{t("operationsWorkspace.reportProblem")}</Button><Button size="sm" onClick={() => setAssetForm("new")}><Plus /> {" "}{t("operationsWorkspace.addMachine")}</Button></div> : null} />
      {assets.length === 0 ? <EmptyState title={t("operationsWorkspace.noMachines")} description={t("operationsWorkspace.addMachineHint")} className="m-4" /> : <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:divide-x rtl:lg:divide-x-reverse lg:divide-y-0"><div className="divide-y divide-line">{assets.map((asset) => { const unsafeOpenIssue = hasUnsafeOpenIssue(asset.id); const cannotActivate = asset.status === "maintenance" && unsafeOpenIssue; const problemCount = issues.filter((issue) => issue.assetId === asset.id).length; return <div key={asset.id} className={cn("flex flex-wrap items-center gap-3 p-4", selectedAsset?.id === asset.id && "bg-sunken")}><button type="button" className="flex min-h-11 min-w-0 basis-full items-center gap-3 text-start hover:opacity-80 sm:flex-1 sm:basis-auto" onClick={() => setSelectedAssetId(asset.id)} aria-pressed={selectedAsset?.id === asset.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface"><Cog className="size-4 text-ink-2" aria-hidden /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-medium">{asset.code}</span><StatusBadge status={asset.status} /></span><span className="mt-1 block break-words text-[13.5px]">{asset.name}</span><span className="mt-0.5 block break-words text-[12px] text-ink-3">{asset.manufacturer ?? t("operationsWorkspace.unknownBrand")}{asset.model ? ` · ${asset.model}` : ""} · {t("operationsWorkspace.reportedProblems", { count: problemCount })}</span></span><ChevronRight className="size-4 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden /></button>{writeEnabled ? <div className="flex w-full flex-col items-start gap-1 sm:w-auto sm:items-end"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t("operationsWorkspace.editNamed", { name: asset.name })} onClick={() => setAssetForm(asset)}><Pencil /></Button>{!["retired", "replaced"].includes(asset.status) ? <Button size="xs" variant="secondary" onClick={() => updateAssetStatus(asset, asset.status === "maintenance" ? "active" : "maintenance")} loading={mutations.asset.isPending} disabled={cannotActivate} title={cannotActivate ? t("operationsWorkspace.unsafeActiveHint") : undefined}>{asset.status === "maintenance" ? t("operationsWorkspace.markActive") : t("operationsWorkspace.markMaintenance")}</Button> : null}</div>{cannotActivate ? <span className="max-w-full text-start text-[12px] leading-snug sm:max-w-44 sm:text-end text-warning-deep" role="status">{t("operationsWorkspace.fixUnsafeFirst")}</span> : null}</div> : null}</div>; })}</div><div><EquipmentRecommendationPanel asset={selectedAsset} recommendation={recommendationQuery.data} loading={recommendationQuery.isLoading} error={recommendationQuery.error} />{selectedAsset ? <RepairHistoryPanel asset={selectedAsset} issues={issues} workOrders={workOrders} /> : null}</div></div>}
    </section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="panel overflow-hidden"><SectionHeader icon={ShieldAlert} title={t("operationsWorkspace.machineProblems")} description={t("operationsWorkspace.updateProblemHint")} />{sortedIssues.length === 0 ? <EmptyState compact title={t("operationsWorkspace.noProblems")} description={t("operationsWorkspace.problemsAppear")} className="m-4" /> : <div className="divide-y divide-line">{sortedIssues.map((issue) => { const asset = assets.find((item) => item.id === issue.assetId); return <div key={issue.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{issue.title}</p><p className="mt-0.5 text-[12px] text-ink-3">{asset?.code ?? t("operationsWorkspace.machine")} {" "}{t("operationsWorkspace.severitySegment")}{" "}{t(SEVERITY_LABELS[issue.severity])} · {t("operationsWorkspace.downtime", { count: issue.downtimeDays ?? 0 })}</p></div><StatusBadge status={issue.status} /></div><p className="text-[12px] text-ink-3"><StatusBadge status={issue.safetyStatus} /> {" "}{t("operationsWorkspace.reportedSegment")}{" "}<DateTimeText iso={issue.reportedAt} /></p>{writeEnabled && !["resolved", "cancelled"].includes(issue.status) ? <div className="flex flex-wrap gap-2 pt-1"><Button size="xs" variant="secondary" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: issue.status === "open" ? { status: "in_progress" } : { status: "resolved", safetyStatus: "safe_to_operate" } })} loading={mutations.issueUpdate.isPending} title={issue.status === "open" ? undefined : t("operationsWorkspace.marksSafeHint")}>{issue.status === "open" ? t("operationsWorkspace.startChecking") : t("operationsWorkspace.markFixed")}</Button><Button size="xs" variant="ghost" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: { status: "cancelled" } })} loading={mutations.issueUpdate.isPending}>{t("operationsWorkspace.cancelReport")}</Button></div> : null}</div>; })}</div>}</section>
      <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title={t("operationsWorkspace.repairJobs")} description={t("operationsWorkspace.repairStepsHint")} actions={writeEnabled ? <Button size="sm" onClick={() => setWorkOrderForm("new")} disabled={actionAssets.length === 0}><Plus /> {" "}{t("operationsWorkspace.addRepair")}</Button> : null} />{sortedWorkOrders.length === 0 ? <EmptyState compact title={t("operationsWorkspace.noRepairs")} description={t("operationsWorkspace.addRepairHint")} className="m-4" /> : <div className="divide-y divide-line">{sortedWorkOrders.map((order) => { const asset = assets.find((item) => item.id === order.assetId); return <div key={order.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{order.description}</p><p className="mt-0.5 text-[12px] text-ink-3">{asset?.code ?? t("operationsWorkspace.machine")}{order.vendorName ? ` · ${order.vendorName}` : ""}</p></div><StatusBadge status={order.status} /></div><p className="text-[12px] text-ink-3">{t("operationsWorkspace.repairCost")}{" "}<MoneyText money={order.totalCost} /> {" "}{t("operationsWorkspace.costToReplaceSegment")}{" "}<MoneyText money={order.replacementEstimate} /> {" "}{t("operationsWorkspace.openedSegment")}{" "}<DateTimeText iso={order.openedAt} /></p>{writeEnabled && !["completed", "cancelled"].includes(order.status) ? <div className="flex flex-wrap gap-2 pt-1">{order.status === "draft" ? <Button size="xs" onClick={() => updateWorkOrder(order, "approved")} loading={mutations.workOrder.isPending}><Check /> {" "}{t("operationsWorkspace.approve")}</Button> : null}{order.status === "approved" ? <Button size="xs" variant="secondary" onClick={() => updateWorkOrder(order, "in_progress")} loading={mutations.workOrder.isPending}><Wrench /> {" "}{t("operationsWorkspace.startWork")}</Button> : null}{order.status === "in_progress" ? <Button size="xs" onClick={() => updateWorkOrder(order, "completed")} loading={mutations.workOrder.isPending}><CheckCircle2 /> {" "}{t("operationsWorkspace.markDone")}</Button> : null}<Button size="xs" variant="ghost" onClick={() => updateWorkOrder(order, "cancelled")} loading={mutations.workOrder.isPending}>{t("operationsWorkspace.cancelJob")}</Button><Button size="icon" variant="ghost" aria-label={t("operationsWorkspace.editNamed", { name: order.description })} onClick={() => setWorkOrderForm(order)}><Pencil /></Button></div> : null}</div>; })}</div>}</section></div>
    {assetForm ? <EquipmentAssetForm currency={currency} zones={zones} branchId={branchId} asset={assetForm === "new" ? undefined : assetForm} activeBlocked={assetForm !== "new" && hasUnsafeOpenIssue(assetForm.id)} pending={mutations.asset.isPending} onCancel={() => setAssetForm(null)} onSubmit={(input) => mutations.asset.mutate(input, { onSuccess: () => setAssetForm(null) })} /> : null}
    {issueForm ? <EquipmentIssueForm key={issueForm === true ? "blank" : `${issueForm.assetId ?? ""}|${issueForm.description}`} assets={actionAssets} branchId={branchId} pending={mutations.issue.isPending} initial={issueForm === true ? undefined : issueForm} onCancel={() => setIssueForm(false)} onSubmit={(input) => mutations.issue.mutate(input, { onSuccess: () => setIssueForm(false) })} /> : null}
    {workOrderForm ? <EquipmentWorkOrderForm currency={currency} assets={actionAssets} issues={issues} branchId={branchId} order={workOrderForm === "new" ? undefined : workOrderForm} pending={mutations.workOrder.isPending} onCancel={() => setWorkOrderForm(null)} onSubmit={(input) => mutations.workOrder.mutate(input, { onSuccess: () => setWorkOrderForm(null) })} /> : null}
  </div>;
}
