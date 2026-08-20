"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileText,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

const SOURCE_STATUSES: AccountingSourceStatus[] = ["pending", "unconfigured", "excluded", "failed", "posted", "reversed"];

function newKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sourceLabel(sourceType: string): string {
  return sourceType.replaceAll("_", " ");
}

function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" | "signal" {
  if (["posted", "balanced"].includes(status)) return "success";
  if (["pending", "unconfigured"].includes(status)) return "warning";
  if (["failed", "reversed", "out of balance"].includes(status)) return "danger";
  if (status === "excluded") return "signal";
  return "neutral";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariant(status)}>
      <span className="sr-only">Status: </span>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function branchName(branches: Array<{ id: string; name: string }>, branchId?: string): string {
  return branchId ? branches.find((branch) => branch.id === branchId)?.name ?? "Branch" : "Consolidated";
}

function periodLabel(period: AccountingPeriod): string {
  return `${period.periodStart.slice(0, 7)} · ${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)}`;
}

function LoadingGrid() {
  return (
    <div className="space-y-4" aria-label="Loading management ledger">
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
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!action) setReason("");
  }, [action]);

  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.title ?? "Confirm ledger action"}</DialogTitle>
          <DialogDescription>{action?.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Reason" hint="This is written to the audit trail." required>
            <Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the management decision" required />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
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
  const [scope, setScope] = useState<"branch" | "consolidated">("branch");
  const [branchId, setBranchId] = useState(activeBranchId ?? branches[0]?.id ?? "");
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
    setScope("branch");
    setBranchId(activeBranchId ?? branches[0]?.id ?? "");
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
    if (normalized.some((line) => !line.accountId || (line.debit.amount <= 0 && line.credit.amount <= 0))) return;
    onSubmit({
      branchId: scope === "branch" ? branchId || undefined : undefined,
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
          <DialogTitle>Post manual journal</DialogTitle>
          <DialogDescription>Record a balanced management-ledger adjustment. This does not claim statutory accounting compliance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Scope" required>
                <Select value={scope} onValueChange={(value) => setScope(value as "branch" | "consolidated")}>
                  <SelectTrigger aria-label="Manual journal scope"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="branch">Branch journal</SelectItem><SelectItem value="consolidated">Consolidated journal</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Branch" hint={scope === "consolidated" ? "Consolidated journals have no branch." : undefined} required={scope === "branch"}>
                <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)} disabled={scope === "consolidated"}>
                  <SelectTrigger aria-label="Manual journal branch"><SelectValue placeholder={scope === "consolidated" ? "No branch" : "Choose branch"} /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No branch</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Posting date" required><Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} /></Field>
              <Field label="Memo" required><Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Accrue monthly cleaning expense" required /></Field>
            </div>
            <div className="rounded-md border border-line-2 bg-sunken/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><div><p className="eyebrow">Journal lines</p><p className="text-[11.5px] text-ink-3">Enter a debit and credit in {currency}; the server enforces balance.</p></div><Badge variant="outline">{lines.length} lines</Badge></div>
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.5fr_.75fr_.75fr_1fr]">
                    <Select value={line.accountId || "none"} onValueChange={(value) => updateLine(index, { accountId: value === "none" ? "" : value })}>
                      <SelectTrigger aria-label={`Journal line ${index + 1} account`}><SelectValue placeholder="Choose account" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Choose account</SelectItem>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} · {account.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" dir="ltr" aria-label={`Journal line ${index + 1} debit`} placeholder="Debit" value={line.debit} onChange={(event) => updateLine(index, { debit: event.target.value })} />
                    <Input inputMode="decimal" dir="ltr" aria-label={`Journal line ${index + 1} credit`} placeholder="Credit" value={line.credit} onChange={(event) => updateLine(index, { credit: event.target.value })} />
                    <Input aria-label={`Journal line ${index + 1} description`} placeholder="Description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
                  </div>
                ))}
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setLines((current) => [...current, { accountId: accounts[0]?.id ?? "", debit: "", credit: "", description: "" }])}><Plus /> Add line</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Reason" hint="Written to the audit trail." required><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the management decision" required /></Field>
              <Field label="Idempotency key" hint="Reuse this key only for the same request." required><Input dir="ltr" value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} required /></Field>
            </div>
          </DialogBody>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" loading={pending} disabled={!memo.trim() || reason.trim().length < 3 || !idempotencyKey.trim()}>Post journal</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TrialBalanceCard({ trialBalance, loading, currency }: { trialBalance?: AccountingTrialBalance; loading: boolean; currency: string }) {
  if (loading) return <Skeleton className="h-80" />;
  if (!trialBalance || trialBalance.rows.length === 0) return <EmptyState icon={Scale} title="No posted ledger activity" description="Refresh the source queue and post configured source records, or add a manual journal, before reviewing balances." compact />;
  const balanced = trialBalance.totalDebit.amount === trialBalance.totalCredit.amount;
  return (
    <section className="panel overflow-hidden" aria-label="Trial balance" data-testid="trial-balance">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div><p className="eyebrow">Control total · {currency}</p><h2 className="mt-1 text-[16px] font-semibold">Trial balance</h2><p className="mt-1 text-[12px] text-ink-3">Posted and reversing entries in the selected scope.</p></div>
        <div className="flex items-center gap-2" role="status" aria-label={balanced ? "Trial balance balanced" : "Trial balance is out of balance"}>
          {balanced ? <CheckCircle2 className="size-4 text-success-deep" aria-hidden /> : <AlertTriangle className="size-4 text-danger" aria-hidden />}
          <StatusBadge status={balanced ? "balanced" : "out of balance"} />
        </div>
      </header>
      <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3">
        <div className="px-4 py-3"><p className="eyebrow">Total debits</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalDebit} /></p></div>
        <div className="px-4 py-3"><p className="eyebrow">Total credits</p><p className="mt-1 text-[18px] font-semibold tabular"><MoneyText money={trialBalance.totalCredit} /></p></div>
        <div className="col-span-2 px-4 py-3 sm:col-span-1"><p className="eyebrow">Difference</p><p className={cn("mt-1 text-[18px] font-semibold tabular", !balanced && "text-danger")}><MoneyText money={money(trialBalance.totalDebit.amount - trialBalance.totalCredit.amount, trialBalance.currency)} signed /></p></div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-end">Debit</TableHead><TableHead className="text-end">Credit</TableHead><TableHead className="text-end">Balance</TableHead></TableRow></TableHeader>
        <TableBody>{trialBalance.rows.map((row) => <TableRow key={row.accountId}><TableCell><p className="font-medium">{row.accountCode} · {row.accountName}</p><p className="text-[11px] text-ink-3">{row.statementGroup.replaceAll("_", " ")}</p></TableCell><TableCell className="capitalize text-[12px]">{row.accountType}</TableCell><TableCell className="text-end"><MoneyText money={row.debit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.credit} hideCurrency /></TableCell><TableCell className="text-end"><MoneyText money={row.balance} hideCurrency signed /></TableCell></TableRow>)}</TableBody>
      </Table>
    </section>
  );
}

