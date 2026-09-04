import { describe, expect, it } from "vitest";
import { invoicePdfBlocks, invoicePdfFilename, renderInvoicePdf, type InvoicePdfInput } from "./platformInvoicePdf";
import { invoiceDate, invoiceMoney, invoicePdfInput } from "./platformInvoiceDocument";

const invoice: InvoicePdfInput = {
  number: "INV-2026-000184",
  status: "open",
  issuedDate: "3 Sep 2026",
  dueDate: "17 Sep 2026",
  periodStart: "3 Sep 2026",
  periodEnd: "2 Oct 2026",
  interval: "monthly",
  customer: { name: "Forge Fitness Club", address: "Abdoun, Amman, Jordan", contactName: "Omar Al-Khatib (owner)", contactEmail: "omar@forgefitness.jo" },
  lines: [{ description: "Growth plan, monthly subscription", period: "3 Sep – 2 Oct 2026", amount: "JOD 149.000" }],
  subtotal: "JOD 149.000",
  total: "JOD 149.000",
};

const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("invoice document", () => {
  it("states the parties, the period, the line items and what is owed", () => {
    const blocks = JSON.stringify(invoicePdfBlocks(invoice));
    expect(blocks).toContain("Forge Fitness Club");
    expect(blocks).toContain("Omar Al-Khatib (owner)");
    expect(blocks).toContain("Growth plan, monthly subscription");
    expect(blocks).toContain("Total due");
    expect(blocks).toContain("Payment terms 14 days.");
    expect(blocks).toContain("Quote INV-2026-000184 as the payment reference.");
    // Nothing about tax or bank details is invented, and nothing bracketed is printed.
    expect(blocks).not.toMatch(/\[[A-Za-z]/);
    expect(blocks).not.toContain("\"Tax\"");
    expect(blocks).toContain("confirms them on request at sales@rivetjo.com");
  });

  it("shows the status as a quiet chip, and red only when it is past due", () => {
    expect(JSON.stringify(invoicePdfBlocks(invoice))).toContain('"chip":{"label":"Open","tone":"warning"}');
    expect(JSON.stringify(invoicePdfBlocks({ ...invoice, status: "past_due" }))).toContain('"tone":"danger"');
    const paid = JSON.stringify(invoicePdfBlocks({ ...invoice, status: "paid", payment: { paidDate: "10 Sep 2026", reference: "CLIQ-8F2K19", amount: "JOD 149.000", balance: "JOD 0.000" } }));
    expect(paid).toContain('"label":"Paid · 10 Sep 2026"');
    expect(paid).toContain("Amount paid");
    expect(paid).toContain("Payment reference CLIQ-8F2K19.");
  });

  it("renders a file a reader can open, with the lockup and the invoice label", () => {
    const body = text(renderInvoicePdf(invoice));
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body).toContain("(INVOICE) Tj");
    expect(body).toContain("(Invoice) Tj");
    expect(body).toContain("/Subtype /Image");
    expect(body).toContain("(PAGE 1 OF 1) Tj");
    expect(body).toContain("sales@rivetjo.com");
    expect(invoicePdfFilename("INV-2026-000184")).toBe("RIVET-invoice-INV-2026-000184.pdf");
  });

  it("projects a stored invoice, in Jordanian dinars to three decimals", () => {
    expect(invoiceMoney(149000, "JOD")).toBe("JOD 149.000");
    expect(invoiceMoney(1500, "USD")).toBe("USD 15.00");
    expect(invoiceDate("2026-09-03T09:00:00.000Z")).toBe("3 Sep 2026");
    expect(invoiceDate("not a date")).toBe("—");
    const projected = invoicePdfInput("INV-9", {
      amountMinor: 129133, currency: "JOD", billingInterval: "monthly", creditDays: 4, status: "open",
      createdAt: "2026-09-03T09:00:00.000Z", dueAt: "2026-09-17T09:00:00.000Z",
      periodStart: "2026-09-03T09:00:00.000Z", periodEnd: "2026-10-02T09:00:00.000Z",
    }, { name: "Forge Fitness Club", plan: "Growth", contactName: "Omar Al-Khatib (owner)", contactEmail: "omar@forgefitness.jo" });
    expect(projected.total).toBe("JOD 129.133");
    expect(projected.lines[0]!.description).toContain("Growth plan, monthly subscription, after a prorated credit of 4 unused days");
    expect(projected.dueDate).toBe("17 Sep 2026");
    expect(projected.payment).toBeUndefined();
  });
});
