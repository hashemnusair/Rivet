"use client";

import { useState } from "react";
import { PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/states";
import type { AiGymAvailability } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";

/**
 * Which gyms may use RIVET assistance at all. No gym can until a platform
 * admin makes it available here with a reason; the gym's owner then decides
 * what RIVET may do. Removing a gym stops its running work at the next step.
 * Every change is recorded in the platform audit, and the server enforces it.
 */
export function PlatformAvailability() {
  const { t, isolate } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  const [chosen, setChosen] = useState("");
  const availability = useApiQuery(qk.aiPlatformAvailability, (api) => api.getPlatformAiAvailability());
  const change = useApiMutation((api, input: { organizationId: string; available: boolean }) => api.setPlatformAiAvailability({ ...input, reason: reason.trim() }), {
    successMessage: (result) => result.available ? t("aiWork.platformControl.availableToast", { name: isolate(result.name) }) : t("aiWork.platformControl.removedToast", { name: isolate(result.name) }),
    onSuccess: async () => { setReason(""); setChosen(""); await invalidate([qk.aiPlatformAvailability, qk.aiSettings]); },
  });
  const gyms = availability.data?.gyms ?? [];
  const available = gyms.filter((gym) => gym.available);
  const others = gyms.filter((gym) => !gym.available);
  const busy = (gym: AiGymAvailability) => change.isPending && change.variables?.organizationId === gym.organizationId;
  return (
    <PlatformPanel aria-labelledby="platform-assistance-availability">
      <PlatformPanelHeader id="platform-assistance-availability" title={t("aiWork.platformControl.availabilityTitle")} description={t("aiWork.platformControl.availabilityDescription")} />
      <div className="space-y-4 px-4 py-4 sm:px-5" data-testid="platform-assistance-availability">
        {availability.isLoading ? <Skeleton className="h-16 w-full" /> : availability.isError ? <ErrorState layout="section" onRetry={() => availability.refetch()} /> : (
          <>
            {available.length === 0 ? <p className="text-[12.5px] text-ink-3" data-testid="platform-assistance-none">{t("aiWork.platformControl.availabilityNone")}</p> : (
              <ul className="divide-y divide-line">
                {available.map((gym) => (
                  <li key={gym.organizationId} className="flex flex-wrap items-center justify-between gap-3 py-2.5" data-testid="platform-assistance-gym">
                    <div className="min-w-0 text-[12.5px]">
                      <p className="font-medium text-ink"><bdi>{gym.name}</bdi></p>
                      {gym.changedAt ? <p className="text-ink-3">{t("aiWork.platformControl.availableSince", { name: isolate(gym.changedByName ?? ""), at: format.dateTime(gym.changedAt), reason: isolate(gym.reason ?? "") })}</p> : null}
                    </div>
                    <Button type="button" size="sm" variant="secondary" loading={busy(gym)} disabled={!reason.trim() || change.isPending} onClick={() => change.mutate({ organizationId: gym.organizationId, available: false })} data-testid="platform-assistance-remove">
                      {t("aiWork.platformControl.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Field label={t("aiWork.platformControl.chooseGym")} htmlFor="platform-assistance-gym">
              <Select value={chosen} onValueChange={setChosen}>
                <SelectTrigger id="platform-assistance-gym" className="max-w-md" data-testid="platform-assistance-choose"><SelectValue placeholder={t("aiWork.platformControl.chooseGymPlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {others.map((gym) => <SelectItem key={gym.organizationId} value={gym.organizationId}>{gym.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("aiWork.platformControl.reason")} hint={t("aiWork.platformControl.reasonHint")} required htmlFor="platform-assistance-availability-reason">
              <Textarea id="platform-assistance-availability-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} dir="auto" className="min-h-20" data-testid="platform-assistance-availability-reason" />
            </Field>
            <Button type="button" loading={change.isPending && change.variables?.available === true} disabled={!chosen || !reason.trim() || change.isPending} onClick={() => change.mutate({ organizationId: chosen, available: true })} data-testid="platform-assistance-make-available">
              {t("aiWork.platformControl.makeAvailable")}
            </Button>
            <p className="text-[12px] text-ink-3">{t("aiWork.platformControl.availabilityEffect")}</p>
          </>
        )}
      </div>
    </PlatformPanel>
  );
}
