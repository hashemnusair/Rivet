import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { A, B, NOW, money, seedHistory, summariseVisits } from "./history-fixture.test-support";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-dashboard-history-${name}` });


const VIEWS: Array<{ name: string; subject: string; input: Record<string, unknown>; activeBranchId?: string }> = [
  { name: "owner, all branches", subject: "clerk-dash-owner", input: {} },
  { name: "owner, branch A", subject: "clerk-dash-owner", input: { branchId: A } },
  { name: "owner, branch B", subject: "clerk-dash-owner", input: { branchId: B } },
  { name: "owner, September", subject: "clerk-dash-owner", input: { from: "2026-09-01", to: "2026-09-30" } },
  { name: "branch-A manager", subject: "clerk-dash-manager-a", input: {} },
  { name: "branch-A receptionist", subject: "clerk-dash-desk", input: {} },
  // Two selected branches: the workspace must name the active one.
  { name: "salesperson", subject: "clerk-dash-sales", input: {}, activeBranchId: A },
  { name: "salesperson, branch B", subject: "clerk-dash-sales", input: { branchId: B }, activeBranchId: B },
];

// Ranges the dashboard page does not send but the API accepts: a date that
// does not exist, a range after today, a long range and a single day.
const UNUSUAL_RANGES: typeof VIEWS = [
  { name: "owner, impossible start date", subject: "clerk-dash-owner", input: { from: "2026-02-30", to: "2026-10-15" } },
  { name: "owner, future range", subject: "clerk-dash-owner", input: { from: "2026-10-20", to: "2026-10-31" } },
  { name: "owner, since July", subject: "clerk-dash-owner", input: { from: "2026-07-01", to: "2026-10-15" } },
  { name: "owner, today only, branch B", subject: "clerk-dash-owner", input: { from: "2026-10-15", to: "2026-10-15", branchId: B } },
];

async function dashboardViews(t: TestConvex<typeof schema>, list = VIEWS): Promise<Record<string, Record<string, unknown>>> {
  const views: Record<string, Record<string, unknown>> = {};
  for (const view of list) views[view.name] = await t.withIdentity({ subject: view.subject }).query(api.domain.query, { ...operation("dashboard", view.input), activeBranchId: view.activeBranchId }) as Record<string, unknown>;
  return views;
}

type QueueItem = { id: string; kind: string; priority: string; detail?: string; occurredAt?: string };
const queueOf = (view: Record<string, unknown>) => (view.todayQueue as { items: QueueItem[] }).items;

afterEach(() => vi.useRealTimers());

describe("dashboard over a gym with history", () => {
  it("keeps KPIs, retention alerts and the Today queue exactly as before", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedHistory(t);

    const views = await dashboardViews(t);
    const owner = views["owner, all branches"]!;
    expect(owner.kpis).toEqual({
      revenueToday: money(16_500),
      revenueThisMonth: money(42_500),
      revenuePrevMonth: money(31_000),
      outstandingTotal: money(17_000),
      newMembersThisMonth: 1,
      renewalsDueNext7Days: 1,
      expiredUnactioned: 2,
      checkInsToday: 2,
      activeLeads: 5,
      overdueFollowUps: 1,
    });
    const atRisk = (view: Record<string, unknown>) => queueOf(view).filter((item) => item.kind === "at_risk").map((item) => [item.id, item.priority, item.detail, item.occurredAt]);
    expect(atRisk(owner)).toEqual([
      ["at-risk:dm-long-gone", "urgent", "No visit in 100 days · Monthly", "2026-07-07T09:00:00.000Z"],
      ["at-risk:dm-roamer", "urgent", "No visit in 35 days · Monthly", "2026-09-10T17:00:00.000Z"],
      ["at-risk:dm-expired", "urgent", "Expired 15 days ago · Monthly", "2026-09-29T16:00:00.000Z"],
      ["at-risk:dm-inactive-a", "high", "No visit in 20 days · Monthly", "2026-09-25T15:00:00.000Z"],
      ["at-risk:dm-never", "high", "No first visit after 25 days · Monthly", undefined],
    ]);
    // A branch-A view only counts branch-A visits, so the roamer looks idle longer.
    expect(atRisk(views["owner, branch A"]!)).toContainEqual(["at-risk:dm-roamer", "urgent", "No visit in 50 days · Monthly", "2026-08-26T17:00:00.000Z"]);
    expect(atRisk(views["branch-A manager"]!)).toContainEqual(["at-risk:dm-roamer", "urgent", "No visit in 50 days · Monthly", "2026-08-26T17:00:00.000Z"]);
    expect(queueOf(owner).filter((item) => item.kind === "access_denial")).toEqual([expect.objectContaining({ id: "access:dm-expired", detail: "membership expired · balance due", occurredAt: "2026-10-15T06:30:00.000Z" })]);
    expect(queueOf(owner).map((item) => item.id)).toMatchSnapshot("owner Today queue order");
    expect((owner.recentActivity as Array<{ id: string }>).map((event) => event.id)).toMatchSnapshot("owner recent activity");
    expect(views).toMatchSnapshot("every dashboard view");
    const unusual = await dashboardViews(t, UNUSUAL_RANGES);
    expect(unusual).toMatchSnapshot("unusual ranges");

    // Once older check-ins are summarised, last visits come from the summary.
    await summariseVisits(t);
    expect(await dashboardViews(t)).toEqual(views);
    expect(await dashboardViews(t, UNUSUAL_RANGES)).toEqual(unusual);
  }, 30_000);

  it("keeps last visits current as check-ins are written after the backfill", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedHistory(t);
    await summariseVisits(t);
    const desk = t.withIdentity({ subject: "clerk-dash-desk" });
    const owner = t.withIdentity({ subject: "clerk-dash-owner" });

    vi.setSystemTime(new Date("2026-10-15T09:05:00.000Z"));
    await desk.mutation(api.domain.mutate, operation("checkins.create", { branchId: A, memberId: "dm-roamer" }));
    await desk.mutation(api.domain.mutate, operation("checkins.create", { branchId: A, memberId: "dm-expired" }));
    await owner.mutation(api.domain.mutate, { ...operation("checkins.override", { branchId: B, memberId: "dm-long-gone", reason: "Card at home" }), activeBranchId: B });
    vi.setSystemTime(new Date("2026-10-15T09:10:00.000Z"));

    const summarised = await dashboardViews(t);
    const ownerQueue = queueOf(summarised["owner, all branches"]!).map((item) => item.id);
    expect(ownerQueue).not.toContain("at-risk:dm-roamer");
    expect(ownerQueue).not.toContain("at-risk:dm-long-gone");
    // The refused entry is not a visit: the expired member stays on the list.
    expect(ownerQueue).toContain("at-risk:dm-expired");
    // Branch A never saw the override at B.
    expect(queueOf(summarised["owner, branch A"]!).map((item) => item.id)).toContain("at-risk:dm-long-gone");

    // Reading every check-in gives the same dashboard.
    await t.run(async (ctx) => {
      const ready = await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "member_visit_summary_v1")).unique();
      await ctx.db.delete(ready!._id);
    });
    expect(await dashboardViews(t)).toEqual(summarised);
  }, 30_000);
  it("lists a short cash drawer awaiting review instead of failing the dashboard", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    const ids = await seedHistory(t);
    await t.run(async (ctx) => {
      const at = Date.parse("2026-10-14T08:00:00.000Z");
      await ctx.db.insert("domainRecords", { organizationId: ids.organization, entityType: "shift", publicId: "sh-short", branchId: ids.branchB, createdAt: at, updatedAt: at, data: { id: "sh-short", branchId: B, status: "closed", varianceApprovalStatus: "pending", variance: { amount: -2_250, currency: "JOD" }, openedByName: "Sami Sales", closedAt: "2026-10-14T21:00:00.000Z" } });
    });
    const owner = await t.withIdentity({ subject: "clerk-dash-owner" }).query(api.domain.query, operation("dashboard")) as Record<string, unknown>;
    expect(queueOf(owner).find((item) => item.id === "variance:sh-short")).toMatchObject({ kind: "cash_variance", amount: { amount: -2_250, currency: "JOD" } });
  });
});
