import { describe, expect, it } from "vitest";
import { classBookingIsActive, classBookingTakesSeat, classCancellationPreview } from "./class-booking";

const startsAt = "2026-09-08T15:00:00.000Z";
const endsAt = "2026-09-08T16:00:00.000Z";

describe("class booking status helpers", () => {
  it("separates active bookings from seat-taking ones", () => {
    expect(classBookingIsActive("booked")).toBe(true);
    expect(classBookingIsActive("waitlisted")).toBe(true);
    expect(classBookingIsActive("attended")).toBe(false);
    expect(classBookingTakesSeat("attended")).toBe(true);
    expect(classBookingTakesSeat("no_show")).toBe(true);
    expect(classBookingTakesSeat("waitlisted")).toBe(false);
    expect(classBookingTakesSeat("late_cancelled")).toBe(false);
  });
});

describe("class cancellation preview", () => {
  it("is a plain cancellation with a free-until instant before the cutoff", () => {
    const preview = classCancellationPreview({ startsAt, endsAt, bookingStatus: "booked", cutoffHours: 2, now: Date.parse("2026-09-08T12:00:00.000Z") });
    expect(preview.outcome).toBe("cancelled");
    expect(preview.freeUntil).toBe(Date.parse("2026-09-08T13:00:00.000Z"));
  });

  it("becomes a late cancellation inside the cutoff and says no fee applies", () => {
    const preview = classCancellationPreview({ startsAt, endsAt, bookingStatus: "booked", cutoffHours: 2, now: Date.parse("2026-09-08T13:30:00.000Z") });
    expect(preview.outcome).toBe("late_cancelled");
    expect(preview.text).toContain("No fee or membership penalty");
  });

  it("never treats leaving the waitlist as late, whatever the clock says", () => {
    const preview = classCancellationPreview({ startsAt, endsAt, bookingStatus: "waitlisted", cutoffHours: 2, now: Date.parse("2026-09-08T14:59:00.000Z") });
    expect(preview.outcome).toBe("leave_waitlist");
    expect(preview.freeUntil).toBeUndefined();
  });

  it("closes once the class has ended", () => {
    const preview = classCancellationPreview({ startsAt, endsAt, bookingStatus: "booked", cutoffHours: 2, now: Date.parse("2026-09-08T16:00:00.000Z") });
    expect(preview.outcome).toBe("closed");
  });
});
