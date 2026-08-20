"use client";

import { ArrowLeft, Ban, Building2, CalendarClock, Check, CircleAlert, CreditCard, ExternalLink, Mail, MapPin, Phone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import type { PlatformData, PlatformGymDetail } from "@/lib/api/GymOSApi";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input, Textarea } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

type LifecycleField = "trialEndsAt" | "subscriptionStartedAt" | "currentPeriodEndsAt" | "cancelledAt";
type LifecycleErrors = Partial<Record<LifecycleField, string>>;

export default function GymAdminDetail({ gymId }: { gymId: string }) {
  const detailQuery = useRealtimeApiQuery({ queryKey: qk.platformGymDetail(gymId), query: (api) => api.getPlatformGymDetail(gymId), subscribe: (api, onValue, onError) => api.subscribePlatformGymDetail(gymId, onValue, onError), enabled: Boolean(gymId) });
  const invalidate = useInvalidate();
  const detail = detailQuery.data;
  const organizationAvailable = detail?.organization.state === "available";
  const [status, setStatus] = useState<PlatformGymDetail["controls"]["status"]>();
  const [plan, setPlan] = useState<PlatformGymDetail["controls"]["plan"]>();
  const [isPublic, setIsPublic] = useState(false);
  const [trialEndsAt, setTrialEndsAt] = useState("");
  const [subscriptionStartedAt, setSubscriptionStartedAt] = useState("");
  const [currentPeriodEndsAt, setCurrentPeriodEndsAt] = useState("");
  const [cancelledAt, setCancelledAt] = useState("");
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LifecycleErrors>({});
  const editing = useRef(false);

  useEffect(() => {
    if (!detail || editing.current) return;
    setStatus(detail.controls.status);
    setPlan(detail.controls.plan);
    setIsPublic(detail.organization.state === "available" && normalizePublicListing(detail.controls.isPublic, detail.controls.status));
    setTrialEndsAt(dateInputValue(detail.subscription.trialEndsAt));
    setSubscriptionStartedAt(dateInputValue(detail.subscription.startedAt));
    setCurrentPeriodEndsAt(dateInputValue(detail.subscription.currentPeriodEndsAt));
    setCancelledAt(detail.controls.status === "cancelled" ? dateInputValue(detail.subscription.cancelledAt) : "");
    setFieldErrors({});
  }, [detail]);

  const dirty = detail && organizationAvailable ? subscriptionDraftIsDirty(detail, {
    status,
    plan,
    isPublic,
    trialEndsAt,
    subscriptionStartedAt,
    currentPeriodEndsAt,
    cancelledAt,
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
    return api.updatePlatformGym({ gymId, status, plan, isPublic: normalizePublicListing(isPublic, status), trialEndsAt: trialEndsAt || undefined, subscriptionStartedAt: subscriptionStartedAt || undefined, currentPeriodEndsAt: currentPeriodEndsAt || undefined, cancelledAt: status === "cancelled" ? cancelledAt || undefined : undefined, reason: reason.trim() });
  }, {
    onSuccess: async () => {
      editing.current = false;
      await invalidate([qk.platformGymDetail(gymId)]);
      setReason("");
      setFieldErrors({});
      toast.success("Gym subscription controls saved and audited.");
    },
    onError: (error) => {
      if (!isApiError(error) || !error.fieldErrors) return;
      setFieldErrors(lifecycleErrorsFromApi(error.fieldErrors));
    },
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
    setIsPublic(detail.organization.state === "available" && detail.controls.isPublic);
    setTrialEndsAt(dateInputValue(detail.subscription.trialEndsAt));
    setSubscriptionStartedAt(dateInputValue(detail.subscription.startedAt));
    setCurrentPeriodEndsAt(dateInputValue(detail.subscription.currentPeriodEndsAt));
    setCancelledAt(detail.controls.status === "cancelled" ? dateInputValue(detail.subscription.cancelledAt) : "");
    setReason("");
    setFieldErrors({});
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
    if (next !== "cancelled") setCancelledAt("");
    setFieldErrors({});
  };
  const editLifecycleDate = (field: LifecycleField, setter: (value: string) => void, value: string) => {
    edit(setter, value);
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const saveControls = () => {
    if (!detail || !organizationAvailable || !status || !plan) return;
    const nextErrors = validateSubscriptionDraft(detail, {
      status,
      trialEndsAt,
      subscriptionStartedAt,
      currentPeriodEndsAt,
      cancelledAt,
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
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
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-medium">Plan<Select value={plan ?? ""} onValueChange={(value) => edit(setPlan, value as PlatformGymDetail["controls"]["plan"])}><SelectTrigger aria-label="Gym plan" disabled={!organizationAvailable}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Starter">Starter</SelectItem><SelectItem value="Growth">Growth</SelectItem><SelectItem value="Pro">Pro</SelectItem><SelectItem value="Enterprise">Enterprise</SelectItem></SelectContent></Select></label>
              <label className="grid gap-1.5 text-[12px] font-medium">Subscription status<Select value={status ?? ""} onValueChange={(value) => editStatus(value as PlatformGymDetail["controls"]["status"])}><SelectTrigger aria-label="Subscription status" disabled={!organizationAvailable}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="trial">Trial</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="overdue">Past due</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LifecycleInput id="gym-trial-ends" label="Trial ends" value={trialEndsAt} onChange={(value) => editLifecycleDate("trialEndsAt", setTrialEndsAt, value)} error={fieldErrors.trialEndsAt} disabled={!organizationAvailable} />
              <LifecycleInput id="gym-subscription-started" label="Subscription started" value={subscriptionStartedAt} onChange={(value) => editLifecycleDate("subscriptionStartedAt", setSubscriptionStartedAt, value)} error={fieldErrors.subscriptionStartedAt} disabled={!organizationAvailable} />
              <LifecycleInput id="gym-current-period-ends" label="Current period ends" value={currentPeriodEndsAt} onChange={(value) => editLifecycleDate("currentPeriodEndsAt", setCurrentPeriodEndsAt, value)} error={fieldErrors.currentPeriodEndsAt} disabled={!organizationAvailable} />
              <LifecycleInput id="gym-cancelled-on" label="Cancelled on" value={cancelledAt} onChange={(value) => editLifecycleDate("cancelledAt", setCancelledAt, value)} error={fieldErrors.cancelledAt} disabled={!organizationAvailable || draftStatus !== "cancelled"} />
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

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="RIVET plan" value={<FieldValue field={detail.subscription.plan} />} detail={<FieldValue field={detail.subscription.status} render={statusLabel} />} />
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

function dateInputValue(field: PlatformData<string>): string {
  return field.state === "available" ? field.value.slice(0, 10) : "";
}

function LifecycleInput({ id, label, value, onChange, error, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean }) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1.5 text-[12px] font-medium">
      <label htmlFor={id}>{label}</label>
      <Input id={id} type="date" dir="ltr" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} />
      {error ? <p id={errorId} role="alert" className="text-[10.5px] font-normal text-danger">{error}</p> : null}
    </div>
  );
}

function parseLifecycleTimestamp(value: string): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const datePrefix = normalized.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    const dateOnlyTimestamp = Date.parse(`${datePrefix}T00:00:00.000Z`);
    if (!Number.isFinite(dateOnlyTimestamp) || new Date(dateOnlyTimestamp).toISOString().slice(0, 10) !== datePrefix) return undefined;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function lifecycleErrorsFromApi(fieldErrors: Record<string, string[]>): LifecycleErrors {
  return {
    trialEndsAt: fieldErrors.trialEndsAt?.[0],
    subscriptionStartedAt: fieldErrors.subscriptionStartedAt?.[0],
    currentPeriodEndsAt: fieldErrors.currentPeriodEndsAt?.[0],
    cancelledAt: fieldErrors.cancelledAt?.[0],
  };
}

export function validateSubscriptionDraft(
  detail: PlatformGymDetail,
  draft: Pick<{
    status: PlatformGymDetail["controls"]["status"];
    trialEndsAt: string;
    subscriptionStartedAt: string;
    currentPeriodEndsAt: string;
    cancelledAt: string;
  }, "status" | LifecycleField>,
  now = Date.now(),
): LifecycleErrors {
  const errors: LifecycleErrors = {};
  const values: Record<LifecycleField, string> = {
    trialEndsAt: draft.trialEndsAt || dateInputValue(detail.subscription.trialEndsAt),
    subscriptionStartedAt: draft.subscriptionStartedAt || dateInputValue(detail.subscription.startedAt),
    currentPeriodEndsAt: draft.currentPeriodEndsAt || dateInputValue(detail.subscription.currentPeriodEndsAt),
    cancelledAt: draft.status === "cancelled" ? draft.cancelledAt || dateInputValue(detail.subscription.cancelledAt) : draft.cancelledAt,
  };
  const parsed: Partial<Record<LifecycleField, number>> = {};
  for (const field of Object.keys(values) as LifecycleField[]) {
    if (!values[field]) continue;
    const timestamp = parseLifecycleTimestamp(values[field]);
    if (timestamp === undefined) errors[field] = "Enter a valid date";
    else parsed[field] = timestamp;
  }
  if (Object.keys(errors).length > 0) return errors;

  if (parsed.cancelledAt !== undefined && draft.status !== "cancelled") {
    errors.cancelledAt = "Only valid for cancelled subscriptions";
  }
  const statusTransitioned = draft.status !== detail.controls.status;
  const nextSubscriptionStartedAt = parsed.subscriptionStartedAt ?? ((statusTransitioned && (draft.status === "trial" || draft.status === "active")) ? now : undefined);
  const nextTrialEndsAt = parsed.trialEndsAt;
  const nextCurrentPeriodEndsAt = parsed.currentPeriodEndsAt;
  const nextCancelledAt = draft.status === "cancelled" ? parsed.cancelledAt ?? now : undefined;
  if (draft.status === "trial" && nextTrialEndsAt === undefined && !errors.trialEndsAt) {
    errors.trialEndsAt = "Required for trials";
  }
  if (draft.status === "trial" && nextTrialEndsAt !== undefined && nextTrialEndsAt <= now && !errors.trialEndsAt) {
    errors.trialEndsAt = "Must be in the future";
  }
  if (nextSubscriptionStartedAt !== undefined && nextTrialEndsAt !== undefined && nextTrialEndsAt < nextSubscriptionStartedAt && !errors.trialEndsAt) {
    errors.trialEndsAt = "Must be on or after the start date";
  }
  if (nextSubscriptionStartedAt !== undefined && nextCurrentPeriodEndsAt !== undefined && nextCurrentPeriodEndsAt < nextSubscriptionStartedAt && !errors.currentPeriodEndsAt) {
    errors.currentPeriodEndsAt = "Must be on or after the start date";
  }
  if (nextCancelledAt !== undefined && nextSubscriptionStartedAt !== undefined && nextCancelledAt < nextSubscriptionStartedAt && !errors.cancelledAt) {
    errors.cancelledAt = "Must be on or after the start date";
  }
  return errors;
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
    isPublic: boolean;
    trialEndsAt: string;
    subscriptionStartedAt: string;
    currentPeriodEndsAt: string;
    cancelledAt: string;
  },
): boolean {
  return draft.status !== detail.controls.status
    || draft.plan !== detail.controls.plan
    || draft.isPublic !== detail.controls.isPublic
    || draft.trialEndsAt !== dateInputValue(detail.subscription.trialEndsAt)
    || draft.subscriptionStartedAt !== dateInputValue(detail.subscription.startedAt)
    || draft.currentPeriodEndsAt !== dateInputValue(detail.subscription.currentPeriodEndsAt)
    || draft.cancelledAt !== dateInputValue(detail.subscription.cancelledAt);
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
