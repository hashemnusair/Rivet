import { describe, expect, it } from "vitest";
import type { PayablesExport, SupplierPaymentDetail } from "@/lib/domain/types";
import { buildPayablesCsv, buildSupplierPaymentRecordCsv } from "./payables-export";

const exported: PayablesExport = {
  currency: "JOD",
  generatedAt: "2026-09-01T10:00:00.000Z",
  truncated: false,
  rows: [{ supplierName: "Jordan Sports Supply", sourceLabel: "Purchase order · Creatine × 100", sourceId: "po-1", branchName: "Abdoun", receivedAt: "2026-08-12T09:00:00.000Z", ageDays: 20, original: { amount: 1_650_000, currency: "JOD" }, paid: { amount: 650_000, currency: "JOD" }, remaining: { amount: 1_000_000, currency: "JOD" }, status: "partially_paid", externalReference: "JSS-INV-0147", ledgerPostingStatus: "not_posted" }],
};

const detail: SupplierPaymentDetail = {
  id: "sp-1", organizationId: "org-1", supplierId: "supplier-1", supplierName: "Jordan Sports Supply", branchId: "branch-1", branchName: "Abdoun", method: "bank_transfer",
  amount: { amount: 1_000_000, currency: "JOD" }, reference: "TRF-2026-0091", status: "recorded", allocations: [{ payableId: "purchase_order:po-1", sourceType: "purchase_order", sourceLabel: "Purchase order · Creatine × 100", amount: { amount: 1_000_000, currency: "JOD" } }],
  recordedById: "user-1", recordedByName: "Omar", occurredAt: "2026-09-01T10:00:00.000Z", ledgerPostingStatus: "posted", idempotencyKey: "k", createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z",
  organization: { name: "Forge Fitness Club" }, branch: { name: "Abdoun", code: "ABD", address: "Abdoun", phone: "+962" }, supplierRemaining: { amount: 0, currency: "JOD" },
  payables: [{ payableId: "purchase_order:po-1", sourceLabel: "Purchase order · Creatine × 100", original: { amount: 1_650_000, currency: "JOD" }, paid: { amount: 1_650_000, currency: "JOD" }, remaining: { amount: 0, currency: "JOD" }, status: "paid" }],
};

describe("payables exports", () => {
  it("writes readable payables rows with decimal amounts and no internal ids", () => {
    const csv = buildPayablesCsv(exported, { timeZone: "Asia/Amman", branchLabel: "Abdoun", supplierLabel: "All suppliers", statusLabel: "Open", search: "creatine" });
    expect(csv).toContain("Supplier,Source,Branch,Received,Age (days),Due date,Original (JOD),Paid (JOD),Remaining (JOD),Status,Supplier reference,Ledger");
    expect(csv).toContain("Jordan Sports Supply,Purchase order · Creatine × 100,Abdoun,2026-08-12 12:00:00,20,,1650.000,650.000,1000.000,Partially paid,JSS-INV-0147,Not posted to ledger yet");
    expect(csv).not.toContain("po-1");
    expect(csv).not.toContain("{");
    expect(csv).toContain("Search,creatine");
  });

  it("notes a truncated export instead of pretending it is complete", () => {
    const csv = buildPayablesCsv({ ...exported, truncated: true }, { timeZone: "Asia/Amman", branchLabel: "All branches", supplierLabel: "All suppliers", statusLabel: "Everything" });
    expect(csv).toContain("Row limit reached");
  });

  it("writes a supplier remittance record that names the ledger state", () => {
    const csv = buildSupplierPaymentRecordCsv(detail, "Asia/Amman");
    expect(csv).toContain("Supplier payment confirmation");
    expect(csv).toContain("Amount,1000.000 JOD");
    expect(csv).toContain("Method,Bank transfer");
    expect(csv).toContain("Reference,TRF-2026-0091");
    expect(csv).toContain("Ledger,Posted to ledger");
    expect(csv).toContain("Purchase order · Creatine × 100,1000.000,1650.000,1650.000,0.000,Paid");
    expect(csv).not.toContain("receipt");
  });
});
