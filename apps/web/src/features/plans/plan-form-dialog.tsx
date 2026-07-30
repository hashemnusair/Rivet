"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { MembershipPlan } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { fromMajor, toMajor } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioCard } from "@/components/ui/radio-group";

const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    code: z.string().min(1, "Code is required").max(8, "Max 8 characters"),
    kind: z.enum(["time", "visits"]),
    durationDays: z.coerce.number().int().min(1).optional(),
    visitAllowance: z.coerce.number().int().min(1).optional(),
    visitValidityDays: z.coerce.number().int().min(1).optional(),
    priceMajor: z.string().min(1, "Price is required"),
    branchAccess: z.enum(["all", "selected"]),
    branchIds: z.array(z.string()),
    freezeAllowanceDays: z.coerce.number().int().min(0).max(180),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "time" && !v.durationDays) ctx.addIssue({ code: "custom", path: ["durationDays"], message: "Required" });
    if (v.kind === "visits" && !v.visitAllowance) ctx.addIssue({ code: "custom", path: ["visitAllowance"], message: "Required" });
    if (v.branchAccess === "selected" && v.branchIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: "Pick at least one branch" });
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
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      code: "",
      kind: "time",
      durationDays: 30,
      branchAccess: "all",
      branchIds: [],
      freezeAllowanceDays: 0,
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
              priceMajor: toMajor(plan.basePrice).toFixed(3),
              branchAccess: plan.branchAccess,
              branchIds: plan.branchIds,
              freezeAllowanceDays: plan.freezeAllowanceDays,
            }
          : { name: "", code: "", kind: "time", durationDays: 30, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, priceMajor: "" },
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
        basePrice: fromMajor(Number(v.priceMajor)),
        branchAccess: v.branchAccess,
        branchIds: v.branchAccess === "selected" ? v.branchIds : [],
        freezeAllowanceDays: v.freezeAllowanceDays,
      };
      return plan ? api.updatePlan(plan.id, payload) : api.createPlan(payload);
    },
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Could not save the plan."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle>
          <DialogDescription>Plans are the templates you sell. Price changes only affect future sales.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <Field label="Plan name" required error={form.formState.errors.name?.message}>
                <Input placeholder="e.g. Quarterly" {...form.register("name")} />
              </Field>
              <Field label="Code" required error={form.formState.errors.code?.message}>
                <Input placeholder="Q3" className="font-mono uppercase" {...form.register("code")} />
              </Field>
            </div>

            <Field label="Plan type">
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                    <RadioCard value="time">
                      <span className="block text-[13px] font-medium">Time-based</span>
                      <span className="block text-[11.5px] text-ink-3">Runs for a number of days</span>
                    </RadioCard>
                    <RadioCard value="visits">
                      <span className="block text-[13px] font-medium">Visit-based</span>
                      <span className="block text-[11.5px] text-ink-3">A punch-card of entries</span>
                    </RadioCard>
                  </RadioGroup>
                )}
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {kind === "time" ? (
                <Field label="Duration (days)" required error={form.formState.errors.durationDays?.message}>
                  <Input type="number" min={1} {...form.register("durationDays")} />
                </Field>
              ) : (
                <>
                  <Field label="Visits" required error={form.formState.errors.visitAllowance?.message}>
                    <Input type="number" min={1} {...form.register("visitAllowance")} />
                  </Field>
                  <Field label="Valid for (days)">
                    <Input type="number" min={1} placeholder="90" {...form.register("visitValidityDays")} />
                  </Field>
                </>
              )}
              <Field label="Price (JOD)" required error={form.formState.errors.priceMajor?.message}>
                <Input inputMode="decimal" placeholder="0.000" {...form.register("priceMajor")} />
              </Field>
              <Field label="Freeze allowance (days)">
                <Input type="number" min={0} {...form.register("freezeAllowanceDays")} />
              </Field>
            </div>

            <Field label="Branch access" error={form.formState.errors.branchIds?.message as string | undefined}>
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
                  {session?.branches.map((b) => (
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
              {plan ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
