"use client";

import { ArrowLeft, Ban, Building2, CalendarClock, Check, CircleAlert, CreditCard, ExternalLink, Mail, MapPin, Phone, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { qk } from "@/lib/api/keys";
import type { ArchivePlatformGymInput, BillingInterval, PlatformData, PlatformGymDetail } from "@/lib/api/GymOSApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input, Textarea } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

type GymArchiveApi = { archivePlatformGym?: (input: ArchivePlatformGymInput) => Promise<void> };

export default function GymAdminDetail({ gymId }: { gymId: string }) {
  const router = useRouter();
  const detailQuery = useRealtimeApiQuery({ queryKey: qk.platformGymDetail(gymId), query: (api) => api.getPlatformGymDetail(gymId), subscribe: (api, onValue, onError) => api.subscribePlatformGymDetail(gymId, onValue, onError), enabled: Boolean(gymId) });
  const invalidate = useInvalidate();
  const detail = detailQuery.data;
  const organizationAvailable = detail?.organization.state === "available";
  const [status, setStatus] = useState<PlatformGymDetail["controls"]["status"]>();
  const [plan, setPlan] = useState<PlatformGymDetail["controls"]["plan"]>();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [isPublic, setIsPublic] = useState(false);
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const editing = useRef(false);

  useEffect(() => {
    if (!detail || editing.current) return;
    setStatus(detail.controls.status);
    setPlan(detail.controls.plan);
    setBillingInterval(readBillingInterval(detail.subscription.billingInterval));
    setIsPublic(detail.organization.state === "available" && normalizePublicListing(detail.controls.isPublic, detail.controls.status));
  }, [detail]);

  const dirty = detail && organizationAvailable ? subscriptionDraftIsDirty(detail, {
    status,
    plan,
    billingInterval,
    isPublic,
  }) : false;

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  const update = useApiMutation((api) => {
    if (!organizationAvailable) throw new Error("Subscription controls are unavailable until this gym is provisioned.");
    return api.updatePlatformGym({ gymId, status, plan, billingInterval, isPublic: normalizePublicListing(isPublic, status), reason: reason.trim() });
  }, {
    onSuccess: async () => {
      editing.current = false;
      await invalidate([qk.platformGymDetail(gymId)]);
      setReason("");
      toast.success("Gym subscription controls saved and audited.");
    },
  });

  const archive = useApiMutation<void, ArchivePlatformGymInput>((api, input) => {
    const archivePlatformGym = (api as typeof api & GymArchiveApi).archivePlatformGym;
    if (!archivePlatformGym) throw new Error("Gym archiving is not available in this deployment yet.");
    return archivePlatformGym.call(api, input);
  }, {
    onSuccess: async () => {
      await invalidate([qk.platformGymDetail(gymId)]);
      toast.success("Gym archived. Access and public discovery were removed; history was retained.");
      setDeleteOpen(false);
      router.push("/platform/gyms");
    },
    onError: (error) => setDeleteError(error.message || "The gym could not be archived. No changes were made."),
  });

  if (detailQuery.isLoading || !detail) {
    if (detailQuery.isError) {
      return <div className="p-10"><QueryErrorState error={detailQuery.error} notFoundTitle="Gym not found" forbiddenDescription="Your platform role cannot view this gym." onRetry={() => detailQuery.refetch()} /></div>;
    }
    return <div className="space-y-5 p-6 sm:p-8" role="status" aria-label="Loading gym detail"><Skeleton className="h-4 w-24" /><Skeleton className="h-20 w-full" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div></div>;
  }

  const edit = <T,>(setter: (value: T) => void, value: T) => { editing.current = true; setter(value); };
  const cancelDraft = () => {
    editing.current = false;
    setStatus(detail.controls.status);
    setPlan(detail.controls.plan);
    setBillingInterval(readBillingInterval(detail.subscription.billingInterval));
    setIsPublic(detail.organization.state === "available" && detail.controls.isPublic);
    setReason("");
  };
  const draftStatus = status ?? detail.controls.status;
  const publicListingAllowed = Boolean(organizationAvailable) && isPublicSubscriptionStatus(draftStatus);
  // Keep the shortcut label tied to the persisted record. The selector and
  // listing switch intentionally show the local draft, but the shortcut must
  // not imply that a restore/suspension has already been written.
  const statusAction = detail.controls.status === "suspended" || detail.controls.status === "cancelled"
    ? { label: detail.controls.status === "cancelled" ? "Reactivate" : "Restore access", next: "active" as const }
    : { label: "Suspend", next: "suspended" as const };
  const marketplaceProfileAvailable = organizationAvailable && isPublicSubscriptionStatus(detail.controls.status) && detail.controls.isPublic;
  const editStatus = (next: PlatformGymDetail["controls"]["status"]) => {
    if (!organizationAvailable) return;
    editing.current = true;
    setStatus(next);
    if (!isPublicSubscriptionStatus(next)) setIsPublic(false);
  };
  const saveControls = () => {
    if (!detail || !organizationAvailable || !status || !plan) return;
    update.mutate();
  };
  const protectNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (dirty && !window.confirm("Discard the unsaved subscription changes?")) event.preventDefault();
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <Link href="/platform/gyms" onClick={protectNavigation} className="inline-flex items-center gap-2 text-[11.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" />All gyms</Link>

        {detailQuery.isBackgroundError || detailQuery.streamState === "fallback" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning-deep" role="status" aria-live="polite">
            <span>Showing the last known gym record while the live connection recovers.</span>
            <Button variant="secondary" size="sm" onClick={() => detailQuery.refetch()}>Retry</Button>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center font-mono text-[11px] font-semibold text-white" style={{ backgroundColor: detail.accent }}>{detail.shortName.slice(0, 3)}</span>
            <div>
              <h1 className="text-[27px] font-semibold tracking-tight">{detail.name}</h1>
              <p className="mt-1 text-[11.5px] text-ink-3">Customer since <FieldValue field={detail.joinedAt} render={(value) => value.slice(0, 10)} /></p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {marketplaceProfileAvailable ? <Button asChild variant="secondary"><Link href={`/customer/gyms/${detail.id}`} onClick={protectNavigation}>Marketplace profile <ExternalLink /></Link></Button> : <Button variant="secondary" disabled title="This gym is hidden from public discovery">Marketplace profile unavailable <ExternalLink /></Button>}
            <Button variant={statusAction.next === "active" ? "primary" : "danger"} onClick={() => editStatus(statusAction.next)} disabled={!organizationAvailable} title={!organizationAvailable ? "Subscription controls are unavailable until this gym is provisioned" : undefined}><Ban />{statusAction.label}</Button>
          </div>
        </div>

        <section className="mt-5 border border-line bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">Platform controls</p><h2 className="mt-1 text-[17px] font-semibold">Subscription state</h2><p className="mt-1 text-[11.5px] text-ink-3">{organizationAvailable ? "Changes update the tenant record, public directory state, and immutable platform audit trail." : "This directory row is retained for audit and cleanup, but is not linked to a provisioned tenant. Subscription changes are unavailable."}</p></div>
            <Button variant="signal" onClick={saveControls} loading={update.isPending} disabled={!organizationAvailable || !dirty || !status || !plan || !reason.trim()}><Check />Save controls</Button>
          </div>
          {!organizationAvailable ? <div className="mt-4 flex items-start gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning-deep" role="status"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Cleanup-only record: no provisioned organization is linked, so plan, status, lifecycle dates, public visibility, and save actions are disabled. Use the applications/provisioning workflow to resolve this record.</p></div> : null}
          {dirty ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning-bg px-4 py-3 text-[11.5px] text-warning" role="status"><span><strong>Unsaved changes.</strong> Add a reason, then save to apply and audit them.</span><Button variant="secondary" size="sm" onClick={cancelDraft}>Cancel changes</Button></div> : null}
          <fieldset disabled={!organizationAvailable} className="mt-5 min-w-0">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1.5 text-[12px] font-medium">Plan<Select value={plan ?? ""} onValueChange={(value) => edit(setPlan, value as PlatformGymDetail["controls"]["plan"])}><SelectTrigger aria-label="Gym plan" disabled={!organizationAvailable}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Starter">Starter</SelectItem><SelectItem value="Growth">Growth</SelectItem><SelectItem value="Pro">Pro</SelectItem><SelectItem value="Enterprise">Enterprise</SelectItem></SelectContent></Select></label>
              <label className="grid gap-1.5 text-[12px] font-medium">Subscription status<Select value={status ?? ""} onValueChange={(value) => editStatus(value as PlatformGymDetail["controls"]["status"])}><SelectTrigger aria-label="Subscription status" disabled={!organizationAvailable}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">Trial</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="overdue">Past due</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></label>
              <label className="grid gap-1.5 text-[12px] font-medium">Billing cadence<Select value={billingInterval} onValueChange={(value) => edit(setBillingInterval, value as BillingInterval)}><SelectTrigger aria-label="Billing cadence" disabled={!organizationAvailable}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Annual · saves 20%</SelectItem></SelectContent></Select></label>
            </div>
            <div className="mt-4 border border-line bg-sunken/60 px-4 py-3 text-[10.5px] leading-relaxed text-ink-2" role="note">
              <p className="flex items-start gap-2 font-medium"><CalendarClock className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />Subscription dates are server-owned. Trial starts from onboarding, ends on the fixed trial date, and the current period end is calculated from the selected plan and billing cadence.</p>
              <p className="mt-2 text-ink-3">Use status changes for access decisions; historical dates remain visible below and are never manually edited here.</p>
            </div>
            <label className="mt-4 grid gap-1.5 text-[12px] font-medium">Reason for this change<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable platform audit trail" disabled={!organizationAvailable} /></label>
            <div className="mt-4 flex items-start justify-between gap-4 border-t border-line pt-4">
              <div>
                <p className="text-[12px] font-medium">Public directory listing</p>
                <p className="mt-1 text-[10.5px] text-ink-3">{publicListingAllowed ? "Let members discover this gym and request a free trial." : organizationAvailable ? "Suppressed while this subscription is not active or in trial." : "Already suppressed because this directory row is not provisioned."}</p>
                {!publicListingAllowed ? <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-warning"><CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />{organizationAvailable ? "Save controls to persist this listing as hidden from public discovery." : "Complete the provisioning workflow before managing this listing; no save is available for cleanup-only rows."}</p> : null}
              </div>
              <Switch checked={publicListingAllowed && isPublic} onCheckedChange={(value) => edit(setIsPublic, value)} disabled={!organizationAvailable || !publicListingAllowed} aria-label="Public directory listing" />
            </div>
          </fieldset>
        </section>

        <section className="mt-5 flex flex-wrap items-center justify-between gap-4 border border-danger/30 bg-danger-bg p-5">
          <div>
            <p className="eyebrow text-danger">Danger zone</p>
            <h2 className="mt-1 text-[16px] font-semibold">Remove gym access</h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-danger">Archive this gym to remove workspace access and public discovery. Financial records, subscription facts, and the platform audit trail are retained.</p>
          </div>
          <Button variant="danger" onClick={() => { setDeleteError(undefined); setDeleteConfirmation(""); setDeleteReason(""); setDeleteOpen(true); }}><Trash2 />Delete gym</Button>
        </section>

        <Dialog open={deleteOpen} onOpenChange={(open) => { if (!archive.isPending) setDeleteOpen(open); }}>
          <DialogHeader>
            <DialogTitle>Delete {detail.name}?</DialogTitle>
            <DialogDescription>This archives the gym from RIVET. Access and public discovery are removed, while financial and audit history is retained.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="delete-gym-confirmation">Type the gym name to confirm<Input id="delete-gym-confirmation" value={deleteConfirmation} onChange={(event) => { setDeleteConfirmation(event.target.value); setDeleteError(undefined); }} placeholder={detail.name} autoComplete="off" /></label>
            <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="delete-gym-reason">Reason for deletion<Textarea id="delete-gym-reason" value={deleteReason} onChange={(event) => { setDeleteReason(event.target.value); setDeleteError(undefined); }} placeholder="Required for the platform audit trail" /></label>
            {deleteConfirmation.length > 0 && deleteConfirmation !== detail.name ? <p className="text-[10.5px] text-danger" role="alert">The confirmation must match “{detail.name}” exactly.</p> : null}
            {deleteError ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger" role="alert">{deleteError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={archive.isPending}>Cancel</Button>
            <Button variant="danger" loading={archive.isPending} disabled={deleteConfirmation !== detail.name || !deleteReason.trim()} onClick={() => archive.mutate({ gymId, confirmation: deleteConfirmation, reason: deleteReason.trim() })}><Trash2 />Delete gym</Button>
          </DialogFooter>
        </Dialog>

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
                <FactRow label="Billing cadence"><FieldValue field={detail.subscription.billingInterval ?? { state: "not_configured" }} render={billingIntervalLabel} /></FactRow>
                <FactRow label="Status"><FieldValue field={detail.subscription.status} render={statusLabel} /></FactRow>
                <FactRow label="Started"><FieldValue field={detail.subscription.startedAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Trial ends"><FieldValue field={detail.subscription.trialEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Period ends"><FieldValue field={detail.subscription.currentPeriodEndsAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Cancelled"><FieldValue field={detail.subscription.cancelledAt} render={(value) => formatDateTime(value)} /></FactRow>
                <FactRow label="Last change reason"><FieldValue field={detail.subscription.statusReason} /></FactRow>
                <FactRow label="Recurring amount"><FieldValue field={detail.subscription.recurringAmount} render={(value) => formatMoney(value)} /></FactRow>
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

function isPublicSubscriptionStatus(status: PlatformGymDetail["controls"]["status"] | undefined): boolean {
  return status === "active" || status === "trial";
}

function normalizePublicListing(isPublic: boolean, status: PlatformGymDetail["controls"]["status"] | undefined): boolean {
  return isPublic && isPublicSubscriptionStatus(status);
}

export function subscriptionDraftIsDirty(
  detail: PlatformGymDetail,
  draft: {
    status: PlatformGymDetail["controls"]["status"] | undefined;
    plan: PlatformGymDetail["controls"]["plan"] | undefined;
    billingInterval: BillingInterval;
    isPublic: boolean;
  },
): boolean {
  return draft.status !== detail.controls.status
    || draft.plan !== detail.controls.plan
    || draft.billingInterval !== readBillingInterval(detail.subscription.billingInterval)
    || draft.isPublic !== detail.controls.isPublic;
}

function readBillingInterval(field: PlatformGymDetail["subscription"]["billingInterval"]): BillingInterval {
  return field?.state === "available" ? field.value : "monthly";
}

function billingIntervalLabel(value: BillingInterval): string {
  return value === "annual" ? "Annual · saves 20%" : "Monthly";
}

function Usage({ icon, label, field }: { icon: React.ReactNode; label: string; field: PlatformData<number | string> }) {
  return <div className="bg-surface p-4"><span className="text-ink-3 [&_svg]:size-3.5">{icon}</span><p className="mt-4 font-mono text-[7.5px] uppercase tracking-[.1em] text-ink-3">{label}</p><p className="mt-1 text-[12px] font-semibold"><FieldValue field={field} render={(value) => typeof value === "number" ? value.toLocaleString() : value} /></p></div>;
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-night-line/60 pb-2.5"><dt className="text-night-ink-3">{label}</dt><dd className="text-end font-medium">{children}</dd></div>;
}
