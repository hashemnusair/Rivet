"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  AccountingAccount,
  AccountingJournalEntryDetail,
  AccountingJournalEntrySummary,
  AccountingPeriod,
  AccountingSourcePosting,
  AccountingSourceStatus,
  AccountingTrialBalance,
  PostManualJournalInput,
  RefreshAccountingSourceQueueResult,
  UUID,
  WorkspaceAccess,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { todayISODate } from "@/lib/utils/dates";
import { money, parseMoneyInput } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import type { Formatters } from "@/lib/i18n/formatters";
import type { TFunction, TKey } from "@/lib/i18n/core";
import { accountingAccountName, accountingSourceReason, accountingDetailsLine } from "@/lib/i18n/accounting";
import { useOperationsNumberProblems } from "@/features/operations/operations-shared";
import { DateText, DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PageHeader, Stat } from "@/components/shared/chrome";
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
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type LedgerTab = "overview" | "journals" | "sources" | "periods";
const LEDGER_TABS: readonly LedgerTab[] = ["overview", "journals", "sources", "periods"];

function parseLedgerTab(value: string | null): LedgerTab {
  return (LEDGER_TABS as readonly string[]).includes(value ?? "") ? (value as LedgerTab) : "overview";
}

const SOURCE_STATUSES: AccountingSourceStatus[] = ["pending", "unconfigured", "excluded", "failed", "posted", "reversed"];

function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Plain names for the kinds of items that can be added to the books. */
const SOURCE_TYPE_LABELS: Record<string, TKey> = {
  payment: "ledgerWorkspace.payment",
  refund: "ledgerWorkspace.refund",
  void: "ledgerWorkspace.cancelledPayment",
  membership_sale: "ledgerWorkspace.membershipSale",
  membership_renewal: "ledgerWorkspace.membershipRenewal",
  membership_revenue_recognition: "ledgerWorkspace.monthlyMembershipIncome",
  purchase_order_receipt: "ledgerWorkspace.supplierDelivery",
  stock_movement: "ledgerWorkspace.stockChange",
  facility_supplies: "ledgerWorkspace.gymSupplies",
  equipment_acquisition: "ledgerWorkspace.equipmentPurchase",
  equipment_depreciation: "ledgerWorkspace.equipmentDepreciation",
  equipment_repair: "ledgerWorkspace.equipmentRepair",
  supplier_payment: "ledgerWorkspace.supplierPayment",
  supplier_payment_reversal: "ledgerWorkspace.supplierReversal",
};

function sourceLabel(sourceType: string, t: TFunction): string {
  return t(SOURCE_TYPE_LABELS[sourceType] ?? "ledgerWorkspace.unknown");
}

const STATEMENT_GROUP_LABELS: Record<string, TKey> = {
  asset_current: "ledgerWorkspace.assetCurrent",
  asset_noncurrent: "ledgerWorkspace.assetNoncurrent",
  liability_current: "ledgerWorkspace.liabilityCurrent",
  liability_noncurrent: "ledgerWorkspace.liabilityNoncurrent",
  equity: "ledgerWorkspace.equity",
  revenue: "ledgerWorkspace.revenue",
  cost_of_sales: "ledgerWorkspace.costOfSales",
  operating_expense: "ledgerWorkspace.operatingExpenses",
  other_income: "ledgerWorkspace.otherIncome",
  other_expense: "ledgerWorkspace.otherExpenses",
};

const CASHFLOW_GROUP_LABELS: Record<string, TKey> = {
  operating: "ledgerWorkspace.operating",
  investing: "ledgerWorkspace.investing",
  financing: "ledgerWorkspace.financing",
  non_cash: "ledgerWorkspace.nonCash",
};

function statementGroupLabel(group: string, t: TFunction): string {
  return t(STATEMENT_GROUP_LABELS[group] ?? "ledgerWorkspace.unknown");
}

function cashflowGroupLabel(group: string, t: TFunction): string {
  return t(CASHFLOW_GROUP_LABELS[group] ?? "ledgerWorkspace.unknown");
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" | "signal" {
  if (["posted", "balanced"].includes(status)) return "success";
  if (["pending", "unconfigured"].includes(status)) return "warning";
  if (["failed", "reversed", "out of balance"].includes(status)) return "danger";
  if (status === "excluded") return "signal";
  return "neutral";
}

/** Plain words for ledger statuses; the raw status still picks the colour. */
const STATUS_LABELS: Record<string, TKey> = {
  pending: "ledgerWorkspace.ready",
  unconfigured: "ledgerWorkspace.needsSetup",
  excluded: "ledgerWorkspace.excluded",
  failed: "ledgerWorkspace.failed",
  posted: "ledgerWorkspace.posted",
  reversed: "ledgerWorkspace.reversed",
  open: "ledgerWorkspace.open",
  closed: "ledgerWorkspace.closed",
  balanced: "ledgerWorkspace.balanced",
  "out of balance": "ledgerWorkspace.unbalanced",
};

function statusText(status: string, t: TFunction): string {
  return t(STATUS_LABELS[status] ?? "ledgerWorkspace.unknown");
}

function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge variant={statusVariant(status)}>
      <span className="sr-only">{t("ledgerWorkspace.statusLabel")}{" "}</span>
      {statusText(status, t)}
    </Badge>
  );
}

function branchName(branches: Array<{ id: string; name: string }>, branchId: string | undefined, t: TFunction): string {
  return branchId ? branches.find((branch) => branch.id === branchId)?.name ?? t("common.label.branch") : t("common.label.allBranches");
}


/** Periods are calendar months, so they read as "September 2026". */
function periodLabel(period: AccountingPeriod, f: Formatters): string {
  const start = new Date(`${period.periodStart}T12:00:00Z`);
  const wholeMonth = period.periodStart.endsWith("-01") && period.periodEnd.slice(0, 7) === period.periodStart.slice(0, 7);
  return wholeMonth && !Number.isNaN(start.valueOf()) ? f.monthYear(period.periodStart) : `${f.date(period.periodStart)} – ${f.date(period.periodEnd)}`;
}

