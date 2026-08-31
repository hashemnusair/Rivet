import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  collectionsReport,
  controlTrendsReport,
  crmFunnelReport,
  localDateOf,
  localWeekdayHourOf,
  peakHoursReport,
  renewalForecastReport,
  retentionReport,
} from "./operational-reports";

const TZ = "Asia/Amman";

describe("tenant-local time helpers", () => {
  it("classifies instants around midnight into the Amman calendar day", () => {
    // 21:30 UTC on the 14th is 00:30 on the 15th in Amman (UTC+3).
    expect(localDateOf("2026-06-14T21:30:00.000Z", TZ)).toBe("2026-06-15");
    expect(localDateOf("2026-06-14T20:59:00.000Z", TZ)).toBe("2026-06-14");
  });

  it("maps the local weekday and hour, not the UTC ones", () => {
    // Saturday 23:00 UTC = Sunday 02:00 Amman.
    const { weekday, hour } = localWeekdayHourOf("2026-06-06T23:00:00.000Z", TZ);
    expect(weekday).toBe(0);
    expect(hour).toBe(2);
  });

  it("adds calendar months with day clamping", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-03-15", 3)).toBe("2026-06-15");
  });
});

describe("peak hours", () => {
  it("counts only admitted check-ins inside the local range", () => {
    const report = peakHoursReport(
      [
        { occurredAt: "2026-06-14T21:30:00.000Z", decision: "allowed" }, // local 15th 00:30
        { occurredAt: "2026-06-15T04:00:00.000Z", decision: "overridden" }, // local 15th 07:00
        { occurredAt: "2026-06-15T04:10:00.000Z", decision: "blocked" },
        { occurredAt: "2026-06-16T04:00:00.000Z", decision: "allowed" }, // outside range
      ],
      { from: "2026-06-15", to: "2026-06-15" },
      TZ,
    );
    expect(report.admittedTotal).toBe(2);
    expect(report.excludedTotal).toBe(1);
    expect(report.cells).toEqual([
      { weekday: 1, hour: 0, count: 1 },
      { weekday: 1, hour: 7, count: 1 },
    ]);
  });
});

describe("retention cohorts", () => {
  it("uses first-start cohorts, coverage at checkpoints, and age-gated denominators", () => {
    const report = retentionReport(
      [
        // Cohort 2026-01: covered at +1 via a gapless renewal, lost by +3.
        { memberId: "m1", startDate: "2026-01-10", endDate: "2026-02-09" },
        { memberId: "m1", startDate: "2026-02-10", endDate: "2026-03-09" },
        // Cohort 2026-01: one term only — retained at +1 (term still covers it), lost at +3.
        { memberId: "m2", startDate: "2026-01-20", endDate: "2026-02-20" },
        // Cohort 2026-05: too new for any checkpoint at "today" below.
        { memberId: "m3", startDate: "2026-05-25", endDate: "2026-06-24" },
        // Scheduled future term must not create a cohort yet.
        { memberId: "m4", startDate: "2026-07-01", endDate: "2026-07-31" },
      ],
      "2026-06-01",
    );
    const january = report.cohorts.find((cohort) => cohort.cohortMonth === "2026-01")!;
    expect(january.size).toBe(2);
    expect(january.months1).toEqual({ retained: 2, eligible: 2 });
    expect(january.months3).toEqual({ retained: 0, eligible: 2 });
    // Checkpoint dates beyond today keep the cohort out of the denominator.
    expect(january.months6).toEqual({ retained: 0, eligible: 0 });
    const may = report.cohorts.find((cohort) => cohort.cohortMonth === "2026-05")!;
    expect(may.months1).toEqual({ retained: 0, eligible: 0 });
    expect(report.cohorts.some((cohort) => cohort.cohortMonth === "2026-07")).toBe(false);
  });
});

