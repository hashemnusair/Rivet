"use client";
import { useT } from "@/lib/i18n/provider";

import { LockKeyhole, MailCheck, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";




export function disabledOperationalEmailKinds(previous: string[], next: string[]): string[] {
  const nextKinds = new Set(next);
  return [...new Set(previous)].filter((kind) => !nextKinds.has(kind));
}

function operationalEmailKindSetsMatch(left: string[], right: string[]): boolean {
  return disabledOperationalEmailKinds(left, right).length === 0
    && disabledOperationalEmailKinds(right, left).length === 0;
}



export function OperationalEmailSection() {
  const t = useT();
  const LABELS: Record<string, string> = {
  trial_request_confirmation: t("settingsDetails.text179"),
  trial_status: t("settingsDetails.text180"),
  payment_receipt: t("settingsDetails.text181"),
  support_acknowledgement: t("settingsDetails.text182"),
  support_reply: t("settingsDetails.text183"),
  support_resolved: t("settingsDetails.text184"),
  renewal_reminder: t("settingsDetails.text185"),
  membership_expiry: t("settingsDetails.text186"),
  pt_booking_confirmation: t("settingsDetails.text187"),
  pt_booking_reminder: t("settingsDetails.text188"),
  pt_booking_update: t("settingsDetails.text189"),
  pt_low_balance: t("settingsDetails.text190"),
  pt_package_paid: t("settingsDetails.text191"),
  platform_invoice_issued: t("settingsDetails.text192"),
  platform_invoice_paid: t("settingsDetails.text193"),
  platform_invoice_past_due: t("settingsDetails.text194"),
  platform_subscription_suspended: t("settingsDetails.text195"),
  platform_subscription_cancelled: t("settingsDetails.text196"),
};

  const EMAIL_MODE_HINTS: Record<string, string> = {
  off: t("settingsDetails.text175"),
  sandbox: t("settingsDetails.text176"),
  allowlist: t("settingsDetails.text177"),
  live: t("settingsDetails.text178"),
};

  const EMAIL_MODE_LABELS: Record<string, string> = { off: t("settingsCore.text151"), sandbox: t("settingsCore.text152"), allowlist: t("settingsDetails.text174"), live: t("settingsCore.text154") };

  const DESCRIPTION = t("settingsDetails.text197");

  const kindLabel = (kind: string): string => LABELS[kind] ?? kind;
  const invalidate = useInvalidate();
  const query = useApiQuery(["settings", "operational-email"], (api) => api.getOperationalEmailSettings());
  const [enabledKinds, setEnabledKinds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const lastSyncedKinds = useRef<string[] | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const previousPersisted = lastSyncedKinds.current;
    const hasLocalChanges = previousPersisted !== null
      && !operationalEmailKindSetsMatch(enabledKinds, previousPersisted);
    if (previousPersisted === null || !hasLocalChanges) setEnabledKinds(query.data.enabledKinds);
    lastSyncedKinds.current = query.data.enabledKinds;
  }, [enabledKinds, query.data]); // Local edits must not be overwritten by a background refetch.
  const disabledKinds = disabledOperationalEmailKinds(query.data?.enabledKinds ?? [], enabledKinds);
  const requiresReason = disabledKinds.length > 0;
  const save = useApiMutation((api) => api.updateOperationalEmailSettings({ enabledKinds, reason: reason.trim() }), { onSuccess: async () => { await invalidate([["settings", "operational-email"]]); setReason(""); toast.success(t("settingsDetails.text198")); } });
  if (query.isError) return <SettingsSection title={t("settingsCore.text189")} description={DESCRIPTION}><ErrorState layout="section" title={t("settingsDetails.text199")} onRetry={() => query.refetch()} /></SettingsSection>;
  if (!query.data) return <SettingsSection title={t("settingsCore.text189")} description={DESCRIPTION}><Skeleton className="h-48 w-full" /></SettingsSection>;
  const settings = query.data;
  const dirty = !operationalEmailKindSetsMatch(settings.enabledKinds, enabledKinds) || reason.trim().length > 0;
  const saveDisabledReason = requiresReason && reason.trim().length < 3 ? t("settingsDetails.text200") : undefined;
  const readiness = [
    { label: settings.liveWorkerEnabled ? t("settingsDetails.text201") : t("settingsDetails.text202"), ok: settings.liveWorkerEnabled, variant: settings.liveWorkerEnabled ? "success" : "outline" },
    { label: settings.providerConfigured ? t("settingsDetails.text203") : t("settingsDetails.text204"), ok: settings.providerConfigured, variant: settings.providerConfigured ? "success" : "warning" },
    { label: settings.webhookConfigured ? t("settingsDetails.text205") : t("settingsDetails.text206"), ok: settings.webhookConfigured, variant: settings.webhookConfigured ? "success" : "warning" },
  ] as const;
  const notice = !settings.liveWorkerEnabled
    ? { tone: "warning" as const, icon: ShieldAlert, text: t("settingsDetails.text207") }
    : !settings.ownerConfirmed
      ? { tone: "warning" as const, icon: ShieldAlert, text: t("settingsDetails.text208") }
      : { tone: "success" as const, icon: MailCheck, text: t("settingsDetails.text209") };

  return (
    <SettingsSection title={t("settingsCore.text189")} description={DESCRIPTION}>
      <SettingsPanel title={t("settingsDetails.text210")} description={t("settingsDetails.text211")} bodyClassName="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-ink-2" data-testid="email-delivery-mode">
          <span className="text-ink-3">{t("settingsDetails.text212")}</span>
          <Badge variant={settings.deliveryMode === "live" ? "success" : settings.deliveryMode === "off" ? "neutral" : "warning"} dot>{EMAIL_MODE_LABELS[settings.deliveryMode] ?? settings.deliveryMode}</Badge>
          <span className="text-ink-3">{EMAIL_MODE_HINTS[settings.deliveryMode]}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {readiness.map((item) => <Badge key={item.label} variant={item.variant} dot>{item.label}</Badge>)}
        </div>
        {settings.deliveryModeWarning ? <p className="mt-2 text-[12px] leading-5 text-warning-deep">{t("settingsDetails.emailModeWarning")}</p> : null}
        <div className={cn("mt-3 flex gap-3 rounded-md px-3 py-2.5 text-[12.5px] leading-5", notice.tone === "warning" ? "bg-warning-bg text-warning-deep" : "bg-success-bg text-success-deep")} role="status">
          <notice.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{notice.text}</p>
        </div>
      </SettingsPanel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          <SettingsPanel title={t("settingsDetails.text213")} description={t("settingsDetails.text214")} bodyClassName="px-4 py-1 sm:px-5">
            <div className="divide-y divide-line sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
              {settings.configurableKinds.map((kind) => {
                const checked = enabledKinds.includes(kind);
                return (
                  <label key={kind} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-[13.5px] text-ink sm:border-b sm:border-line">
                    <Checkbox checked={checked} onCheckedChange={(value) => setEnabledKinds((current) => value === true ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))} aria-label={kindLabel(kind)} />
                    <span className="flex-1">{kindLabel(kind)}</span>
                    {checked ? <MailCheck className="size-4 text-success-deep" aria-hidden /> : null}
                  </label>
                );
              })}
            </div>
          </SettingsPanel>
          <div className="panel-inset p-4">
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-semibold text-ink">{t("settingsDetails.text215")}</h3>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text216")}</p>
                <ul className="mt-2 grid gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2 sm:gap-x-6">{settings.mandatoryPlatformKinds.map((kind) => <li key={kind}>{kindLabel(kind)}</li>)}</ul>
              </div>
            </div>
          </div>
        </div>
        <SettingsPanel title={t("renewFlow.sale.changeReason")} description={t("settingsDetails.text217")}>
          <Field label={requiresReason ? t("settingsDetails.text218") : t("settingsDetails.text219")} htmlFor="operational-email-reason" required={requiresReason} hint={requiresReason ? t("settingsDetails.disableEmailCount", { count: disabledKinds.length }) : t("settingsDetails.text220")}>
            <Textarea id="operational-email-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requiresReason ? t("settingsDetails.text221") : t("settingsDetails.text222")} />
          </Field>
          {settings.ownerConfirmedAt ? <p className="mt-3 text-[12px] leading-5 text-ink-3">{t("settingsDetails.confirmedBy", { name: settings.ownerConfirmedBy ?? t("settingsDetails.text223") })}</p> : null}
          {settings.updatedAt ? <p className="mt-1 text-[12px] leading-5 text-ink-3">{t("settingsDetails.changedBy", { name: settings.updatedBy ?? t("settingsDetails.text224") })}{settings.reason ? ` ${settings.reason}` : ""}</p> : null}
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? (isApiError(save.error) ? save.error.message : t("settingsDetails.text225")) : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={() => { setEnabledKinds(settings.enabledKinds); setReason(""); }}
        saveLabel={t("settingsDetails.text226")}
        guardTitle={t("settingsDetails.text227")}
      />
    </SettingsSection>
  );
}
