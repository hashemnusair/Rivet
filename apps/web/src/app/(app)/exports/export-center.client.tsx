"use client";

import { Download, FileClock, FileSpreadsheet, ShieldCheck } from "lucide-react";
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

const EXPORTS: Array<{ kind: ExportKind; title: string; description: string; permission: string }> = [
  { kind: "members", title: "Members", description: "Identity, contact, status, branch, and membership-facing fields.", permission: "members.read" },
  { kind: "leads", title: "Leads", description: "Pipeline stage, ownership, contact details, and follow-up facts.", permission: "crm.read" },
  { kind: "payments", title: "Payments and refunds", description: "Transactions, receipt references, methods, status, and amounts.", permission: "reports.financial.read" },
  { kind: "membership_liabilities", title: "Membership liabilities", description: "Open charges, paid amounts, and outstanding balances.", permission: "reports.financial.read" },
  { kind: "personal_training", title: "Personal training", description: "PT package orders, credits sold, payment state, and refunds.", permission: "pt.reports.read" },
  { kind: "operations", title: "Inventory and suppliers", description: "Products, suppliers, stock balances, and movement history.", permission: "operations.manage" },
  { kind: "audit", title: "Audit events", description: "Sensitive actions with actor, reason, entity, and correlation reference.", permission: "audit.read" },
];

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
    <PageHeader eyebrow="System · Portability" title="Data exports" description="Download the records you are authorized to see. Every export carries its filter context, branch scope, generation time, tenant timezone, and an audit event." />
    <section className="rounded-lg border border-line bg-sunken/40 px-4 py-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-deep" /><p className="text-[12px] leading-5 text-ink-2">Exports are generated inside your current tenant and branch authorization boundary. Download content expires after 24 hours; historical job metadata remains visible.</p></div></section>
    {Object.keys(filters).length ? <p className="text-[11.5px] text-ink-3">Applied context: {Object.entries(filters).map(([key, value]) => `${key}=${value}`).join(" · ")}</p> : null}
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{available.map((item) => <article key={item.kind} className="panel flex min-h-44 flex-col p-4"><span className="flex size-9 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-4" /></span><h2 className="mt-3 text-[14px] font-semibold">{item.title}</h2><p className="mt-1 flex-1 text-[11.5px] leading-5 text-ink-3">{item.description}</p><Button className="mt-4 self-start" size="sm" variant="secondary" loading={request.isPending && request.variables === item.kind} disabled={request.isPending} onClick={() => request.mutate(item.kind)}><Download /> Generate CSV</Button></article>)}</section>
    <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="eyebrow">Your requests</p><h2 className="mt-1 text-[15px] font-semibold">Recent exports</h2></header>{jobs.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16" />)}</div> : jobs.isError ? <QueryErrorState error={jobs.error} onRetry={() => { void jobs.refetch(); }} className="m-4" /> : jobs.data?.length ? <div className="divide-y divide-line">{jobs.data.map((job) => <article key={job.id} className="flex flex-wrap items-center gap-3 p-4"><span className="flex size-8 items-center justify-center rounded-md bg-sunken"><FileClock className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-mono text-[11.5px]">{job.fileName ?? `${job.kind.replaceAll("_", " ")} export`}</p><p className="mt-0.5 text-[10.5px] text-ink-3">{job.totalRows ?? job.rowCount ?? 0} rows · {job.branchScope ?? "authorized scope"} · <DateTimeText iso={job.createdAt} /></p>{job.failureMessage ? <p className="mt-1 text-[11px] text-danger">{job.failureMessage}</p> : null}</div><Badge variant={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning"}>{job.status}</Badge><Button size="sm" variant="ghost" disabled={!job.content} onClick={() => downloadExport(job)}><Download /> {job.content ? "Download CSV" : job.status === "failed" ? "Unavailable" : "Expired"}</Button></article>)}</div> : <EmptyState compact title="No exports yet" description="Generate a dataset above; the request will be recorded here and in the audit log." className="m-4" />}</section>
  </div>;
}
