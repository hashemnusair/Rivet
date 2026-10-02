"use client";
import { useT } from "@/lib/i18n/provider";

import { ArrowLeft, ArrowRight, GraduationCap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
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

/**
 * A plain-language walkthrough of the management ledger for owners who are
 * not accountants. Each step pairs two sentences with a small animated
 * vignette; the vignettes remount per step so their settle animations replay.
 * Motion is direction-neutral (scale, rotate, stroke draw) so RTL layouts
 * need no mirroring, and the global reduced-motion rule flattens all of it.
 */

function FactChip({ label, delay }: { label: string; delay: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 animate-fade-up"
      style={{ animationDelay: delay }}
    >
      <span className="size-1.5 rounded-full bg-signal" aria-hidden />
      {label}
    </span>
  );
}

function NotebookArt() {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <FactChip label="Payment · JOD 350" delay="0.1s" />
        <FactChip label="Shop sale" delay="0.35s" />
        <FactChip label="Machine repair" delay="0.6s" />
      </div>
      <span className="text-ink-3 animate-fade-up" style={{ animationDelay: "0.8s" }} aria-hidden>
        ↓
      </span>
      <div className="w-44 rounded-md border border-line bg-surface p-3 shadow-card animate-pin-pop" style={{ animationDelay: "1s" }}>
        <p className="context-label">Ledger</p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 rounded bg-line" />
          <div className="h-1.5 rounded bg-line" />
          <div className="h-1.5 w-2/3 rounded bg-line" />
        </div>
      </div>
    </div>
  );
}

function QueueRow({ label, badge, hint, delay }: { label: string; badge: ReactNode; hint?: string; delay: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium">{label}</p>
        {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
      </div>
      <span className="animate-fade-up" style={{ animationDelay: delay }}>{badge}</span>
    </div>
  );
}

function QueueArt() {
  const t = useT();
  return (
    <div className="relative flex h-44 flex-col justify-center gap-2 overflow-hidden px-2">
      <div
        className="pointer-events-none absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-signal/10 to-transparent animate-qr-scan"
        aria-hidden
      />
      <QueueRow label={t("crm.lead.membershipSale")} badge={<Badge variant="warning">Ready to add</Badge>} delay="0.5s" />
      <QueueRow label="Machine purchase" badge={<Badge variant="warning">Ready to add</Badge>} delay="0.8s" />
      <QueueRow
        label="Stock change"
        hint="Needs a unit cost before it can be added."
        badge={<Badge variant="neutral">Needs setup</Badge>}
        delay="1.1s"
      />
    </div>
  );
}

function BalanceArt() {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center">
        <div className="animate-ledger-tilt" style={{ animationDelay: "0.25s" }}>
          <div className="flex items-end justify-between gap-10">
            <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px]" dir="ltr">355</span>
            <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px]" dir="ltr">355</span>
          </div>
          <div className="mt-1 h-1 w-48 rounded-full bg-ink" />
        </div>
        <div className="h-6 w-1 bg-ink" aria-hidden />
        <div className="size-0 border-x-[12px] border-b-[14px] border-x-transparent border-b-ink" aria-hidden />
      </div>
      <span className="animate-fade-up" style={{ animationDelay: "1.2s" }}>
        <Badge variant="success">Balanced</Badge>
      </span>
    </div>
  );
}

function IncomeArt() {
  return (
    <div className="flex h-44 items-end justify-center gap-6 pb-2">
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-28 w-14 origin-bottom rounded-t-md bg-success-deep/80 animate-bar-rise" />
        <p className="text-[12px] text-ink-2">Earned</p>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-16 w-14 origin-bottom rounded-t-md bg-ink/30 animate-bar-rise" style={{ animationDelay: "0.25s" }} />
        <p className="text-[12px] text-ink-2">Spent</p>
      </div>
      <div className="mb-8 animate-fade-up" style={{ animationDelay: "0.9s" }}>
        <Badge variant="success">Net income</Badge>
      </div>
    </div>
  );
}

function BalanceSheetArt() {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-3">
      <div className="flex items-end gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex h-28 w-20 origin-bottom items-center justify-center rounded-md border border-line bg-sunken animate-bar-rise">
            <p className="text-[12px] font-medium text-ink-2">Own</p>
          </div>
        </div>
        <p className="pb-12 text-[14px] font-semibold text-ink-3" aria-hidden>=</p>
        <div className="flex h-28 flex-col justify-end gap-2">
          <div className="flex h-16 w-20 origin-bottom items-center justify-center rounded-md border border-line bg-sunken animate-bar-rise" style={{ animationDelay: "0.2s" }}>
            <p className="text-[12px] font-medium text-ink-2">Owe</p>
          </div>
          <div className="flex h-10 w-20 origin-bottom items-center justify-center rounded-md border border-line bg-sunken animate-bar-rise" style={{ animationDelay: "0.4s" }}>
            <p className="text-[12px] font-medium text-ink-2">Yours</p>
          </div>
        </div>
      </div>
      <span className="animate-fade-up" style={{ animationDelay: "1s" }}>
        <Badge variant="success">Difference 0.000</Badge>
      </span>
    </div>
  );
}

