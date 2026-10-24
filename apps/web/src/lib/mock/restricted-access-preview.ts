import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";

/** Credential-free isolated fixture; the production data mode cannot enable it. */
export function restrictedAccessPreview(): { status: "pending_payment" | "suspended"; cancelledAt: string } | undefined {
  if (!DEMO_AUTH_BYPASS || typeof window === "undefined" || process.env.VITEST || process.env.VITEST_WORKER_ID) return undefined;
  try {
    const status = sessionStorage.getItem("rivet.demo.billingCompanion");
    const cancelledAt = sessionStorage.getItem("rivet.demo.cancelledAt");
    if ((status === "pending_payment" || status === "suspended") && cancelledAt && Number.isFinite(Date.parse(cancelledAt))) return { status, cancelledAt };
  } catch { /* Storage is optional in previews. */ }
  return undefined;
}
export const PREVIEW_EXPORT_ORG = "preview-cancelled-gym";
