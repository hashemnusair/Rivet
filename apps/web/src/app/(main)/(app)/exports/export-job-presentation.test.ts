import { describe, expect, it } from "vitest";
import type { ExportJob } from "@/lib/domain/qol";
import { createTranslator } from "@/lib/i18n/core";
import { exportBranchScopePresentation, exportFailurePresentation, exportJobPresentation } from "./export-job-presentation";

const NOW = Date.parse("2026-09-05T09:00:00+03:00");

function job(overrides: Partial<ExportJob>): ExportJob {
  return { id: "job-1", kind: "members", status: "completed", createdAt: "2026-09-05T05:00:00.000Z", ...overrides } as ExportJob;
}

describe("exportJobPresentation", () => {
  it("offers a download only while completed content is still within its expiry", () => {
    expect(exportJobPresentation(job({ content: "a,b", expiresAt: "2026-09-06T05:00:00.000Z" }), NOW)).toEqual({ label: "Completed", variant: "success", download: "ready" });
    expect(exportJobPresentation(job({ content: "a,b", expiresAt: "2026-09-05T05:00:00.000Z" }), NOW)).toEqual({ label: "Expired", variant: "outline", download: "expired" });
    expect(exportJobPresentation(job({}), NOW)).toEqual({ label: "Expired", variant: "outline", download: "expired" });
  });

  it("distinguishes pending, partial, failed and cancelled work", () => {
    expect(exportJobPresentation(job({ status: "queued" }), NOW)).toMatchObject({ label: "Waiting", download: "pending" });
    expect(exportJobPresentation(job({ status: "running" }), NOW)).toMatchObject({ label: "Preparing", download: "pending" });
    expect(exportJobPresentation(job({ status: "partially_completed", content: "a" }), NOW)).toMatchObject({ label: "Partly done", variant: "warning", download: "ready" });
    expect(exportJobPresentation(job({ status: "failed", failureMessage: "Too many rows" }), NOW)).toMatchObject({ label: "Failed", variant: "danger", download: "unavailable" });
    expect(exportJobPresentation(job({ status: "cancelled" }), NOW)).toMatchObject({ label: "Cancelled", download: "unavailable" });
  });

  it("localizes known export errors and scopes while retaining unknown worker text", () => {
    const t = createTranslator("ar");
    const tooLarge = "This export contains 123 rows and exceeds the current safe single-download limit. Narrow the date, branch, or search filters and try again.";
    expect(exportFailurePresentation(tooLarge, t, (value) => `AR${value}`)).toContain("AR123");
    expect(exportFailurePresentation(undefined, t, (value) => `AR${value}`, { failureMessageKey: "exports.tooLarge", failureMessageParams: { count: 456 } })).toContain("AR456");
    expect(exportFailurePresentation("A future worker error", t)).toBe("A future worker error");
    expect(exportBranchScopePresentation("all accessible branches", [], t)).toBe("كل الفروع المتاحة لك");
    expect(exportBranchScopePresentation("branch:branch-1", [{ id: "branch-1", name: "Original Abdoun" }], t)).toBe("Original Abdoun");
    expect(exportBranchScopePresentation("4 assigned branches", [], t, (value) => `AR${value}`)).toBe("AR4 فروع معيّنة");
    expect(exportBranchScopePresentation("a future scope", [], t)).toBe("a future scope");
  });
});
