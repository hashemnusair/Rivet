/** The precise set of unpaid subscription invoices a replacement term supersedes. */
export function replaceableSubscriptionInvoice(invoice: { cycleKey?: unknown; status?: unknown }): boolean {
  return typeof invoice.cycleKey === "string" && invoice.cycleKey.length > 0
    && ["draft", "open", "past_due", "failed"].includes(String(invoice.status));
}

/** A transfer awaiting review must keep the invoice the gym paid against. */
export function submittedPayment(invoice: { paymentClaim?: unknown }): boolean {
  const claim = invoice.paymentClaim;
  return claim !== null && typeof claim === "object" && "status" in claim && claim.status === "submitted";
}
