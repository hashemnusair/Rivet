"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import type { MembershipPlan } from "@/lib/domain/types";
import { money, parseMoneyInput, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { useApp } from "@/lib/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioCard } from "@/components/ui/radio-group";

const schema = z
  .object({
    name: z.string().min(2, "Enter a plan name"),
    code: z.string().min(1, "Enter a short code").max(8, "Use 8 characters or fewer"),
    kind: z.enum(["time", "visits"]),
    durationDays: z.coerce.number().int("Use a whole number").min(1, "Enter 1 or more").optional(),
    visitAllowance: z.coerce.number().int("Use a whole number").min(1, "Enter 1 or more").optional(),
    visitValidityDays: z.coerce.number().int("Use a whole number").min(1, "Enter 1 or more").optional(),
    priceMajor: z.string().min(1, "Enter a price"),
    branchAccess: z.enum(["all", "selected"]),
    branchIds: z.array(z.string()),
    freezeAllowanceDays: z.coerce.number().int("Use a whole number").min(0, "Enter 0 or more").max(180, "Use 180 days or fewer"),
    includedPtSessions: z.coerce.number().int("Use a whole number").min(0, "Enter 0 or more").max(100, "Use 100 or fewer"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "time" && !v.durationDays) ctx.addIssue({ code: "custom", path: ["durationDays"], message: "Enter the number of days" });
    if (v.kind === "visits" && !v.visitAllowance) ctx.addIssue({ code: "custom", path: ["visitAllowance"], message: "Enter the number of visits" });
    if (v.branchAccess === "selected" && v.branchIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Choose at least one branch" });
  });

type FormValues = z.infer<typeof schema>;

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan?: MembershipPlan;
}) {
  const invalidate = useInvalidate();
  const branchesQuery = useApiQuery(qk.branches, (api) => api.listBranches(), { enabled: open });
  const [serverError, setServerError] = useState<string | null>(null);

  const { session } = useApp();
  // Prices are typed and stored in the gym's currency at its own precision.
  const currency = plan?.basePrice.currency ?? session?.organization.currency ?? "JOD";
  const form = useForm<FormValues>({
    resolver: zodResolver(schema.superRefine((value, context) => {
      const read = readMoneyInput(value.priceMajor, currency);
      if (!read.ok) context.addIssue({ code: "custom", path: ["priceMajor"], message: read.message });
    })),
    defaultValues: {
      name: "",
      code: "",
      kind: "time",
      durationDays: 30,
      branchAccess: "all",
      branchIds: [],
      freezeAllowanceDays: 0,
      includedPtSessions: 2,
      priceMajor: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        plan
          ? {
              name: plan.name,
              code: plan.code,
              kind: plan.kind,
              durationDays: plan.durationDays,
              visitAllowance: plan.visitAllowance,
              visitValidityDays: plan.visitValidityDays,
              priceMajor: toMajorString(plan.basePrice),
              branchAccess: plan.branchAccess,
              branchIds: plan.branchIds,
              freezeAllowanceDays: plan.freezeAllowanceDays,
              includedPtSessions: plan.includedPtSessions,
            }
          : { name: "", code: "", kind: "time", durationDays: 30, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 2, priceMajor: "" },
      );
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan?.id]);

  const kind = form.watch("kind");
  const branchAccess = form.watch("branchAccess");

  const mutation = useApiMutation(
    (api, v: FormValues) => {
      const payload = {
        name: v.name,
        code: v.code.toUpperCase(),
        kind: v.kind,
        durationDays: v.kind === "time" ? v.durationDays : undefined,
        visitAllowance: v.kind === "visits" ? v.visitAllowance : undefined,
        visitValidityDays: v.kind === "visits" ? v.visitValidityDays : undefined,
        basePrice: parseMoneyInput(v.priceMajor, currency) ?? money(0, currency),
        branchAccess: v.branchAccess,
        branchIds: v.branchAccess === "selected" ? v.branchIds : [],
        freezeAllowanceDays: v.freezeAllowanceDays,
        includedPtSessions: v.includedPtSessions,
      };
      return plan ? api.updatePlan(plan.id, payload) : api.createPlan(payload);
    },
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "The plan was not saved. Try again."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "Add plan"}</DialogTitle>
          <DialogDescription>Price changes only apply to new sales.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <FieldGrid alignFrom="base" className="grid-cols-[1fr_110px]">
              <Field label="Plan name" required error={form.formState.errors.name?.message}>
                <Input placeholder="For example: Quarterly" {...form.register("name")} />
              </Field>
              <Field label="Code" required error={form.formState.errors.code?.message}>
                <Input placeholder="Q3" className="font-mono uppercase" {...form.register("code")} />
              </Field>
            </FieldGrid>

            <Field label="Plan type">
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                    <RadioCard value="time">
                      <span className="block text-[13px] font-medium">By days</span>
                      <span className="block text-[12px] text-ink-3">Lasts a set number of days</span>
                    </RadioCard>
                    <RadioCard value="visits">
                      <span className="block text-[13px] font-medium">By visits</span>
                      <span className="block text-[12px] text-ink-3">A set number of visits</span>
                    </RadioCard>
                  </RadioGroup>
                )}
              />
            </Field>

            <FieldGrid className="sm:grid-cols-3">
              {kind === "time" ? (
                <Field label="Length (days)" required error={form.formState.errors.durationDays?.message}>
                  <Input type="number" min={1} {...form.register("durationDays")} />
                </Field>
              ) : (
                <>
                  <Field label="Number of visits" required error={form.formState.errors.visitAllowance?.message}>
                    <Input type="number" min={1} {...form.register("visitAllowance")} />
                  </Field>
                  <Field label="Use within (days)">
                    <Input type="number" min={1} placeholder="90" {...form.register("visitValidityDays")} />
                  </Field>
                </>
              )}
              <Field label={`Price (${currency})`} required error={form.formState.errors.priceMajor?.message}>
                <Input inputMode="decimal" dir="ltr" placeholder={toMajorString(money(0, currency))} aria-invalid={form.formState.errors.priceMajor ? true : undefined} {...form.register("priceMajor")} />
              </Field>
              <Field label="Freeze days allowed">
                <Input type="number" min={0} {...form.register("freezeAllowanceDays")} />
              </Field>
              <Field label="PT sessions included" error={form.formState.errors.includedPtSessions?.message}>
                <Input type="number" min={0} max={100} {...form.register("includedPtSessions")} />
              </Field>
            </FieldGrid>

            <Field label="Branches" error={form.formState.errors.branchIds?.message as string | undefined}>
              <Controller
                control={form.control}
                name="branchAccess"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                    <RadioCard value="all">
                      <span className="block text-[13px] font-medium">All branches</span>
                    </RadioCard>
                    <RadioCard value="selected">
                      <span className="block text-[13px] font-medium">Selected branches</span>
                    </RadioCard>
                  </RadioGroup>
                )}
              />
              {branchAccess === "selected" ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {branchesQuery.data?.filter((branch) => branch.status === "active").map((b) => (
                    <Controller
                      key={b.id}
                      control={form.control}
                      name="branchIds"
                      render={({ field }) => (
                        <label className="flex items-center gap-2 rounded-md border border-line-2 px-2.5 py-1.5 text-[12.5px] cursor-pointer">
                          <Checkbox
                            checked={field.value.includes(b.id)}
                            onCheckedChange={(checked) =>
                              field.onChange(checked ? [...field.value, b.id] : field.value.filter((id) => id !== b.id))
                            }
                            aria-label={b.name}
                          />
                          {b.name}
                        </label>
                      )}
                    />
                  ))}
                  {branchesQuery.isLoading ? <span className="text-[12px] text-ink-3">Loading branches…</span> : null}
                </div>
              ) : null}
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {plan ? "Save changes" : "Add plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
