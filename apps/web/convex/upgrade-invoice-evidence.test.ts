import { expect, it } from "vitest";
import { invoicePdfInput } from "./platformInvoiceDocument";
import { invoicePdfBlocks, renderInvoicePdf } from "./platformInvoicePdf";
const stored = { status: "paid", amountMinor: 41000, subtotalMinor: 199000, creditMinor: 158000, currency: "JOD", periodStart: "2026-11-11T12:00:00Z", periodEnd: "2026-11-17T16:20:00Z", upgradeActivation: { fundedSubscriptionMinor: 41000, appliedCreditMinor: 0, consumedCreditMinor: 158000 } };
it.each(["en", "ar"] as const)("prints %s activation funding beside immutable quote amounts", locale => {
  const before = JSON.stringify(stored);
  const input = invoicePdfInput("INV-SYNTHETIC", stored, { name: "Synthetic Gym / النادي التجريبي" }, { locale, timeZone: "Asia/Amman" });
  expect(input.total).toContain("41.000");
  expect(input.subtotal).toContain("199.000");
  expect(input.credit?.value).toContain("158.000");
  expect(input.activationNote).toContain("41.000");
  expect(input.activationNote).toContain("0.000");
  expect(input.activationNote).toContain("158.000");
  expect(invoicePdfBlocks(input)).toContainEqual(expect.objectContaining({ type: "paragraph", text: input.activationNote }));
  expect(renderInvoicePdf(input).length).toBeGreaterThan(1000);
  expect(JSON.stringify(stored)).toBe(before);
});
