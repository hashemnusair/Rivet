"use client";

import { LockKeyhole, MailCheck, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { SettingsSaveBar } from "@/features/settings/settings-layout";

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

export function disabledOperationalEmailKinds(previous: string[], next: string[]): string[] {
  const nextKinds = new Set(next);
  return [...new Set(previous)].filter((kind) => !nextKinds.has(kind));
}

function operationalEmailKindSetsMatch(left: string[], right: string[]): boolean {
  return disabledOperationalEmailKinds(left, right).length === 0
    && disabledOperationalEmailKinds(right, left).length === 0;
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
  if (query.isError) return <ErrorState title="Email activation settings could not be loaded" onRetry={() => query.refetch()} />;
  if (!query.data) return <div className="panel h-48 animate-pulse bg-sunken" />;
  const settings = query.data;
  const dirty = !operationalEmailKindSetsMatch(settings.enabledKinds, enabledKinds) || reason.trim().length > 0;
  const saveDisabledReason = requiresReason && reason.trim().length < 3 ? "Add a short reason before disabling member service email." : undefined;
  return <div className="pb-4"><section className="panel overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5"><div><p className="eyebrow">Delivery boundary</p><h2 className="mt-1 text-[18px] font-semibold">Member service email</h2><p className="mt-1 max-w-2xl text-[12px] text-ink-3">These are gym-controlled member service preferences. RIVET billing, subscription, and account-access notices are owned by the platform and remain mandatory.</p></div><div className="flex flex-wrap gap-2"><Badge variant={settings.liveWorkerEnabled ? "success" : "outline"}>worker {settings.liveWorkerEnabled ? "live" : "disabled"}</Badge><Badge variant={settings.providerConfigured ? "success" : "warning"}>provider {settings.providerConfigured ? "configured" : "missing"}</Badge><Badge variant={settings.webhookConfigured ? "success" : "warning"}>webhook {settings.webhookConfigured ? "verified" : "missing"}</Badge></div></header>
    {!settings.liveWorkerEnabled ? <div className="m-5 flex gap-3 border border-warning/30 bg-warning-bg p-4 text-[12px] text-warning-deep"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>External delivery is currently disabled by RIVET. Saving preferences cannot activate the global worker or Resend delivery; your choices apply only after both are enabled.</p></div> : !settings.ownerConfirmed ? <div className="m-5 flex gap-3 border border-warning/30 bg-warning-bg p-4 text-[12px] text-warning-deep"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>Review the categories below and save them before this gym can send member service email.</p></div> : <div className="m-5 flex gap-3 border border-success/30 bg-success-bg p-4 text-[12px] text-success-deep"><MailCheck className="mt-0.5 size-4 shrink-0" /><p>Live delivery is enabled for the categories confirmed below.</p></div>}
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div><div className="grid gap-2 sm:grid-cols-2">{settings.configurableKinds.map((kind) => <label key={kind} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 text-[12.5px]"><Checkbox checked={enabledKinds.includes(kind)} onCheckedChange={(checked) => setEnabledKinds((current) => checked === true ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))} aria-label={LABELS[kind] ?? kind} /><span className="flex-1">{LABELS[kind] ?? kind.replaceAll("_", " ")}</span>{enabledKinds.includes(kind) ? <MailCheck className="size-4 text-success-deep" /> : null}</label>)}</div><section className="mt-5 rounded-md border border-line bg-sunken p-4"><div className="flex gap-2"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-ink-3" /><div><h3 className="text-[12.5px] font-medium">Mandatory RIVET platform notices</h3><p className="mt-1 text-[11px] text-ink-3">Gym owners cannot disable invoices, past-due and suspension notices, cancellations, or account-access messages.</p></div></div><ul className="mt-3 grid gap-1 text-[11.5px] text-ink-2 sm:grid-cols-2">{settings.mandatoryPlatformKinds.map((kind) => <li key={kind}>{LABELS[kind] ?? kind.replaceAll("_", " ")}</li>)}</ul></section></div><div><Field label={requiresReason ? "Reason for disabling service messages" : "Change note (optional)"} htmlFor="operational-email-reason" required={requiresReason} hint={requiresReason ? `A meaningful reason is required because ${disabledKinds.length} previously enabled service ${disabledKinds.length === 1 ? "category is" : "categories are"} being disabled.` : "Ordinary preference updates do not require a reason."}><Textarea id="operational-email-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={requiresReason ? "Why should this member service category be disabled?" : "Optional context"} /></Field>{settings.ownerConfirmedAt ? <p className="mt-3 text-[10.5px] text-ink-3">Confirmed by {settings.ownerConfirmedBy ?? "an authorized owner or manager"}.</p> : null}{settings.updatedAt ? <p className="mt-1 text-[10.5px] text-ink-3">Last changed by {settings.updatedBy ?? "an authorized operator"}.{settings.reason ? ` ${settings.reason}` : ""}</p> : null}</div></div>
  </section><SettingsSaveBar dirty={dirty} saving={save.isPending} saveDisabled={Boolean(saveDisabledReason)} saveDisabledReason={saveDisabledReason} onSave={async () => { await save.mutateAsync(); }} onDiscard={() => { setEnabledKinds(settings.enabledKinds); setReason(""); }} saveLabel="Save email preferences" /></div>;
}
