"use client";
import { useT } from "@/lib/i18n/provider";

import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { DateTimeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { ExportJob, ExportKind } from "@/lib/domain/qol";
import { downloadTextFile } from "@/lib/exports/download";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { exportJobPresentation } from "./export-job-presentation";

const EXPORTS: Array<{ kind: ExportKind; title: string; description: string; permission: string }> = [
  { kind: "members", title: "Members", description: "Name, phone, status and branch for each member.", permission: "members.read" },
  { kind: "leads", title: "Leads", description: "Name, phone, stage, owner and next follow-up for each lead.", permission: "crm.read" },
  { kind: "payments", title: "Payments and refunds", description: "Each payment and refund with its receipt number, method and amount.", permission: "reports.financial.read" },
  { kind: "membership_liabilities", title: "What members owe", description: "What each member was charged, has paid and still owes.", permission: "reports.financial.read" },
  { kind: "personal_training", title: "Personal training", description: "PT package orders, credits sold, payments and refunds.", permission: "pt.reports.read" },
  { kind: "operations", title: "Stock and suppliers", description: "Products, suppliers, stock counts and stock changes.", permission: "operations.manage" },
  { kind: "audit", title: "Activity log", description: "Important staff actions, with who did them and why.", permission: "audit.read" },
];

/** Plain names for the filters a link can carry into this page. */
const FILTER_LABELS: Record<string, string> = { branchId: "Branch", search: "Search", from: "From", to: "To" };

const DOWNLOAD_LABELS = { ready: "Download CSV", pending: "Not ready yet", expired: "Expired", unavailable: "Not available" } as const;

function downloadExport(job: ExportJob) {
  if (!job.content || !job.fileName) return;
  downloadTextFile({ content: job.content, fileName: job.fileName, mimeType: job.mimeType ?? "text/csv;charset=utf-8" });
}

export default function ExportCenterClient() {
  const t = useT();
  const params = useSearchParams();
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const jobs = useApiQuery(qk.exports, (api) => api.listExportJobs());
  const filters = useMemo(() => Object.fromEntries(["branchId", "search", "from", "to"].flatMap((key) => { const value = params.get(key); return value ? [[key, value]] : []; })), [params]);
  const request = useApiMutation((api, kind: ExportKind) => api.requestExport({ kind, filters, idempotencyKey: crypto.randomUUID() }), {
    // The server answers an oversized request with a "failed" job rather than
    // a truncated file, so the job's own status decides the message: never
    // "File ready: 0 rows." and never a download for a file that was not made.
    onSuccess: async (job) => {
      if (job.status === "failed" || !job.content) toast.error(job.failureMessage ?? "The file could not be prepared. Try again.");
      else {
        toast.success(`File ready: ${job.rowCount ?? 0} rows.`);
        downloadExport(job);
      }
      await invalidate([qk.exports]);
    },
  });
  const available = EXPORTS.filter((item) => can(item.permission));

  return <div className="space-y-5">
    <PageHeader sectionLabel="Your data" title={t("nav.item.downloads")} description="Download the records you are allowed to see as a CSV file." />
    <section className="rounded-lg border border-line bg-sunken/40 px-4 py-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-deep" aria-hidden /><p className="text-[12px] leading-5 text-ink-2">You only get records you are allowed to see. Each file can be downloaded for 24 hours.</p></div></section>
    {Object.keys(filters).length ? <p className="text-[12px] text-ink-3">Filters applied: {Object.entries(filters).map(([key, value]) => `${FILTER_LABELS[key] ?? key}: ${key === "branchId" ? session?.branches.find((branch) => branch.id === value)?.name ?? value : value}`).join(" · ")}</p> : null}

    {/* One dense list, not a wall of cards: name, what it holds, one action. */}
    <section className="panel overflow-hidden" aria-label="Files you can download">
      <header className="border-b border-line px-4 py-3"><p className="context-label">Files</p><h2 className="mt-1 text-[15px] font-semibold">Choose what to download</h2></header>
      {available.length === 0 ? <EmptyState compact title="Nothing to download" description="You can only download records you are allowed to see on screen." className="m-4" /> : (
        <ul className="divide-y divide-line">
          {available.map((item) => (
            <li key={item.kind}>
              <article className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-4" aria-hidden /></span>
                {/* On phones the description keeps its width and the action drops below it. */}
                <div className="min-w-0 flex-1 basis-56"><h3 className="text-[13.5px] font-semibold">{item.title}</h3><p className="text-[12px] text-ink-3">{item.description}</p></div>
                <Button className="ms-auto" size="sm" variant="secondary" loading={request.isPending && request.variables === item.kind} disabled={request.isPending} onClick={() => request.mutate(item.kind)}><Download /> Download CSV</Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="panel overflow-hidden" aria-label="Recent downloads">
      <header className="border-b border-line px-4 py-3"><p className="context-label">Your files</p><h2 className="mt-1 text-[15px] font-semibold">Recent downloads</h2></header>
      {jobs.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14" />)}</div> : jobs.isError ? <QueryErrorState error={jobs.error} onRetry={() => { void jobs.refetch(); }} className="m-4" /> : jobs.data?.length ? (
        <ul className="divide-y divide-line">
          {jobs.data.map((job) => {
            const presentation = exportJobPresentation(job);
            return (
              <li key={job.id}>
                <article className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-mono text-[12px]" dir="ltr">{job.fileName ?? `${job.kind.replaceAll("_", " ")} file`}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{job.totalRows ?? job.rowCount ?? 0} rows · {job.branchScope ?? "your branches"} · <DateTimeText iso={job.createdAt} />{job.expiresAt && presentation.download === "ready" ? <> · expires <DateTimeText iso={job.expiresAt} /></> : null}</p>
                    {job.failureMessage ? <p className="mt-1 text-[12px] text-danger">{job.failureMessage}</p> : null}
                  </div>
                  <Badge variant={presentation.variant}>{presentation.label}</Badge>
                  <Button size="sm" variant="ghost" disabled={presentation.download !== "ready"} onClick={() => downloadExport(job)}><Download /> {DOWNLOAD_LABELS[presentation.download]}</Button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState compact title="No downloads yet" description="Choose a file above. It will be listed here." className="m-4" />}
    </section>
  </div>;
}
