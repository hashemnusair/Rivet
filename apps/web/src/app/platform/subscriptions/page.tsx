"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import type { PlatformSaasPlan, UpdatePlatformGymInput } from "@/lib/api/GymOSApi";
import { useExperience, usePlatformGyms } from "@/lib/providers/experience-provider";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { formatMoney } from "@/lib/utils/money";
import { dateInputValue, validateSubscriptionLifecycle } from "@/lib/utils/subscription-lifecycle";

export { dateInputValue, validateSubscriptionLifecycle } from "@/lib/utils/subscription-lifecycle";

type SubscriptionStatus = MarketplaceGym["subscriptionStatus"];
type GymPlan = MarketplaceGym["rivetPlan"];
/** The platform plan endpoint records a reason for every catalog mutation. */
type PlanUpdateInput = {
  name: PlatformSaasPlan["name"];
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  reason: string;
};

export interface SubscriptionDraft {
  plan: GymPlan;
  status: SubscriptionStatus;
  isPublic: boolean;
  trialEndsAt: string;
  subscriptionStartedAt: string;
  currentPeriodEndsAt: string;
  cancelledAt: string;
  reason: string;
}

export type SubscriptionDraftErrors = Partial<Record<keyof SubscriptionDraft, string>>;

const PLAN_NAMES: GymPlan[] = ["Starter", "Growth", "Pro", "Enterprise"];
const STATUS_NAMES: SubscriptionStatus[] = ["trial", "active", "overdue", "suspended", "cancelled"];

/** Public discovery is only valid for an active or trial subscription. */
export function directoryListingAllowed(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trial";
}

export function statusLabel(status: SubscriptionStatus): string {
  return status === "overdue" ? "Past due" : status.replaceAll("_", " ");
}

/**
 * Cancellation is only meaningful while a tenant is cancelled.  Older
 * records can retain a cancellation timestamp after a status transition, so
 * do not hydrate or compare that stale value as an active subscription field.
 */
function effectiveCancelledAt(status: SubscriptionStatus, value?: string): string {
  return status === "cancelled" ? dateInputValue(value) : "";
}

/** A missing platform flag is fail-closed; only an explicit true is public. */
function persistedIsPublic(gym: MarketplaceGym): boolean {
  return gym.isPublic === true;
}

function effectiveIsPublic(gym: MarketplaceGym): boolean {
  return directoryListingAllowed(gym.subscriptionStatus) && persistedIsPublic(gym);
}

/**
 * Legacy snapshots may predate the platform linkage field, so absence keeps
 * the existing operator workflow intact. The explicit false projection is the
 * authoritative cleanup-only state for rows without a tenant.
 */
function canManageGym(gym: MarketplaceGym): boolean {
  return gym.isProvisioned !== false;
}

export function draftFromGym(gym: MarketplaceGym): SubscriptionDraft {
  return {
    plan: gym.rivetPlan,
    status: gym.subscriptionStatus,
    // A non-operational lifecycle status must never be re-published from this
    // UI, even if an old record still has isPublic=true.
    isPublic: effectiveIsPublic(gym),
    trialEndsAt: dateInputValue(gym.trialEndsAt),
    subscriptionStartedAt: dateInputValue(gym.subscriptionStartedAt),
    currentPeriodEndsAt: dateInputValue(gym.currentPeriodEndsAt),
    cancelledAt: effectiveCancelledAt(gym.subscriptionStatus, gym.cancelledAt),
    reason: "",
  };
}

/** Client-side checks mirror the API lifecycle contract before confirmation. */
export function validateSubscriptionDraft(draft: SubscriptionDraft): SubscriptionDraftErrors {
  const errors: SubscriptionDraftErrors = { ...validateSubscriptionLifecycle(draft) };
  if (!draft.plan) errors.plan = "Choose a plan.";
  if (!draft.status) errors.status = "Choose a subscription status.";
  if (!draft.reason.trim()) errors.reason = "A reason is required for the audit trail.";
  else if (draft.reason.trim().length < 3) errors.reason = "Use at least 3 characters so the audit trail is meaningful.";
  return errors;
}

