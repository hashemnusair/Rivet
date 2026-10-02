"use client";
import { useT } from "@/lib/i18n/provider";

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
import { formatDate, todayISODate } from "@/lib/utils/dates";
import { money, parseMoneyInput } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
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
const SOURCE_TYPE_LABELS: Record<string, string> = {
  payment: "Payment",
  refund: "Refund",
  void: "Cancelled payment",
  membership_sale: "Membership sale",
  membership_renewal: "Membership renewal",
  membership_revenue_recognition: "Monthly membership income",
  purchase_order_receipt: "Supplier delivery",
  stock_movement: "Stock change",
  facility_supplies: "Gym supplies",
  equipment_acquisition: "Equipment purchase",
  equipment_depreciation: "Equipment depreciation",
  equipment_repair: "Equipment repair",
  supplier_payment: "Supplier payment",
  supplier_payment_reversal: "Supplier payment reversed",
};

function sentenceCase(value: string): string {
  const words = value.replaceAll("_", " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : words;
}

function sourceLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sentenceCase(sourceType);
}

const STATEMENT_GROUP_LABELS: Record<string, string> = {
  asset_current: "Current assets",
  asset_noncurrent: "Non-current assets",
  liability_current: "Current liabilities",
  liability_noncurrent: "Non-current liabilities",
  equity: "Equity",
  revenue: "Revenue",
  cost_of_sales: "Cost of sales",
  operating_expense: "Operating expenses",
  other_income: "Other income",
  other_expense: "Other expenses",
};

const CASHFLOW_GROUP_LABELS: Record<string, string> = {
  operating: "Operating",
  investing: "Investing",
  financing: "Financing",
  non_cash: "Not cash",
};

function statementGroupLabel(group: string): string {
  return STATEMENT_GROUP_LABELS[group] ?? sentenceCase(group);
}

function cashflowGroupLabel(group: string): string {
  return CASHFLOW_GROUP_LABELS[group] ?? sentenceCase(group);
}

/**
 * One readable line from a source posting's diagnostic details. Arrays and
 * objects are rendered as JSON instead of "[object Object]", and empty
 * values are dropped rather than shown as dangling labels.
 */
function sourceDetailsLine(details: Record<string, unknown>): string {
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0))
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" | "signal" {
  if (["posted", "balanced"].includes(status)) return "success";
  if (["pending", "unconfigured"].includes(status)) return "warning";
  if (["failed", "reversed", "out of balance"].includes(status)) return "danger";
  if (status === "excluded") return "signal";
  return "neutral";
}

/** Plain words for ledger statuses; the raw status still picks the colour. */
const STATUS_LABELS: Record<string, string> = {
  pending: "Ready to add",
  unconfigured: "Needs setup",
  excluded: "Left out",
  failed: "Failed",
  posted: "Added",
  reversed: "Reversed",
  open: "Open",
  closed: "Closed",
  balanced: "Balanced",
  "out of balance": "Out of balance",
};

function statusText(status: string): string {
  return STATUS_LABELS[status] ?? sentenceCase(status);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariant(status)}>
      <span className="sr-only">Status: </span>
      {statusText(status)}
    </Badge>
  );
}

function branchName(branches: Array<{ id: string; name: string }>, branchId?: string): string {
  return branchId ? branches.find((branch) => branch.id === branchId)?.name ?? "Branch" : "All branches";
}

