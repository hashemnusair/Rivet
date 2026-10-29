"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useLocale, useT } from "@/lib/i18n/provider";
import {
  PROSPECT_BATCHES,
  PROSPECT_EVIDENCE_LEVELS,
  normalizeProspectChanges,
  prospectValueText,
  type PlatformProspect,
  type ProspectBatch,
  type ProspectChanges,
  type ProspectEvidence,
  type ProspectField,
} from "@/lib/platform/prospects";
import { BATCH_KEYS, EVIDENCE_COPY, fieldErrorMessages } from "./prospect-copy";
import { useProspectUpdate } from "./use-prospects";

type FormState = {
  gymName: string;
  area: string;
  batch: ProspectBatch;
  route: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  email: string;
  evidence: ProspectEvidence;
  checkedOn: string;
  contactNotes: string;
  sources: string;
};

function initialState(prospect?: PlatformProspect): FormState {
  return {
    gymName: prospect?.gymName ?? "",
    area: prospect?.area ?? "",
    batch: prospect?.batch ?? "selected",
    route: prospect?.route ?? "",
    phone: prospect?.phone ?? "",
    whatsapp: prospect?.whatsapp ?? "",
    instagram: prospect?.instagram ?? "",
    facebook: prospect?.facebook ?? "",
    email: prospect?.email ?? "",
    evidence: prospect?.evidence ?? "recheck",
    checkedOn: prospect?.checkedOn ?? "",
    contactNotes: prospect?.contactNotes ?? "",
    sources: prospect?.sources.join("\n") ?? "",
  };
}

function asChanges(form: FormState): ProspectChanges {
  const { sources, ...rest } = form;
  return { ...rest, sources: sources.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) };
}

/**
 * Add a gym, or change an existing gym's name, area, list and contact
 * details. Stage, owner, follow-up and messages are changed on the page.
 */
