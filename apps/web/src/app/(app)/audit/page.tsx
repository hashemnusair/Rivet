"use client";

import { ChevronDown, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { AuditQuery } from "@/lib/api/GymOSApi";
import { useApiQuery } from "@/lib/hooks/use-api";
import { choiceFromParams, pageFromParams, useReplaceSearchParams, useUrlSearchText } from "@/lib/hooks/use-url-state";
import type { AuditCategory, AuditEvent } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { DateTimeText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { auditApprovalStatusForDisplay } from "@/lib/domain/audit";

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  auth: "Auth",
  members: "Members",
  memberships: "Memberships",
  payments: "Payments",
  checkins: "Check-ins",
  crm: "CRM & trials",
  reconciliation: "Reconciliation",
  automations: "Automations",
  operations: "Operations",
  accounting: "Accounting",
  users: "Users & roles",
  settings: "Settings",
  legal: "Legal",
};

const CATEGORY_FILTERS: ReadonlyArray<"all" | AuditCategory> = ["all", ...(Object.keys(CATEGORY_LABELS) as AuditCategory[])];
const APPROVAL_FILTERS = ["all", "pending", "approved", "rejected"] as const;

function AuditPageInner() {
  const searchParams = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  // Every filter is read from the URL so an audit question can be shared or
  // reopened exactly as it was asked, and Back/Forward retrace the questions
  // instead of being rewritten by stale component state.
  const { text: search, setText: setSearch, settled: debouncedSearch } = useUrlSearchText();
  const category = choiceFromParams(searchParams, "category", CATEGORY_FILTERS, "all");
  const approval = choiceFromParams(searchParams, "approval", APPROVAL_FILTERS, "all");
  const actorId = searchParams.get("actor") ?? "all";
  const page = pageFromParams(searchParams);
  const [expanded, setExpanded] = useState<string | null>(null);

  const usersQuery = useApiQuery(qk.users({ all: true }), (api) => api.listUsers({ pageSize: 100 }));

  const query: AuditQuery = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: category === "all" ? undefined : (category as AuditCategory),
      approvalStatus: approval === "all" ? undefined : (approval as NonNullable<AuditQuery["approvalStatus"]>),
      actorId: actorId === "all" ? undefined : actorId,
      page,
      pageSize: 20,
    }),
    [debouncedSearch, category, approval, actorId, page],
  );

  const { data, isLoading, isError, error, refetch } = useApiQuery(qk.audit(query), (api) => api.listAuditEvents(query));

  const items = data?.items ?? [];

  if (isError && isApiError(error) && error.code === "FORBIDDEN") {
    return <ForbiddenState description="The audit log requires the “View audit log” permission — owners and managers have it." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit log"
        description="Every sensitive action: who, what, when, why — with before and after. Append-only by design."
      />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" role="search" aria-label="Audit filters">
        <div className="relative col-span-2 w-full sm:max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search summary, actor, entity…" className="ps-8" aria-label="Search audit log" data-touch-target />
        </div>
        <Select value={category} onValueChange={(v) => replaceParams({ category: v === "all" ? undefined : v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Category filter" data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorId} onValueChange={(v) => replaceParams({ actor: v === "all" ? undefined : v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Actor filter" data-touch-target>
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {(usersQuery.data?.items ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={approval} onValueChange={(value) => replaceParams({ approval: value === "all" ? undefined : value })}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Approval filter" data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any approval state</SelectItem>
            <SelectItem value="pending">Pending approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={10} cols={5} />
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="No audit events match" description="Sensitive actions will appear here the moment they happen." className="border-0" />
        ) : (
          <ol className="divide-y divide-line">
            {items.map((event) => (
              <AuditRow
                key={event.id}
                event={event}
                expanded={expanded === event.id}
                onToggle={() => setExpanded((x) => (x === event.id ? null : event.id))}
              />
            ))}
          </ol>
        )}
      </div>
      {data ? <DataPagination page={data} onPage={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })} /> : null}
    </div>
  );
}

function AuditRow({ event, expanded, onToggle }: { event: AuditEvent; expanded: boolean; onToggle: () => void }) {
  const hasDetail = Boolean(event.before || event.after || event.reason);
  const approvalStatus = auditApprovalStatusForDisplay(event);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-sunken/40 cursor-pointer"
      >
        <span className="mt-0.5 shrink-0 text-[12px] text-ink-3 tabular whitespace-nowrap">
          <DateTimeText iso={event.occurredAt} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{event.summary}</span>
            <Badge variant="outline">{event.action}</Badge>
            {approvalStatus === "pending" ? <Badge variant="warning">Pending approval</Badge> : null}
            {approvalStatus === "approved" ? <Badge variant="success">Approved</Badge> : null}
            {approvalStatus === "rejected" ? <Badge variant="signal">Rejected</Badge> : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            {event.actorName} · {event.actorRole} · {event.entityLabel}
          </span>
        </span>
        {hasDetail ? (
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")} aria-hidden />
        ) : null}
      </button>
      {expanded && hasDetail ? (
        <div className="border-t border-line/70 bg-sunken/30 px-4 py-3 animate-fade-in">
          <div className="grid gap-3 md:grid-cols-2">
            {event.reason ? (
              <div className="rounded-md border border-line bg-surface p-3 md:col-span-2">
                <p className="context-label mb-1">Reason</p>
                <p className="text-[12.5px]">{event.reason}</p>
              </div>
            ) : null}
            {event.before ? (
              <DiffPanel label="Before" values={event.before} />
            ) : null}
            {event.after ? (
              <DiffPanel label="After" values={event.after} highlight />
            ) : null}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">Correlation <span className="font-mono text-[11px]">{event.correlationId}</span></p>
        </div>
      ) : null}
    </li>
  );
}

function DiffPanel({ label, values, highlight }: { label: string; values: Record<string, string | number | null>; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", highlight ? "border-line bg-surface" : "border-line bg-surface/70")}>
      <p className="context-label mb-1.5">{label}</p>
      <dl className="space-y-1">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 text-[12px]">
            <dt className="text-ink-3">{k}</dt>
            <dd className="tabular">{v == null ? "—" : String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditPageInner />
    </Suspense>
  );
}
