import type { ExportJob } from "@/lib/domain/qol";
import { createTranslator } from "@/lib/i18n/core";
import type { TFunction } from "@/lib/i18n/provider";

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
const ENGLISH = createTranslator("en");

export function exportJobPresentation(job: ExportJob, now = Date.now(), t: TFunction = ENGLISH): ExportJobPresentation {
  const expired = job.expiresAt ? Date.parse(job.expiresAt) <= now : false;
  const downloadable = Boolean(job.content) && !expired;
  switch (job.status) {
    case "queued":
      return { label: t("staffTools.exports.status.queued"), variant: "neutral", download: "pending" };
    case "running":
      return { label: t("staffTools.exports.status.running"), variant: "neutral", download: "pending" };
    case "partially_completed":
      return downloadable ? { label: t("staffTools.exports.status.partially_completed"), variant: "warning", download: "ready" } : { label: t("staffTools.exports.status.partially_completed_expired"), variant: "outline", download: "expired" };
    case "completed":
      return downloadable ? { label: t("staffTools.exports.status.completed"), variant: "success", download: "ready" } : { label: t("staffTools.exports.status.expired"), variant: "outline", download: "expired" };
    case "failed":
      return { label: t("staffTools.exports.status.failed"), variant: "danger", download: "unavailable" };
    case "cancelled":
      return { label: t("staffTools.exports.status.cancelled"), variant: "neutral", download: "unavailable" };
    default:
      return { label: t("staffTools.exports.status.fallback", { status: String(job.status) }), variant: "neutral", download: downloadable ? "ready" : "unavailable" };
  }
}

/** Localize known worker-owned export errors while preserving other source text verbatim. */
export function exportFailurePresentation(
  message: string | undefined,
  t: TFunction = ENGLISH,
  numberLabel: (value: number) => string = String,
  descriptor?: Pick<ExportJob, "failureMessageKey" | "failureMessageParams">,
): string | undefined {
  if (descriptor?.failureMessageKey === "exports.tooLarge" && descriptor.failureMessageParams) {
    const count = descriptor.failureMessageParams.count;
    return t("staffTools.exports.tooManyRows", { count, displayCount: numberLabel(count) });
  }
  if (!message) return undefined;
  const oversized = message.match(/^This export contains ([\d,]+) rows and exceeds the current safe single-download limit\. Narrow the date, branch, or search filters and try again\.$/);
  if (oversized) {
    const count = Number(oversized[1]!.replaceAll(",", ""));
    return t("staffTools.exports.tooManyRows", { count, displayCount: numberLabel(count) });
  }
  return message;
}

/** Known branch-scope codes are projections; unknown values remain source text. */
export function exportBranchScopePresentation(scope: string | undefined, branches: Array<{ id: string; name: string }>, t: TFunction = ENGLISH, numberLabel: (value: number) => string = String): string {
  if (!scope) return t("staffTools.exports.branchScope");
  if (scope === "all branches" || scope === "all accessible branches") return t("staffTools.exports.allBranches");
  const branch = scope.match(/^branch:(.+)$/);
  if (branch) return branches.find((item) => item.id === branch[1])?.name ?? scope;
  const assigned = scope.match(/^(\d+) assigned branches?$/);
  if (assigned) {
    const count = Number(assigned[1]);
    return t("staffTools.exports.assignedBranches", { count, displayCount: numberLabel(count) });
  }
  return scope;
}
