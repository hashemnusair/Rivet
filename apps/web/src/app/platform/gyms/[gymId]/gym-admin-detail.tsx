"use client";

import { ArrowLeft, Ban, Building2, CalendarClock, Check, CreditCard, ExternalLink, Mail, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { qk } from "@/lib/api/keys";
import type { PlatformData, PlatformGymDetail } from "@/lib/api/GymOSApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input, Textarea } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils/dates";

export default function GymAdminDetail({ gymId }: { gymId: string }) {
  const detailQuery = useRealtimeApiQuery({ queryKey: qk.platformGymDetail(gymId), query: (api) => api.getPlatformGymDetail(gymId), subscribe: (api, onValue, onError) => api.subscribePlatformGymDetail(gymId, onValue, onError), enabled: Boolean(gymId) });
  const invalidate = useInvalidate();
  const detail = detailQuery.data;
  const [status, setStatus] = useState<PlatformGymDetail["controls"]["status"]>();
  const [plan, setPlan] = useState<PlatformGymDetail["controls"]["plan"]>();
  const [isPublic, setIsPublic] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [subscriptionStartedAt, setSubscriptionStartedAt] = useState("");
  const [currentPeriodEndsAt, setCurrentPeriodEndsAt] = useState("");
  const [cancelledAt, setCancelledAt] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!detail) return;
    setStatus(detail.controls.status);
    setPlan(detail.controls.plan);
    setIsPublic(detail.controls.isPublic);
    setTrialEndsAt(dateInputValue(detail.subscription.trialEndsAt));
    setSubscriptionStartedAt(dateInputValue(detail.subscription.startedAt));
    setCurrentPeriodEndsAt(dateInputValue(detail.subscription.currentPeriodEndsAt));
    setCancelledAt(dateInputValue(detail.subscription.cancelledAt));
  }, [detail]);

  const update = useApiMutation((api) => api.updatePlatformGym({ gymId, status, plan, isPublic, trialEndsAt: trialEndsAt || undefined, subscriptionStartedAt: subscriptionStartedAt || undefined, currentPeriodEndsAt: currentPeriodEndsAt || undefined, cancelledAt: cancelledAt || undefined, reason: reason.trim() }), {
    onSuccess: async () => {
      await invalidate([qk.platformGymDetail(gymId)]);
      setReason("");
      toast.success("Gym subscription controls saved and audited.");
    },
  });

  if (detailQuery.isLoading || !detail) {
    if (detailQuery.isError) {
      return <div className="p-10"><ErrorState title="Gym detail unavailable" description="The selected gym detail could not be loaded. No changes were made." onRetry={() => detailQuery.refetch()} /></div>;
    }
    return <div className="space-y-5 p-6 sm:p-8" role="status" aria-label="Loading gym detail"><Skeleton className="h-4 w-24" /><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>;
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <Link href="/platform/gyms" className="inline-flex items-center gap-2 text-[11.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" />All gyms</Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center font-mono text-[11px] font-semibold text-white" style={{ backgroundColor: detail.accent }}>{detail.shortName.slice(0, 3)}</span>
            <div>
              <h1 className="text-[27px] font-semibold tracking-tight">{detail.name}</h1>
              <p className="mt-1 text-[11.5px] text-ink-3">Customer since <FieldValue field={detail.joinedAt} render={(value) => value.slice(0, 10)} /></p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary"><Link href={`/customer/gyms/${detail.id}`}>Marketplace profile <ExternalLink /></Link></Button>
            <Button variant={status === "suspended" ? "primary" : "danger"} onClick={() => setStatus(status === "suspended" ? "active" : "suspended")}><Ban />{status === "suspended" ? "Restore access" : "Suspend"}</Button>
          </div>
        </div>

        <section className="mt-5 border border-line bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">Platform controls</p><h2 className="mt-1 text-[17px] font-semibold">Subscription state</h2><p className="mt-1 text-[11.5px] text-ink-3">Changes update the tenant record, public directory state, and immutable platform audit trail.</p></div>
            <Button variant="signal" onClick={() => update.mutate()} loading={update.isPending} disabled={!status || !plan || !reason.trim() || (status === "trial" && !trialEndsAt)}><Check />Save controls</Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-[12px] font-medium">Plan<Select value={plan ?? ""} onValueChange={(value) => setPlan(value as PlatformGymDetail["controls"]["plan"])}><SelectTrigger aria-label="Gym plan"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Starter">Starter</SelectItem><SelectItem value="Growth">Growth</SelectItem><SelectItem value="Pro">Pro</SelectItem><SelectItem value="Enterprise">Enterprise</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Subscription status<Select value={status ?? ""} onValueChange={(value) => setStatus(value as PlatformGymDetail["controls"]["status"])}><SelectTrigger aria-label="Subscription status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">Trial</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="overdue">Past due</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-[12px] font-medium">Trial ends<Input type="date" value={trialEndsAt} onChange={(event) => setTrialEndsAt(event.target.value)} /></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Subscription started<Input type="date" value={subscriptionStartedAt} onChange={(event) => setSubscriptionStartedAt(event.target.value)} /></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Current period ends<Input type="date" value={currentPeriodEndsAt} onChange={(event) => setCurrentPeriodEndsAt(event.target.value)} /></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Cancelled on<Input type="date" value={cancelledAt} onChange={(event) => setCancelledAt(event.target.value)} disabled={status !== "cancelled"} /></label>
          </div>
          <label className="mt-4 grid gap-1.5 text-[12px] font-medium">Reason for this change<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></label>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4"><div><p className="text-[12px] font-medium">Public directory listing</p><p className="mt-1 text-[10.5px] text-ink-3">Let members discover this gym and request a free trial.</p></div><Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="Public directory listing" /></div>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="RIVET plan" value={<FieldValue field={detail.subscription.plan} />} detail={<FieldValue field={detail.subscription.status} render={statusLabel} />} />
          <Stat label="Platform health" value={<FieldValue field={detail.health} render={(value) => `${value} / 100`} />} detail="Only recorded health checks appear here" />
          <Stat label="Active members" value={<FieldValue field={detail.usage.memberCount} render={(value) => value.toLocaleString()} />} detail={<FieldValue field={detail.branches} render={(value) => `${value.length} branch${value.length === 1 ? "" : "es"}`} />} />
          <Stat label="Payment transactions" value={<FieldValue field={detail.usage.paymentTransactionCount} render={(value) => value.toLocaleString()} />} detail="Tenant payment records" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
          <section className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4"><p className="eyebrow">Organization</p><h2 className="mt-1 text-[17px] font-semibold">Branches and usage</h2></div>
            <div className="divide-y divide-line">
              {detail.branches.state === "available" && detail.branches.value.length > 0 ? detail.branches.value.map((branch) => (
                <div key={branch.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div><p className="text-[13px] font-semibold">{branch.name}</p><p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-3"><MapPin className="size-3" />{branch.address || "Not available"}</p><p className="mt-1 text-[10.5px] text-ink-3">Code {branch.code} · {branch.status}</p></div>
                  <p className="text-[11px] text-ink-3">Branch actions are not configured</p>
                </div>
              )) : <UnavailableBlock field={detail.branches} empty="No branches recorded" />}
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
              <Usage icon={<Users />} label="Active staff" field={detail.usage.activeStaffCount} />
              <Usage icon={<Users />} label="Staff plan limit" field={detail.usage.staffLimit} />
              <Usage icon={<Building2 />} label="Storage" field={detail.usage.storage} />
              <Usage icon={<CalendarClock />} label="Automation rules" field={detail.usage.automationRuleCount} />
              <Usage icon={<CreditCard />} label="Payment records" field={detail.usage.paymentTransactionCount} />
            </div>
          </section>

          <div className="grid gap-5">
            <section className="border border-line bg-surface p-5">
              <p className="eyebrow">Account owner</p>
              {detail.owner.state === "available" ? <><h2 className="mt-2 text-[17px] font-semibold">{detail.owner.value.name}</h2><div className="mt-5 grid gap-3 text-[11.5px] text-ink-2"><p className="flex items-center gap-2"><Mail className="size-3.5 text-ink-3" />{detail.owner.value.email}</p><p className="flex items-center gap-2"><Phone className="size-3.5 text-ink-3" />{detail.owner.value.phone || "Not available"}</p></div></> : <UnavailableValue state={detail.owner.state} className="mt-3" />}
            </section>
            <section className="night-surface bg-night p-5 text-night-ink">
              <p className="eyebrow-night">Subscription facts</p>
              <dl className="mt-5 grid gap-3 text-[12px]">
                <FactRow label="Plan"><FieldValue field={detail.subscription.plan} /></FactRow>
                <FactRow label="Status"><FieldValue field={detail.subscription.status} render={statusLabel} /></FactRow>
                <FactRow label="Started"><FieldValue field={detail.subscription.startedAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Trial ends"><FieldValue field={detail.subscription.trialEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Period ends"><FieldValue field={detail.subscription.currentPeriodEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Cancelled"><FieldValue field={detail.subscription.cancelledAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Last change reason"><FieldValue field={detail.subscription.statusReason} /></FactRow>
                <FactRow label="Recurring amount"><FieldValue field={detail.subscription.recurringAmount} render={(value) => `${value.currency} ${(value.amount / 1000).toFixed(3)}`} /></FactRow>
                <FactRow label="Renewal"><FieldValue field={detail.subscription.renewalDate} /></FactRow>
                <FactRow label="Payment method"><FieldValue field={detail.subscription.paymentMethod} /></FactRow>
                <FactRow label="Invoices"><FieldValue field={detail.subscription.invoices} render={(value) => `${value.length} recorded`} /></FactRow>
              </dl>
            </section>
          </div>
        </div>

        <section className="mt-5 border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><p className="eyebrow">Account activity</p><h2 className="mt-1 text-[17px] font-semibold">Platform timeline</h2></div>
          {detail.activity.state === "available" && detail.activity.value.length > 0 ? <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">{detail.activity.value.map((event) => <div key={event.id} className="p-5"><p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{formatDateTime(event.occurredAt)}</p><p className="mt-3 text-[12.5px] font-semibold">{event.summary}</p><p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{event.action} · {event.actorName}</p></div>)}</div> : <UnavailableBlock field={detail.activity} empty="No platform activity recorded" />}
        </section>
      </div>
    </div>
  );
}

function FieldValue<T>({ field, render }: { field: PlatformData<T>; render?: (value: T) => React.ReactNode }) {
  return field.state === "available" ? <>{render ? render(field.value) : String(field.value)}</> : <UnavailableValue state={field.state} />;
}

function UnavailableValue({ state, className }: { state: "not_available" | "not_configured"; className?: string }) {
  return <span className={className ?? "text-ink-3"}>{state === "not_configured" ? "Not configured" : "Not available"}</span>;
}

function UnavailableBlock<T>({ field, empty }: { field: PlatformData<T>; empty: string }) {
  return <div className="px-5 py-8 text-[12px] text-ink-3">{field.state === "available" ? empty : <UnavailableValue state={field.state} />}</div>;
}

function statusLabel(value: string) {
  return value === "overdue" ? "Past due" : value.replaceAll("_", " ");
}

function dateInputValue(field: PlatformData<string>): string {
  return field.state === "available" ? field.value.slice(0, 10) : "";
}

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail: React.ReactNode }) {
  return <div className="border border-line bg-surface p-5"><p className="font-mono text-[8px] uppercase tracking-[.11em] text-ink-3">{label}</p><p className="mt-3 text-[23px] font-semibold">{value}</p><p className="mt-2 text-[10px] text-ink-3">{detail}</p></div>;
}

function Usage({ icon, label, field }: { icon: React.ReactNode; label: string; field: PlatformData<number | string> }) {
  return <div className="bg-surface p-4"><span className="text-ink-3 [&_svg]:size-3.5">{icon}</span><p className="mt-4 font-mono text-[7.5px] uppercase tracking-[.1em] text-ink-3">{label}</p><p className="mt-1 text-[12px] font-semibold"><FieldValue field={field} render={(value) => typeof value === "number" ? value.toLocaleString() : value} /></p></div>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-night-line/60 pb-2.5"><dt className="text-night-ink-3">{label}</dt><dd className="text-end font-medium">{children}</dd></div>;
}
