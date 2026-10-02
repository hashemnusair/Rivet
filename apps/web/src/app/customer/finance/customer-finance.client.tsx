"use client";
import { useT } from "@/lib/i18n/provider";

import { ChevronRight, Download, FilterX, ReceiptText, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { CustomerFinancialSummary, CustomerTransaction, CustomerTransactionQuery } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { downloadTextFile } from "@/lib/exports/download";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";

const TYPE_LABELS: Record<string, string> = { payment: "Payment", refund: "Refund", void: "Cancelled payment", retail_sale: "Shop purchase" };
const STATUS_LABELS: Record<string, string> = { completed: "Completed", partially_refunded: "Partly refunded", refunded: "Refunded", voided: "Cancelled" };

export function CustomerFinanceClient() {
  const t = useT();
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
  const secondaryCount = [gymId, type, status, from, to].filter(Boolean).length;
  // Phones show the search first and keep the narrower filters behind one
  // toggle; an active filter keeps its controls open so nothing is hidden.
  const [filtersOpen, setFiltersOpen] = useState(secondaryCount > 0);

  const query = useMemo<CustomerTransactionQuery>(() => ({ gymId, type: type ?? undefined, status: status ?? undefined, from, to, search: debouncedSearch || undefined, page, pageSize: 20, sort: "-occurredAt" }), [debouncedSearch, from, gymId, page, status, to, type]);
  const summary = useApiQuery(qk.customerFinance("summary"), (api) => api.getCustomerFinancialSummary(), { enabled });
  const transactions = useApiQuery(qk.customerFinance(query), (api) => api.listCustomerTransactions(query), { enabled });
  const personalExport = useApiMutation((api) => api.requestMemberPersonalDataExport(crypto.randomUUID()), {
    successMessage: "Your data file is ready.",
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
  const clearFilters = () => {
    setSearch("");
    router.replace(pathname, { scroll: false });
  };

  useEffect(() => {
    if ((params.get("q") ?? "") !== debouncedSearch) setParams({ q: debouncedSearch || undefined });
    // URL writes should track only the settled search text. The remaining
    // filters update through explicit controls and would otherwise loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  if (!ready || !identitySignedIn) return <main className="mx-auto max-w-[1080px] px-4 py-12" role="status" aria-label="Checking access"><Skeleton className="h-72 w-full" /></main>;
  if (!profileSelected) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="font-display text-[24px] font-semibold tracking-tight">{t("auth.memberSetup.title")}</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">Finish setting up your account to see your receipts.</p>
        <Button asChild className="mt-5"><Link href="/login/member/create">Finish setup</Link></Button>
      </main>
    );
  }

  const hasFilters = Boolean(search || secondaryCount);
  const gyms = summary.data?.gyms ?? [];
  const activeFilterLabels = [
    gymId ? gyms.find((gym) => gym.id === gymId)?.name ?? "One gym" : undefined,
    type ? TYPE_LABELS[type] ?? type : undefined,
    status ? STATUS_LABELS[status] ?? status : undefined,
    from ? `From ${formatDate(from)}` : undefined,
    to ? `Until ${formatDate(to)}` : undefined,
  ].filter((label): label is string => Boolean(label));

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <PageHeader
        title={t("palette.pages.paymentsSubtitle")}
        description="All payments your gyms recorded for you, with receipts."
        actions={<Button variant="secondary" size="sm" loading={personalExport.isPending} onClick={() => personalExport.mutate()} title="Download a spreadsheet file of your data"><Download /> Download my data (CSV)</Button>}
      />

      <FinanceSummary loading={summary.isLoading} error={summary.isError} data={summary.data} onRetry={() => summary.refetch()} />

      <section className="panel mt-4 overflow-hidden" aria-labelledby="transactions-title">
        <h2 id="transactions-title" className="sr-only">Transactions</h2>
        <div className="border-b border-line p-3 sm:p-4">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 ps-9 sm:h-9" type="search" inputMode="search" placeholder="Search by receipt number, gym or payment method" aria-label="Search payments and receipts" />
            </div>
            <Button type="button" variant="secondary" className="h-11 shrink-0 sm:h-9 md:hidden" aria-expanded={filtersOpen} aria-controls="finance-filters" onClick={() => setFiltersOpen((value) => !value)}>
              <SlidersHorizontal /> Filters{secondaryCount ? <span className="tabular">· {secondaryCount}</span> : null}
            </Button>
          </div>

          <div id="finance-filters" className={cn("mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-[repeat(3,minmax(0,1fr))]", !filtersOpen && "hidden md:grid")}>
            <Select value={gymId ?? "all"} onValueChange={(value) => setParams({ gym: value === "all" ? undefined : value })}>
              <SelectTrigger className="h-11 sm:h-9" aria-label={t("shell.topbar.gym")}><SelectValue placeholder="All gyms" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All gyms</SelectItem>{gyms.map((gym) => <SelectItem key={gym.id} value={gym.id}>{gym.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={type ?? "all"} onValueChange={(value) => setParams({ type: value === "all" ? undefined : value })}>
              <SelectTrigger className="h-11 sm:h-9" aria-label={t("common.label.type")}><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All types</SelectItem>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={status ?? "all"} onValueChange={(value) => setParams({ status: value === "all" ? undefined : value })}>
              <SelectTrigger className="h-11 sm:h-9" aria-label={t("common.label.status")}><SelectValue placeholder={t("members.list.filters.allStatuses")} /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("members.list.filters.allStatuses")}</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-3 md:flex md:items-end">
              <Field label={t("common.label.from")} htmlFor="finance-from"><Input id="finance-from" type="date" className="h-11 sm:h-9" value={from ?? ""} onChange={(event) => setParams({ from: event.target.value || undefined })} /></Field>
              <Field label={t("common.label.to")} htmlFor="finance-to"><Input id="finance-to" type="date" className="h-11 sm:h-9" value={to ?? ""} onChange={(event) => setParams({ to: event.target.value || undefined })} /></Field>
              {hasFilters ? <Button variant="ghost" size="sm" className="col-span-2 justify-self-start md:col-span-1" onClick={clearFilters}><FilterX />{" "}{t("common.action.clearFilters")}</Button> : null}
            </div>
          </div>

          {!filtersOpen && activeFilterLabels.length ? (
            <p className="mt-3 text-[12.5px] text-ink-2 md:hidden">
              <span className="font-medium text-ink">Filtered by</span> {activeFilterLabels.join(" · ")}
              <button type="button" className="ms-2 font-medium text-ink underline underline-offset-4" onClick={clearFilters}>{t("common.action.clear")}</button>
            </p>
          ) : null}
        </div>

        {transactions.isLoading ? (
          <div className="space-y-2 p-4" role="status" aria-label="Loading payments">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20" />)}</div>
        ) : transactions.isError ? (
          <div className="p-5"><ErrorState layout="section" title="Your payments could not be loaded" description="Nothing about your account changed. Try again in a moment." onRetry={() => transactions.refetch()} /></div>
        ) : (
          <>
            {transactions.isBackgroundError ? <div className="p-3"><ErrorState layout="inline" title="The list could not be updated" description="Showing the payments we loaded before." onRetry={() => transactions.refetch()} /></div> : null}
            {transactions.data?.items.length ? (
              <div className="divide-y divide-line">{transactions.data.items.map((item) => <TransactionRow key={`${item.gymId}-${item.id}`} item={item} />)}</div>
            ) : (
              <EmptyState layout="section" className="m-4" title={hasFilters ? "No matching payments" : t("members.tabs.payments.noPayments")} description={hasFilters ? "Clear a filter or try a different receipt number." : "When a gym records a payment, it shows here with its receipt."} icon={ReceiptText} action={hasFilters ? <Button variant="secondary" size="sm" onClick={clearFilters}><FilterX />{" "}{t("common.action.clearFilters")}</Button> : undefined} />
            )}
            {transactions.data ? <DataPagination page={transactions.data} onPage={(next) => setParams({ page: String(next) })} className="border-t border-line px-4 py-3" /> : null}
          </>
        )}
      </section>

      <p className="mt-4 text-[12.5px] text-ink-3">Open a receipt to print it or download a copy. If a payment looks wrong, ask your gym.</p>
    </main>
  );
}

function FinanceSummary({ loading, error, data, onRetry }: { loading: boolean; error: boolean; data?: CustomerFinancialSummary; onRetry: () => void }) {
  const t = useT();
  if (loading) return <Skeleton className="mt-5 h-24 w-full" role="status" aria-label="Loading totals" />;
  if (error) return <div className="mt-5"><ErrorState layout="section" title="Your totals could not be loaded" description="The list below still works. Try again to load the totals." onRetry={onRetry} /></div>;
  if (!data) return null;
  const outstanding = data.outstanding.amount > 0;
  const gymCount = data.gyms.length;
  return (
    <section className="panel mt-5 grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Financial summary">
      <SummaryFact label={t("domain.paymentStatus.unpaid")} value={<MoneyText money={data.outstanding} className={outstanding ? "text-warning-deep" : undefined} />} detail={outstanding ? "Ask your gym how to pay." : "Nothing to pay right now."} />
      <SummaryFact label="Paid to gyms" value={<MoneyText money={data.paidLifetime} />} detail={data.lastPaymentAt ? <>Last payment <DateTimeText iso={data.lastPaymentAt} /></> : "No payments yet."} />
      <SummaryFact label={t("palette.groups.receipts")} value={<span className="tabular">{data.receiptCount.toLocaleString()}</span>} detail={`From ${gymCount} ${gymCount === 1 ? "gym" : "gyms"}`} />
    </section>
  );
}

function SummaryFact({ label, value, detail }: { label: string; value: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:flex sm:flex-col sm:items-start sm:gap-0 sm:px-5 sm:py-4">
      <p className="text-[12px] font-medium text-ink-3">{label}</p>
      <p className="row-span-2 font-display text-[20px] font-semibold tabular text-ink sm:mt-2 sm:text-[24px]">{value}</p>
      <p className="text-[12px] text-ink-3 sm:mt-1">{detail}</p>
    </div>
  );
}

function TransactionRow({ item }: { item: CustomerTransaction }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[12.5px] font-semibold text-ink">{item.receiptNumber}</span>
          <TransactionStatusChip status={item.status} />
          <span className="text-[12px] text-ink-3">{TYPE_LABELS[item.type] ?? item.type}</span>
        </div>
        <p className="mt-1 text-[13.5px] font-medium text-ink">{item.gymName} · {item.branchName}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-2">{item.explanation}</p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-start sm:gap-1">
        <MoneyText money={item.amount} className="text-[15px] font-semibold text-ink" />
        <p className="text-[12px] text-ink-3"><DateTimeText iso={item.occurredAt} /> · {PAYMENT_METHOD_LABELS[item.method] ?? item.method}</p>
      </div>
      {item.receiptId ? <ChevronRight className="hidden size-4 shrink-0 text-ink-3 sm:block" aria-hidden /> : null}
    </>
  );
  const className = "flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4";
  if (!item.receiptId) return <div className={className}>{body}</div>;
  return (
    <Link href={`/customer/receipts/${item.receiptId}`} className={cn(className, "transition-colors hover:bg-sunken/40 focus-visible:bg-sunken/40")} data-testid="member-transaction">
      {body}
    </Link>
  );
}
