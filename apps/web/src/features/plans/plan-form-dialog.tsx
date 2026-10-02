"use client";
import { useLocale } from "@/lib/i18n/provider";
import { enrollmentErrorText, enrollmentKey } from "@/lib/i18n/member-enrollment";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { latinDigits } from "@/lib/utils/text";
import { useMoneyProblemText } from "@/features/membership-actions/renew-flow-format";
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

const numeric = (schema: z.ZodNumber) => z.preprocess(value => typeof value === "string" ? latinDigits(value).replace(/٫/g, ".") : value, schema);

const schema = z
  .object({
    name: z.string().min(2, enrollmentKey("planNameRequired")),
    code: z.string().min(1, enrollmentKey("planCodeRequired")).max(8, enrollmentKey("planCodeLength")),
    kind: z.enum(["time", "visits"]),
    durationDays: numeric(z.coerce.number().int(enrollmentKey("wholeNumber")).min(1, enrollmentKey("atLeastOne"))).optional(),
    visitAllowance: numeric(z.coerce.number().int(enrollmentKey("wholeNumber")).min(1, enrollmentKey("atLeastOne"))).optional(),
    visitValidityDays: numeric(z.coerce.number().int(enrollmentKey("wholeNumber")).min(1, enrollmentKey("atLeastOne"))).optional(),
    priceMajor: z.string().min(1, enrollmentKey("priceRequired")),
    branchAccess: z.enum(["all", "selected"]),
    branchIds: z.array(z.string()),
    freezeAllowanceDays: numeric(z.coerce.number().int(enrollmentKey("wholeNumber")).min(0, enrollmentKey("atLeastZero")).max(180, enrollmentKey("maxFreezeDays"))),
    includedPtSessions: numeric(z.coerce.number().int(enrollmentKey("wholeNumber")).min(0, enrollmentKey("atLeastZero")).max(100, enrollmentKey("maxPtSessions"))),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "time" && !v.durationDays) ctx.addIssue({ code: "custom", path: ["durationDays"], message: enrollmentKey("durationRequired") });
    if (v.kind === "visits" && !v.visitAllowance) ctx.addIssue({ code: "custom", path: ["visitAllowance"], message: enrollmentKey("visitsRequired") });
    if (v.branchAccess === "selected" && v.branchIds.length === 0)
      ctx.addIssue({ code: "custom", path: ["branchIds"], message: enrollmentKey("branchRequired") });
  });

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan?: MembershipPlan;
}) {
  const { t, locale, isolate } = useLocale();
  const moneyProblemText = useMoneyProblemText();
  const invalidate = useInvalidate();
  const branchesQuery = useApiQuery(qk.branches, (api) => api.listBranches(), { enabled: open });
  const [serverCause, setServerError] = useState<unknown>();
  const serverError = serverCause ? (isApiError(serverCause) ? localizeApiError(serverCause, locale).message : t("memberEnrollment.planSaveFailed")) : undefined;

  const { session } = useApp();
  // Prices are typed and stored in the gym's currency at its own precision.
  const currency = plan?.basePrice.currency ?? session?.organization.currency ?? "JOD";
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema.superRefine((value, context) => {
      const read = readMoneyInput(value.priceMajor, currency);
      if (!read.ok) context.addIssue({ code: "custom", path: ["priceMajor"], message: enrollmentKey("validAmount") });
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

  const priceRead = readMoneyInput(form.watch("priceMajor"), currency);
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
      onError: (e) => setServerError(e),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{plan ? t("memberEnrollment.editPlan", { name: isolate(plan.name) }) : t("memberEnrollment.addPlan")}</DialogTitle>
          <DialogDescription>{t("memberEnrollment.priceChangesHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <FieldGrid alignFrom="base" className="grid-cols-[1fr_110px]">
              <Field label={t("memberEnrollment.planName")} required error={enrollmentErrorText(t, form.formState.errors.name?.message)}>
                <Input placeholder={t("memberEnrollment.planExample")} {...form.register("name")} />
              </Field>
              <Field label={t("memberEnrollment.planCode")} required error={enrollmentErrorText(t, form.formState.errors.code?.message)}>
                <Input dir="ltr" placeholder="Q3" className="font-mono uppercase" {...form.register("code")} />
              </Field>
            </FieldGrid>

            <Field label={t("memberEnrollment.planType")}>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                    <RadioCard value="time">
                      <span className="block text-[13px] font-medium">{t("memberEnrollment.byDays")}</span>
                      <span className="block text-[12px] text-ink-3">{t("memberEnrollment.byDaysHint")}</span>
                    </RadioCard>
                    <RadioCard value="visits">
                      <span className="block text-[13px] font-medium">{t("memberEnrollment.byVisits")}</span>
                      <span className="block text-[12px] text-ink-3">{t("memberEnrollment.byVisitsHint")}</span>
                    </RadioCard>
                  </RadioGroup>
                )}
              />
            </Field>

            <FieldGrid className="sm:grid-cols-3">
              {kind === "time" ? (
                <Field label={t("memberEnrollment.durationDays")} required error={enrollmentErrorText(t, form.formState.errors.durationDays?.message)}>
                  <Input type="text" inputMode="numeric" dir="ltr" {...form.register("durationDays")} />
                </Field>
              ) : (
                <>
                  <Field label={t("memberEnrollment.numberVisits")} required error={enrollmentErrorText(t, form.formState.errors.visitAllowance?.message)}>
                    <Input type="text" inputMode="numeric" dir="ltr" {...form.register("visitAllowance")} />
                  </Field>
                  <Field label={t("memberEnrollment.validityDays")} error={enrollmentErrorText(t, form.formState.errors.visitValidityDays?.message)}>
                    <Input type="text" inputMode="numeric" dir="ltr" placeholder="90" {...form.register("visitValidityDays")} />
                  </Field>
                </>
              )}
              <Field label={t("memberEnrollment.priceCurrency", { currency: locale === "ar" && currency === "JOD" ? "د.أ" : currency })} required error={form.formState.errors.priceMajor && !priceRead.ok ? (priceRead.problem === "empty" ? t("memberEnrollment.priceRequired") : moneyProblemText(priceRead, currency)) : enrollmentErrorText(t, form.formState.errors.priceMajor?.message)}>
                <Input inputMode="decimal" dir="ltr" placeholder={toMajorString(money(0, currency))} aria-invalid={form.formState.errors.priceMajor ? true : undefined} {...form.register("priceMajor")} />
              </Field>
              <Field label={t("memberEnrollment.freezeAllowed")} error={enrollmentErrorText(t, form.formState.errors.freezeAllowanceDays?.message)}>
                <Input type="text" inputMode="numeric" dir="ltr" {...form.register("freezeAllowanceDays")} />
              </Field>
              <Field label={t("memberEnrollment.ptIncluded")} error={enrollmentErrorText(t, form.formState.errors.includedPtSessions?.message)}>
                <Input type="text" inputMode="numeric" dir="ltr" {...form.register("includedPtSessions")} />
              </Field>
            </FieldGrid>

            <Field label={t("memberEnrollment.branches")} error={enrollmentErrorText(t, form.formState.errors.branchIds?.message) as string | undefined}>
              <Controller
                control={form.control}
                name="branchAccess"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-2">
                    <RadioCard value="all">
                      <span className="block text-[13px] font-medium">{t("common.label.allBranches")}</span>
                    </RadioCard>
                    <RadioCard value="selected">
                      <span className="block text-[13px] font-medium">{t("memberEnrollment.selectedBranches")}</span>
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
                  {branchesQuery.isLoading ? <span className="text-[12px] text-ink-3">{t("memberEnrollment.loadingBranches")}</span> : null}
                </div>
              ) : null}
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending}>
              {plan ? t("common.action.saveChanges") : t("memberEnrollment.addPlan")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
