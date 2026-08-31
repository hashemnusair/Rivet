"use client";

import { Download, FilterX, ReceiptText, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { DataPagination } from "@/components/shared/chrome";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import type { CustomerTransactionQuery } from "@/lib/domain/qol";
import { downloadTextFile } from "@/lib/exports/download";

const TYPE_LABELS: Record<string, string> = { payment: "Payment", refund: "Refund", void: "Void", retail_sale: "Retail purchase" };

export function CustomerFinanceClient() {
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search, 250);
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const gymId = params.get("gym") ?? undefined;
  const type = params.get("type") as CustomerTransactionQuery["type"] | null;
  const status = params.get("status") as CustomerTransactionQuery["status"] | null;
  const from = params.get("from") ?? undefined;
  const to = params.get("to") ?? undefined;
  const enabled = ready && identitySignedIn && profileSelected;

  const query = useMemo<CustomerTransactionQuery>(() => ({ gymId, type: type ?? undefined, status: status ?? undefined, from, to, search: debouncedSearch || undefined, page, pageSize: 20, sort: "-occurredAt" }), [debouncedSearch, from, gymId, page, status, to, type]);
  const summary = useApiQuery(qk.customerFinance("summary"), (api) => api.getCustomerFinancialSummary(), { enabled });
  const transactions = useApiQuery(qk.customerFinance(query), (api) => api.listCustomerTransactions(query), { enabled });
  const personalExport = useApiMutation((api) => api.requestMemberPersonalDataExport(crypto.randomUUID()), {
    successMessage: "Your personal-data export is ready.",
    onSuccess: (job) => {
      if (!job.content || !job.fileName) return;
      downloadTextFile({ content: job.content, fileName: job.fileName, mimeType: job.mimeType ?? "text/csv;charset=utf-8" });
    },
  });

  const setParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in changes)) next.delete("page");
    const value = next.toString();
    router.replace(value ? `${pathname}?${value}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedSearch) setParams({ q: debouncedSearch || undefined });
    // URL writes should track only the settled search text. The remaining
    // filters update through explicit controls and would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  if (!ready || !identitySignedIn) return <main className="mx-auto max-w-[1080px] px-4 py-12"><Skeleton className="h-72 w-full" /></main>;
  if (!profileSelected) return <main className="mx-auto max-w-lg px-4 py-20 text-center"><h1 className="font-display text-2xl font-semibold">Finish your member profile</h1><p className="mt-2 text-[13px] text-ink-2">Your receipts appear after your member account is ready.</p><Button asChild className="mt-5"><Link href="/customer/signup">Finish setup</Link></Button></main>;

  const hasFilters = Boolean(search || gymId || type || status || from || to);
  return (
    <main className="mx-auto max-w-[1080px] px-4 py-7 pb-24 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Member finance</p><h1 className="mt-1 font-display text-[27px] font-semibold tracking-tight">Payments and receipts</h1><p className="mt-1 max-w-2xl text-[13px] text-ink-2">See what each gym recorded, open the matching receipt, and understand refunds or remaining balances.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={personalExport.isPending} onClick={() => personalExport.mutate()}><Download /> Export my data</Button><Button asChild variant="secondary"><Link href="/customer/my-gyms"><WalletCards /> My gyms</Link></Button></div>
      </header>

      {summary.isLoading ? <div className="mt-7 grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-24" />)}</div> : summary.isError ? <div className="mt-7"><ErrorState onRetry={() => summary.refetch()} /></div> : summary.data ? (
        <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Financial summary">
          <SummaryCard label="Outstanding" value={<MoneyText money={summary.data.outstanding} />} detail={summary.data.outstanding.amount > 0 ? "Ask the gym about payment options." : "No collectible balance."} attention={summary.data.outstanding.amount > 0} />
          <SummaryCard label="Paid to gyms" value={<MoneyText money={summary.data.paidLifetime} />} detail={summary.data.lastPaymentAt ? <><span>Last payment </span><DateTimeText iso={summary.data.lastPaymentAt} /></> : "No payments yet."} />
          <SummaryCard label="Receipts" value={summary.data.receiptCount.toLocaleString()} detail={`${summary.data.gyms.length} connected ${summary.data.gyms.length === 1 ? "gym" : "gyms"}`} />
        </section>
      ) : null}

      <section className="mt-6 panel overflow-hidden">
        <header className="border-b border-line p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_160px_160px]">
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="ps-9" placeholder="Receipt number, gym or method" aria-label="Search payments and receipts" /></div>
            <Select value={gymId ?? "all"} onValueChange={(value) => setParams({ gym: value === "all" ? undefined : value })}><SelectTrigger aria-label="Gym"><SelectValue placeholder="All gyms" /></SelectTrigger><SelectContent><SelectItem value="all">All gyms</SelectItem>{(summary.data?.gyms ?? []).map((gym) => <SelectItem key={gym.id} value={gym.id}>{gym.name}</SelectItem>)}</SelectContent></Select>
            <Select value={type ?? "all"} onValueChange={(value) => setParams({ type: value === "all" ? undefined : value })}><SelectTrigger aria-label="Transaction type"><SelectValue placeholder="All types" /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={status ?? "all"} onValueChange={(value) => setParams({ status: value === "all" ? undefined : value })}><SelectTrigger aria-label="Transaction status"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="partially_refunded">Part-refunded</SelectItem><SelectItem value="refunded">Refunded</SelectItem><SelectItem value="voided">Voided</SelectItem></SelectContent></Select>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-[11px] font-medium text-ink-2">From<Input type="date" value={from ?? ""} onChange={(event) => setParams({ from: event.target.value || undefined })} /></label><label className="grid gap-1 text-[11px] font-medium text-ink-2">To<Input type="date" value={to ?? ""} onChange={(event) => setParams({ to: event.target.value || undefined })} /></label>{hasFilters ? <Button variant="ghost" size="sm" onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }}><FilterX /> Clear filters</Button> : null}</div>
        </header>

        {transactions.isLoading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}</div> : transactions.isError ? <div className="p-5"><ErrorState onRetry={() => transactions.refetch()} /></div> : transactions.data?.items.length ? (
          <div className="divide-y divide-line">{transactions.data.items.map((item) => <article key={`${item.gymId}-${item.id}`} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={item.receiptId ? `/customer/receipts/${item.receiptId}` : "/customer/finance"} className="font-mono text-[12px] font-semibold underline decoration-line-3 underline-offset-2">{item.receiptNumber}</Link><TransactionStatusChip status={item.status} /><span className="text-[11px] text-ink-3">{TYPE_LABELS[item.type] ?? item.type}</span></div><p className="mt-1 text-[13px] font-medium">{item.gymName} · {item.branchName}</p><p className="mt-1 text-[11.5px] text-ink-3">{item.explanation}</p></div><div className="flex items-center justify-between gap-5 sm:block sm:text-end"><div><MoneyText money={item.amount} className="font-semibold" /><p className="mt-0.5 text-[11px] text-ink-3">{PAYMENT_METHOD_LABELS[item.method] ?? item.method}</p></div><p className="text-[11.5px] text-ink-3 sm:mt-2"><DateTimeText iso={item.occurredAt} /></p></div></article>)}</div>
        ) : <EmptyState title={hasFilters ? "No matching transactions" : "No payments yet"} description={hasFilters ? "Clear a filter or try a different receipt number." : "Payments and receipts from your connected gyms will appear here."} icon={ReceiptText} action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(""); router.replace(pathname, { scroll: false }); }}><FilterX /> Clear filters</Button> : undefined} />}
        {transactions.data ? <DataPagination page={transactions.data} onPage={(next) => setParams({ page: String(next) })} className="border-t border-line px-4 py-3" /> : null}
      </section>

      <section className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-sunken/40 p-4 text-[12px] text-ink-2"><Download className="mt-0.5 size-4 shrink-0" aria-hidden /><p>Open any receipt to print it or download a plain-text copy. The gym&apos;s recorded payment status remains the source of truth.</p></section>
    </main>
  );
}

function SummaryCard({ label, value, detail, attention }: { label: string; value: React.ReactNode; detail: React.ReactNode; attention?: boolean }) {
  return <section className={attention ? "panel border-warning/50 bg-warning-bg/20 p-4" : "panel p-4"}><p className="text-[11px] font-medium uppercase tracking-[0.1em] text-ink-3">{label}</p><p className="mt-2 font-display text-[24px] font-semibold">{value}</p><p className="mt-1 text-[11.5px] text-ink-3">{detail}</p></section>;
}
