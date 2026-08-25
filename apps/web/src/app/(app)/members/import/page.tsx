"use client";

import { ArrowLeft, CheckCircle2, FileUp, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MemberImportCommitResult, MemberImportPreview } from "@/lib/api/GymOSApi";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { visibleBranchId } from "@/lib/domain/branch-scope";

const SAMPLE_CSV = `full_name,phone,email
Samira Haddad,+962790000001,samira@example.com
Yousef Nasser,+962790000002,yousef@example.com`;

function newIdempotencyKey(importId: string, cursor: number): string {
  return `${importId}-${cursor}-${crypto.randomUUID()}`;
}

export default function MemberImportPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<MemberImportPreview>();
  const [result, setResult] = useState<MemberImportCommitResult>();
  const [committing, setCommitting] = useState(false);

  const [branchId, setBranchId] = useState("");
  useEffect(() => {
    const activeBranchId = visibleBranchId(session?.branches, session?.activeBranchId);
    setBranchId((current) => visibleBranchId(session?.branches, current) ?? activeBranchId ?? "");
  }, [session?.activeBranchId, session?.branches]);
  useEffect(() => {
    if (preview && preview.branchId !== visibleBranchId(session?.branches, branchId)) {
      setPreview(undefined);
      setResult(undefined);
    }
  }, [branchId, preview, session?.branches]);
  const validRows = useMemo(() => preview?.rows.filter((row) => row.status === "valid") ?? [], [preview]);

  const previewMutation = useApiMutation((api, input: { csv: string; branchId: string }) => api.previewMemberImport(input), {
    onSuccess: (nextPreview) => {
      setPreview(nextPreview);
      setResult(undefined);
    },
  });

  const runPreview = () => {
    const selectedBranchId = visibleBranchId(session?.branches, branchId);
    if (!selectedBranchId || !csv.trim()) return;
    previewMutation.mutate({ csv, branchId: selectedBranchId });
  };

  const commit = async () => {
    if (!preview || preview.branchId !== visibleBranchId(session?.branches, branchId) || validRows.length === 0 || committing) return;
    setCommitting(true);
    try {
      let cursor = 0;
      let lastResult: MemberImportCommitResult | undefined;
      do {
        lastResult = await new Promise<MemberImportCommitResult>((resolve, reject) => {
          const mutation = commitMutation;
          mutation.mutate(
            { importId: preview.id, cursor, chunkSize: 50, idempotencyKey: newIdempotencyKey(preview.id, cursor) },
            { onSuccess: resolve, onError: reject },
          );
        });
        cursor = lastResult.cursor;
      } while (lastResult.status !== "completed");
      setResult(lastResult);
      await invalidate();
    } finally {
      setCommitting(false);
    }
  };

  const commitMutation = useApiMutation((api, input: { importId: string; cursor: number; chunkSize: number; idempotencyKey: string }) => api.commitMemberImport(input));

  if (!can("members.write")) {
    return <EmptyState title="Member imports require member write access" description="Ask a manager or owner to grant the members.write permission." />;
  }

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: "Import CSV" }]} />
      <PageHeader
        eyebrow="Operations"
        title="Import members"
        description="Preview duplicates and invalid rows before creating members. Large files commit in resumable server-side chunks."
        actions={
          <Button asChild variant="secondary">
            <Link href="/members">
              <ArrowLeft /> Back to members
            </Link>
          </Button>
        }
      />

      <section className="panel space-y-4 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-2">
            <FileUp className="size-4" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-semibold text-ink">CSV source</h2>
            <p className="mt-1 text-[12.5px] text-ink-2">Required columns: full_name and phone. Email is optional. Existing phone or email matches are not created.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="space-y-1.5">
            <span className="eyebrow">Paste CSV</span>
            <Textarea
              rows={10}
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={SAMPLE_CSV}
              aria-label="Member CSV content"
              className="font-mono text-[12px]"
            />
          </label>
          <div className="space-y-3 rounded-md border border-line bg-sunken/50 p-3">
            <p className="eyebrow">Import destination</p>
            <label className="space-y-1.5">
              <span className="text-[12px] text-ink-2">Choose one branch. Imports cannot use All branches.</span>
              <Select value={branchId || "none"} onValueChange={(value) => { setBranchId(value === "none" ? "" : value); setPreview(undefined); setResult(undefined); }}>
                <SelectTrigger aria-label="Import destination branch">
                  <SelectValue placeholder="Choose branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose branch</SelectItem>
                  {session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <Button className="w-full" onClick={runPreview} disabled={!branchId || !csv.trim()} loading={previewMutation.isPending}>
              <Upload /> Preview rows
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setCsv(SAMPLE_CSV)}>
              Use sample CSV
            </Button>
          </div>
        </div>
      </section>

      {preview ? (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-semibold text-ink">Preview</h2>
              <p className="mt-1 text-[12.5px] text-ink-2">{preview.totalRows} rows · {preview.validRows} ready · {preview.duplicateRows} duplicates · {preview.errorRows} invalid</p>
            </div>
            <Button onClick={commit} disabled={validRows.length === 0 || committing || result?.status === "completed"} loading={committing}>
              {committing ? "Committing…" : result?.status === "completed" ? "Import complete" : `Commit ${validRows.length} valid rows`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-[12.5px]">
              <thead className="bg-sunken/70 text-[11px] uppercase tracking-[0.08em] text-ink-3">
                <tr>
                  <th className="px-5 py-2 text-start font-medium">Row</th>
                  <th className="px-3 py-2 text-start font-medium">Member</th>
                  <th className="px-3 py-2 text-start font-medium">Phone</th>
                  <th className="px-3 py-2 text-start font-medium">Email</th>
                  <th className="px-5 py-2 text-start font-medium">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-5 py-3 font-mono text-ink-3">{row.rowNumber}</td>
                    <td className="px-3 py-3 font-medium text-ink">{row.fullName || "—"}</td>
                    <td className="px-3 py-3 font-mono text-ink-2" dir="ltr">{row.phone || "—"}</td>
                    <td className="px-3 py-3 text-ink-2">{row.email || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={row.status === "valid" ? "text-success-deep" : row.status === "duplicate" ? "text-warning-deep" : "text-danger"}>
                        {row.status}
                      </span>
                      {row.errors.length > 0 ? <span className="ms-2 text-[11px] text-ink-3">{row.errors.join("; ")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg px-4 py-3 text-[13px] text-success-deep" role="status">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Import completed</p>
            <p className="mt-0.5">{result.committedCount} members created; {result.skippedCount} rows skipped; {result.failedCount} failed.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
