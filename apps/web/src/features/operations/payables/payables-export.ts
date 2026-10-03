import { buildCsvDocument, buildSectionedCsvDocument, formatExportDateTime, formatMinorUnits, type CsvValue } from "@/lib/exports/csv";
import { createTranslator } from "@/lib/i18n/core";
import type { Locale } from "@/lib/i18n/locale";
import { makeFormatters } from "@/lib/i18n/formatters";
import { ledgerStatusLabel, payableSourceLabel, payableStatusLabel, supplierPaymentMethodLabel } from "@/lib/i18n/payables";
import type { PayablesExport, SupplierPaymentDetail } from "@/lib/domain/types";

export interface PayablesExportContext {
  locale?: Locale;
  timeZone: string;
  branchLabel: string;
  supplierLabel: string;
  statusLabel: string;
  search?: string;
}

/** Readable spreadsheet rows only: labels, dates, and decimal amounts. */
export function buildPayablesCsv(exported: PayablesExport, context: PayablesExportContext): string {
  const currency = exported.currency;
  const locale = context.locale ?? "en";
  const t = createTranslator(locale);
  const f = makeFormatters(locale, t("common.time.now"), context.timeZone);
  const dateTime = (value: string | Date) => locale === "ar" ? `${f.date(typeof value === "string" ? value : value.toISOString())} · ${f.time(typeof value === "string" ? value : value.toISOString())}` : formatExportDateTime(value, context.timeZone);
  return buildCsvDocument({
    title: t("palette.pages.supplierBills"),
    metadata: [
      { label: t("payablesWorkspace.generated"), value: dateTime(exported.generatedAt) },
      { label: t("common.label.branch"), value: context.branchLabel },
      { label: t("stockWorkspace.supplier"), value: context.supplierLabel },
      { label: t("common.label.status"), value: context.statusLabel },
      { label: t("common.action.search"), value: context.search ?? "" },
      { label: t("payablesWorkspace.currency"), value: currency },
      ...(exported.truncated ? [{ label: t("payablesWorkspace.note"), value: t("payablesWorkspace.truncated") }] : []),
    ],
    headers: [t("stockWorkspace.supplier"), t("payablesWorkspace.receivedContents"), t("common.label.branch"), t("payablesWorkspace.received"), t("payablesWorkspace.daysSince"), t("payablesWorkspace.dueDate"), t("payablesWorkspace.totalCurrency", { currency }), t("payablesWorkspace.paidCurrency", { currency }), t("payablesWorkspace.owedCurrency", { currency }), t("common.label.status"), t("payablesWorkspace.supplierReference"), t("payablesWorkspace.accounts")],
    rows: exported.rows.map((row): CsvValue[] => [
      row.supplierName,
      payableSourceLabel(row.sourceLabel, t),
      row.branchName,
      dateTime(row.receivedAt),
      row.ageDays,
      row.dueDate ? (locale === "ar" ? f.date(row.dueDate) : row.dueDate) : "",
      formatMinorUnits(row.original.amount, currency),
      formatMinorUnits(row.paid.amount, currency),
      formatMinorUnits(row.remaining.amount, currency),
      payableStatusLabel(row.status, t),
      row.externalReference ?? "",
      ledgerStatusLabel(row.ledgerPostingStatus, t),
    ]),
    emptyMessage: t("payablesWorkspace.noExportBills"),
  });
}

/** A remittance record the supplier can read; not a customer receipt. */
export function buildSupplierPaymentRecordCsv(detail: SupplierPaymentDetail, timeZone: string, locale: Locale = "en"): string {
  const currency = detail.amount.currency;
  const t = createTranslator(locale);
  const f = makeFormatters(locale, t("common.time.now"), timeZone);
  const dateTime = (value: string | Date) => locale === "ar" ? `${f.date(typeof value === "string" ? value : value.toISOString())} · ${f.time(typeof value === "string" ? value : value.toISOString())}` : formatExportDateTime(value, timeZone);
  return buildSectionedCsvDocument({
    title: t("payablesWorkspace.confirmation"),
    metadata: [
      { label: t("payablesWorkspace.gym"), value: detail.organization.name },
      { label: t("common.label.branch"), value: detail.branch.name },
      { label: t("payablesWorkspace.generated"), value: dateTime(new Date()) },
    ],
    sections: [
      {
        title: t("payablesWorkspace.payment"),
        headers: [t("payablesWorkspace.field"), t("payablesWorkspace.value")],
        rows: [
          [t("stockWorkspace.supplier"), detail.supplierName],
          [t("common.label.amount"), `${formatMinorUnits(detail.amount.amount, currency)} ${currency}`],
          [t("payablesWorkspace.method"), supplierPaymentMethodLabel(detail.method, t)],
          [t("payablesWorkspace.reference"), detail.reference ?? ""],
          [t("payablesWorkspace.recorded"), dateTime(detail.occurredAt)],
          [t("payablesWorkspace.recordedBy"), detail.recordedByName],
          [t("common.label.status"), detail.status === "reversed" ? t("payablesWorkspace.reversed") : t("payablesWorkspace.recorded")],
          [t("payablesWorkspace.accounts"), ledgerStatusLabel(detail.ledgerPostingStatus, t)],
          ...(detail.reversal ? [[t("payablesWorkspace.reversalReason"), detail.reversal.reason], [t("payablesWorkspace.reversed"), dateTime(detail.reversal.reversedAt)], [t("payablesWorkspace.reversedBy"), detail.reversal.reversedByName]] : []),
          [t("common.label.notes"), detail.notes ?? ""],
          [t("payablesWorkspace.supplierOwedCurrency", { currency }), formatMinorUnits(detail.supplierRemaining.amount, currency)],
        ],
      },
      {
        title: t("payablesWorkspace.billsPaid"),
        headers: [t("payablesWorkspace.bill"), t("payablesWorkspace.paidNowCurrency", { currency }), t("payablesWorkspace.billTotalCurrency", { currency }), t("payablesWorkspace.paidSoFarCurrency", { currency }), t("payablesWorkspace.owedCurrency", { currency }), t("common.label.status")],
        rows: detail.allocations.map((allocation) => {
          const payable = detail.payables.find((candidate) => candidate.payableId === allocation.payableId);
          return [
            payableSourceLabel(allocation.sourceLabel, t),
            formatMinorUnits(allocation.amount.amount, currency),
            payable ? formatMinorUnits(payable.original.amount, currency) : "",
            payable ? formatMinorUnits(payable.paid.amount, currency) : "",
            payable ? formatMinorUnits(payable.remaining.amount, currency) : "",
            payable ? payableStatusLabel(payable.status, t) : "",
          ];
        }),
        emptyMessage: t("payablesWorkspace.noBills"),
      },
    ],
  });
}
