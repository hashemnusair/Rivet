import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { InvoiceLines, invoiceLines } from "./invoice-lines";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
it.each(["en", "ar"] as const)("shows %s activation evidence without rewriting invoice line arithmetic", locale => {
  const invoice: PlatformBillingInvoice = { id: "INV-SYNTHETIC", gym: "Synthetic Gym", status: "paid", amount: "JOD 41.000", amountMinor: 41000, subtotalMinor: 199000, creditMinor: 158000, date: "2026-10-10T12:00:00Z", upgradeActivation: { quotedCreditMinor: 158000, appliedCreditMinor: 0, consumedCreditMinor: 158000, fundedSubscriptionMinor: 41000, nominalSubscriptionMinor: 199000, periodStart: "2026-11-11T12:00:00Z", periodEnd: "2026-11-17T12:00:00Z" } };
  const before = JSON.stringify(invoice);
  render(<LocaleProvider initialLocale={locale}><InvoiceLines invoice={invoice} plan="Pro" /></LocaleProvider>);
  const note = screen.getByText(locale === "en" ? /Activation:/ : /عند التفعيل:/);
  expect(note).toHaveTextContent("41.000");
  expect(note).toHaveTextContent("158.000");
  expect(invoiceLines(invoice).reduce((sum, line) => sum + line.amountMinor, 0)).toBe(41000);
  expect(JSON.stringify(invoice)).toBe(before);
});
