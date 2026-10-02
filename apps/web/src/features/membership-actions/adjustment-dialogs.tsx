"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { MembershipSummary } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import { addDays, diffDays, todayISODate } from "@/lib/utils/dates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { emphasize, useReadableDate } from "./renew-flow-format";

const makeTransferSchema = (t: TFunction) => z.object({
  branchId: z.string().min(1, t("renewFlow.adjust.transfer.chooseNewBranch")),
  reason: z.string().min(3, t("renewFlow.adjust.transfer.reasonRequired")),
});
type TransferValues = z.infer<ReturnType<typeof makeTransferSchema>>;

export function TransferMembershipDialog({
  open,
  onOpenChange,
  membership,
  branches,
  onDone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  membership: MembershipSummary;
  branches: Array<{ id: string; name: string; code: string }>;
  onDone?: () => void;
}) {
  const { t } = useLocale();
  const transferSchema = useMemo(() => makeTransferSchema(t), [t]);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const destinations = branches.filter((branch) => branch.id !== membership.homeBranchId);
  const form = useForm<TransferValues>({ resolver: zodResolver(transferSchema), defaultValues: { branchId: "", reason: "" } });
  useEffect(() => {
    if (open) {
      // A transfer changes branch ownership. Require the operator to choose
      // the concrete destination instead of silently using the first option.
      form.reset({ branchId: "", reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const mutation = useApiMutation((api, values: TransferValues) => api.transferMembership(membership.id, values), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (error) => setServerError(isApiError(error) ? error.message : t("renewFlow.adjust.transfer.saveFailed")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.transfer.title")}</DialogTitle>
          <DialogDescription>{t("renewFlow.adjust.transfer.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label={t("renewFlow.adjust.transfer.newBranch")} required error={form.formState.errors.branchId?.message}>
              <Select value={form.watch("branchId") || "none"} onValueChange={(value) => form.setValue("branchId", value === "none" ? "" : value, { shouldValidate: true })}>
                <SelectTrigger aria-label={t("renewFlow.adjust.transfer.newBranch")}><SelectValue placeholder={t("renewFlow.adjust.transfer.chooseBranch")} /></SelectTrigger>
                <SelectContent><SelectItem value="none">{t("renewFlow.adjust.transfer.chooseBranch")}</SelectItem>{destinations.map((branch) => <SelectItem key={branch.id} value={branch.id}><bdi>{branch.name}</bdi></SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {destinations.length === 0 ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">{t("renewFlow.adjust.transfer.noOtherBranch")}</p> : null}
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.transfer.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={destinations.length === 0}>{t("renewFlow.adjust.transfer.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const makeFreezeSchema = (t: TFunction) => z.object({
  startDate: z.string().min(1, t("renewFlow.adjust.freeze.chooseDate")),
  endDate: z.string().min(1, t("renewFlow.adjust.freeze.chooseDate")),
  reason: z.string().min(3, t("renewFlow.adjust.freeze.reasonRequired")),
});
type FreezeValues = z.infer<ReturnType<typeof makeFreezeSchema>>;

export function FreezeDialog({
  open,
  onOpenChange,
  membership,
  allowanceRemaining,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membership: MembershipSummary;
  allowanceRemaining: number;
  onDone?: () => void;
}) {
  const { t, isolate } = useLocale();
  const readableDate = useReadableDate();
  const freezeSchema = useMemo(() => makeFreezeSchema(t), [t]);
  const statusLabel = (status: MembershipSummary["status"]) => t(`renewFlow.adjust.membershipStatus.${status}`);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const minimumDays = Math.max(1, settingsQuery.data?.operationalPolicies.membership.minimumFreezeDays ?? 1);
  const today = todayISODate();
  // Propose a fortnight, but never more than the plan still allows: a default
  // the server is bound to refuse is not a default.
  const defaultDays = Math.max(1, Math.min(14, allowanceRemaining));
  const defaults = () => ({ startDate: today, endDate: addDays(today, defaultDays - 1), reason: "" });
  const form = useForm<FreezeValues>({
    resolver: zodResolver(freezeSchema),
    defaultValues: defaults(),
  });
  useEffect(() => {
    if (open) {
      form.reset(defaults());
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = form.watch("startDate");
  const end = form.watch("endDate");
  const days = start && end ? diffDays(start, end) + 1 : 0;
  // The same rules the server enforces, explained before the request is sent.
  // The server still decides; this only stops a doomed submission.
  const problem = !start || !end
    ? null
    : days <= 0
      ? t("renewFlow.adjust.freeze.problems.endBeforeStart")
      : start < today
        ? t("renewFlow.adjust.freeze.problems.startInPast")
        : start > membership.endDate
          ? t("renewFlow.adjust.freeze.problems.startAfterEnd", { date: isolate(readableDate(membership.endDate)) })
          : days < minimumDays
            ? t("renewFlow.adjust.freeze.problems.tooShort", { count: minimumDays })
            : days > allowanceRemaining
              ? allowanceRemaining <= 0
                ? t("renewFlow.adjust.freeze.problems.noDaysLeft")
                : t("renewFlow.adjust.freeze.problems.tooLong", { count: allowanceRemaining })
              : null;

  const mutation = useApiMutation(
    (api, v: FreezeValues) => api.freezeMembership(membership.id, { startDate: v.startDate, endDate: v.endDate, reason: v.reason }),
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
        onDone?.();
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : t("renewFlow.adjust.freeze.saveFailed")),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.freeze.title")}</DialogTitle>
          <DialogDescription>
            <bdi>{membership.memberName}</bdi> · <bdi>{membership.planName}</bdi>. {t("renewFlow.adjust.freeze.descriptionIntro")}{" "}
            {emphasize(t("renewFlow.adjust.freeze.daysLeft", { count: allowanceRemaining }), String(allowanceRemaining))}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <FieldGrid alignFrom="base" className="grid-cols-2">
              <Field label={t("renewFlow.adjust.freeze.from")} required error={form.formState.errors.startDate?.message}>
                <Input type="date" {...form.register("startDate")} />
              </Field>
              <Field label={t("renewFlow.adjust.freeze.until")} required error={form.formState.errors.endDate?.message}>
                <Input type="date" {...form.register("endDate")} />
              </Field>
            </FieldGrid>
            <BeforeAfter
              rows={[
                { label: t("renewFlow.adjust.freeze.daysFrozen"), before: "—", after: t("renewFlow.adjust.freeze.days", { count: days }) },
                { label: t("renewFlow.adjust.freeze.endDate"), before: readableDate(membership.endDate), after: readableDate(days > 0 ? addDays(membership.endDate, days) : membership.endDate) },
                { label: t("renewFlow.adjust.freeze.status"), before: statusLabel(membership.status), after: days > 0 && start ? (start <= today ? t("renewFlow.adjust.freeze.frozenUntil", { date: isolate(readableDate(end)) }) : t("renewFlow.adjust.freeze.frozenFrom", { status: statusLabel(membership.status), date: isolate(readableDate(start)) })) : statusLabel(membership.status) },
              ]}
            />
            {problem ? <p role="alert" className="text-[12.5px] text-danger" data-testid="freeze-problem">{problem}</p> : null}
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.freeze.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={days <= 0 || Boolean(problem)} data-testid="confirm-freeze">{days > 0 ? t("renewFlow.adjust.freeze.submit", { count: days }) : t("renewFlow.adjust.freeze.submitNone")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const makeExtendSchema = (t: TFunction) => z.object({
  days: z.coerce.number().int().min(1, t("renewFlow.adjust.extend.atLeast")).max(365, t("renewFlow.adjust.extend.atMost")),
  reason: z.string().min(3, t("renewFlow.adjust.extend.reasonRequired")),
});
type ExtendValues = z.infer<ReturnType<typeof makeExtendSchema>>;

export function ExtendDialog({
  open,
  onOpenChange,
  membership,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membership: MembershipSummary;
  onDone?: () => void;
}) {
  const { t } = useLocale();
  const readableDate = useReadableDate();
  const extendSchema = useMemo(() => makeExtendSchema(t), [t]);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ExtendValues>({
    resolver: zodResolver(extendSchema),
    defaultValues: { days: 14, reason: "" },
  });
  useEffect(() => {
    if (open) {
      form.reset({ days: 14, reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // React Hook Form receives number inputs as strings unless valueAsNumber is
  // enabled. Passing the raw string to addDays concatenates it with the day of
  // month (for example, 10 + "14" => "1014"), producing a wildly incorrect
  // preview even though Zod coerces the submitted value later.
  const days = Number(form.watch("days")) || 0;
  const mutation = useApiMutation((api, v: ExtendValues) => api.extendMembership(membership.id, { days: v.days, reason: v.reason }), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (e) => setServerError(isApiError(e) ? e.message : t("renewFlow.adjust.extend.saveFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.extend.title")}</DialogTitle>
          <DialogDescription>
            <bdi>{membership.memberName}</bdi> · <bdi>{membership.planName}</bdi>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <Field label={t("renewFlow.adjust.extend.extraDays")} required error={form.formState.errors.days?.message}>
              <Input type="number" dir="ltr" min={1} max={365} {...form.register("days", { valueAsNumber: true })} />
            </Field>
            <BeforeAfter
              rows={[{ label: t("renewFlow.adjust.extend.endDate"), before: readableDate(membership.endDate), after: readableDate(days > 0 ? addDays(membership.endDate, days) : membership.endDate) }]}
            />
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.extend.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending}>{days > 0 ? t("renewFlow.adjust.extend.submit", { count: days }) : t("renewFlow.adjust.extend.submitNone")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const makeReasonSchema = (message: string) => z.object({ reason: z.string().min(3, message) });
type ReasonValues = z.infer<ReturnType<typeof makeReasonSchema>>;

export function CancelMembershipDialog({
  open,
  onOpenChange,
  membership,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membership: MembershipSummary;
  onDone?: () => void;
}) {
  const { t, isolate } = useLocale();
  const readableDate = useReadableDate();
  const reasonSchema = useMemo(() => makeReasonSchema(t("renewFlow.adjust.cancel.reasonRequired")), [t]);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: "" } });
  useEffect(() => {
    if (open) {
      form.reset({ reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useApiMutation((api, v: ReasonValues) => api.cancelMembership(membership.id, { reason: v.reason }), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (e) => setServerError(isApiError(e) ? e.message : t("renewFlow.adjust.cancel.saveFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.cancel.title")}</DialogTitle>
          <DialogDescription>
            <bdi>{membership.memberName}</bdi> · <bdi>{membership.planName}</bdi> · {t("renewFlow.sale.dateRange", { start: isolate(readableDate(membership.startDate)), end: isolate(readableDate(membership.endDate)) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger">
              {t("renewFlow.adjust.cancel.warning")}
            </div>
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.cancel.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("renewFlow.adjust.cancel.keep")}</Button>
            <Button type="submit" variant="signal" loading={mutation.isPending}>{t("renewFlow.adjust.cancel.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UnfreezeDialog({
  open,
  onOpenChange,
  membership,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  membership: MembershipSummary;
  onDone?: () => void;
}) {
  const { t, isolate } = useLocale();
  const readableDate = useReadableDate();
  const reasonSchema = useMemo(() => makeReasonSchema(t("renewFlow.adjust.unfreeze.reasonRequired")), [t]);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ReasonValues>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: "" } });
  useEffect(() => {
    if (open) {
      form.reset({ reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useApiMutation((api, v: ReasonValues) => api.unfreezeMembership(membership.id, { reason: v.reason }), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (e) => setServerError(isApiError(e) ? e.message : t("renewFlow.adjust.unfreeze.saveFailed")),
  });
  const today = todayISODate();
  const freeze = membership.activeFreeze;
  // The server only ends a freeze that is already running; say so instead of
  // offering a button that always fails for a freeze scheduled to start later.
  const inProgress = Boolean(freeze && freeze.startDate <= today && today <= freeze.endDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.unfreeze.title")}</DialogTitle>
          <DialogDescription>
            {inProgress
              ? t("renewFlow.adjust.unfreeze.descriptionRunning", { name: isolate(membership.memberName), date: isolate(readableDate(freeze?.startDate)) })
              : t("renewFlow.adjust.unfreeze.descriptionScheduled", { name: isolate(membership.memberName), start: isolate(readableDate(freeze?.startDate)), end: isolate(readableDate(freeze?.endDate)) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody>
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.unfreeze.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.back")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!inProgress}>{t("renewFlow.adjust.unfreeze.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const makePlanChangeSchema = (t: TFunction) => z.object({
  planId: z.string().min(1, t("renewFlow.sale.errors.choosePlan")),
  effectiveDate: z.enum(["next_renewal", "immediate"]),
  reason: z.string().min(3, t("renewFlow.adjust.planChange.reasonRequired")),
});
type PlanChangeValues = z.infer<ReturnType<typeof makePlanChangeSchema>>;

export function ChangeMembershipPlanDialog({
  open,
  onOpenChange,
  membership,
  allowImmediate = false,
  onDone,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  membership: MembershipSummary;
  allowImmediate?: boolean;
  onDone?: () => void;
}) {
  const { t, isolate, isolateLtr } = useLocale();
  const format = useFormat();
  const readableDate = useReadableDate();
  const planChangeSchema = useMemo(() => makePlanChangeSchema(t), [t]);
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 50 }));
  const plans = (plansQuery.data?.items ?? []).filter((plan) => plan.id !== membership.planId);
  const nextRenewalDate = membership.endDate >= todayISODate() ? addDays(membership.endDate, 1) : todayISODate();
  const form = useForm<PlanChangeValues>({
    resolver: zodResolver(planChangeSchema),
    defaultValues: { planId: "", effectiveDate: "next_renewal", reason: "" },
  });
  useEffect(() => {
    if (open) {
      form.reset({ planId: plans[0]?.id ?? "", effectiveDate: "next_renewal", reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plans.length]);
  const selectedPlan = plans.find((plan) => plan.id === form.watch("planId"));
  const effectiveDate = form.watch("effectiveDate");
  const mutation = useApiMutation((api, values: PlanChangeValues) => api.changeMembershipPlan(membership.id, values), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (error) => setServerError(isApiError(error) ? error.message : t("renewFlow.adjust.planChange.saveFailed")),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.adjust.planChange.title")}</DialogTitle>
          <DialogDescription>
            {t("renewFlow.adjust.planChange.description", { member: isolate(membership.memberName), plan: isolate(membership.planName) })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label={t("renewFlow.adjust.planChange.newPlan")} required error={form.formState.errors.planId?.message}>
              <Select value={form.watch("planId")} onValueChange={(value) => form.setValue("planId", value, { shouldValidate: true })}>
                <SelectTrigger aria-label={t("renewFlow.adjust.planChange.newPlanAria")}><SelectValue placeholder={plansQuery.isLoading ? t("renewFlow.adjust.planChange.loadingPlans") : t("renewFlow.shared.chooseAPlan")} /></SelectTrigger>
                <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{t("renewFlow.adjust.planChange.planOption", { name: isolate(plan.name), price: isolateLtr(format.money(plan.basePrice)) })}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t("renewFlow.adjust.planChange.starts")} required error={form.formState.errors.effectiveDate?.message}>
              <Select value={effectiveDate} onValueChange={(value) => form.setValue("effectiveDate", value as PlanChangeValues["effectiveDate"], { shouldValidate: true })}>
                <SelectTrigger aria-label={t("renewFlow.adjust.planChange.startsAria")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next_renewal">{t("renewFlow.adjust.planChange.atNextRenewal", { date: isolate(readableDate(nextRenewalDate)) })}</SelectItem>
                  {allowImmediate ? <SelectItem value="immediate">{t("renewFlow.adjust.planChange.todayFullPrice")}</SelectItem> : null}
                </SelectContent>
              </Select>
            </Field>
            {effectiveDate === "immediate" ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">{t("renewFlow.adjust.planChange.immediateWarning")}</p> : null}
            {selectedPlan ? <BeforeAfter rows={[{ label: t("renewFlow.adjust.planChange.rowPlan"), before: membership.planName, after: selectedPlan.name }, { label: t("renewFlow.adjust.planChange.rowStarts"), before: "—", after: readableDate(effectiveDate === "immediate" ? todayISODate() : nextRenewalDate) }, { label: t("renewFlow.adjust.planChange.rowPrice"), before: t("renewFlow.adjust.planChange.currentMembership"), after: t("renewFlow.adjust.planChange.fullPrice", { price: isolateLtr(format.money(selectedPlan.basePrice)) }) }]} /> : null}
            <Field label={t("renewFlow.adjust.reason")} required error={form.formState.errors.reason?.message}>
              <Textarea dir="auto" placeholder={t("renewFlow.adjust.planChange.reasonPlaceholder")} {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!selectedPlan}>{t("renewFlow.adjust.planChange.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BeforeAfter({ rows }: { rows: Array<{ label: string; before: string; after: string }> }) {
  const { t } = useLocale();
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-line bg-sunken/60 px-3 py-2 text-[12px] font-medium text-ink-3">
        <span />
        <span>{t("renewFlow.adjust.beforeAfter.now")}</span>
        <span>{t("renewFlow.adjust.beforeAfter.after")}</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_1fr_1fr] items-center border-b border-line/60 px-3 py-2 text-[12.5px] last:border-0">
          <span className="text-ink-3">{row.label}</span>
          <span className="tabular" dir="auto">{row.before}</span>
          <span className="font-medium tabular" dir="auto">{row.after}</span>
        </div>
      ))}
    </div>
  );
}