function AccountsCard({ accounts, loading }: { accounts: AccountingAccount[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-72" />;
  return (
    <section className="panel overflow-hidden" aria-label="Chart of accounts">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="eyebrow">Structure</p><h2 className="mt-1 text-[16px] font-semibold">Chart of accounts</h2><p className="mt-1 text-[12px] text-ink-3">Code-owned accounts used by management postings.</p></div><Badge variant="outline">{accounts.length} accounts</Badge></header>
      {accounts.length === 0 ? <EmptyState icon={BookOpen} title="No accounts configured" description="The management-ledger chart has not been provisioned for this organization." compact /> : <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Account</TableHead><TableHead>Statement group</TableHead><TableHead>Cash-flow group</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.id}><TableCell className="font-mono text-[12px]">{account.code}</TableCell><TableCell><p className="font-medium">{account.name}</p>{account.nameAr ? <p className="rtl-font text-[11px] text-ink-3" dir="rtl">{account.nameAr}</p> : null}</TableCell><TableCell className="text-[12px] capitalize">{account.statementGroup.replaceAll("_", " ")}</TableCell><TableCell className="text-[12px] capitalize">{account.cashflowGroup.replaceAll("_", " ")}</TableCell></TableRow>)}</TableBody></Table>}
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
  if (loading) return <Skeleton className="h-72" />;
  if (entries.length === 0) return <EmptyState icon={FileText} title="No journal entries in this scope" description="Posted source records and manual journals will appear here." compact />;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Posting date</TableHead><TableHead>Memo</TableHead><TableHead>Branch</TableHead><TableHead>Status</TableHead><TableHead className="text-end">Amount</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
      <TableBody>{entries.map((entry) => <TableRow key={entry.id} className={cn(selectedId === entry.id && "bg-sunken/50")}>
        <TableCell className="whitespace-nowrap"><button type="button" className="text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)} aria-label={`View journal ${entry.memo}`}><DateText iso={entry.postingDate} /></button><p className="font-mono text-[10px] text-ink-3">{entry.id.slice(0, 8)}</p></TableCell>
        <TableCell><button type="button" className="max-w-[260px] text-start font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink" onClick={() => onSelect(entry.id)}>{entry.memo}</button>{entry.sourceType ? <p className="text-[11px] capitalize text-ink-3">{sourceLabel(entry.sourceType)}</p> : null}</TableCell>
        <TableCell className="text-[12px]">{entry.scope === "consolidated" ? "Consolidated" : branchName(branches, entry.branchId)}</TableCell>
        <TableCell><StatusBadge status={entry.status} /></TableCell>
        <TableCell className="text-end"><MoneyText money={entry.totalDebit} /></TableCell>
        <TableCell className="text-end">{canReverse && entry.status === "posted" ? <Button type="button" variant="ghost" size="xs" onClick={() => onReverse(entry)} aria-label={`Reverse journal ${entry.memo}`}><RotateCcw /> Reverse</Button> : null}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  );
}

function JournalDetail({ detail, loading, error, onRetry }: { detail?: AccountingJournalEntryDetail; loading: boolean; error?: unknown; onRetry: () => void }) {
  if (!detail && loading) return <Skeleton className="h-64" />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} />;
  if (!detail) return <StatePanel icon={FileText} title="Select a journal entry" description="Choose a row above to inspect its source, reason, and immutable lines." compact />;
  return (
    <section className="panel overflow-hidden" aria-label="Journal entry detail">
      <header className="border-b border-line px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Entry detail</p><h2 className="mt-1 text-[16px] font-semibold">{detail.memo}</h2><p className="mt-1 text-[11.5px] text-ink-3"><span dir="ltr">{detail.id}</span> · {detail.scope === "consolidated" ? "Consolidated" : "Branch"}</p></div><StatusBadge status={detail.status} /></div></header>
      <div className="grid gap-3 border-b border-line px-4 py-3 text-[12px] sm:grid-cols-3"><div><p className="eyebrow">Posting date</p><p className="mt-1"><DateText iso={detail.postingDate} /></p></div><div><p className="eyebrow">Created</p><p className="mt-1"><DateTimeText iso={detail.createdAt} /></p></div><div><p className="eyebrow">Policy</p><p className="mt-1 font-mono text-[11px]">{detail.policyCode ?? "manual"}{detail.policyVersion ? ` · v${detail.policyVersion}` : ""}</p></div></div>
      {detail.reason ? <p className="border-b border-line px-4 py-3 text-[12px] text-ink-2"><span className="font-medium text-ink">Reason:</span> {detail.reason}</p> : null}
      <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-end">Debit</TableHead><TableHead className="text-end">Credit</TableHead></TableRow></TableHeader><TableBody>{detail.lines.map((line) => <TableRow key={line.id}><TableCell><p className="font-medium">{line.accountCode} · {line.accountName}</p><p className="text-[10px] text-ink-3">{line.statementGroup.replaceAll("_", " ")}</p></TableCell><TableCell className="text-[12px] text-ink-2">{line.description ?? "—"}</TableCell><TableCell className="text-end"><MoneyText money={line.debit} /></TableCell><TableCell className="text-end"><MoneyText money={line.credit} /></TableCell></TableRow>)}</TableBody></Table>
    </section>
  );
}

