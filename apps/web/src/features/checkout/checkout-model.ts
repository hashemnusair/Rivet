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
export const CHECKOUT_PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = { cash: "Cash", cliq: "CliQ", card: "Visa / card" };

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
export function unsellableReason(product: SellableProduct, available: number, currency: string): string | undefined {
  if (product.status !== "active") return "Archived";
  if (!retailPriceOf(product, currency)) return "No selling price";
  if (available <= 0) return "Out of stock";
  return undefined;
}

/**
 * Name or SKU search. A scanned barcode types the SKU and presses Enter, so
 * an exact SKU match is surfaced first and `exactSkuMatch` tells the picker
 * it can add that item straight away.
 */
export function filterSellableProducts(products: SellableProduct[], search: string): { products: SellableProduct[]; exactSkuMatch?: SellableProduct } {
  const term = search.trim().toLowerCase();
  const active = products.filter((product) => product.status === "active");
  if (!term) return { products: active };
  const exactSkuMatch = active.find((product) => product.sku.toLowerCase() === term);
  const matches = active.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(term));
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
export function validateSaleDraft(draft: SaleDraft, inventory: InventoryBalance[], currency: string, options: { cashShiftOpen?: boolean } = {}): string | undefined {
  if (!draft.branchId) return "Choose the branch you are selling from.";
  if (draft.lines.length === 0) return "Add at least one priced item to the sale.";
  const unpriced = draft.lines.find((line) => !retailPriceOf(line.product, currency));
  if (unpriced) return `${unpriced.product.name} has no selling price.`;
  const overStock = draft.lines.find((line) => line.quantity > availableFor(line.product.id, inventory));
  if (overStock) return `${overStock.product.name} has only ${availableFor(overStock.product.id, inventory)} available.`;
  if (draft.customer.kind === "guest" && (!draft.customer.fullName.trim() || !draft.customer.phone.trim())) return "Add the receipt name and phone number, or remove the receipt details.";
  if ((draft.method === "cliq" || draft.method === "card") && !draft.reference.trim()) return `A reference number is required for ${CHECKOUT_PAYMENT_METHOD_LABELS[draft.method]}.`;
  if (draft.method === "cash" && options.cashShiftOpen === false) return "Open a cash shift at this branch before taking cash.";
  return undefined;
}

export function buildCheckoutInput(draft: SaleDraft, idempotencyKey: string): RetailCheckoutInput {
  const reference = draft.reference.trim();
  return {
    branchId: draft.branchId,
    ...(draft.customer.kind === "member" ? { memberId: draft.customer.member.id } : {}),
    ...(draft.customer.kind === "guest" ? { guest: { fullName: draft.customer.fullName.trim(), phone: draft.customer.phone.trim() } } : {}),
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
