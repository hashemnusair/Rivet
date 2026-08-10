"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { MembershipSummary } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
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
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const transferSchema = z.object({
  branchId: z.string().min(1, "Choose a destination branch"),
  reason: z.string().min(3, "A reason is required"),
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
      form.reset({ branchId: destinations[0]?.id ?? "", reason: "" });
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
    onError: (error) => setServerError(isApiError(error) ? error.message : "Transfer failed."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer membership</DialogTitle>
          <DialogDescription>Moves the membership and member home branch. The old and new branches are preserved in the immutable audit trail.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label="Destination branch" required error={form.formState.errors.branchId?.message}>
              <Select value={form.watch("branchId")} onValueChange={(value) => form.setValue("branchId", value, { shouldValidate: true })}>
                <SelectTrigger aria-label="Destination branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{destinations.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {destinations.length === 0 ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">No other active branch is available to your account.</p> : null}
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Member relocated; confirmed by branch manager" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={destinations.length === 0}>Transfer membership</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const freezeSchema = z.object({
  startDate: z.string().min(1, "Required"),
  endDate: z.string().min(1, "Required"),
  reason: z.string().min(3, "A reason is required (min 3 characters)"),
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
  const form = useForm<FreezeValues>({
    resolver: zodResolver(freezeSchema),
    defaultValues: { startDate: todayISODate(), endDate: addDays(todayISODate(), 13), reason: "" },
  });
  useEffect(() => {
    if (open) {
      form.reset({ startDate: todayISODate(), endDate: addDays(todayISODate(), 13), reason: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = form.watch("startDate");
  const end = form.watch("endDate");
  const days = start && end ? diffDays(start, end) + 1 : 0;

  const mutation = useApiMutation(
    (api, v: FreezeValues) => api.freezeMembership(membership.id, { startDate: v.startDate, endDate: v.endDate, reason: v.reason }),
    {
      onSuccess: async () => {
        await invalidate();
        onOpenChange(false);
        onDone?.();
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Freeze failed."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Freeze membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName}. Expiry moves out by the freeze length; the plan allows{" "}
            <strong>{allowanceRemaining}</strong> more freeze day{allowanceRemaining === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Freeze from" required error={form.formState.errors.startDate?.message}>
                <Input type="date" {...form.register("startDate")} />
              </Field>
              <Field label="Freeze until" required error={form.formState.errors.endDate?.message}>
                <Input type="date" {...form.register("endDate")} />
              </Field>
            </div>
            <BeforeAfter
              rows={[
                { label: "Freeze length", before: "—", after: `${days} day${days === 1 ? "" : "s"}` },
                { label: "Expiry date", before: membership.endDate, after: days > 0 ? addDays(membership.endDate, days) : membership.endDate },
              ]}
            />
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Travel for work, back on the 20th" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} disabled={days <= 0}>Freeze for {days > 0 ? days : "—"} days</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const extendSchema = z.object({
  days: z.coerce.number().int().min(1, "At least 1 day").max(365, "At most 365 days"),
  reason: z.string().min(3, "A reason is required"),
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

  const days = form.watch("days") || 0;
  const mutation = useApiMutation((api, v: ExtendValues) => api.extendMembership(membership.id, { days: v.days, reason: v.reason }), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      onDone?.();
    },
    onError: (e) => setServerError(isApiError(e) ? e.message : "Extension failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName}. A manual date change — it is audited as a sensitive action.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <Field label="Extra days" required error={form.formState.errors.days?.message}>
              <Input type="number" min={1} max={365} {...form.register("days")} />
            </Field>
            <BeforeAfter
              rows={[{ label: "Expiry date", before: membership.endDate, after: days > 0 ? addDays(membership.endDate, days) : membership.endDate }]}
            />
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Goodwill for the equipment outage last week" {...form.register("reason")} />
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

const reasonSchema = z.object({ reason: z.string().min(3, "A reason is required") });
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
    onError: (e) => setServerError(isApiError(e) ? e.message : "Cancellation failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel membership</DialogTitle>
          <DialogDescription>
            {membership.memberName} · {membership.planName} · term {membership.startDate} → {membership.endDate}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger">
              Cancellation ends access immediately and cannot be undone. Outstanding balances remain collectible.
              Refunds, if any, are a separate deliberate action.
            </div>
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Member relocated; confirmed by phone" {...form.register("reason")} />
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
    onError: (e) => setServerError(isApiError(e) ? e.message : "Unfreeze failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End freeze early</DialogTitle>
          <DialogDescription>
            {membership.memberName} · frozen since {membership.activeFreeze?.startDate}. Unused freeze days return to the allowance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody>
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Member returned early, at the desk now" {...form.register("reason")} />
            </Field>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Back</Button>
            <Button type="submit" loading={mutation.isPending}>End freeze today</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const planChangeSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  effectiveDate: z.enum(["next_renewal", "immediate"]),
  reason: z.string().min(3, "A reason is required (min 3 characters)"),
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
    onError: (error) => setServerError(isApiError(error) ? error.message : "Plan change failed."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change membership plan</DialogTitle>
          <DialogDescription>
            Move {membership.memberName} from {membership.planName}. A new successor term is created and linked to the existing history; RIVET does not invent proration or silently credit the old term.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <DialogBody className="space-y-4">
            <Field label="New plan" required error={form.formState.errors.planId?.message}>
              <Select value={form.watch("planId")} onValueChange={(value) => form.setValue("planId", value, { shouldValidate: true })}>
                <SelectTrigger aria-label="New membership plan"><SelectValue placeholder={plansQuery.isLoading ? "Loading plans…" : "Select plan"} /></SelectTrigger>
                <SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name} · {plan.basePrice.currency} {(plan.basePrice.amount / 1000).toFixed(3)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Effective date" required error={form.formState.errors.effectiveDate?.message}>
              <Select value={effectiveDate} onValueChange={(value) => form.setValue("effectiveDate", value as PlanChangeValues["effectiveDate"], { shouldValidate: true })}>
                <SelectTrigger aria-label="Plan change effective date"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next_renewal">Next renewal · {nextRenewalDate}</SelectItem>
                  {allowImmediate ? <SelectItem value="immediate">Immediately · no proration</SelectItem> : null}
                </SelectContent>
              </Select>
            </Field>
            {effectiveDate === "immediate" ? <p className="rounded-md border border-warning/30 bg-warning-bg p-3 text-[12.5px] text-warning-deep">Immediate changes end the current term and start the new plan today. The existing charge is preserved; any credit or refund must be handled separately.</p> : null}
            {selectedPlan ? <BeforeAfter rows={[{ label: "Plan", before: membership.planName, after: selectedPlan.name }, { label: "New term starts", before: "—", after: effectiveDate === "immediate" ? todayISODate() : nextRenewalDate }, { label: "Price", before: "Existing term", after: `${selectedPlan.basePrice.currency} ${(selectedPlan.basePrice.amount / 1000).toFixed(3)} · full charge` }]} /> : null}
            <Field label="Reason" required error={form.formState.errors.reason?.message}>
              <Textarea placeholder="e.g. Member moving to unlimited access at next renewal" {...form.register("reason")} />
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
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-line bg-sunken/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        <span />
        <span>Before</span>
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
