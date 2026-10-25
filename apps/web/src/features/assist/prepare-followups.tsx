"use client";

import { Button } from "@/components/ui/button";
import type { AiRunView } from "@/lib/ai/contracts";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { capabilityAvailable, useAiSettings } from "./use-assist";

/**
 * "Prepare follow-ups" on the renewals list. The displayed branch and list
 * window travel with the request; RIVET saves call tasks only where the
 * gym's assistance and the person's own access allow it.
 */
export function PrepareFollowUpsButton({ bucket, days, branchId, onStarted }: { bucket: "expiring" | "expired"; days?: number; branchId?: string; onStarted: (run: AiRunView) => void }) {
  const { t } = useLocale();
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  const start = useApiMutation((api, _unused: void) => api.startAiRun({ playbook: "renewal_followups", params: { bucket, ...(days && days <= 90 ? { days } : {}), owner: "me" }, ...(branchId ? { branchId } : {}), requestKey: crypto.randomUUID() }), {
    successMessage: t("aiWork.prepare.started"),
    onSuccess: (run) => onStarted(run),
  });
  const allowed = (session?.permissions ?? []).includes("crm.write") && capabilityAvailable(settings, "followup_batch", true);
  if (!allowed) return null;
  return (
    <Button type="button" variant="secondary" size="sm" loading={start.isPending} onClick={() => start.mutate()} title={t("aiWork.prepare.followUpsHint")} data-testid="prepare-follow-ups">
      {start.isPending ? t("aiWork.prepare.starting") : t("aiWork.prepare.followUps")}
    </Button>
  );
}

/**
 * "Prepare lead follow-ups" on the pipeline. RIVET saves a call task with a
 * catalogue draft for each lead due today in the displayed branch; it never
 * records a contact, an offer or a discount.
 */
export function PrepareLeadFollowUpsButton({ branchId, onStarted }: { branchId?: string; onStarted: (run: AiRunView) => void }) {
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  const permissions = session?.permissions ?? [];
  // Nothing is set up while hidden, so the pipeline's own controls are untouched.
  if (!permissions.includes("crm.read") || !permissions.includes("crm.write") || !capabilityAvailable(settings, "sales_followups", true)) return null;
  return <StartLeadFollowUps branchId={branchId} onStarted={onStarted} />;
}

function StartLeadFollowUps({ branchId, onStarted }: { branchId?: string; onStarted: (run: AiRunView) => void }) {
  const { t } = useLocale();
  const start = useApiMutation((api, _unused: void) => api.startAiRun({ playbook: "sales_followups", params: { owner: "lead_owner" }, ...(branchId ? { branchId } : {}), requestKey: crypto.randomUUID() }), {
    successMessage: t("aiWork.prepare.started"),
    onSuccess: (run) => onStarted(run),
  });
  return (
    <Button type="button" variant="secondary" loading={start.isPending} onClick={() => start.mutate()} title={t("aiWork.prepare.leadFollowUpsHint")} data-testid="prepare-lead-follow-ups">
      {start.isPending ? t("aiWork.prepare.starting") : t("aiWork.prepare.leadFollowUps")}
    </Button>
  );
}
