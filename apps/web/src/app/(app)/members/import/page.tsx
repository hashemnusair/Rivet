"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, FileUp, History, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { isApiError } from "@/lib/api/errors";
import type { MemberImportColumnMapping, MemberImportCommitResult, MemberImportPlanMapping, MemberImportPreview, MemberImportPreviewInput, MemberImportStatus, MemberImportSummary, MemberImportUndoResult } from "@/lib/api/GymOSApi";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { inferMemberImportMapping, mappedMemberCsv, OPTIONAL_MEMBERSHIP_IMPORT_FIELDS, parseCsvMatrix, rejectedMemberRowsCsv, sourcePlanNames, type ImportMatrix } from "@/lib/imports/member-import";
import { qk } from "@/lib/api/keys";
import { getApi } from "@/lib/api/client";
import { downloadTextFile } from "@/lib/exports/download";
import { formatDate, formatDateTime, isCalendarDate } from "@/lib/utils/dates";

const SAMPLE_CSV = `full_name,phone,gender,email,plan_name,membership_start_date,membership_end_date,remaining_visits,freeze_start_date,freeze_end_date,opening_balance,historical_paid_total,historical_payment_date,historical_payment_reference
Samira Haddad,+962790000001,female,samira@example.com,,,,,,,,,,
Yousef Nasser,0790000002,male,yousef@example.com,,,,,,,,,,
Layla Haddad,+447700900123,female,layla@example.com,,,,,,,,,,`;
const MAX_FILE_BYTES = 5_000_000;

function newIdempotencyKey(importId: string, cursor: number): string {
  return `${importId}-${cursor}-${crypto.randomUUID()}`;
}

function todayInTimezone(timezone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch { return new Date().toISOString().slice(0, 10); }
}

/** A date people can read at a glance. Text that is not a real date stays as it was typed in the file. */
function readableDate(value: string | undefined): string {
  return value && isCalendarDate(value) ? formatDate(value) : value || "—";
}

function formatMinor(amount: number | undefined, currency: string): string {
  const digits = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"].includes(currency) ? 3 : ["CLP", "ISK", "JPY", "KRW"].includes(currency) ? 0 : 2;
  return `${currency} ${((amount ?? 0) / 10 ** digits).toFixed(digits)}`;
}

