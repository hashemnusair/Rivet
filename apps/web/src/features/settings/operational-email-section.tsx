"use client";

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

const EMAIL_MODE_LABELS: Record<string, string> = { off: "Off", sandbox: "Sandbox", allowlist: "Allowlist", live: "Live" };
const EMAIL_MODE_HINTS: Record<string, string> = {
  off: "Emails are rendered and logged, never sent.",
  sandbox: "Every email goes to RIVET's sandbox inbox with the real recipient in the subject.",
  allowlist: "Only allowlisted addresses receive email; everyone else is suppressed with a reason.",
  live: "Emails reach real recipients.",
};

const LABELS: Record<string, string> = {
  trial_request_confirmation: "Trial confirmation",
  trial_status: "Trial status",
  payment_receipt: "Payment receipt",
  support_acknowledgement: "Support acknowledgement",
  support_reply: "Support reply",
  support_resolved: "Support resolved",
  renewal_reminder: "Renewal reminder",
  membership_expiry: "Membership expiry",
  pt_booking_confirmation: "PT booking confirmation",
  pt_booking_reminder: "PT booking reminder",
  pt_booking_update: "PT booking changes",
  pt_low_balance: "PT low balance",
  pt_package_paid: "PT package activated",
  platform_invoice_issued: "Platform invoice issued",
  platform_invoice_paid: "Platform invoice paid",
  platform_invoice_past_due: "Platform invoice past due",
  platform_subscription_suspended: "Subscription suspended",
  platform_subscription_cancelled: "Subscription cancelled",
};

const DESCRIPTION = "Which member service emails this gym sends. RIVET's own billing, subscription and account-access notices are mandatory and owned by the platform.";

export function disabledOperationalEmailKinds(previous: string[], next: string[]): string[] {
  const nextKinds = new Set(next);
  return [...new Set(previous)].filter((kind) => !nextKinds.has(kind));
}

function operationalEmailKindSetsMatch(left: string[], right: string[]): boolean {
  return disabledOperationalEmailKinds(left, right).length === 0
    && disabledOperationalEmailKinds(right, left).length === 0;
}

function kindLabel(kind: string): string {
  return LABELS[kind] ?? kind.replaceAll("_", " ");
}

