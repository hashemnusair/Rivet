"use client";

import { Check, Clock3, Undo2 } from "lucide-react";
import type { SupportPaymentRequest } from "@/lib/api/GymOSApi";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

type StepStatus = "done" | "current" | "todo" | "returned";

/** What confirming the payment does for the gym. */
export type PaymentOutcome = { kind: "upgrade"; plan: string } | { kind: "paid" } | { kind: "workspace" };

/**
 * Where a payment the gym sent has got to: sent, confirmed by RIVET, and
 * what that changes. The same three steps show on the payment page and on
 * the support request that follows the payment.
 */
export function PaymentProgress({ state, outcome, returnReason, className }: { state: SupportPaymentRequest["state"]; outcome: PaymentOutcome; returnReason?: string; className?: string }) {
  const { t, isolate } = useLocale();
  const confirmed = state === "confirmed";
  const returned = state === "returned";
  const outcomeLabel = outcome.kind === "upgrade"
    ? t(confirmed ? "commerce.progress.upgraded" : "commerce.progress.upgrade", { plan: isolate(outcome.plan) })
    : outcome.kind === "workspace" ? t("commerce.progress.workspace") : t("commerce.progress.paid");
  const steps: Array<{ key: string; label: string; status: StepStatus; detail?: string }> = [
    { key: "sent", label: t(returned ? "commerce.progress.returned" : "commerce.progress.sent"), status: returned ? "returned" : "done", detail: returned ? returnReason : undefined },
    { key: "confirm", label: t(confirmed ? "commerce.progress.confirmed" : "commerce.progress.confirm"), status: confirmed ? "done" : returned ? "todo" : "current" },
    { key: "outcome", label: outcomeLabel, status: confirmed ? "done" : "todo" },
  ];
  return (
    <ol className={cn("grid gap-0", className)} aria-label={t("commerce.progress.title")} data-testid="payment-progress">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={step.status === "current" ? "step" : undefined}>
          {index < steps.length - 1 ? <span aria-hidden className={cn("absolute start-[11.5px] top-6 bottom-0 w-px", step.status === "done" ? "bg-success/50" : "bg-line-2")} /> : null}
          <span
            aria-hidden
            className={cn(
              "relative flex size-6 shrink-0 items-center justify-center rounded-full border",
              step.status === "done" && "border-success bg-success text-paper",
              step.status === "current" && "border-warning bg-warning-bg text-warning-deep",
              step.status === "returned" && "border-danger bg-danger-bg text-danger",
              step.status === "todo" && "border-line-2 bg-surface text-ink-3",
            )}
          >
            {step.status === "done" ? <Check className="size-3.5" /> : step.status === "current" ? <Clock3 className="size-3.5" /> : step.status === "returned" ? <Undo2 className="size-3.5" /> : null}
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-[13.5px] font-medium", step.status === "todo" ? "text-ink-3" : step.status === "returned" ? "text-danger" : "text-ink")}>{step.label}</p>
            {step.detail ? <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2" dir="auto">{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