function SourceQueue({
  sources,
  loading,
  canWrite,
  refreshPending,
  postPendingId,
  statusFilter,
  onStatusFilter,
  onRefresh,
  onPost,
}: {
  sources: AccountingSourcePosting[];
  loading: boolean;
  canWrite: boolean;
  refreshPending: boolean;
  postPendingId?: string;
  statusFilter: AccountingSourceStatus | "all";
  onStatusFilter: (value: AccountingSourceStatus | "all") => void;
  onRefresh: () => void;
  onPost: (source: AccountingSourcePosting) => void;
}) {
  const rows = statusFilter === "all" ? sources : sources.filter((source) => source.status === statusFilter);
  return (
    <section className="panel overflow-hidden" aria-label="Source posting queue" data-testid="source-posting-queue">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3"><div><p className="eyebrow">Control queue</p><h2 className="mt-1 text-[16px] font-semibold">Source postings</h2><p className="mt-1 max-w-xl text-[12px] text-ink-3">Refresh discovers persisted operational facts. Nothing is posted until an authorized operator takes the action.</p></div><div className="flex items-center gap-2"><Select value={statusFilter} onValueChange={(value) => onStatusFilter(value as AccountingSourceStatus | "all")}><SelectTrigger className="w-40" sizeVariant="sm" aria-label="Source status filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{SOURCE_STATUSES.map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select>{canWrite ? <Button type="button" size="sm" variant="secondary" loading={refreshPending} onClick={onRefresh}><RefreshCw /> Refresh queue</Button> : null}</div></header>
      {!canWrite ? <div className="border-b border-line bg-sunken/30 px-4 py-2.5 text-[12px] text-ink-2" role="status">Read-only access: managers or owners must refresh and post source records.</div> : null}
      {loading ? <Skeleton className="m-4 h-64" /> : rows.length === 0 ? <EmptyState icon={ClipboardList} title={statusFilter === "all" ? "Source queue is empty" : `No ${statusFilter.replaceAll("_", " ")} sources`} description={canWrite ? "Refresh to discover payments, memberships, purchasing, stock, facility, and equipment facts." : "No source records match this status in the selected scope."} compact /> : <Table><TableHeader><TableRow><TableHead>Occurred</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Policy</TableHead><TableHead className="text-end">Amount</TableHead><TableHead><span className="sr-only">Action</span></TableHead></TableRow></TableHeader><TableBody>{rows.map((source) => <TableRow key={source.id}><TableCell className="whitespace-nowrap"><DateTimeText iso={source.occurredAt} /><p className="font-mono text-[10px] text-ink-3">{source.sourceId.slice(0, 8)}</p></TableCell><TableCell><p className="font-medium capitalize">{sourceLabel(source.sourceType)}</p>{source.details ? <p className="max-w-[260px] truncate text-[11px] text-ink-3">{Object.entries(source.details).map(([key, value]) => `${key}: ${String(value)}`).join(" · ")}</p> : null}</TableCell><TableCell><StatusBadge status={source.status} />{source.reason ? <p className="mt-1 max-w-[220px] text-[11px] text-ink-3">{source.reason}</p> : null}</TableCell><TableCell className="font-mono text-[11px]">{source.policyCode ? `${source.policyCode}${source.policyVersion ? ` · v${source.policyVersion}` : ""}` : "Not configured"}</TableCell><TableCell className="text-end"><MoneyText money={source.amount} /></TableCell><TableCell className="text-end">{canWrite && source.status === "pending" ? <Button type="button" size="xs" variant="secondary" loading={postPendingId === source.id} onClick={() => onPost(source)}>Post source</Button> : source.status === "posted" ? <span className="text-[11px] text-ink-3">Posted</span> : <span className="text-[11px] text-ink-3">Review</span>}</TableCell></TableRow>)}</TableBody></Table>}
      <div className="border-t border-line px-4 py-2.5 text-[11px] text-ink-3">Statuses are explicit: pending needs review, unconfigured lacks a safe policy, excluded is intentionally out of scope, failed needs investigation, and posted/reversed are immutable outcomes.</div>
    </section>
  );
}

function PeriodsTable({ periods, loading, canClose, onClose, onReopen }: { periods: AccountingPeriod[]; loading: boolean; canClose: boolean; onClose: (period: AccountingPeriod) => void; onReopen: (period: AccountingPeriod) => void }) {
  if (loading) return <Skeleton className="h-64" />;
  return (
    <section className="panel overflow-hidden" aria-label="Accounting periods">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="eyebrow">Period control</p><h2 className="mt-1 text-[16px] font-semibold">Accounting periods</h2><p className="mt-1 text-[12px] text-ink-3">Closing prevents new postings in that period; reopening is an owner-only audited action.</p></div><CalendarClock className="size-5 text-ink-3" aria-hidden /></header>
      {periods.length === 0 ? <EmptyState icon={CalendarClock} title="No periods yet" description="A period is created when the first management-ledger posting is made." compact /> : <Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Closed / reopened</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.id}><TableCell><p className="font-medium">{periodLabel(period)}</p><p className="font-mono text-[10px] text-ink-3">{period.id}</p></TableCell><TableCell><StatusBadge status={period.status} /></TableCell><TableCell className="text-[12px]">{period.status === "closed" ? <DateTimeText iso={period.closedAt} /> : period.reopenedAt ? <span>Reopened <DateTimeText iso={period.reopenedAt} /></span> : "Open for posting"}</TableCell><TableCell className="text-end">{canClose ? period.status === "open" ? <Button type="button" size="xs" variant="secondary" onClick={() => onClose(period)}>Close period</Button> : <Button type="button" size="xs" variant="ghost" onClick={() => onReopen(period)}><RotateCcw /> Reopen</Button> : <span className="text-[11px] text-ink-3">Owner only</span>}</TableCell></TableRow>)}</TableBody></Table>}
    </section>
  );
}

