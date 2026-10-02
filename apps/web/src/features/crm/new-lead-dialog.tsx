"use client";
import { useT } from "@/lib/i18n/provider";


import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import type { LeadSource } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { isValidLeadPhone, isValidOptionalEmail, normalizeOptionalEmail } from "@/lib/utils/contact";
import { fromMajor } from "@/lib/utils/money";
import { localDateTimeToISO } from "@/lib/utils/dates";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  fullName: z.string().min(3, "Enter the full name"),
  phone: z.string().refine((value) => isValidLeadPhone(value), "Enter a valid phone number"),
  email: z.string().refine((value) => isValidOptionalEmail(value), "Enter a valid email").optional(),
  branchId: z.string().min(1, "Choose a branch"),
  source: z.enum(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call", "other"]),
  ownerId: z.string().optional(),
  expectedValue: z.string().optional(),
  nextFollowUp: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
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
    (api, v: FormValues) =>
      api.createLead({
        fullName: v.fullName,
        phone: v.phone,
        email: normalizeOptionalEmail(v.email),
        branchId: v.branchId,
        source: v.source as LeadSource,
        ownerId: v.ownerId || "unassigned",
        expectedValue: v.expectedValue ? fromMajor(Number(v.expectedValue)) : undefined,
        nextFollowUpAt: v.nextFollowUp ? localDateTimeToISO(v.nextFollowUp, "10:00", session?.organization.timezone) : undefined,
        notes: v.notes || undefined,
      }),
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "The lead was not saved. Try again."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("crm.newLead.title")}</DialogTitle>
          <DialogDescription>Add their name and phone, then choose the next follow-up.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => {
          const selectedBranchId = visibleBranchId(session?.branches, v.branchId);
          if (!selectedBranchId) {
            form.setError("branchId", { message: "Choose one of your branches" });
            return;
          }
          mutation.mutate({ ...v, branchId: selectedBranchId });
        })}>
          <DialogBody className="space-y-4">
            <FieldGrid className="sm:grid-cols-2">
              <Field label={t("crm.newLead.fullName")} required error={form.formState.errors.fullName?.message}>
                <Input autoFocus {...form.register("fullName")} />
              </Field>
              <Field label={t("crm.newLead.phone")} required error={form.formState.errors.phone?.message}>
                <Input type="tel" autoComplete="tel" dir="ltr" placeholder="+962 7…" {...form.register("phone")} />
              </Field>
            </FieldGrid>
            <details className="group rounded-md border border-line bg-sunken/25" open={!activeBranchId || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-[13px] font-medium text-ink-2">
                <span>
                  Add optional details
                  <span className="ms-2 font-normal text-ink-3">Walk-in · assigned to you</span>
                </span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="space-y-4 border-t border-line p-3">
                <Field label={t("crm.newLead.email")} htmlFor="lead-email" hint="Optional." error={form.formState.errors.email?.message}>
                  <Input id="lead-email" type="email" autoComplete="email" placeholder="name@example.com" {...form.register("email")} />
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
                  <Field label="Expected sale amount (JOD)">
                    <Input inputMode="decimal" placeholder="105.000" {...form.register("expectedValue")} />
                  </Field>
                  <Field label={t("crm.newLead.firstFollowUp")}>
                    <Input type="date" {...form.register("nextFollowUp")} />
                  </Field>
                </FieldGrid>
                <Field label={t("crm.newLead.notes")}>
                  <Textarea placeholder={t("crm.newLead.notesPlaceholder")} {...form.register("notes")} />
                </Field>
              </div>
            </details>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending}>
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
