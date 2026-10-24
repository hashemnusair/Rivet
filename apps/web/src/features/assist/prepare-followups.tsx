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
