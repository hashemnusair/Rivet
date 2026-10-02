import { describe, expect, it } from "vitest";
import { createTranslator } from "./core";
import { ledgerStatusLabel, payableReconciliationReason, payableSourceLabel } from "./payables";
const ar = createTranslator("ar");
describe("payables display projections", () => {
  it("translates only generated wrappers and retains authored details and unknown history", () => {
    expect(payableSourceLabel("Purchase order · مُكمّل Company A × 3", ar)).toBe("طلب شراء · مُكمّل Company A × 3");
    expect(payableSourceLabel("Equipment repair · فحص belt B", ar)).toBe("إصلاح جهاز · فحص belt B");
    expect(payableSourceLabel("Purchase order po-001", ar)).toBe("طلب شراء po-001");
    expect(payableSourceLabel("Private historical note A", ar)).toBe("Private historical note A");
    expect(payableReconciliationReason("Stock was received without an order. No supplier was recorded.", ar)).toBe("تم استلام البضاعة دون طلب شراء، ولم يُسجل مورّد.");
    expect(payableReconciliationReason("Recorded in USD, not JOD; settle it with a manual journal.", ar)).toContain("USD بدلًا من JOD");
    expect(payableReconciliationReason("A staff-authored reason", ar)).toBe("A staff-authored reason");
    expect(ledgerStatusLabel("posted", ar)).not.toBe(ledgerStatusLabel("pending", ar));
  });
  it("covers every Arabic count category for bills and days", () => {
    for (const count of [0, 1, 2, 3, 11, 102]) {
      expect(ar("payablesWorkspace.billsToPay", { count })).toContain(String(count));
      expect(ar("payablesWorkspace.days", { count })).toContain(String(count));
    }
    expect(ar("payablesWorkspace.billsToPay", { count: 2 })).toContain("فاتورتان");
  });
});
