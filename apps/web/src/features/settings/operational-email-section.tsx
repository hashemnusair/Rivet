"use client";

import { MailCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

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

export function OperationalEmailSection() {
  const invalidate = useInvalidate();
  const query = useApiQuery(["settings", "operational-email"], (api) => api.getOperationalEmailSettings());
  const [enabledKinds, setEnabledKinds] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  useEffect(() => { if (query.data) setEnabledKinds(query.data.enabledKinds); }, [query.data]);
  const save = useApiMutation((api) => api.updateOperationalEmailSettings({ enabledKinds, reason: reason.trim() }), { onSuccess: async () => { await invalidate(); setReason(""); toast.success("Operational email activation settings saved."); } });
  if (query.isError) return <ErrorState title="Email activation settings could not be loaded" onRetry={() => query.refetch()} />;
  if (!query.data) return <div className="panel h-48 animate-pulse bg-sunken" />;
  const settings = query.data;
  return <section className="panel overflow-hidden">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5"><div><p className="eyebrow">Delivery boundary</p><h2 className="mt-1 text-[18px] font-semibold">Operational email</h2><p className="mt-1 max-w-2xl text-[12px] text-ink-3">Message types are tenant-controlled, but delivery remains impossible until the global worker, Resend provider, and signed webhook are configured.</p></div><div className="flex flex-wrap gap-2"><Badge variant={settings.liveWorkerEnabled ? "success" : "outline"}>worker {settings.liveWorkerEnabled ? "live" : "sandbox"}</Badge><Badge variant={settings.providerConfigured ? "success" : "warning"}>provider {settings.providerConfigured ? "configured" : "missing"}</Badge><Badge variant={settings.webhookConfigured ? "success" : "warning"}>webhook {settings.webhookConfigured ? "verified" : "missing"}</Badge></div></header>
    {!settings.liveWorkerEnabled ? <div className="m-5 flex gap-3 border border-warning/30 bg-warning-bg p-4 text-[12px] text-warning-deep"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p>Sandbox is active. Saving message types below does not send email. Enabling the global worker is a separate Production change.</p></div> : null}
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="grid gap-2 sm:grid-cols-2">{settings.availableKinds.map((kind) => <label key={kind} className="flex cursor-pointer items-center gap-3 rounded-md border border-line p-3 text-[12.5px]"><Checkbox checked={enabledKinds.includes(kind)} onCheckedChange={(checked) => setEnabledKinds((current) => checked === true ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))} aria-label={LABELS[kind] ?? kind} /><span className="flex-1">{LABELS[kind] ?? kind.replaceAll("_", " ")}</span>{enabledKinds.includes(kind) ? <MailCheck className="size-4 text-success-deep" /> : null}</label>)}</div><div><Field label="Required change reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approved service-message activation change" /></Field><Button className="mt-3 w-full" loading={save.isPending} disabled={!reason.trim()} onClick={() => save.mutate()}>Save activation settings</Button>{settings.updatedAt ? <p className="mt-3 text-[10.5px] text-ink-3">Last changed by {settings.updatedBy ?? "an authorized operator"}. {settings.reason}</p> : null}</div></div>
  </section>;
}
