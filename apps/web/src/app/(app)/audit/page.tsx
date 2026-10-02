"use client";
import { useT } from "@/lib/i18n/provider";
import type { TKey } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

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
import { auditApprovalStatusForDisplay, auditReasonMessageKey } from "@/lib/domain/audit";

const CATEGORY_LABELS: Record<AuditCategory, TKey> = {
  auth: "staffTools.audit.category.auth",
  members: "staffTools.audit.category.members",
  memberships: "staffTools.audit.category.memberships",
  payments: "staffTools.audit.category.payments",
  checkins: "staffTools.audit.category.checkins",
  crm: "staffTools.audit.category.crm",
  reconciliation: "staffTools.audit.category.reconciliation",
  automations: "staffTools.audit.category.automations",
  operations: "staffTools.audit.category.operations",
  accounting: "staffTools.audit.category.accounting",
  users: "staffTools.audit.category.users",
  settings: "staffTools.audit.category.settings",
  legal: "staffTools.audit.category.legal",
};

/** Plain names for the most common actions; anything else is spelled out from its code. */
const ACTION_LABELS: Record<string, TKey> = {
  "payment.collect": "staffTools.audit.action.paymentCollect",
  "payment.refund": "staffTools.audit.action.paymentRefund",
  "payment.void": "staffTools.audit.action.paymentVoid",
  "membership.sale": "staffTools.audit.action.membershipSale",
  "membership.cancel": "staffTools.audit.action.membershipCancel",
  "membership.freeze": "staffTools.audit.action.membershipFreeze",
  "membership.unfreeze": "staffTools.audit.action.membershipUnfreeze",
  "membership.discount": "staffTools.audit.action.membershipDiscount",
  "membership.price_override": "staffTools.audit.action.membershipPriceOverride",
  "membership.date_override": "staffTools.audit.action.membershipDateOverride",
  "membership.plan_change": "staffTools.audit.action.membershipPlanChange",
  "membership.branch_transfer": "staffTools.audit.action.membershipBranchTransfer",
  "checkin.override": "staffTools.audit.action.checkinOverride",
  "shift.open": "staffTools.audit.action.shiftOpen",
  "shift.close": "staffTools.audit.action.shiftClose",
  "shift.close_variance": "staffTools.audit.action.shiftCloseVariance",
  "role.permissions_change": "staffTools.audit.action.rolePermissionsChange",
  "user.invite": "staffTools.audit.action.userInvite",
  "user.deactivate": "staffTools.audit.action.userDeactivate",
  "member.archive": "staffTools.audit.action.memberArchive",
  "member.delete": "staffTools.audit.action.memberDelete",
  "member.merge": "staffTools.audit.action.memberMerge",
  "member.update": "staffTools.audit.action.memberUpdate",
  "lead.lost": "staffTools.audit.action.leadLost",
  "lead.membership_sale_completed": "staffTools.audit.action.leadMembershipSaleCompleted",
  "accounting.manual_post": "staffTools.audit.action.accountingManualPost",
  "accounting.entry.reverse": "staffTools.audit.action.accountingEntryReverse",
  "accounting.period.close": "staffTools.audit.action.accountingPeriodClose",
  "accounting.period.reopen": "staffTools.audit.action.accountingPeriodReopen",
  "accounting.source.post": "staffTools.audit.action.accountingSourcePost",
  "accounting.source.exclude": "staffTools.audit.action.accountingSourceExclude",
  "classes.occurrence.cancel": "staffTools.audit.action.classOccurrenceCancel",
  "pt.booking.cancel": "staffTools.audit.action.ptBookingCancel",
  "pt.package.refund": "staffTools.audit.action.ptPackageRefund",
};

const ROLE_LABELS: Record<string, TKey> = {
  owner: "staffTools.audit.role.owner",
  manager: "staffTools.audit.role.manager",
  salesperson: "staffTools.audit.role.salesperson",
  receptionist: "staffTools.audit.role.receptionist",
  trainer: "staffTools.audit.role.trainer",
};

const FIELD_LABELS: Record<string, TKey> = {
  name: "staffTools.audit.field.name",
  status: "staffTools.audit.field.status",
  reason: "staffTools.audit.field.reason",
  branchId: "staffTools.audit.field.branchId",
  branchName: "staffTools.audit.field.branchName",
  memberId: "staffTools.audit.field.memberId",
  membershipId: "staffTools.audit.field.membershipId",
  planId: "staffTools.audit.field.planId",
  planName: "staffTools.audit.field.planName",
  startDate: "staffTools.audit.field.startDate",
  endDate: "staffTools.audit.field.endDate",
  price: "staffTools.audit.field.price",
  priceMinor: "staffTools.audit.field.priceMinor",
  amount: "staffTools.audit.field.amount",
  amountMinor: "staffTools.audit.field.amountMinor",
  discount: "staffTools.audit.field.discount",
  discountMinor: "staffTools.audit.field.discountMinor",
  paymentMethod: "staffTools.audit.field.paymentMethod",
  receiptNumber: "staffTools.audit.field.receiptNumber",
  actorId: "staffTools.audit.field.actorId",
  actorRole: "staffTools.audit.field.actorRole",
  userId: "staffTools.audit.field.userId",
  email: "staffTools.audit.field.email",
  phone: "staffTools.audit.field.phone",
  enabled: "staffTools.audit.field.enabled",
};

function actionLabel(action: string, t: ReturnType<typeof useT>): string {
  const key = ACTION_LABELS[action];
  // Unknown historical action codes are original audit data, so keep them verbatim.
  return key ? t(key) : action;
}

