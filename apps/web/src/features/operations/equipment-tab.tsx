"use client";

import { isApiError } from "@/lib/api/errors";

import { Check, CheckCircle2, ChevronRight, Cog, Pencil, Plus, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { EquipmentAsset, EquipmentIssue, EquipmentRecommendation, EquipmentWorkOrder, UpsertEquipmentAssetInput, UpsertEquipmentWorkOrderInput } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { ASSET_STATUS_LABELS, FormPanel, LoadingGrid, ReadOnlyNotice, SEVERITY_LABELS, SectionHeader, StatusBadge, WORK_ORDER_STATUS_LABELS, minorValue, type OperationsMutations } from "./operations-shared";
import { ReportIntake, type ReportIntakeFiling } from "@/features/branch-ops/report-intake";
import { RepairHistoryPanel } from "@/features/branch-ops/repair-history";

export function EquipmentAssetForm({ currency, zones, branchId, asset, activeBlocked = false, pending, onCancel, onSubmit }: { currency: string; zones: Array<{ id: string; name: string }>; branchId?: string; asset?: EquipmentAsset; activeBlocked?: boolean; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentAssetInput) => void }) {
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
  return (
    <FormPanel title={editing ? "Edit machine" : "Add machine"} description="Record the machine’s details and where it is in the gym." onCancel={onCancel} submitAction={<Button type="submit" form={formId} loading={pending} disabled={!branchId}><Cog /> {editing ? "Save machine" : "Add machine"}</Button>}>
      <form id={formId} className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
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
          expectedServiceIntervalDays: form.serviceInterval ? Number(form.serviceInterval) : undefined,
          expectedUsefulLifeMonths: form.usefulLife ? Number(form.usefulLife) : undefined,
        });
      }}>
        <Field label="Machine code" hint="A short code staff can recognize" required><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="TREAD-02" required /></Field>
        <Field label="Machine name" required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Commercial treadmill" required /></Field>
        <Field label="Brand"><Input value={form.manufacturer} onChange={(event) => setForm((current) => ({ ...current, manufacturer: event.target.value }))} placeholder="Life Fitness" /></Field>
        <Field label="Model"><Input value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="T5" /></Field>
        <Field label="Serial number"><Input dir="ltr" value={form.serialNumber} onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))} /></Field>
        <Field label="Area of the gym"><Select value={form.zoneId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Area of the gym"><SelectValue placeholder="No area" /></SelectTrigger><SelectContent><SelectItem value="none">No area</SelectItem>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Status" hint={activeBlocked ? "This machine has a “Do not use” problem. Fix the problem before you mark it active." : editing && (asset?.status === "retired" || asset?.status === "replaced") ? "A retired or replaced machine cannot be made active again." : undefined}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentAsset["status"] }))}><SelectTrigger aria-label="Machine status"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status} disabled={status === "active" && activeBlocked}>{ASSET_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Purchase date"><Input type="date" dir="ltr" value={form.purchaseDate} onChange={(event) => setForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></Field>
        <Field label={`Purchase cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.purchaseCost} onChange={(event) => setForm((current) => ({ ...current, purchaseCost: event.target.value }))} placeholder="0.000" /></Field>
        <Field label="Warranty ends"><Input type="date" dir="ltr" value={form.warrantyEndDate} onChange={(event) => setForm((current) => ({ ...current, warrantyEndDate: event.target.value }))} /></Field>
        <Field label="Days between service checks"><Input type="number" min="1" step="1" dir="ltr" value={form.serviceInterval} onChange={(event) => setForm((current) => ({ ...current, serviceInterval: event.target.value }))} placeholder="90" /></Field>
        <Field label="Expected life in months"><Input type="number" min="1" step="1" dir="ltr" value={form.usefulLife} onChange={(event) => setForm((current) => ({ ...current, usefulLife: event.target.value }))} placeholder="84" /></Field>
      </form>
    </FormPanel>
  );
}

export function EquipmentIssueForm({ assets, branchId, pending, initial, onCancel, onSubmit }: { assets: EquipmentAsset[]; branchId?: string; pending: boolean; initial?: ReportIntakeFiling; onCancel: () => void; onSubmit: (input: { branchId: string; assetId: string; title: string; description?: string; severity: EquipmentIssue["severity"]; downtimeDays?: number; safetyStatus: EquipmentIssue["safetyStatus"] }) => void }) {
  // A suggested machine only preselects the field; severity and safety start neutral for the person to set.
  const [form, setForm] = useState(() => ({ assetId: initial?.assetId && assets.some((asset) => asset.id === initial.assetId) ? initial.assetId : assets[0]?.id ?? "", title: "", description: initial?.description ?? "", severity: "medium", downtime: "", safety: "unknown" }));
  return (
    <FormPanel title="Report a machine problem" description="Say what is wrong and if the machine is safe to use." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
        onSubmit({ branchId, assetId: form.assetId, title: form.title, description: form.description || undefined, severity: form.severity as EquipmentIssue["severity"], downtimeDays: form.downtime ? Number(form.downtime) : undefined, safetyStatus: form.safety as EquipmentIssue["safetyStatus"] });
      }}>
        <Field label="Machine" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value }))}><SelectTrigger aria-label="Machine"><SelectValue placeholder="Choose a machine" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="How serious is it?" required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value }))}><SelectTrigger aria-label="How serious is it?"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></Field>
        <Field label="Is it safe to use?" hint="Tell the next staff member what to do" required><Select value={form.safety} onValueChange={(value) => setForm((current) => ({ ...current, safety: value }))}><SelectTrigger aria-label="Is it safe to use?"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Not checked yet</SelectItem><SelectItem value="safe_to_operate">Safe to use</SelectItem><SelectItem value="out_of_service">Do not use</SelectItem></SelectContent></Select></Field>
        <Field label="Days out of use"><Input type="number" min="0" step="1" dir="ltr" value={form.downtime} onChange={(event) => setForm((current) => ({ ...current, downtime: event.target.value }))} placeholder="0" /></Field>
        <Field label="What is wrong?" className="sm:col-span-2" required><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Belt slipping under load" required /></Field>
        <Field label="Details" className="sm:col-span-2"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Anything that helps the repair person" /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><ShieldAlert /> Report problem</Button></div>
      </form>
    </FormPanel>
  );
}

export function EquipmentWorkOrderForm({ currency, assets, issues, branchId, order, pending, onCancel, onSubmit }: { currency: string; assets: EquipmentAsset[]; issues: EquipmentIssue[]; branchId?: string; order?: EquipmentWorkOrder; pending: boolean; onCancel: () => void; onSubmit: (input: UpsertEquipmentWorkOrderInput) => void }) {
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
  return (
    <FormPanel title={editing ? "Edit repair job" : "Add repair job"} description="Record the repair, who does it, and what it costs." onCancel={onCancel}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!branchId) return;
        onSubmit({ id: order?.id, branchId, assetId: form.assetId, issueId: form.issueId || undefined, description: form.description, vendorName: form.vendorName || undefined, partsCost: minorValue(form.partsCost, currency), laborCost: minorValue(form.laborCost, currency), replacementEstimate: minorValue(form.replacementEstimate, currency), status: form.status as EquipmentWorkOrder["status"] });
      }}>
        <Field label="Machine" required><Select value={form.assetId} onValueChange={(value) => setForm((current) => ({ ...current, assetId: value, issueId: "" }))}><SelectTrigger aria-label="Machine"><SelectValue placeholder="Choose a machine" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.code} · {asset.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Problem it fixes"><Select value={form.issueId || "none"} onValueChange={(value) => setForm((current) => ({ ...current, issueId: value === "none" ? "" : value }))}><SelectTrigger aria-label="Problem it fixes"><SelectValue placeholder="No problem linked" /></SelectTrigger><SelectContent><SelectItem value="none">No problem linked</SelectItem>{assetIssues.map((issue) => <SelectItem key={issue.id} value={issue.id}>{issue.title}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="What needs doing?" className="sm:col-span-2" required><Input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Inspect belt and motor" required /></Field>
        <Field label="Done by"><Input value={form.vendorName} onChange={(event) => setForm((current) => ({ ...current, vendorName: event.target.value }))} placeholder="Repair company or technician" /></Field>
        <Field label="Status" hint={!editing ? "New repair jobs start as drafts. Approve a job before work starts." : "Choose the next step, or cancel the job."}><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as EquipmentWorkOrder["status"] }))}><SelectTrigger aria-label="Repair job status"><SelectValue /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status} value={status}>{WORK_ORDER_STATUS_LABELS[status]}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={`Parts cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.partsCost} onChange={(event) => setForm((current) => ({ ...current, partsCost: event.target.value }))} /></Field>
        <Field label={`Labor cost (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.laborCost} onChange={(event) => setForm((current) => ({ ...current, laborCost: event.target.value }))} /></Field>
        <Field label={`Cost to replace (${currency})`}><Input type="number" min="0" step="0.001" dir="ltr" value={form.replacementEstimate} onChange={(event) => setForm((current) => ({ ...current, replacementEstimate: event.target.value }))} /></Field>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={pending} disabled={!branchId || assets.length === 0}><Wrench /> {editing ? "Save repair job" : "Add repair job"}</Button></div>
      </form>
    </FormPanel>
  );
}

export function EquipmentRecommendationPanel({ asset, recommendation, loading, error }: { asset?: EquipmentAsset; recommendation?: EquipmentRecommendation; loading: boolean; error?: unknown }) {
  if (!asset) return <div className="flex min-h-40 items-center justify-center p-5 text-center text-[12px] text-ink-3">Choose a machine to see its repair history.</div>;
  if (loading) return <div className="space-y-3 p-5"><Skeleton className="h-5 w-32" /><Skeleton className="h-16 w-full" /><Skeleton className="h-4 w-40" /></div>;
  if (error) return <div className="p-5 text-[12px] text-danger" role="alert">This machine’s history could not load. Refresh the page to try again.</div>;
  if (!recommendation) return null;
  const decisionLabel = recommendation.decision === "fix" ? "Repair looks reasonable" : recommendation.decision === "replace" ? "Replacement may be better" : "More information needed";
  const decisionTone = recommendation.decision === "fix" ? "success" : recommendation.decision === "replace" ? "danger" : "warning";
  const decisionBadge = recommendation.decision === "fix" ? "Repair" : recommendation.decision === "replace" ? "Replace" : "Not sure yet";
  return <div className="space-y-3 p-5"><div><p className="context-label">Repair or replace?</p><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant={decisionTone} dot>{decisionBadge}</Badge><span className="text-[13px] font-medium">{decisionLabel}</span></div><p className="mt-1 text-[12px] text-ink-3">Based on past problems, repair costs and the machine’s age. A manager makes the final decision.</p></div><div className="grid grid-cols-2 gap-3 text-[12px]"><div><p className="context-label">Problems</p><p className="mt-1 tabular-nums text-[17px]" dir="ltr">{recommendation.issueCount}</p></div><div><p className="context-label">Out of use</p><p className="mt-1 tabular-nums text-[17px]" dir="ltr">{recommendation.downtimeDays} {recommendation.downtimeDays === 1 ? "day" : "days"}</p></div><div><p className="context-label">Repair costs</p><p className="mt-1"><MoneyText money={recommendation.repairCost} /></p></div><div><p className="context-label">Cost to replace</p><p className="mt-1"><MoneyText money={recommendation.replacementEstimate} /></p></div></div><ul className="space-y-1 border-t border-line pt-3 text-[12px] text-ink-2">{recommendation.rationale.map((reason) => <li key={reason} className="flex gap-2"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden />{reason}</li>)}</ul></div>;
}

export function EquipmentTab({ branchId, currency, writeEnabled, zones, assets, issues, workOrders, loading, error, onRetry, mutations }: { branchId?: string; currency: string; writeEnabled: boolean; zones: Array<{ id: string; name: string }>; assets: EquipmentAsset[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[]; loading: boolean; error?: unknown; onRetry: () => void; mutations: OperationsMutations }) {
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

  if (!branchId) return <StatePanel icon={Wrench} title="Choose a branch first" description="Each branch has its own machines. Choose a branch above." className="mt-2" />;
  if (loading) return <LoadingGrid />;
  if (error && (assets.length === 0 || (isApiError(error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.code)))) return <QueryErrorState error={error} onRetry={onRetry} forbiddenDescription="You don’t have access to machines." />;

  const updateAssetStatus = (asset: EquipmentAsset, status: EquipmentAsset["status"]) => mutations.asset.mutate({ id: asset.id, branchId: asset.branchId, zoneId: asset.zoneId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, serialNumber: asset.serialNumber, purchaseDate: asset.purchaseDate, installationDate: asset.installationDate, purchaseCost: asset.purchaseCost, warrantyEndDate: asset.warrantyEndDate, status, expectedServiceIntervalDays: asset.expectedServiceIntervalDays, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths });
  const updateWorkOrder = (order: EquipmentWorkOrder, status: EquipmentWorkOrder["status"]) => mutations.workOrder.mutate({ id: order.id, branchId: order.branchId, assetId: order.assetId, issueId: order.issueId, status, description: order.description, assigneeId: order.assigneeId, vendorName: order.vendorName, partsCost: order.partsCost, laborCost: order.laborCost, replacementEstimate: order.replacementEstimate });
  const hasUnsafeOpenIssue = (assetId: string) => issues.some((issue) => issue.assetId === assetId && !["resolved", "cancelled"].includes(issue.status) && issue.safetyStatus === "out_of_service");
  const openIssues = issues.filter((issue) => !["resolved", "cancelled"].includes(issue.status));
  const openOrders = workOrders.filter((order) => !["completed", "cancelled"].includes(order.status));
  // Daily work lives in the open items; history stays visible below them.
  const sortedIssues = [...issues].sort((left, right) => Number(["resolved", "cancelled"].includes(left.status)) - Number(["resolved", "cancelled"].includes(right.status)));
  const sortedWorkOrders = [...workOrders].sort((left, right) => Number(["completed", "cancelled"].includes(left.status)) - Number(["completed", "cancelled"].includes(right.status)));
  return <div className="space-y-4" data-testid="operations-equipment">
    <div className="grid grid-cols-3 gap-2 sm:gap-3"><section className="panel p-3 sm:p-4"><p className="context-label">Machines</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{assets.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">At this branch</p></section><section className={cn("panel p-3 sm:p-4", openIssues.length > 0 && "border-warning/50 bg-warning-bg/20")}><p className="context-label">Open problems</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openIssues.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">Not fixed yet</p></section><section className="panel p-3 sm:p-4"><p className="context-label">Open repair jobs</p><p className="mt-1 font-display text-2xl font-semibold" dir="ltr">{openOrders.length}</p><p className="mt-1 hidden text-[12px] text-ink-3 sm:block">Repairs not finished yet</p></section></div>
    {!writeEnabled ? <ReadOnlyNotice /> : null}
    {writeEnabled ? <ReportIntake branchId={branchId} machines={actionAssets} spaces={zones.map((zone) => ({ id: zone.id, name: zone.name, kind: "space" }))} onFileIssue={(filing) => setIssueForm(filing)} /> : null}
    <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title="Machines" description="Choose a machine to see its problems and repairs." actions={writeEnabled ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => setIssueForm(true)} disabled={actionAssets.length === 0}><ShieldAlert /> Report problem</Button><Button size="sm" onClick={() => setAssetForm("new")}><Plus /> Add machine</Button></div> : null} />
      {assets.length === 0 ? <EmptyState title="No machines yet" description="Add this branch’s first machine to track problems and repairs." className="m-4" /> : <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] lg:divide-x lg:divide-y-0"><div className="divide-y divide-line">{assets.map((asset) => { const unsafeOpenIssue = hasUnsafeOpenIssue(asset.id); const cannotActivate = asset.status === "maintenance" && unsafeOpenIssue; const problemCount = issues.filter((issue) => issue.assetId === asset.id).length; return <div key={asset.id} className={cn("flex flex-wrap items-center gap-3 p-4", selectedAsset?.id === asset.id && "bg-sunken")}><button type="button" className="flex min-h-11 min-w-0 basis-full items-center gap-3 text-start hover:opacity-80 sm:flex-1 sm:basis-auto" onClick={() => setSelectedAssetId(asset.id)} aria-pressed={selectedAsset?.id === asset.id}><span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface"><Cog className="size-4 text-ink-2" aria-hidden /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-medium">{asset.code}</span><StatusBadge status={asset.status} /></span><span className="mt-1 block break-words text-[13.5px]">{asset.name}</span><span className="mt-0.5 block break-words text-[12px] text-ink-3">{asset.manufacturer ?? "Unknown brand"}{asset.model ? ` · ${asset.model}` : ""} · {problemCount} {problemCount === 1 ? "problem" : "problems"} reported</span></span><ChevronRight className="size-4 shrink-0 text-ink-3 rtl:rotate-180" aria-hidden /></button>{writeEnabled ? <div className="flex w-full flex-col items-start gap-1 sm:w-auto sm:items-end"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${asset.name}`} onClick={() => setAssetForm(asset)}><Pencil /></Button>{!["retired", "replaced"].includes(asset.status) ? <Button size="xs" variant="secondary" onClick={() => updateAssetStatus(asset, asset.status === "maintenance" ? "active" : "maintenance")} loading={mutations.asset.isPending} disabled={cannotActivate} title={cannotActivate ? "This machine has a “Do not use” problem. Fix the problem before you mark it active." : undefined}>{asset.status === "maintenance" ? "Mark active" : "Mark in maintenance"}</Button> : null}</div>{cannotActivate ? <span className="max-w-full text-start text-[12px] leading-snug sm:max-w-44 sm:text-end text-warning-deep" role="status">Fix the “Do not use” problem below first.</span> : null}</div> : null}</div>; })}</div><div><EquipmentRecommendationPanel asset={selectedAsset} recommendation={recommendationQuery.data} loading={recommendationQuery.isLoading} error={recommendationQuery.error} />{selectedAsset ? <RepairHistoryPanel asset={selectedAsset} issues={issues} workOrders={workOrders} /> : null}</div></div>}
    </section>
    <div className="grid gap-4 lg:grid-cols-2"><section className="panel overflow-hidden"><SectionHeader icon={ShieldAlert} title="Machine problems" description="Update each problem as it is checked and fixed." />{sortedIssues.length === 0 ? <EmptyState compact title="No problems reported" description="Machine problems will show here." className="m-4" /> : <div className="divide-y divide-line">{sortedIssues.map((issue) => { const asset = assets.find((item) => item.id === issue.assetId); return <div key={issue.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{issue.title}</p><p className="mt-0.5 text-[12px] text-ink-3">{asset?.code ?? "Machine"} · How serious: {SEVERITY_LABELS[issue.severity]} · {issue.downtimeDays ?? 0} {(issue.downtimeDays ?? 0) === 1 ? "day" : "days"} out of use</p></div><StatusBadge status={issue.status} /></div><p className="text-[12px] text-ink-3"><StatusBadge status={issue.safetyStatus} /> · reported <DateTimeText iso={issue.reportedAt} /></p>{writeEnabled && !["resolved", "cancelled"].includes(issue.status) ? <div className="flex flex-wrap gap-2 pt-1"><Button size="xs" variant="secondary" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: issue.status === "open" ? { status: "in_progress" } : { status: "resolved", safetyStatus: "safe_to_operate" } })} loading={mutations.issueUpdate.isPending} title={issue.status === "open" ? undefined : "This also marks the machine as safe to use."}>{issue.status === "open" ? "Start checking" : "Mark fixed"}</Button><Button size="xs" variant="ghost" onClick={() => mutations.issueUpdate.mutate({ id: issue.id, input: { status: "cancelled" } })} loading={mutations.issueUpdate.isPending}>Cancel report</Button></div> : null}</div>; })}</div>}</section>
      <section className="panel overflow-hidden"><SectionHeader icon={Wrench} title="Repair jobs" description="Approve a repair, start the work, then mark it done or cancel it." actions={writeEnabled ? <Button size="sm" onClick={() => setWorkOrderForm("new")} disabled={actionAssets.length === 0}><Plus /> Add repair job</Button> : null} />{sortedWorkOrders.length === 0 ? <EmptyState compact title="No repair jobs" description="Add one when a machine needs a repair or a price to replace it." className="m-4" /> : <div className="divide-y divide-line">{sortedWorkOrders.map((order) => { const asset = assets.find((item) => item.id === order.assetId); return <div key={order.id} className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[13px] font-medium">{order.description}</p><p className="mt-0.5 text-[12px] text-ink-3">{asset?.code ?? "Machine"}{order.vendorName ? ` · ${order.vendorName}` : ""}</p></div><StatusBadge status={order.status} /></div><p className="text-[12px] text-ink-3">Repair cost <MoneyText money={order.totalCost} /> · cost to replace <MoneyText money={order.replacementEstimate} /> · opened <DateTimeText iso={order.openedAt} /></p>{writeEnabled && !["completed", "cancelled"].includes(order.status) ? <div className="flex flex-wrap gap-2 pt-1">{order.status === "draft" ? <Button size="xs" onClick={() => updateWorkOrder(order, "approved")} loading={mutations.workOrder.isPending}><Check /> Approve</Button> : null}{order.status === "approved" ? <Button size="xs" variant="secondary" onClick={() => updateWorkOrder(order, "in_progress")} loading={mutations.workOrder.isPending}><Wrench /> Start work</Button> : null}{order.status === "in_progress" ? <Button size="xs" onClick={() => updateWorkOrder(order, "completed")} loading={mutations.workOrder.isPending}><CheckCircle2 /> Mark done</Button> : null}<Button size="xs" variant="ghost" onClick={() => updateWorkOrder(order, "cancelled")} loading={mutations.workOrder.isPending}>Cancel job</Button><Button size="icon" variant="ghost" aria-label={`Edit ${order.description}`} onClick={() => setWorkOrderForm(order)}><Pencil /></Button></div> : null}</div>; })}</div>}</section></div>
    {assetForm ? <EquipmentAssetForm currency={currency} zones={zones} branchId={branchId} asset={assetForm === "new" ? undefined : assetForm} activeBlocked={assetForm !== "new" && hasUnsafeOpenIssue(assetForm.id)} pending={mutations.asset.isPending} onCancel={() => setAssetForm(null)} onSubmit={(input) => mutations.asset.mutate(input, { onSuccess: () => setAssetForm(null) })} /> : null}
    {issueForm ? <EquipmentIssueForm key={issueForm === true ? "blank" : `${issueForm.assetId ?? ""}|${issueForm.description}`} assets={actionAssets} branchId={branchId} pending={mutations.issue.isPending} initial={issueForm === true ? undefined : issueForm} onCancel={() => setIssueForm(false)} onSubmit={(input) => mutations.issue.mutate(input, { onSuccess: () => setIssueForm(false) })} /> : null}
    {workOrderForm ? <EquipmentWorkOrderForm currency={currency} assets={actionAssets} issues={issues} branchId={branchId} order={workOrderForm === "new" ? undefined : workOrderForm} pending={mutations.workOrder.isPending} onCancel={() => setWorkOrderForm(null)} onSubmit={(input) => mutations.workOrder.mutate(input, { onSuccess: () => setWorkOrderForm(null) })} /> : null}
  </div>;
}
