"use client";

import {
  AlertTriangle,
  Ban,
  Banknote,
  CheckCircle2,
  CornerDownLeft,
  Lock,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { CheckInPreview, CheckInResult, MembershipSummary } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { formatTime, todayISODate } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { Button } from "@/components/ui/button";
import { Kbd, Monogram } from "@/components/ui/misc";
import { ForbiddenState } from "@/components/ui/states";
import { CollectPaymentDialog } from "@/features/membership-actions/payment-dialog";
import { MembershipSaleDialog } from "@/features/membership-actions/sale-dialog";
import { REASON_CODE_LABELS } from "@/features/reception/reason-codes";
import { OverrideCheckInDialog } from "@/features/reception/reception-dialogs";
import { CloseShiftDialog, OpenShiftDialog } from "@/features/finance/shift-dialogs";

export default function ReceptionPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();

  // Reception is a concrete branch lane. An organization-wide scope or a
  // stale persisted branch must fail closed instead of silently using the
  // first branch in the session.
  const branchId = visibleBranchId(session?.branches, session?.activeBranchId);
  const branch = session?.branches.find((b) => b.id === branchId);
  const currency = session?.organization.currency ?? "JOD";

  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 180);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [dialog, setDialog] = useState<"override" | "collect" | "renew" | "openShift" | "closeShift" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gate on the live *and* debounced query. Checking only the debounced value
  // would keep the previous member's verdict on screen for one debounce window
  // after the lane is cleared — at a busy desk that reads as the wrong person.
  const lookupActive = query.trim().length >= 3 && debounced.trim().length >= 3;

  // Lookup — runs as the receptionist types or a scanner dumps a member number
  const previewQuery = useApiQuery(
    ["checkin", "preview", branchId, debounced],
    (api) => api.previewCheckIn({ branchId: branchId!, query: debounced }),
    { enabled: Boolean(branchId) && lookupActive && !result, staleTime: 0 },
  );

  const occupancyQuery = useRealtimeApiQuery({
    queryKey: qk.occupancy(branchId ?? ""),
    query: (api) => api.getOccupancy(branchId!),
    subscribe: (api, onValue, onError) => api.subscribeOccupancy(branchId!, onValue, onError),
    enabled: Boolean(branchId),
  });

  const today = todayISODate(session?.organization.timezone ?? "Asia/Amman");
  const recentInput = { branchId, date: today, acceptedOnly: true, pageSize: 100 } as const;
  const recentQuery = useRealtimeApiQuery({
    queryKey: qk.checkIns(recentInput),
    query: (api) => api.listRecentCheckIns(recentInput),
    subscribe: (api, onValue, onError) => api.subscribeRecentCheckIns(recentInput, onValue, onError),
    enabled: Boolean(branchId),
  });

  const shiftQuery = useRealtimeApiQuery({
    queryKey: qk.shiftTotals(branchId ?? ""),
    query: (api) => api.getCurrentShiftTotals(branchId!),
    subscribe: (api, onValue, onError) => api.subscribeCurrentShiftTotals(branchId!, onValue, onError),
    enabled: Boolean(branchId),
  });

  const preview = lookupActive ? previewQuery.data : undefined;

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  /** After a decision is recorded, hold it briefly then reset for the next person. */
  const resetLane = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = null;
    setResult(null);
    setQuery("");
    focusInput();
  }, [focusInput]);

  useEffect(() => () => (clearTimer.current ? clearTimeout(clearTimer.current) : undefined), []);

  const checkIn = useApiMutation((api) => api.createCheckIn({ memberId: preview!.member!.id, branchId: branchId!, source: query.trim().startsWith("rivet-pass.") ? "qr" : "search", ...(query.trim().startsWith("rivet-pass.") ? { entryPassToken: query.trim() } : {}) }), {
    onSuccess: async (res) => {
      setResult(res);
      await invalidate();
      if (res.decision !== "blocked") {
        clearTimer.current = setTimeout(resetLane, 3200);
      }
    },
  });

  // Keyboard: Enter commits, Escape clears, any keystroke returns focus to the lane
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        resetLane();
        return;
      }
      if (e.key === "Enter" && !result && preview?.found && preview.decision !== "blocked" && !checkIn.isPending) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target === document.body) {
          e.preventDefault();
          checkIn.mutate();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview, result, checkIn, resetLane]);

  if (!can("members.read")) {
    return <ForbiddenState description="The reception console needs member lookup permission." />;
  }

  if (!branchId || !branch) {
    return (
      <ForbiddenState
        description="Pick a single branch from the branch selector — the desk works one door at a time."
      />
    );
  }

  const shift = shiftQuery.data;
  const shown = result ?? preview;
  const decision = result?.decision ?? preview?.decision;
  const member = result?.member ?? preview?.member;
  const membership = result?.membership ?? preview?.membership;
  const committed = result !== null;

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-night sm:-mx-6 lg:-mx-8" data-console>
      {/* Shift strip — cash is gated on an open drawer */}
      <ShiftStrip
        shift={shift?.shift ?? null}
        expected={shift ? { amount: shift.shift.openingFloat.amount + shift.totals.cashPayments.amount - shift.totals.cashRefunds.amount, currency } : null}
        cashTaken={shift?.totals.cashPayments ?? null}
        currency={currency}
        canOpen={can("reconciliation.open_shift")}
        canClose={can("reconciliation.close_shift")}
        onOpen={() => setDialog("openShift")}
        onClose={() => setDialog("closeShift")}
      />

      <div className="grid flex-1 gap-px bg-night-line lg:grid-cols-[1fr_330px]">
        {/* ---------------------------------------------------------------- */}
        {/* Lane */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col bg-night px-5 py-5 lg:px-8 lg:py-7">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="eyebrow-night">Front desk · {branch.name}</p>
              <h1 className="mt-1 font-display text-[22px] font-semibold tracking-tight text-night-ink">
                Check in
              </h1>
            </div>
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-night-ink-3">
              <ScanLine className="size-3.5" aria-hidden /> Scanner ready
            </p>
          </div>

          {/* Search lane */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-night-ink-3" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                if (clearTimer.current) clearTimeout(clearTimer.current);
                setResult(null);
                setQuery(e.target.value);
              }}
              placeholder="Scan, or type a name, phone or number"
              aria-label="Member lookup"
              autoComplete="off"
              spellCheck={false}
              data-testid="reception-search"
              className="h-16 w-full rounded-lg border border-night-line bg-night-2 ps-12 pe-14 font-mono text-[18px] text-night-ink placeholder:text-night-ink-3/70 transition-colors hover:border-night-ink-3/40 focus:border-night-ink-2 focus:outline-none sm:pe-28"
            />
            <div className="absolute end-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {query ? (
                <button
                  type="button"
                  onClick={resetLane}
                  aria-label="Clear"
                  className="rounded-sm p-1 text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              ) : null}
              <span className="hidden items-center gap-1 font-mono text-[10.5px] uppercase tracking-wider text-night-ink-3 sm:flex">
                <Kbd className="border-night-line bg-night-3 text-night-ink-2">Esc</Kbd> clear
              </span>
            </div>
          </div>

          {/* Verdict */}
          <div className="mt-5 flex-1">
            {!shown ? (
              <IdleState />
            ) : previewQuery.isLoading && !result ? (
              <div className="rounded-lg border border-night-line bg-night-2 p-6" role="status" aria-label="Looking up member">
                <div className="h-4 w-40 animate-pulse rounded-sm bg-night-3" />
                <div className="mt-3 h-10 w-64 animate-pulse rounded-sm bg-night-3" />
              </div>
            ) : !member ? (
              <NoMatchState message={preview?.message ?? "No match."} query={debounced} canCreate={can("members.write")} />
            ) : (
              <VerdictPanel
                decision={decision!}
                message={result?.message ?? preview?.message ?? ""}
                reasonCodes={result?.reasonCodes ?? preview?.reasonCodes ?? []}
                criticalNotes={preview?.criticalNotes}
                member={member}
                membership={membership}
                occurredAt={result?.occurredAt}
                committed={committed}
                busy={checkIn.isPending}
                canOverride={can("checkins.override")}
                canCollect={can("payments.collect")}
                canSell={can("memberships.sell")}
                cashBlocked={!shift}
                onCheckIn={() => checkIn.mutate()}
                onOverride={() => setDialog("override")}
                onCollect={() => setDialog("collect")}
                onRenew={() => setDialog("renew")}
                onNext={resetLane}
              />
            )}
          </div>

          {/* Keyboard legend */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-night-line pt-4 font-mono text-[10.5px] uppercase tracking-wider text-night-ink-3">
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">
                <CornerDownLeft className="size-2.5" />
              </Kbd>
              check in
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">Esc</Kbd> next member
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">⌘</Kbd>
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">K</Kbd> command palette
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right rail: today's attendance log */}
        {/* ---------------------------------------------------------------- */}
        <aside className="flex min-w-0 flex-col bg-night-2" aria-label="Branch activity">
          <section className="border-b border-night-line px-5 py-5">
            <p className="eyebrow-night">Check-ins today</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[38px] font-medium leading-none tabular text-night-ink">
                {recentQuery.data?.totalItems ?? "—"}
              </span>
              <span className="text-[13px] text-night-ink-3">recorded visits</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <dt className="eyebrow-night">Branch</dt>
                <dd className="mt-0.5 truncate text-[13px] text-night-ink">{branch.name}</dd>
              </div>
              <div>
                <dt className="eyebrow-night">Peak hour</dt>
                <dd className="mt-0.5 text-[15px] tabular text-night-ink">{occupancyQuery.data?.peakHour ?? "—"}</dd>
              </div>
            </dl>
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <p className="eyebrow-night border-b border-night-line px-5 py-3">Today&apos;s check-in log</p>
            <ul className="flex-1 divide-y divide-night-line/70 overflow-y-auto">
              {(recentQuery.data?.items ?? []).length === 0 ? (
                <li className="px-5 py-8 text-center text-[12.5px] text-night-ink-3">No check-ins yet today.</li>
              ) : (
                (recentQuery.data?.items ?? []).map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5 px-5 py-2.5">
                    <span className="mt-0.5 text-[11px] tabular text-night-ink-3">{formatTime(c.occurredAt)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-night-ink">{c.memberName}</p>
                      <p className="truncate font-mono text-[10px] text-night-ink-3">{c.memberNumber}</p>
                      {c.overrideReason ? (
                        <p className="truncate text-[11px] text-night-ink-3" title={c.overrideReason}>
                          override · {c.overrideReason}
                        </p>
                      ) : null}
                    </div>
                    <DecisionDot decision={c.decision} />
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>
      </div>

      {/* Dialogs */}
      {preview?.found && preview.member ? (
        <OverrideCheckInDialog
          open={dialog === "override"}
          onOpenChange={(v) => setDialog(v ? "override" : null)}
          preview={preview as CheckInPreview}
          branchId={branchId}
          actorName={session?.user.name ?? "you"}
          onOverridden={(res) => {
            setResult(res);
            clearTimer.current = setTimeout(resetLane, 3200);
          }}
        />
      ) : null}
      {member ? (
        <CollectPaymentDialog
          open={dialog === "collect"}
          onOpenChange={(v) => setDialog(v ? "collect" : null)}
          member={member}
          onCollected={() => {
            setDialog(null);
            void previewQuery.refetch();
          }}
        />
      ) : null}
      {member ? (
        <MembershipSaleDialog
          open={dialog === "renew"}
          onOpenChange={(v) => setDialog(v ? "renew" : null)}
          member={member}
          renewalOf={membership as MembershipSummary | undefined}
          onCompleted={() => {
            setDialog(null);
            void previewQuery.refetch();
          }}
        />
      ) : null}
      <OpenShiftDialog
        open={dialog === "openShift"}
        onOpenChange={(v) => setDialog(v ? "openShift" : null)}
        branchId={branchId}
        onOpened={() => {
          setDialog(null);
          void invalidate();
        }}
      />
      {shift ? (
        <CloseShiftDialog
          open={dialog === "closeShift"}
          onOpenChange={(v) => setDialog(v ? "closeShift" : null)}
          shift={shift.shift}
          onClosed={() => {
            setDialog(null);
            void invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shift strip
// ---------------------------------------------------------------------------

function ShiftStrip({
  shift,
  expected,
  cashTaken,
  currency,
  canOpen,
  canClose,
  onOpen,
  onClose,
}: {
  shift: { id: string; openedByName: string; openedAt: string; openingFloat: { amount: number; currency: string } } | null;
  expected: { amount: number; currency: string } | null;
  cashTaken: { amount: number; currency: string } | null;
  currency: string;
  canOpen: boolean;
  canClose: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  if (!shift) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-night-line bg-night-2 px-5 py-2.5 lg:px-8">
        <Lock className="size-3.5 text-warning" aria-hidden />
        <p className="text-[12.5px] text-night-ink-2">
          <span className="font-medium text-night-ink">No shift open.</span> Check-ins work, but cash collection is disabled until the
          drawer is counted.
        </p>
        {canOpen ? (
          <Button size="xs" variant="night" className="ms-auto" onClick={onOpen} data-testid="open-shift">
            Open shift
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-night-line bg-night-2 px-5 py-2.5 lg:px-8">
      <span className="flex items-center gap-2 text-[12.5px] text-night-ink-2">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        Shift open · {shift.openedByName}
      </span>
      <span className="text-[11.5px] tabular text-night-ink-3">
        since {formatTime(shift.openedAt)} · float {formatMoney(shift.openingFloat, { hideCurrency: true })}
      </span>
      {cashTaken ? (
        <span className="text-[11.5px] tabular text-night-ink-3">
          cash taken {formatMoney(cashTaken, { hideCurrency: true })}
        </span>
      ) : null}
      {expected ? (
        <span className="text-[11.5px] tabular text-night-ink-2">
          expected {formatMoney(expected, { hideCurrency: true })} {currency}
        </span>
      ) : null}
      <div className="ms-auto flex items-center gap-2">
        <Button asChild size="xs" variant="night-ghost">
          <Link href="/payments/shifts">Shift history</Link>
        </Button>
        {canClose ? (
          <Button size="xs" variant="night-outline" onClick={onClose} data-testid="close-shift">
            Close shift
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function IdleState() {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-night-line px-6 py-10 text-center">
      <ScanLine className="size-6 text-night-ink-3" aria-hidden />
      <p className="mt-3 font-display text-[15px] font-medium text-night-ink-2">Ready for the next member</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-night-ink-3">
        Scan their code or start typing. Three characters is enough to match a name, phone or member number.
      </p>
    </div>
  );
}

function NoMatchState({ message, query, canCreate }: { message: string; query: string; canCreate: boolean }) {
  return (
    <div className="rounded-lg border border-night-line bg-night-2 px-6 py-8 text-center">
      <p className="font-display text-[16px] font-medium text-night-ink">{message}</p>
      <p className="mt-1 text-[12.5px] text-night-ink-3">Check the spelling, or try the phone number instead.</p>
      {canCreate ? (
        <Button asChild size="sm" variant="night-outline" className="mt-4">
          <Link href={`/members/new?name=${encodeURIComponent(query)}`}>
            <UserPlus /> Register as a new member
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict panel — the one thing the receptionist reads
// ---------------------------------------------------------------------------

const VERDICT: Record<
  string,
  { band: string; label: string; icon: typeof CheckCircle2 }
> = {
  allowed: { band: "bg-success text-white", label: "Allowed", icon: CheckCircle2 },
  warning: { band: "bg-warning text-white", label: "Let in — with a notice", icon: AlertTriangle },
  blocked: { band: "bg-signal text-white", label: "Blocked", icon: Ban },
  overridden: { band: "bg-ink text-paper", label: "Overridden", icon: ShieldAlert },
};

function VerdictPanel({
  decision,
  message,
  reasonCodes,
  criticalNotes,
  member,
  membership,
  occurredAt,
  committed,
  busy,
  canOverride,
  canCollect,
  canSell,
  cashBlocked,
  onCheckIn,
  onOverride,
  onCollect,
  onRenew,
  onNext,
}: {
  decision: string;
  message: string;
  reasonCodes: string[];
  criticalNotes?: string;
  member: { id: string; fullName: string; fullNameAr?: string; memberNumber: string; phone: string; currentPlanName?: string; membershipEndDate?: string; outstanding: { amount: number; currency: string } };
  membership?: MembershipSummary;
  occurredAt?: string;
  committed: boolean;
  busy: boolean;
  canOverride: boolean;
  canCollect: boolean;
  canSell: boolean;
  cashBlocked: boolean;
  onCheckIn: () => void;
  onOverride: () => void;
  onCollect: () => void;
  onRenew: () => void;
  onNext: () => void;
}) {
  const verdict = VERDICT[decision] ?? VERDICT.blocked!;
  const Icon = verdict.icon;
  const outstanding = member.outstanding;
  const hasBalance = outstanding.amount > 0;
  const meaningfulCodes = reasonCodes.filter((c) => c !== "OK");

  return (
    <div
      className="overflow-hidden rounded-lg border border-night-line bg-night-2 animate-fade-up"
      role="status"
      aria-live="polite"
      data-testid="checkin-verdict"
      data-decision={decision}
    >
      {/* Verdict band */}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3", verdict.band)}>
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className="font-display text-[17px] font-semibold tracking-tight">
          {committed && decision !== "blocked" ? `Checked in · ${formatTime(occurredAt ?? new Date().toISOString())}` : verdict.label}
        </span>
        <span className="min-w-0 break-words text-[13px] opacity-90">{message}</span>
      </div>

      {/* Identity + membership facts */}
      <div className="grid min-w-0 gap-5 px-5 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]" data-testid="checkin-summary">
        <div className="flex min-w-0 items-start gap-3" data-testid="checkin-identity">
          <Monogram name={member.fullName} size="xl" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="break-words [overflow-wrap:anywhere] font-display text-[20px] font-semibold leading-tight tracking-tight text-night-ink" dir="auto">
              {member.fullName}
            </h2>
            {member.fullNameAr ? <p className="mt-0.5 break-words [overflow-wrap:anywhere] text-[13px] text-night-ink-2" dir="rtl">{member.fullNameAr}</p> : null}
            <p className="mt-1 break-words font-mono text-[12px] text-night-ink-3" dir="ltr">
              {member.memberNumber} · {member.phone}
            </p>
          </div>
        </div>

        <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-4" data-testid="checkin-facts">
          <Cell label="Plan" value={member.currentPlanName ?? "None"} muted={!member.currentPlanName} />
          <Cell label="Expires" value={member.membershipEndDate ?? "—"} mono />
          <Cell
            label="Visits left"
            value={membership?.remainingVisits != null ? `${membership.remainingVisits}` : "—"}
            mono
            muted={membership?.remainingVisits == null}
          />
          <Cell
            label="Balance"
            value={formatMoney(outstanding, { hideCurrency: true })}
            mono
            tone={hasBalance ? "warn" : undefined}
          />
        </dl>
      </div>

      {/* Reasons */}
      {meaningfulCodes.length > 0 ? (
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-night-line px-5 py-2.5">
          {meaningfulCodes.map((code) => (
            <li key={code} className="flex min-w-0 items-center gap-1.5 break-words text-[12.5px] text-night-ink-2">
              <span className="size-1 shrink-0 rounded-full bg-night-ink-3" aria-hidden />
              {REASON_CODE_LABELS[code as keyof typeof REASON_CODE_LABELS] ?? code}
            </li>
          ))}
        </ul>
      ) : null}

      {criticalNotes ? (
        <div className="border-t border-night-line bg-signal/10 px-5 py-2.5">
          <p className="eyebrow-night text-signal">Critical note</p>
          <p className="mt-0.5 break-words text-[13px] text-night-ink">{criticalNotes}</p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-night-line bg-night px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button asChild size="sm" variant="night-ghost">
          <Link href={`/members/${member.id}`}>Open profile</Link>
        </Button>

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ms-auto">
          {hasBalance && canCollect ? (
            <Button
              size="sm"
              variant="night-outline"
              onClick={onCollect}
              disabled={cashBlocked}
              title={cashBlocked ? "Open a shift before collecting cash" : undefined}
              data-testid="quick-collect"
            >
              <Banknote /> Collect {formatMoney(outstanding, { hideCurrency: true })}
            </Button>
          ) : null}

          {canSell && (decision === "blocked" || member.membershipEndDate) ? (
            <Button size="sm" variant="night-outline" onClick={onRenew} data-testid="quick-renew">
              <RotateCcw /> {membership ? "Renew" : "Sell membership"}
            </Button>
          ) : null}

          {committed ? (
            <Button size="sm" variant="night" onClick={onNext} data-testid="next-member">
              Next member <Kbd className="border-night-line bg-night-3 text-night-ink-2">Esc</Kbd>
            </Button>
          ) : decision === "blocked" ? (
            canOverride ? (
              <Button size="sm" variant="signal" onClick={onOverride} data-testid="override-checkin">
                <ShieldAlert /> Override
              </Button>
            ) : (
              <span className="text-[12px] text-night-ink-3">A manager can override this.</span>
            )
          ) : (
            <Button size="sm" variant="night" loading={busy} onClick={onCheckIn} data-testid="confirm-checkin">
              Check in
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">
                <CornerDownLeft className="size-2.5" />
              </Kbd>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  mono,
  muted,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow-night">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-[14px]",
          mono && "tabular",
          tone === "warn" ? "text-warning" : muted ? "text-night-ink-3" : "text-night-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DecisionDot({ decision }: { decision: string }) {
  const tone =
    decision === "allowed"
      ? "bg-success"
      : decision === "warning"
        ? "bg-warning"
        : decision === "overridden"
          ? "bg-night-ink-2"
          : "bg-signal";
  return <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone)} title={decision} aria-label={decision} />;
}
