/**
 * Runtime-created receipts cannot have their own HTML file under a static
 * export. Route in-app receipt links through one prebuilt page and carry the
 * in-memory receipt id in the URL fragment instead.
 */
export function receiptHref(receiptId: string): string {
  return `/payments/receipts/view#${encodeURIComponent(receiptId)}`;
}
