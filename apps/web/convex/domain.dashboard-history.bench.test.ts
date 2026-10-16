import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import { NOW, readCost, seedGym, summariseVisits } from "./history-gym.bench-support";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

/**
 * Opt-in benchmark: `RIVET_DASHBOARD_BENCH=1 vitest run convex/domain.dashboard-history.bench.test.ts`.
 *
 * A 300-member, two-branch gym with about 180 check-ins a day, a timeline
 * event for every second check-in and a monthly payment per member. Measures
 * one owner dashboard load after 7, 60 and 180 days of that history:
 * documents read, index ranges, bytes read and wall time. Convex refuses a
 * query past 32,000 documents, 4,096 index ranges or 16 MiB read. Each size
 * is measured before member-visit summaries exist (the transition after a
 * deploy, which still reads every check-in) and after (steady state). The
 * summaries are written with the live check-in code; the backfill has its own
 * test, and convex-test's table scans make running it here impractically slow.
 *
 * Wall time here is not Convex's: convex-test answers every index range by
 * walking the whole table, so even a one-row lookup slows as history grows.
 * `harnessFloorMs` times that many one-row lookups on the same table; the
 * rest of `medianMs` is the query's own work.
 */
type Measurement = { days: number; visitSummaries: boolean; records: number; documentsRead: number; indexRanges: number; megabytesRead: number; medianMs: number; harnessFloorMs: number; withinConvexLimits: boolean };

async function harnessFloor(t: TestConvex<typeof schema>, ranges: number): Promise<number> {
  const timings: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "bench-org")).unique();
      for (let index = 1; index < ranges; index += 1) {
        await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "member").eq("publicId", `bench-member-${index}`)).unique();
      }
    });
    timings.push(performance.now() - started);
  }
  return Math.round(timings.sort((left, right) => left - right)[1]!);
}

async function measure(t: TestConvex<typeof schema>, days: number, records: number, visitSummaries: boolean): Promise<Measurement> {
  const owner = t.withIdentity({ subject: "clerk-bench-owner" });
  const query = () => owner.query(api.domain.query, { operation: "dashboard", input: {}, correlationId: "cor-bench-dashboard" });
  const { documentsRead, indexRanges, megabytesRead, withinConvexLimits } = await readCost(query);
  const timings: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    await query();
    timings.push(performance.now() - started);
  }
  timings.sort((left, right) => left - right);
  return {
    days,
    visitSummaries,
    records,
    documentsRead,
    indexRanges,
    megabytesRead,
    medianMs: Math.round(timings[1]!),
    harnessFloorMs: await harnessFloor(t, indexRanges),
    withinConvexLimits,
  };
}

afterEach(() => vi.useRealTimers());

describe.skipIf(!process.env.RIVET_DASHBOARD_BENCH)("dashboard cost against history length", () => {
  it("measures one owner dashboard load after 7, 60 and 180 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    const results: Measurement[] = [];
    for (const days of [7, 60, 180]) {
      const t = convexTest(schema, modules);
      const records = await seedGym(t, days);
      results.push(await measure(t, days, records, false));
      await summariseVisits(t);
      results.push(await measure(t, days, records, true));
    }
    console.table(results);
    expect(results).toHaveLength(6);
  }, 600_000);
});
