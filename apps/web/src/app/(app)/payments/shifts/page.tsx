"use client";

import { Check, Lock, LockOpen, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { CashShift } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatDateTime, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { canReviewCashVariance, cashShiftHistoryStatus } from "@/lib/domain/reconciliation";
import { MoneyText } from "@/components/shared/data-display";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { useT } from "@/lib/i18n/provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton, TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CloseShiftDialog, OpenShiftDialog } from "@/features/finance/shift-dialogs";
import { FinanceNav } from "@/features/finance/finance-nav";

export default function ShiftsPage() {
  const t = useT();
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const canPickBranch = session?.roles[0] === "owner" || session?.roles[0] === "manager" || session?.roles[0] === "auditor";
  const [branchId, setBranchId] = useState(session?.activeBranchId ?? session?.branches[0]?.id ?? "");
  const effectiveBranch = canPickBranch ? branchId || session?.branches[0]?.id || "" : (session?.activeBranchId ?? session?.branches[0]?.id ?? "");
  const [date, setDate] = useState(todayISODate());
  const [page, setPage] = useState(1);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftTarget, setCloseShiftTarget] = useState<CashShift | null>(null);
  const [varianceReview, setVarianceReview] = useState<{ shiftId: string; decision: "approved" | "rejected" } | null>(null);
  const [varianceReviewNote, setVarianceReviewNote] = useState("");

  const currentShiftQuery = useApiQuery(qk.currentShift(effectiveBranch), (api) => api.getCurrentCashShift(effectiveBranch), {
    enabled: Boolean(effectiveBranch),
  });
  const totalsQuery = useApiQuery(qk.shiftTotals(effectiveBranch), (api) => api.getCurrentShiftTotals(effectiveBranch), {
    enabled: Boolean(effectiveBranch) && Boolean(currentShiftQuery.data),
  });
  const reconQuery = useApiQuery(qk.reconciliation(effectiveBranch, date), (api) =>
    api.getDailyReconciliation({ branchId: effectiveBranch, date }),
  { enabled: Boolean(effectiveBranch) && can("reports.financial.read") });
  const historyQuery = useApiQuery(qk.shifts({ branchId: effectiveBranch, page }), (api) =>
    api.listCashShifts({ branchId: effectiveBranch, page, pageSize: 10 }),
  { enabled: Boolean(effectiveBranch) });

  const reviewVariance = useApiMutation(
    (api, v: { shiftId: string; decision: "approved" | "rejected"; note: string }) => api.reviewVariance(v.shiftId, { decision: v.decision, note: v.note }),
    {
      onSuccess: async (_d, v) => {
        toast.success(`Variance ${v.decision}.`);
        setVarianceReview(null);
        setVarianceReviewNote("");
        await invalidate();
      },
    },
  );

  const currentShift = currentShiftQuery.data;
  const totals = totalsQuery.data?.totals;
  const recon = reconQuery.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Shifts & cash"
        description="Open the drawer, collect all day, close with a count — variances get reviewed, not ignored."
        actions={
          <div className="flex items-center gap-2">
            {canPickBranch ? (
              <Select value={effectiveBranch} onValueChange={setBranchId}>
                <SelectTrigger sizeVariant="sm" className="w-48" aria-label="Branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {session?.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Gate permission="reconciliation.open_shift">
              {!currentShift ? (
                <Button onClick={() => setOpenShiftOpen(true)} data-testid="open-shift-page">
                  <LockOpen /> Open shift
                </Button>
              ) : null}
            </Gate>
          </div>
        }
      />

      <FinanceNav />

      {/* Current shift */}
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            {currentShift ? (
              <>
                <span className="size-2 rounded-full bg-success" aria-hidden /> Shift open — {session?.branches.find((b) => b.id === effectiveBranch)?.name}
              </>
            ) : (
              <>
                <Lock className="size-3.5 text-ink-3" /> No open shift
              </>
            )}
          </h2>
          {currentShift ? (
            <Gate permission="reconciliation.close_shift">
              <Button variant="signal" size="sm" onClick={() => setCloseShiftTarget(currentShift)} data-testid="close-shift">
                Close shift…
              </Button>
            </Gate>
          ) : null}
        </header>
        {currentShiftQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : currentShift ? (
          <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-5">
            <Cell label="Opened" value={formatDateTime(currentShift.openedAt)} sub={currentShift.openedByName} />
            <Cell label="Float" value={<MoneyText money={currentShift.openingFloat} />} />
            <Cell label="Cash in" value={<MoneyText money={totals?.cashPayments ?? money(0)} />} />
            <Cell label="Expected in drawer" value={<MoneyText money={money(currentShift.openingFloat.amount + (totals?.cashPayments.amount ?? 0) - (totals?.cashRefunds.amount ?? 0))} />} strong />
            <Cell label="Payments" value={<span className="tabular">{totals?.paymentCount ?? 0}</span>} sub={`${totals?.refundCount ?? 0} refunds`} />
          </div>
        ) : (
          <p className="px-4 py-6 text-[13px] text-ink-3">
            Open a shift to collect cash at this branch. Card and transfer payments work regardless.
          </p>
        )}
      </section>

      {/* Daily reconciliation */}
      <Gate
        permission="reports.financial.read"
        fallback={
          <section className="panel p-4">
            <p className="text-[13px] text-ink-3">Daily reconciliation totals are visible to owner, manager and auditor roles.</p>
          </section>
        }
      >
        <section className="panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Daily reconciliation</h2>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" aria-label="Reconciliation date" />
          </header>
          {reconQuery.isLoading ? (
            <div className="p-4">
              <Skeleton className="h-24 w-full" />
            </div>
          ) : reconQuery.isError ? (
            <div className="p-4">
              <ErrorState onRetry={() => reconQuery.refetch()} />
            </div>
          ) : recon ? (
            <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
              <Table containerClassName="">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Method</TableHead>
                    <TableHead className="text-end">Payments</TableHead>
                    <TableHead className="text-end">Refunds</TableHead>
                    <TableHead className="text-end">Net</TableHead>
                    <TableHead className="text-end">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.totalsByMethod.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-[13px] text-ink-3">
                        No payments recorded on this date.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recon.totalsByMethod.map((row) => (
                      <TableRow key={row.method}>
                        <TableCell className="text-[13px]">{t(`domain.paymentMethod.${row.method}`)}</TableCell>
                        <TableCell className="text-end"><MoneyText money={row.payments} /></TableCell>
                        <TableCell className="text-end">{row.refunds.amount > 0 ? <MoneyText money={money(-row.refunds.amount)} /> : "—"}</TableCell>
                        <TableCell className="text-end font-medium"><MoneyText money={row.net} /></TableCell>
                        <TableCell className="text-end tabular text-ink-2">{row.count}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="border-t border-line lg:border-s lg:border-t-0">
                <dl className="space-y-2.5 p-4 text-[13px]">
                  <ReconRow label="Collected"><MoneyText money={recon.totalCollected} /></ReconRow>
                  <ReconRow label="Refunded"><MoneyText money={money(-recon.totalRefunded.amount)} /></ReconRow>
                  <ReconRow label="Discounts given"><MoneyText money={recon.discountsTotal} /></ReconRow>
                  <div className="border-t border-line pt-2.5">
                    <ReconRow label="Cash variance" strong>
                      <span className={cn(recon.totalVariance.amount !== 0 && "font-semibold text-warning-deep")}>
                        <MoneyText money={recon.totalVariance} signed />
                      </span>
                    </ReconRow>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </section>
      </Gate>

      {/* History */}
      <section className="panel overflow-hidden">
        <header className="border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Shift history</h2>
        </header>
        {historyQuery.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : (historyQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState compact title="No shifts yet" className="border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Opened by</TableHead>
                <TableHead className="text-end">Float</TableHead>
                <TableHead className="text-end">Expected</TableHead>
                <TableHead className="text-end">Counted</TableHead>
                <TableHead className="text-end">Variance</TableHead>
                <TableHead>Status</TableHead>
                <Gate permission="reconciliation.approve_variance">
                  <TableHead aria-label="Review" />
                </Gate>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyQuery.data!.items.map((s) => {
                const historyStatus = cashShiftHistoryStatus(s);
                return (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-[12.5px]">{formatDateTime(s.openedAt)}</TableCell>
                  <TableCell className="text-[12.5px] text-ink-2">{s.openedByName}</TableCell>
                  <TableCell className="text-end"><MoneyText money={s.openingFloat} /></TableCell>
                  <TableCell className="text-end">{s.expectedCash ? <MoneyText money={s.expectedCash} /> : "—"}</TableCell>
                  <TableCell className="text-end">{s.countedCash ? <MoneyText money={s.countedCash} /> : "—"}</TableCell>
                  <TableCell className={cn("text-end", s.variance && s.variance.amount !== 0 && "font-semibold text-warning-deep")}>
                    {s.variance ? <MoneyText money={s.variance} signed /> : "—"}
                  </TableCell>
                  <TableCell>
                    {s.status === "open" ? (
                      <Badge variant="success" dot>open</Badge>
                    ) : historyStatus === "variance_pending" ? (
                      <Badge variant="warning">variance pending</Badge>
                    ) : historyStatus === "variance_approved" ? (
                      <Badge variant="neutral">variance approved</Badge>
                    ) : historyStatus === "variance_rejected" ? (
                      <Badge variant="signal">variance rejected</Badge>
                    ) : (
                      <Badge variant="outline">balanced</Badge>
                    )}
                  </TableCell>
                  <Gate permission="reconciliation.approve_variance">
                    <TableCell className="text-end">
                      {canReviewCashVariance(s) ? (
                        <span className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Approve variance"
                            title={s.varianceExplanation ?? "Approve"}
                            onClick={() => setVarianceReview({ shiftId: s.id, decision: "approved" })}
                          >
                            <Check className="text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Reject variance"
                            onClick={() => setVarianceReview({ shiftId: s.id, decision: "rejected" })}
                          >
                            <X className="text-danger" />
                          </Button>
                        </span>
                      ) : s.varianceExplanation ? (
                        <span className="block max-w-44 truncate text-[11px] text-ink-3" title={s.varianceExplanation}>
                          {s.varianceExplanation}
                        </span>
                      ) : null}
                    </TableCell>
                  </Gate>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {historyQuery.data ? (
          <div className="px-4 pb-2">
            <DataPagination page={historyQuery.data} onPage={setPage} />
          </div>
        ) : null}
      </section>

      <OpenShiftDialog open={openShiftOpen} onOpenChange={setOpenShiftOpen} branchId={effectiveBranch} onOpened={async () => {
        toast.success("Shift open.");
        await invalidate();
      }} />
      <Dialog open={Boolean(varianceReview)} onOpenChange={(open) => {
        if (!open) {
          setVarianceReview(null);
          setVarianceReviewNote("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{varianceReview?.decision === "approved" ? "Approve cash variance" : "Reject cash variance"}</DialogTitle>
            <DialogDescription>This exception decision is immutable and records your reason in the audit trail.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="grid gap-2 text-[13px] font-medium">
              Decision reason
              <Textarea value={varianceReviewNote} onChange={(event) => setVarianceReviewNote(event.target.value)} placeholder="What evidence supports this decision?" autoFocus />
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => { setVarianceReview(null); setVarianceReviewNote(""); }}>Cancel</Button>
            <Button
              variant={varianceReview?.decision === "rejected" ? "danger" : "primary"}
              loading={reviewVariance.isPending}
              disabled={!varianceReviewNote.trim() || !varianceReview}
              onClick={() => varianceReview && reviewVariance.mutate({ ...varianceReview, note: varianceReviewNote.trim() })}
            >
              {varianceReview?.decision === "approved" ? "Approve variance" : "Reject variance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {closeShiftTarget ? (
        <CloseShiftDialog
          open
          onOpenChange={(v) => !v && setCloseShiftTarget(null)}
          shift={closeShiftTarget}
          onClosed={async (closed) => {
            setCloseShiftTarget(null);
            toast.success(
              closed.variance && closed.variance.amount !== 0
                ? `Shift closed with a variance — sent for manager review.`
                : "Shift closed — drawer balanced.",
            );
            await invalidate();
          }}
        />
      ) : null}
    </div>
  );
}

function Cell({ label, value, sub, strong }: { label: string; value: React.ReactNode; sub?: string; strong?: boolean }) {
  return (
    <div className="px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      <div className={cn("mt-1 text-[16px] tabular", strong && "font-semibold")}>{value}</div>
      {sub ? <p className="mt-0.5 text-[11px] text-ink-3">{sub}</p> : null}
    </div>
  );
}

function ReconRow({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={cn("text-ink-3", strong && "text-ink")}>{label}</dt>
      <dd className={cn(strong && "font-semibold")}>{children}</dd>
    </div>
  );
}
