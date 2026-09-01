import { buildCsvDocument, buildSectionedCsvDocument, exportStatusLabel, formatExportDateTime, formatMinorUnits, type CsvValue } from "@/lib/exports/csv";
import { PAYABLE_STATUS_LABELS, SUPPLIER_PAYMENT_METHOD_LABELS } from "@/lib/domain/payables";
import type { PayablesExport, SupplierPaymentDetail } from "@/lib/domain/types";
import { ledgerStatusLabel } from "./ledger-status";

export interface PayablesExportContext {
  timeZone: string;
  branchLabel: string;
  supplierLabel: string;
  statusLabel: string;
  search?: string;
}

/** Readable spreadsheet rows only: labels, dates, and decimal amounts. */
export function buildPayablesCsv(exported: PayablesExport, context: PayablesExportContext): string {
  const currency = exported.currency;
  return buildCsvDocument({
    title: "Supplier payables",
    metadata: [
      { label: "Generated", value: formatExportDateTime(exported.generatedAt, context.timeZone) },
      { label: "Branch", value: context.branchLabel },
      { label: "Supplier", value: context.supplierLabel },
      { label: "Status", value: context.statusLabel },
      { label: "Search", value: context.search ?? "" },
      { label: "Currency", value: currency },
      ...(exported.truncated ? [{ label: "Note", value: "Row limit reached; narrow the filters to export the rest." }] : []),
    ],
    headers: ["Supplier", "Source", "Branch", "Received", "Age (days)", "Due date", `Original (${currency})`, `Paid (${currency})`, `Remaining (${currency})`, "Status", "Supplier reference", "Ledger"],
    rows: exported.rows.map((row): CsvValue[] => [
      row.supplierName,
      row.sourceLabel,
      row.branchName,
      formatExportDateTime(row.receivedAt, context.timeZone),
      row.ageDays,
      row.dueDate ?? "",
      formatMinorUnits(row.original.amount, currency),
      formatMinorUnits(row.paid.amount, currency),
      formatMinorUnits(row.remaining.amount, currency),
      PAYABLE_STATUS_LABELS[row.status] ?? exportStatusLabel(row.status),
      row.externalReference ?? "",
      ledgerStatusLabel(row.ledgerPostingStatus),
    ]),
    emptyMessage: "No payables matched these filters.",
  });
}

/** A remittance record the supplier can read; not a customer receipt. */
export function buildSupplierPaymentRecordCsv(detail: SupplierPaymentDetail, timeZone: string): string {
  const currency = detail.amount.currency;
  return buildSectionedCsvDocument({
    title: "Supplier payment confirmation",
    metadata: [
      { label: "Organization", value: detail.organization.name },
      { label: "Branch", value: detail.branch.name },
      { label: "Generated", value: formatExportDateTime(new Date(), timeZone) },
    ],
    sections: [
      {
        title: "Payment",
        headers: ["Field", "Value"],
        rows: [
          ["Supplier", detail.supplierName],
          ["Amount", `${formatMinorUnits(detail.amount.amount, currency)} ${currency}`],
          ["Method", SUPPLIER_PAYMENT_METHOD_LABELS[detail.method]],
          ["Reference", detail.reference ?? ""],
          ["Recorded", formatExportDateTime(detail.occurredAt, timeZone)],
          ["Recorded by", detail.recordedByName],
          ["Status", detail.status === "reversed" ? "Reversed" : "Recorded"],
          ["Ledger", ledgerStatusLabel(detail.ledgerPostingStatus)],
          ...(detail.reversal ? [["Reversal reason", detail.reversal.reason], ["Reversed", formatExportDateTime(detail.reversal.reversedAt, timeZone)], ["Reversed by", detail.reversal.reversedByName]] : []),
          ["Notes", detail.notes ?? ""],
          [`Supplier balance still owed (${currency})`, formatMinorUnits(detail.supplierRemaining.amount, currency)],
        ],
      },
      {
        title: "Allocated payables",
        headers: ["Payable", `Allocated (${currency})`, `Payable total (${currency})`, `Paid so far (${currency})`, `Remaining (${currency})`, "Status"],
        rows: detail.allocations.map((allocation) => {
          const payable = detail.payables.find((candidate) => candidate.payableId === allocation.payableId);
          return [
            allocation.sourceLabel,
            formatMinorUnits(allocation.amount.amount, currency),
            payable ? formatMinorUnits(payable.original.amount, currency) : "",
            payable ? formatMinorUnits(payable.paid.amount, currency) : "",
            payable ? formatMinorUnits(payable.remaining.amount, currency) : "",
            payable ? PAYABLE_STATUS_LABELS[payable.status] : "",
          ];
        }),
        emptyMessage: "No allocations.",
      },
    ],
  });
}
