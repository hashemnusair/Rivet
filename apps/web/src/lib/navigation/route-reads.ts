import type { QueryKey } from "@tanstack/react-query";
import type { GymOSApi, LeadListQuery, MemberListQuery, TransactionListQuery } from "@/lib/api/GymOSApi";
import { qk } from "@/lib/api/keys";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import type { LeadStage, Session } from "@/lib/domain/types";
import { addDays, todayISODate } from "@/lib/utils/dates";

/**
 * The reads a workspace screen makes on its first render, by route, so they
 * can start while the pointer is still on the link (use-route-data-prefetch).
 *
 * Every entry must produce exactly the key and the request its screen makes:
 * the same key with a different request would put the wrong data under the
 * screen's key. `route-reads.test.tsx` renders each screen and fails if an
 * entry here stops matching it. Only the default view is covered: a link that
 * carries filters, or a screen whose first view depends on what only the
 * screen knows (a chosen date, a saved view), gets the reads it is sure of or
 * none.
 *
 * Reads only, built from the current session, so nothing here can reach a
 * scope the operator is not in.
 */
export interface RouteRead {
  queryKey: QueryKey;
  queryFn: (api: GymOSApi) => Promise<unknown>;
}

interface RouteContext {
  session: Session;
  /** Path segments captured by the entry's pattern (record IDs). */
  params: string[];
  search: URLSearchParams;
}

interface RouteEntry {
  pattern: RegExp;
  reads: (context: RouteContext) => RouteRead[];
}

/*
 * Screen inputs. The screens build their first reads with these too, so the
 * screen and its prefetch share one definition (and the drift test guards the
 * keys and requests built around them).
 */

/** Lead stages the pipeline board lists (crm/pipeline/page.tsx). */
export const PIPELINE_LEAD_STAGES: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];
/** The salesperson dashboard's "my open leads" (features/dashboard/sales-dashboard.tsx). */
const SALES_OPEN_LEAD_STAGES: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"];

/** Every dashboard reads the last 30 tenant-local days. */
export function dashboardInput(timezone: string | undefined, branchId: string | undefined) {
  const today = todayISODate(timezone);
  return { branchId, from: addDays(today, -29), to: today };
}

/** The salesperson dashboard's open leads, soonest follow-up first. */
export function salesOpenLeadsInput(ownerId: string | undefined): LeadListQuery {
  return { ownerId, stage: SALES_OPEN_LEAD_STAGES, pageSize: 8, sort: "nextFollowUpAt" };
}

/** Reception's "today's visits" list. */
export function receptionVisitsInput(branchId: string | undefined, timezone: string | undefined, page: number) {
  return { branchId, date: todayISODate(timezone ?? "Asia/Amman"), acceptedOnly: true, page, pageSize: 25 } as const;
}

/** The members list from its URL state ("all" means no filter). */
export function memberListQuery(view: { search: string; membershipStatus: string; planId: string; recordStatus: "active" | "archived"; sort: string; page: number; branchId: string | undefined }): MemberListQuery {
  return {
    search: view.search || undefined,
    membershipStatus: view.membershipStatus === "all" ? undefined : view.membershipStatus as MemberListQuery["membershipStatus"],
    planId: view.planId === "all" ? undefined : view.planId,
    branchId: view.branchId,
    status: view.recordStatus,
    sort: view.sort,
    page: view.page,
    pageSize: 20,
  };
}
const MEMBER_LIST_DEFAULT = { search: "", membershipStatus: "all", planId: "all", recordStatus: "active", sort: "fullName", page: 1 } as const;

/** The payments ledger from its URL state; `range` is a number of days or "all". */
export function transactionListQuery(view: { search: string; method: string; type: string; range: string; page: number; branchId: string | undefined; timezone: string | undefined }): TransactionListQuery {
  return {
    search: view.search || undefined,
    method: view.method === "all" ? undefined : (view.method as TransactionListQuery["method"]),
    type: view.type === "all" ? undefined : (view.type as TransactionListQuery["type"]),
    branchId: view.branchId,
    from: view.range === "all" ? undefined : addDays(todayISODate(view.timezone), -(Number(view.range) - 1)),
    page: view.page,
    pageSize: 20,
  };
}

