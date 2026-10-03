import { createTranslator, type TFunction } from "@/lib/i18n/core";
import { isolate } from "@/lib/i18n/bidi";
import { latinDigits, searchKey } from "@/lib/utils/text";
import type { InventoryBalance, MemberSummary, Money, Product, RetailCheckoutInput } from "@/lib/domain/types";

export type CheckoutPaymentMethod = RetailCheckoutInput["method"];
export type SellableProduct = Product & { retailPrice?: Money };

export interface CartLine {
  product: SellableProduct;
  quantity: number;
}

/** Who the sale is for. Anonymous is the default; nothing is stored for it. */
export type CustomerAttachment =
  | { kind: "walk_in" }
  | { kind: "member"; member: MemberSummary }
  | { kind: "guest"; fullName: string; phone: string };

export const CHECKOUT_PAYMENT_METHODS: readonly CheckoutPaymentMethod[] = ["cash", "cliq", "card"];

export function checkoutPaymentMethodLabel(t: TFunction, method: CheckoutPaymentMethod): string {
  return method === "card" ? t("salesWorkspace.card") : t(`domain.paymentMethod.${method}`);
}

export function newSaleIdempotencyKey(): string {
  return `retail-sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Product prices are server-authored. The checkout never accepts a client price. */
export function retailPriceOf(product: SellableProduct, currency?: string): Money | undefined {
  const price = product.retailPrice;
  return price && Number.isSafeInteger(price.amount) && price.amount > 0 && (!currency || price.currency === currency) ? price : undefined;
}

export function hasSellableRetailPrice(product: SellableProduct, currency: string): boolean {
  return Boolean(retailPriceOf(product, currency));
}

export function checkoutAmount(lines: CartLine[], currency?: string): Money | undefined {
  const first = lines.find((line) => retailPriceOf(line.product, currency));
  if (!first) return undefined;
  const resolvedCurrency = retailPriceOf(first.product, currency)!.currency;
  const amount = lines.reduce((total, line) => {
    const price = retailPriceOf(line.product, resolvedCurrency);
    return total + (price?.currency === resolvedCurrency ? price.amount * line.quantity : 0);
  }, 0);
  return { amount, currency: resolvedCurrency };
}

export function availableFor(productId: string, balances: InventoryBalance[]): number {
  return balances.find((balance) => balance.productId === productId)?.availableQuantity ?? 0;
}

/** Why a product cannot go into the sale right now, in plain words. */
export function unsellableReason(product: SellableProduct, available: number, currency: string, t: TFunction = createTranslator("en")): string | undefined {
  if (product.status !== "active") return t("salesWorkspace.archived");
  if (!retailPriceOf(product, currency)) return t("salesWorkspace.unpriced");
  if (available <= 0) return t("salesWorkspace.outOfStock");
  return undefined;
}

/**
 * Name or SKU search. A scanned barcode types the SKU and presses Enter, so
 * an exact SKU match is surfaced first and `exactSkuMatch` tells the picker
 * it can add that item straight away.
 */
export function filterSellableProducts(products: SellableProduct[], search: string): { products: SellableProduct[]; exactSkuMatch?: SellableProduct } {
  const term = searchKey(search);
  const active = products.filter((product) => product.status === "active");
  if (!term) return { products: active };
  const exactSkuMatch = active.find((product) => searchKey(product.sku) === term);
  const matches = active.filter((product) => searchKey(`${product.name} ${product.sku}`).includes(term));
  return { products: exactSkuMatch ? [exactSkuMatch, ...matches.filter((product) => product.id !== exactSkuMatch.id)] : matches, exactSkuMatch };
}

export interface SaleDraft {
  branchId: string;
  lines: CartLine[];
  customer: CustomerAttachment;
  method: CheckoutPaymentMethod;
  reference: string;
}

/** Client-side pre-checks in the operator's words; the server re-validates everything. */
export function validateSaleDraft(draft: SaleDraft, inventory: InventoryBalance[], currency: string, options: { cashShiftOpen?: boolean; t?: TFunction } = {}): string | undefined {
  const t = options.t ?? createTranslator("en");
  const name = (value: string) => options.t ? isolate(value) : value;
  if (!draft.branchId) return t("salesWorkspace.chooseBranchHint");
  if (draft.lines.length === 0) return t("salesWorkspace.addAtLeastOne");
  const unpriced = draft.lines.find((line) => !retailPriceOf(line.product, currency));
  if (unpriced) return t("salesWorkspace.unpricedProduct", { name: name(unpriced.product.name) });
  const overStock = draft.lines.find((line) => line.quantity > availableFor(line.product.id, inventory));
  if (overStock) return t("salesWorkspace.onlyStock", { count: availableFor(overStock.product.id, inventory), name: name(overStock.product.name) });
  if (draft.customer.kind === "guest" && (!draft.customer.fullName.trim() || !draft.customer.phone.trim())) return t("salesWorkspace.guestRequired");
  if ((draft.method === "cliq" || draft.method === "card") && !draft.reference.trim()) return t("salesWorkspace.referenceRequired", { method: checkoutPaymentMethodLabel(t, draft.method) });
  if (draft.method === "cash" && options.cashShiftOpen === false) return t("salesWorkspace.openCashFirst");
  return undefined;
}

export function buildCheckoutInput(draft: SaleDraft, idempotencyKey: string): RetailCheckoutInput {
  const reference = draft.reference.trim();
  return {
    branchId: draft.branchId,
    ...(draft.customer.kind === "member" ? { memberId: draft.customer.member.id } : {}),
    ...(draft.customer.kind === "guest" ? { guest: { fullName: draft.customer.fullName.trim(), phone: latinDigits(draft.customer.phone.trim()) } } : {}),
    lines: draft.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    method: draft.method,
    ...(reference ? { externalReference: reference } : {}),
    idempotencyKey,
  };
}

/** A payload signature: the same draft must reuse one key so a retry replays instead of duplicating. */
export function saleDraftSignature(draft: SaleDraft): string {
  return JSON.stringify(buildCheckoutInput(draft, ""));
}