export function OperationalEmailSection() {
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
  const save = useApiMutation((api) => api.updateOperationalEmailSettings({ enabledKinds, reason: reason.trim() }), { onSuccess: async () => { await invalidate([["settings", "operational-email"]]); setReason(""); toast.success("Member service email preferences saved."); } });
  if (query.isError) return <SettingsSection title="Operational email" description={DESCRIPTION}><ErrorState layout="section" title="Email activation settings could not be loaded" onRetry={() => query.refetch()} /></SettingsSection>;
  if (!query.data) return <SettingsSection title="Operational email" description={DESCRIPTION}><Skeleton className="h-48 w-full" /></SettingsSection>;
  const settings = query.data;
  const dirty = !operationalEmailKindSetsMatch(settings.enabledKinds, enabledKinds) || reason.trim().length > 0;
  const saveDisabledReason = requiresReason && reason.trim().length < 3 ? "Add a short reason before disabling member service email." : undefined;
  const readiness = [
    { label: settings.liveWorkerEnabled ? "Worker live" : "Worker disabled", ok: settings.liveWorkerEnabled, variant: settings.liveWorkerEnabled ? "success" : "outline" },
    { label: settings.providerConfigured ? "Provider configured" : "Provider missing", ok: settings.providerConfigured, variant: settings.providerConfigured ? "success" : "warning" },
    { label: settings.webhookConfigured ? "Webhook verified" : "Webhook missing", ok: settings.webhookConfigured, variant: settings.webhookConfigured ? "success" : "warning" },
  ] as const;
  const notice = !settings.liveWorkerEnabled
    ? { tone: "warning" as const, icon: ShieldAlert, text: "External delivery is currently disabled by RIVET. Saving preferences cannot activate the global worker or Resend delivery; your choices apply only after both are enabled." }
    : !settings.ownerConfirmed
      ? { tone: "warning" as const, icon: ShieldAlert, text: "Review the categories below and save them before this gym can send member service email." }
      : { tone: "success" as const, icon: MailCheck, text: "Live delivery is enabled for the categories confirmed below." };

  return (
    <SettingsSection title="Operational email" description={DESCRIPTION}>
      <SettingsPanel title="Delivery status" description="Set by RIVET for the whole platform; this gym's preferences apply once delivery is live." bodyClassName="px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-ink-2" data-testid="email-delivery-mode">
          <span className="text-ink-3">Delivery mode</span>
          <Badge variant={settings.deliveryMode === "live" ? "success" : settings.deliveryMode === "off" ? "neutral" : "warning"} dot>{EMAIL_MODE_LABELS[settings.deliveryMode] ?? settings.deliveryMode}</Badge>
          <span className="text-ink-3">{EMAIL_MODE_HINTS[settings.deliveryMode]}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {readiness.map((item) => <Badge key={item.label} variant={item.variant} dot>{item.label}</Badge>)}
        </div>
        {settings.deliveryModeSource === "legacy_live_flag" ? <p className="mt-2 text-[12px] leading-5 text-warning-deep">Set by the deprecated RIVET_OPERATIONAL_EMAIL_LIVE flag; configure RIVET_EMAIL_MODE instead.</p> : null}
        {settings.deliveryModeWarning ? <p className="mt-2 text-[12px] leading-5 text-warning-deep">{settings.deliveryModeWarning}</p> : null}
        <div className={cn("mt-3 flex gap-3 rounded-md px-3 py-2.5 text-[12.5px] leading-5", notice.tone === "warning" ? "bg-warning-bg text-warning-deep" : "bg-success-bg text-success-deep")} role="status">
          <notice.icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{notice.text}</p>
        </div>
      </SettingsPanel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          <SettingsPanel title="Member service email" description="Tick the categories this gym sends. Each is a reviewed template in the gym's language." bodyClassName="px-4 py-1 sm:px-5">
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
                <h3 className="text-[13.5px] font-semibold text-ink">Mandatory RIVET platform notices</h3>
                <p className="mt-0.5 text-[12px] leading-5 text-ink-3">Gym owners cannot disable invoices, past-due and suspension notices, cancellations, or account-access messages.</p>
                <ul className="mt-2 grid gap-y-1 text-[12.5px] text-ink-2 sm:grid-cols-2 sm:gap-x-6">{settings.mandatoryPlatformKinds.map((kind) => <li key={kind}>{kindLabel(kind)}</li>)}</ul>
              </div>
            </div>
          </div>
        </div>
        <SettingsPanel title="Change record" description="Kept with the audit entry for this save.">
          <Field label={requiresReason ? "Reason for disabling service messages" : "Change note (optional)"} htmlFor="operational-email-reason" required={requiresReason} hint={requiresReason ? `A meaningful reason is required because ${disabledKinds.length} previously enabled service ${disabledKinds.length === 1 ? "category is" : "categories are"} being disabled.` : "Ordinary preference updates do not require a reason."}>
            <Textarea id="operational-email-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requiresReason ? "Why should this member service category be disabled?" : "Optional context"} />
          </Field>
          {settings.ownerConfirmedAt ? <p className="mt-3 text-[12px] leading-5 text-ink-3">Confirmed by {settings.ownerConfirmedBy ?? "an authorized owner or manager"}.</p> : null}
          {settings.updatedAt ? <p className="mt-1 text-[12px] leading-5 text-ink-3">Last changed by {settings.updatedBy ?? "an authorized operator"}.{settings.reason ? ` ${settings.reason}` : ""}</p> : null}
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? (isApiError(save.error) ? save.error.message : "The email preferences could not be saved. Try again.") : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={() => { setEnabledKinds(settings.enabledKinds); setReason(""); }}
        saveLabel="Save email preferences"
        guardTitle="Unsaved email preferences"
      />
    </SettingsSection>
  );
}
