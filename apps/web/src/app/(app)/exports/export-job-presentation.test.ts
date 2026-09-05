import { describe, expect, it } from "vitest";
import type { ExportJob } from "@/lib/domain/qol";
import { exportJobPresentation } from "./export-job-presentation";

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
    expect(exportJobPresentation(job({ status: "queued" }), NOW)).toMatchObject({ label: "Queued", download: "pending" });
    expect(exportJobPresentation(job({ status: "running" }), NOW)).toMatchObject({ label: "Running", download: "pending" });
    expect(exportJobPresentation(job({ status: "partially_completed", content: "a" }), NOW)).toMatchObject({ label: "Partial", variant: "warning", download: "ready" });
    expect(exportJobPresentation(job({ status: "failed", failureMessage: "Too many rows" }), NOW)).toMatchObject({ label: "Failed", variant: "danger", download: "unavailable" });
    expect(exportJobPresentation(job({ status: "cancelled" }), NOW)).toMatchObject({ label: "Cancelled", download: "unavailable" });
  });
});
