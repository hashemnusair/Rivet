"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { MemberDetail, TimelineEventType, UUID } from "@/lib/domain/types";
import { formatDate } from "@/lib/utils/dates";
import { toast } from "sonner";
import { DateText, DateTimeText, DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination } from "@/components/shared/chrome";
import { CheckInDecisionChip, MembershipStatusChip, PaymentStatusChip, PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { receiptHref } from "@/lib/utils/receipt-links";

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function OverviewTab({ member }: { member: MemberDetail }) {
  const timelineQuery = useApiQuery(qk.memberTimeline(member.id, { pageSize: 6 }), (api) =>
    api.listMemberTimeline(member.id, { pageSize: 6 }),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel grid grid-cols-2 divide-x divide-line self-start">
        <StatCell label="Check-ins · 30d" value={member.stats.checkInsLast30Days} />
        <StatCell label="Check-ins · all time" value={member.stats.totalCheckIns} />
        <StatCell label="Lifetime value" value={<MoneyText money={member.stats.lifetimeValue} />} border />
        <StatCell
          label="Last check-in"
          value={
            member.stats.daysSinceLastCheckIn != null
              ? member.stats.daysSinceLastCheckIn === 0
                ? "today"
                : `${member.stats.daysSinceLastCheckIn}d ago`
              : "—"
          }
          border
        />
      </section>

      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">Latest activity</h3>
        </header>
        <div className="px-4 py-3">
          {timelineQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <TimelineFeed events={timelineQuery.data?.items ?? []} dense empty="No activity yet — sell a membership or add a note." />
          )}
        </div>
      </section>
    </div>
  );
}