describe("renewal forecast", () => {
  const names = new Map([["m1", "Aisha"], ["m2", "Basel"], ["m3", "Celine"]]);
  const plans = new Map([["p1", { name: "Monthly", priceMinor: 45_000 }]]);

  it("buckets exclusively and skips memberships with a successor term", () => {
    const report = renewalForecastReport(
      [
        { id: "a", memberId: "m1", planId: "p1", startDate: "2026-05-05", endDate: "2026-06-05" }, // 4 days out
        { id: "b", memberId: "m2", planId: "p1", startDate: "2026-05-10", endDate: "2026-06-13" }, // 12 days out
        // m3's first term already renewed: only the successor may appear.
        { id: "c", memberId: "m3", planId: "p1", startDate: "2026-05-01", endDate: "2026-06-03" },
        { id: "d", memberId: "m3", planId: "p1", startDate: "2026-06-04", endDate: "2026-06-20" }, // 19 days out
      ],
      names,
      plans,
      "2026-06-01",
    );
    expect(report.buckets.map((bucket) => bucket.count)).toEqual([1, 1, 1]);
    expect(report.buckets[0]!.rows[0]).toMatchObject({ memberId: "m1", planName: "Monthly", valueMinor: 45_000 });
    expect(report.buckets[1]!.rows[0]!.memberId).toBe("m2");
    // The renewed first term is excluded; only its successor reaches a bucket.
    expect(report.buckets[2]!.rows.map((row) => row.membershipId)).toEqual(["d"]);
  });

  it("counts each membership exactly once across buckets", () => {
    const report = renewalForecastReport(
      [{ id: "a", memberId: "m1", planId: "p1", startDate: "2026-05-25", endDate: "2026-06-08" }],
      names,
      plans,
      "2026-06-01",
    );
    expect(report.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(1);
    expect(report.buckets[0]!.count).toBe(1); // 7 days out belongs to the first bucket only
  });
});

describe("collection efficiency", () => {
  it("separates period activity from current outstanding and never counts voided or refunded as collected", () => {
    const report = collectionsReport(
      [
        { createdAt: "2026-06-10T08:00:00.000Z", issueDate: "2026-06-10", totalMinor: 100_000, outstandingMinor: 40_000 },
        { createdAt: "2026-05-01T08:00:00.000Z", issueDate: "2026-05-01", totalMinor: 50_000, outstandingMinor: 10_000 },
      ],
      [
        { occurredAt: "2026-06-10T09:00:00.000Z", type: "payment", status: "completed", amountMinor: 60_000 },
        { occurredAt: "2026-06-11T09:00:00.000Z", type: "payment", status: "voided", amountMinor: 25_000 },
        { occurredAt: "2026-06-12T09:00:00.000Z", type: "refund", status: "completed", amountMinor: -15_000 },
        { occurredAt: "2026-05-02T09:00:00.000Z", type: "payment", status: "completed", amountMinor: 40_000 },
      ],
      { from: "2026-06-01", to: "2026-06-30" },
      TZ,
    );
    expect(report).toMatchObject({
      chargedCount: 1,
      chargedMinor: 100_000,
      collectedCount: 1,
      collectedMinor: 60_000,
      voidedCount: 1,
      voidedMinor: 25_000,
      refundedCount: 1,
      refundedMinor: 15_000,
      outstandingNowMinor: 50_000,
    });
  });
});

describe("CRM funnel", () => {
  it("derives contact, response time, and conversion from persisted facts", () => {
    const report = crmFunnelReport(
      [
        { id: "l1", createdAt: "2026-06-10T08:00:00.000Z", convertedMemberId: "m9" },
        { id: "l2", createdAt: "2026-06-11T08:00:00.000Z" },
        { id: "old", createdAt: "2026-05-01T08:00:00.000Z", convertedMemberId: "m1" },
      ],
      [
        { leadId: "l1", type: "call_attempt", occurredAt: "2026-06-10T10:00:00.000Z", outcome: "answered_interested" },
        { leadId: "l2", type: "call_attempt", occurredAt: "2026-06-11T14:00:00.000Z", outcome: "no_answer" },
        { leadId: "l1", type: "lead_assigned", occurredAt: "2026-06-10T09:00:00.000Z" },
      ],
      [
        { leadId: "l1", createdAt: "2026-06-10T12:00:00.000Z", status: "completed" },
        { leadId: "l2", createdAt: "2026-06-11T12:00:00.000Z", status: "no_show" },
      ],
      { from: "2026-06-01", to: "2026-06-30" },
      TZ,
    );
    expect(report).toMatchObject({
      leadsCreated: 2,
      leadsContacted: 1,
      trialsBooked: 2,
      trialsAttended: 1,
      membershipsSold: 1,
      trialToSaleRate: 1,
    });
    // First attempts: 2h and 6h → median 4h.
    expect(report.medianFirstResponseHours).toBe(4);
  });
});

describe("commercial-control trends", () => {
  it("counts control events with money from the underlying facts", () => {
    const report = controlTrendsReport(
      [
        { id: "a1", action: "payment.refund", occurredAt: "2026-06-10T09:00:00.000Z", summary: "Refunded", actorName: "Rana", entityPublicId: "p1" },
        { id: "a2", action: "checkin.override", occurredAt: "2026-06-11T09:00:00.000Z", summary: "Override", actorName: "Hala", entityPublicId: "m1" },
        { id: "a3", action: "membership.price_override", occurredAt: "2026-06-12T09:00:00.000Z", summary: "Price", actorName: "Omar", entityPublicId: "ms1" },
        { id: "a4", action: "lead.contact.update", occurredAt: "2026-06-12T09:00:00.000Z", summary: "Not a control", actorName: "Omar", entityPublicId: "l1" },
      ],
      [
        { occurredAt: "2026-06-10T09:00:00.000Z", type: "refund", status: "completed", amountMinor: -20_000 },
        { occurredAt: "2026-06-13T09:00:00.000Z", type: "payment", status: "voided", amountMinor: 12_000 },
      ],
      [{ createdAt: "2026-06-09T09:00:00.000Z", issueDate: "2026-06-09", discountMinor: 5_000 }],
      [{ occurredAt: "2026-06-12T09:00:00.000Z", amountMinor: 30_000 }],
      { from: "2026-06-01", to: "2026-06-30" },
      TZ,
    );
    expect(report.refunds).toEqual({ count: 1, amountMinor: 20_000 });
    expect(report.voids).toEqual({ count: 1, amountMinor: 12_000 });
    expect(report.discounts).toEqual({ count: 1, amountMinor: 5_000 });
    expect(report.priceOverrides).toEqual({ count: 1, amountMinor: 30_000 });
    expect(report.staffOverrides).toEqual({ count: 1 });
    expect(report.recent.map((event) => event.id)).toEqual(["a3", "a2", "a1"]);
  });
});