function LoadingGrid() {
  const t = useT();
  return (
    <div className="space-y-4" aria-label={t("ledgerWorkspace.loadingBooks")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {["a", "b", "c"].map((key) => <Skeleton key={key} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function ReasonDialog({
  action,
  onClose,
  onSubmit,
  pending,
}: {
  action: { title: TKey; description: TKey; confirmLabel: TKey; period?: AccountingPeriod } | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const vars = { period: action?.period ? periodLabel(action.period, f) : "" };
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!action) setReason("");
  }, [action]);

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action ? t(action.title, vars) : t("ledgerWorkspace.confirmChange")}</DialogTitle>
          <DialogDescription>{action ? t(action.description, vars) : ""}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t("common.label.reason")} hint={t("ledgerWorkspace.auditHint")} required>
            <Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ledgerWorkspace.reasonExample")} required />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button type="button" loading={pending} disabled={reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>{action ? t(action.confirmLabel) : t("common.action.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type JournalLineDraft = { accountId: string; debit: string; credit: string; description: string };

function ManualJournalDialog({
  open,
  onOpenChange,
  accounts,
  branches,
  activeBranchId,
  currency,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: AccountingAccount[];
  branches: Array<{ id: string; name: string }>;
  activeBranchId?: UUID;
  currency: string;
  pending: boolean;
  onSubmit: (input: PostManualJournalInput) => void;
}) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const validate = useOperationsNumberProblems();
  // Manual journals from this workspace are always branch-scoped. The
  // organization-wide filter is deliberately read-only.
  const scope = "branch" as const;
  const [branchId, setBranchId] = useState(visibleBranchId(branches, activeBranchId) ?? "");
  const [postingDate, setPostingDate] = useState(() => todayISODate(timeZone));
  const [memo, setMemo] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [lines, setLines] = useState<JournalLineDraft[]>([
    { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
    { accountId: accounts[1]?.id ?? accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
  ]);

  useEffect(() => {
    if (!open) return;
    setBranchId(visibleBranchId(branches, activeBranchId) ?? "");
    setPostingDate(todayISODate(timeZone));
    setMemo("");
    setReason("");
    setIdempotencyKey(newKey("manual"));
    setLines([
      { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
      { accountId: accounts[1]?.id ?? accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
    ]);
  }, [open, activeBranchId, branches, accounts, timeZone]);

  const updateLine = (index: number, patch: Partial<JournalLineDraft>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const lineProblems = lines.map(line => ({ debit: validate.amount(line.debit, currency), credit: validate.amount(line.credit, currency) }));
  const invalidAmounts = lineProblems.some(line => Boolean(line.debit || line.credit));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidAmounts) return;
    const normalized = lines.map((line) => ({
      accountId: line.accountId,
      debit: parseMoneyInput(line.debit, currency) ?? money(0, currency),
      credit: parseMoneyInput(line.credit, currency) ?? money(0, currency),
      description: line.description.trim() || undefined,
    }));
    if (normalized.length < 2 || !memo.trim() || reason.trim().length < 3 || !idempotencyKey.trim()) return;
    if (!visibleBranchId(branches, branchId)) return;
    if (normalized.some((line) => !line.accountId || (line.debit.amount <= 0 && line.credit.amount <= 0))) return;
    onSubmit({
      branchId,
      scope,
      postingDate,
      memo: memo.trim(),
      reason: reason.trim(),
      idempotencyKey: idempotencyKey.trim(),
      lines: normalized,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("ledgerWorkspace.addJournalTitle")}</DialogTitle>
          <DialogDescription>{t("ledgerWorkspace.manualHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.label.branch")} hint={t("ledgerWorkspace.manualBranchHint")} required>
                <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}>
                  <SelectTrigger aria-label={t("ledgerWorkspace.entryBranch")}><SelectValue placeholder={t("members.bulk.chooseBranch")} /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{t("members.bulk.chooseBranch")}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("ledgerWorkspace.entryDate")} required><Input type="date" lang={locale} dir="ltr" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
              <Field label={t("ledgerWorkspace.description")} required><Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder={t("ledgerWorkspace.cleaningExample")} required /></Field>
            </div>
            <div className="rounded-md border border-line-2 bg-sunken/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><div><p className="context-label">{t("ledgerWorkspace.linesLabel")}</p><p className="text-[12px] text-ink-3">{t("ledgerWorkspace.amountsHint", { currency })}</p></div><Badge variant="outline">{t("ledgerWorkspace.lines", { count: lines.length })}</Badge></div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.5fr_.75fr_.75fr_1fr]">
                    <Select value={line.accountId || "none"} onValueChange={(value) => updateLine(index, { accountId: value === "none" ? "" : value })}>
                      <SelectTrigger aria-label={t("ledgerWorkspace.lineAccount", { number: f.number(index + 1) })}><SelectValue placeholder={t("ledgerWorkspace.chooseAccount")} /></SelectTrigger>
                      <SelectContent><SelectItem value="none">{t("ledgerWorkspace.chooseAccount")}</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {accountingAccountName(account.code, account.name, locale, t, account.nameAr)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" dir="ltr" aria-label={t("ledgerWorkspace.lineDebit", { number: f.number(index + 1) })} placeholder={t("ledgerWorkspace.debit")} aria-invalid={Boolean(lineProblems[index]?.debit) || undefined} aria-describedby={lineProblems[index]?.debit ? `journal-debit-${index}` : undefined} value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value })} />
                    <Input inputMode="decimal" dir="ltr" aria-label={t("ledgerWorkspace.lineCredit", { number: f.number(index + 1) })} placeholder={t("ledgerWorkspace.credit")} aria-invalid={Boolean(lineProblems[index]?.credit) || undefined} aria-describedby={lineProblems[index]?.credit ? `journal-credit-${index}` : undefined} value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value })} />
                    <Input aria-label={t("ledgerWorkspace.lineNote", { number: f.number(index + 1) })} placeholder={t("ledgerWorkspace.optionalNote")} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
                    {lineProblems[index]?.debit ? <p id={`journal-debit-${index}`} role="alert" className="text-[12px] text-danger sm:col-span-4">{lineProblems[index]!.debit}</p> : null}
                    {lineProblems[index]?.credit ? <p id={`journal-credit-${index}`} role="alert" className="text-[12px] text-danger sm:col-span-4">{lineProblems[index]!.credit}</p> : null}
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setLines((current) => [...current, { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" }])}><Plus /> {" "}{t("ledgerWorkspace.addLine")}</Button>
            </div>
            <Field label={t("common.label.reason")} hint={t("ledgerWorkspace.auditHint")} required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ledgerWorkspace.entryReasonExample")} required /></Field>
          </DialogBody>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button type="submit" loading={pending} disabled={invalidAmounts || !memo.trim() || reason.trim().length < 3 || !idempotencyKey.trim() || !visibleBranchId(branches, branchId)}>{t("ledgerWorkspace.addEntry")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrialBalanceCard({ trialBalance, loading, currency }: { trialBalance?: AccountingTrialBalance; loading: boolean; currency: string }) {
  const { t, locale } = useLocale();
  if (loading) return <Skeleton className="h-80" />;
  if (!trialBalance || trialBalance.rows.length === 0) return <EmptyState icon={Scale} title={t("ledgerWorkspace.nothingPosted")} description={t("ledgerWorkspace.balancesEmptyHint")} compact />;
  const balanced = trialBalance.totalDebit.amount === trialBalance.totalCredit.amount;
  return (
    <section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.trialBalance")} data-testid="trial-balance">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div><p className="context-label">{t("ledgerWorkspace.totalsCurrency", { currency })}</p><h2 className="mt-1 text-[16px] font-semibold">{t("ledgerWorkspace.trialBalance")}</h2><p className="mt-1 text-[12px] text-ink-3">{t("ledgerWorkspace.trialHint")}</p></div>
        <div className="flex items-center gap-2" role="status" aria-label={balanced ? t("ledgerWorkspace.match") : t("ledgerWorkspace.mismatch")}>
          {balanced ? <CheckCircle2 className="size-4 text-success-deep" aria-hidden /> : <AlertTriangle className="size-4 text-danger" aria-hidden />}
          <StatusBadge status={balanced ? "balanced" : "out of balance"} />
        </div>
      </header>
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3">
        <div className="px-4 py-3"><p className="context-label">{t("ledgerWorkspace.totalDebits")}</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalDebit} /></p></div>
        <div className="px-4 py-3"><p className="context-label">{t("ledgerWorkspace.totalCredits")}</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalCredit} /></p></div>
        <div className="col-span-2 px-4 py-3 sm:col-span-1"><p className="context-label">{t("ledgerWorkspace.difference")}</p><p className={cn("mt-1 text-[18px] font-semibold tabular", !balanced && "text-danger")}><MoneyText money={money(trialBalance.totalDebit.amount - trialBalance.totalCredit.amount, trialBalance.currency)} signed /></p></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>{t("common.label.type")}</TableHead><TableHead className="text-end">{t("ledgerWorkspace.debit")}</TableHead><TableHead className="text-end">{t("ledgerWorkspace.credit")}</TableHead><TableHead className="text-end">{t("reception.member.balance")}</TableHead></TableRow></TableHeader>
        <TableBody>{trialBalance.rows.map((row) => <TableRow key={row.accountId}><TableCell><p className="font-medium">{row.accountCode} · {accountingAccountName(row.accountCode, row.accountName, locale, t)}</p><p className="text-[12px] text-ink-3">{statementGroupLabel(row.statementGroup, t)}</p></TableCell><TableCell className="capitalize text-[12px]">{t(`accountingMessages.accountType.${row.accountType}`)}</TableCell><TableCell className="text-end"><MoneyText money={row.debit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.credit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.balance} hideCurrency signed /></TableCell></TableRow>)}</TableBody>
      </Table>
    </section>
  );
}

function AccountsCard({ accounts, loading }: { accounts: AccountingAccount[]; loading: boolean }) {
  const { t, locale } = useLocale();
  if (loading) return <Skeleton className="h-72" />;
  return (
    <section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.chartAccounts")}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("ledgerWorkspace.accountsLabel")}</p><h2 className="mt-1 text-[16px] font-semibold">{t("ledgerWorkspace.chartAccounts")}</h2><p className="mt-1 text-[12px] text-ink-3">{t("ledgerWorkspace.accountsHint")}</p></div><Badge variant="outline">{t("ledgerWorkspace.accounts", { count: accounts.length })}</Badge></header>
      {accounts.length === 0 ? <EmptyState icon={BookOpen} title={t("ledgerWorkspace.noAccounts")} description={t("ledgerWorkspace.accountSetupHint")} compact /> : <Table><TableHeader><TableRow><TableHead>{t("ledgerWorkspace.code")}</TableHead><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>{t("ledgerWorkspace.statementSection")}</TableHead><TableHead>{t("ledgerWorkspace.cashflowSection")}</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.id}><TableCell className="font-mono text-[12px]">{account.code}</TableCell><TableCell><p className="font-medium">{accountingAccountName(account.code, account.name, locale, t, account.nameAr)}</p>{locale === "en" && account.nameAr ? <p className="rtl-font text-[12px] text-ink-3" dir="rtl">{account.nameAr}</p> : null}</TableCell><TableCell className="text-[12px]">{statementGroupLabel(account.statementGroup, t)}</TableCell><TableCell className="text-[12px]">{cashflowGroupLabel(account.cashflowGroup, t)}</TableCell></TableRow>)}</TableBody></Table>}
    </section>
  );
}

function JournalTable({
  entries,
  branches,
  selectedId,
  onSelect,
  loading,
  onReverse,
  canReverse,
}: {
  entries: AccountingJournalEntrySummary[];
  branches: Array<{ id: string; name: string }>;
  selectedId?: string;
  onSelect: (entryId: string) => void;
  loading: boolean;
  onReverse: (entry: AccountingJournalEntrySummary) => void;
  canReverse: boolean;
}) {
  const t = useT();
  if (loading) return <Skeleton className="h-72" />;
  if (entries.length === 0) return <EmptyState icon={FileText} title={t("ledgerWorkspace.noJournals")} description={t("ledgerWorkspace.journalsEmptyHint")} compact />;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{t("common.label.date")}</TableHead><TableHead>{t("ledgerWorkspace.description")}</TableHead><TableHead>{t("common.label.branch")}</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead className="text-end">{t("common.label.amount")}</TableHead><TableHead><span className="sr-only">{t("common.label.actions")}</span></TableHead></TableRow></TableHeader>
      <TableBody>{entries.map((entry) => <TableRow key={entry.id} className={cn(selectedId === entry.id && "bg-sunken/50")}>
        <TableCell className="whitespace-nowrap"><button type="button" className="text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)} aria-label={t("ledgerWorkspace.viewEntry", { memo: entry.memo })}><DateText iso={entry.postingDate} /></button></TableCell>
        <TableCell><button type="button" className="max-w-[260px] text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)}>{entry.memo}</button>{entry.sourceType ? <p className="text-[12px] text-ink-3">{sourceLabel(entry.sourceType, t)}</p> : null}</TableCell>
        <TableCell className="text-[12px]">{entry.scope === "consolidated" ? t("common.label.allBranches") : branchName(branches, entry.branchId, t)}</TableCell>
        <TableCell><StatusBadge status={entry.status} /></TableCell>
        <TableCell className="text-end"><MoneyText money={entry.totalDebit} /></TableCell>
        <TableCell className="text-end">{canReverse && entry.status === "posted" ? <Button type="button" variant="ghost" size="xs" onClick={() => onReverse(entry)} aria-label={t("ledgerWorkspace.reverseNamed", { memo: entry.memo })}><RotateCcw /> {" "}{t("ledgerWorkspace.reverse")}</Button> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  );
}

function JournalDetail({ detail, loading, error, onRetry }: { detail?: AccountingJournalEntryDetail; loading: boolean; error?: unknown; onRetry: () => void }) {
  const { t, locale } = useLocale();
  if (!detail && loading) return <Skeleton className="h-64" />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} />;
  if (!detail) return <StatePanel icon={FileText} title={t("ledgerWorkspace.chooseJournal")} description={t("ledgerWorkspace.chooseJournalHint")} compact />;
  return (
    <section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.journalDetail")}>
      <header className="border-b border-line px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="context-label">{t("ledgerWorkspace.entryDetails")}</p><h2 className="mt-1 text-[16px] font-semibold">{detail.memo}</h2><p className="mt-1 text-[12px] text-ink-3">{detail.scope === "consolidated" ? t("common.label.allBranches") : t("ledgerWorkspace.oneBranch")}</p></div><StatusBadge status={detail.status} /></div></header>
      <div className="grid gap-3 border-b border-line px-4 py-3 text-[12px] sm:grid-cols-3"><div><p className="context-label">{t("ledgerWorkspace.entryDate")}</p><p className="mt-1"><DateText iso={detail.postingDate} /></p></div><div><p className="context-label">{t("ledgerWorkspace.posted")}</p><p className="mt-1"><DateTimeText iso={detail.createdAt} /></p></div><div><p className="context-label">{t("ledgerWorkspace.policy")}</p><p className="mt-1 font-mono text-[11px]">{detail.policyCode ?? t("ledgerWorkspace.manualEntry")}{detail.policyVersion ? ` · v${detail.policyVersion}` : ""}</p></div></div>
      {detail.reason ? <p className="border-b border-line px-4 py-3 text-[12px] text-ink-2"><span className="font-medium text-ink">{t("ledgerWorkspace.reasonLabel")}</span> {detail.reason}</p> : null}
      <Table><TableHeader><TableRow><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>{t("memberProfile.followUp.evidenceKind.note")}</TableHead><TableHead className="text-end">{t("ledgerWorkspace.debit")}</TableHead><TableHead className="text-end">{t("ledgerWorkspace.credit")}</TableHead></TableRow></TableHeader><TableBody>{detail.lines.map((line) => <TableRow key={line.id}><TableCell><p className="font-medium">{line.accountCode} · {accountingAccountName(line.accountCode, line.accountName, locale, t)}</p><p className="text-[12px] text-ink-3">{statementGroupLabel(line.statementGroup, t)}</p></TableCell><TableCell className="text-[12px] text-ink-2">{line.description ?? "—"}</TableCell><TableCell className="text-end"><MoneyText money={line.debit} /></TableCell><TableCell className="text-end"><MoneyText money={line.credit} /></TableCell></TableRow>)}</TableBody></Table>
    </section>
  );
}

function SourceQueue({
  sources,
  loading,
  canRefresh,
  canWrite,
  refreshPending,
  postPendingId,
  statusFilter,
  onStatusFilter,
  onRefresh,
  onPost,
  onExclude,
  onReconsider,
}: {
  sources: AccountingSourcePosting[];
  loading: boolean;
  canRefresh: boolean;
  canWrite: boolean;
  refreshPending: boolean;
  postPendingId?: string;
  statusFilter: AccountingSourceStatus | "all";
  onStatusFilter: (value: AccountingSourceStatus | "all") => void;
  onRefresh: () => void;
  onPost: (source: AccountingSourcePosting) => void;
  onExclude: (source: AccountingSourcePosting) => void;
  onReconsider: (source: AccountingSourcePosting) => void;
}) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const rows = statusFilter === "all" ? sources : sources.filter((source) => source.status === statusFilter);
  return (
    <section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.sourceQueue")} data-testid="source-posting-queue">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("ledgerWorkspace.salesCosts")}</p><h2 className="mt-1 text-[16px] font-semibold">{t("ledgerWorkspace.sourceQueue")}</h2><p className="mt-1 max-w-xl text-[12px] text-ink-3">{t("ledgerWorkspace.queueHint")}</p></div><div className="flex items-center gap-2"><Select value={statusFilter} onValueChange={(value) => onStatusFilter(value as AccountingSourceStatus | "all")}><SelectTrigger className="w-40" sizeVariant="sm" aria-label={t("ledgerWorkspace.statusFilter")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("members.list.filters.allStatuses")}</SelectItem>{SOURCE_STATUSES.map((status) => <SelectItem key={status} value={status}>{statusText(status, t)}</SelectItem>)}</SelectContent></Select>{canRefresh ? <Button type="button" size="sm" variant="secondary" loading={refreshPending} onClick={onRefresh}><RefreshCw /> {" "}{t("ledgerWorkspace.refreshList")}</Button> : null}</div></header>
      {!canRefresh ? <div className="border-b border-line bg-sunken/30 px-4 py-2.5 text-[12px] text-ink-2" role="status">{t("ledgerWorkspace.readOnlyQueue")}</div> : !canWrite ? <div className="border-b border-line bg-sunken/30 px-4 py-2.5 text-[12px] text-ink-2" role="status">{t("ledgerWorkspace.allBranchesQueue")}</div> : null}
      {loading ? <Skeleton className="m-4 h-64" /> : rows.length === 0 ? <EmptyState icon={ClipboardList} title={statusFilter === "all" ? t("ledgerWorkspace.noSources") : t("ledgerWorkspace.noSourcesStatus", { status: statusText(statusFilter, t) })} description={canRefresh ? t("ledgerWorkspace.refreshHint") : t("ledgerWorkspace.noStatusMatches")} compact /> : <Table><TableHeader><TableRow><TableHead>{t("common.label.date")}</TableHead><TableHead>{t("ledgerWorkspace.item")}</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead>{t("ledgerWorkspace.policy")}</TableHead><TableHead className="text-end">{t("common.label.amount")}</TableHead><TableHead><span className="sr-only">{t("palette.kind.action")}</span></TableHead></TableRow></TableHeader><TableBody>{rows.map((source) => <TableRow key={source.id}><TableCell className="whitespace-nowrap"><DateTimeText iso={source.occurredAt} /></TableCell><TableCell><p className="font-medium">{sourceLabel(source.sourceType, t)}</p>{source.details ? <p className="max-w-[260px] truncate text-[12px] text-ink-3">{accountingDetailsLine(source.details, source.currency, locale, t, f)}</p> : null}</TableCell><TableCell><StatusBadge status={source.status} />{source.reviewExcludedAt ? <p className="mt-1 text-[12px] text-ink-3">{t("ledgerWorkspace.excluded")}{" "}<DateText iso={source.reviewExcludedAt} /></p> : null}{source.reason ? <p className="mt-1 max-w-[220px] text-[12px] text-ink-3">{source.reviewExcludedAt ? source.reason : accountingSourceReason(source.reason, t, f, source.reasonMessage)}</p> : null}</TableCell><TableCell className="font-mono text-[11px]">{source.policyCode ? `${source.policyCode}${source.policyVersion ? ` · v${source.policyVersion}` : ""}` : t("ledgerWorkspace.notConfigured")}</TableCell><TableCell className="text-end"><MoneyText money={source.amount} /></TableCell><TableCell className="text-end">{source.status === "posted" ? <span className="text-[12px] text-ink-3">{t("ledgerWorkspace.posted")}</span> : source.status === "reversed" ? <span className="text-[12px] text-ink-3">{t("ledgerWorkspace.reversed")}</span> : source.status === "excluded" ? (source.reviewExcludedAt && canRefresh ? <Button type="button" size="xs" variant="ghost" onClick={() => onReconsider(source)} aria-label={t("ledgerWorkspace.bringBackNamed", { source: sourceLabel(source.sourceType, t) })}>{t("ledgerWorkspace.bringBack")}</Button> : <span className="text-[12px] text-ink-3">{source.reviewExcludedAt ? t("ledgerWorkspace.excludedByTeam") : t("ledgerWorkspace.excludedAutomatically")}</span>) : <span className="inline-flex items-center justify-end gap-1.5">{canWrite && source.status === "pending" ? <Button type="button" size="xs" variant="secondary" loading={postPendingId === source.id} onClick={() => onPost(source)}>{t("ledgerWorkspace.postToBooks")}</Button> : null}{canRefresh ? <Button type="button" size="xs" variant="ghost" onClick={() => onExclude(source)} aria-label={t("ledgerWorkspace.excludeNamed", { source: sourceLabel(source.sourceType, t) })}>{t("ledgerWorkspace.leaveOut")}</Button> : <span className="text-[12px] text-ink-3">{t("dashboard.today.action.review")}</span>}</span>}</TableCell></TableRow>)}</TableBody></Table>}
      <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3">{t("ledgerWorkspace.queueStatusHint")}</div>
    </section>
  );
}

function PeriodsTable({ periods, loading, canClose, onClose, onReopen }: { periods: AccountingPeriod[]; loading: boolean; canClose: boolean; onClose: (period: AccountingPeriod) => void; onReopen: (period: AccountingPeriod) => void }) {
  const t = useT();
  const f = useFormat();
  if (loading) return <Skeleton className="h-64" />;
  return (
    <section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.months")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("ledgerWorkspace.monthEnd")}</p><h2 className="mt-1 text-[16px] font-semibold">{t("ledgerWorkspace.months")}</h2><p className="mt-1 text-[12px] text-ink-3">{t("ledgerWorkspace.monthsHint")}</p></div><CalendarClock className="size-5 text-ink-3" aria-hidden /></header>
      {periods.length === 0 ? <EmptyState icon={CalendarClock} title={t("ledgerWorkspace.noMonths")} description={t("ledgerWorkspace.monthsEmptyHint")} compact /> : <Table><TableHeader><TableRow><TableHead>{t("ledgerWorkspace.month")}</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead>{t("ledgerWorkspace.closedReopened")}</TableHead><TableHead><span className="sr-only">{t("common.label.actions")}</span></TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.id}><TableCell><p className="font-medium">{periodLabel(period, f)}</p></TableCell><TableCell><StatusBadge status={period.status} /></TableCell><TableCell className="text-[12px]">{period.status === "closed" ? <DateTimeText iso={period.closedAt} /> : period.reopenedAt ? <span>{t("ledgerWorkspace.reopened")}{" "}<DateTimeText iso={period.reopenedAt} /></span> : t("ledgerWorkspace.openForEntries")}</TableCell><TableCell className="text-end">{canClose ? period.status === "open" ? <Button type="button" size="xs" variant="secondary" onClick={() => onClose(period)}>{t("ledgerWorkspace.closeMonth")}</Button> : <Button type="button" size="xs" variant="ghost" onClick={() => onReopen(period)}><RotateCcw /> {" "}{t("ledgerWorkspace.reopen")}</Button> : <span className="text-[12px] text-ink-3">{t("ledgerWorkspace.ownerOnly")}</span>}</TableCell></TableRow>)}</TableBody></Table>}
    </section>
  );
}

