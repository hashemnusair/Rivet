import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/utils/dates";
import { membershipDisplayStatus } from "./membership-status";

const now = new Date("2026-09-05T09:00:00+03:00");

describe("membershipDisplayStatus", () => {
  it("says a past end date has ended instead of 'subscribed until'", () => {
    const status = membershipDisplayStatus({ status: "expiring", endDate: "2026-08-12" }, now);
    expect(status).toMatchObject({ key: "ended", label: "Ended", tone: "red", ended: true, daysLeft: 0 });
    expect(status.summary).toBe("Ended 12 Aug 2026");
  });

  it("counts the remaining days for an active membership", () => {
    const status = membershipDisplayStatus({ status: "active", endDate: "2026-12-05" }, now);
    expect(status).toMatchObject({ key: "active", label: "Active", tone: "green", daysLeft: 91, ended: false });
    expect(status.summary).toBe("Valid until 5 Dec 2026 · 91 days left");
  });

  it("warns inside the final two weeks and on the last day", () => {
    expect(membershipDisplayStatus({ status: "active", endDate: "2026-09-12" }, now)).toMatchObject({ key: "ending", label: "Ends soon", daysLeft: 7 });
    expect(membershipDisplayStatus({ status: "active", endDate: "2026-09-06" }, now).summary).toBe(`Ends in 1 day · ${formatDate("2026-09-06")}`);
    expect(membershipDisplayStatus({ status: "active", endDate: "2026-09-05" }, now)).toMatchObject({ label: "Ends today", daysLeft: 0, ended: false });
  });

  it("keeps a frozen membership neutral", () => {
    expect(membershipDisplayStatus({ status: "frozen", endDate: "2026-11-01" }, now)).toMatchObject({ key: "frozen", label: "Frozen", tone: "neutral", ended: false });
  });
});
