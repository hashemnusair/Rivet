"use client";
import { useLocale, useT } from "@/lib/i18n/provider";


import {
  AlertTriangle,
  Ban,
  Banknote,
  Building2,
  CheckCircle2,
  CornerDownLeft,
  Lock,
  RotateCcw,
  RefreshCw,
  ScanLine,
  Search,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { CheckInPreview, CheckInResult, CheckInSummary, MemberSummary, MembershipSummary, Session } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { todayISODate } from "@/lib/utils/dates";
import { useFormat } from "@/lib/i18n/format";
import { cn } from "@/lib/utils/cn";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { Button } from "@/components/ui/button";
import { Kbd, Monogram } from "@/components/ui/misc";
import { ForbiddenState, StatePanel } from "@/components/ui/states";
import { CollectPaymentDialog } from "@/features/membership-actions/payment-dialog";
import { MembershipSaleDialog } from "@/features/membership-actions/sale-dialog";
import { checkInMessage, lookupMessage } from "@/features/reception/checkin-copy";
import { checkInReasonLabel } from "@/features/reception/reason-codes";
import { OverrideCheckInDialog } from "@/features/reception/reception-dialogs";
import { CloseShiftDialog, OpenShiftDialog, authoritativeExpectedCash } from "@/features/finance/shift-dialogs";
import { ContextLabel } from "@/components/ui/typography";

export default function ReceptionPage() {
  const { session, setBranch } = useApp();
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat(session?.organization.timezone);
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
  const [recentPage, setRecentPage] = useState(1);
  const [dialog, setDialog] = useState<"override" | "collect" | "renew" | "openShift" | "closeShift" | null>(null);
  const [branchSelecting, setBranchSelecting] = useState<string | null>(null);
  const [branchSelectionError, setBranchSelectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const automaticBranchAttempt = useRef<string | null>(null);
  // A scanner sends its Enter before the debounced preview has resolved. Keep
  // that intent for the exact query it was pressed on, and commit only once
  // the server identifies one person by a complete identifier.
  const pendingCommit = useRef<string | null>(null);

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
  const recentInput = { branchId, date: today, acceptedOnly: true, page: recentPage, pageSize: 25 } as const;
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
  const shownMemberId = result?.member.id ?? preview?.member?.id;
  // The rail already streams today's accepted visits, so a duplicate scan can
  // say when this person actually came in instead of reading as a denial.
  const lastAcceptedCheckIn = shownMemberId ? recentQuery.data?.items.find((item) => item.memberId === shownMemberId) : undefined;

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  useEffect(() => {
    focusInput();
  }, [branchId, focusInput]);

  const chooseBranch = useCallback(async (nextBranchId: string) => {
    setBranchSelecting(nextBranchId);
    setBranchSelectionError(null);
    try {
      await setBranch(nextBranchId);
    } catch {
      setBranchSelectionError(t("deskCompletion.reception.branch.openFailed"));
    } finally {
      setBranchSelecting(null);
    }
  }, [setBranch, t]);

  // A sole accessible branch is unambiguous. This also makes branch-assigned
  // reception accounts land directly at their desk without an unnecessary
  // organization-wide intermediate state.
  useEffect(() => {
    if (branchId || session?.branches.length !== 1) return;
    const onlyBranchId = session.branches[0]!.id;
    if (automaticBranchAttempt.current === onlyBranchId) return;
    automaticBranchAttempt.current = onlyBranchId;
    void chooseBranch(onlyBranchId);
  }, [branchId, chooseBranch, session?.branches]);

  /** A recorded verdict remains visible until staff explicitly starts the next lane. */
  const resetLane = useCallback(() => {
    pendingCommit.current = null;
    setResult(null);
    setQuery("");
    focusInput();
  }, [focusInput]);

  /** A candidate's member number is a complete identifier, so it resolves to exactly one verdict. */
  const chooseCandidate = useCallback((candidate: MemberSummary) => {
    pendingCommit.current = null;
    setResult(null);
    setQuery(candidate.memberNumber);
    focusInput();
  }, [focusInput]);

  const checkIn = useApiMutation((api) => api.createCheckIn({ memberId: preview!.member!.id, branchId: branchId!, source: query.trim().startsWith("rivet-pass.") ? "qr" : "search", ...(query.trim().startsWith("rivet-pass.") ? { entryPassToken: query.trim() } : {}) }), {
    onSuccess: async (res) => {
      setResult(res);
      setRecentPage(1);
      // Leave the number selected: the next scan or keystroke replaces it
      // instead of appending to it and producing a no-match.
      inputRef.current?.focus();
      inputRef.current?.select();
      await invalidate();
    },
  });

  // Keyboard: Enter commits, Escape clears, any keystroke returns focus to the lane
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inLane = target === inputRef.current || target === document.body;
      if (e.key === "Escape") {
        resetLane();
        return;
      }
      if (e.key === "Enter" && inLane && !result && !checkIn.isPending) {
        if (preview?.found && preview.decision !== "blocked") {
          e.preventDefault();
          pendingCommit.current = null;
          checkIn.mutate();
        } else if (!preview && query.trim().length >= 3) {
          // The verdict for this exact query is still on its way.
          e.preventDefault();
          pendingCommit.current = query.trim();
        }
        return;
      }
      // A scanner types wherever focus is. Bring stray keystrokes back to the
      // lane so a scan after a closed dialog still lands in the lookup.
      if (target === document.body && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview, query, result, checkIn, resetLane]);

  // Commit a scan whose Enter arrived before the verdict, but only when the
  // server matched one person by their complete number or pass — never a
  // name fragment the desk has not looked at.
  useEffect(() => {
    const pending = pendingCommit.current;
    if (!pending || previewQuery.isFetching || !preview || result || checkIn.isPending) return;
    if (debounced.trim() !== pending) return;
    pendingCommit.current = null;
    const squeeze = (value: string) => value.toLowerCase().replace(/[\s-]/g, "");
    const exact = preview.found && preview.member && (pending.startsWith("rivet-pass.") || squeeze(preview.member.memberNumber) === squeeze(pending));
    if (exact && preview.decision !== "blocked") checkIn.mutate();
  }, [checkIn, debounced, preview, previewQuery.isFetching, result]);

  /**
   * After money or a term changes at the desk, the verdict stays what it was
   * (the visit happened at that time) but its facts must be the server's
   * current ones — otherwise a settled balance still reads as due.
   */
  const refreshShownFacts = async () => {
    const fresh = await previewQuery.refetch();
    const data = fresh.data;
    setResult((current) => {
      if (!current || !data?.found || !data.member || data.member.id !== current.member.id) return current;
      return { ...current, member: data.member, membership: data.membership ?? current.membership };
    });
  };

  if (!can("members.read")) {
    return <ForbiddenState description={t("deskCompletion.reception.access.denied")} />;
  }

  if (!branchId || !branch) {
    return (
      <ReceptionBranchState
        branches={session?.branches ?? []}
        selectingBranchId={branchSelecting}
        error={branchSelectionError}
        onSelect={(nextBranchId) => void chooseBranch(nextBranchId)}
      />
    );
  }

  const shift = shiftQuery.data;
  const shown = result ?? preview;
  const decision = result?.decision ?? preview?.decision;
  const member = result?.member ?? preview?.member;
  const membership = result?.membership ?? preview?.membership;
  // A cancelled term cannot be renewed (the server refuses); the desk sells a
  // fresh membership instead, exactly as the member record does.
  const renewalOf = membership && membership.status !== "cancelled" ? membership : undefined;
  const committed = result !== null;

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-night sm:-mx-6 lg:-mx-8" data-console>
      {/* Shift strip — cash is gated on an open drawer */}
      <ShiftStrip
        shift={shift?.shift ?? null}
        expected={shift ? { amount: authoritativeExpectedCash(shift.shift, shift) ?? shift.shift.openingFloat.amount, currency } : null}
        cashTaken={shift?.totals.cashPayments ?? null}
        loading={shiftQuery.isLoading && shift === undefined}
        error={shiftQuery.isError}
        stale={shiftQuery.isBackgroundError || shiftQuery.streamState === "fallback"}
        canOpen={can("reconciliation.open_shift")}
        canClose={can("reconciliation.close_shift")}
        onOpen={() => setDialog("openShift")}
        onClose={() => setDialog("closeShift")}
        onRetry={() => void shiftQuery.refetch()}
      />

      <div className="grid flex-1 gap-px bg-night-line lg:grid-cols-[1fr_330px]">
        {/* ---------------------------------------------------------------- */}
        {/* Lane */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col bg-night px-5 py-5 lg:px-8 lg:py-7">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <ContextLabel tone="night">{t("deskCompletion.reception.branch.frontDesk")} · {isolate(branch.name)}</ContextLabel>
              <h1 className="mt-1 font-display text-[22px] font-semibold tracking-tight text-night-ink">
                {t("deskCompletion.reception.lookup.checkInTitle")}
              </h1>
            </div>
            <ContextLabel tone="night" className="flex items-center gap-1.5">
              <ScanLine className="size-3.5" aria-hidden /> {t("deskCompletion.reception.lookup.scannerReady")}
            </ContextLabel>
          </div>

          {/* Search lane */}
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-night-ink-3" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                pendingCommit.current = null;
                setResult(null);
                setQuery(e.target.value);
              }}
              dir="auto"
              placeholder={t("deskCompletion.reception.lookup.placeholder")}
              aria-label={t("deskCompletion.reception.lookup.label")}
              autoComplete="off"
              spellCheck={false}
              data-testid="reception-search"
              className="h-16 w-full rounded-lg border border-night-line bg-night-2 ps-12 pe-14 text-[18px] text-night-ink placeholder:text-night-ink-3/70 transition-colors hover:border-night-ink-3/40 focus:border-night-ink-2 focus:outline-none sm:pe-28"
            />
            <div className="absolute end-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {query ? (
                <button
                  type="button"
                  onClick={resetLane}
                  aria-label={t("reception.lookup.clear")}
                  className="rounded-sm p-1 text-night-ink-3 transition-colors hover:bg-night-3 hover:text-night-ink cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              ) : null}
              <span className="hidden items-center gap-1 text-[12px] text-night-ink-3 sm:flex">
                <Kbd className="border-night-line bg-night-3 text-night-ink-2">{t("reception.lookup.esc")}</Kbd> {t("deskCompletion.reception.lookup.clearHint")}
              </span>
            </div>
          </div>

          {/* Verdict */}
          <div className="mt-5 flex-1">
            {!lookupActive && !result ? (
              <IdleState />
            ) : previewQuery.isLoading && !result && !preview ? (
              <div className="rounded-lg border border-night-line bg-night-2 p-6" role="status" aria-label={t("deskCompletion.reception.lookup.searching")}>
                <div className="h-4 w-40 animate-pulse rounded-sm bg-night-3" />
                <div className="mt-3 h-10 w-64 animate-pulse rounded-sm bg-night-3" />
              </div>
            ) : previewQuery.isError && !result && !preview ? (
              <LookupErrorState onRetry={() => void previewQuery.refetch()} />
            ) : !shown ? (
              <IdleState />
            ) : !member ? (
              preview?.candidates && preview.candidates.length > 1 ? (
                <CandidatesState message={preview.message} query={debounced} candidates={preview.candidates} branches={session?.branches ?? []} onChoose={chooseCandidate} />
              ) : (
                <NoMatchState message={preview?.message ?? ""} query={debounced} canCreate={can("members.write")} />
              )
            ) : (
              <VerdictPanel
                decision={decision!}
                message={result?.message ?? preview?.message ?? ""}
                reasonCodes={result?.reasonCodes ?? preview?.reasonCodes ?? []}
                criticalNotes={preview?.criticalNotes}
                member={member}
                membership={membership}
                occurredAt={result?.occurredAt}
                today={today}
                actorName={session?.user.name}
                committed={committed}
                busy={checkIn.isPending}
                canOverride={can("checkins.override")}
                canCollect={can("payments.collect")}
                canSell={can("memberships.sell")}
                cashBlocked={!shift}
                renewable={Boolean(renewalOf)}
                lastAcceptedCheckIn={lastAcceptedCheckIn}
                onCheckIn={() => checkIn.mutate()}
                onOverride={() => setDialog("override")}
                onCollect={() => setDialog("collect")}
                onRenew={() => setDialog("renew")}
                onNext={resetLane}
              />
            )}
          </div>

          {/* Keyboard legend */}
          <ContextLabel as="div" tone="night" className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-night-line pt-4">
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">
                <CornerDownLeft className="size-2.5" />
              </Kbd>
              {t("deskCompletion.reception.lookup.checkInAction")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">{t("reception.lookup.esc")}</Kbd> {t("deskCompletion.reception.lookup.nextMember")}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">⌘</Kbd>
              <Kbd className="border-night-line bg-night-3 text-night-ink-2">K</Kbd>{" "}{t("common.action.search")}</span>
          </ContextLabel>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right rail: today's attendance log */}
        {/* ---------------------------------------------------------------- */}
        <aside className="flex min-w-0 flex-col bg-night-2" aria-label={t("reception.activity.label")}>
          <section className="border-b border-night-line px-5 py-5">
            <ContextLabel tone="night">{t("reception.activity.checkInsToday")}</ContextLabel>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[38px] font-medium leading-none tabular text-night-ink">
                {recentQuery.data ? f.number(recentQuery.data.totalItems) : "—"}
              </span>
              <span className="text-[13px] text-night-ink-3">{t("deskCompletion.reception.activity.visits", { count: recentQuery.data?.totalItems ?? 0 })}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <ContextLabel as="dt" tone="night">{t("reception.activity.branch")}</ContextLabel>
                <dd className="mt-0.5 truncate text-[13px] text-night-ink"><bdi>{branch.name}</bdi></dd>
              </div>
              <div>
                <ContextLabel as="dt" tone="night">{t("deskCompletion.reception.activity.busiestHour")}</ContextLabel>
                <dd className="mt-0.5 text-[15px] tabular text-night-ink">{f.clock(occupancyQuery.data?.peakHour)}</dd>
              </div>
            </dl>
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <ContextLabel tone="night" className="border-b border-night-line px-5 py-3">{t("deskCompletion.reception.activity.logTitle")}</ContextLabel>
            <ul className="flex-1 divide-y divide-night-line/70 overflow-y-auto">
              {(recentQuery.data?.items ?? []).length === 0 ? (
                <li className="px-5 py-8 text-center text-[12.5px] text-night-ink-3">{t("reception.activity.noCheckIns")}</li>
              ) : (
                (recentQuery.data?.items ?? []).map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5 px-5 py-2.5">
                    <time dateTime={c.occurredAt} className="mt-0.5 text-[12px] tabular text-night-ink-3">{f.time(c.occurredAt)}</time>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] text-night-ink"><bdi>{c.memberName}</bdi></p>
                      <p className="truncate font-mono text-[10.5px] text-night-ink-3">{c.memberNumber}</p>
                      {c.overrideReason ? (
                        <p className="truncate text-[12px] text-night-ink-3" title={c.overrideReason}>
                          {t("deskCompletion.reception.activity.overrideLabel", { reason: isolate(c.overrideReason) })}
                        </p>
                      ) : null}
                    </div>
                    <DecisionDot decision={c.decision} />
                  </li>
                ))
              )}
            </ul>
            {recentQuery.data && recentQuery.data.totalPages > 1 ? (
              <div className="flex items-center justify-between gap-2 border-t border-night-line px-4 py-2.5 text-[12px] text-night-ink-3">
                <span className="tabular">
                  {t("deskCompletion.reception.activity.rangeOfTotal", { from: isolateLtr(f.number((recentQuery.data.page - 1) * recentQuery.data.pageSize + 1)), to: isolateLtr(f.number(Math.min(recentQuery.data.totalItems, recentQuery.data.page * recentQuery.data.pageSize))), total: isolateLtr(f.number(recentQuery.data.totalItems)) })}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="xs" variant="night-ghost" disabled={recentQuery.data.page <= 1} onClick={() => setRecentPage((page) => Math.max(1, page - 1))} aria-label={t("deskCompletion.reception.activity.previousPageAria")}>
                    {t("deskCompletion.reception.activity.previousPage")}
                  </Button>
                  <span className="min-w-10 text-center tabular" dir="ltr">{f.number(recentQuery.data.page)}/{f.number(recentQuery.data.totalPages)}</span>
                  <Button size="xs" variant="night-ghost" disabled={recentQuery.data.page >= recentQuery.data.totalPages} onClick={() => setRecentPage((page) => page + 1)} aria-label={t("deskCompletion.reception.activity.nextPageAria")}>{t("deskCompletion.reception.activity.nextPage")}</Button>
                </div>
              </div>
            ) : null}
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
            setRecentPage(1);
          }}
        />
      ) : null}
      {member ? (
        <CollectPaymentDialog
          open={dialog === "collect"}
          onOpenChange={(v) => setDialog(v ? "collect" : null)}
          member={member}
          branchId={branchId}
          cashDrawerOpen={Boolean(shift)}
          onCollected={() => {
            void refreshShownFacts();
          }}
        />
      ) : null}
      {member ? (
        <MembershipSaleDialog
          open={dialog === "renew"}
          onOpenChange={(v) => setDialog(v ? "renew" : null)}
          member={member}
          renewalOf={renewalOf}
          branchId={branchId}
          cashDrawerOpen={Boolean(shift)}
          onCompleted={() => {
            setDialog(null);
            void refreshShownFacts();
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

function ReceptionBranchState({
  branches,
  selectingBranchId,
  error,
  onSelect,
}: {
  branches: Session["branches"];
  selectingBranchId: string | null;
  error: string | null;
  onSelect: (branchId: string) => void;
}) {
  const { t, isolate } = useLocale();
  if (branches.length === 0) {
    return (
      <StatePanel
        icon={Building2}
        title={t("deskCompletion.reception.branch.none")}
        description={t("deskCompletion.reception.branch.noneDescription")}
      />
    );
  }

  const openingOnlyBranch = branches.length === 1;
  return (
    <StatePanel
      icon={Building2}
      title={t(openingOnlyBranch ? "deskCompletion.reception.branch.opening" : "deskCompletion.reception.branch.choose")}
      description={openingOnlyBranch
        ? t("deskCompletion.reception.branch.openingDescription", { branch: isolate(branches[0]!.name) })
        : t("deskCompletion.reception.branch.chooseDescription")}
      action={
        openingOnlyBranch ? (
          error ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[12px] text-danger" role="alert">{error}</p>
              <Button
                type="button"
                variant="secondary"
                loading={selectingBranchId === branches[0]!.id}
                onClick={() => onSelect(branches[0]!.id)}
              >{t("common.action.retry")}</Button>
            </div>
          ) : null
        ) : (
          <div className="flex max-w-xl flex-wrap justify-center gap-2" aria-label={t("deskCompletion.reception.branch.aria")}>
            {branches.map((candidate) => (
              <Button
                key={candidate.id}
                type="button"
                variant="secondary"
                size="lg"
                loading={selectingBranchId === candidate.id}
                disabled={selectingBranchId !== null}
                onClick={() => onSelect(candidate.id)}
              >
                <Building2 aria-hidden />
                <bdi>{candidate.name}</bdi>
              </Button>
            ))}
            {error ? <p className="basis-full pt-1 text-[12px] text-danger" role="alert">{error}</p> : null}
          </div>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Shift strip
// ---------------------------------------------------------------------------

function ShiftStrip({
  shift,
  expected,
  cashTaken,
  loading,
  error,
  stale,
  canOpen,
  canClose,
  onOpen,
  onClose,
  onRetry,
}: {
  shift: { id: string; openedByName: string; openedAt: string; openingFloat: { amount: number; currency: string } } | null;
  expected: { amount: number; currency: string } | null;
  cashTaken: { amount: number; currency: string } | null;
  loading: boolean;
  error: boolean;
  stale: boolean;
  canOpen: boolean;
  canClose: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  if (loading) {
    return (
      <div className="flex min-h-11 items-center gap-3 border-b border-night-line bg-night-2 px-5 py-2.5 lg:px-8" role="status">
        <span className="size-2 animate-pulse rounded-full bg-night-ink-3" aria-hidden />
        <p className="text-[12.5px] text-night-ink-2">{t("deskCompletion.reception.strip.checking")}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-warning/30 bg-warning/10 px-5 py-2.5 lg:px-8" role="alert">
        <AlertTriangle className="size-3.5 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 text-[12.5px] text-night-ink-2"><span className="font-medium text-night-ink">{t("deskCompletion.reception.strip.checkFailed")}</span> {t("deskCompletion.reception.strip.cashUnavailable")}</p>
        <Button size="xs" variant="night-outline" onClick={onRetry}><RefreshCw />{" "}{t("common.action.retry")}</Button>
      </div>
    );
  }
  if (!shift) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-night-line bg-night-2 px-5 py-2.5 lg:px-8">
        <Lock className="size-3.5 text-warning" aria-hidden />
        <p className="text-[12.5px] text-night-ink-2">
          <span className="font-medium text-night-ink">{t("reception.shift.none")}</span> {t("deskCompletion.reception.strip.openPrompt")}
        </p>
        {canOpen ? (
          <Button size="xs" variant="night" className="ms-auto" onClick={onOpen} data-testid="open-shift">{t("dashboard.reception.openShift")}</Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-night-line bg-night-2 px-5 py-2.5 lg:px-8">
      <span className="flex items-center gap-2 text-[12.5px] text-night-ink-2">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        {t("deskCompletion.reception.strip.openBy", { actor: isolate(shift.openedByName) })}
      </span>
      <span className="text-[12px] tabular text-night-ink-3">
        {t("deskCompletion.reception.strip.sinceAndStart", { time: isolate(f.time(shift.openedAt)), amount: isolate(f.money(shift.openingFloat)) })}
      </span>
      {cashTaken ? (
        <span className="text-[12px] tabular text-night-ink-3">
          {t("deskCompletion.reception.strip.cashTaken", { amount: isolate(f.money(cashTaken)) })}
        </span>
      ) : null}
      {expected ? (
        <span className="text-[12px] tabular text-night-ink-2">
          {t("deskCompletion.reception.strip.expected", { amount: isolate(f.money(expected)) })}
        </span>
      ) : null}
      <div className="ms-auto flex items-center gap-2">
        {stale ? <span className="text-[12px] text-warning">{t("deskCompletion.reception.strip.reconnecting")}</span> : null}
        <Button asChild size="xs" variant="night-ghost">
          <Link href="/payments/shifts">{t("reception.shift.history")}</Link>
        </Button>
        {canClose ? (
          <Button size="xs" variant="night-outline" onClick={onClose} data-testid="close-shift">
            {t("deskCompletion.reception.strip.close")}
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
  const t = useT();
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-night-line px-6 py-10 text-center">
      <ScanLine className="size-6 text-night-ink-3" aria-hidden />
      <p className="mt-3 font-display text-[15px] font-medium text-night-ink-2">{t("reception.lookup.ready")}</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-night-ink-3">
        {t("deskCompletion.reception.lookup.idleDescription", { count: "3" })}
      </p>
    </div>
  );
}

function LookupErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-warning/35 bg-night-2 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="mx-auto size-5 text-warning" aria-hidden />
      <p className="mt-3 font-display text-[16px] font-medium text-night-ink">{t("deskCompletion.reception.lookup.lookupFailedTitle")}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-night-ink-3">{t("deskCompletion.reception.lookup.lookupFailedDescription")}</p>
      <Button type="button" size="sm" variant="night-outline" className="mt-4" onClick={onRetry}><RefreshCw />{" "}{t("common.action.retry")}</Button>
    </div>
  );
}

function NoMatchState({ message, query, canCreate }: { message: string; query: string; canCreate: boolean }) {
  const { t, locale, isolate } = useLocale();
  const localizedMessage = lookupMessage({ message, query, locale, t, isolate });
  // A number typed at the desk is the new member's phone, not their name.
  const looksLikePhone = /^\+?[\d\s()-]{6,}$/.test(query.trim());
  const registerHref = looksLikePhone
    ? `/members/new?phone=${encodeURIComponent(query.trim())}`
    : `/members/new?name=${encodeURIComponent(query.trim())}`;
  return (
    <div className="rounded-lg border border-night-line bg-night-2 px-6 py-8 text-center">
      <p className="font-display text-[16px] font-medium text-night-ink">{localizedMessage}</p>
      <p className="mt-1 text-[12.5px] text-night-ink-3">{t("reception.lookup.checkSpelling")}</p>
      {canCreate ? (
        <Button asChild size="sm" variant="night-outline" className="mt-4">
          <Link href={registerHref}>
            <UserPlus /> {t("deskCompletion.reception.lookup.addMember")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Several people matched. The desk picks one before any verdict is shown —
 * the console never decides for the first name in the list.
 */
function CandidatesState({
  message,
  query,
  candidates,
  branches,
  onChoose,
}: {
  message: string;
  query: string;
  candidates: MemberSummary[];
  branches: Session["branches"];
  onChoose: (candidate: MemberSummary) => void;
}) {
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const localizedMessage = lookupMessage({ message, query, candidateCount: candidates.length, locale, t, isolate });
  return (
    <div className="overflow-hidden rounded-lg border border-night-line bg-night-2 animate-fade-up" data-testid="checkin-candidates" role="region" aria-label={t("deskCompletion.reception.lookup.chooseMember")}>
      <div className="border-b border-night-line px-5 py-3">
        <p className="font-display text-[16px] font-medium text-night-ink">{localizedMessage}</p>
        <p className="mt-0.5 text-[12.5px] text-night-ink-3">{t("deskCompletion.reception.lookup.skipCandidates")}</p>
      </div>
      <ul className="divide-y divide-night-line/70">
        {candidates.map((candidate) => {
          // A branch outside this account's scope still needs a truthful label.
          const branchName = branches.find((b) => b.id === candidate.homeBranchId)?.name ?? t("deskCompletion.reception.lookup.anotherBranch");
          return (
            <li key={candidate.id}>
              <button
                type="button"
                onClick={() => onChoose(candidate)}
                className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-5 py-3 text-start transition-colors hover:bg-night-3 focus-visible:bg-night-3 focus-visible:outline-none"
                data-testid="checkin-candidate"
              >
                <Monogram name={candidate.fullName} size="sm" className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-night-ink" dir="auto">
                <bdi>{candidate.fullName}</bdi>
                    {candidate.fullNameAr ? (
                      <>
                        {/* A logical start margin on an RTL span lands on its right, so separate with a dot instead. */}
                        <span className="mx-1.5 text-night-ink-3" aria-hidden>·</span>
                        <span className="text-[12.5px] font-normal text-night-ink-2" dir="rtl">{candidate.fullNameAr}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="block truncate font-mono text-[11.5px] text-night-ink-3" dir="ltr">
                    {candidate.memberNumber} · {candidate.phone}
                  </span>
                </span>
                <span className="hidden shrink-0 text-end text-[12px] text-night-ink-2 sm:block">
                  <span className="block">{candidate.status === "archived" ? t("members.list.archived") : candidate.currentPlanName ?? t("deskCompletion.reception.lookup.noMembership")}</span>
                  <span className="block text-night-ink-3">
                    <bdi>{branchName}</bdi>
                    {candidate.outstanding.amount > 0 ? " · " + t("deskCompletion.reception.lookup.amountOwed", { amount: f.money(candidate.outstanding) }) : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdict panel — the one thing the receptionist reads
// ---------------------------------------------------------------------------

const VERDICT: Record<string, { band: string; key: import("@/lib/i18n/core").TKey; icon: typeof CheckCircle2 }> = {
  allowed: { band: "bg-success text-white", key: "deskCompletion.reception.verdict.allowed", icon: CheckCircle2 },
  warning: { band: "bg-warning text-white", key: "deskCompletion.reception.verdict.warning", icon: AlertTriangle },
  blocked: { band: "bg-signal text-white", key: "deskCompletion.reception.verdict.blocked", icon: Ban },
  overridden: { band: "bg-ink text-paper", key: "deskCompletion.reception.verdict.overridden", icon: ShieldAlert },
  duplicate: { band: "bg-night-3 text-night-ink", key: "deskCompletion.reception.verdict.duplicate", icon: CheckCircle2 },
};

function VerdictPanel({
  decision,
  message,
  reasonCodes,
  criticalNotes,
  member,
  membership,
  occurredAt,
  today,
  actorName,
  committed,
  busy,
  canOverride,
  canCollect,
  canSell,
  cashBlocked,
  renewable,
  lastAcceptedCheckIn,
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
  today: string;
  actorName?: string;
  committed: boolean;
  busy: boolean;
  canOverride: boolean;
  canCollect: boolean;
  canSell: boolean;
  cashBlocked: boolean;
  renewable: boolean;
  lastAcceptedCheckIn?: CheckInSummary;
  onCheckIn: () => void;
  onOverride: () => void;
  onCollect: () => void;
  onRenew: () => void;
  onNext: () => void;
}) {
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const duplicateScan = decision === "blocked" && reasonCodes.includes("DUPLICATE_SCAN");
  const verdict = duplicateScan ? VERDICT.duplicate! : (VERDICT[decision] ?? VERDICT.blocked!);
  const Icon = verdict.icon;
  const outstanding = member.outstanding;
  const hasBalance = outstanding.amount > 0;
  const meaningfulCodes = reasonCodes.filter((c) => c !== "OK" && !(duplicateScan && c === "DUPLICATE_SCAN"));
  const shownMessage = duplicateScan && lastAcceptedCheckIn
    ? t("deskCompletion.reception.message.duplicateAt", {
        time: f.time(lastAcceptedCheckIn.occurredAt),
        actor: lastAcceptedCheckIn.actorName
          ? t("deskCompletion.reception.message.duplicateByActor", { actor: isolate(lastAcceptedCheckIn.actorName) })
          : "",
      })
    : checkInMessage({ message, reasonCodes, decision, locale, t, isolate, today, formatDate: f.date, membership, actorName });
  // A future term has a start, not an expiry; a past one has already ended.
  const termLabel = membership?.status === "scheduled" ? t("renewFlow.adjust.planChange.starts") : membership?.status === "expired" ? t("deskCompletion.reception.verdict.termEnded") : t("crm.queues.ends");
  const termValue = f.date(membership?.status === "scheduled" ? membership.startDate : member.membershipEndDate);

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
          {committed && decision !== "blocked" ? t("deskCompletion.reception.verdict.checkedInAt", { time: f.time(occurredAt ?? new Date().toISOString()) }) : t(verdict.key)}
        </span>
        <span className="min-w-0 break-words text-[13px] opacity-90">{shownMessage}</span>
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
          <Cell label={t("reception.member.plan")} value={member.currentPlanName ?? t("deskCompletion.reception.verdict.noPlan")} muted={!member.currentPlanName} />
          <Cell label={termLabel} value={termValue} mono />
          <Cell
            label={t("reception.member.visitsLeft")}
            value={membership?.remainingVisits != null ? f.number(membership.remainingVisits) : "—"}
            mono
            muted={membership?.remainingVisits == null}
          />
          <Cell
            label={t("members.list.columns.balance")}
            value={f.money(outstanding)}
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
              {checkInReasonLabel(code, t)}
            </li>
          ))}
        </ul>
      ) : null}

      {criticalNotes ? (
        <div className="border-t border-night-line bg-signal/10 px-5 py-2.5">
          <ContextLabel tone="night" className="text-signal">{t("deskCompletion.reception.verdict.importantNote")}</ContextLabel>
            <p className="mt-0.5 break-words text-[13px] text-night-ink"><bdi>{criticalNotes}</bdi></p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-col gap-3 border-t border-night-line bg-night px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
        <Button asChild size="sm" variant="night-ghost">
          <Link href={`/members/${member.id}`}>{t("deskCompletion.reception.verdict.profile")}</Link>
        </Button>

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ms-auto">
          {hasBalance && canCollect ? (
            <Button
              size="sm"
              variant="night-outline"
              onClick={onCollect}
              title={cashBlocked ? t("deskCompletion.reception.verdict.tipNoCash") : undefined}
              data-testid="quick-collect"
            >
              <Banknote />{" "}{t("memberProfile.header.collect")}{" "}{f.money(outstanding)}
            </Button>
          ) : null}

          {canSell && (decision === "blocked" || member.membershipEndDate) ? (
            <Button size="sm" variant="night-outline" onClick={onRenew} data-testid="quick-renew">
              <RotateCcw /> {renewable ? t("memberProfile.header.renew") : t("renewFlow.sale.titleSell")}
            </Button>
          ) : null}

          {committed || duplicateScan ? (
            <>
              {duplicateScan && !committed && canOverride ? (
                <Button size="sm" variant="night-ghost" onClick={onOverride} data-testid="override-checkin">
                  <ShieldAlert /> {t("deskCompletion.reception.verdict.checkInAgain")}
                </Button>
              ) : null}
              <Button size="sm" variant="night" onClick={onNext} data-testid="next-member">
                {t("deskCompletion.reception.lookup.nextMember")} <Kbd className="border-night-line bg-night-3 text-night-ink-2">{t("reception.lookup.esc")}</Kbd>
              </Button>
            </>
          ) : decision === "blocked" ? (
            canOverride ? (
              <Button size="sm" variant="signal" onClick={onOverride} data-testid="override-checkin">
                <ShieldAlert />{" "}{t("domain.checkInDecision.overridden")}</Button>
            ) : (
              <span className="text-[12px] text-night-ink-3">{t("deskCompletion.reception.verdict.onlyManager")}</span>
            )
          ) : (
            <Button size="sm" variant="night" loading={busy} onClick={onCheckIn} data-testid="confirm-checkin">
              {t("deskCompletion.reception.verdict.checkIn")}
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
      <ContextLabel as="dt" tone="night">{label}</ContextLabel>
      <dd
        className={cn(
          "mt-0.5 truncate text-[14px]",
          mono && "tabular",
          tone === "warn" ? "text-warning" : muted ? "text-night-ink-3" : "text-night-ink",
        )}
      >
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}

function DecisionDot({ decision }: { decision: string }) {
  const t = useT();
  const tone =
    decision === "allowed"
      ? "bg-success"
      : decision === "warning"
        ? "bg-warning"
        : decision === "overridden"
          ? "bg-night-ink-2"
          : "bg-signal";
  // Name the dot in desk words, never the stored decision key.
  const label = t(VERDICT[decision]?.key ?? VERDICT.blocked!.key);
  return <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", tone)} title={label} aria-label={label} />;
}
