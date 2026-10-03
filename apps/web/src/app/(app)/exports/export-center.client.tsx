"use client";
import { useT } from "@/lib/i18n/provider";
import type { TKey } from "@/lib/i18n/provider";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

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
import { exportBranchScopePresentation, exportFailurePresentation, exportJobPresentation } from "./export-job-presentation";

const EXPORTS: Array<{ kind: ExportKind; permission: string }> = [
  { kind: "members", permission: "members.read" },
  { kind: "leads", permission: "crm.read" },
  { kind: "payments", permission: "reports.financial.read" },
  { kind: "membership_liabilities", permission: "reports.financial.read" },
  { kind: "personal_training", permission: "pt.reports.read" },
  { kind: "operations", permission: "operations.manage" },
  { kind: "audit", permission: "audit.read" },
];

/** Plain names for the filters a link can carry into this page. */
const FILTER_LABELS: Record<string, TKey> = {
  branchId: "staffTools.exports.filter.branchId",
  search: "staffTools.exports.filter.search",
  from: "staffTools.exports.filter.from",
  to: "staffTools.exports.filter.to",
};

const DOWNLOAD_KEYS: Record<"ready" | "pending" | "expired" | "unavailable", TKey> = {
  ready: "staffTools.exports.download.ready",
  pending: "staffTools.exports.download.pending",
  expired: "staffTools.exports.download.expired",
  unavailable: "staffTools.exports.download.unavailable",
};

function downloadExport(job: ExportJob) {
  if (!job.content || !job.fileName) return;
  downloadTextFile({ content: job.content, fileName: job.fileName, mimeType: job.mimeType ?? "text/csv;charset=utf-8" });
}

export default function ExportCenterClient() {
  const t = useT();
  const { locale } = useLocale();
  const format = useFormat();
  const params = useSearchParams();
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const jobs = useApiQuery(qk.exports, (api) => api.listExportJobs());
  const filters = useMemo(() => Object.fromEntries(["branchId", "search", "from", "to"].flatMap((key) => { const value = params.get(key); return value ? [[key, value]] : []; })), [params]);
  const request = useApiMutation((api, kind: ExportKind) => api.requestExport({ kind, filters, locale, idempotencyKey: crypto.randomUUID() }), {
    // The server answers an oversized request with a "failed" job rather than
    // a truncated file, so the job's own status decides the message: never
    // "File ready: 0 rows." and never a download for a file that was not made.
    onSuccess: async (job) => {
      if (job.status === "failed" || !job.content) toast.error(exportFailurePresentation(job.failureMessage, t, format.number, job) ?? t("staffTools.exports.failure"));
      else {
        toast.success(t("staffTools.exports.rowReady", { count: format.number(job.rowCount ?? 0) }));
        downloadExport(job);
      }
      await invalidate([qk.exports]);
    },
  });
  const available = EXPORTS.filter((item) => can(item.permission));

  return <div className="space-y-5">
    <PageHeader sectionLabel={t("staffTools.exports.section")} title={t("nav.item.downloads")} description={t("staffTools.exports.description")} />
    <section className="rounded-lg border border-line bg-sunken/40 px-4 py-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-deep" aria-hidden /><p className="text-[12px] leading-5 text-ink-2">{t("staffTools.exports.privacyNote")}</p></div></section>
    {Object.keys(filters).length ? <p className="text-[12px] text-ink-3">{t("staffTools.exports.filtersApplied")}: {Object.entries(filters).map(([key, value]) => {
      const label = FILTER_LABELS[key] ? t(FILTER_LABELS[key]!) : key;
      const displayValue = key === "branchId"
        ? session?.branches.find((branch) => branch.id === value)?.name ?? value
        : key === "from" || key === "to"
          ? /^\d{4}-\d{2}-\d{2}$/.test(value) ? format.date(value) : value
          : value;
      return `${label}: ${displayValue}`;
    }).join(" · ")}</p> : null}

    {/* One dense list, not a wall of cards: name, what it holds, one action. */}
    <section className="panel overflow-hidden" aria-label={t("staffTools.exports.ariaFiles")}>
      <header className="border-b border-line px-4 py-3"><p className="context-label">{t("staffTools.exports.filesLabel")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.exports.filesHeading")}</h2></header>
      {available.length === 0 ? <EmptyState compact title={t("staffTools.exports.noPermission")} description={t("staffTools.exports.noPermissionDescription")} className="m-4" /> : (
        <ul className="divide-y divide-line">
          {available.map((item) => (
            <li key={item.kind}>
              <article className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2"><FileSpreadsheet className="size-4" aria-hidden /></span>
                {/* On phones the description keeps its width and the action drops below it. */}
                <div className="min-w-0 flex-1 basis-56"><h3 className="text-[13.5px] font-semibold">{t(`staffTools.exports.kind.${item.kind}` as TKey)}</h3><p className="text-[12px] text-ink-3">{t(`staffTools.exports.details.${item.kind}` as TKey)}</p></div>
                <Button className="ms-auto" size="sm" variant="secondary" loading={request.isPending && request.variables === item.kind} disabled={request.isPending} onClick={() => request.mutate(item.kind)}><Download />{t("staffTools.exports.downloadCsv")}</Button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="panel overflow-hidden" aria-label={t("staffTools.exports.recent")}>
      <header className="border-b border-line px-4 py-3"><p className="context-label">{t("staffTools.exports.yourFiles")}</p><h2 className="mt-1 text-[15px] font-semibold">{t("staffTools.exports.recent")}</h2></header>
      {jobs.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-14" />)}</div> : jobs.isError ? <QueryErrorState error={jobs.error} onRetry={() => { void jobs.refetch(); }} className="m-4" /> : jobs.data?.length ? (
        <ul className="divide-y divide-line">
          {jobs.data.map((job) => {
            const presentation = exportJobPresentation(job, Date.now(), t);
            return (
              <li key={job.id}>
                <article className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate font-mono text-[12px]" dir="ltr">{job.fileName ?? `${job.kind.replaceAll("_", " ")} file`}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{t("staffTools.exports.rows", { count: job.totalRows ?? job.rowCount ?? 0, displayCount: format.number(job.totalRows ?? job.rowCount ?? 0) })} · {t("staffTools.exports.contentLanguage", { language: t(job.locale === "ar" ? "staffTools.exports.languageArabic" : "staffTools.exports.languageEnglish") })} · {exportBranchScopePresentation(job.branchScope, session?.branches ?? [], t, format.number)} · <DateTimeText iso={job.createdAt} />{job.expiresAt && presentation.download === "ready" ? <> · {t("staffTools.exports.expires", { date: format.dateTime(job.expiresAt) })}</> : null}</p>
                    {job.failureMessage || job.failureMessageKey ? <p className="mt-1 text-[12px] text-danger">{exportFailurePresentation(job.failureMessage, t, format.number, job)}</p> : null}
                  </div>
                  <Badge variant={presentation.variant}>{presentation.label}</Badge>
                  <Button size="sm" variant="ghost" disabled={presentation.download !== "ready"} onClick={() => downloadExport(job)}><Download />{t(DOWNLOAD_KEYS[presentation.download])}</Button>
                </article>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState compact title={t("staffTools.exports.noDownloads")} description={t("staffTools.exports.noDownloadsDescription")} className="m-4" />}
    </section>
  </div>;
}
