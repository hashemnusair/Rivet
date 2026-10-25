"use client";

import { useState } from "react";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";

/**
 * The platform-wide stop for RIVET assistance. Stopping takes effect at the
 * next step of any running work in every gym; ordinary workflows are not
 * affected. Every change needs a reason and is recorded in the platform audit.
 */
export default function PlatformAssistancePage() {
  const { t, isolate } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  const status = useApiQuery(qk.aiPlatformStatus, (api) => api.getPlatformAiStatus());
  const change = useApiMutation((api, stopped: boolean) => api.setPlatformAiStop({ stopped, reason: reason.trim() }), {
    successMessage: (result) => result.stopped ? t("aiWork.platformControl.stoppedToast") : t("aiWork.platformControl.resumedToast"),
    onSuccess: async () => { setReason(""); await invalidate([qk.aiPlatformStatus, qk.aiSettings]); },
  });
  const value = status.data;
  return (
    <PlatformPage className="space-y-5" data-testid="platform-assistance">
      <PageHeader title={t("aiWork.platformControl.title")} description={t("aiWork.platformControl.description")} />
      <div className="max-w-3xl">
        <PlatformPanel aria-labelledby="platform-assistance-status">
          <PlatformPanelHeader id="platform-assistance-status" title={t("aiWork.platformControl.statusTitle")} />
          <div className="space-y-4 px-4 py-4 sm:px-5">
            {status.isLoading ? <Skeleton className="h-16 w-full" /> : status.isError ? <ErrorState layout="section" onRetry={() => status.refetch()} /> : value ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Badge variant={value.stopped ? "danger" : value.adapterMode === "off" ? "neutral" : "success"} data-testid="platform-assistance-state">
                    {value.stopped ? t("aiWork.platformControl.stopped") : value.adapterMode === "off" ? t("aiWork.platformControl.deploymentOff") : t("aiWork.platformControl.running")}
                  </Badge>
                  <span className="text-ink-3">{t(`aiWork.platformControl.mode.${value.adapterMode}`)}</span>
                </div>
                {value.changedAt ? <p className="text-[12.5px] text-ink-2">{t("aiWork.platformControl.lastChange", { name: isolate(value.changedByName ?? ""), at: format.dateTime(value.changedAt), reason: value.reason ?? "" })}</p> : null}
                <Field label={t("aiWork.platformControl.reason")} hint={t("aiWork.platformControl.reasonHint")} required>
                  <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} dir="auto" className="min-h-20" data-testid="platform-assistance-reason" />
                </Field>
                <Button type="button" variant={value.stopped ? "secondary" : "danger"} loading={change.isPending} disabled={!reason.trim()} onClick={() => change.mutate(!value.stopped)} data-testid="platform-assistance-toggle">
                  {value.stopped ? t("aiWork.platformControl.resume") : t("aiWork.platformControl.stop")}
                </Button>
                <p className="text-[12px] text-ink-3">{t("aiWork.platformControl.effect")}</p>
              </>
            ) : null}
          </div>
        </PlatformPanel>
      </div>
    </PlatformPage>
  );
}