export function ProspectFormDialog({ open, onOpenChange, prospect, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; prospect?: PlatformProspect; onSaved?: (prospect: PlatformProspect) => void }) {
  const t = useT();
  const { isolate } = useLocale();
  const [form, setForm] = useState<FormState>(() => initialState(prospect));
  const [errors, setErrors] = useState<Partial<Record<ProspectField, string>>>({});
  const update = useProspectUpdate();
  const create = useApiMutation((api, fields: ProspectChanges & { gymName: string }) => api.createPlatformProspect({ fields }));
  const pending = update.isPending || create.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(initialState(prospect));
    setErrors({});
  }, [open, prospect]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const { values, fieldErrors } = normalizeProspectChanges(asChanges(form));
    if (!values.gymName && !fieldErrors.gymName) fieldErrors.gymName = "required";
    const messages = fieldErrorMessages(fieldErrors, t);
    if (Object.keys(messages).length) {
      setErrors(messages);
      return;
    }
    try {
      if (prospect) {
        const changes = Object.fromEntries(Object.entries(values).filter(([field, value]) => prospectValueText(value) !== prospectValueText(prospect[field as keyof PlatformProspect]))) as ProspectChanges;
        if (Object.keys(changes).length) {
          await update.mutateAsync({ prospectId: prospect.id, changes });
          toast.success(t("platformConsole.prospects.saved"));
        }
        onOpenChange(false);
      } else {
        const created = await create.mutateAsync({ ...values, gymName: values.gymName! });
        toast.success(t("platformConsole.prospects.form.added", { gym: isolate(created.gymName) }));
        onSaved?.(created);
        onOpenChange(false);
      }
    } catch (error) {
      // The toast already says what went wrong; the server's field codes
      // land under the fields they belong to.
      if (isApiError(error)) setErrors(fieldErrorMessages(error.sourceFieldErrors, t));
    }
  };

  const text = (key: Exclude<keyof FormState, "batch" | "evidence">, options: { label: string; required?: boolean; placeholder?: string; dir?: "ltr" | "auto"; type?: string; inputMode?: "tel" | "email" | "url"; className?: string } ) => (
    <Field label={options.label} required={options.required} error={errors[key as ProspectField]} className={options.className}>
      <Input
        id={`prospect-form-${key}`}
        type={options.type ?? "text"}
        dir={options.dir ?? "auto"}
        inputMode={options.inputMode}
        value={form[key]}
        placeholder={options.placeholder}
        onChange={(event) => set(key, event.target.value)}
        aria-invalid={errors[key as ProspectField] ? true : undefined}
      />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={(event) => void submit(event)} noValidate>
          <DialogHeader>
            <DialogTitle>{prospect ? t("platformConsole.prospects.form.editTitle", { gym: isolate(prospect.gymName) }) : t("platformConsole.prospects.form.addTitle")}</DialogTitle>
            <DialogDescription>{prospect ? t("platformConsole.prospects.form.editDescription") : t("platformConsole.prospects.form.addDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-6">
            <FormSection title={t("platformConsole.prospects.form.gymSection")}>
              {text("gymName", { label: t("platformConsole.prospects.field.gymName"), required: true, className: "sm:col-span-2" })}
              {text("area", { label: t("platformConsole.prospects.field.area"), placeholder: t("platformConsole.prospects.form.areaPlaceholder") })}
              <Field label={t("platformConsole.prospects.field.batch")} htmlFor="prospect-form-batch">
                <Select value={form.batch} onValueChange={(value) => set("batch", value as ProspectBatch)}>
                  <SelectTrigger id="prospect-form-batch"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_BATCHES.map((batch) => <SelectItem key={batch} value={batch}>{t(BATCH_KEYS[batch])}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </FormSection>

            <FormSection title={t("platformConsole.prospects.form.contactSection")}>
              {text("route", { label: t("platformConsole.prospects.field.route"), placeholder: t("platformConsole.prospects.form.routePlaceholder"), className: "sm:col-span-2" })}
              {text("phone", { label: t("platformConsole.prospects.field.phone"), dir: "ltr", type: "tel", inputMode: "tel", placeholder: "+962 79 000 0000" })}
              {text("whatsapp", { label: t("platformConsole.prospects.field.whatsapp"), dir: "ltr", type: "tel", inputMode: "tel", placeholder: "+962 79 000 0000" })}
              {text("instagram", { label: t("platformConsole.prospects.field.instagram"), dir: "ltr", type: "url", inputMode: "url", placeholder: t("platformConsole.prospects.form.linkPlaceholder") })}
              {text("facebook", { label: t("platformConsole.prospects.field.facebook"), dir: "ltr", type: "url", inputMode: "url", placeholder: t("platformConsole.prospects.form.linkPlaceholder") })}
              {text("email", { label: t("platformConsole.prospects.field.email"), dir: "ltr", type: "email", inputMode: "email" })}
            </FormSection>

            <FormSection title={t("platformConsole.prospects.form.researchSection")}>
              <Field label={t("platformConsole.prospects.field.evidence")} htmlFor="prospect-form-evidence">
                <Select value={form.evidence} onValueChange={(value) => set("evidence", value as ProspectEvidence)}>
                  <SelectTrigger id="prospect-form-evidence"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROSPECT_EVIDENCE_LEVELS.map((level) => <SelectItem key={level} value={level}>{t(EVIDENCE_COPY[level].labelKey)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {text("checkedOn", { label: t("platformConsole.prospects.field.checkedOn"), dir: "ltr", type: "date" })}
              <Field label={t("platformConsole.prospects.field.contactNotes")} error={errors.contactNotes} className="sm:col-span-2">
                <Textarea id="prospect-form-contact-notes" dir="auto" className="min-h-20" value={form.contactNotes} onChange={(event) => set("contactNotes", event.target.value)} />
              </Field>
              <Field label={t("platformConsole.prospects.field.sources")} hint={t("platformConsole.prospects.form.sourcesHint")} error={errors.sources} className="sm:col-span-2">
                <Textarea id="prospect-form-sources" dir="ltr" className="min-h-20" value={form.sources} placeholder={t("platformConsole.prospects.form.linkPlaceholder")} onChange={(event) => set("sources", event.target.value)} aria-invalid={errors.sources ? true : undefined} />
              </Field>
            </FormSection>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={pending}>{prospect ? t("platformConsole.prospects.form.save") : t("platformConsole.prospects.form.add")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-[13.5px] font-semibold text-ink">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