export default function MemberImportPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [matrix, setMatrix] = useState<ImportMatrix>([]);
  const [mapping, setMapping] = useState<MemberImportColumnMapping>({});
  const [planMappings, setPlanMappings] = useState<MemberImportPlanMapping>({});
  const [migrationCutoffDate, setMigrationCutoffDate] = useState(() => todayInTimezone());
  const [preview, setPreview] = useState<MemberImportPreview>();
  const [result, setResult] = useState<MemberImportCommitResult>();
  const [committing, setCommitting] = useState(false);
  const [commitNotice, setCommitNotice] = useState<string>();
  const [fileName, setFileName] = useState("");
  const [sourceKind, setSourceKind] = useState<MemberImportPreviewInput["sourceKind"]>("csv");
  const [fileSize, setFileSize] = useState(0);
  const [fileError, setFileError] = useState("");
  const [draggingFile, setDraggingFile] = useState(false);
  const [showCsvText, setShowCsvText] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [undoTarget, setUndoTarget] = useState<MemberImportSummary>();
  const [undoReason, setUndoReason] = useState("");
  const [undoResult, setUndoResult] = useState<MemberImportUndoResult>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imports = useApiQuery(qk.memberImports(), (api) => api.listMemberImports());
  const plans = useApiQuery(qk.plans({ status: "active", pageSize: 100 }), (api) => api.listPlans({ status: "active", pageSize: 100 }));

  const [branchId, setBranchId] = useState("");
  useEffect(() => {
    const defaultBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? session?.branches[0]?.id;
    setBranchId((current) => visibleBranchId(session?.branches, current) ?? defaultBranchId ?? "");
  }, [session?.activeBranchId, session?.branches]);
  useEffect(() => { setMigrationCutoffDate((current) => current || todayInTimezone(session?.organization.timezone)); }, [session?.organization.timezone]);
  useEffect(() => {
    if (preview && preview.branchId !== visibleBranchId(session?.branches, branchId)) {
      setPreview(undefined);
      setResult(undefined);
    }
  }, [branchId, preview, session?.branches]);

  const headers = useMemo(() => matrix[0] ?? [], [matrix]);
  const mappedCsv = useMemo(() => mappedMemberCsv(matrix, mapping), [mapping, matrix]);
  const sourcePlans = useMemo(() => sourcePlanNames(matrix, mapping), [mapping, matrix]);
  const validRows = useMemo(() => preview?.rows.filter((row) => row.status === "valid") ?? [], [preview]);
  const rejectedRows = useMemo(() => preview?.rows.filter((row) => ["duplicate", "invalid", "skipped"].includes(row.status)) ?? [], [preview]);
  const rejectedCsv = useMemo(() => rejectedMemberRowsCsv(rejectedRows, session?.organization.currency ?? "JOD"), [rejectedRows, session?.organization.currency]);
  const hasRequiredMapping = mapping.fullName != null && mapping.phone != null && mapping.gender != null && new Set([mapping.fullName, mapping.phone, mapping.gender]).size === 3;
  const hasMembershipColumns = OPTIONAL_MEMBERSHIP_IMPORT_FIELDS.some(({ field }) => mapping[field] != null);
  const hasCompletePlanMapping = sourcePlans.every((sourceName) => Boolean(planMappings[sourceName]));

  const previewMutation = useApiMutation((api, input: MemberImportPreviewInput) => api.previewMemberImport(input), {
    onSuccess: (nextPreview) => { setPreview(nextPreview); setResult(undefined); void imports.refetch(); },
  });
  const commitMutation = useApiMutation((api, input: { importId: string; cursor: number; chunkSize: number; idempotencyKey: string }) => api.commitMemberImport(input));
  const undoMutation = useApiMutation((api, input: { importId: string; cursor: number; chunkSize: number; idempotencyKey: string; reason: string }) => api.undoMemberImport(input));

  const setSource = (nextMatrix: ImportMatrix, details: { fileName: string; sourceKind: MemberImportPreviewInput["sourceKind"]; size: number; csvText?: string }) => {
    const clean = nextMatrix.filter((row) => row.some((cell) => cell.trim()));
    setMatrix(clean);
    setMapping(inferMemberImportMapping(clean[0] ?? []));
    setPlanMappings({});
    setFileName(details.fileName);
    setSourceKind(details.sourceKind);
    setFileSize(details.size);
    setCsvText(details.csvText ?? "");
    setPreview(undefined);
    setResult(undefined);
  };

  const loadFile = async (file: File | undefined) => {
    setFileError("");
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (file.size > MAX_FILE_BYTES) { setFileError("This file is too big. Choose a CSV or Excel file of 5 MB or less."); return; }
    if (extension !== "csv" && extension !== "xlsx") { setFileError("This type of file does not work. Choose a CSV or Excel (.xlsx) file."); return; }
    try {
      if (extension === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        const rows = await readSheet(file);
        setSource(rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 10) : cell == null ? "" : String(cell))), { fileName: file.name, sourceKind: "xlsx", size: file.size });
      } else {
        const text = await file.text();
        setSource(parseCsvMatrix(text), { fileName: file.name, sourceKind: "csv", size: file.size, csvText: text });
      }
      setShowCsvText(false);
    } catch {
      setFileError("This file could not be read. Save it again as CSV or Excel, then try again.");
    }
  };

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFile(false);
    void loadFile(event.dataTransfer.files[0]);
  };

  const updateCsvText = (value: string) => {
    setSource(parseCsvMatrix(value), { fileName: "Pasted member list", sourceKind: "pasted", size: new Blob([value]).size, csvText: value });
  };

  const runPreview = () => {
    const selectedBranchId = visibleBranchId(session?.branches, branchId);
    if (!selectedBranchId || !hasRequiredMapping || matrix.length < 2) return;
    previewMutation.mutate({ csv: mappedCsv, branchId: selectedBranchId, sourceFileName: fileName || undefined, sourceKind, sourceHeaders: headers, columnMapping: mapping, migrationCutoffDate, planMappings });
  };

  const commit = async () => {
    if (!preview || preview.branchId !== visibleBranchId(session?.branches, branchId) || committing) return;
    setCommitting(true);
    setCommitNotice(undefined);
    try {
      let cursor = preview.cursor ?? 0;
      let lastResult: MemberImportCommitResult | undefined;
      do {
        lastResult = await new Promise<MemberImportCommitResult>((resolve, reject) => commitMutation.mutate({ importId: preview.id, cursor, chunkSize: 50, idempotencyKey: newIdempotencyKey(preview.id, cursor) }, { onSuccess: resolve, onError: reject }));
        cursor = lastResult.cursor;
      } while (lastResult.status !== "completed");
      setResult(lastResult);
      setPreview(await getApi().getMemberImport(preview.id));
    } catch (error) {
      // A chunk failed or its response was lost. Every chunk is one server
      // transaction, so nothing partial exists; reload the import so the
      // cursor and counts describe what the server actually holds, and let
      // the operator continue from there instead of retrying a stale cursor.
      let stored: MemberImportPreview | undefined;
      try { stored = await getApi().getMemberImport(preview.id); } catch { stored = undefined; }
      if (stored) setPreview(stored);
      const done = stored?.committedCount ?? preview.committedCount ?? 0;
      const position = stored?.cursor ?? preview.cursor ?? 0;
      const total = stored?.totalRows ?? preview.totalRows;
      const message = isApiError(error) ? error.message : "The connection was lost.";
      setCommitNotice(`The import stopped at row ${position} of ${total}. ${message} ${done} ${done === 1 ? "member was" : "members were"} added so far. Rows after that were not added. Choose “Resume import” to continue.`);
    } finally {
      setCommitting(false);
      await invalidate();
      await imports.refetch();
    }
  };

  const resume = async (item: MemberImportSummary) => {
    const detail = await getApi().getMemberImport(item.id);
    setBranchId(detail.branchId);
    setPreview(detail);
    setFileName(detail.sourceFileName ?? "Saved import");
    setMigrationCutoffDate(detail.migrationCutoffDate ?? todayInTimezone(session?.organization.timezone));
    setPlanMappings(detail.planMappings ?? {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const undo = async () => {
    if (!undoTarget || undoReason.trim().length < 3) return;
    let cursor = undoTarget.undoCursor ?? 0;
    let last: MemberImportUndoResult | undefined;
    try {
      do {
        last = await new Promise<MemberImportUndoResult>((resolve, reject) => undoMutation.mutate({ importId: undoTarget.id, cursor, chunkSize: 50, reason: undoReason.trim(), idempotencyKey: newIdempotencyKey(`undo-${undoTarget.id}`, cursor) }, { onSuccess: resolve, onError: reject }));
        cursor = last.cursor;
      } while (last.status !== "undone");
      setUndoResult(last);
      setUndoTarget(undefined);
      setUndoReason("");
    } catch {
      // The mutation hook already showed the server's message. The batch
      // stays in "undoing" with the server's cursor; the history row offers
      // Undo again to continue. Nothing beyond the last finished chunk changed.
    } finally {
      await invalidate();
      await imports.refetch();
    }
  };

  if (!can("members.write")) return <EmptyState title="You don't have access to import members" description="Ask a manager or the owner for access." />;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: "Import" }]} />
    <PageHeader title="Import members" description="Upload your member list. You can check every row before anyone is added." actions={<Button asChild variant="secondary"><Link href="/members"><ArrowLeft /> Back to members</Link></Button>} />

    <section className="panel overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-2"><FileUp className="size-4" aria-hidden /></div><div><h2 className="font-display text-[15px] font-semibold text-ink">Choose your member file</h2><p className="mt-1 max-w-3xl text-[12.5px] text-ink-2">CSV and Excel files work. Your column names do not need to match ours. You will match them in the next step.</p></div></header>
      <div className="space-y-5 p-5">
        <div className="grid items-end gap-4 md:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]"><label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Home branch for these members</span><Select value={branchId || "none"} onValueChange={(value) => { setBranchId(value === "none" ? "" : value); setPreview(undefined); setResult(undefined); }}><SelectTrigger aria-label="Member home branch"><SelectValue placeholder="Choose a branch" /></SelectTrigger><SelectContent><SelectItem value="none">Choose a branch</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></label><p className="border-s-2 border-line-2 ps-3 text-[12px] leading-5 text-ink-2">Phone numbers without a country code get <strong className="font-medium text-ink">+{session?.organization.phoneCountryCallingCode ?? "962"}</strong>. Numbers that already have a country code stay as they are.</p></div>
        <div className={`flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${draggingFile ? "border-[var(--tenant-brand-primary)] bg-sunken" : "border-line-2 bg-surface"}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFile(false); }} onDrop={dropFile}>
          <div className="flex size-11 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-5" aria-hidden /></div><h3 className="mt-3 text-[14px] font-semibold text-ink">{fileName || "Drop a member file here"}</h3><p className="mt-1 text-[12px] text-ink-3">{fileName ? `${Math.max(1, Math.ceil(fileSize / 1024)).toLocaleString()} KB · ${Math.max(0, matrix.length - 1).toLocaleString()} ${matrix.length - 1 === 1 ? "row" : "rows"}` : "CSV or Excel · up to 5 MB · up to 10,000 members"}</p><Button type="button" variant={fileName ? "secondary" : "primary"} className="mt-4" onClick={() => fileInputRef.current?.click()}><Upload /> {fileName ? "Replace file" : "Choose file"}</Button><input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Choose member file" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        {fileError ? <p className="text-[12px] text-danger" role="alert">{fileError}</p> : null}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setShowCsvText((current) => !current)}>{showCsvText ? "Hide pasted list" : matrix.length ? "Paste a different CSV" : "Paste CSV instead"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => downloadTextFile({ content: `\uFEFF${SAMPLE_CSV.replaceAll("\n", "\r\n")}\r\n`, fileName: "rivet-member-import-template.csv", mimeType: "text/csv;charset=utf-8" })}><Download /> Download template</Button></div>
        {showCsvText ? <label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Paste CSV text</span><Textarea rows={7} value={csvText} onChange={(event) => updateCsvText(event.target.value)} placeholder={SAMPLE_CSV} aria-label="Member CSV content" className="font-mono text-[12px]" /></label> : null}
      </div>
    </section>

    {headers.length ? <section className="panel overflow-hidden">
      <header className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-semibold text-ink">Match the columns</h2><p className="mt-1 text-[12.5px] text-ink-2">Name, phone and gender are required. Gender can be male or female, M or F, or the Arabic words.</p></header>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><MappingSelect label="Full name" required headers={headers} value={mapping.fullName} onChange={(value) => { setMapping((current) => ({ ...current, fullName: value })); }} /><MappingSelect label="Phone" required headers={headers} value={mapping.phone} onChange={(value) => { setMapping((current) => ({ ...current, phone: value })); }} /><MappingSelect label="Gender" required headers={headers} value={mapping.gender} onChange={(value) => { setMapping((current) => ({ ...current, gender: value })); }} /><MappingSelect label="Email" headers={headers} value={mapping.email} onChange={(value) => { setMapping((current) => ({ ...current, email: value })); }} /></div>
      <div className="border-t border-line px-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-[13px] font-semibold text-ink">Bring over current memberships</h3><p className="mt-1 max-w-3xl text-[12px] leading-5 text-ink-2">Optional. Match the columns for current and future memberships, freezes, unpaid amounts and past payments. Past payments are saved as history only. They do not create receipts or cash entries.</p></div><label className="w-full space-y-1.5 sm:w-52"><span className="text-[12px] font-medium text-ink">Date of this list</span><Input type="date" value={migrationCutoffDate} onChange={(event) => { setMigrationCutoffDate(event.target.value); setPreview(undefined); setResult(undefined); }} aria-label="Date of this list" /></label></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{OPTIONAL_MEMBERSHIP_IMPORT_FIELDS.map(({ field, label }) => <MappingSelect key={field} label={label} headers={headers} value={mapping[field]} onChange={(value) => { setMapping((current) => ({ ...current, [field]: value })); if (field === "sourcePlanName") setPlanMappings({}); setPreview(undefined); setResult(undefined); }} />)}</div>
        {sourcePlans.length ? <div className="mt-5 rounded-lg border border-line bg-sunken p-4"><div className="flex items-start justify-between gap-4"><div><h4 className="text-[12.5px] font-semibold text-ink">Match your plan names</h4><p className="mt-1 text-[12px] leading-5 text-ink-2">For each plan name in your file, choose the plan it matches here.</p></div><span className="shrink-0 text-[12px] tabular-nums text-ink-3">{Object.keys(planMappings).filter((name) => sourcePlans.includes(name)).length} of {sourcePlans.length} matched</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{sourcePlans.map((sourceName) => <div key={sourceName} className="rounded-md border border-line bg-surface px-3 py-3"><label className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]"><span className="truncate text-[12.5px] font-medium text-ink" dir="auto" title={sourceName}>{sourceName}</span><Select value={planMappings[sourceName] ?? "none"} onValueChange={(value) => { setPlanMappings((current) => ({ ...current, [sourceName]: value === "none" ? "" : value })); setPreview(undefined); setResult(undefined); }}><SelectTrigger aria-label={`Plan for ${sourceName}`}><SelectValue placeholder="Choose a plan" /></SelectTrigger><SelectContent><SelectItem value="none">Choose a plan</SelectItem>{plans.data?.items.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></label></div>)}</div></div> : null}
        {hasMembershipColumns ? <p className="mt-4 text-[12px] leading-5 text-ink-3">For a current freeze, give both freeze dates. The membership end date should already include the frozen days. Plans with a set number of visits also need the visits remaining. Enter money amounts in {session?.organization.currency ?? "your gym's currency"}.</p> : null}
      </div>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-3xl text-[12px] leading-5 text-ink-3">Imported members get no marketing messages until they agree to receive them.</p><Button className="shrink-0" onClick={runPreview} disabled={!branchId || !hasRequiredMapping || !hasCompletePlanMapping || !migrationCutoffDate || matrix.length < 2} loading={previewMutation.isPending}><CheckCircle2 /> Check members</Button></div>
    </section> : null}

    {preview ? <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-display text-[15px] font-semibold text-ink">Review before import</h2><p className="mt-1 text-[12.5px] text-ink-2">{preview.totalRows} rows · {preview.validRows} ready · {preview.duplicateRows} duplicates · {preview.errorRows} need fixing</p>{preview.membershipRows ? <p className="mt-1 text-[12px] text-ink-3">{preview.membershipRows} memberships · {preview.openingBalanceRows ?? 0} unpaid amounts · {preview.historicalEvidenceRows ?? 0} past payments · list date {readableDate(preview.migrationCutoffDate)}</p> : null}</div><div className="flex flex-wrap gap-2">{rejectedRows.length > 0 ? <Button type="button" variant="secondary" onClick={() => downloadTextFile({ content: rejectedCsv, fileName: `rivet-rejected-${preview.id}.csv`, mimeType: "text/csv;charset=utf-8" })}><Download /> Download problem rows</Button> : null}<Button onClick={commit} disabled={validRows.length === 0 || committing || preview.status === "completed" || preview.status === "undone"} loading={committing}>{committing ? "Importing…" : preview.status === "processing" ? "Resume import" : preview.status === "completed" ? "Import complete" : `Import ${validRows.length} ${validRows.length === 1 ? "member" : "members"}`}</Button></div></div>
      <ImportPreviewRows preview={preview} currency={preview.currency ?? session?.organization.currency ?? "JOD"} />
    </section> : null}

    {commitNotice ? <section className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Import stopped</p><p className="mt-0.5">{commitNotice}</p></div></section> : null}
    {result ? <section className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[13px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Import finished</p><p className="mt-0.5">{result.committedCount} {result.committedCount === 1 ? "member" : "members"} added. {result.skippedCount} {result.skippedCount === 1 ? "row" : "rows"} skipped. You can undo this import for 7 days from “Recent imports” below.</p></div></section> : null}
    {undoResult ? <section className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="status"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Import undone</p><p className="mt-0.5">{undoResult.archivedCount} {undoResult.archivedCount === 1 ? "member" : "members"} archived. {undoResult.skippedCount} kept because they were changed or used after the import.</p></div></section> : null}

    <section className="panel overflow-hidden"><header className="flex items-start gap-3 border-b border-line px-5 py-4"><History className="mt-0.5 size-4 text-ink-3" aria-hidden /><div><h2 className="font-display text-[15px] font-semibold text-ink">Recent imports</h2><p className="mt-1 text-[12.5px] text-ink-2">Continue an import that stopped, look at a past import, or undo one.</p></div></header>{imports.isLoading ? <p className="p-5 text-[12.5px] text-ink-3">Loading past imports…</p> : imports.isError ? <ErrorState onRetry={() => imports.refetch()} /> : !imports.data?.length ? <div className="p-5"><EmptyState icon={History} title="No imports yet" description="Files you check will show here." /></div> : <div className="divide-y divide-line">{imports.data.map((item) => <ImportHistoryRow key={item.id} item={item} branchName={session?.branches.find((branch) => branch.id === item.branchId)?.name ?? "Branch"} canUndo={can("members.archive")} onResume={() => { void resume(item); }} onUndo={() => { setUndoTarget(item); setUndoResult(undefined); }} />)}</div>}</section>

    <Dialog open={Boolean(undoTarget)} onOpenChange={(open) => { if (!open) setUndoTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>Undo this member import?</DialogTitle><DialogDescription>Members added by this import will be archived. Members who were edited, paid, checked in or had their membership changed are kept.</DialogDescription></DialogHeader><DialogBody className="space-y-3"><div className="flex gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />You cannot reverse this. The members&apos; history is kept.</div><label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Reason</span><Textarea value={undoReason} onChange={(event) => setUndoReason(event.target.value)} placeholder="Why are you undoing this import?" /></label></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setUndoTarget(undefined)}>Cancel</Button><Button variant="danger" disabled={undoReason.trim().length < 3} loading={undoMutation.isPending} onClick={() => { void undo(); }}><RotateCcw /> Undo import</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function MappingSelect({ label, required, headers, value, onChange }: { label: string; required?: boolean; headers: string[]; value?: number; onChange: (value: number | undefined) => void }) {
  return <label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{label}{required ? <span className="text-danger"> *</span> : null}</span><Select value={value == null ? "none" : String(value)} onValueChange={(next) => onChange(next === "none" ? undefined : Number(next))}><SelectTrigger aria-label={`Column for ${label.toLowerCase()}`}><SelectValue placeholder="Choose a column" /></SelectTrigger><SelectContent><SelectItem value="none">{required ? "Choose a column" : "Don't import"}</SelectItem>{headers.map((header, index) => <SelectItem key={`${header}-${index}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}</SelectContent></Select></label>;
}

