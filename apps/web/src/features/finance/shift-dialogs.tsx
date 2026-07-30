"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { CashShift, UUID } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils/dates";
import { money, parseMoneyInput, toMajor } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Open shift
// ---------------------------------------------------------------------------
const openSchema = z.object({ float: z.string().min(1, "Opening float is required") });
type OpenValues = z.infer<typeof openSchema>;

export function OpenShiftDialog({
  open,
  onOpenChange,
  branchId,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  branchId: UUID;
  onOpened?: (shift: CashShift) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<OpenValues>({ resolver: zodResolver(openSchema), defaultValues: { float: "50.000" } });
  useEffect(() => {
    if (open) {
      form.reset({ float: "50.000" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useApiMutation(
    (api, v: OpenValues) => api.openCashShift({ branchId, openingFloat: parseMoneyInput(v.float) ?? money(50_000) }),
    {
      onSuccess: (shift) => {
        onOpenChange(false);
        onOpened?.(shift);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Could not open the shift."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open cash shift</DialogTitle>
          <DialogDescription>Count the drawer float before the first payment of the day.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody>
            <Field label="Opening float (JOD)" required error={form.formState.errors.float?.message}>
              <Input inputMode="decimal" autoFocus data-testid="opening-float" {...form.register("float")} />
            </Field>
            {serverError ? <p role="alert" className="mt-2 text-[12.5px] text-danger">{serverError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending} data-testid="confirm-open-shift">Open shift</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Close shift — expected vs counted, variance with mandatory explanation.
// Denomination counter keeps the count honest and fast.
// ---------------------------------------------------------------------------
const DENOMS: Array<{ label: string; minor: number }> = [
  { label: "50", minor: 50_000 },
  { label: "20", minor: 20_000 },
  { label: "10", minor: 10_000 },
  { label: "5", minor: 5_000 },
  { label: "1", minor: 1_000 },
  { label: "0.5", minor: 500 },
  { label: "0.25", minor: 250 },
  { label: "0.10", minor: 100 },
];

export function CloseShiftDialog({
  open,
  onOpenChange,
  shift,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: CashShift;
  onClosed?: (shift: CashShift) => void;
}) {
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [explanation, setExplanation] = useState("");

  const totalsQuery = useApiQuery(qk.shiftTotals(shift.branchId), (api) => api.getCurrentShiftTotals(shift.branchId), {
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setCounts({});
      setExplanation("");
      setServerError(null);
    }
  }, [open]);

  const counted = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] ?? 0) * d.minor, 0),
    [counts],
  );
  const expected = useMemo(() => {
    const totals = totalsQuery.data?.totals;
    if (!totals) return shift.openingFloat.amount;
    return shift.openingFloat.amount + totals.cashPayments.amount - totals.cashRefunds.amount;
  }, [totalsQuery.data, shift.openingFloat.amount]);
  const variance = counted - expected;

  const mutation = useApiMutation(
    (api) =>
      api.closeCashShift(shift.id, {
        countedCash: money(counted),
        varianceExplanation: explanation || undefined,
      }),
    {
      onSuccess: async (closed) => {
        await invalidate();
        onOpenChange(false);
        onClosed?.(closed);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Could not close the shift."),
    },
  );

  const totals = totalsQuery.data?.totals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Close shift</DialogTitle>
          <DialogDescription>
            Opened {formatDateTime(shift.openedAt)} by {shift.openedByName}. Count the drawer, explain any difference.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Expected story */}
          <div className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
            <ExpectCell label="Float" minor={shift.openingFloat.amount} />
            <ExpectCell label="Cash in" minor={totals?.cashPayments.amount ?? 0} sign="+" />
            <ExpectCell label="Cash refunds" minor={totals?.cashRefunds.amount ?? 0} sign="−" />
            <ExpectCell label="Expected" minor={expected} strong />
          </div>
          {totals ? (
            <p className="text-[11.5px] text-ink-3 tabular">
              {totals.paymentCount} payments this shift · card <MoneyText money={totals.cardPayments} hideCurrency /> · transfers{" "}
              <MoneyText money={totals.transferPayments} hideCurrency /> · {totals.refundCount} refunds
            </p>
          ) : null}

          {/* Denominations */}
          <div>
            <p className="eyebrow mb-2">Count the drawer</p>
            <div className="grid grid-cols-4 gap-2">
              {DENOMS.map((d) => (
                <label key={d.label} className="block">
                  <span className="mb-1 block text-[11px] text-ink-3 tabular">{d.label}</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={counts[d.label] ?? ""}
                    onChange={(e) => setCounts((c) => ({ ...c, [d.label]: Math.max(0, Number(e.target.value) || 0) }))}
                    aria-label={`${d.label} JOD notes/coins count`}
                    data-testid={`denom-${d.label}`}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Variance */}
          <div
            className={cn(
              "flex items-center justify-between rounded-md border px-4 py-3",
              variance === 0 ? "border-success/40 bg-success-bg/60" : "border-warning/50 bg-warning-bg/60",
            )}
            data-testid="variance-panel"
          >
            <div>
              <p className="text-[12px] text-ink-2">
                Counted <MoneyText money={money(counted)} className="font-semibold" /> against expected{" "}
                <MoneyText money={money(expected)} className="font-semibold" />
              </p>
              <p className={cn("mt-0.5 text-[15px] font-semibold tabular", variance === 0 ? "text-success-deep" : "text-warning-deep")}>
                {variance === 0 ? "Balanced — no variance" : `${variance > 0 ? "+" : "−"}${toMajor(money(Math.abs(variance))).toFixed(3)} JOD ${variance > 0 ? "over" : "short"}`}
              </p>
            </div>
          </div>

          {variance !== 0 ? (
            <Field label="Variance explanation" required hint="Goes to the manager's approval queue with the audit event.">
              <Textarea
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="e.g. Gave JOD 5 extra change at 19:40, member will return it tomorrow"
                data-testid="variance-explanation"
              />
            </Field>
          ) : null}
          {serverError ? <p role="alert" className="text-[12.5px] text-danger">{serverError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (variance !== 0 && explanation.trim().length < 5) {
                setServerError("Explain the variance before closing (min 5 characters).");
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            variant={variance === 0 ? "primary" : "signal"}
            data-testid="confirm-close-shift"
          >
            Close shift — counted {toMajor(money(counted)).toFixed(3)} JOD
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpectCell({ label, minor, sign, strong }: { label: string; minor: number; sign?: string; strong?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</p>
      <p className={cn("mt-0.5 text-[14px] tabular", strong && "font-semibold")}>
        {sign}
        {toMajor(money(minor)).toFixed(3)}
      </p>
    </div>
  );
}