export function ManagementLedgerWorkspace() {
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [tab, setTab] = useState<LedgerTab>("overview");
  const [branchFilter, setBranchFilter] = useState<string>(session?.activeBranchId ?? "all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<AccountingSourceStatus | "all">("all");
  const [selectedJournalId, setSelectedJournalId] = useState<string>();
  const [manualOpen, setManualOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<{ kind: "reverse" | "close" | "reopen"; id: string; title: string; description: string; confirmLabel: string } | null>(null);
  const [postingSourceId, setPostingSourceId] = useState<string>();

  useEffect(() => {
    if (branchFilter !== "all" && !session?.branches.some((branch) => branch.id === branchFilter)) setBranchFilter(session?.activeBranchId ?? "all");
  }, [branchFilter, session?.activeBranchId, session?.branches]);

  const canRead = can("reports.financial.read");
  const canWrite = can("accounting.post");
  const canOwner = session?.roles.includes("owner") ?? false;
  const scopeBranchId = branchFilter === "all" ? undefined : branchFilter;
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

  const refreshMutation = useApiMutation((api, input: { branchId?: UUID }) => api.refreshAccountingSourceQueue(input), { successMessage: (result: RefreshAccountingSourceQueueResult) => `Source queue refreshed · ${result.scanned} facts scanned.`, onSuccess: async () => { await invalidate([qk.finance()]); } });
  const sourceMutation = useApiMutation((api, input: { source: AccountingSourcePosting }) => api.postAccountingSource({ sourceType: input.source.sourceType, sourceId: input.source.sourceId, idempotencyKey: newKey(`source-${input.source.id}`), reason: "Posted from the management-ledger source queue." }), { onSuccess: async () => { setPostingSourceId(undefined); await invalidate([qk.finance()]); }, onError: () => setPostingSourceId(undefined), successMessage: "Source posted to the management ledger." });
  const manualMutation = useApiMutation((api, input: PostManualJournalInput) => api.postManualJournal(input), { onSuccess: async () => { setManualOpen(false); await invalidate([qk.finance()]); }, successMessage: "Manual journal posted." });
  const reverseMutation = useApiMutation((api, input: { entryId: UUID; reason: string }) => api.reverseAccountingEntry(input.entryId, { reason: input.reason, idempotencyKey: newKey("reverse") }), { onSuccess: async () => { setReasonAction(null); await invalidate([qk.finance()]); }, successMessage: "Reversal posted." });
  const closeMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.closeAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate([qk.finance()]); }, successMessage: "Accounting period closed." });
  const reopenMutation = useApiMutation((api, input: { periodId: UUID; reason: string }) => api.reopenAccountingPeriod(input.periodId, input.reason), { onSuccess: async () => { setReasonAction(null); await invalidate([qk.finance()]); }, successMessage: "Accounting period reopened." });

  const accounts = accountsQuery.data ?? [];
  const periods = useMemo(() => [...(periodsQuery.data ?? [])].sort((a, b) => b.periodStart.localeCompare(a.periodStart)), [periodsQuery.data]);
  const entries = journalsQuery.data?.items ?? [];
  const sources = useMemo(() => {
    const period = periodFilter === "all" ? undefined : periods.find((candidate) => candidate.id === periodFilter);
    if (!period) return sourcesQuery.data?.items ?? [];
    return (sourcesQuery.data?.items ?? []).filter((source) => source.occurredAt.slice(0, 10) >= period.periodStart && source.occurredAt.slice(0, 10) <= period.periodEnd);
  }, [periodFilter, periods, sourcesQuery.data?.items]);

  const dataError = accountsQuery.error ?? periodsQuery.error ?? trialBalanceQuery.error ?? journalsQuery.error ?? sourcesQuery.error;
  const loading = accountsQuery.isLoading || periodsQuery.isLoading || trialBalanceQuery.isLoading || journalsQuery.isLoading || sourcesQuery.isLoading;

  const retryAll = () => { void Promise.all([accountsQuery.refetch(), periodsQuery.refetch(), trialBalanceQuery.refetch(), journalsQuery.refetch(), sourcesQuery.refetch()]); };
  const submitReason = (reason: string) => {
    if (!reasonAction) return;
    if (reasonAction.kind === "reverse") reverseMutation.mutate({ entryId: reasonAction.id, reason });
    else if (reasonAction.kind === "close") closeMutation.mutate({ periodId: reasonAction.id, reason });
    else reopenMutation.mutate({ periodId: reasonAction.id, reason });
  };
  const reasonPending = reverseMutation.isPending || closeMutation.isPending || reopenMutation.isPending;

  if (!canRead) return <ForbiddenState description="The management ledger is limited to roles with financial reporting access." />;
  if (workspaceQuery.isLoading) return <><PageHeader eyebrow="Finance" title="Management ledger" description="A branch-aware, immutable management ledger for operational decisions." /><LoadingGrid /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!financeModule?.entitled) return <StatePanel icon={LockKeyhole} title="Management ledger is not included" description="The Pro finance workspace module adds the immutable management ledger, source posting queue, periods, and cash control." className="mt-4" />;
  if (!financeModule.enabled) return <StatePanel icon={LockKeyhole} title="Management ledger is paused" description="An organization owner can enable the finance module from workspace settings." className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-ledger-workspace">
      <PageHeader
        eyebrow="Finance · management ledger"
        title="Management ledger"
        description="One auditable place to post operational facts, review balances, and keep branch control totals honest. This is management accounting, not a statutory filing system."
        actions={canOwner ? <Button type="button" onClick={() => setManualOpen(true)}><Plus /> Manual journal</Button> : <Badge variant="outline">Read-only for this role</Badge>}
      />

      <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label="Ledger scope filters">
        <Field label="Branch scope" className="w-full sm:w-56"><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger aria-label="Ledger branch scope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All accessible branches</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Accounting period" className="w-full sm:w-72"><Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger aria-label="Ledger accounting period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All periods</SelectItem>{periods.map((period) => <SelectItem key={period.id} value={period.id}>{periodLabel(period)}</SelectItem>)}</SelectContent></Select></Field>
        <div className="ms-auto flex items-center gap-2"><span className="text-[11.5px] text-ink-3">{branchFilter === "all" ? "Consolidated view" : branchName(session?.branches ?? [], branchFilter)}</span><Button type="button" variant="ghost" size="sm" onClick={retryAll} disabled={loading}><RefreshCw /> Refresh</Button></div>
      </section>

      {dataError && !loading ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some ledger panels could not refresh. Showing records that loaded. <button type="button" className="font-medium underline" onClick={retryAll}>Retry all</button></div> : null}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Ledger summary">
        <div className="panel p-4"><Stat label="Trial balance debits" value={<MoneyText money={trialBalanceQuery.data?.totalDebit} compact />} context={trialBalanceQuery.data ? `${trialBalanceQuery.data.rows.length} accounts in scope` : "No posted balances"} /></div>
        <div className="panel p-4"><Stat label="Trial balance credits" value={<MoneyText money={trialBalanceQuery.data?.totalCredit} compact />} context={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? "Control total balanced" : "Review the difference"} tone={trialBalanceQuery.data && trialBalanceQuery.data.totalDebit.amount === trialBalanceQuery.data.totalCredit.amount ? "success" : "warning"} /></div>
        <div className="panel p-4"><Stat label="Source queue" value={sources.length} context={`${sources.filter((source) => source.status === "pending").length} pending · ${sources.filter((source) => source.status === "unconfigured").length} unconfigured`} tone={sources.some((source) => source.status === "pending" || source.status === "unconfigured") ? "warning" : "default"} /></div>
      </section>

      <Tabs value={tab} onValueChange={(value) => setTab(value as LedgerTab)}>
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="overview"><Scale className="size-3.5" /> Trial balance & accounts</TabsTrigger><TabsTrigger value="journals"><FileText className="size-3.5" /> Journals</TabsTrigger><TabsTrigger value="sources"><ClipboardList className="size-3.5" /> Source queue</TabsTrigger><TabsTrigger value="periods"><CalendarClock className="size-3.5" /> Periods</TabsTrigger></TabsList>
        <TabsContent value="overview"><div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><TrialBalanceCard trialBalance={trialBalanceQuery.data} loading={trialBalanceQuery.isLoading} currency={currency} /><AccountsCard accounts={accounts} loading={accountsQuery.isLoading} /></div></TabsContent>
        <TabsContent value="journals"><div className="space-y-5"><section className="panel overflow-hidden" aria-label="Journal entries"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="eyebrow">Immutable register</p><h2 className="mt-1 text-[16px] font-semibold">Journal entries</h2><p className="mt-1 text-[12px] text-ink-3">Click an entry to inspect its balanced lines and source policy.</p></div><Badge variant="outline">{journalsQuery.data?.totalItems ?? entries.length} entries</Badge></header><JournalTable entries={entries} branches={session?.branches ?? []} selectedId={selectedJournalId} onSelect={setSelectedJournalId} loading={journalsQuery.isLoading} onReverse={(entry) => setReasonAction({ kind: "reverse", id: entry.id, title: "Reverse journal entry", description: "A reversal posts opposite lines in a new open period. The original entry remains immutable.", confirmLabel: "Post reversal" })} canReverse={canOwner} /></section><JournalDetail detail={detailQuery.data} loading={detailQuery.isLoading} error={detailQuery.error} onRetry={() => void detailQuery.refetch()} /></div></TabsContent>
        <TabsContent value="sources"><SourceQueue sources={sources} loading={sourcesQuery.isLoading} canWrite={canWrite} refreshPending={refreshMutation.isPending} postPendingId={postingSourceId} statusFilter={statusFilter} onStatusFilter={setStatusFilter} onRefresh={() => refreshMutation.mutate({ branchId: scopeBranchId })} onPost={(source) => { setPostingSourceId(source.id); sourceMutation.mutate({ source }); }} /></TabsContent>
        <TabsContent value="periods"><PeriodsTable periods={periods} loading={periodsQuery.isLoading} canClose={canOwner} onClose={(period) => setReasonAction({ kind: "close", id: period.id, title: "Close accounting period", description: `No new postings can be dated in ${period.id} after closing. Review the source queue before confirming.`, confirmLabel: "Close period" })} onReopen={(period) => setReasonAction({ kind: "reopen", id: period.id, title: "Reopen accounting period", description: `Reopening ${period.id} is an audited owner action. Use it only to correct a documented management-ledger issue.`, confirmLabel: "Reopen period" })} /></TabsContent>
      </Tabs>

      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-3 py-2.5 text-[11.5px] text-ink-3"><Coins className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Amounts are stored as integer minor units in {currency}. The ledger preserves source policy versions and audit reasons; statutory accounting, tax filing, and external-provider settlement remain outside this workspace.</p></div>

      <ManualJournalDialog open={manualOpen} onOpenChange={setManualOpen} accounts={accounts} branches={session?.branches ?? []} activeBranchId={session?.activeBranchId} currency={currency} pending={manualMutation.isPending} onSubmit={(input) => manualMutation.mutate(input)} />
      <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} onSubmit={submitReason} pending={reasonPending} />
    </div>
  );
}
