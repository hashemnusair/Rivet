"use client";

import { ChevronDown, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import type { AuditQuery } from "@/lib/api/GymOSApi";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
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
};

function AuditPageInner() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(searchParams.get("category") ?? "all");
  const [approval, setApproval] = useState(searchParams.get("approval") ?? "all");
  const [actorId, setActorId] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);

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
        eyebrow="System"
        title="Audit log"
        description="Every sensitive action: who, what, when, why — with before and after. Append-only by design."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search summary, actor, entity…" className="ps-8" aria-label="Search audit log" />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Category filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorId} onValueChange={(v) => { setActorId(v); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Actor filter">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {(usersQuery.data?.items ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={approval} onValueChange={(value) => { setApproval(value); setPage(1); }}>
          <SelectTrigger sizeVariant="sm" className="w-40" aria-label="Approval filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any state</SelectItem>
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
      {data ? <DataPagination page={data} onPage={setPage} /> : null}
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
        <span className="mt-0.5 shrink-0 text-[11px] text-ink-3 tabular whitespace-nowrap">
          <DateTimeText iso={event.occurredAt} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{event.summary}</span>
            <Badge variant="outline">{event.action}</Badge>
            {approvalStatus === "pending" ? <Badge variant="warning">pending approval</Badge> : null}
            {approvalStatus === "approved" ? <Badge variant="success">approved</Badge> : null}
            {approvalStatus === "rejected" ? <Badge variant="signal">rejected</Badge> : null}
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
                <p className="eyebrow mb-1">Reason</p>
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
          <p className="mt-3 font-mono text-[10.5px] text-ink-4">correlation {event.correlationId}</p>
        </div>
      ) : null}
    </li>
  );
}

function DiffPanel({ label, values, highlight }: { label: string; values: Record<string, string | number | null>; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border p-3", highlight ? "border-line bg-surface" : "border-line bg-surface/70")}>
      <p className="eyebrow mb-1.5">{label}</p>
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
