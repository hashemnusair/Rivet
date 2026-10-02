"use client";
import { useLocale } from "@/lib/i18n/provider";


import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import type { LeadSource } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { isValidLeadPhone, isValidOptionalEmail, normalizeOptionalEmail } from "@/lib/utils/contact";
import { readMoneyInput } from "@/lib/utils/money";
import { localDateTimeToISO } from "@/lib/utils/dates";
import { LEAD_SOURCE_OPTIONS, leadSourceLabel } from "@/features/crm/crm-labels";
import type { TFunction } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function makeSchema(t: TFunction, currency: string) {
  return z.object({
    fullName: z.string().min(3, t("crmCompletion.validation.fullName")),
    phone: z.string().refine((value) => isValidLeadPhone(value), t("crmCompletion.validation.validPhone")),
    email: z.string().refine((value) => isValidOptionalEmail(value), t("crmCompletion.validation.validEmail")).optional(),
    branchId: z.string().min(1, t("crmCompletion.validation.branch")),
    source: z.enum(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call", "other"]),
    ownerId: z.string().optional(),
    expectedValue: z.string().optional().refine((value) => !value?.trim() || readMoneyInput(value, currency).ok, t("crmCompletion.newLead.invalidAmount")),
    nextFollowUp: z.string().optional(),
    notes: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, locale, isolateLtr } = useLocale();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const activeBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? "";
  const currency = session?.organization.currency ?? t("crmCompletion.newLead.defaultCurrency");
  const schema = useMemo(() => makeSchema(t, currency), [currency, t]);
  // Lead ownership is not limited to salespeople: owners and managers may
  // legitimately carry a queue, and the current actor must remain visible
  // when their role is not salesperson.
  const usersQuery = useApiQuery(qk.users({ status: "active" }), (api) => api.listUsers({ status: "active", pageSize: 50 }));
  const ownerOptions = useMemo(() => {
    const candidates = [
      ...(session?.user ? [{ id: session.user.id, name: session.user.name, role: session.roles[0] }] : []),
      ...(usersQuery.data?.items ?? []).map((user) => ({ id: user.id, name: user.name, role: user.role })),
    ];
    return candidates
      .filter((user) => user.role === "owner" || user.role === "manager" || user.role === "salesperson")
      .filter((user, index) => candidates.findIndex((candidate) => candidate.id === user.id) === index);
  }, [session?.roles, session?.user, usersQuery.data?.items]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      branchId: activeBranchId,
      source: "walk_in",
      ownerId: session?.user.id,
      expectedValue: "",
      nextFollowUp: "",
      notes: "",
    },
  });

  useEffect(() => { void form.trigger(); }, [locale, form]);

  useEffect(() => {
    if (open) {
      form.reset({
        fullName: "",
        phone: "",
        email: "",
        branchId: activeBranchId,
        source: "walk_in",
        ownerId: session?.user.id,
        expectedValue: "",
        nextFollowUp: "",
        notes: "",
      });
      setServerError(null);
    }
    // Reset when the dialog opens so a stale branch can never be carried into
    // a new lead. `activeBranchId` is already validated against visible
    // session branches above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeBranchId]);

  const mutation = useApiMutation(
    (api, v: FormValues) => {
      const expectedValue = v.expectedValue?.trim() ? readMoneyInput(v.expectedValue, currency) : undefined;
      return api.createLead({
        fullName: v.fullName,
        phone: v.phone,
        email: normalizeOptionalEmail(v.email),
        branchId: v.branchId,
        source: v.source as LeadSource,
        ownerId: v.ownerId || "unassigned",
        expectedValue: expectedValue?.ok ? expectedValue.money : undefined,
        nextFollowUpAt: v.nextFollowUp ? localDateTimeToISO(v.nextFollowUp, "10:00", session?.organization.timezone) : undefined,
        notes: v.notes || undefined,
      });
    },
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? localizeApiError(e, locale).message : t("crmCompletion.pipeline.saveFailed")),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("crm.newLead.title")}</DialogTitle>
          <DialogDescription>{t("crmCompletion.newLead.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => {
          const selectedBranchId = visibleBranchId(session?.branches, v.branchId);
          if (!selectedBranchId) {
            form.setError("branchId", { message: t("crmCompletion.newLead.branchRequired") });
            return;
          }
          mutation.mutate({ ...v, branchId: selectedBranchId });
        })}>
          <DialogBody className="space-y-4">
            <FieldGrid className="sm:grid-cols-2">
              <Field label={t("crm.newLead.fullName")} required error={form.formState.errors.fullName?.message}>
                <Input autoFocus dir="auto" {...form.register("fullName")} />
              </Field>
              <Field label={t("crm.newLead.phone")} required error={form.formState.errors.phone?.message}>
                <Input type="tel" autoComplete="tel" dir="ltr" placeholder="+962 7…" {...form.register("phone")} />
              </Field>
            </FieldGrid>
            <details className="group rounded-md border border-line bg-sunken/25" open={!activeBranchId || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[13px] font-medium text-ink-2">
                <span>
                  {t("crmCompletion.newLead.optionalDetails")}
                  <span className="ms-2 font-normal text-ink-3">{t("crmCompletion.newLead.walkInAssignedToYou")}</span>
                </span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-4 border-t border-line p-3">
                <Field label={t("crm.newLead.email")} htmlFor="lead-email" hint={t("crmCompletion.newLead.optional")} error={form.formState.errors.email?.message}>
                  <Input id="lead-email" type="email" autoComplete="email" dir="ltr" placeholder={t("crmCompletion.newLead.emailPlaceholder")} {...form.register("email")} />
                </Field>
                <FieldGrid className="sm:grid-cols-2">
                  <Field label={t("crm.newLead.branch")} required error={form.formState.errors.branchId?.message}>
                    <Controller
                      control={form.control}
                      name="branchId"
                      render={({ field }) => (
                        <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}>
                          <SelectTrigger aria-label={t("crm.newLead.branch")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("members.bulk.chooseBranch")}</SelectItem>
                            {session?.branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field label={t("crm.newLead.source")}>
                    <Controller
                      control={form.control}
                      name="source"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label={t("crm.newLead.source")}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAD_SOURCE_OPTIONS.map(({ value, labelKey }) => (
                              <SelectItem key={value} value={value}>
                                {leadSourceLabel(t, value) || t(labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </FieldGrid>
                <FieldGrid className="sm:grid-cols-3">
                  <Field label={t("crm.lead.ownerLabel")}>
                    <Controller
                      control={form.control}
                      name="ownerId"
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "unassigned")}>
                          <SelectTrigger aria-label={t("crm.lead.ownerLabel")}>
                            <SelectValue placeholder={t("crm.newLead.unassigned")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">{t("crm.newLead.unassigned")}</SelectItem>
                            {ownerOptions.map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field label={t("crmCompletion.newLead.expectedSaleAmount", { currency: isolateLtr(currency) })} error={form.formState.errors.expectedValue?.message}>
                    <Input type="text" inputMode="decimal" dir="ltr" placeholder="105.000" {...form.register("expectedValue")} />
                  </Field>
                  <Field label={t("crm.newLead.firstFollowUp")}>
                    <Input type="date" dir="ltr" {...form.register("nextFollowUp")} />
                  </Field>
                </FieldGrid>
                <Field label={t("crm.newLead.notes")}>
                  <Textarea dir="auto" placeholder={t("crm.newLead.notesPlaceholder")} {...form.register("notes")} />
                </Field>
              </div>
            </details>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending}>
              {t("crmCompletion.newLead.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
