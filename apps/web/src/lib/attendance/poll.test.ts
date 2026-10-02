import { afterEach, expect, it, vi } from "vitest";
import { pollAttendance } from "./poll";
import { attendanceInsights, attendanceSettings } from "./model";
afterEach(() => vi.useRealTimers());
it("refreshes expiry with no writes, reports failure, recovers on reconnect and disposes", async () => {
  vi.useFakeTimers();
  const enteredAt = Date.now() - 89 * 60_000;
  let fail = false;
  const read = vi.fn(async () => {
    if (fail) throw new Error("offline");
    return attendanceInsights({ branchId: "a", settings: attendanceSettings(), events: [{ id: "1", personId: "a", occurredAt: enteredAt, kind: "entry", accepted: true, source: "reception" }], now: Date.now() }).snapshot;
  });
  const values = vi.fn(); const errors = vi.fn();
  const stop = await pollAttendance(read, values, errors);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(values.mock.calls[0]?.[0].current).toBe(1);
  expect(values.mock.lastCall?.[0].current).toBe(0);
  fail = true; await vi.advanceTimersByTimeAsync(15_000); expect(errors).toHaveBeenCalled();
  fail = false; window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(0);
  expect(values.mock.lastCall?.[0].current).toBe(0);
  stop(); const calls = read.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000); expect(read).toHaveBeenCalledTimes(calls);
});
