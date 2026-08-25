"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import type { LeadSource } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
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
  const activeBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? "";
  // Lead ownership is not limited to salespeople: owners and managers may
  // legitimately carry a queue, and the current actor must remain visible
  // when their role is not salesperson.
  const usersQuery = useApiQuery(qk.users({ status: "active" }), (api) => api.listUsers({ status: "active", pageSize: 50 }));
  const ownerOptions = useMemo(() => {
    const candidates = [
      ...(session?.user ? [{ id: session.user.id, name: session.user.name }] : []),
      ...(usersQuery.data?.items ?? []).map((user) => ({ id: user.id, name: user.name })),
    ];
    return candidates.filter((user, index) => candidates.findIndex((candidate) => candidate.id === user.id) === index);
  }, [session?.user, usersQuery.data?.items]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      branchId: activeBranchId,
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
        branchId: activeBranchId,
        source: "instagram",
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
    (api, v: FormValues) =>
      api.createLead({
        fullName: v.fullName,
        phone: v.phone,
        email: v.email?.trim().toLowerCase() || undefined,
        branchId: v.branchId,
        source: v.source as LeadSource,
        ownerId: v.ownerId || "unassigned",
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
        <form onSubmit={form.handleSubmit((v) => {
          const selectedBranchId = visibleBranchId(session?.branches, v.branchId);
          if (!selectedBranchId) {
            form.setError("branchId", { message: "Choose a visible branch" });
            return;
          }
          mutation.mutate({ ...v, branchId: selectedBranchId });
        })}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full name" required error={form.formState.errors.fullName?.message}>
                <Input autoFocus {...form.register("fullName")} />
              </Field>
              <Field label="Phone" required error={form.formState.errors.phone?.message}>
                <Input dir="ltr" placeholder="+962 7…" {...form.register("phone")} />
              </Field>
            </div>
            <Field label="Email" htmlFor="lead-email" hint="Optional — used for follow-up and identity matching." error={form.formState.errors.email?.message}>
              <Input id="lead-email" type="email" autoComplete="email" placeholder="prospect@example.com" {...form.register("email")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch" required error={form.formState.errors.branchId?.message}>
                <Controller
                  control={form.control}
                  name="branchId"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}>
                      <SelectTrigger aria-label="Branch">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose branch</SelectItem>
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
                    <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || "unassigned")}>
                      <SelectTrigger aria-label="Owner">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
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
