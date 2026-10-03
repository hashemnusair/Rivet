"use client";
import { useT, useLocale } from "@/lib/i18n/provider";

import { ChecklistHandover } from "@/features/checklists/checklist-handover";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import type { CashShift, ShiftTotals, UUID } from "@/lib/domain/types";
import { createTranslator, type TFunction } from "@/lib/i18n/core";
import { useFormat } from "@/lib/i18n/format";
import { isolate } from "@/lib/i18n/bidi";
import { latinDigits } from "@/lib/utils/text";
import { useMoneyProblemText } from "@/features/membership-actions/renew-flow-format";
import { exponentFor, money, parseMoneyInput, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { ErrorState } from "@/components/ui/states";

// ---------------------------------------------------------------------------
// Open shift
// ---------------------------------------------------------------------------
export const makeOpenShiftSchema = (currency = "JOD", t: TFunction = createTranslator("en")) => z.object({
  float: z
    .string()
    .trim()
    .min(1, t("salesWorkspace.enterFloat"))
    .refine((value) => {
      const parsed = parseMoneyInput(value, currency);
      return parsed !== null && parsed.amount >= 0;
    }, t("salesWorkspace.nonnegative")),
});
export const openShiftSchema = makeOpenShiftSchema();
type OpenValues = z.infer<typeof openShiftSchema>;

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
  const t = useT();
  const { locale } = useLocale();
  const f = useFormat();
  const [serverCause, setServerError] = useState<unknown>();
  const serverError = serverCause ? (isApiError(serverCause) ? localizeApiError(serverCause, locale).message : t("salesWorkspace.openFailed")) : undefined;
  const moneyProblemText = useMoneyProblemText();
  const { session } = useApp();
  // The drawer is counted in the gym's currency at its own precision.
  const currency = session?.organization.currency ?? "JOD";
  const form = useForm<OpenValues>({ resolver: zodResolver(makeOpenShiftSchema(currency, t)), defaultValues: { float: "" } });
  const floatRead = readMoneyInput(form.watch("float") ?? "", currency);
  const floatProblem = !floatRead.ok && floatRead.problem !== "empty" && (form.formState.touchedFields.float || form.formState.isSubmitted) ? moneyProblemText(floatRead, currency) : undefined;
  useEffect(() => {
    if (open) {
      form.reset({ float: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useApiMutation(
    (api, v: OpenValues) => {
      const openingFloat = parseMoneyInput(v.float, currency);
      if (!openingFloat) throw new Error("Enter the starting cash.");
      return api.openCashShift({ branchId, openingFloat });
    },
    {
      onSuccess: (shift) => {
        onOpenChange(false);
        onOpened?.(shift);
      },
      onError: (e) => setServerError(e),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("salesWorkspace.openCashShift")}</DialogTitle>
          <DialogDescription>{t("salesWorkspace.openHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody>
            <Field label={t("salesWorkspace.startingCurrency", { currency: locale === "ar" && currency === "JOD" ? "د.أ" : currency })} required error={form.formState.errors.float ? (floatRead.ok ? undefined : floatRead.problem === "empty" ? t("salesWorkspace.enterFloat") : moneyProblemText(floatRead, currency)) : floatProblem}>
              <Input inputMode="decimal" dir="ltr" autoFocus placeholder={t("salesWorkspace.amountExample", { amount: f.money(money(50 * 10 ** exponentFor(currency), currency), { hideCurrency: true }) })} data-testid="opening-float" aria-invalid={Boolean((form.formState.errors.float && !floatRead.ok) || floatProblem) || undefined} {...form.register("float")} />
            </Field>
            {serverError ? <p role="alert" className="mt-2 text-[12.5px] text-danger">{serverError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
            <Button type="submit" loading={mutation.isPending} data-testid="confirm-open-shift">{t("dashboard.reception.openShift")}</Button>
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

export function authoritativeExpectedCash(
  shift: CashShift,
  current: { shift: CashShift; totals: ShiftTotals } | null | undefined,
): number | undefined {
  if (!current || current.shift.id !== shift.id || current.shift.status !== "open") return undefined;
  return shift.openingFloat.amount + current.totals.cashPayments.amount - current.totals.cashRefunds.amount - current.totals.supplierCashPayments.amount + current.totals.supplierCashReversals.amount;
}

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
  const t = useT();
  const invalidate = useInvalidate();
  const currency = shift.openingFloat.currency;
  const { locale } = useLocale();
  const f = useFormat();
  const [serverCause, setServerError] = useState<unknown>();
  const [validation, setValidation] = useState<"totals" | "variance">();
  const serverError = validation ? t(validation === "totals" ? "salesWorkspace.waitTotals" : "salesWorkspace.explainVariance") : serverCause ? (isApiError(serverCause) ? localizeApiError(serverCause, locale).message : t("salesWorkspace.closeFailed")) : undefined;
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
      setValidation(undefined);
    }
  }, [open]);

  const counted = useMemo(
    () => DENOMS.reduce((sum, d) => sum + (counts[d.label] ?? 0) * d.minor, 0),
    [counts],
  );
  const expected = useMemo(() => authoritativeExpectedCash(shift, totalsQuery.data), [shift, totalsQuery.data]);
  const variance = expected === undefined ? undefined : counted - expected;

  const mutation = useApiMutation(
    (api) =>
      api.closeCashShift(shift.id, {
        countedCash: money(counted, currency),
        varianceExplanation: explanation || undefined,
      }),
    {
      onSuccess: async (closed) => {
        await invalidate();
        onOpenChange(false);
        onClosed?.(closed);
      },
      onError: (e) => setServerError(e),
    },
  );

  const totals = expected === undefined ? undefined : totalsQuery.data?.totals;
  const totalsUnavailable = !totalsQuery.isLoading && !totalsQuery.isError && expected === undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("salesWorkspace.closeShift")}</DialogTitle>
          <DialogDescription>
            {t("salesWorkspace.closeHint", { date: isolate(f.dateTime(shift.openedAt)), name: isolate(shift.openedByName) })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {open ? <ChecklistHandover branchId={shift.branchId} /> : null}
          {/* Expected story */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
            <ExpectCell currency={currency} label={t("salesWorkspace.startingCash")} minor={expected === undefined ? undefined : shift.openingFloat.amount} />
            <ExpectCell currency={currency} label={t("salesWorkspace.cashTaken")} minor={totals?.cashPayments.amount} sign="+" />
            <ExpectCell currency={currency} label={t("salesWorkspace.cashRefunds")} minor={totals?.cashRefunds.amount} sign="−" />
            <ExpectCell currency={currency} label={t("salesWorkspace.paidSuppliers")} minor={totals === undefined ? undefined : totals.supplierCashPayments.amount - totals.supplierCashReversals.amount} sign="−" />
            <ExpectCell currency={currency} label={t("salesWorkspace.expected")} minor={expected} strong />
          </div>
          {totalsQuery.isLoading ? <p role="status" className="text-[12px] text-ink-3">{t("salesWorkspace.loadingTotals")}</p> : null}
          {totalsQuery.isError ? <ErrorState title={t("salesWorkspace.totalsFailed")} description={t("salesWorkspace.totalsRetryHint")} onRetry={() => { void totalsQuery.refetch(); }} /> : null}
          {totalsUnavailable ? <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2.5 text-[12.5px] text-warning-deep">{t("salesWorkspace.shiftChanged")}</p> : null}
          {totals ? (
            <p className="text-[12px] text-ink-3 tabular">
              {t("salesWorkspace.shiftSummary", { payments: t("salesWorkspace.paymentCount", { count: totals.paymentCount }), card: isolate(f.money(totals.cardPayments, { hideCurrency: true })), transfers: isolate(f.money(totals.transferPayments, { hideCurrency: true })), refunds: t("salesWorkspace.refundCount", { count: totals.refundCount }) })}
            </p>
          ) : null}

          {/* Denominations */}
          <div>
            <p className="context-label mb-2">{t("salesWorkspace.countDrawer")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DENOMS.map((d) => (
                <label key={d.label} className="block">
                  <span className="mb-1 block text-[12px] text-ink-3 tabular">{d.label}</span>
                  <Input
                    type="text"
                    dir="ltr"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="0"
                    value={counts[d.label] ?? ""}
                    onChange={(e) => { const value = latinDigits(e.target.value); if (/^\d{0,8}$/.test(value)) setCounts((c) => ({ ...c, [d.label]: Number(value) })); }}
                    aria-label={t("salesWorkspace.denomination", { amount: d.label, currency: locale === "ar" && currency === "JOD" ? "د.أ" : currency })}
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
              variance === undefined ? "border-line bg-sunken/40" : variance === 0 ? "border-success/40 bg-success-bg/60" : "border-warning/50 bg-warning-bg/60",
            )}
            data-testid="variance-panel"
          >
            <div>
              <p className="text-[12px] text-ink-2">
                {t("salesWorkspace.countedExpected", { counted: isolate(f.money(money(counted, currency))), expected: expected === undefined ? t("common.state.loading") : isolate(f.money(money(expected, currency))) })}
              </p>
              <p className={cn("mt-0.5 text-[15px] font-semibold tabular", variance === undefined ? "text-ink-3" : variance === 0 ? "text-success-deep" : "text-warning-deep")}>
                {variance === undefined ? t("salesWorkspace.waitingTotals") : variance === 0 ? t("salesWorkspace.cashMatches") : t(variance > 0 ? "salesWorkspace.cashOver" : "salesWorkspace.cashShort", { amount: isolate(f.money(money(variance, currency), { signDisplay: "always" })) })}
              </p>
            </div>
          </div>

          {variance !== undefined && variance !== 0 ? (
            <Field label={t("salesWorkspace.varianceWhy")} required hint={t("salesWorkspace.managerReview")}>
              <Textarea
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={t("salesWorkspace.varianceExample")}
                data-testid="variance-explanation"
              />
            </Field>
          ) : null}
          {serverError ? <p role="alert" className="text-[12.5px] text-danger">{serverError}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button
            onClick={() => {
              setServerError(null);
              setValidation(undefined);
              if (expected === undefined || variance === undefined) {
                setValidation("totals");
                return;
              }
              if (variance !== 0 && explanation.trim().length < 5) {
                setValidation("variance");
                return;
              }
              mutation.mutate();
            }}
            loading={mutation.isPending}
            disabled={expected === undefined}
            variant={variance === 0 ? "primary" : "signal"}
            data-testid="confirm-close-shift"
          >
            {t("salesWorkspace.closeCounted", { amount: isolate(f.money(money(counted, currency))) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpectCell({ label, minor, sign, strong, currency }: { label: string; minor?: number; sign?: string; strong?: boolean; currency: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="context-label">{label}</p>
      <p className={cn("mt-0.5 text-[14px] tabular", strong && "font-semibold")}>
        {minor === undefined ? "—" : <bdi dir="ltr">{sign}{toMajorString(money(minor, currency))}</bdi>}
      </p>
    </div>
  );
}