function draftHasChanges(gym: MarketplaceGym, draft: SubscriptionDraft): boolean {
  return draft.plan !== gym.rivetPlan
    || draft.status !== gym.subscriptionStatus
    // Compare against the persisted flag, not the status-normalized display
    // value, so a stale true flag on a suspended/cancelled record can be
    // repaired and audited as an explicit hidden update.
    || draft.isPublic !== persistedIsPublic(gym)
    || draft.trialEndsAt !== dateInputValue(gym.trialEndsAt)
    || draft.subscriptionStartedAt !== dateInputValue(gym.subscriptionStartedAt)
    || draft.currentPeriodEndsAt !== dateInputValue(gym.currentPeriodEndsAt)
    || draft.cancelledAt !== effectiveCancelledAt(gym.subscriptionStatus, gym.cancelledAt);
}

function lifecycleConsequences(gym: MarketplaceGym, draft: SubscriptionDraft): string[] {
  const consequences: string[] = [];
  if (draft.plan !== gym.rivetPlan) {
    consequences.push(`The tenant's RIVET plan changes from ${gym.rivetPlan} to ${draft.plan}; plan limits and enabled modules may change.`);
  }
  if (draft.status !== gym.subscriptionStatus) {
    if (draft.status === "suspended" || draft.status === "cancelled") {
      consequences.push("The tenant loses public discovery and new trial requests. Existing tenant records remain preserved.");
    } else if (draft.status === "overdue") {
      consequences.push("The tenant is marked past due and requires billing follow-up; no external card charge is attempted here.");
    } else if (draft.status === "active" || draft.status === "trial") {
      consequences.push("The tenant is eligible for operational access; public discovery still depends on the listing switch below.");
    }
  }
  if (draft.isPublic !== persistedIsPublic(gym)) {
    consequences.push(draft.isPublic ? "The gym will appear in member discovery and can receive trial requests." : "The gym will be hidden from member discovery; its tenant data and subscription remain intact.");
  }
  if (draft.trialEndsAt !== dateInputValue(gym.trialEndsAt) || draft.subscriptionStartedAt !== dateInputValue(gym.subscriptionStartedAt) || draft.currentPeriodEndsAt !== dateInputValue(gym.currentPeriodEndsAt) || draft.cancelledAt !== effectiveCancelledAt(gym.subscriptionStatus, gym.cancelledAt)) {
    consequences.push("Lifecycle dates are persisted on the tenant record and included in the platform audit event.");
  }
  if (consequences.length === 0) consequences.push("No subscription fields have changed yet.");
  return consequences;
}

