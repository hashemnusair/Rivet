import { describe, expect, it } from "vitest";
import { chargeDueDate, chargeIsCollectible, chargeIssueDate, collectibleOutstandingMinor } from "./charges";

const charge = (overrides: Record<string, unknown> = {}) => ({
  createdAt: "2026-08-12T09:00:00.000Z",
  outstandingAmount: { amount: 50_000, currency: "JOD" },
  status: "unpaid" as const,
  ...overrides,
});

describe("membership charge collectibility", () => {
  it("keeps legacy charges collectible from their creation date", () => {
    expect(chargeIssueDate(charge())).toBe("2026-08-12");
    expect(chargeDueDate(charge())).toBe("2026-08-12");
    expect(collectibleOutstandingMinor(charge(), "2026-08-12")).toBe(50_000);
  });

  it("excludes a future invoice until its due date", () => {
    const upcoming = charge({ issueDate: "2026-08-12", dueDate: "2026-09-01" });
    expect(chargeIsCollectible(upcoming, "2026-08-31")).toBe(false);
    expect(collectibleOutstandingMinor(upcoming, "2026-08-31")).toBe(0);
    expect(chargeIsCollectible(upcoming, "2026-09-01")).toBe(true);
  });

  it("never treats void or refunded invoices as collectible", () => {
    expect(chargeIsCollectible(charge({ status: "void" }), "2026-08-12")).toBe(false);
    expect(chargeIsCollectible(charge({ status: "refunded" }), "2026-08-12")).toBe(false);
  });
});