const MONTH_NAME = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Periods are calendar months, so they read as "September 2026". */
function periodLabel(period: AccountingPeriod): string {
  const start = new Date(`${period.periodStart}T12:00:00Z`);
  const wholeMonth = period.periodStart.endsWith("-01") && period.periodEnd.slice(0, 7) === period.periodStart.slice(0, 7);
  return wholeMonth && !Number.isNaN(start.valueOf()) ? MONTH_NAME.format(start) : `${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;
}

function LoadingGrid() {
  return (
    <div className="space-y-4" aria-label="Loading the books">
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
  action: { title: string; description: string; confirmLabel: string } | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const t = useT();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!action) setReason("");
  }, [action]);

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.title ?? "Confirm this change"}</DialogTitle>
          <DialogDescription>{action?.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label={t("common.label.reason")} hint="Saved in the activity log." required>
            <Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you doing this?" required />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button type="button" loading={pending} disabled={reason.trim().length < 3} onClick={() => onSubmit(reason.trim())}>{action?.confirmLabel ?? "Confirm"}</Button>
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
  const t = useT();
  // Manual journals from this workspace are always branch-scoped. The
  // organization-wide filter is deliberately read-only.
  const scope = "branch" as const;
  const [branchId, setBranchId] = useState(visibleBranchId(branches, activeBranchId) ?? "");
  const [postingDate, setPostingDate] = useState(todayISODate());
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
    setPostingDate(todayISODate());
    setMemo("");
    setReason("");
    setIdempotencyKey(newKey("manual"));
    setLines([
      { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
      { accountId: accounts[1]?.id ?? accounts[0]?.id ?? "", debit: "", credit: "", description: "" },
    ]);
  }, [open, activeBranchId, branches, accounts]);

  const updateLine = (index: number, patch: Partial<JournalLineDraft>) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
          <DialogTitle>Add a journal entry</DialogTitle>
          <DialogDescription>Record a change to the books by hand. Total debits must equal total credits.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("common.label.branch")} hint="Choose one branch. You cannot add an entry to all branches at once." required>
                <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}>
                  <SelectTrigger aria-label="Branch for this entry"><SelectValue placeholder={t("members.bulk.chooseBranch")} /></SelectTrigger>
                  <SelectContent><SelectItem value="none">{t("members.bulk.chooseBranch")}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Entry date" required><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
              <Field label="Description" required><Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Monthly cleaning cost" required /></Field>
            </div>
            <div className="rounded-md border border-line-2 bg-sunken/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><div><p className="context-label">Lines</p><p className="text-[12px] text-ink-3">Enter amounts in {currency}. Total debits must equal total credits.</p></div><Badge variant="outline">{lines.length} lines</Badge></div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.5fr_.75fr_.75fr_1fr]">
                    <Select value={line.accountId || "none"} onValueChange={(value) => updateLine(index, { accountId: value === "none" ? "" : value })}>
                      <SelectTrigger aria-label={`Line ${index + 1} account`}><SelectValue placeholder="Choose account" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Choose account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {account.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" dir="ltr" aria-label={`Line ${index + 1} debit`} placeholder="Debit" value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value })} />
                    <Input inputMode="decimal" dir="ltr" aria-label={`Line ${index + 1} credit`} placeholder="Credit" value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value })} />
                    <Input aria-label={`Line ${index + 1} note`} placeholder="Note (optional)" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setLines((current) => [...current, { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" }])}><Plus /> Add line</Button>
            </div>
            <Field label={t("common.label.reason")} hint="Saved in the activity log." required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are you making this entry?" required /></Field>
          </DialogBody>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button type="submit" loading={pending} disabled={!memo.trim() || reason.trim().length < 3 || !idempotencyKey.trim() || !visibleBranchId(branches, branchId)}>Add entry</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrialBalanceCard({ trialBalance, loading, currency }: { trialBalance?: AccountingTrialBalance; loading: boolean; currency: string }) {
  const t = useT();
  if (loading) return <Skeleton className="h-80" />;
  if (!trialBalance || trialBalance.rows.length === 0) return <EmptyState icon={Scale} title="Nothing in the books yet" description="Add items from the list, or add a journal entry, to see balances here." compact />;
  const balanced = trialBalance.totalDebit.amount === trialBalance.totalCredit.amount;
  return (
    <section className="panel overflow-hidden" aria-label="Trial balance" data-testid="trial-balance">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div><p className="context-label">Totals in {currency}</p><h2 className="mt-1 text-[16px] font-semibold">Trial balance</h2><p className="mt-1 text-[12px] text-ink-3">The total for every account. Debits and credits should match.</p></div>
        <div className="flex items-center gap-2" role="status" aria-label={balanced ? "Debits and credits match" : "Debits and credits do not match"}>
          {balanced ? <CheckCircle2 className="size-4 text-success-deep" aria-hidden /> : <AlertTriangle className="size-4 text-danger" aria-hidden />}
          <StatusBadge status={balanced ? "balanced" : "out of balance"} />
        </div>
      </header>
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3">
        <div className="px-4 py-3"><p className="context-label">Total debits</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalDebit} /></p></div>
        <div className="px-4 py-3"><p className="context-label">Total credits</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalCredit} /></p></div>
        <div className="col-span-2 px-4 py-3 sm:col-span-1"><p className="context-label">Difference</p><p className={cn("mt-1 text-[18px] font-semibold tabular", !balanced && "text-danger")}><MoneyText money={money(trialBalance.totalDebit.amount - trialBalance.totalCredit.amount, trialBalance.currency)} signed /></p></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>{t("common.label.type")}</TableHead><TableHead className="text-end">Debit</TableHead><TableHead className="text-end">Credit</TableHead><TableHead className="text-end">{t("reception.member.balance")}</TableHead></TableRow></TableHeader>
        <TableBody>{trialBalance.rows.map((row) => <TableRow key={row.accountId}><TableCell><p className="font-medium">{row.accountCode} · {row.accountName}</p><p className="text-[12px] text-ink-3">{statementGroupLabel(row.statementGroup)}</p></TableCell><TableCell className="capitalize text-[12px]">{row.accountType}</TableCell><TableCell className="text-end"><MoneyText money={row.debit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.credit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.balance} hideCurrency signed /></TableCell></TableRow>)}</TableBody>
      </Table>
    </section>
  );
}

function AccountsCard({ accounts, loading }: { accounts: AccountingAccount[]; loading: boolean }) {
  const t = useT();
  if (loading) return <Skeleton className="h-72" />;
  return (
    <section className="panel overflow-hidden" aria-label="Chart of accounts">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Accounts</p><h2 className="mt-1 text-[16px] font-semibold">Chart of accounts</h2><p className="mt-1 text-[12px] text-ink-3">The accounts your books use. They are set up for you.</p></div><Badge variant="outline">{accounts.length} accounts</Badge></header>
      {accounts.length === 0 ? <EmptyState icon={BookOpen} title="No accounts set up yet" description="Contact RIVET support to set up your accounts." compact /> : <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>Statement section</TableHead><TableHead>Cash flow section</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.id}><TableCell className="font-mono text-[12px]">{account.code}</TableCell><TableCell><p className="font-medium">{account.name}</p>{account.nameAr ? <p className="rtl-font text-[12px] text-ink-3" dir="rtl">{account.nameAr}</p> : null}</TableCell><TableCell className="text-[12px]">{statementGroupLabel(account.statementGroup)}</TableCell><TableCell className="text-[12px]">{cashflowGroupLabel(account.cashflowGroup)}</TableCell></TableRow>)}</TableBody></Table>}
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
  if (entries.length === 0) return <EmptyState icon={FileText} title="No journal entries here" description="Entries show here once items or journal entries are added to the books." compact />;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>{t("common.label.date")}</TableHead><TableHead>Description</TableHead><TableHead>{t("common.label.branch")}</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead className="text-end">{t("common.label.amount")}</TableHead><TableHead><span className="sr-only">{t("common.label.actions")}</span></TableHead></TableRow></TableHeader>
      <TableBody>{entries.map((entry) => <TableRow key={entry.id} className={cn(selectedId === entry.id && "bg-sunken/50")}>
        <TableCell className="whitespace-nowrap"><button type="button" className="text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)} aria-label={`View entry ${entry.memo}`}><DateText iso={entry.postingDate} /></button></TableCell>
        <TableCell><button type="button" className="max-w-[260px] text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)}>{entry.memo}</button>{entry.sourceType ? <p className="text-[12px] text-ink-3">{sourceLabel(entry.sourceType)}</p> : null}</TableCell>
        <TableCell className="text-[12px]">{entry.scope === "consolidated" ? t("common.label.allBranches") : branchName(branches, entry.branchId)}</TableCell>
        <TableCell><StatusBadge status={entry.status} /></TableCell>
        <TableCell className="text-end"><MoneyText money={entry.totalDebit} /></TableCell>
        <TableCell className="text-end">{canReverse && entry.status === "posted" ? <Button type="button" variant="ghost" size="xs" onClick={() => onReverse(entry)} aria-label={`Reverse entry ${entry.memo}`}><RotateCcw /> Reverse</Button> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  );
}

function JournalDetail({ detail, loading, error, onRetry }: { detail?: AccountingJournalEntryDetail; loading: boolean; error?: unknown; onRetry: () => void }) {
  const t = useT();
  if (!detail && loading) return <Skeleton className="h-64" />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} />;
  if (!detail) return <StatePanel icon={FileText} title="Choose a journal entry" description="Pick a row above to see its lines and reason." compact />;
  return (
    <section className="panel overflow-hidden" aria-label="Journal entry detail">
      <header className="border-b border-line px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="context-label">Entry details</p><h2 className="mt-1 text-[16px] font-semibold">{detail.memo}</h2><p className="mt-1 text-[12px] text-ink-3">{detail.scope === "consolidated" ? t("common.label.allBranches") : "One branch"}</p></div><StatusBadge status={detail.status} /></div></header>
      <div className="grid gap-3 border-b border-line px-4 py-3 text-[12px] sm:grid-cols-3"><div><p className="context-label">Entry date</p><p className="mt-1"><DateText iso={detail.postingDate} /></p></div><div><p className="context-label">Added</p><p className="mt-1"><DateTimeText iso={detail.createdAt} /></p></div><div><p className="context-label">Policy</p><p className="mt-1 font-mono text-[11px]">{detail.policyCode ?? "Manual entry"}{detail.policyVersion ? ` · v${detail.policyVersion}` : ""}</p></div></div>
      {detail.reason ? <p className="border-b border-line px-4 py-3 text-[12px] text-ink-2"><span className="font-medium text-ink">Reason:</span> {detail.reason}</p> : null}
      <Table><TableHeader><TableRow><TableHead>{t("marketing.memberShell.account")}</TableHead><TableHead>{t("memberProfile.followUp.evidenceKind.note")}</TableHead><TableHead className="text-end">Debit</TableHead><TableHead className="text-end">Credit</TableHead></TableRow></TableHeader><TableBody>{detail.lines.map((line) => <TableRow key={line.id}><TableCell><p className="font-medium">{line.accountCode} · {line.accountName}</p><p className="text-[12px] text-ink-3">{statementGroupLabel(line.statementGroup)}</p></TableCell><TableCell className="text-[12px] text-ink-2">{line.description ?? "—"}</TableCell><TableCell className="text-end"><MoneyText money={line.debit} /></TableCell><TableCell className="text-end"><MoneyText money={line.credit} /></TableCell></TableRow>)}</TableBody></Table>
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
  const t = useT();
  const rows = statusFilter === "all" ? sources : sources.filter((source) => source.status === statusFilter);
  return (
    <section className="panel overflow-hidden" aria-label="Items to add to the books" data-testid="source-posting-queue">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Sales and costs</p><h2 className="mt-1 text-[16px] font-semibold">Items to add to the books</h2><p className="mt-1 max-w-xl text-[12px] text-ink-3">Refresh finds new sales and costs from the rest of RIVET. Nothing goes into the books until someone adds it.</p></div><div className="flex items-center gap-2"><Select value={statusFilter} onValueChange={(value) => onStatusFilter(value as AccountingSourceStatus | "all")}><SelectTrigger className="w-40" sizeVariant="sm" aria-label="Status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("members.list.filters.allStatuses")}</SelectItem>{SOURCE_STATUSES.map((status) => <SelectItem key={status} value={status}>{statusText(status)}</SelectItem>)}</SelectContent></Select>{canRefresh ? <Button type="button" size="sm" variant="secondary" loading={refreshPending} onClick={onRefresh}><RefreshCw /> Refresh list</Button> : null}</div></header>
      {!canRefresh ? <div className="border-b border-line bg-sunken/30 px-4 py-2.5 text-[12px] text-ink-2" role="status">You can only view this list. Someone with bookkeeping access must refresh it and add items.</div> : !canWrite ? <div className="border-b border-line bg-sunken/30 px-4 py-2.5 text-[12px] text-ink-2" role="status">All branches together: Refresh list checks every branch. Choose one branch to add items.</div> : null}
      {loading ? <Skeleton className="m-4 h-64" /> : rows.length === 0 ? <EmptyState icon={ClipboardList} title={statusFilter === "all" ? "No items to add yet" : `No items marked “${statusText(statusFilter)}”`} description={canRefresh ? "Press Refresh list to find payments, memberships, purchases, stock, supplies and equipment costs." : "Nothing matches this status."} compact /> : <Table><TableHeader><TableRow><TableHead>{t("common.label.date")}</TableHead><TableHead>Item</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead>Policy</TableHead><TableHead className="text-end">{t("common.label.amount")}</TableHead><TableHead><span className="sr-only">{t("palette.kind.action")}</span></TableHead></TableRow></TableHeader><TableBody>{rows.map((source) => <TableRow key={source.id}><TableCell className="whitespace-nowrap"><DateTimeText iso={source.occurredAt} /></TableCell><TableCell><p className="font-medium">{sourceLabel(source.sourceType)}</p>{source.details ? <p className="max-w-[260px] truncate text-[12px] text-ink-3">{sourceDetailsLine(source.details)}</p> : null}</TableCell><TableCell><StatusBadge status={source.status} />{source.reviewExcludedAt ? <p className="mt-1 text-[12px] text-ink-3">Left out <DateText iso={source.reviewExcludedAt} /></p> : null}{source.reason ? <p className="mt-1 max-w-[220px] text-[12px] text-ink-3">{source.reason}</p> : null}</TableCell><TableCell className="font-mono text-[11px]">{source.policyCode ? `${source.policyCode}${source.policyVersion ? ` · v${source.policyVersion}` : ""}` : "Not set up"}</TableCell><TableCell className="text-end"><MoneyText money={source.amount} /></TableCell><TableCell className="text-end">{source.status === "posted" ? <span className="text-[12px] text-ink-3">Added</span> : source.status === "reversed" ? <span className="text-[12px] text-ink-3">Reversed</span> : source.status === "excluded" ? (source.reviewExcludedAt && canRefresh ? <Button type="button" size="xs" variant="ghost" onClick={() => onReconsider(source)} aria-label={`Bring back ${sourceLabel(source.sourceType)}`}>Bring back</Button> : <span className="text-[12px] text-ink-3">{source.reviewExcludedAt ? "Left out by your team" : "Left out automatically"}</span>) : <span className="inline-flex items-center justify-end gap-1.5">{canWrite && source.status === "pending" ? <Button type="button" size="xs" variant="secondary" loading={postPendingId === source.id} onClick={() => onPost(source)}>Add to books</Button> : null}{canRefresh ? <Button type="button" size="xs" variant="ghost" onClick={() => onExclude(source)} aria-label={`Leave ${sourceLabel(source.sourceType)} out of the books`}>Leave out</Button> : <span className="text-[12px] text-ink-3">{t("dashboard.today.action.review")}</span>}</span>}</TableCell></TableRow>)}</TableBody></Table>}
      <div className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3">Ready to add: can go into the books now. Needs setup: something is missing, see the row. Left out: kept out of the books; use Bring back to undo. Failed: needs checking. Added and Reversed are final.</div>
    </section>
  );
}

function PeriodsTable({ periods, loading, canClose, onClose, onReopen }: { periods: AccountingPeriod[]; loading: boolean; canClose: boolean; onClose: (period: AccountingPeriod) => void; onReopen: (period: AccountingPeriod) => void }) {
  const t = useT();
  if (loading) return <Skeleton className="h-64" />;
  return (
    <section className="panel overflow-hidden" aria-label="Months">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Month-end</p><h2 className="mt-1 text-[16px] font-semibold">Months</h2><p className="mt-1 text-[12px] text-ink-3">Close a month when its books are final. No new entries can be dated in a closed month. Only the owner can reopen it.</p></div><CalendarClock className="size-5 text-ink-3" aria-hidden /></header>
      {periods.length === 0 ? <EmptyState icon={CalendarClock} title="No months yet" description="A month shows here when its first entry is added to the books." compact /> : <Table><TableHeader><TableRow><TableHead>Month</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead>Closed or reopened</TableHead><TableHead><span className="sr-only">{t("common.label.actions")}</span></TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.id}><TableCell><p className="font-medium">{periodLabel(period)}</p></TableCell><TableCell><StatusBadge status={period.status} /></TableCell><TableCell className="text-[12px]">{period.status === "closed" ? <DateTimeText iso={period.closedAt} /> : period.reopenedAt ? <span>Reopened <DateTimeText iso={period.reopenedAt} /></span> : "Open for new entries"}</TableCell><TableCell className="text-end">{canClose ? period.status === "open" ? <Button type="button" size="xs" variant="secondary" onClick={() => onClose(period)}>Close month</Button> : <Button type="button" size="xs" variant="ghost" onClick={() => onReopen(period)}><RotateCcw /> Reopen</Button> : <span className="text-[12px] text-ink-3">Only the owner</span>}</TableCell></TableRow>)}</TableBody></Table>}
    </section>
  );
}

export function ManagementLedgerWorkspace() {
  const t = useT();
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
  const [reasonAction, setReasonAction] = useState<{ kind: "reverse" | "close" | "reopen" | "exclude" | "reconsider"; id: string; source?: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string }; title: string; description: string; confirmLabel: string } | null>(null);
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

  const refreshMutation = useApiMutation((api, input: { branchId?: UUID }) => api.refreshAccountingSourceQueue(input), { successMessage: (result: RefreshAccountingSourceQueueResult) => `List refreshed. Checked ${result.scanned} ${result.scanned === 1 ? "item" : "items"}.`, onSuccess: async () => { await invalidate(); } });
  const sourceMutation = useApiMutation((api, input: { source: AccountingSourcePosting }) => api.postAccountingSource({ sourceType: input.source.sourceType, sourceId: input.source.sourceId, idempotencyKey: newKey(`source-${input.source.id}`), reason: "Posted from the management-ledger source queue." }), { onSuccess: async () => { setPostingSourceId(undefined); await invalidate(); }, onError: () => setPostingSourceId(undefined), successMessage: "Added to the books." });
  const manualMutation = useApiMutation((api, input: PostManualJournalInput) => api.postManualJournal(input), { onSuccess: async () => { setManualOpen(false); await invalidate(); }, successMessage: "Journal entry added." });
  const reverseMutation = useApiMutation((api, input: { entryId: UUID; reason: string }) => api.reverseAccountingEntry(input.entryId, { reason: input.reason, idempotencyKey: newKey("reverse") }), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: "Entry reversed." });
  const excludeMutation = useApiMutation((api, input: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string; reason: string }) => api.excludeAccountingSource(input), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: "Item left out of the books." });
  const reconsiderMutation = useApiMutation((api, input: { sourceType: AccountingSourcePosting["sourceType"]; sourceId: string; reason: string }) => api.reconsiderAccountingSource(input), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: "Item brought back to the list." });
  const closeMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.closeAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: "Month closed." });
  const reopenMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.reopenAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate(); }, successMessage: "Month reopened." });

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

  if (!canRead) return <ForbiddenState description="You don't have access to bookkeeping. Ask the gym owner if you need it." />;
  if (workspaceQuery.isLoading) return <><PageHeader sectionLabel={t("nav.section.managementLedger")} title="Bookkeeping" description="Loading the books…" /><LoadingGrid /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!financeModule?.entitled) return <StatePanel icon={LockKeyhole} title="Bookkeeping is not in your plan" description="Your plan does not include bookkeeping, month closing and cash control. Contact RIVET to add them." className="mt-4" />;
  if (!financeModule.enabled) return <StatePanel icon={LockKeyhole} title="Bookkeeping is turned off" description="The gym owner can turn it on in Settings." className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-ledger-workspace">
      <PageHeader
        sectionLabel={t("nav.section.managementLedger")}
        title="Bookkeeping"
        description="Add sales and costs to the books, fix mistakes, and close each month. This is for running the gym, not for tax or official accounts."
        actions={canOwner && scopeBranchId ? <Button type="button" onClick={() => setManualOpen(true)}><Plus /> Add journal entry</Button> : <Badge variant="outline">{canOwner ? "Choose a branch to add entries" : "View only"}</Badge>}
      />

      <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label="Branch and month">
        <Field label={t("common.label.branch")} className="w-full sm:w-56"><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger aria-label={t("common.label.branch")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All your branches</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Month" className="w-full sm:w-72"><Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger aria-label="Month"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{periodLabel(period)}</SelectItem>)}</SelectContent></Select></Field>
        <div className="ms-auto flex items-center gap-2"><span className="text-[12px] text-ink-3">{branchFilter === "all" ? "All branches together" : branchName(session?.branches ?? [], branchFilter)}</span><Button type="button" variant="ghost" size="sm" onClick={retryAll} disabled={loading}><RefreshCw />{" "}{t("common.action.refresh")}</Button></div>
      </section>

      {dataError && !loading ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some parts could not load. Showing what did load. <button type="button" className="font-medium underline" onClick={retryAll}>{t("common.action.retry")}</button></div> : null}

      {/* Unfinished work first, control totals after. */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Books summary">
        <div className="panel p-4"><Stat label="Items found" value={sources.length} context={`${queueCounts.pending} ready to add · ${queueCounts.unconfigured} need setup${queueCounts.failed > 0 ? ` · ${queueCounts.failed} failed` : ""}`} tone={queueCounts.failed > 0 ? "danger" : queueCounts.pending + queueCounts.unconfigured > 0 ? "warning" : "default"} /></div>
        <div className="panel p-4"><Stat label="Trial balance debits" value={<MoneyText money={trialBalanceQuery.data?.totalDebit} compact />} context={trialBalanceQuery.data ? `${trialBalanceQuery.data.rows.length} accounts` : "Nothing added yet"} /></div>
        <div className="panel p-4"><Stat label="Trial balance credits" value={<MoneyText money={trialBalanceQuery.data?.totalCredit} compact />} context={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? "Debits and credits match" : "Debits and credits do not match"} tone={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? "success" : "warning"} /></div>
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as LedgerTab)}>
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="overview"><Scale className="size-3.5" /> Trial balance and accounts</TabsTrigger><TabsTrigger value="journals"><FileText className="size-3.5" /> Journals</TabsTrigger><TabsTrigger value="sources"><ClipboardList className="size-3.5" /> Items to add</TabsTrigger><TabsTrigger value="periods"><CalendarClock className="size-3.5" /> Months</TabsTrigger></TabsList>
        <TabsContent value="overview"><div className="grid items-start gap-5 xl:grid-cols-[1.35fr_.65fr]"><TrialBalanceCard trialBalance={trialBalanceQuery.data} loading={trialBalanceQuery.isLoading} currency={currency} /><AccountsCard accounts={accounts} loading={accountsQuery.isLoading} /></div></TabsContent>
        <TabsContent value="journals"><div className="space-y-5"><section className="panel overflow-hidden" aria-label="Journal entries"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Everything in the books</p><h2 className="mt-1 text-[16px] font-semibold">Journal entries</h2><p className="mt-1 text-[12px] text-ink-3">Every change to the books. Click one to see its lines.</p></div><Badge variant="outline">{journalsQuery.data?.totalItems ?? entries.length} entries</Badge></header><JournalTable entries={entries} branches={session?.branches ?? []} selectedId={selectedJournalId} onSelect={setSelectedJournalId} loading={journalsQuery.isLoading} onReverse={(entry) => setReasonAction({ kind: "reverse", id: entry.id, title: "Reverse this entry?", description: "This adds an opposite entry in an open month, so the two cancel out. The original entry stays in the books.", confirmLabel: "Reverse entry" })} canReverse={canOwner} /></section><JournalDetail detail={detailQuery.data} loading={detailQuery.isLoading} error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /></div></TabsContent>
        <TabsContent value="sources"><SourceQueue sources={sources} loading={sourcesQuery.isLoading} canRefresh={canRefresh} canWrite={canWrite} refreshPending={refreshMutation.isPending} postPendingId={postingSourceId} statusFilter={statusFilter} onStatusFilter={setStatusFilter} onRefresh={() => refreshMutation.mutate({ branchId: scopeBranchId })} onPost={(source) => { setPostingSourceId(source.id); sourceMutation.mutate({ source }); }} onExclude={(source) => setReasonAction({ kind: "exclude", id: source.id, source: { sourceType: source.sourceType, sourceId: source.sourceId }, title: "Leave this out of the books?", description: "It stays in this list but no longer counts as work to do. You can bring it back later.", confirmLabel: "Leave out" })} onReconsider={(source) => setReasonAction({ kind: "reconsider", id: source.id, source: { sourceType: source.sourceType, sourceId: source.sourceId }, title: "Bring this item back?", description: "It goes back to its normal status, usually Ready to add or Needs setup.", confirmLabel: "Bring back" })} /></TabsContent>
        <TabsContent value="periods"><PeriodsTable periods={periods} loading={periodsQuery.isLoading} canClose={canOwner} onClose={(period) => setReasonAction({ kind: "close", id: period.id, title: `Close ${periodLabel(period)}?`, description: `After you close it, no new entries can be dated in ${periodLabel(period)}. Check the items to add first.`, confirmLabel: "Close month" })} onReopen={(period) => setReasonAction({ kind: "reopen", id: period.id, title: `Reopen ${periodLabel(period)}?`, description: `Only reopen ${periodLabel(period)} to fix a real mistake in the books.`, confirmLabel: "Reopen month" })} /></TabsContent>
      </Tabs>

      <ManualJournalDialog open={manualOpen} onOpenChange={setManualOpen} accounts={accounts} branches={session?.branches ?? []} activeBranchId={scopeBranchId} currency={currency} pending={manualMutation.isPending} onSubmit={(input) => manualMutation.mutate(input)} />
      <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} onSubmit={submitReason} pending={reasonPending} />
    </div>
  );
}
