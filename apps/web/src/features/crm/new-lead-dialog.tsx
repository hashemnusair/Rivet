"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import type { LeadSource } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { fromMajor } from "@/lib/utils/money";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  fullName: z.string().min(3, "Name is required"),
  phone: z.string().min(9, "Phone is required").regex(/^\+?[\d\s()-]{9,18}$/, "Enter a valid phone"),
  email: z.string().email("Invalid email").or(z.literal("")).optional(),
  branchId: z.string().min(1, "Choose a branch"),
  source: z.enum(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call", "other"]),
  ownerId: z.string().optional(),
  expectedValue: z.string().optional(),
  nextFollowUp: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const usersQuery = useApiQuery(qk.users({ role: "salesperson" }), (api) => api.listUsers({ role: "salesperson", status: "active", pageSize: 20 }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      branchId: session?.activeBranchId ?? session?.branches[0]?.id ?? "",
      source: "instagram",
      ownerId: session?.user.id,
      expectedValue: "",
      nextFollowUp: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        fullName: "",
        phone: "",
        email: "",
        branchId: session?.activeBranchId ?? session?.branches[0]?.id ?? "",
        source: "instagram",
        ownerId: session?.user.id,
        expectedValue: "",
        nextFollowUp: "",
        notes: "",
      });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useApiMutation(
    (api, v: FormValues) =>
      api.createLead({
        fullName: v.fullName,
        phone: v.phone,
        email: v.email || undefined,
        branchId: v.branchId,
        source: v.source as LeadSource,
        ownerId: v.ownerId || undefined,
        expectedValue: v.expectedValue ? fromMajor(Number(v.expectedValue)) : undefined,
        nextFollowUpAt: v.nextFollowUp ? new Date(`${v.nextFollowUp}T10:00:00Z`).toISOString() : undefined,
        notes: v.notes || undefined,
      }),
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Could not create the lead."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>Capture it now — the 24h first-contact automation starts counting immediately.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" required error={form.formState.errors.fullName?.message}>
                <Input autoFocus {...form.register("fullName")} />
              </Field>
              <Field label="Phone" required error={form.formState.errors.phone?.message}>
                <Input dir="ltr" placeholder="+962 7…" {...form.register("phone")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch" required>
                <Controller
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Branch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
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
              <Field label="Source">
                <Controller
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Source">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEAD_SOURCE_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Owner">
                <Controller
                  control={form.control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || undefined)}>
                      <SelectTrigger aria-label="Owner">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {(usersQuery.data?.items ?? []).map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Expected value (JOD)">
                <Input inputMode="decimal" placeholder="105.000" {...form.register("expectedValue")} />
              </Field>
              <Field label="First follow-up">
                <Input type="date" {...form.register("nextFollowUp")} />
              </Field>
            </div>
            <Field label="Notes">
              <Textarea placeholder="What did they ask about?" {...form.register("notes")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