function StatCell({ label, value, border }: { label: string; value: React.ReactNode; border?: boolean }) {
  return (
    <div className={cn("px-4 py-3.5", border && "border-t border-line")}>
      <p className="eyebrow">{label}</p>
      <div className="mt-1 text-[20px] font-medium tabular">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const TIMELINE_FILTERS: Array<{ value: string; label: string; types?: TimelineEventType[] }> = [
  { value: "all", label: "Everything" },
  { value: "commercial", label: "Sales & payments", types: ["membership_sold", "membership_renewed", "payment_collected", "payment_refunded", "payment_voided"] },
  { value: "membership", label: "Membership changes", types: ["membership_frozen", "membership_unfrozen", "membership_extended", "membership_cancelled"] },
  { value: "contact", label: "Calls & notes", types: ["call_attempt", "note", "message", "task_created", "task_completed", "offer_drafted", "offer_sent"] },
  { value: "checkin", label: "Check-ins", types: ["check_in"] },
];

export function TimelineTab({ memberId }: { memberId: UUID }) {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const types = TIMELINE_FILTERS.find((f) => f.value === filter)?.types;
  const query = useApiQuery(qk.memberTimeline(memberId, { filter, page }), (api) =>
    api.listMemberTimeline(memberId, { types, page, pageSize: 25 }),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Timeline filter">
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
            aria-pressed={filter === f.value}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors cursor-pointer",
              filter === f.value ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2 hover:border-line-3",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="panel px-5 py-4">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <>
            <div data-testid="member-timeline">
              <TimelineFeed events={query.data?.items ?? []} empty="Nothing in this slice of the record yet." />
            </div>
            {query.data ? <DataPagination page={query.data} onPage={setPage} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------
export function MembershipsTab({ memberId }: { memberId: UUID }) {
  const query = useApiQuery(qk.memberships({ memberId }), (api) =>
    api.listMemberships({ memberId, pageSize: 20, sort: "-startDate" }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="No memberships yet" description="Sell the first membership to start this member's commercial record." />;
  }

  return (
    <div className="panel overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Plan</TableHead>
            <TableHead>Term</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-end">Price</TableHead>
            <TableHead className="text-end">Discount</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Lineage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <span className="font-medium">{m.planName}</span>
                {m.remainingVisits != null ? (
                  <span className="block text-[11px] text-ink-3 tabular">
                    {m.remainingVisits}/{m.totalVisits} visits left
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <span className="whitespace-nowrap text-[12px] tabular">
                  {m.startDate} → {m.endDate}
                </span>
                <span className="block text-[11px]">
                  <DaysUntilText date={m.endDate} />
                </span>
              </TableCell>
              <TableCell>
                <MembershipStatusChip status={m.status} />
                {m.activeFreeze ? (
                  <span className="block text-[11px] text-ink-3">frozen until {formatDate(m.activeFreeze.endDate)}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-end">
                <MoneyText money={m.salePrice} />
              </TableCell>
              <TableCell className="text-end">
                {m.discount.amount > 0 ? (
                  <span>
                    <MoneyText money={m.discount} />
                    {m.discountApprovalStatus === "pending" ? (
                      <Badge variant="warning" className="ms-1.5">pending</Badge>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </TableCell>
              <TableCell>
                <PaymentStatusChip status={m.paymentStatus} />
                {m.outstanding.amount > 0 ? (
                  <span className="block text-[11px] text-warning-deep tabular">
                    <MoneyText money={m.outstanding} /> due
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-[12px] text-ink-3">
                {m.previousMembershipId ? "Renewal" : "First term"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export function PaymentsTab({ memberId }: { memberId: UUID }) {
  const query = useApiQuery(qk.transactions({ memberId }), (api) =>
    api.listTransactions({ memberId, pageSize: 30 }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="No payments yet" description="Collected payments, refunds and receipts will appear here." />;
  }

  return (
    <div className="panel overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Receipt</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-end">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Collected by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id} interactive onClick={() => undefined} className="cursor-pointer">
              <TableCell>
                <Link
                  href={receiptHref(p.receiptId)}
                  className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink"
                >
                  {p.receiptNumber}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">
                <DateTimeText iso={p.occurredAt} />
              </TableCell>
              <TableCell className="text-[12.5px] capitalize">{p.type}</TableCell>
              <TableCell className="text-[12.5px]">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
              <TableCell className="text-end">
                <MoneyText money={p.amount} />
              </TableCell>
              <TableCell>
                <TransactionStatusChip status={p.status} />
              </TableCell>
              <TableCell className="text-[12.5px] text-ink-2">{p.collectedByName}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------
export function CheckInsTab({ memberId }: { memberId: UUID }) {
  const [page, setPage] = useState(1);
  const query = useApiQuery(qk.checkIns({ memberId, page }), (api) =>
    api.listRecentCheckIns({ memberId, page, pageSize: 20 }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="No check-ins recorded" description="Check-ins from the reception console will appear here." />;
  }

  return (
    <div>
      <div className="panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap text-[12.5px]">
                  <DateTimeText iso={c.occurredAt} />
                </TableCell>
                <TableCell className="text-[12.5px] text-ink-2">{c.branchName}</TableCell>
                <TableCell>
                  <CheckInDecisionChip decision={c.decision} />
                </TableCell>
                <TableCell className="text-[12px] text-ink-3">
                  {c.overrideReason ?? (c.reasonCodes.includes("OK") ? "—" : c.reasonCodes.join(", ").toLowerCase().replace(/_/g, " "))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {query.data ? <DataPagination page={query.data} onPage={setPage} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export function MemberTasksPanel({ memberId }: { memberId: UUID }) {
  const invalidate = useInvalidate();
  const query = useApiQuery(qk.tasks({ memberId, open: true }), (api) =>
    api.listTasks({ status: "open", pageSize: 10 }),
  );
  const complete = useApiMutation((api, taskId: string) => api.completeTask(taskId, { outcome: "Completed from member page" }), {
    onSuccess: async () => {
      toast.success("Task completed.");
      await invalidate();
    },
  });

  const tasks = (query.data?.items ?? []).filter((t) => t.memberId === memberId);
  if (query.isLoading) return <Skeleton className="h-20 w-full" />;
  if (tasks.length === 0) return <p className="text-[12.5px] text-ink-3">No open tasks for this member.</p>;

  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 text-[12.5px]">
          <button
            type="button"
            aria-label={`Complete task ${t.title}`}
            onClick={() => complete.mutate(t.id)}
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-3 text-transparent hover:border-success hover:text-success cursor-pointer"
          >
            <CheckCircle2 className="size-3.5" />
          </button>
          <div className="min-w-0">
            <p className="font-medium leading-snug">{t.title}</p>
            <p className="text-[11.5px] text-ink-3">
              {t.ownerName} · <RelativeText iso={t.dueAt} />
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Details panel
// ---------------------------------------------------------------------------
export function MemberDetailsPanel({ member, branchName, salespersonName }: { member: MemberDetail; branchName: string; salespersonName?: string }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Phone", <span key="p" dir="ltr" className="font-mono text-[12.5px]">{member.phone}</span>],
    ["Email", member.email ?? "—"],
    ["Home branch", branchName],
    ["Preferred language", member.preferredLanguage === "ar" ? "العربية" : "English"],
    ["Gender", member.gender ?? "—"],
    ["Date of birth", member.dateOfBirth ? <DateText key="dob" iso={member.dateOfBirth} /> : "—"],
    ["Emergency contact", member.emergencyContactName ? `${member.emergencyContactName} · ${member.emergencyContactPhone ?? ""}` : "—"],
    ["Source", member.source ? member.source.replace(/_/g, " ") : "—"],
    ["Salesperson", salespersonName ?? "Unassigned"],
    ["Marketing", member.marketingOptIn ? "Opted in" : "Opted out"],
    ["Member since", <DateText key="c" iso={member.createdAt} />],
  ];
  return (
    <dl className="space-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <dt className="shrink-0 text-ink-3">{label}</dt>
          <dd className="text-end text-ink">{value}</dd>
        </div>
      ))}
      {member.sensitiveNotes ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning-bg/50 p-3">
          <p className="eyebrow mb-1 text-warning-deep">Sensitive note</p>
          <p className="text-[12.5px] text-ink-2">{member.sensitiveNotes}</p>
        </div>
      ) : null}
      {member.notes ? (
        <div className="mt-3 rounded-md border border-line bg-sunken/40 p-3">
          <p className="eyebrow mb-1">Desk note</p>
          <p className="text-[12.5px] text-ink-2">{member.notes}</p>
        </div>
      ) : null}
    </dl>
  );
}
