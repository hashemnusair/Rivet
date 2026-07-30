import { describe, expect, it } from "vitest";
import {
  TENANT_TIMEZONE,
  addDays,
  daysFromToday,
  diffDays,
  endOfDayInTz,
  partsInTimeZone,
  startOfDayInTz,
  todayISODate,
} from "./dates";

describe("calendar arithmetic", () => {
  it("adds and subtracts days across month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("adds a year-long membership term correctly", () => {
    expect(addDays("2026-07-30", 365)).toBe("2027-07-30");
  });

  it("counts whole days between dates, signed", () => {
    expect(diffDays("2026-07-01", "2026-07-15")).toBe(14);
    expect(diffDays("2026-07-15", "2026-07-01")).toBe(-14);
    expect(diffDays("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("counts across a month boundary without off-by-one", () => {
    expect(diffDays("2026-01-31", "2026-02-01")).toBe(1);
  });
});

describe("tenant-local day boundaries", () => {
  it("resolves 'today' in Amman, not in UTC", () => {
    // 22:30 UTC on 30 July is already 01:30 on 31 July in Amman (UTC+3).
    const lateUtc = new Date("2026-07-30T22:30:00Z");
    expect(todayISODate("UTC", lateUtc)).toBe("2026-07-30");
    expect(todayISODate(TENANT_TIMEZONE, lateUtc)).toBe("2026-07-31");
  });

  it("breaks down an instant into Amman parts", () => {
    const parts = partsInTimeZone(new Date("2026-07-30T09:15:00Z"), TENANT_TIMEZONE);
    expect(parts.date).toBe("2026-07-30");
    expect(parts.hour).toBe(12); // UTC+3 in summer
  });

  it("maps local midnight to the correct UTC instant", () => {
    const start = startOfDayInTz("2026-07-30", TENANT_TIMEZONE);
    expect(start.toISOString()).toBe("2026-07-29T21:00:00.000Z");
  });

  it("ends the day one millisecond before the next midnight", () => {
    const start = startOfDayInTz("2026-07-30", TENANT_TIMEZONE);
    const end = endOfDayInTz("2026-07-30", TENANT_TIMEZONE);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("measures days until an expiry date from the tenant's today", () => {
    const now = new Date("2026-07-30T09:00:00Z");
    expect(daysFromToday("2026-08-13", TENANT_TIMEZONE, now)).toBe(14);
    expect(daysFromToday("2026-07-30", TENANT_TIMEZONE, now)).toBe(0);
    expect(daysFromToday("2026-07-23", TENANT_TIMEZONE, now)).toBe(-7);
  });
});
