"use client";

import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
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
import { usePermissions } from "@/lib/providers/app-providers";
import { exportJobPresentation } from "./export-job-presentation";

const EXPORTS: Array<{ kind: ExportKind; title: string; description: string; permission: string }> = [
  { kind: "members", title: "Members", description: "Identity, contact, status, branch, and membership-facing fields.", permission: "members.read" },
  { kind: "leads", title: "Leads", description: "Pipeline stage, ownership, contact details, and follow-up facts.", permission: "crm.read" },
  { kind: "payments", title: "Payments and refunds", description: "Transactions, receipt references, methods, status, and amounts.", permission: "reports.financial.read" },
  { kind: "membership_liabilities", title: "Membership liabilities", description: "Open charges, paid amounts, and outstanding balances.", permission: "reports.financial.read" },
  { kind: "personal_training", title: "Personal training", description: "PT package orders, credits sold, payment state, and refunds.", permission: "pt.reports.read" },
  { kind: "operations", title: "Inventory and suppliers", description: "Products, suppliers, stock balances, and movement history.", permission: "operations.manage" },
  { kind: "audit", title: "Audit events", description: "Sensitive actions with actor, reason, entity, and correlation reference.", permission: "audit.read" },
];

const DOWNLOAD_LABELS = { ready: "Download CSV", pending: "Preparing", expired: "Expired", unavailable: "Unavailable" } as const;

function downloadExport(job: ExportJob) {
  if (!job.content || !job.fileName) return;
  downloadTextFile({ content: job.content, fileName: job.fileName, mimeType: job.mimeType ?? "text/csv;charset=utf-8" });
}

export default function ExportCenterClient() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const jobs = useApiQuery(qk.exports, (api) => api.listExportJobs());
  const filters = useMemo(() => Object.fromEntries(["branchId", "search", "from", "to"].flatMap((key) => { const value = params.get(key); return value ? [[key, value]] : []; })), [params]);
  const request = useApiMutation((api, kind: ExportKind) => api.requestExport({ kind, filters, idempotencyKey: crypto.randomUUID() }), { successMessage: (job) => `Prepared ${job.rowCount ?? 0} rows.`, onSuccess: async (job) => { downloadExport(job); await invalidate([qk.exports]); } });
  const available = EXPORTS.filter((item) => can(item.permission));

  return <div className="space-y-5">
    <PageHeader sectionLabel="Data portability" title="Data exports" description="Download the records you are authorized to see. Every export carries its filter context, branch scope, generation time, tenant timezone, and an audit event." />
    <section className="rounded-lg border border-line bg-sunken/40 px-4 py-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-deep" aria-hidden /><p className="text-[12px] leading-5 text-ink-2">Exports are generated inside your current tenant and branch authorization boundary. Download content expires after 24 hours; historical job metadata remains visible.</p></div></section>
    {Object.keys(filters).length ? <p className="text-[12px] text-ink-3">Applied context: {Object.entries(filters).map(([key, value]) => `${key}=${value}`).join(" · ")}</p> : null}

    {/* One dense list, not a wall of cards: name, what it holds, one action. */}
    <section className="panel overflow-hidden" aria-label="Datasets">
      <header className="border-b border-line px-4 py-3"><p className="context-label">Datasets</p><h2 className="mt-1 text-[15px] font-semibold">Generate a CSV</h2></header>
      {available.length === 0 ? <EmptyState compact title="No datasets for this role" description="Exports follow the same permissions as the screens they come from." className="m-4" /> : (
        <ul className="divide-y divide-line">
          {available.map((item) => (
            <li key={item.kind}>
              <article className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-4" aria-hidden /></span>
                {/* On phones the description keeps its width and the action drops below it. */}
                <div className="min-w-0 flex-1 basis-56"><h3 className="text-[13.5px] font-semibold">{item.title}</h3><p className="text-[12px] text-ink-3">{item.description}</p></div>
                <Button className="ms-auto" size="sm" variant="secondary" loading={request.isPending && request.variables === item.kind} disabled={request.isPending} onClick={() => request.mutate(item.kind)}><Download /> Generate CSV</Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="panel overflow-hidden" aria-label="Recent exports">
      <header className="border-b border-line px-4 py-3"><p className="context-label">Your requests</p><h2 className="mt-1 text-[15px] font-semibold">Recent exports</h2></header>
      {jobs.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14" />)}</div> : jobs.isError ? <QueryErrorState error={jobs.error} onRetry={() => { void jobs.refetch(); }} className="m-4" /> : jobs.data?.length ? (
        <ul className="divide-y divide-line">
          {jobs.data.map((job) => {
            const presentation = exportJobPresentation(job);
            return (
              <li key={job.id}>
                <article className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-mono text-[12px]" dir="ltr">{job.fileName ?? `${job.kind.replaceAll("_", " ")} export`}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{job.totalRows ?? job.rowCount ?? 0} rows · {job.branchScope ?? "authorized scope"} · <DateTimeText iso={job.createdAt} />{job.expiresAt && presentation.download === "ready" ? <> · expires <DateTimeText iso={job.expiresAt} /></> : null}</p>
                    {job.failureMessage ? <p className="mt-1 text-[12px] text-danger">{job.failureMessage}</p> : null}
                  </div>
                  <Badge variant={presentation.variant}>{presentation.label}</Badge>
                  <Button size="sm" variant="ghost" disabled={presentation.download !== "ready"} onClick={() => downloadExport(job)}><Download /> {DOWNLOAD_LABELS[presentation.download]}</Button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState compact title="No exports yet" description="Generate a dataset above; the request will be recorded here and in the audit log." className="m-4" />}
    </section>
  </div>;
}
