import type { CustomerTransaction } from "../domain/qol";
import type { TFunction } from "./core";

/** Matches the API's system-generated explanation without touching recorded user text. */
export function customerPaymentExplanation(value: Pick<CustomerTransaction, "type" | "status">, t: TFunction): string {
  if (value.status === "voided" || value.type === "void") return t("customerPortal.voidExplanation");
  if (value.status === "refunded" || value.type === "refund") return t("customerPortal.refundExplanation");
  if (value.status === "partially_refunded") return t("customerPortal.partialRefundExplanation");
  if (value.type === "retail_sale") return t("customerPortal.retailExplanation");
  return t("customerPortal.paymentExplanation");
}