export function ManagementLedgerWorkspace() {
  const t = useT();
  const f = useFormat();
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The tab and branch are readable from the URL so a statement can link
  // straight to the entries behind it; moving between tabs rewrites the URL.
  const [tab, setTabState] = useState<LedgerTab>(() => parseLedgerTab(searchParams.get("tab")));
  const [branchFilter, setBranchFilter] = useState<string>(() => visibleBranchId(session?.branches, searchParams.get("branchId") ?? undefined) ?? visibleBranchId(session?.branches, session?.activeBranchId) ?? "all");
  const urlBranchAppliedRef = useRef(Boolean(session?.branches));
  const setTab = (next: LedgerTab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab"); else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<AccountingSourceStatus | "all">("all");
  const [selectedJournalId, setSelectedJournalId] = useState<string>();
  const [manualOpen, setManualOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<{ kind: "reverse" | "close" | "reopen" | "exclude" | "reconsider"; id: string; source?: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string }; title: TKey; description: TKey; confirmLabel: TKey; period?: AccountingPeriod } | null>(null);
  const [postingSourceId, setPostingSourceId] = useState<string>();

  useEffect(() => {
    if (!urlBranchAppliedRef.current && session?.branches) {
      // The session arrived after the first render: honour a linked branch once.
      urlBranchAppliedRef.current = true;
      const linked = visibleBranchId(session.branches, searchParams.get("branchId") ?? undefined);
      if (linked) { setBranchFilter(linked); return; }
    }
    if (branchFilter !== "all" && !visibleBranchId(session?.branches, branchFilter)) setBranchFilter("all");
  }, [branchFilter, searchParams, session?.activeBranchId, session?.branches]);

  const scopeBranchId = branchFilter === "all" ? undefined : branchFilter;
  const canRead = can("reports.financial.read");
  // Posting a source or manual journal stays branch-scoped: a money write must
  // name one concrete branch. A queue refresh is a projection scan, not a
  // posting write, so it also runs in the consolidated view — the resulting
  // organization-wide run is the only run kind that can prove consolidated
  // statement coverage.
  const canRefresh = can("accounting.post");
  const canWrite = canRefresh && Boolean(scopeBranchId);
  const canOwner = session?.roles.includes("owner") ?? false;
  const currency = session?.organization.currency ?? "JOD";

  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) && canRead });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const financeModule = workspace?.modules.find((module) => module.key === "finance");
  const ready = Boolean(financeModule?.entitled && financeModule.enabled);

  const accountsQuery = useApiQuery(qk.finance({ kind: "accounts" }), (api) => api.listAccountingAccounts(), { enabled: ready });
  const periodsQuery = useApiQuery(qk.finance({ kind: "periods" }), (api) => api.listAccountingPeriods(), { enabled: ready });
  const trialBalanceQuery = useApiQuery(qk.finance({ kind: "trial-balance", branchId: scopeBranchId, periodId: periodFilter }), (api) => api.getAccountingTrialBalance({ branchId: scopeBranchId, periodId: periodFilter === "all" ? undefined : periodFilter }), { enabled: ready });
  const journalsQuery = useApiQuery(qk.finance({ kind: "journals", branchId: scopeBranchId, periodId: periodFilter }), (api) => api.listAccountingJournalEntries({ branchId: scopeBranchId, periodId: periodFilter === "all" ? undefined : periodFilter, page: 1, pageSize: 50, sort: "-postingDate" }), { enabled: ready });
  const sourcesQuery = useApiQuery(qk.finance({ kind: "sources", branchId: scopeBranchId }), (api) => api.listAccountingSourcePostings({ branchId: scopeBranchId, page: 1, pageSize: 100, sort: "-occurredAt" }), { enabled: ready });
  const detailQuery = useApiQuery(qk.finance({ kind: "journal-detail", id: selectedJournalId }), (api) => api.getAccountingJournalEntry(selectedJournalId as UUID), { enabled: ready && Boolean(selectedJournalId) });

  const refreshMutation = useApiMutation((api, input: { branchId?: UUID }) => api.refreshAccountingSourceQueue(input), { successMessage: (result: RefreshAccountingSourceQueueResult) => t("ledgerWorkspace.scanned", { count: result.scanned }), onSuccess: async () => { await invalidate(); } });
  const sourceMutation = useApiMutation((api, input: { source: AccountingSourcePosting }) => api.postAccountingSource({ sourceType: input.source.sourceType, sourceId: input.source.sourceId, idempotencyKey: newKey(`source-${input.source.id}`), reason: "Posted from the management-ledger source queue." }), { onSuccess: async () => { setPostingSourceId(undefined); await invalidate(); }, onError: () => setPostingSourceId(undefined), successMessage: t("ledgerWorkspace.postedToast") });
  const manualMutation = useApiMutation((api, input: PostManualJournalInput) => api.postManualJournal(input), { onSuccess: async () => { setManualOpen(false); await invalidate(); }, successMessage: t("ledgerWorkspace.manualToast") });
  const reverseMutation = useApiMutation((api, input: { entryId: UUID; reason: string }) => api.reverseAccountingEntry(input.entryId, { reason: input.reason, idempotencyKey: newKey("reverse") }), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: t("ledgerWorkspace.reverseToast") });
  const excludeMutation = useApiMutation((api, input: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string; reason: string }) => api.excludeAccountingSource(input), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: t("ledgerWorkspace.excludeToast") });
  const reconsiderMutation = useApiMutation((api, input: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string; reason: string }) => api.reconsiderAccountingSource(input), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: t("ledgerWorkspace.reconsiderToast") });
  const closeMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.closeAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: t("ledgerWorkspace.closedToast") });
  const reopenMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.reopenAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: t("ledgerWorkspace.reopenedToast") });

  const accounts = accountsQuery.data ?? [];
  const periods = useMemo(() => [...(periodsQuery.data ?? [])].sort((a, b) => b.periodStart.localeCompare(a.periodStart)), [periodsQuery.data]);
  const entries = journalsQuery.data?.items ?? [];
  const sources = useMemo(() => {
    const period = periodFilter === "all" ? undefined : periods.find((candidate) => candidate.id === periodFilter);
    if (!period) return sourcesQuery.data?.items ?? [];
    const timezone = session?.organization.timezone ?? "UTC";
    return (sourcesQuery.data?.items ?? []).filter((source) => {
      const occurredDate = todayISODate(timezone, new Date(source.occurredAt));
      return occurredDate >= period.periodStart && occurredDate <= period.periodEnd;
    });
  }, [periodFilter, periods, session?.organization.timezone, sourcesQuery.data?.items]);

  const queueCounts = useMemo(() => ({
    pending: sources.filter((source) => source.status === "pending").length,
    unconfigured: sources.filter((source) => source.status === "unconfigured").length,
    failed: sources.filter((source) => source.status === "failed").length,
  }), [sources]);

  const dataError = accountsQuery.error ?? periodsQuery.error ?? trialBalanceQuery.error ?? journalsQuery.error ?? sourcesQuery.error;
  const loading = accountsQuery.isLoading || periodsQuery.isLoading || trialBalanceQuery.isLoading || journalsQuery.isLoading || sourcesQuery.isLoading;

  const retryAll = () => { void Promise.all([accountsQuery.refetch(), periodsQuery.refetch(), trialBalanceQuery.refetch(), journalsQuery.refetch(), sourcesQuery.refetch()]); };
  const submitReason = (reason: string) => {
    if (!reasonAction) return;
    if (reasonAction.kind === "reverse") reverseMutation.mutate({ entryId: reasonAction.id, reason });
    else if (reasonAction.kind === "close") closeMutation.mutate({ periodId: reasonAction.id, reason });
    else if (reasonAction.kind === "reopen") reopenMutation.mutate({ periodId: reasonAction.id, reason });
    else if (reasonAction.source) {
      const input = { sourceType: reasonAction.source.sourceType, sourceId: reasonAction.source.sourceId, reason };
      if (reasonAction.kind === "exclude") excludeMutation.mutate(input);
      else reconsiderMutation.mutate(input);
    }
  };
  const reasonPending = reverseMutation.isPending || closeMutation.isPending || reopenMutation.isPending || excludeMutation.isPending || reconsiderMutation.isPending;

  if (!canRead) return <ForbiddenState description={t("ledgerWorkspace.noAccess")} />;
  if (workspaceQuery.isLoading) return <><PageHeader sectionLabel={t("nav.section.managementLedger")} title={t("ledgerWorkspace.bookkeeping")} description={t("ledgerWorkspace.loadingBooksEllipsis")} /><LoadingGrid /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!financeModule?.entitled) return <StatePanel icon={LockKeyhole} title={t("ledgerWorkspace.planMissing")} description={t("ledgerWorkspace.planHint")} className="mt-4" />;
  if (!financeModule.enabled) return <StatePanel icon={LockKeyhole} title={t("ledgerWorkspace.turnedOff")} description={t("ledgerWorkspace.ownerEnable")} className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-ledger-workspace">
      <PageHeader
        sectionLabel={t("nav.section.managementLedger")}
        title={t("ledgerWorkspace.bookkeeping")}
        description={t("ledgerWorkspace.workspaceHint")}
        actions={canOwner && scopeBranchId ? <Button type="button" onClick={() => setManualOpen(true)}><Plus /> {" "}{t("ledgerWorkspace.addJournal")}</Button> : <Badge variant="outline">{canOwner ? t("ledgerWorkspace.chooseBranchEntries") : t("ledgerWorkspace.viewOnly")}</Badge>}
      />

      <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label={t("ledgerWorkspace.branchMonth")}>
        <Field label={t("common.label.branch")} className="w-full sm:w-56"><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger aria-label={t("common.label.branch")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("ledgerWorkspace.allYourBranches")}</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label={t("ledgerWorkspace.month")} className="w-full sm:w-72"><Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger aria-label={t("ledgerWorkspace.month")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("ledgerWorkspace.allMonths")}</SelectItem>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{periodLabel(period, f)}</SelectItem>)}</SelectContent></Select></Field>
        <div className="ms-auto flex items-center gap-2"><span className="text-[12px] text-ink-3">{branchFilter === "all" ? t("ledgerWorkspace.branchesTogether") : branchName(session?.branches ?? [], branchFilter, t)}</span><Button type="button" variant="ghost" size="sm" onClick={retryAll} disabled={loading}><RefreshCw />{" "}{t("common.action.refresh")}</Button></div>
      </section>

      {dataError && !loading ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">{t("ledgerWorkspace.partialLoad")}{" "}<button type="button" className="font-medium underline" onClick={retryAll}>{t("common.action.retry")}</button></div> : null}

      {/* Unfinished work first, control totals after. */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t("ledgerWorkspace.booksSummary")}>
        <div className="panel p-4"><Stat label={t("ledgerWorkspace.itemsFound")} value={f.number(sources.length)} context={t("ledgerWorkspace.queueCounts", { pending: f.number(queueCounts.pending), unconfigured: f.number(queueCounts.unconfigured) }) + (queueCounts.failed > 0 ? t("ledgerWorkspace.failedCount", { failed: f.number(queueCounts.failed) }) : "")} tone={queueCounts.failed > 0 ? "danger" : queueCounts.pending + queueCounts.unconfigured > 0 ? "warning" : "default"} /></div>
        <div className="panel p-4"><Stat label={t("ledgerWorkspace.trialDebits")} value={<MoneyText money={trialBalanceQuery.data?.totalDebit} compact />} context={trialBalanceQuery.data ? t("ledgerWorkspace.accounts", { count: trialBalanceQuery.data.rows.length }) : t("ledgerWorkspace.nothingAdded")} /></div>
        <div className="panel p-4"><Stat label={t("ledgerWorkspace.trialCredits")} value={<MoneyText money={trialBalanceQuery.data?.totalCredit} compact />} context={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? t("ledgerWorkspace.match") : t("ledgerWorkspace.mismatch")} tone={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? "success" : "warning"} /></div>
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as LedgerTab)}>
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="overview"><Scale className="size-3.5" /> {" "}{t("ledgerWorkspace.balanceAccounts")}</TabsTrigger><TabsTrigger value="journals"><FileText className="size-3.5" /> {" "}{t("ledgerWorkspace.journals")}</TabsTrigger><TabsTrigger value="sources"><ClipboardList className="size-3.5" /> {" "}{t("ledgerWorkspace.itemsToPost")}</TabsTrigger><TabsTrigger value="periods"><CalendarClock className="size-3.5" /> {" "}{t("ledgerWorkspace.months")}</TabsTrigger></TabsList>
        <TabsContent value="overview"><div className="grid items-start gap-5 xl:grid-cols-[1.35fr_.65fr]"><TrialBalanceCard trialBalance={trialBalanceQuery.data} loading={trialBalanceQuery.isLoading} currency={currency} /><AccountsCard accounts={accounts} loading={accountsQuery.isLoading} /></div></TabsContent>
        <TabsContent value="journals"><div className="space-y-5"><section className="panel overflow-hidden" aria-label={t("ledgerWorkspace.journalEntries")}><header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("ledgerWorkspace.everythingPosted")}</p><h2 className="mt-1 text-[16px] font-semibold">{t("ledgerWorkspace.journalEntries")}</h2><p className="mt-1 text-[12px] text-ink-3">{t("ledgerWorkspace.entriesHint")}</p></div><Badge variant="outline">{t("ledgerWorkspace.entries", { count: journalsQuery.data?.totalItems ?? entries.length })}</Badge></header><JournalTable entries={entries} branches={session?.branches ?? []} selectedId={selectedJournalId} onSelect={setSelectedJournalId} loading={journalsQuery.isLoading} onReverse={(entry) => setReasonAction({ kind: "reverse", id: entry.id, title: "ledgerWorkspace.reverseTitle", description: "ledgerWorkspace.reverseHint", confirmLabel: "ledgerWorkspace.reverseEntry" })} canReverse={canOwner} /></section><JournalDetail detail={detailQuery.data} loading={detailQuery.isLoading} error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /></div></TabsContent>
        <TabsContent value="sources"><SourceQueue sources={sources} loading={sourcesQuery.isLoading} canRefresh={canRefresh} canWrite={canWrite} refreshPending={refreshMutation.isPending} postPendingId={postingSourceId} statusFilter={statusFilter} onStatusFilter={setStatusFilter} onRefresh={() => refreshMutation.mutate({ branchId: scopeBranchId })} onPost={(source) => { setPostingSourceId(source.id); sourceMutation.mutate({ source }); }} onExclude={(source) => setReasonAction({ kind: "exclude", id: source.id, source: { sourceType: source.sourceType, sourceId: source.sourceId }, title: "ledgerWorkspace.excludeTitle", description: "ledgerWorkspace.excludeHint", confirmLabel: "ledgerWorkspace.leaveOut" })} onReconsider={(source) => setReasonAction({ kind: "reconsider", id: source.id, source: { sourceType: source.sourceType, sourceId: source.sourceId }, title: "ledgerWorkspace.reconsiderTitle", description: "ledgerWorkspace.reconsiderHint", confirmLabel: "ledgerWorkspace.bringBack" })} /></TabsContent>
        <TabsContent value="periods"><PeriodsTable periods={periods} loading={periodsQuery.isLoading} canClose={canOwner} onClose={(period) => setReasonAction({ kind: "close", id: period.id, title: "ledgerWorkspace.closePeriod", description: "ledgerWorkspace.closePeriodHint", period, confirmLabel: "ledgerWorkspace.closeMonth" })} onReopen={(period) => setReasonAction({ kind: "reopen", id: period.id, title: "ledgerWorkspace.reopenPeriod", description: "ledgerWorkspace.reopenPeriodHint", period, confirmLabel: "ledgerWorkspace.reopenMonth" })} /></TabsContent>
      </Tabs>

      <ManualJournalDialog open={manualOpen} onOpenChange={setManualOpen} accounts={accounts} branches={session?.branches ?? []} activeBranchId={scopeBranchId} currency={currency} pending={manualMutation.isPending} onSubmit={(input) => manualMutation.mutate(input)} />
      <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} onSubmit={submitReason} pending={reasonPending} />
    </div>
  );
}
