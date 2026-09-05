"use client";

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
  fullName: z.string().trim().min(3, "Full name must be at least 3 characters."),
  phone: z.string().refine((value) => isValidLeadPhone(value), "Enter a valid phone"),
  email: z.string().refine((value) => isValidOptionalEmail(value), "Invalid email").optional(),
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
        toast.success("Lead contact details updated.");
        await invalidate();
        onOpenChange(false);
      },
      onError: (error) => setServerError(isApiError(error) ? error.message : "Could not update the lead contact.",),
    },
  );

  const close = (nextOpen: boolean) => {
    if (nextOpen || !form.formState.isDirty || mutation.isPending || typeof window === "undefined" || window.confirm("Discard unsaved contact changes?")) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit lead contact</DialogTitle>
          <DialogDescription>Correct the lead identity details without changing pipeline progress.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => { setServerError(null); mutation.mutate(values); })}>
          <DialogBody className="space-y-4">
            <Field label="Full name" required error={form.formState.errors.fullName?.message}>
              <Input autoFocus {...form.register("fullName")} />
            </Field>
            <Field label="Phone" required error={form.formState.errors.phone?.message}>
              <Input type="tel" autoComplete="tel" dir="ltr" {...form.register("phone")} />
            </Field>
            <Field label="Email" hint="Optional — leave blank to remove it." error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="email" {...form.register("email")} />
            </Field>
            {form.formState.isDirty ? <p role="status" className="text-[12px] text-ink-3">Unsaved contact changes</p> : null}
            {serverError ? <p role="alert" className="text-[12.5px] text-danger">{serverError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!form.formState.isDirty}>Save contact</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