export default function SubscriptionsPage() {
  const gyms = usePlatformGyms();
  const { platformSnapshot, experienceError, experienceStatus, retryExperience } = useExperience();
  const sourceGyms = platformSnapshot?.gyms ?? gyms;
  const [customerGyms, setCustomerGyms] = useState<MarketplaceGym[]>(sourceGyms);
  const [plans, setPlans] = useState<PlatformSaasPlan[]>(platformSnapshot?.plans ?? []);
  const [selectedGymId, setSelectedGymId] = useState("");
  const [editingGym, setEditingGym] = useState<MarketplaceGym>();
  const [editingPlan, setEditingPlan] = useState<PlatformSaasPlan | null>(null);
  const invalidate = useInvalidate();

  useEffect(() => setCustomerGyms(sourceGyms), [sourceGyms]);
  useEffect(() => setPlans(platformSnapshot?.plans ?? []), [platformSnapshot?.plans]);

  const selectedGym = customerGyms.find((gym) => gym.id === selectedGymId);
  const trialGyms = customerGyms.filter((gym) => gym.subscriptionStatus === "trial");
  const pastDueCount = platformSnapshot?.overview?.gymCounts.past_due ?? customerGyms.filter((gym) => gym.subscriptionStatus === "overdue").length;
  const activeMrr = platformSnapshot?.overview?.activeMrr ?? {
    amount: customerGyms.filter((gym) => gym.subscriptionStatus === "active").reduce((total, gym) => total + (plans.find((plan) => plan.name === gym.rivetPlan)?.priceMinor ?? 0), 0),
    currency: "JOD",
  };

  const refreshSnapshot = async () => {
    try {
      const snapshot = await getApi().getPlatformSnapshot();
      setCustomerGyms(snapshot.gyms);
      setPlans(snapshot.plans);
    } catch {
      // The mutation response is already rendered locally; retain it if the
      // follow-up snapshot refresh is temporarily unavailable.
    }
  };

  const updateGym = useApiMutation((api, input: UpdatePlatformGymInput) => api.updatePlatformGym(input), {
    onSuccess: async (updated) => {
      setCustomerGyms((current) => current.map((gym) => gym.id === updated.id ? updated : gym));
      toast.success(`${updated.name} subscription updated and audited.`);
      await invalidate([qk.platformGymDetail(updated.id)]);
      await refreshSnapshot();
      setEditingGym(undefined);
    },
  });

  const updatePlan = useApiMutation((api, input: PlanUpdateInput) => api.updatePlatformPlan(input), {
    onSuccess: async (updated) => {
      setPlans((current) => current.map((plan) => plan.name === updated.name ? updated : plan));
      toast.success(`${updated.name} plan updated and audited.`);
      await refreshSnapshot();
      setEditingPlan(null);
    },
  });

  const openEditor = (gym: MarketplaceGym) => {
    if (!canManageGym(gym)) return;
    setSelectedGymId(gym.id);
    updateGym.reset();
    // Keep a stable baseline while the dialog is open. Background snapshot
    // refreshes may replace the row object, but must never reset an operator's
    // unsaved draft or audit reason.
    setEditingGym(gym);
  };

  const loading = !platformSnapshot && customerGyms.length === 0 && experienceStatus === "loading";
  const failed = !platformSnapshot && customerGyms.length === 0 && experienceStatus === "error";

  if (failed) {
    return <div className="px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1480px]"><ErrorState title="Subscriptions unavailable" description={experienceError ?? "The platform subscription snapshot could not be loaded."} onRetry={retryExperience} /></div></div>;
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Commercial operations</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Subscriptions</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] text-ink-2">Manage each gym&apos;s plan, lifecycle, and directory visibility from one audited control surface.</p>
          </div>
          <div className="border border-warning/30 bg-warning-bg px-3 py-2 text-[10.5px] text-warning-deep" role="note">
            <p className="flex items-center gap-1.5 font-medium"><ShieldAlert className="size-3.5" aria-hidden /> Sensitive tenant controls</p>
            <p className="mt-1 max-w-[280px]">Every change requires a reason and is written to the platform audit trail.</p>
          </div>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          <Kpi label="Active MRR" value={formatMoney(activeMrr)} detail={`${platformSnapshot?.overview?.gymCounts.active ?? customerGyms.filter((gym) => gym.subscriptionStatus === "active").length} active customer accounts`} icon={<BadgeDollarSign />} />
          <Kpi label="Trial pipeline" value={formatMoney({ amount: trialGyms.reduce((total, gym) => total + (plans.find((plan) => plan.name === gym.rivetPlan)?.priceMinor ?? 0), 0), currency: "JOD" })} detail={`${trialGyms.length} trial account${trialGyms.length === 1 ? "" : "s"}`} icon={<Clock3 />} />
          <Kpi label="Past due" value={String(pastDueCount)} detail="Accounts requiring billing follow-up" icon={<CircleAlert />} />
        </section>

        <section className="mt-5 border border-line bg-surface p-5" aria-labelledby="manage-subscription-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Tenant controls</p>
              <h2 id="manage-subscription-title" className="mt-1 text-[17px] font-semibold">Manage a gym subscription</h2>
              <p className="mt-1 max-w-2xl text-[11.5px] text-ink-3">Choose a gym to update its plan, status, lifecycle dates, or public directory listing. Suspended, past-due, and cancelled gyms stay hidden from discovery.</p>
            </div>
            {selectedGym ? <div className="flex flex-wrap items-center gap-2"><DirectoryBadge gym={selectedGym} />{selectedGym.isProvisioned === false ? <CleanupOnlyBadge /> : null}</div> : null}
          </div>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Gym to manage" required hint="Only platform administrators can apply these changes.">
              <Select value={selectedGymId} onValueChange={setSelectedGymId} disabled={loading || customerGyms.length === 0}>
                <SelectTrigger aria-label="Gym to manage"><SelectValue placeholder={loading ? "Loading gyms…" : "Choose a gym"} /></SelectTrigger>
                <SelectContent>{customerGyms.map((gym) => <SelectItem key={gym.id} value={gym.id} disabled={gym.isProvisioned === false}>{gym.name} · {gym.isProvisioned === false ? "Cleanup-only · not provisioned" : statusLabel(gym.subscriptionStatus)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Button variant="signal" disabled={!selectedGym || !canManageGym(selectedGym)} onClick={() => selectedGym && openEditor(selectedGym)}><Pencil /> Edit subscription</Button>
          </div>
          {selectedGym ? <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-[10.5px] text-ink-3"><span><strong className="text-ink">{selectedGym.rivetPlan}</strong> plan</span><span>{selectedGym.memberCount.toLocaleString()} members · {selectedGym.branchCount} branch{selectedGym.branchCount === 1 ? "" : "es"}</span><span>{selectedGym.isProvisioned === false ? "Cleanup-only record; no provisioned tenant is linked." : selectedGym.subscriptionStatusReason ? `Last reason: ${selectedGym.subscriptionStatusReason}` : "No prior change reason recorded"}</span></div> : null}
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.8fr]">
          <section className="overflow-x-auto border border-line bg-surface" aria-labelledby="current-subscriptions-title">
            <div className="border-b border-line px-5 py-4"><p className="eyebrow">Customer plans</p><h2 id="current-subscriptions-title" className="mt-1 text-[17px] font-semibold">Current subscriptions</h2><p className="mt-1 text-[10.5px] text-ink-3">Suspended and past-due tenants remain visible here for operators, but never as member-facing listings.</p></div>
            {loading ? <div className="px-5 py-10 text-center text-[12px] text-ink-3" role="status">Loading subscriptions…</div> : customerGyms.length === 0 ? <EmptyState compact title="No gyms found" description="There are no tenant subscriptions in the platform directory." /> : <table className="w-full min-w-[820px] text-start"><thead><tr className="border-b border-line bg-sunken text-start font-mono text-[8px] uppercase tracking-[.1em] text-ink-3"><th className="px-5 py-3 font-medium">Gym</th><th className="px-4 py-3 font-medium">Plan</th><th className="px-4 py-3 font-medium">Persisted directory</th><th className="px-4 py-3 font-medium">External billing</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody>{customerGyms.map((gym) => <tr key={gym.id} className="border-b border-line last:border-b-0"><td className="px-5 py-4"><p className="text-[12.5px] font-semibold">{gym.name}</p><p className="mt-1 text-[9.5px] text-ink-3">{gym.branchCount} branch{gym.branchCount > 1 ? "es" : ""} · {gym.memberCount.toLocaleString()} members</p>{gym.isProvisioned === false ? <p className="mt-1 flex items-center gap-1 text-[9.5px] font-medium text-warning-deep"><ShieldAlert className="size-3" aria-hidden />Cleanup-only · no tenant linked</p> : null}</td><td className="px-4 py-4 text-[11.5px]">{gym.rivetPlan}</td><td className="px-4 py-4"><DirectoryBadge gym={gym} /></td><td className="px-4 py-4 text-[11px] text-ink-3">Not configured</td><td className="px-4 py-4"><div className="grid gap-1.5"><StatusBadge status={gym.subscriptionStatus} />{gym.subscriptionStatusReason ? <span className="max-w-[170px] truncate text-[9px] text-ink-3" title={gym.subscriptionStatusReason}>{gym.subscriptionStatusReason}</span> : null}</div></td><td className="px-4 py-4"><div className="flex items-center gap-1">{gym.isProvisioned === false ? <Button variant="secondary" size="sm" disabled title="This directory row has no provisioned tenant to manage." aria-label={`Cleanup-only ${gym.name}`}><ShieldAlert /> Cleanup-only</Button> : <Button variant="secondary" size="sm" onClick={() => openEditor(gym)}><Pencil /> Manage</Button>}<Button asChild variant="ghost" size="icon-sm"><Link href={`/platform/gyms/${gym.id}`} aria-label={`Open ${gym.name} detail`}><ArrowRight /></Link></Button></div></td></tr>)}</tbody></table>}
          </section>

          <section className="border border-line bg-surface p-5" aria-labelledby="plan-catalog-title">
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Plan catalog</p><h2 id="plan-catalog-title" className="mt-1 text-[17px] font-semibold">Published pricing</h2></div><span className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Audited</span></div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">Catalog edits affect new assignments and tenant entitlements. They do not charge a card; external billing is not configured.</p>
            <div className="mt-5 grid gap-3">{plans.length === 0 ? <p className="border border-dashed border-line-2 px-4 py-6 text-center text-[11px] text-ink-3">Plan catalog is loading…</p> : plans.map((plan) => <div key={plan.name} className="border border-line p-4"><div className="flex items-center justify-between gap-3"><strong className="text-[13px]">{plan.name}</strong><div className="flex items-center gap-2"><span className="text-[13px] font-semibold">{formatMoney({ amount: plan.priceMinor, currency: "JOD" })}<small className="font-normal text-ink-3"> / mo</small></span><Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name} plan`} onClick={() => { updatePlan.reset(); setEditingPlan(plan); }}><Pencil /></Button></div></div><ul className="mt-3 grid gap-1.5 text-[9.5px] text-ink-3"><li className="flex items-center gap-1.5"><Check className="size-3 text-success" />{plan.branches} branches</li><li className="flex items-center gap-1.5"><Check className="size-3 text-success" />Up to {plan.members.toLocaleString()} members</li><li className="flex items-center gap-1.5"><Check className="size-3 text-success" />{plan.staff} staff seats</li></ul></div>)}</div>
          </section>
        </div>

        {editingGym ? <SubscriptionDialog gym={editingGym} plans={plans} open saving={updateGym.isPending} error={updateGym.error} onOpenChange={(open) => { if (!open && !updateGym.isPending) setEditingGym(undefined); }} onSave={(input) => updateGym.mutate(input)} /> : null}
        {editingPlan ? <PlanDialog plan={editingPlan} open saving={updatePlan.isPending} error={updatePlan.error} onOpenChange={(open) => { if (!open && !updatePlan.isPending) setEditingPlan(null); }} onSave={(input) => updatePlan.mutate(input)} /> : null}
      </div>
    </div>
  );
}

function SubscriptionDialog({ gym, plans, open, saving, error, onOpenChange, onSave }: { gym: MarketplaceGym; plans: PlatformSaasPlan[]; open: boolean; saving: boolean; error: Error | null; onOpenChange: (open: boolean) => void; onSave: (input: UpdatePlatformGymInput) => void }) {
  const [draft, setDraft] = useState<SubscriptionDraft>(() => draftFromGym(gym));
  const [errors, setErrors] = useState<SubscriptionDraftErrors>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDraft(draftFromGym(gym));
    setErrors({});
    setConfirming(false);
  }, [gym]);

  const setField = <K extends keyof SubscriptionDraft>(key: K, value: SubscriptionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const setStatus = (status: SubscriptionStatus) => {
    setDraft((current) => ({
      ...current,
      status,
      isPublic: directoryListingAllowed(status) ? current.isPublic : false,
      cancelledAt: status === "cancelled" ? current.cancelledAt : "",
    }));
    setErrors((current) => ({ ...current, status: undefined, cancelledAt: undefined }));
  };
  const allowed = directoryListingAllowed(draft.status);
  const dirty = draftHasChanges(gym, draft);
  const closeDialog = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard the unsaved subscription changes?")) return;
    setConfirming(false);
    onOpenChange(false);
  };
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    closeDialog();
  };
  const options = useMemo(() => {
    const known = new Set<string>(plans.map((plan) => plan.name));
    return [...PLAN_NAMES.filter((name) => known.has(name)), ...PLAN_NAMES.filter((name) => !known.has(name))];
  }, [plans]);
  const submit = () => {
    const nextErrors = validateSubscriptionDraft(draft);
    setErrors(nextErrors);
    if (!dirty || Object.keys(nextErrors).length > 0) return;
    setConfirming(true);
  };
  const payload: UpdatePlatformGymInput = {
    gymId: gym.id,
    plan: draft.plan,
    status: draft.status,
    isPublic: allowed && draft.isPublic,
    trialEndsAt: draft.trialEndsAt || undefined,
    subscriptionStartedAt: draft.subscriptionStartedAt || undefined,
    currentPeriodEndsAt: draft.currentPeriodEndsAt || undefined,
    ...(draft.status === "cancelled" && draft.cancelledAt ? { cancelledAt: draft.cancelledAt } : {}),
    reason: draft.reason.trim(),
  };

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{confirming ? "Confirm subscription change" : `Manage ${gym.name}`}</DialogTitle><DialogDescription>{confirming ? "Review the operational consequences before writing this change to the tenant record." : "Plan and lifecycle changes are audited. A reason is required before the API will accept the update."}</DialogDescription></DialogHeader>{confirming ? <><DialogBody className="grid gap-4"><div className="border border-warning/30 bg-warning-bg p-4" role="status"><p className="flex items-center gap-2 text-[12.5px] font-semibold text-warning-deep"><ShieldAlert className="size-4" aria-hidden />This change affects tenant access</p><ul className="mt-3 grid gap-2 text-[11.5px] leading-relaxed text-warning-deep">{lifecycleConsequences(gym, draft).map((consequence) => <li key={consequence} className="flex gap-2"><span aria-hidden>•</span><span>{consequence}</span></li>)}</ul></div><dl className="grid gap-2 border border-line bg-sunken p-4 text-[11.5px]"><SummaryRow label="Plan" value={`${gym.rivetPlan} → ${draft.plan}`} changed={draft.plan !== gym.rivetPlan} /><SummaryRow label="Status" value={`${statusLabel(gym.subscriptionStatus)} → ${statusLabel(draft.status)}`} changed={draft.status !== gym.subscriptionStatus} /><SummaryRow label="Directory" value={allowed && draft.isPublic ? "Visible to members" : "Hidden from members"} changed={draft.isPublic !== persistedIsPublic(gym)} /><SummaryRow label="Reason" value={draft.reason.trim()} /></dl>{error ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger" role="alert">{error.message || "The subscription change could not be saved. No changes were applied."}</p> : null}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>Back to edit</Button><Button variant={draft.status === "suspended" || draft.status === "cancelled" ? "danger" : "signal"} loading={saving} onClick={() => onSave(payload)}>{saving ? "Saving…" : "Confirm changes"}</Button></DialogFooter></> : <><DialogBody className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="RIVET plan" required error={errors.plan}><Select value={draft.plan} onValueChange={(value) => setField("plan", value as GymPlan)}><SelectTrigger aria-label="RIVET plan" aria-invalid={Boolean(errors.plan)}><SelectValue /></SelectTrigger><SelectContent>{options.map((name) => { const plan = plans.find((item) => item.name === name); return <SelectItem key={name} value={name}>{plan ? `${name} · ${formatMoney({ amount: plan.priceMinor, currency: "JOD" })}/mo` : name}</SelectItem>; })}</SelectContent></Select></Field><Field label="Subscription status" required error={errors.status}><Select value={draft.status} onValueChange={(value) => setStatus(value as SubscriptionStatus)}><SelectTrigger aria-label="Subscription status" aria-invalid={Boolean(errors.status)}><SelectValue /></SelectTrigger><SelectContent>{STATUS_NAMES.map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select></Field></div><div className="border border-line bg-sunken/60 p-3 text-[10.5px] leading-relaxed text-ink-2"><p className="flex items-start gap-2 font-medium"><CalendarClock className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />Lifecycle dates are optional unless starting a trial. Enter only dates that are known; existing values are retained by the API when left blank.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Trial ends" error={errors.trialEndsAt} hint={draft.status === "trial" ? "Required for trial status." : "Optional historical lifecycle date."}><Input type="date" dir="ltr" value={draft.trialEndsAt} onChange={(event) => setField("trialEndsAt", event.target.value)} aria-invalid={Boolean(errors.trialEndsAt)} /></Field><Field label="Subscription started" error={errors.subscriptionStartedAt}><Input type="date" dir="ltr" value={draft.subscriptionStartedAt} onChange={(event) => setField("subscriptionStartedAt", event.target.value)} aria-invalid={Boolean(errors.subscriptionStartedAt)} /></Field><Field label="Current period ends" error={errors.currentPeriodEndsAt}><Input type="date" dir="ltr" value={draft.currentPeriodEndsAt} onChange={(event) => setField("currentPeriodEndsAt", event.target.value)} aria-invalid={Boolean(errors.currentPeriodEndsAt)} /></Field><Field label="Cancelled on" error={errors.cancelledAt} hint={draft.status === "cancelled" ? "Leave blank to use the server timestamp." : "Enabled when a cancellation date is known."}><Input type="date" dir="ltr" value={draft.cancelledAt} onChange={(event) => setField("cancelledAt", event.target.value)} aria-invalid={Boolean(errors.cancelledAt)} disabled={draft.status !== "cancelled"} /></Field></div><div className="flex items-start justify-between gap-4 border border-line p-3"><div className="flex gap-2"><span className="mt-0.5 text-ink-3">{allowed && draft.isPublic ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}</span><div><p className="text-[12px] font-medium">Public directory listing</p><p className="mt-1 text-[10.5px] leading-relaxed text-ink-3">{allowed ? "Members can discover this gym and request a trial when enabled." : "Suspended, past-due, and cancelled gyms are always hidden from member discovery."}</p></div></div><Switch checked={allowed && draft.isPublic} disabled={!allowed} onCheckedChange={(checked) => setField("isPublic", checked)} aria-label="Public directory listing" /></div><Field label="Reason for this change" required error={errors.reason} hint="Written to the immutable platform audit trail."><textarea className="min-h-24 w-full resize-y rounded-md border border-line-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg/30" value={draft.reason} onChange={(event) => setField("reason", event.target.value)} placeholder="Explain why this subscription or visibility change is needed." aria-invalid={Boolean(errors.reason)} /></Field>{error ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger" role="alert">{error.message || "The subscription change could not be saved. No changes were applied."}</p> : null}</DialogBody><DialogFooter><Button variant="secondary" onClick={closeDialog} disabled={saving}>Cancel</Button><Button variant="signal" onClick={submit} disabled={!dirty}>{saving ? "Saving…" : "Review changes"}</Button></DialogFooter></>}</DialogContent></Dialog>;
}

function SummaryRow({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0 last:pb-0"><dt className="text-ink-3">{label}</dt><dd className={changed ? "font-semibold text-ink" : "text-ink-2"}>{value}{changed ? <span className="ms-1 text-[9px] uppercase tracking-[.08em] text-signal">changed</span> : null}</dd></div>;
}

function PlanDialog({ plan, open, onOpenChange, saving, error, onSave }: { plan: PlatformSaasPlan; open: boolean; onOpenChange: (open: boolean) => void; saving: boolean; error: Error | null; onSave: (input: PlanUpdateInput) => void }) {
  const [price, setPrice] = useState(String(plan.priceMinor / 1000));
  const [branches, setBranches] = useState(String(plan.branches));
  const [staff, setStaff] = useState(String(plan.staff));
  const [members, setMembers] = useState(String(plan.members));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  useEffect(() => { setPrice(String(plan.priceMinor / 1000)); setBranches(String(plan.branches)); setStaff(String(plan.staff)); setMembers(String(plan.members)); setReason(""); setErrors({}); }, [plan]);
  const submit = () => {
    const next: Record<string, string | undefined> = {};
    const amount = Number(price);
    const branchCount = Number(branches);
    const staffCount = Number(staff);
    const memberCount = Number(members);
    if (!reason.trim()) next.reason = "A reason is required for the audit trail.";
    else if (reason.trim().length < 3) next.reason = "Use at least 3 characters so the audit trail is meaningful.";
    if (!Number.isFinite(amount) || amount < 0) next.price = "Enter a non-negative price.";
    if (!Number.isSafeInteger(branchCount) || branchCount < 1) next.branches = "Use a whole number of at least 1.";
    if (!Number.isSafeInteger(staffCount) || staffCount < 1) next.staff = "Use a whole number of at least 1.";
    if (!Number.isSafeInteger(memberCount) || memberCount < 1) next.members = "Use a whole number of at least 1.";
    const priceMinor = Math.round(amount * 1000);
    if (Object.keys(next).length === 0 && priceMinor === plan.priceMinor && branchCount === plan.branches && staffCount === plan.staff && memberCount === plan.members) {
      next.changes = "Change at least one price or limit before saving.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({ name: plan.name, priceMinor, branches: branchCount, staff: staffCount, members: memberCount, reason: reason.trim() });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Edit {plan.name} plan</DialogTitle><DialogDescription>These limits appear in the public catalog and are recorded in the platform audit stream. This does not charge a card.</DialogDescription></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><Field label="Monthly price (JOD)" required error={errors.price}><Input value={price} onChange={(event) => { setPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined, changes: undefined })); }} inputMode="decimal" aria-invalid={Boolean(errors.price)} /></Field><Field label="Branches" required error={errors.branches}><Input value={branches} onChange={(event) => { setBranches(event.target.value); setErrors((current) => ({ ...current, branches: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.branches)} /></Field><Field label="Staff seats" required error={errors.staff}><Input value={staff} onChange={(event) => { setStaff(event.target.value); setErrors((current) => ({ ...current, staff: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.staff)} /></Field><Field label="Member capacity" required error={errors.members}><Input value={members} onChange={(event) => { setMembers(event.target.value); setErrors((current) => ({ ...current, members: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.members)} /></Field>{errors.changes ? <p className="text-[11.5px] text-danger sm:col-span-2" role="alert">{errors.changes}</p> : null}<Field label="Reason for this change" required error={errors.reason} hint="Written to the immutable platform audit trail." className="sm:col-span-2"><textarea className="min-h-20 w-full resize-y rounded-md border border-line-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg/30" value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); }} placeholder="Explain why the catalog limits or price are changing." aria-invalid={Boolean(errors.reason)} /></Field>{error ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger sm:col-span-2" role="alert">{error.message || "The plan could not be saved."}</p> : null}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={submit}>Save plan</Button></DialogFooter></DialogContent></Dialog>;
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const className = status === "active" ? "bg-success-bg text-success" : status === "suspended" || status === "cancelled" ? "bg-danger-bg text-danger" : status === "overdue" ? "bg-warning-bg text-warning" : "bg-info-bg text-info";
  return <span className={`inline-flex w-fit rounded-full px-2 py-1 font-mono text-[7.5px] uppercase tracking-[.08em] ${className}`}>{statusLabel(status)}</span>;
}

function DirectoryBadge({ gym }: { gym: MarketplaceGym }) {
  const visible = effectiveIsPublic(gym);
  return <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 font-mono text-[7.5px] uppercase tracking-[.08em] ${visible ? "bg-success-bg text-success" : "bg-warning-bg text-warning"}`}><span aria-hidden>{visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</span>{visible ? "Visible" : "Hidden"}</span>;
}

function CleanupOnlyBadge() {
  return <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-bg px-2 py-1 font-mono text-[7.5px] uppercase tracking-[.08em] text-warning"><ShieldAlert className="size-3" aria-hidden />Cleanup-only</span>;
}

function Kpi({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return <div className="border border-line bg-surface p-5"><span className="text-ink-3 [&_svg]:size-4">{icon}</span><p className="mt-6 font-mono text-[8px] uppercase tracking-[.11em] text-ink-3">{label}</p><p className="mt-2 text-[25px] font-semibold">{value}</p><p className="mt-1 text-[10px] text-ink-3">{detail}</p></div>;
}