/** The pipeline board's leads; `search` is already normalised (searchKey). */
export function pipelineLeadQuery(view: { branchId: string | undefined; search: string; page: number }): LeadListQuery {
  return { branchId: view.branchId, search: view.search || undefined, page: view.page, pageSize: 100, sort: "nextFollowUpAt", stage: PIPELINE_LEAD_STAGES };
}

/** The at-risk follow-up queue; `search` is already normalised (searchKey). */
export function atRiskQuery<TReason extends string>(view: { branchId: string | undefined; reason: TReason; search: string; page: number }) {
  return { branchId: view.branchId, reason: view.reason, search: view.search || undefined, page: view.page, pageSize: 25 };
}

/** The classes calendar's week: from `start` (YYYY-MM-DD) or today, seven days. */
export function classWeek(start: string | undefined, timezone: string | undefined) {
  const weekStart = start ?? todayISODate(timezone);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** A member's memberships on the member record. */
export function memberMembershipsQuery(memberId: string) {
  return { memberId, pageSize: 20, sort: "-startDate" };
}

/** The pipeline's staff list (owner picker). Its key carries the page size: other screens list fewer. */
export const PIPELINE_STAFF_QUERY = { status: "active", pageSize: 100 } as const;

const read = (queryKey: QueryKey, queryFn: (api: GymOSApi) => Promise<unknown>): RouteRead => ({ queryKey, queryFn });

const can = (session: Session, permission: string) => session.permissions.includes(permission);

/** True when the link carries any of these parameters, so it is not the default view. */
const hasAny = (search: URLSearchParams, names: string[]) => names.some((name) => search.has(name));

function dashboardRange(session: Session, branchId: string | undefined) {
  return dashboardInput(session.organization.timezone, branchId);
}

const workspaceAccess = read(qk.workspaceAccess, (api) => api.getWorkspaceAccess());

const ENTRIES: RouteEntry[] = [
  {
    pattern: /^\/dashboard$/,
    reads: ({ session }) => {
      const role = session.roles[0];
      if (role === "trainer") return [read(qk.ptWorkspace, (api) => api.getPtWorkspace())];
      if (role === "receptionist") {
        const branchId = visibleBranchId(session.branches, session.activeBranchId);
        const input = dashboardRange(session, branchId);
        return [read(qk.dashboard(branchId), (api) => api.getDashboard(input))];
      }
      const input = dashboardRange(session, session.activeBranchId);
      const dashboard = read(qk.dashboard(session.activeBranchId), (api) => api.getDashboard(input));
      if (role === "salesperson") {
        const leadInput = salesOpenLeadsInput(session.user.id);
        return [read(qk.leads({ mine: true, open: true }), (api) => api.listLeads(leadInput)), dashboard];
      }
      return [dashboard];
    },
  },
  {
    pattern: /^\/reception$/,
    reads: ({ session }) => {
      const branchId = visibleBranchId(session.branches, session.activeBranchId);
      if (!branchId) return [];
      const recentInput = receptionVisitsInput(branchId, session.organization.timezone, 1);
      return [
        read(qk.occupancy(branchId), (api) => api.getOccupancy(branchId)),
        read(qk.checkIns(recentInput), (api) => api.listRecentCheckIns(recentInput)),
        read(qk.shiftTotals(branchId), (api) => api.getCurrentShiftTotals(branchId)),
      ];
    },
  },
  {
    pattern: /^\/members$/,
    reads: ({ session, search }) => {
      const plans = read(qk.plans({}), (api) => api.listPlans({ pageSize: 50 }));
      if (hasAny(search, ["q", "record", "membership", "plan", "sort", "page"])) return [plans];
      const query = memberListQuery({ ...MEMBER_LIST_DEFAULT, branchId: session.activeBranchId });
      return [plans, read(qk.members(query), (api) => api.listMembers(query))];
    },
  },
  {
    pattern: /^\/members\/(?!new$|import$|duplicates$)([^/]+)$/,
    reads: ({ params: [memberId] }) => [
      read(qk.member(memberId!), (api) => api.getMember(memberId!)),
      read(qk.memberships({ memberId }), (api) => api.listMemberships(memberMembershipsQuery(memberId!))),
      read(qk.users({ role: "salesperson" }), (api) => api.listUsers({ role: "salesperson", pageSize: 20 })),
    ],
  },
  {
    pattern: /^\/payments$/,
    reads: ({ session, search }) => {
      if (hasAny(search, ["q", "method", "type", "range", "page"])) return [];
      const query = transactionListQuery({ search: "", method: "all", type: "all", range: "30", page: 1, branchId: session.activeBranchId, timezone: session.organization.timezone });
      return [read(qk.transactions(query), (api) => api.listTransactions(query))];
    },
  },
  {
    pattern: /^\/crm\/pipeline$/,
    reads: ({ session, search }) => {
      const staff = read(qk.users(PIPELINE_STAFF_QUERY), (api) => api.listUsers(PIPELINE_STAFF_QUERY));
      if (hasAny(search, ["q", "page"])) return [workspaceAccess, staff];
      const query = pipelineLeadQuery({ branchId: session.activeBranchId, search: "", page: 1 });
      return [workspaceAccess, read(qk.leads(query), (api) => api.listLeads(query)), staff];
    },
  },
  {
    pattern: /^\/crm\/queues$/,
    reads: ({ session, search }) => {
      if (hasAny(search, ["view", "reason", "q", "page", "member"])) return [workspaceAccess];
      const query = atRiskQuery({ branchId: session.activeBranchId, reason: "all" as const, search: "", page: 1 });
      return [workspaceAccess, read(qk.atRisk(query), (api) => api.listAtRiskMembers(query))];
    },
  },
  {
    pattern: /^\/crm\/leads\/([^/]+)$/,
    reads: ({ params: [leadId] }) => [
      workspaceAccess,
      read(qk.lead(leadId!), (api) => api.getLead(leadId!)),
      read(qk.settings, (api) => api.getOrganizationSettings()),
      read(qk.plans({ status: "active", pageSize: 100 }), (api) => api.listPlans({ status: "active", pageSize: 100 })),
    ],
  },
  {
    pattern: /^\/classes$/,
    reads: ({ session, search }) => {
      const coaches = read(["classCoaches"], (api) => api.listClassCoaches());
      const bounds = read(qk.classCalendarBounds, (api) => api.getClassCalendarBounds());
      if (hasAny(search, ["branch", "from"])) return [coaches, bounds];
      const branchId = session.activeBranchId ?? session.branches[0]?.id;
      if (!branchId) return [coaches, bounds];
      const { weekStart, weekEnd } = classWeek(undefined, session.organization.timezone);
      return [
        read(qk.classSessions(branchId), (api) => api.listClassSessions({ branchId })),
        coaches,
        read(qk.classOccurrences(branchId, weekStart, weekEnd, undefined), (api) => api.listClassOccurrences({ branchId, fromDate: weekStart, toDate: weekEnd })),
        bounds,
      ];
    },
  },
  {
    pattern: /^\/pt$/,
    reads: ({ session }) => [
      read(qk.ptWorkspace, (api) => api.getPtWorkspace()),
      ...(can(session, "pt.manage") ? [read(qk.users({ role: "trainer" }), (api) => api.listUsers({ role: "trainer", pageSize: 100 }))] : []),
    ],
  },
];

/**
 * The reads to start for a link. `href` may be relative or absolute; a link
 * to another origin, or to a screen without an entry, has none.
 */
export function routeReads(href: string, session: Session): RouteRead[] {
  if (typeof window === "undefined") return [];
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return [];
  }
  if (url.origin !== window.location.origin) return [];
  for (const entry of ENTRIES) {
    const match = entry.pattern.exec(url.pathname);
    if (match) return entry.reads({ session, params: match.slice(1).map(decodeURIComponent), search: url.searchParams });
  }
  return [];
}
