"use client";
import { useLocale } from "@/lib/i18n/provider";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { isValidLeadPhone, isValidOptionalEmail, normalizeOptionalEmail } from "@/lib/utils/contact";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TFunction } from "@/lib/i18n/provider";

function makeSchema(t: TFunction) {
  return z.object({
    fullName: z.string().trim().min(3, t("crmCompletion.editLead.invalidName")),
    phone: z.string().refine((value) => isValidLeadPhone(value), t("crmCompletion.editLead.invalidPhone")),
    email: z.string().refine((value) => isValidOptionalEmail(value), t("crmCompletion.editLead.invalidEmail")).optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function EditLeadContactDialog({
  leadId,
  fullName,
  phone,
  email,
  open,
  onOpenChange,
}: {
  leadId: string;
  fullName: string;
  phone: string;
  email?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName, phone, email: email ?? "" },
  });

  useEffect(() => { void form.trigger(); }, [form, locale]);

  useEffect(() => {
    if (!open) return;
    form.reset({ fullName, phone, email: email ?? "" });
    setServerError(null);
  }, [email, form, fullName, open, phone]);

  const mutation = useApiMutation(
    (api, values: FormValues) => api.updateLeadContact(leadId, {
      fullName: values.fullName,
      phone: values.phone,
      email: normalizeOptionalEmail(values.email),
    }),
    {
      onSuccess: async () => {
        toast.success(t("crmCompletion.editLead.saved"));
        await invalidate();
        onOpenChange(false);
      },
      onError: (error) => setServerError(isApiError(error) ? localizeApiError(error, locale).message : t("crmCompletion.editLead.saveFailed")),
    },
  );

  const close = (nextOpen: boolean) => {
    if (nextOpen || !form.formState.isDirty || mutation.isPending || typeof window === "undefined" || window.confirm(t("crmCompletion.editLead.closeConfirm"))) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("crmCompletion.editLead.title")}</DialogTitle>
          <DialogDescription>{t("crmCompletion.editLead.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => { setServerError(null); mutation.mutate(values); })}>
          <DialogBody className="space-y-4">
            <Field label={t("common.label.fullName")} required error={form.formState.errors.fullName?.message}>
              <Input autoFocus dir="auto" {...form.register("fullName")} />
            </Field>
            <Field label={t("common.label.phone")} required error={form.formState.errors.phone?.message}>
              <Input type="tel" autoComplete="tel" dir="ltr" {...form.register("phone")} />
            </Field>
            <Field label={t("common.label.email")} hint={t("crmCompletion.editLead.optionalEmail")} error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" dir="ltr" {...form.register("email")} />
            </Field>
            {form.formState.isDirty ? <p role="status" className="text-[12px] text-ink-3">{t("crmCompletion.editLead.unsaved")}</p> : null}
            {serverError ? <p role="alert" className="text-[12.5px] text-danger">{serverError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => close(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isDirty}>{t("crmCompletion.editLead.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
