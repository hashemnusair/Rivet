"use client";

import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { Check, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { calculatePlanPrice } from "@/lib/public/pricing";
import { cn } from "@/lib/utils/cn";
import { latinDigits } from "@/lib/utils/text";
import { money, readMoneyInput, toMajorString } from "@/lib/utils/money";

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

function readPositiveInteger(raw: string): number | undefined {
  const normalized = latinDigits(raw.trim());
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export default function SubscriptionsPage() {
  const t = useT();
  const { isolateLtr } = useLocale();
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
      setEditingPlan(null);
    },
    successMessage: (updated) => t("platformFinance.plans.draftSaved", { plan: isolateLtr(updated.name) }),
  });

  const loading = !plans.length && experienceStatus === "loading";
  const failed = !plans.length && experienceStatus === "error";

  if (failed) {
    return <PlatformPage narrow><ErrorState title={t("platformFinance.plans.unavailable")} description={experienceError ?? t("platformFinance.plans.unavailableDescription")} onRetry={retryExperience} /></PlatformPage>;
  }

  return (
    <PlatformPage narrow>
      <PageHeader title={t("platformFinance.plans.title")} description={t("platformFinance.plans.description")} />

      <section className="mt-5" aria-labelledby="plan-catalog-title">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
          <h2 id="plan-catalog-title" className="text-[15px] font-semibold">{t("platformFinance.plans.tiersHeading")}</h2>
          <p className="text-[12.5px] text-ink-3">{t("platformFinance.plans.monthlyJod")}</p>
        </div>
        <p className="mt-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-2.5 text-[12.5px] leading-relaxed text-warning-deep" role="note" data-testid="pricing-provisional-notice">{t("platformFinance.plans.provisional")}</p>
        {loading ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3" role="status">{t("platformFinance.plans.loading")}</p> : plans.length === 0 ? <p className="mt-4 rounded-lg border border-dashed border-line-2 px-4 py-10 text-center text-[12.5px] text-ink-3">{t("platformFinance.plans.empty")}</p> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{plans.map((plan) => <PlanCard key={plan.name} plan={plan} onEdit={() => { updatePlan.reset(); setEditingPlan(plan); }} />)}</div>}
      </section>

      {editingPlan ? <PlanDialog plan={editingPlan} open saving={updatePlan.isPending} error={updatePlan.error} onOpenChange={(open) => { if (!open && !updatePlan.isPending) setEditingPlan(null); }} onSave={(input) => updatePlan.mutate(input)} /> : null}
    </PlatformPage>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlatformSaasPlan; onEdit: () => void }) {
  const t = useT();
  const { isolateLtr } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const annual = calculatePlanPrice(plan, "annual");
  const features = [
    t("platformFinance.plans.branches", { count: plan.branches, formatted: f.number(plan.branches) }),
    t("platformFinance.plans.members", { count: plan.members, formatted: f.number(plan.members) }),
    t("platformFinance.plans.staffSeats", { count: plan.staff, formatted: f.number(plan.staff) }),
    ...selectedWorkspaceModules(plan).map((module) => t(`platformFinance.plans.features.${module}`)),
  ];
  return (
    <PlatformPanel className="flex h-full flex-col p-4 sm:p-5" aria-label={t("platformFinance.plans.planAria", { plan: isolateLtr(plan.name) })}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold"><bdi dir="ltr">{plan.name}</bdi></h3>
        <Button variant="ghost" size="icon-sm" aria-label={t("platformFinance.plans.editPlan", { plan: isolateLtr(plan.name) })} onClick={onEdit}><Pencil /></Button>
      </div>
      <p className="mt-3 text-[23px] font-semibold leading-none tabular tracking-[-0.01em]">{f.money(money(plan.priceMinor, "JOD"))}<span className="ms-1 text-[13px] font-medium text-ink-3">{t("marketing.pricing.perMonth")}</span></p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{t("platformFinance.plans.annualPrice", { amount: f.money(money(annual.annualTotalMinor, "JOD"), { hideCurrency: true }) })}</p>
      <ul className="mt-4 grid gap-1.5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-2">
        {features.map((feature, index) => <li key={`${index}-${feature}`} className="flex items-start gap-2"><Check className="mt-1 size-3.5 shrink-0 text-ink-3" aria-hidden />{feature}</li>)}
      </ul>
    </PlatformPanel>
  );
}

