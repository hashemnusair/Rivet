"use client";

import { Check, Pencil, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/states";
import { useApiMutation } from "@/lib/hooks/use-api";
import { getApi } from "@/lib/api/client";
import type { PlatformSaasPlan, UpdatePlatformPlanInput } from "@/lib/api/GymOSApi";
import { entitledModulesForPlanSelection, validateWorkspaceModuleSelection, WORKSPACE_MODULE_CATALOG } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleCatalogEntry, WorkspaceModuleKey } from "@/lib/domain/types";
import { useExperience } from "@/lib/providers/experience-provider";
import { workspaceFeatureLabelsForPlan } from "@/lib/platform/workspace-feature-labels";
import { calculatePlanPrice, formatJodMinor } from "@/lib/public/pricing";
import { formatMoney } from "@/lib/utils/money";

type PlanUpdateInput = UpdatePlatformPlanInput & {
  name: PlatformSaasPlan["name"];
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  reason: string;
};

function selectedWorkspaceModules(plan: Pick<PlatformSaasPlan, "name" | "entitledModules">): WorkspaceModuleKey[] {
  return entitledModulesForPlanSelection(plan.name, plan.entitledModules);
}

export default function SubscriptionsPage() {
  const { platformSnapshot, saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  const sourcePlans = useMemo(() => saasPlans?.length ? saasPlans : platformSnapshot?.plans ?? [], [platformSnapshot?.plans, saasPlans]);
  const [plans, setPlans] = useState<PlatformSaasPlan[]>(sourcePlans);
  const [editingPlan, setEditingPlan] = useState<PlatformSaasPlan | null>(null);

  useEffect(() => {
    setPlans(sourcePlans);
  }, [sourcePlans]);

  const updatePlan = useApiMutation((api, input: PlanUpdateInput) => api.updatePlatformPlan(input), {
    onSuccess: async (updated) => {
      setPlans((current) => current.map((plan) => plan.name === updated.name ? updated : plan));
      // Read the same public catalog used by the landing page so this admin
      // screen never presents a private, divergent pricing source.
      try {
        setPlans(await getApi().listPublicSaasPlans());
      } catch {
        // The mutation response remains authoritative until the live catalog
        // subscription catches up.
      }
      toast.success(`${updated.name} plan updated. Landing-page pricing will refresh automatically.`);
      setEditingPlan(null);
    },
  });

  const loading = !plans.length && experienceStatus === "loading";
  const failed = !plans.length && experienceStatus === "error";

  if (failed) {
    return <div className="px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1480px]"><ErrorState title="Pricing catalog unavailable" description={experienceError ?? "The live subscription catalog could not be loaded."} onRetry={retryExperience} /></div></div>;
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="context-label">Commercial operations</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-tight">Pricing &amp; entitlements</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] text-ink-2">One audited catalog powers the public landing page, gym applications, and workspace feature access. Gym subscription changes stay on the gym detail page.</p>
          </div>
          <div className="border border-warning/30 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="note">
            <p className="flex items-center gap-1.5 font-medium"><ShieldAlert className="size-3.5" aria-hidden /> Catalog controls</p>
            <p className="mt-1 max-w-[280px]">Every price or limit change requires a reason and is written to the platform audit trail.</p>
          </div>
        </div>

        <section className="mt-7" aria-labelledby="plan-catalog-title">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <div><p className="context-label">Published pricing</p><h2 id="plan-catalog-title" className="mt-1 text-[18px] font-semibold">Four tiers, one live contract</h2><p className="mt-1 text-[12px] text-warning-deep" data-testid="pricing-provisional-notice">Provisional: these prices and limits are live in the product but not yet signed off. The sign-off sheet is docs/19; nothing here should be quoted as final until it is signed.</p></div>
            <p className="text-[12px] font-medium text-ink-3">Monthly JOD · annual billing saves 20%</p>
          </div>
          {loading ? <p className="px-5 py-10 text-center text-[12px] text-ink-3" role="status">Loading the live pricing catalog…</p> : plans.length === 0 ? <p className="border border-dashed border-line-2 px-4 py-10 text-center text-[11px] text-ink-3">No pricing plans have been published.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <PlanCard key={plan.name} plan={plan} onEdit={() => { updatePlan.reset(); setEditingPlan(plan); }} />)}</div>}
        </section>

        {editingPlan ? <PlanDialog plan={editingPlan} open saving={updatePlan.isPending} error={updatePlan.error} onOpenChange={(open) => { if (!open && !updatePlan.isPending) setEditingPlan(null); }} onSave={(input) => updatePlan.mutate(input)} /> : null}
      </div>
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlatformSaasPlan; onEdit: () => void }) {
  const annual = calculatePlanPrice(plan, "annual");
  return <article className={`flex h-full flex-col border p-5 ${plan.name === "Enterprise" ? "border-night bg-night text-night-ink" : plan.name === "Growth" ? "border-signal/60 bg-signal-bg" : "border-line bg-surface"}`}>
    <div className="flex items-start justify-between gap-3"><div><p className={plan.name === "Enterprise" ? "context-label text-night-ink-3" : "context-label"}>{plan.name}</p><p className="mt-3 text-[23px] font-semibold">{formatMoney({ amount: plan.priceMinor, currency: "JOD" })}<span className={plan.name === "Enterprise" ? "text-night-ink-3" : "text-ink-3"}> / mo</span></p><p className={`mt-1 text-[12px] ${plan.name === "Enterprise" ? "text-night-ink-3" : "text-ink-3"}`}>JOD {formatJodMinor(annual.annualTotalMinor)} billed annually</p></div><Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name} plan`} onClick={onEdit}><Pencil /></Button></div>
    <ul className={`mt-5 grid gap-2 text-[12px] leading-relaxed ${plan.name === "Enterprise" ? "text-night-ink-2" : "text-ink-2"}`}><li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-success" />Up to {plan.branches.toLocaleString()} branch{plan.branches === 1 ? "" : "es"}</li><li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-success" />Up to {plan.members.toLocaleString()} members</li><li className="flex items-start gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-success" />Up to {plan.staff.toLocaleString()} staff seats</li>{workspaceFeatureLabelsForPlan(plan).map((feature) => <li key={feature} className="flex items-start gap-1.5"><Check className="mt-0.5 size-3 shrink-0 text-success" />{feature}</li>)}</ul>
    <p className={`mt-auto border-t pt-4 text-[12px] leading-relaxed ${plan.name === "Enterprise" ? "border-night-line text-night-ink-3" : "border-line text-ink-3"}`}>{workspaceFeatureLabelsForPlan(plan).join(" · ")}.</p>
  </article>;
}

function PlanDialog({ plan, open, onOpenChange, saving, error, onSave }: { plan: PlatformSaasPlan; open: boolean; saving: boolean; error: Error | null; onOpenChange: (open: boolean) => void; onSave: (input: PlanUpdateInput) => void }) {
  const [price, setPrice] = useState(String(plan.priceMinor / 1000));
  const [branches, setBranches] = useState(String(plan.branches));
  const [staff, setStaff] = useState(String(plan.staff));
  const [members, setMembers] = useState(String(plan.members));
  const [entitledModules, setEntitledModules] = useState<WorkspaceModuleKey[]>(selectedWorkspaceModules(plan));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => { setPrice(String(plan.priceMinor / 1000)); setBranches(String(plan.branches)); setStaff(String(plan.staff)); setMembers(String(plan.members)); setEntitledModules(selectedWorkspaceModules(plan)); setReason(""); setErrors({}); }, [plan]);

  const toggleModule = (entry: WorkspaceModuleCatalogEntry) => {
    if (!entry.configurable) return;
    setEntitledModules((current) => {
      const selected = new Set(current);
      if (selected.has(entry.key)) {
        const remove = (key: WorkspaceModuleKey) => {
          selected.delete(key);
          for (const dependent of WORKSPACE_MODULE_CATALOG.filter((candidate) => candidate.dependencies.includes(key))) {
            if (selected.has(dependent.key)) remove(dependent.key);
          }
        };
        remove(entry.key);
      } else {
        const add = (key: WorkspaceModuleKey) => {
          selected.add(key);
          const dependency = WORKSPACE_MODULE_CATALOG.find((candidate) => candidate.key === key);
          dependency?.dependencies.forEach(add);
        };
        add(entry.key);
      }
      try {
        return validateWorkspaceModuleSelection([...selected], WORKSPACE_MODULE_CATALOG.map((candidate) => candidate.key));
      } catch {
        return current;
      }
    });
    setErrors((current) => ({ ...current, changes: undefined }));
  };

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
    const modulesChanged = JSON.stringify(entitledModules) !== JSON.stringify(selectedWorkspaceModules(plan));
    if (Object.keys(next).length === 0 && priceMinor === plan.priceMinor && branchCount === plan.branches && staffCount === plan.staff && memberCount === plan.members && !modulesChanged) next.changes = "Change at least one price, limit, or capability before saving.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({ name: plan.name, priceMinor, branches: branchCount, staff: staffCount, members: memberCount, entitledModules, reason: reason.trim() });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Edit {plan.name} plan</DialogTitle><DialogDescription>These values update the public landing page, new applications, and the entitlement catalog. Existing gym subscriptions are changed from the gym detail page.</DialogDescription></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><Field label="Monthly price (JOD)" required error={errors.price}><Input value={price} onChange={(event) => { setPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined, changes: undefined })); }} inputMode="decimal" aria-invalid={Boolean(errors.price)} /></Field><Field label="Branches" required error={errors.branches}><Input value={branches} onChange={(event) => { setBranches(event.target.value); setErrors((current) => ({ ...current, branches: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.branches)} /></Field><Field label="Staff seats" required error={errors.staff}><Input value={staff} onChange={(event) => { setStaff(event.target.value); setErrors((current) => ({ ...current, staff: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.staff)} /></Field><Field label="Member capacity" required error={errors.members}><Input value={members} onChange={(event) => { setMembers(event.target.value); setErrors((current) => ({ ...current, members: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.members)} /></Field><fieldset className="sm:col-span-2 rounded-md border border-line p-3" aria-label={`${plan.name} workspace capabilities`}><legend className="px-1 text-[12px] font-medium">Workspace capabilities</legend><p className="mb-3 text-[12px] leading-relaxed text-ink-3">These module keys are the same entitlement contract used by gym navigation and direct routes. Foundation is required for every tier; optional modules can be packaged into any tier with an audited reason.</p><div className="grid gap-2 sm:grid-cols-2">{WORKSPACE_MODULE_CATALOG.map((entry) => { const selected = entitledModules.includes(entry.key); const disabled = entry.required; return <label key={entry.key} className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${disabled ? "border-line bg-sunken/50" : "border-line-2 hover:border-ink"}`}><input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleModule(entry)} className="mt-0.5 accent-[var(--tenant-brand-primary)]" aria-label={entry.label} /><span className="min-w-0"><span className="block text-[11.5px] font-medium">{entry.label}{entry.required ? " · required" : ""}</span><span className="mt-0.5 block text-[12px] leading-relaxed text-ink-3">{entry.description}</span></span></label>; })}</div></fieldset>{errors.changes ? <p className="text-[11.5px] text-danger sm:col-span-2" role="alert">{errors.changes}</p> : null}<Field label="Reason for this change" required error={errors.reason} hint="Written to the immutable platform audit trail." className="sm:col-span-2"><textarea className="min-h-20 w-full resize-y rounded-md border border-line-2 bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-4 focus:border-ink aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-bg/30" value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); }} placeholder="Explain why the catalog limits, capabilities, or price are changing." aria-invalid={Boolean(errors.reason)} /></Field>{error ? <p className="border border-danger/30 bg-danger-bg px-3 py-2.5 text-[11.5px] text-danger sm:col-span-2" role="alert">{error.message || "The plan could not be saved."}</p> : null}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={submit}>Save plan</Button></DialogFooter></DialogContent></Dialog>;
}
