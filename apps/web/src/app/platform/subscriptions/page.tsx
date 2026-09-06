"use client";

import { Check, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
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
import { cn } from "@/lib/utils/cn";
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
    return <PlatformPage narrow><ErrorState title="Pricing catalog unavailable" description={experienceError ?? "The live subscription catalog could not be loaded."} onRetry={retryExperience} /></PlatformPage>;
  }

  return (
    <PlatformPage narrow>
      <PageHeader
        title="Pricing & entitlements"
        description="One audited catalog powers the public landing page, gym applications and workspace feature access. Every price or limit change needs a reason and is written to the platform audit trail; a gym's own subscription is changed in Billing."
      />

      <section className="mt-5" aria-labelledby="plan-catalog-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <h2 id="plan-catalog-title" className="text-[15px] font-semibold">Four tiers, one live contract</h2>
          <p className="text-[12.5px] text-ink-3">Monthly JOD · annual billing saves 20%</p>
        </div>
        <p className="mt-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-2.5 text-[12.5px] leading-relaxed text-warning-deep" role="note" data-testid="pricing-provisional-notice">Provisional: these prices and limits are live in the product but not yet signed off. The sign-off sheet is docs/19; nothing here should be quoted as final until it is signed.</p>
        {loading ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3" role="status">Loading the live pricing catalog…</p> : plans.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line-2 px-4 py-10 text-center text-[12.5px] text-ink-3">No pricing plans have been published.</p> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <PlanCard key={plan.name} plan={plan} onEdit={() => { updatePlan.reset(); setEditingPlan(plan); }} />)}</div>}
      </section>

      {editingPlan ? <PlanDialog plan={editingPlan} open saving={updatePlan.isPending} error={updatePlan.error} onOpenChange={(open) => { if (!open && !updatePlan.isPending) setEditingPlan(null); }} onSave={(input) => updatePlan.mutate(input)} /> : null}
    </PlatformPage>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlatformSaasPlan; onEdit: () => void }) {
  const annual = calculatePlanPrice(plan, "annual");
  const features = [
    `Up to ${plan.branches.toLocaleString()} branch${plan.branches === 1 ? "" : "es"}`,
    `Up to ${plan.members.toLocaleString()} members`,
    `Up to ${plan.staff.toLocaleString()} staff seats`,
    ...workspaceFeatureLabelsForPlan(plan),
  ];
  return (
    <PlatformPanel className="flex h-full flex-col p-4 sm:p-5" aria-label={`${plan.name} plan`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{plan.name}</h3>
        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name} plan`} onClick={onEdit}><Pencil /></Button>
      </div>
      <p className="mt-3 text-[23px] font-semibold leading-none tabular tracking-[-0.01em]">{formatMoney({ amount: plan.priceMinor, currency: "JOD" })}<span className="ms-1 text-[13px] font-medium text-ink-3">/ month</span></p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">JOD {formatJodMinor(annual.annualTotalMinor)} billed annually</p>
      <ul className="mt-4 grid gap-1.5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-2">
        {features.map((feature) => <li key={feature} className="flex items-start gap-2"><Check className="mt-1 size-3.5 shrink-0 text-ink-3" aria-hidden />{feature}</li>)}
      </ul>
    </PlatformPanel>
  );
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {plan.name} plan</DialogTitle><DialogDescription>These values update the public landing page, new applications, and the entitlement catalog. Existing gym subscriptions are changed in Billing.</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly price (JOD)" required error={errors.price}><Input value={price} onChange={(event) => { setPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined, changes: undefined })); }} inputMode="decimal" aria-invalid={Boolean(errors.price)} /></Field>
          <Field label="Branches" required error={errors.branches}><Input value={branches} onChange={(event) => { setBranches(event.target.value); setErrors((current) => ({ ...current, branches: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.branches)} /></Field>
          <Field label="Staff seats" required error={errors.staff}><Input value={staff} onChange={(event) => { setStaff(event.target.value); setErrors((current) => ({ ...current, staff: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.staff)} /></Field>
          <Field label="Member capacity" required error={errors.members}><Input value={members} onChange={(event) => { setMembers(event.target.value); setErrors((current) => ({ ...current, members: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.members)} /></Field>
          <fieldset className="rounded-md border border-line p-3 sm:col-span-2" aria-label={`${plan.name} workspace capabilities`}>
            <legend className="px-1 text-[13px] font-medium">Workspace capabilities</legend>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">These module keys are the same entitlement contract used by gym navigation and direct routes. Foundation is required for every tier; optional modules can be packaged into any tier with an audited reason.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKSPACE_MODULE_CATALOG.map((entry) => {
                const selected = entitledModules.includes(entry.key);
                const disabled = entry.required;
                return (
                  <label key={entry.key} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5", disabled ? "border-line bg-sunken/50" : "border-line-2 hover:border-ink")}>
                    <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleModule(entry)} className="mt-0.5 size-4 accent-[var(--tenant-brand-primary)]" aria-label={entry.label} />
                    <span className="min-w-0"><span className="block text-[13px] font-medium">{entry.label}{entry.required ? " · required" : ""}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-3">{entry.description}</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {errors.changes ? <p className="text-[12.5px] text-danger sm:col-span-2" role="alert">{errors.changes}</p> : null}
          <Field label="Reason for this change" required error={errors.reason} hint="Written to the immutable platform audit trail." className="sm:col-span-2">
            <Textarea value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); }} placeholder="Explain why the catalog limits, capabilities, or price are changing." aria-invalid={Boolean(errors.reason)} />
          </Field>
          {error ? <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger sm:col-span-2" role="alert">{error.message || "The plan could not be saved."}</p> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button loading={saving} onClick={submit}>Save plan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