function PlanDialog({ plan, open, onOpenChange, saving, error, onSave }: { plan: PlatformSaasPlan; open: boolean; saving: boolean; error: Error | null; onOpenChange: (open: boolean) => void; onSave: (input: PlanUpdateInput) => void }) {
  const t = useT();
  const { isolateLtr } = useLocale();
  const [price, setPrice] = useState(toMajorString(money(plan.priceMinor, "JOD")));
  const [branches, setBranches] = useState(String(plan.branches));
  const [staff, setStaff] = useState(String(plan.staff));
  const [members, setMembers] = useState(String(plan.members));
  const [entitledModules, setEntitledModules] = useState<WorkspaceModuleKey[]>(selectedWorkspaceModules(plan));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => { setPrice(toMajorString(money(plan.priceMinor, "JOD"))); setBranches(String(plan.branches)); setStaff(String(plan.staff)); setMembers(String(plan.members)); setEntitledModules(selectedWorkspaceModules(plan)); setReason(""); setErrors({}); }, [plan]);

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
    const parsedPrice = readMoneyInput(price, "JOD");
    const priceMinor = parsedPrice.ok ? parsedPrice.money.amount : 0;
    const branchCount = readPositiveInteger(branches);
    const staffCount = readPositiveInteger(staff);
    const memberCount = readPositiveInteger(members);
    if (!reason.trim()) next.reason = t("platformFinance.plans.auditReasonRequired");
    else if (reason.trim().length < 3) next.reason = t("platformFinance.plans.auditReasonMin");
    if (!parsedPrice.ok) next.price = parsedPrice.problem === "empty" ? t("platformFinance.validation.amountEmpty") : parsedPrice.problem === "too_precise" ? t("platformFinance.validation.amountTooPrecise", { count: 3 }) : parsedPrice.problem === "too_large" ? t("platformFinance.validation.amountTooLarge") : parsedPrice.problem === "negative" ? t("platformFinance.validation.amountNegative") : t("platformFinance.plans.nonNegativePrice");
    if (branchCount === undefined) next.branches = t("platformFinance.plans.wholeNumber");
    if (staffCount === undefined) next.staff = t("platformFinance.plans.wholeNumber");
    if (memberCount === undefined) next.members = t("platformFinance.plans.wholeNumber");
    const modulesChanged = JSON.stringify(entitledModules) !== JSON.stringify(selectedWorkspaceModules(plan));
    if (Object.keys(next).length === 0 && priceMinor === plan.priceMinor && branchCount === plan.branches && staffCount === plan.staff && memberCount === plan.members && !modulesChanged) next.changes = t("platformFinance.plans.changesRequired");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSave({ name: plan.name, priceMinor, branches: branchCount!, staff: staffCount!, members: memberCount!, entitledModules, reason: reason.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("common.action.edit")} {t("platformFinance.plans.dialogTitle", { plan: isolateLtr(plan.name) })}</DialogTitle><DialogDescription>{t("platformFinance.plans.dialogDescription")}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t("platformFinance.plans.monthlyPrice")} required error={errors.price}><Input value={price} onChange={(event) => { setPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined, changes: undefined })); }} inputMode="decimal" aria-invalid={Boolean(errors.price)} /></Field>
          <Field label={t("platformFinance.plans.branchLimit")} required error={errors.branches}><Input value={branches} onChange={(event) => { setBranches(event.target.value); setErrors((current) => ({ ...current, branches: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.branches)} /></Field>
          <Field label={t("platformFinance.plans.staffLimit")} required error={errors.staff}><Input value={staff} onChange={(event) => { setStaff(event.target.value); setErrors((current) => ({ ...current, staff: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.staff)} /></Field>
          <Field label={t("platformFinance.plans.memberLimit")} required error={errors.members}><Input value={members} onChange={(event) => { setMembers(event.target.value); setErrors((current) => ({ ...current, members: undefined, changes: undefined })); }} inputMode="numeric" aria-invalid={Boolean(errors.members)} /></Field>
          <fieldset className="rounded-md border border-line p-3 sm:col-span-2" aria-label={t("platformFinance.plans.capabilities")}>
            <legend className="px-1 text-[13px] font-medium">{t("platformFinance.plans.capabilities")}</legend>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-3">{t("platformFinance.plans.capabilitiesDescription")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WORKSPACE_MODULE_CATALOG.map((entry) => {
                const selected = entitledModules.includes(entry.key);
                const disabled = entry.required;
                return (
                  <label key={entry.key} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5", disabled ? "border-line bg-sunken/50" : "border-line-2 hover:border-ink")}>
                    <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleModule(entry)} className="mt-0.5 size-4 accent-[var(--tenant-brand-primary)]" aria-label={t(`platformFinance.plans.features.${entry.key}`)} />
                    <span className="min-w-0"><span className="block text-[13px] font-medium">{t(`platformFinance.plans.features.${entry.key}`)}{entry.required ? ` · ${t("platformFinance.plans.required")}` : ""}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-3">{t(`platformFinance.plans.featureDescriptions.${entry.key}`)}</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {errors.changes ? <p className="text-[12.5px] text-danger sm:col-span-2" role="alert">{errors.changes}</p> : null}
          <Field label={t("platformFinance.plans.reason")} required error={errors.reason} hint={t("platformFinance.plans.auditHint")} className="sm:col-span-2">
            <Textarea value={reason} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })); }} placeholder={t("platformFinance.plans.reasonPlaceholder")} aria-invalid={Boolean(errors.reason)} />
          </Field>
          {error ? <p className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[12.5px] text-danger sm:col-span-2" role="alert">{error.message || t("platformFinance.plans.planSaveFailed")}</p> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>{t("common.action.cancel")}</Button><Button loading={saving} onClick={submit}>{t("platformFinance.plans.save")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
