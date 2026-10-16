import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import { NOW, readCost, seedGym, summariseVisits, type ReadCost } from "./history-gym.bench-support";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

/**
 * Opt-in benchmark: `RIVET_DASHBOARD_BENCH=1 vitest run convex/domain.hot-paths.bench.test.ts`.
 *
 * Documents, index ranges and bytes read by the operations the front desk
 * and the sales team run all day, on the busy gym of
 * `history-gym.bench-support.ts` after 180 days, with member-visit summaries
 * in place. Convex refuses a transaction past 32,000 documents, 4,096 index
 * ranges or 16 MiB.
 */
type Row = ReadCost & { operation: string };

async function measureAll(t: TestConvex<typeof schema>): Promise<Row[]> {
  const owner = t.withIdentity({ subject: "clerk-bench-owner" });
  const today = NOW.slice(0, 10);
  const query = (operation: string, input: Record<string, unknown>) => () => owner.query(api.domain.query, { operation, input, correlationId: `cor-bench-${operation}` });
  const mutate = (operation: string, input: Record<string, unknown>) => () => owner.mutation(api.domain.mutate, { operation, input, correlationId: `cor-bench-${operation}` });
  const cases: Array<[string, () => Promise<unknown>]> = [
    ["checkins.preview (member number)", query("checkins.preview", { branchId: "bench-branch-a", query: "B-12" })],
    ["checkins.list (reception: today)", query("checkins.list", { branchId: "bench-branch-a", date: today, acceptedOnly: true, page: 1, pageSize: 25 })],
    ["checkins.occupancy", query("checkins.occupancy", { branchId: "bench-branch-a" })],
    ["checkins.list (member tab)", query("checkins.list", { memberId: "bench-member-12", page: 1, pageSize: 20 })],
    ["members.list (page 1)", query("members.list", { page: 1, pageSize: 25 })],
    ["members.get", query("members.get", { memberId: "bench-member-12" })],
    ["leads.list", query("leads.list", { page: 1, pageSize: 25 })],
    ["retention.queue", query("retention.queue", { page: 1, pageSize: 25 })],
    ["renewal.queue (expiring)", query("renewal.queue", { bucket: "expiring", page: 1, pageSize: 25 })],
    ["transactions.list", query("transactions.list", { page: 1, pageSize: 25 })],
    ["workspace.search", query("workspace.search", { search: "Member 12" })],
    ["checkins.create", mutate("checkins.create", { branchId: "bench-branch-a", memberId: "bench-member-13" })],
  ];
  const rows: Row[] = [];
  for (const [operation, run] of cases) {
    try { rows.push({ operation, ...(await readCost(run)) }); }
    catch (error) { rows.push({ operation: `${operation} FAILED: ${String((error as Error).message).slice(0, 80)}`, documentsRead: -1, indexRanges: -1, megabytesRead: -1, withinConvexLimits: false }); }
  }
  return rows;
}

afterEach(() => vi.useRealTimers());

describe.skipIf(!process.env.RIVET_DASHBOARD_BENCH)("front desk and sales reads against history", () => {
  it("measures each hot operation after 180 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    const t = convexTest(schema, modules);
    await seedGym(t, 180);
    await summariseVisits(t);
    const rows = await measureAll(t);
    console.table(rows);
    expect(rows.length).toBeGreaterThan(0);
  }, 900_000);
});
