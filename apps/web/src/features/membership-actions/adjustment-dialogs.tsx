"use client";

import { toMajorString } from "@/lib/utils/money";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { MembershipSummary } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { MEMBERSHIP_STATUS_LABELS } from "@/lib/domain/status";
import { addDays, diffDays, formatDate, isCalendarDate, todayISODate } from "@/lib/utils/dates";
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

/** A date people can read at a glance ("18 Nov 2026"). Half-typed input stays as typed. */
const readableDate = (value: string | undefined) => (value && isCalendarDate(value) ? formatDate(value) : value || "—");

const transferSchema = z.object({
  branchId: z.string().min(1, "Choose the new branch"),
  reason: z.string().min(3, "Add a reason"),
});
type TransferValues = z.infer<typeof transferSchema>;

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
    onError: (error) => setServerError(isApiError(error) ? error.message : "The move was not saved. Try again."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move membership to another branch</DialogTitle>
          <DialogDescription>The member and their membership move to the new branch.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label="New branch" required error={form.formState.errors.branchId?.message}>
              <Select value={form.watch("branchId") || "none"} onValueChange={(value) => form.setValue("branchId", value === "none" ? "" : value, { shouldValidate: true })}>
                <SelectTrigger aria-label="New branch"><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Choose a branch</SelectItem>{destinations.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {destinations.length === 0 ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">There is no other branch you can move them to.</p> : null}
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Member relocated; confirmed by branch manager" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={destinations.length === 0}>Move membership</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const freezeSchema = z.object({
  startDate: z.string().min(1, "Choose a date"),
  endDate: z.string().min(1, "Choose a date"),
  reason: z.string().min(3, "Add a reason (at least 3 characters)"),
});
type FreezeValues = z.infer<typeof freezeSchema>;

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
      ? "The end date can't be before the start date."
      : start < today
        ? "A freeze can't start before today."
        : start > membership.endDate
          ? `A freeze must start on or before ${readableDate(membership.endDate)}, when the membership ends.`
          : days < minimumDays
            ? `A freeze must be at least ${minimumDays} day${minimumDays === 1 ? "" : "s"}.`
            : days > allowanceRemaining
              ? allowanceRemaining <= 0
                ? "This plan has no freeze days left."
                : `This plan allows ${allowanceRemaining} more freeze day${allowanceRemaining === 1 ? "" : "s"}.`
              : null;

  const mutation = useApiMutation(
    (api, v: FreezeValues) => api.freezeMembership(membership.id, { startDate: v.startDate, endDate: v.endDate, reason: v.reason }),
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
        onDone?.();
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "The freeze was not saved. Try again."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Freeze membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName}. The end date moves later by the days frozen.{" "}
            <strong>{allowanceRemaining}</strong> freeze day{allowanceRemaining === 1 ? "" : "s"} left on this plan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <FieldGrid alignFrom="base" className="grid-cols-2">
              <Field label="Freeze from" required error={form.formState.errors.startDate?.message}>
                <Input type="date" {...form.register("startDate")} />
              </Field>
              <Field label="Freeze until" required error={form.formState.errors.endDate?.message}>
                <Input type="date" {...form.register("endDate")} />
              </Field>
            </FieldGrid>
            <BeforeAfter
              rows={[
                { label: "Days frozen", before: "—", after: `${days} day${days === 1 ? "" : "s"}` },
                { label: "End date", before: readableDate(membership.endDate), after: readableDate(days > 0 ? addDays(membership.endDate, days) : membership.endDate) },
                { label: "Status", before: MEMBERSHIP_STATUS_LABELS[membership.status], after: days > 0 && start ? (start <= today ? `Frozen until ${readableDate(end)}` : `${MEMBERSHIP_STATUS_LABELS[membership.status]} · frozen from ${readableDate(start)}`) : MEMBERSHIP_STATUS_LABELS[membership.status] },
              ]}
            />
            {problem ? <p role="alert" className="text-[12.5px] text-danger" data-testid="freeze-problem">{problem}</p> : null}
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Travel for work, back on the 20th" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={days <= 0 || Boolean(problem)} data-testid="confirm-freeze">Freeze for {days > 0 ? days : "—"} day{days === 1 ? "" : "s"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const extendSchema = z.object({
  days: z.coerce.number().int().min(1, "At least 1 day").max(365, "At most 365 days"),
  reason: z.string().min(3, "Add a reason"),
});
type ExtendValues = z.infer<typeof extendSchema>;

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
    onError: (e) => setServerError(isApiError(e) ? e.message : "The extension was not saved. Try again."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <Field label="Extra days" required error={form.formState.errors.days?.message}>
              <Input type="number" min={1} max={365} {...form.register("days", { valueAsNumber: true })} />
            </Field>
            <BeforeAfter
              rows={[{ label: "End date", before: readableDate(membership.endDate), after: readableDate(days > 0 ? addDays(membership.endDate, days) : membership.endDate) }]}
            />
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Goodwill for the equipment outage last week" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Extend by {days > 0 ? days : "—"} days</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const reasonSchema = z.object({ reason: z.string().min(3, "Add a reason") });
type ReasonValues = z.infer<typeof reasonSchema>;

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
    onError: (e) => setServerError(isApiError(e) ? e.message : "The cancellation was not saved. Try again."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName} · {readableDate(membership.startDate)} to {readableDate(membership.endDate)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger">
              The member loses access right away. This cannot be undone. Any unpaid amount is still owed.
              Cancelling does not give money back. To do that, make a refund.
            </div>
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Member relocated; confirmed by phone" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Keep membership</Button>
            <Button type="submit" variant="signal" loading={mutation.isPending}>Cancel membership</Button>
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
    onError: (e) => setServerError(isApiError(e) ? e.message : "The freeze was not ended. Try again."),
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
          <DialogTitle>End freeze early</DialogTitle>
          <DialogDescription>
            {inProgress
              ? `${membership.memberName} · frozen since ${readableDate(freeze?.startDate)}. Unused freeze days are given back. The end date moves earlier by the same number of days.`
              : `${membership.memberName} · this freeze runs from ${readableDate(freeze?.startDate)} to ${readableDate(freeze?.endDate)}. You can only end a freeze early after it has started.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody>
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Member returned early, at the desk now" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Back</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!inProgress}>End freeze today</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const planChangeSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  effectiveDate: z.enum(["next_renewal", "immediate"]),
  reason: z.string().min(3, "Add a reason (at least 3 characters)"),
});
type PlanChangeValues = z.infer<typeof planChangeSchema>;

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
    onError: (error) => setServerError(isApiError(error) ? error.message : "The plan change was not saved. Try again."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change membership plan</DialogTitle>
          <DialogDescription>
            Move {membership.memberName} from {membership.planName} to a new plan. The new plan is charged at full price. Nothing is taken off for unused days.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label="New plan" required error={form.formState.errors.planId?.message}>
              <Select value={form.watch("planId")} onValueChange={(value) => form.setValue("planId", value, { shouldValidate: true })}>
                <SelectTrigger aria-label="New membership plan"><SelectValue placeholder={plansQuery.isLoading ? "Loading plans…" : "Choose a plan"} /></SelectTrigger>
                <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name} · {plan.basePrice.currency} {toMajorString(plan.basePrice)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Starts" required error={form.formState.errors.effectiveDate?.message}>
              <Select value={effectiveDate} onValueChange={(value) => form.setValue("effectiveDate", value as PlanChangeValues["effectiveDate"], { shouldValidate: true })}>
                <SelectTrigger aria-label="When the new plan starts"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next_renewal">At next renewal · {readableDate(nextRenewalDate)}</SelectItem>
                  {allowImmediate ? <SelectItem value="immediate">Today · full price</SelectItem> : null}
                </SelectContent>
              </Select>
            </Field>
            {effectiveDate === "immediate" ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">This ends the current membership today and starts the new plan today. The old charge stays as it is. Handle any refund or credit separately.</p> : null}
            {selectedPlan ? <BeforeAfter rows={[{ label: "Plan", before: membership.planName, after: selectedPlan.name }, { label: "New plan starts", before: "—", after: readableDate(effectiveDate === "immediate" ? todayISODate() : nextRenewalDate) }, { label: "Price", before: "Current membership", after: `${selectedPlan.basePrice.currency} ${toMajorString(selectedPlan.basePrice)} · full price` }]} /> : null}
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="For example: Member moving to unlimited access at next renewal" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={!selectedPlan}>Change plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BeforeAfter({ rows }: { rows: Array<{ label: string; before: string; after: string }> }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-line bg-sunken/60 px-3 py-2 text-[12px] font-medium text-ink-3">
        <span />
        <span>Now</span>
        <span>After</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_1fr_1fr] items-center border-b border-line/60 px-3 py-2 text-[12.5px] last:border-0">
          <span className="text-ink-3">{row.label}</span>
          <span className="tabular">{row.before}</span>
          <span className="font-medium tabular">{row.after}</span>
        </div>
      ))}
    </div>
  );
}