function ImportPreviewRows({ preview, currency }: { preview: MemberImportPreview; currency: string }) {
  return (
    <div className="max-h-[32rem] overflow-y-auto">
      <ul className="divide-y divide-line lg:hidden" aria-label="Rows in your file">
        {preview.rows.map((row) => (
          <li key={row.rowNumber} className="space-y-3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{row.fullName || "Name missing"}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">Row <span className="font-mono">{row.rowNumber}</span>{row.email ? ` · ${row.email}` : " · No email"}</p>
              </div>
              <ImportRowStatus row={row} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
              <div><dt className="text-ink-3">Phone</dt><dd className="mt-0.5" dir="ltr">{row.phone || "—"}</dd></div>
              <div><dt className="text-ink-3">Unpaid amount</dt><dd className="mt-0.5 tabular">{row.openingBalanceMinor ? formatMinor(row.openingBalanceMinor, currency) : "—"}</dd></div>
              <div className="col-span-2"><dt className="text-ink-3">Membership</dt><dd className="mt-0.5">{row.planName ? `${row.planName} · ${readableDate(row.membershipStartDate)} to ${readableDate(row.membershipEndDate)}${row.freezeStartDate ? " · frozen" : ""}` : "No membership"}</dd></div>
            </dl>
            {row.errors.length ? <p className="text-[12px] leading-relaxed text-danger">{row.errors.join("; ")}</p> : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full min-w-[960px] text-start text-[12.5px] lg:table">
        <thead className="sticky top-0 bg-sunken text-[12px] text-ink-3"><tr><th className="px-5 py-2 text-start font-medium">Row</th><th className="px-3 py-2 text-start font-medium">Member</th><th className="px-3 py-2 text-start font-medium">Phone</th><th className="px-3 py-2 text-start font-medium">Membership</th><th className="px-3 py-2 text-start font-medium">Unpaid amount</th><th className="px-5 py-2 text-start font-medium">Result</th></tr></thead>
        <tbody className="divide-y divide-line">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-5 py-3 font-mono text-ink-3">{row.rowNumber}</td><td className="px-3 py-3"><p className="font-medium text-ink">{row.fullName || "—"}</p><p className="mt-0.5 text-[12px] text-ink-3">{row.email || "No email"}</p></td><td className="px-3 py-3 text-ink-2" dir="ltr">{row.phone || "—"}</td><td className="px-3 py-3 text-ink-2">{row.planName ? <><p className="font-medium text-ink">{row.planName}</p><p className="mt-0.5 text-[12px] text-ink-3">{readableDate(row.membershipStartDate)} to {readableDate(row.membershipEndDate)}{row.freezeStartDate ? " · frozen" : ""}</p></> : "No membership"}</td><td className="px-3 py-3 tabular text-ink-2">{row.openingBalanceMinor ? formatMinor(row.openingBalanceMinor, currency) : "—"}</td><td className="px-5 py-3"><ImportRowStatus row={row} />{row.errors.length ? <span className="ms-2 text-[12px] text-ink-3">{row.errors.join("; ")}</span> : null}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ImportRowStatus({ row }: { row: MemberImportPreview["rows"][number] }) {
  const label = row.status === "valid" ? "Ready" : row.status === "committed" ? "Added" : row.status === "duplicate" ? "Duplicate" : row.status === "invalid" ? "Needs fixing" : "Skipped";
  const tone = row.status === "valid" || row.status === "committed" ? "text-success-deep" : row.status === "duplicate" ? "text-warning-deep" : "text-danger";
  return <span className={`shrink-0 text-[12.5px] font-medium ${tone}`}>{label}</span>;
}

const IMPORT_STATUS_LABELS: Record<MemberImportStatus, string> = { preview: "Not added yet", processing: "Not finished", completed: "Done", undoing: "Undo not finished", undone: "Undone" };

function ImportHistoryRow({ item, branchName, canUndo, onResume, onUndo }: { item: MemberImportSummary; branchName: string; canUndo: boolean; onResume: () => void; onUndo: () => void }) {
  const undoAvailable = canUndo && (item.status === "completed" || item.status === "undoing") && Boolean(item.undoExpiresAt && Date.parse(item.undoExpiresAt) > Date.now());
  return <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-medium text-ink">{item.sourceFileName || "Pasted member list"}</p><span className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-2">{IMPORT_STATUS_LABELS[item.status ?? "preview"]}</span></div><p className="mt-1 text-[12px] text-ink-3">{branchName} · {item.totalRows} rows · {item.committedCount ?? 0} added{item.membershipRows ? ` · ${item.membershipRows} memberships` : ""} · {formatDateTime(item.createdAt)}</p></div><div className="flex shrink-0 flex-wrap gap-2">{item.status !== "undone" ? <Button size="sm" variant="secondary" onClick={onResume}>{item.status === "preview" || item.status === "processing" ? "Resume" : "View"}</Button> : null}{undoAvailable ? <Button size="sm" variant="ghost" onClick={onUndo}><RotateCcw /> {item.status === "undoing" ? "Continue undo" : "Undo"}</Button> : null}</div></div>;
}
