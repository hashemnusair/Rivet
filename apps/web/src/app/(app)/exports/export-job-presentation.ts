import type { ExportJob } from "@/lib/domain/qol";

export type ExportJobPresentation = {
  label: string;
  variant: "neutral" | "success" | "warning" | "danger" | "outline";
  /** What the download control can truthfully offer for this job. */
  download: "ready" | "pending" | "expired" | "unavailable";
};

/**
 * One reading of an export job's state for the request list. Content expires
 * 24 hours after generation, so a completed job without content is shown as
 * expired rather than as a download that silently does nothing.
 */
export function exportJobPresentation(job: ExportJob, now = Date.now()): ExportJobPresentation {
  const expired = job.expiresAt ? Date.parse(job.expiresAt) <= now : false;
  const downloadable = Boolean(job.content) && !expired;
  switch (job.status) {
    case "queued":
      return { label: "Queued", variant: "neutral", download: "pending" };
    case "running":
      return { label: "Running", variant: "neutral", download: "pending" };
    case "partially_completed":
      return downloadable ? { label: "Partial", variant: "warning", download: "ready" } : { label: "Partial · expired", variant: "outline", download: "expired" };
    case "completed":
      return downloadable ? { label: "Completed", variant: "success", download: "ready" } : { label: "Expired", variant: "outline", download: "expired" };
    case "failed":
      return { label: "Failed", variant: "danger", download: "unavailable" };
    case "cancelled":
      return { label: "Cancelled", variant: "neutral", download: "unavailable" };
    default:
      return { label: String(job.status).replaceAll("_", " "), variant: "neutral", download: downloadable ? "ready" : "unavailable" };
  }
}
