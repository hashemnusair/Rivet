"use client";

import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, FileUp, History, RotateCcw, Upload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MemberImportColumnMapping, MemberImportCommitResult, MemberImportPreview, MemberImportPreviewInput, MemberImportSummary, MemberImportUndoResult } from "@/lib/api/GymOSApi";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { inferMemberImportMapping, mappedMemberCsv, parseCsvMatrix, rejectedMemberRowsCsv, type ImportMatrix } from "@/lib/imports/member-import";
import { qk } from "@/lib/api/keys";
import { getApi } from "@/lib/api/client";

const SAMPLE_CSV = `full_name,phone,email
Samira Haddad,+962790000001,samira@example.com
Yousef Nasser,0790000002,yousef@example.com
Layla Haddad,+447700900123,layla@example.com`;
const MAX_FILE_BYTES = 5_000_000;
const TEMPLATE_DOWNLOAD = `data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`;

function newIdempotencyKey(importId: string, cursor: number): string {
  return `${importId}-${cursor}-${crypto.randomUUID()}`;
}

function downloadHref(content: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
}

export default function MemberImportPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [matrix, setMatrix] = useState<ImportMatrix>([]);
  const [mapping, setMapping] = useState<MemberImportColumnMapping>({});
  const [preview, setPreview] = useState<MemberImportPreview>();
  const [result, setResult] = useState<MemberImportCommitResult>();
  const [committing, setCommitting] = useState(false);
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

  const [branchId, setBranchId] = useState("");
  useEffect(() => {
    const defaultBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? session?.branches[0]?.id;
    setBranchId((current) => visibleBranchId(session?.branches, current) ?? defaultBranchId ?? "");
  }, [session?.activeBranchId, session?.branches]);
  useEffect(() => {
    if (preview && preview.branchId !== visibleBranchId(session?.branches, branchId)) {
      setPreview(undefined);
      setResult(undefined);
    }
  }, [branchId, preview, session?.branches]);

  const headers = matrix[0] ?? [];
  const mappedCsv = useMemo(() => mappedMemberCsv(matrix, mapping), [mapping, matrix]);
  const validRows = useMemo(() => preview?.rows.filter((row) => row.status === "valid") ?? [], [preview]);
  const rejectedCsv = useMemo(() => preview ? rejectedMemberRowsCsv(preview.rows) : "", [preview]);
  const hasRequiredMapping = mapping.fullName != null && mapping.phone != null && mapping.fullName !== mapping.phone;

  const previewMutation = useApiMutation((api, input: MemberImportPreviewInput) => api.previewMemberImport(input), {
    onSuccess: (nextPreview) => { setPreview(nextPreview); setResult(undefined); void imports.refetch(); },
  });
  const commitMutation = useApiMutation((api, input: { importId: string; cursor: number; chunkSize: number; idempotencyKey: string }) => api.commitMemberImport(input));
  const undoMutation = useApiMutation((api, input: { importId: string; cursor: number; chunkSize: number; idempotencyKey: string; reason: string }) => api.undoMemberImport(input));

  const setSource = (nextMatrix: ImportMatrix, details: { fileName: string; sourceKind: MemberImportPreviewInput["sourceKind"]; size: number; csvText?: string }) => {
    const clean = nextMatrix.filter((row) => row.some((cell) => cell.trim()));
    setMatrix(clean);
    setMapping(inferMemberImportMapping(clean[0] ?? []));
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
    if (file.size > MAX_FILE_BYTES) { setFileError("Choose a CSV or Excel file no larger than 5 MB."); return; }
    if (extension !== "csv" && extension !== "xlsx") { setFileError("Choose a .csv or .xlsx member list."); return; }
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
      setFileError("RIVET could not read this file. Save a fresh CSV or XLSX copy and try again.");
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
    previewMutation.mutate({ csv: mappedCsv, branchId: selectedBranchId, sourceFileName: fileName || undefined, sourceKind, sourceHeaders: headers, columnMapping: mapping });
  };

  const commit = async () => {
    if (!preview || preview.branchId !== visibleBranchId(session?.branches, branchId) || committing) return;
    setCommitting(true);
    try {
      let cursor = preview.cursor ?? 0;
      let lastResult: MemberImportCommitResult | undefined;
      do {
        lastResult = await new Promise<MemberImportCommitResult>((resolve, reject) => commitMutation.mutate({ importId: preview.id, cursor, chunkSize: 50, idempotencyKey: newIdempotencyKey(preview.id, cursor) }, { onSuccess: resolve, onError: reject }));
        cursor = lastResult.cursor;
      } while (lastResult.status !== "completed");
      setResult(lastResult);
      setPreview(await getApi().getMemberImport(preview.id));
      await invalidate();
      await imports.refetch();
    } finally { setCommitting(false); }
  };

  const resume = async (item: MemberImportSummary) => {
    const detail = await getApi().getMemberImport(item.id);
    setBranchId(detail.branchId);
    setPreview(detail);
    setFileName(detail.sourceFileName ?? "Saved import");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const undo = async () => {
    if (!undoTarget || undoReason.trim().length < 3) return;
    let cursor = undoTarget.undoCursor ?? 0;
    let last: MemberImportUndoResult | undefined;
    do {
      last = await new Promise<MemberImportUndoResult>((resolve, reject) => undoMutation.mutate({ importId: undoTarget.id, cursor, chunkSize: 50, reason: undoReason.trim(), idempotencyKey: newIdempotencyKey(`undo-${undoTarget.id}`, cursor) }, { onSuccess: resolve, onError: reject }));
      cursor = last.cursor;
    } while (last.status !== "undone");
    setUndoResult(last);
    setUndoTarget(undefined);
    setUndoReason("");
    await invalidate();
    await imports.refetch();
  };

  if (!can("members.write")) return <EmptyState title="Member imports require member write access" description="Ask a manager or owner to grant member write access." />;

  return <div className="space-y-5">
    <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: "Import" }]} />
    <PageHeader eyebrow="Member migration" title="Import members" description="Upload the list you already have. RIVET will recognize its columns, check every person, and show exactly what will happen before creating records." actions={<Button asChild variant="secondary"><Link href="/members"><ArrowLeft /> Back to members</Link></Button>} />

    <section className="panel overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-2"><FileUp className="size-4" aria-hidden /></div><div><h2 className="font-display text-[15px] font-semibold text-ink">Choose your member file</h2><p className="mt-1 max-w-3xl text-[12.5px] text-ink-2">CSV and Excel files work. Your headings do not need to match RIVET—we will help map them next.</p></div></header>
      <div className="space-y-5 p-5">
        <div className="grid items-end gap-4 md:grid-cols-[minmax(260px,360px)_minmax(0,1fr)]"><label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Home branch for these members</span><Select value={branchId || "none"} onValueChange={(value) => { setBranchId(value === "none" ? "" : value); setPreview(undefined); setResult(undefined); }}><SelectTrigger aria-label="Member home branch"><SelectValue placeholder="Choose a branch" /></SelectTrigger><SelectContent><SelectItem value="none">Choose a branch</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></label><p className="rounded-md bg-sunken px-3 py-2 text-[11.5px] leading-5 text-ink-2">Local phone numbers use <strong className="font-medium text-ink">+{session?.organization.phoneCountryCallingCode ?? "962"}</strong> by default. International numbers keep their own country code.</p></div>
        <div className={`flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${draggingFile ? "border-[var(--tenant-brand-primary)] bg-sunken" : "border-line-2 bg-surface"}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFile(false); }} onDrop={dropFile}>
          <div className="flex size-11 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-5" aria-hidden /></div><h3 className="mt-3 text-[14px] font-semibold text-ink">{fileName || "Drop a member file here"}</h3><p className="mt-1 text-[12px] text-ink-3">{fileName ? `${Math.max(1, Math.ceil(fileSize / 1024)).toLocaleString()} KB · ${Math.max(0, matrix.length - 1).toLocaleString()} data rows` : "CSV or XLSX · up to 5 MB · maximum 10,000 members"}</p><Button type="button" variant={fileName ? "secondary" : "primary"} className="mt-4" onClick={() => fileInputRef.current?.click()}><Upload /> {fileName ? "Replace file" : "Choose file"}</Button><input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Choose member file" onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} />
        </div>
        {fileError ? <p className="text-[12px] text-danger" role="alert">{fileError}</p> : null}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" size="sm" onClick={() => setShowCsvText((current) => !current)}>{showCsvText ? "Hide pasted list" : matrix.length ? "Paste a different CSV" : "Paste CSV instead"}</Button><Button asChild variant="ghost" size="sm"><a href={TEMPLATE_DOWNLOAD} download="rivet-member-import-template.csv"><Download /> Download template</a></Button></div>
        {showCsvText ? <label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Paste CSV text</span><Textarea rows={7} value={csvText} onChange={(event) => updateCsvText(event.target.value)} placeholder={SAMPLE_CSV} aria-label="Member CSV content" className="font-mono text-[12px]" /></label> : null}
      </div>
    </section>

    {headers.length ? <section className="panel overflow-hidden"><header className="border-b border-line px-5 py-4"><h2 className="font-display text-[15px] font-semibold text-ink">Match the columns</h2><p className="mt-1 text-[12.5px] text-ink-2">We selected the likely columns. Confirm the two required fields before reviewing members.</p></header><div className="grid gap-4 p-5 md:grid-cols-3"><MappingSelect label="Full name" required headers={headers} value={mapping.fullName} onChange={(value) => setMapping((current) => ({ ...current, fullName: value }))} /><MappingSelect label="Phone" required headers={headers} value={mapping.phone} onChange={(value) => setMapping((current) => ({ ...current, phone: value }))} /><MappingSelect label="Email" headers={headers} value={mapping.email} onChange={(value) => setMapping((current) => ({ ...current, email: value }))} /></div><div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-3xl text-[11.5px] leading-5 text-ink-3">Imported marketing preference stays unknown, so automated marketing remains suppressed until consent is recorded.</p><Button className="shrink-0" onClick={runPreview} disabled={!branchId || !hasRequiredMapping || matrix.length < 2} loading={previewMutation.isPending}><CheckCircle2 /> Check members</Button></div></section> : null}

    {preview ? <section className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-display text-[15px] font-semibold text-ink">Review before import</h2><p className="mt-1 text-[12.5px] text-ink-2">{preview.totalRows} rows · {preview.validRows} ready · {preview.duplicateRows} duplicates · {preview.errorRows} invalid</p></div><div className="flex flex-wrap gap-2">{rejectedCsv.split("\r\n").length > 2 ? <Button asChild variant="secondary"><a href={downloadHref(rejectedCsv)} download={`rivet-rejected-${preview.id}.csv`}><Download /> Rejected rows</a></Button> : null}<Button onClick={commit} disabled={validRows.length === 0 || committing || preview.status === "completed" || preview.status === "undone"} loading={committing}>{committing ? "Importing…" : preview.status === "processing" ? "Resume import" : preview.status === "completed" ? "Import complete" : `Import ${validRows.length} ${validRows.length === 1 ? "member" : "members"}`}</Button></div></div><div className="max-h-[32rem] overflow-auto"><table className="w-full text-start text-[12.5px]"><thead className="sticky top-0 bg-sunken text-[11px] uppercase tracking-[0.08em] text-ink-3"><tr><th className="px-5 py-2 text-start font-medium">Row</th><th className="px-3 py-2 text-start font-medium">Member</th><th className="px-3 py-2 text-start font-medium">Phone</th><th className="px-3 py-2 text-start font-medium">Email</th><th className="px-5 py-2 text-start font-medium">Result</th></tr></thead><tbody className="divide-y divide-line">{preview.rows.map((row) => <tr key={row.rowNumber}><td className="px-5 py-3 font-mono text-ink-3">{row.rowNumber}</td><td className="px-3 py-3 font-medium text-ink">{row.fullName || "—"}</td><td className="px-3 py-3 font-mono text-ink-2" dir="ltr">{row.phone || "—"}</td><td className="px-3 py-3 text-ink-2">{row.email || "—"}</td><td className="px-5 py-3"><span className={row.status === "valid" || row.status === "committed" ? "text-success-deep" : row.status === "duplicate" ? "text-warning-deep" : "text-danger"}>{row.status === "valid" ? "Ready" : row.status === "committed" ? "Imported" : row.status === "duplicate" ? "Duplicate" : row.status === "invalid" ? "Needs attention" : "Skipped"}</span>{row.errors.length ? <span className="ms-2 text-[11px] text-ink-3">{row.errors.join("; ")}</span> : null}</td></tr>)}</tbody></table></div></section> : null}

    {result ? <section className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[13px] text-success-deep" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Import completed</p><p className="mt-0.5">{result.committedCount} members created; {result.skippedCount} rows skipped. You can safely undo untouched records from import history for seven days.</p></div></section> : null}
    {undoResult ? <section className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="status"><RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Import undo completed</p><p className="mt-0.5">{undoResult.archivedCount} untouched members removed from the active directory; {undoResult.skippedCount} changed or used records were protected.</p></div></section> : null}

    <section className="panel overflow-hidden"><header className="flex items-start gap-3 border-b border-line px-5 py-4"><History className="mt-0.5 size-4 text-ink-3" aria-hidden /><div><h2 className="font-display text-[15px] font-semibold text-ink">Recent imports</h2><p className="mt-1 text-[12.5px] text-ink-2">Resume interrupted work, retrieve rejected rows, or undo an untouched batch.</p></div></header>{imports.isLoading ? <p className="p-5 text-[12.5px] text-ink-3">Loading import history…</p> : imports.isError ? <ErrorState onRetry={() => imports.refetch()} /> : !imports.data?.length ? <div className="p-5"><EmptyState icon={History} title="No imports yet" description="Your first checked member file will appear here." /></div> : <div className="divide-y divide-line">{imports.data.map((item) => <ImportHistoryRow key={item.id} item={item} branchName={session?.branches.find((branch) => branch.id === item.branchId)?.name ?? "Branch"} canUndo={can("members.archive")} onResume={() => { void resume(item); }} onUndo={() => { setUndoTarget(item); setUndoResult(undefined); }} />)}</div>}</section>

    <Dialog open={Boolean(undoTarget)} onOpenChange={(open) => { if (!open) setUndoTarget(undefined); }}><DialogContent><DialogHeader><DialogTitle>Undo this member import?</DialogTitle><DialogDescription>RIVET will archive only records that have not been edited or used for memberships, balances, payments, or check-ins. Changed records are protected and reported as skipped.</DialogDescription></DialogHeader><DialogBody className="space-y-3"><div className="flex gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />This action stays in the audit log. It cannot erase operational history.</div><label className="block space-y-1.5"><span className="text-[12.5px] font-medium text-ink">Reason</span><Textarea value={undoReason} onChange={(event) => setUndoReason(event.target.value)} placeholder="Why is this import being reversed?" /></label></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setUndoTarget(undefined)}>Cancel</Button><Button variant="danger" disabled={undoReason.trim().length < 3} loading={undoMutation.isPending} onClick={() => { void undo(); }}><RotateCcw /> Undo untouched records</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function MappingSelect({ label, required, headers, value, onChange }: { label: string; required?: boolean; headers: string[]; value?: number; onChange: (value: number | undefined) => void }) {
  return <label className="space-y-1.5"><span className="text-[12.5px] font-medium text-ink">{label}{required ? <span className="text-danger"> *</span> : null}</span><Select value={value == null ? "none" : String(value)} onValueChange={(next) => onChange(next === "none" ? undefined : Number(next))}><SelectTrigger aria-label={`${label} source column`}><SelectValue placeholder="Choose a column" /></SelectTrigger><SelectContent><SelectItem value="none">{required ? "Choose a column" : "Not included"}</SelectItem>{headers.map((header, index) => <SelectItem key={`${header}-${index}`} value={String(index)}>{header || `Column ${index + 1}`}</SelectItem>)}</SelectContent></Select></label>;
}

function ImportHistoryRow({ item, branchName, canUndo, onResume, onUndo }: { item: MemberImportSummary; branchName: string; canUndo: boolean; onResume: () => void; onUndo: () => void }) {
  const undoAvailable = canUndo && (item.status === "completed" || item.status === "undoing") && Boolean(item.undoExpiresAt && Date.parse(item.undoExpiresAt) > Date.now());
  return <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-[13px] font-medium text-ink">{item.sourceFileName || "Pasted member list"}</p><span className="rounded-full border border-line px-2 py-0.5 text-[10.5px] capitalize text-ink-2">{item.status ?? "preview"}</span></div><p className="mt-1 text-[11.5px] text-ink-3">{branchName} · {item.totalRows} rows · {item.committedCount ?? 0} imported · {new Date(item.createdAt).toLocaleString()}</p></div><div className="flex shrink-0 flex-wrap gap-2">{item.status !== "undone" ? <Button size="sm" variant="secondary" onClick={onResume}>{item.status === "preview" || item.status === "processing" ? "Resume" : "View"}</Button> : null}{undoAvailable ? <Button size="sm" variant="ghost" onClick={onUndo}><RotateCcw /> {item.status === "undoing" ? "Continue undo" : "Undo"}</Button> : null}</div></div>;
}
