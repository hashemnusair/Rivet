"use client";
import { useT } from "@/lib/i18n/provider";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { isValidLeadPhone, isValidOptionalEmail, normalizeOptionalEmail } from "@/lib/utils/contact";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const schema = z.object({
  fullName: z.string().trim().min(3, "Enter at least 3 letters for the name."),
  phone: z.string().refine((value) => isValidLeadPhone(value), "Enter a valid phone number"),
  email: z.string().refine((value) => isValidOptionalEmail(value), "Enter a valid email").optional(),
});

type FormValues = z.infer<typeof schema>;

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
  const t = useT();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName, phone, email: email ?? "" },
  });

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
        toast.success("Contact details saved.");
        await invalidate();
        onOpenChange(false);
      },
      onError: (error) => setServerError(isApiError(error) ? error.message : "Contact details were not saved. Try again.",),
    },
  );

  const close = (nextOpen: boolean) => {
    if (nextOpen || !form.formState.isDirty || mutation.isPending || typeof window === "undefined" || window.confirm("Close without saving your changes?")) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lead contact</DialogTitle>
          <DialogDescription>Fix the name, phone or email. The lead&apos;s progress does not change.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => { setServerError(null); mutation.mutate(values); })}>
          <DialogBody className="space-y-4">
            <Field label={t("common.label.fullName")} required error={form.formState.errors.fullName?.message}>
              <Input autoFocus {...form.register("fullName")} />
            </Field>
            <Field label={t("common.label.phone")} required error={form.formState.errors.phone?.message}>
              <Input type="tel" autoComplete="tel" dir="ltr" {...form.register("phone")} />
            </Field>
            <Field label={t("common.label.email")} hint="Optional. Leave empty to remove it." error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            {form.formState.isDirty ? <p role="status" className="text-[12px] text-ink-3">Changes not saved yet</p> : null}
            {serverError ? <p role="alert" className="text-[12.5px] text-danger">{serverError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => close(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isDirty}>Save contact</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
