import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { invoicePdfInput, platformInvoiceAttachment } from "./platformInvoiceDocument";
import { invoicePdfBlocks, renderInvoicePdf } from "./platformInvoicePdf";
import { utf16Hex } from "./pdfUnicode";
const invoice = { amountMinor: 27875, subtotalMinor: 35000, creditMinor: 7125, creditDays: 3, currency: "JOD", createdAt: "2026-10-02T11:30:00Z", dueAt: "2026-10-16T11:30:00Z", periodStart: "2026-10-02", periodEnd: "2026-11-02", billingInterval: "monthly", status: "open" };
const customer = { name: "نادي القوة - عمّان / Strength", contactName: "عبد الرحمن أحمد", contactEmail: "accounts@example.invalid", plan: "Growth" };
describe("recipient-aware Arabic platform invoices", () => {
  it("preserves all figures and date-only boundaries in the localized projection", () => {
    const ar = invoicePdfInput("INV-0042", invoice, customer, { locale: "ar", timeZone: "Pacific/Honolulu" });
    expect(ar.locale).toBe("ar");
    expect(ar.periodStart).toBe("2 تشرين الأول 2026");
    expect(ar.total).toContain("27.875");
    expect(ar.total).toContain("د.أ");
    expect(ar.credit?.value).toContain("-7.125");
    expect(ar.subtotal).toContain("35.000");
    expect(ar.customer).toEqual({ name: customer.name, address: undefined, contactName: customer.contactName, contactEmail: customer.contactEmail });
    expect(invoice.amountMinor).toBe(27875);
    expect(invoicePdfBlocks(ar)[0]).toMatchObject({ type: "title", text: "فاتورة", chip: { label: "غير مدفوعة" } });
    const en = invoicePdfInput("INV-0042", invoice, customer);
    expect(en.total).toBe("JOD 27.875");
    expect(en.locale).toBeUndefined();
  });
  it("embeds Arabic in both the download and email attachment paths", () => {
    const input = invoicePdfInput("INV-0042", invoice, customer, { locale: "ar" });
    const bytes = renderInvoicePdf(input);
    const pdf = new TextDecoder("latin1").decode(bytes);
    expect(pdf).toContain(`/ActualText <${utf16Hex("فاتورة", true)}>`);
    expect(pdf).toContain(utf16Hex(customer.name, true));
    expect(pdf).toContain("/BaseFont /IBMPlexSansArabic-Regular");
    const attachment = platformInvoiceAttachment("INV-0042", invoice, customer, { locale: "ar" });
    expect(attachment.filename).toBe("RIVET-invoice-INV-0042.pdf");
    expect(atob(attachment.contentBase64)).toContain(utf16Hex("فاتورة", true));
    if (process.env.RIVET_PDF_FIXTURE_DIR) {
      mkdirSync(process.env.RIVET_PDF_FIXTURE_DIR, { recursive: true });
      writeFileSync(join(process.env.RIVET_PDF_FIXTURE_DIR, "arabic-invoice.pdf"), bytes);
    }
  });
});
