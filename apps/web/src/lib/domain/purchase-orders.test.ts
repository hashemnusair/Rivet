import { describe, expect, it } from "vitest";
import { purchaseOrderIsOverdue, validExpectedDeliveryDate } from "./purchase-orders";

describe("expected delivery dates", () => {
  it("accepts leap dates and clearing while rejecting rollover and non-date values", () => {
    for (const value of [undefined, "", "2028-02-29"]) expect(validExpectedDeliveryDate(value)).toBe(true);
    for (const value of [null, 1, "2026-02-29", "2026-04-31", "2026-01-01T00:00:00Z"]) expect(validExpectedDeliveryDate(value)).toBe(false);
  });
  it("marks only approved outstanding deliveries overdue after the promised local date", () => {
    for (const status of ["approved", "partially_received"]) {
      expect(purchaseOrderIsOverdue({ status, expectedDeliveryDate: "2026-09-08" }, "2026-09-09")).toBe(true);
      expect(purchaseOrderIsOverdue({ status, expectedDeliveryDate: "2026-09-08" }, "2026-09-08")).toBe(false);
    }
    for (const status of ["draft", "received", "cancelled"]) expect(purchaseOrderIsOverdue({ status, expectedDeliveryDate: "2026-09-08" }, "2026-09-09")).toBe(false);
  });
});
