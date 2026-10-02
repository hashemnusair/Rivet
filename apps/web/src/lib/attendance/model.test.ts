import { describe, expect, it } from "vitest";
import { attendanceInsights, attendanceSettings, presenceWindows, checkInEvent, type AttendanceEvent } from "./model";
const M = 60_000;
const now = Date.parse("2026-10-02T20:30:00Z");
const event = (id: string, ago: number, overrides: Partial<AttendanceEvent> = {}): AttendanceEvent => ({ id, personId: "a", occurredAt: now - ago * M, kind: "entry", accepted: true, source: "reception", ...overrides });
const report = (events: AttendanceEvent[], at = now, settings = attendanceSettings(undefined, "Asia/Amman", 100)) => attendanceInsights({ branchId: "a", events, now: at, settings });

describe("attendance estimation", () => {
  it("expires without any new events and never generates a departure fact", () => {
    const events = [event("one", 89)];
    expect(report(events).snapshot.current).toBe(1);
    expect(report(events, now + M).snapshot.current).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("entry");
  });
  it("counts distinct people and ignores retries and repeated scans without extending a window", () => {
    const events = [event("one", 89), event("two", 40), event("three", 1), event("one", 89), event("b", 20, { personId: "b" })];
    expect(report(events).snapshot.current).toBe(2);
    expect(report(events, now + M).snapshot.current).toBe(1);
    expect(presenceWindows(events, now)).toHaveLength(2);
  });
  it("permits re-entry after a real exit or expiry, including out-of-order deliveries", () => {
    const events = [event("back", 20), event("exit", 30, { kind: "exit" }), event("first", 40)];
    expect(presenceWindows(events, now)).toEqual([{ personId: "a", start: now - 40 * M, end: now - 30 * M }, { personId: "a", start: now - 20 * M, end: now + 70 * M }]);
    expect(presenceWindows([event("first", 200), event("back", 1)], now)).toHaveLength(2);
  });
  it("uses event time, not receipt time, and excludes denied and future entries", () => {
    expect(report([event("old", 120), event("blocked", 10, { accepted: false }), event("future", -5)]).snapshot.current).toBe(0);
    expect(checkInEvent({ id: "denied", memberId: "a", occurredAt: new Date(now).toISOString(), decision: "blocked" }).accepted).toBe(false);
  });
  it("freezes each window's configured duration; legacy rows keep 90 minutes", () => {
    expect(report([event("short", 31, { windowMinutes: 30 })]).snapshot.current).toBe(0);
    const legacy = checkInEvent({ id: "a", memberId: "a", occurredAt: new Date(now - 60 * M).toISOString(), decision: "allowed" });
    expect(report([legacy], now, attendanceSettings({ windowMinutes: 30 })).snapshot.current).toBe(1);
  });
  it("never converts an unavailable, incomplete or stale feed to zero", () => {
    expect(report([], now, attendanceSettings({ feedMode: "paused" })).snapshot).toMatchObject({ current: null, availability: "unavailable" });
    expect(report([], now, attendanceSettings({ feedMode: "external" })).snapshot).toMatchObject({ current: null, availability: "stale" });
    expect(attendanceInsights({ branchId: "a", settings: attendanceSettings(), events: [], now, truncated: true }).snapshot.current).toBeNull();
  });
  it("uses branch-local dates across midnight without mislabelling occupancy as entry volume", () => {
    const result = report([event("entry", 60)], now + 60 * M);
    expect(result.date).toBe("2026-10-03");
    expect(result.snapshot.checkInsToday).toBe(0);
    expect(result.curve[0]?.label).toBe("00:00");
    expect(result.curve[0]?.occupancy).toBe(0);
  });
  it("does not invent DST spring-forward samples or collapse repeated fall-back instants", () => {
    const start = Date.parse("2026-03-08T05:00:00Z");
    const result = report([{ ...event("a", 0), occurredAt: start }], Date.parse("2026-03-08T10:00:00Z"), attendanceSettings({ timezone: "America/New_York" }));
    expect(result.curve.some(p => p.label.startsWith("02:"))).toBe(false);
    const fall = report([{ ...event("a", 0), occurredAt: Date.parse("2026-11-01T04:00:00Z") }], Date.parse("2026-11-01T08:00:00Z"), attendanceSettings({ timezone: "America/New_York" }));
    expect(fall.curve.filter(p => p.label === "01:00")).toHaveLength(2);
  });
  it("uses configured capacity and otherwise learns thresholds only from enough history", () => {
    expect(report([event("a", 1)]).snapshot.status).toBe("quiet");
    expect(report([], now, attendanceSettings()).snapshot).toMatchObject({ status: "learning", capacity: null, basis: "insufficient_history" });
    const events = Array.from({ length: 28 }, (_, day) => [event(`${day}-a`, day * 1440 + 10), event(`${day}-b`, day * 1440 + 20, { personId: "b" })]).flat();
    const result = report(events, now, attendanceSettings());
    expect(result.enoughHistory).toBe(true);
    expect(result.snapshot.basis).toBe("history");
    expect(result.quiet?.entries).toBeGreaterThan(0);
    expect(result.quiet?.days).toBeGreaterThanOrEqual(2);
  });
});