function CashflowArt() {
  return (
    <div className="flex h-44 items-center justify-center gap-5">
      <div className="flex h-32 flex-col justify-between py-1 text-[12px] text-ink-3">
        <span>Closing</span>
        <span>Opening</span>
      </div>
      <div className="relative h-32 w-20 overflow-hidden rounded-md border border-line bg-surface">
        <div className="absolute inset-x-0 bottom-0 h-full origin-bottom bg-success-deep/25 animate-ledger-fill" />
        <div className="absolute inset-x-0 bottom-[18%] border-t border-dashed border-ink/40" aria-hidden />
      </div>
      <span className="animate-fade-up" style={{ animationDelay: "1.1s" }}>
        <Badge variant="success">Matches</Badge>
      </span>
    </div>
  );
}

function RoutineCheck({ label, delay }: { label: string; delay: string }) {
  return (
    <div className="flex items-center gap-2.5 animate-fade-up" style={{ animationDelay: delay }}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="10" className="fill-surface stroke-line" strokeWidth="1.5" />
        <path
          d="m7.5 12.5 3 3 6-7"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-current text-success-deep animate-ledger-draw"
          style={{ strokeDasharray: 20, strokeDashoffset: 20, animationDelay: `calc(${delay} + 0.2s)` }}
        />
      </svg>
      <p className="text-[12.5px] font-medium">{label}</p>
    </div>
  );
}

function RoutineArt() {
  return (
    <div className="flex h-44 flex-col justify-center gap-3 px-6">
      <RoutineCheck label="Refresh the list" delay="0.1s" />
      <RoutineCheck label="Add what is ready" delay="0.5s" />
      <RoutineCheck label="Read your statements" delay="0.9s" />
    </div>
  );
}

const TUTORIAL_STEPS: readonly { key: string; context: string; title: string; body: string; art: () => ReactNode }[] = [
  {
    key: "notebook",
    context: "The notebook",
    title: "One honest notebook",
    body: "Every payment, shop sale, repair and machine purchase becomes a line in one book. The numbers only come from what you add to it.",
    art: NotebookArt,
  },
  {
    key: "queue",
    context: "The list",
    title: "Refresh finds new items",
    body: "Press Refresh list to find sales and costs that can go into the books. Ready to add means it can go in now. Needs setup means something is missing, and the row says what.",
    art: QueueArt,
  },
  {
    key: "posting",
    context: "Adding to the books",
    title: "You add it, and it balances",
    body: "Adding an item makes a journal entry. Every debit has an equal credit, so the books always balance. Entries are never deleted. To fix one, you reverse it.",
    art: BalanceArt,
  },
  {
    key: "income",
    context: "Income statement",
    title: "What you earned and spent",
    body: "This covers the dates you choose. Money earned minus money spent is your net income, or profit.",
    art: IncomeArt,
  },
  {
    key: "balance",
    context: "Balance sheet",
    title: "A photo of one day",
    body: "What you own equals what you owe plus what is yours. The page checks this for you. The difference should always be 0.000.",
    art: BalanceSheetArt,
  },
  {
    key: "cashflow",
    context: "Cash flow",
    title: "Follow the real cash",
    body: "It starts with your opening cash, shows what came in and went out, and ends with your closing cash. It is checked against your cash accounts.",
    art: CashflowArt,
  },
  {
    key: "routine",
    context: "Your routine",
    title: "Two clicks a month",
    body: "Refresh the list, add what is ready, then read your statements. A warning is not an error. It asks you to check before you trust the totals.",
    art: RoutineArt,
  },
];

export function LedgerTutorial() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = TUTORIAL_STEPS[stepIndex]!;
  const lastStep = stepIndex === TUTORIAL_STEPS.length - 1;

  const openTutorial = () => {
    setStepIndex(0);
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="ledger-tutorial">
      <Button type="button" variant="secondary" onClick={openTutorial}>
        <GraduationCap /> How the ledger works
      </Button>
      <p className="text-[12px] text-ink-3">New to accounting? A two-minute guide to how it all works.</p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>How the ledger works</DialogTitle>
            <DialogDescription>Seven short steps. No accounting knowledge needed.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div key={step.key} className="rounded-md border border-line bg-sunken/30">
              {step.art()}
            </div>
            <div>
              <p className="context-label">
                {step.context} · {stepIndex + 1} of {TUTORIAL_STEPS.length}
              </p>
              <h3 className="mt-1 text-[16px] font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.body}</p>
            </div>
            <p className="sr-only" aria-live="polite">
              Step {stepIndex + 1} of {TUTORIAL_STEPS.length}: {step.title}
            </p>
          </DialogBody>
          <DialogFooter className="items-center">
            <Button type="button" variant="ghost" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
              <ArrowLeft className="rtl:rotate-180" />{" "}{t("common.action.back")}</Button>
            <div className="mx-auto flex items-center gap-1.5" role="tablist" aria-label="Tutorial steps">
              {TUTORIAL_STEPS.map((candidate, index) => (
                <button
                  key={candidate.key}
                  type="button"
                  role="tab"
                  aria-selected={index === stepIndex}
                  aria-label={`Step ${index + 1}: ${candidate.title}`}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    index === stepIndex ? "bg-ink" : "bg-line hover:bg-ink-3",
                  )}
                  onClick={() => setStepIndex(index)}
                />
              ))}
            </div>
            {lastStep ? (
              <Button type="button" onClick={() => setOpen(false)}>{t("common.action.done")}</Button>
            ) : (
              <Button type="button" onClick={() => setStepIndex((index) => Math.min(TUTORIAL_STEPS.length - 1, index + 1))}>{t("common.action.next")}{" "}<ArrowRight className="rtl:rotate-180" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