function fieldLabel(field: string, t: ReturnType<typeof useT>): string {
  const key = FIELD_LABELS[field];
  // Unknown payload keys are not translated or rewritten.
  return key ? t(key) : field;
}

const CATEGORY_FILTERS: ReadonlyArray<"all" | AuditCategory> = ["all", ...(Object.keys(CATEGORY_LABELS) as AuditCategory[])];
const APPROVAL_FILTERS = ["all", "pending", "approved", "rejected"] as const;

function AuditPageInner() {
  const t = useT();
  const searchParams = useSearchParams();
  const replaceParams = useReplaceSearchParams();
  // Every filter is read from the URL so a search can be shared or reopened
  // exactly as it was, and Back/Forward retrace the steps instead of being
  // rewritten by stale component state.
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
    return <ForbiddenState description={t("staffTools.audit.forbidden")} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.item.activityLog")}
        description={t("staffTools.audit.description")}
      />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" role="search" aria-label={t("staffTools.audit.filters")}>
        <div className="relative col-span-2 w-full sm:max-w-xs">
          <Search className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("staffTools.audit.searchPlaceholder")} className="ps-8" aria-label={t("staffTools.audit.searchAria")} data-touch-target />
        </div>
        <Select value={category} onValueChange={(v) => replaceParams({ category: v === "all" ? undefined : v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t("staffTools.audit.categoryFilter")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("staffTools.audit.allCategories")}</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{t(label)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actorId} onValueChange={(v) => replaceParams({ actor: v === "all" ? undefined : v })}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t("staffTools.audit.actorFilter")} data-touch-target>
            <SelectValue placeholder={t("staffTools.audit.anyone")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("staffTools.audit.anyone")}</SelectItem>
            {(usersQuery.data?.items ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={approval} onValueChange={(value) => replaceParams({ approval: value === "all" ? undefined : value })}>
          <SelectTrigger className="w-full sm:w-44" aria-label={t("staffTools.audit.approvalFilter")} data-touch-target>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("staffTools.audit.anyApproval")}</SelectItem>
            <SelectItem value="pending">{t("staffTools.audit.waitingApproval")}</SelectItem>
            <SelectItem value="approved">{t("staffTools.audit.approved")}</SelectItem>
            <SelectItem value="rejected">{t("staffTools.audit.rejected")}</SelectItem>
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
          <EmptyState title={t("staffTools.audit.emptyTitle")} description={t("staffTools.audit.emptyDescription")} className="border-0" />
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
  const t = useT();
  const hasDetail = Boolean(event.before || event.after || event.reason);
  const reasonKey = auditReasonMessageKey(event);
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
            <Badge variant="outline">{actionLabel(event.action, t)}</Badge>
            {approvalStatus === "pending" ? <Badge variant="warning">{t("staffTools.audit.waitingApproval")}</Badge> : null}
            {approvalStatus === "approved" ? <Badge variant="success">{t("staffTools.audit.approved")}</Badge> : null}
            {approvalStatus === "rejected" ? <Badge variant="signal">{t("staffTools.audit.rejected")}</Badge> : null}
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            {event.actorName} · {ROLE_LABELS[event.actorRole] ? t(ROLE_LABELS[event.actorRole]!) : event.actorRole} · {event.entityLabel}
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
                <p className="context-label mb-1">{t("common.label.reason")}</p>
                <p className="text-[12.5px]" dir="auto">{reasonKey ? t(reasonKey) : event.reason}</p>
              </div>
            ) : null}
            {event.before ? (
              <DiffPanel label={t("staffTools.audit.before")} values={event.before} t={t} />
            ) : null}
            {event.after ? (
              <DiffPanel label={t("renewFlow.adjust.beforeAfter.after")} values={event.after} highlight t={t} />
            ) : null}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">{t("staffTools.audit.reference")} <span className="font-mono text-[11px]" dir="ltr">{event.correlationId}</span></p>
        </div>
      ) : null}
    </li>
  );
}

function DiffPanel({ label, values, highlight, t }: { label: string; values: Record<string, string | number | null>; highlight?: boolean; t: ReturnType<typeof useT> }) {
  const format = useFormat();
  return (
    <div className={cn("rounded-md border p-3", highlight ? "border-line bg-surface" : "border-line bg-surface/70")}>
      <p className="context-label mb-1.5">{label}</p>
      <dl className="space-y-1">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2 text-[12px]">
            <dt className="text-ink-3">{fieldLabel(k, t)}</dt>
            <dd className="tabular">{auditValueLabel(k, v, typeof values.currency === "string" ? values.currency : undefined, format)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function auditValueLabel(key: string, value: string | number | null, currency: string | undefined, format: ReturnType<typeof useFormat>): string {
  if (value == null) return "—";
  if ((key === "priceMinor" || key === "amountMinor" || key === "discountMinor") && typeof value === "number") {
    return format.money({ amount: value, currency: currency ?? "JOD" });
  }
  if ((key === "startDate" || key === "endDate" || key === "effectiveDate" || key === "date") && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return format.date(value);
  }
  if ((key === "occurredAt" || key === "createdAt" || key === "updatedAt") && typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return format.dateTime(value);
  }
  if (typeof value === "number" && (key.endsWith("Count") || key.endsWith("Days") || key.endsWith("Hours") || ["days", "hours", "quantity", "visits"].includes(key))) {
    return format.number(value);
  }
  // Other values are original event content and stay verbatim.
  return String(value);
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditPageInner />
    </Suspense>
  );
}
