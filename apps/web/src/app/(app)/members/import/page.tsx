"use client";
import { useLocale } from "@/lib/i18n/provider";

import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, FileUp, History, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { isApiError, localizeApiError } from "@/lib/api/errors";
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
import { importColumnLabel, inferMemberImportMapping, mappedMemberCsv, OPTIONAL_MEMBERSHIP_IMPORT_FIELDS, parseCsvMatrix, rejectedMemberRowsCsv, sourcePlanNames, type ImportMatrix } from "@/lib/imports/member-import";
import { qk } from "@/lib/api/keys";
import { getApi } from "@/lib/api/client";
import { downloadTextFile } from "@/lib/exports/download";
import { isCalendarDate } from "@/lib/utils/dates";
import { useFormat } from "@/lib/i18n/format";
import { memberImportErrors } from "@/lib/imports/member-import-errors";
import { money } from "@/lib/utils/money";

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

export default function MemberImportPage() {
  const { t, locale, isolate, isolateLtr } = useLocale();
  const f = useFormat();
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
  const [stopped, setCommitNotice] = useState<{ position: number; total: number; done: number; cause: unknown }>();
  const commitNotice = stopped ? t("memberMigration.stoppedDetail", { position: f.number(stopped.position), total: f.number(stopped.total), message: isApiError(stopped.cause) ? localizeApiError(stopped.cause, locale).message : t("memberMigration.connectionLost"), members: t("memberMigration.members", { count: stopped.done }) }) : undefined;
  const [resumeCause, setResumeCause] = useState<unknown>();
  const [fileName, setFileName] = useState("");
  const [sourceKind, setSourceKind] = useState<MemberImportPreviewInput["sourceKind"]>("csv");
  const [fileSize, setFileSize] = useState(0);
  const [fileError, setFileError] = useState<"fileTooBig" | "fileUnsupported" | "fileUnreadable">();
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
  const rejectedCsv = useMemo(() => rejectedMemberRowsCsv(rejectedRows, session?.organization.currency ?? "JOD", locale), [rejectedRows, session?.organization.currency, locale]);
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
    setFileError(undefined);
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    if (file.size > MAX_FILE_BYTES) { setFileError("fileTooBig"); return; }
    if (extension !== "csv" && extension !== "xlsx") { setFileError("fileUnsupported"); return; }
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
      setFileError("fileUnreadable");
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
      setCommitNotice({ position, total, done, cause: error });
    } finally {
      setCommitting(false);
      await invalidate();
      await imports.refetch();
    }
  };

  const resume = async (item: MemberImportSummary) => {
    setResumeCause(undefined);
    try {
    const detail = await getApi().getMemberImport(item.id);
    setBranchId(detail.branchId);
    setPreview(detail);
    setFileName(detail.sourceFileName ?? "");
    setSourceKind(detail.sourceKind ?? "csv");
    setMigrationCutoffDate(detail.migrationCutoffDate ?? todayInTimezone(session?.organization.timezone));
    setPlanMappings(detail.planMappings ?? {});
    window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) { setResumeCause(cause); }
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

  if (!can("members.write")) return <EmptyState title={t("memberMigration.importDenied")} description={t("memberMigration.askAccess")} />;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: t("palette.groups.members"), href: "/members" }, { label: t("common.action.import") }]} />
    <PageHeader title={t("members.list.actions.import")} description={t("memberMigration.importHint")} actions={<Button asChild variant="secondary"><Link href="/members"><ArrowLeft className="rtl:rotate-180" /> {" "}{t("memberMigration.backMembers")}</Link></Button>} />

    <section className="panel overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-2"><FileUp className="size-4" aria-hidden /></div><div><h2 className="font-display text-[15px] font-semibold text-ink">{t("memberMigration.chooseMemberFile")}</h2><p className="mt-1 max-w-3xl text-[12.5px] text-ink-2">{t("memberMigration.fileHint")}</p></div></header>
      <div className="space-y-5 p-5">
        <div className="grid items-end gap-4 md:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]"><label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{t("memberMigration.homeBranch")}</span><Select value={branchId || "none"} onValueChange={(value) => { setBranchId(value === "none" ? "" : value); setPreview(undefined); setResult(undefined); }}><SelectTrigger aria-label={t("memberMigration.homeBranchLabel")}><SelectValue placeholder={t("renewFlow.adjust.transfer.chooseBranch")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("renewFlow.adjust.transfer.chooseBranch")}</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></label><p className="border-s-2 border-line-2 ps-3 text-[12px] leading-5 text-ink-2">{t("memberMigration.phoneCountryHint", { code: isolateLtr(`+${session?.organization.phoneCountryCallingCode ?? "962"}`) })}</p></div>
        <div className={`flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${draggingFile ? "border-[var(--tenant-brand-primary)] bg-sunken" : "border-line-2 bg-surface"}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFile(false); }} onDrop={dropFile}>
          <div className="flex size-11 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-5" aria-hidden /></div><h3 className="mt-3 text-[14px] font-semibold text-ink">{fileName ? sourceKind === "pasted" ? t("memberMigration.pastedList") : <bdi>{fileName}</bdi> : t("memberMigration.dropFile")}</h3><p className="mt-1 text-[12px] text-ink-3">{fileName ? t("memberMigration.fileSummary", { size: f.number(Math.max(1, Math.ceil(fileSize / 1024))), rows: t("memberMigration.rows", { count: Math.max(0, matrix.length - 1) }) }) : t("memberMigration.fileLimits")}</p><Button type="button" variant={fileName ? "secondary" : "primary"} className="mt-4" onClick={() => fileInputRef.current?.click()}><Upload /> {fileName ? t("memberMigration.replaceFile") : t("memberMigration.chooseFile")}</Button><input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label={t("memberMigration.fileInput")} onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        {fileError ? <p className="text-[12px] text-danger" role="alert">{t(`memberMigration.${fileError}`)}</p> : null}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setShowCsvText((current) => !current)}>{showCsvText ? t("memberMigration.hidePaste") : matrix.length ? t("memberMigration.pasteDifferent") : t("memberMigration.pasteInstead")}</Button><Button type="button" variant="ghost" size="sm" onClick={() => downloadTextFile({ content: `\uFEFF${SAMPLE_CSV.replaceAll("\n", "\r\n")}\r\n`, fileName: "rivet-member-import-template.csv", mimeType: "text/csv;charset=utf-8" })}><Download /> {" "}{t("memberMigration.sampleDownload")}</Button></div>
        {showCsvText ? <label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{t("memberMigration.pasteText")}</span><Textarea rows={7} value={csvText} onChange={(event) => updateCsvText(event.target.value)} placeholder={SAMPLE_CSV} aria-label={t("memberMigration.csvContent")} className="font-mono text-[12px]" /></label> : null}
      </div>
    </section>

    {headers.length ? <section className="panel overflow-hidden">
      <header className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-semibold text-ink">{t("memberMigration.matchColumns")}</h2><p className="mt-1 text-[12.5px] text-ink-2">{t("memberMigration.columnsHint")}</p></header>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><MappingSelect label={t("common.label.fullName")} required headers={headers} value={mapping.fullName} onChange={(value) => { setMapping((current) => ({ ...current, fullName: value })); }} /><MappingSelect label={t("common.label.phone")} required headers={headers} value={mapping.phone} onChange={(value) => { setMapping((current) => ({ ...current, phone: value })); }} /><MappingSelect label={t("memberProfile.details.gender")} required headers={headers} value={mapping.gender} onChange={(value) => { setMapping((current) => ({ ...current, gender: value })); }} /><MappingSelect label={t("common.label.email")} headers={headers} value={mapping.email} onChange={(value) => { setMapping((current) => ({ ...current, email: value })); }} /></div>
      <div className="border-t border-line px-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-[13px] font-semibold text-ink">{t("memberMigration.bringMemberships")}</h3><p className="mt-1 max-w-3xl text-[12px] leading-5 text-ink-2">{t("memberMigration.membershipHint")}</p></div><label className="w-full space-y-1.5 sm:w-52"><span className="text-[12px] font-medium text-ink">{t("memberMigration.listDate")}</span><Input type="date" value={migrationCutoffDate} onChange={(event) => { setMigrationCutoffDate(event.target.value); setPreview(undefined); setResult(undefined); }} aria-label={t("memberMigration.listDate")} /></label></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{OPTIONAL_MEMBERSHIP_IMPORT_FIELDS.map(({ field }) => <MappingSelect key={field} label={importColumnLabel(t, field)} headers={headers} value={mapping[field]} onChange={(value) => { setMapping((current) => ({ ...current, [field]: value })); if (field === "sourcePlanName") setPlanMappings({}); setPreview(undefined); setResult(undefined); }} />)}</div>
        {sourcePlans.length ? <div className="mt-5 rounded-lg border border-line bg-sunken p-4"><div className="flex items-start justify-between gap-4"><div><h4 className="text-[12.5px] font-semibold text-ink">{t("memberMigration.matchPlans")}</h4><p className="mt-1 text-[12px] leading-5 text-ink-2">{t("memberMigration.plansHint")}</p></div><span className="shrink-0 text-[12px] tabular-nums text-ink-3">{t("memberMigration.plansMatched", { matched: f.number(Object.keys(planMappings).filter((name) => sourcePlans.includes(name)).length), total: f.number(sourcePlans.length) })}</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{sourcePlans.map((sourceName) => <div key={sourceName} className="rounded-md border border-line bg-surface px-3 py-3"><label className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]"><span className="truncate text-[12.5px] font-medium text-ink" dir="auto" title={sourceName}>{sourceName}</span><Select value={planMappings[sourceName] ?? "none"} onValueChange={(value) => { setPlanMappings((current) => ({ ...current, [sourceName]: value === "none" ? "" : value })); setPreview(undefined); setResult(undefined); }}><SelectTrigger aria-label={t("memberMigration.planFor", { name: sourceName })}><SelectValue placeholder={t("renewFlow.sale.errors.choosePlan")} /></SelectTrigger><SelectContent><SelectItem value="none">{t("renewFlow.sale.errors.choosePlan")}</SelectItem>{plans.data?.items.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select></label></div>)}</div></div> : null}
        {hasMembershipColumns ? <p className="mt-4 text-[12px] leading-5 text-ink-3">{t("memberMigration.membershipColumnsHint", { currency: locale === "ar" && session?.organization.currency === "JOD" ? "د.أ" : session?.organization.currency ?? "JOD" })}</p> : null}
      </div>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-3xl text-[12px] leading-5 text-ink-3">{t("memberMigration.consentHint")}</p><Button className="shrink-0" onClick={runPreview} disabled={!branchId || !hasRequiredMapping || !hasCompletePlanMapping || !migrationCutoffDate || matrix.length < 2} loading={previewMutation.isPending}><CheckCircle2 /> {" "}{t("memberMigration.checkMembers")}</Button></div>
    </section> : null}

    {preview ? <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-display text-[15px] font-semibold text-ink">{t("memberMigration.reviewTitle")}</h2><p className="mt-1 text-[12.5px] text-ink-2">{t("memberMigration.previewSummary", { rows: t("memberMigration.rows", { count: preview.totalRows }), ready: f.number(preview.validRows), duplicates: f.number(preview.duplicateRows), invalid: f.number(preview.errorRows) })}</p>{preview.membershipRows ? <p className="mt-1 text-[12px] text-ink-3">{t("memberMigration.migrationSummary", { memberships: t("memberEnrollment.membershipCount", { count: preview.membershipRows }), balances: f.number(preview.openingBalanceRows ?? 0), payments: f.number(preview.historicalEvidenceRows ?? 0), date: isolate(preview.migrationCutoffDate ? f.date(preview.migrationCutoffDate) : "—") })}</p> : null}</div><div className="flex flex-wrap gap-2">{rejectedRows.length > 0 ? <Button type="button" variant="secondary" onClick={() => downloadTextFile({ content: rejectedCsv, fileName: `rivet-rejected-${preview.id}.csv`, mimeType: "text/csv;charset=utf-8" })}><Download /> {" "}{t("memberMigration.problemDownload")}</Button> : null}<Button onClick={commit} disabled={validRows.length === 0 || committing || preview.status === "completed" || preview.status === "undone"} loading={committing}>{committing ? t("memberMigration.importing") : preview.status === "processing" ? t("memberMigration.resumeImport") : preview.status === "completed" ? t("memberMigration.importComplete") : t("memberMigration.importMembers", { members: t("memberMigration.members", { count: validRows.length }) })}</Button></div></div>
      <ImportPreviewRows preview={preview} currency={preview.currency ?? session?.organization.currency ?? "JOD"} />
    </section> : null}

    {commitNotice ? <section className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="alert"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">{t("memberMigration.importStopped")}</p><p className="mt-0.5">{commitNotice}</p></div></section> : null}
    {result ? <section className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[13px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">{t("memberMigration.importFinished")}</p><p className="mt-0.5">{t("memberMigration.finishedDetail", { members: t("memberMigration.members", { count: result.committedCount }), rows: f.number(result.skippedCount) })}</p></div></section> : null}
    {undoResult ? <section className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="status"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">{t("memberMigration.importUndone")}</p><p className="mt-0.5">{t("memberMigration.undoneDetail", { members: t("memberMigration.members", { count: undoResult.archivedCount }), kept: f.number(undoResult.skippedCount) })}</p></div></section> : null}

    {resumeCause ? <ErrorState description={isApiError(resumeCause) ? localizeApiError(resumeCause, locale).message : t("memberMigration.resumeFailed")} /> : null}
    <section className="panel overflow-hidden"><header className="flex items-start gap-3 border-b border-line px-5 py-4"><History className="mt-0.5 size-4 text-ink-3" aria-hidden /><div><h2 className="font-display text-[15px] font-semibold text-ink">{t("memberMigration.recentImports")}</h2><p className="mt-1 text-[12.5px] text-ink-2">{t("memberMigration.recentHint")}</p></div></header>{imports.isLoading ? <p className="p-5 text-[12.5px] text-ink-3">{t("memberMigration.loadingImports")}</p> : imports.isError ? <ErrorState onRetry={() => imports.refetch()} /> : !imports.data?.length ? <div className="p-5"><EmptyState icon={History} title={t("memberMigration.noImports")} description={t("memberMigration.noImportsHint")} /></div> : <div className="divide-y divide-line">{imports.data.map((item) => <ImportHistoryRow key={item.id} item={item} branchName={session?.branches.find((branch) => branch.id === item.branchId)?.name ?? t("memberMigration.branch")} canUndo={can("members.archive")} onResume={() => { void resume(item); }} onUndo={() => { setUndoTarget(item); setUndoResult(undefined); }} />)}</div>}</section>

    <Dialog open={Boolean(undoTarget)} onOpenChange={(open) => { if (!open) setUndoTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>{t("memberMigration.undoTitle")}</DialogTitle><DialogDescription>{t("memberMigration.undoHint")}</DialogDescription></DialogHeader><DialogBody className="space-y-3"><div className="flex gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t("memberMigration.undoWarning")}</div><label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{t("common.label.reason")}</span><Textarea value={undoReason} onChange={(event) => setUndoReason(event.target.value)} placeholder={t("memberMigration.undoReason")} /></label></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setUndoTarget(undefined)}>{t("common.action.cancel")}</Button><Button variant="danger" disabled={undoReason.trim().length < 3} loading={undoMutation.isPending} onClick={() => { void undo(); }}><RotateCcw /> {" "}{t("memberMigration.undoImport")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function MappingSelect({ label, required, headers, value, onChange }: { label: string; required?: boolean; headers: string[]; value?: number; onChange: (value: number | undefined) => void }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  return <label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{label}{required ? <span className="text-danger"> *</span> : null}</span><Select value={value == null ? "none" : String(value)} onValueChange={(next) => onChange(next === "none" ? undefined : Number(next))}><SelectTrigger aria-label={t("memberMigration.columnFor", { label: locale === "en" ? label.toLowerCase() : label })}><SelectValue placeholder={t("memberMigration.chooseColumn")} /></SelectTrigger><SelectContent><SelectItem value="none">{required ? t("memberMigration.chooseColumn") : t("memberMigration.dontImport")}</SelectItem>{headers.map((header, index) => <SelectItem key={`${header}-${index}`} value={String(index)}>{header || t("memberMigration.columnNumber", { number: f.number(index + 1) })}</SelectItem>)}</SelectContent></Select></label>;
}

function ImportPreviewRows({ preview, currency }: { preview: MemberImportPreview; currency: string }) {
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const readableDate = (value: string | undefined) => value && isCalendarDate(value) ? f.date(value) : value || "—";
  const dateRange = (row: MemberImportPreview["rows"][number]) => t("memberMigration.dateRange", { start: isolate(readableDate(row.membershipStartDate)), end: isolate(readableDate(row.membershipEndDate)) }) + (row.freezeStartDate ? t("memberMigration.frozenSuffix") : "");
  return (
    <div className="max-h-[32rem] overflow-y-auto">
      <ul className="divide-y divide-line lg:hidden" aria-label={t("memberMigration.fileRows")}>
        {preview.rows.map((row) => (
          <li key={row.rowNumber} className="space-y-3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{row.fullName || t("memberMigration.nameMissing")}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{t("memberMigration.rowNumber", { number: f.number(row.rowNumber) })} · {row.email ? <bdi dir="ltr">{row.email}</bdi> : t("memberMigration.noEmail")}</p>
              </div>
              <ImportRowStatus row={row} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
              <div><dt className="text-ink-3">{t("common.label.phone")}</dt><dd className="mt-0.5" dir="ltr">{row.phone || "—"}</dd></div>
              <div><dt className="text-ink-3">{t("memberMigration.unpaidAmount")}</dt><dd className="mt-0.5 tabular">{row.openingBalanceMinor ? f.money(money(row.openingBalanceMinor, currency)) : "—"}</dd></div>
              <div className="col-span-2"><dt className="text-ink-3">{t("memberProfile.followUp.membershipFallback")}</dt><dd className="mt-0.5">{row.planName ? `${isolate(row.planName)} · ${dateRange(row)}` : t("domain.membershipStatus.none")}</dd></div>
            </dl>
            {row.errors.length ? <p className="text-[12px] leading-relaxed text-danger">{memberImportErrors(t, row, isolate).join(locale === "ar" ? "؛ " : "; ")}</p> : null}
          </li>
        ))}
      </ul>
      <table className="hidden w-full min-w-[960px] text-start text-[12.5px] lg:table">
        <thead className="sticky top-0 bg-sunken text-[12px] text-ink-3"><tr><th className="px-5 py-2 text-start font-medium">{t("memberMigration.row")}</th><th className="px-3 py-2 text-start font-medium">{t("palette.kind.member")}</th><th className="px-3 py-2 text-start font-medium">{t("common.label.phone")}</th><th className="px-3 py-2 text-start font-medium">{t("memberProfile.followUp.membershipFallback")}</th><th className="px-3 py-2 text-start font-medium">{t("memberMigration.unpaidAmount")}</th><th className="px-5 py-2 text-start font-medium">{t("memberProfile.checkIns.result")}</th></tr></thead>
        <tbody className="divide-y divide-line">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-5 py-3 font-mono text-ink-3">{row.rowNumber}</td><td className="px-3 py-3"><p className="font-medium text-ink">{row.fullName || "—"}</p><p className="mt-0.5 text-[12px] text-ink-3">{row.email || t("memberMigration.noEmail")}</p></td><td className="px-3 py-3 text-ink-2" dir="ltr">{row.phone || "—"}</td><td className="px-3 py-3 text-ink-2">{row.planName ? <><p className="font-medium text-ink">{row.planName}</p><p className="mt-0.5 text-[12px] text-ink-3">{dateRange(row)}</p></> : t("domain.membershipStatus.none")}</td><td className="px-3 py-3 tabular text-ink-2">{row.openingBalanceMinor ? f.money(money(row.openingBalanceMinor, currency)) : "—"}</td><td className="px-5 py-3"><ImportRowStatus row={row} />{row.errors.length ? <span className="ms-2 text-[12px] text-ink-3">{memberImportErrors(t, row, isolate).join(locale === "ar" ? "؛ " : "; ")}</span> : null}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ImportRowStatus({ row }: { row: MemberImportPreview["rows"][number] }) {
  const { t } = useLocale();
  const label = row.status === "valid" ? t("crm.lead.ready") : row.status === "committed" ? t("memberMigration.added") : row.status === "duplicate" ? t("memberMigration.duplicate") : row.status === "invalid" ? t("memberMigration.needsFix") : t("memberMigration.skipped");
  const tone = row.status === "valid" || row.status === "committed" ? "text-success-deep" : row.status === "duplicate" ? "text-warning-deep" : "text-danger";
  return <span className={`shrink-0 text-[12.5px] font-medium ${tone}`}>{label}</span>;
}



function ImportHistoryRow({ item, branchName, canUndo, onResume, onUndo }: { item: MemberImportSummary; branchName: string; canUndo: boolean; onResume: () => void; onUndo: () => void }) {
  const { t, isolate } = useLocale();
  const f = useFormat();
const IMPORT_STATUS_LABELS: Record<MemberImportStatus, string> = { preview: t("memberMigration.notAdded"), processing: t("memberMigration.notFinished"), completed: t("memberMigration.importDone"), undoing: t("memberMigration.undoNotFinished"), undone: t("memberMigration.undone") };
  const undoAvailable = canUndo && (item.status === "completed" || item.status === "undoing") && Boolean(item.undoExpiresAt && Date.parse(item.undoExpiresAt) > Date.now());
  return <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-medium text-ink">{item.sourceKind === "pasted" ? t("memberMigration.pastedList") : item.sourceFileName ? <bdi>{item.sourceFileName}</bdi> : t("memberMigration.savedImport")}</p><span className="rounded-full border border-line px-2 py-0.5 text-[12px] text-ink-2">{IMPORT_STATUS_LABELS[item.status ?? "preview"]}</span></div><p className="mt-1 text-[12px] text-ink-3">{t("memberMigration.historySummary", { branch: isolate(branchName), rows: t("memberMigration.rows", { count: item.totalRows }), added: f.number(item.committedCount ?? 0), date: isolate(f.dateTime(item.createdAt)) })}{item.membershipRows ? ` · ${t("memberEnrollment.membershipCount", { count: item.membershipRows })}` : ""}</p></div><div className="flex shrink-0 flex-wrap gap-2">{item.status !== "undone" ? <Button size="sm" variant="secondary" onClick={onResume}>{item.status === "preview" || item.status === "processing" ? t("memberMigration.resume") : t("memberMigration.view")}</Button> : null}{undoAvailable ? <Button size="sm" variant="ghost" onClick={onUndo}><RotateCcw /> {item.status === "undoing" ? t("memberMigration.continueUndo") : t("memberMigration.undo")}</Button> : null}</div></div>;
}
