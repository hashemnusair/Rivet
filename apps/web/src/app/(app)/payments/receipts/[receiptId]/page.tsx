import { receiptIds } from "@/lib/mock/prerender-ids";
import ReceiptPageClient from "./receipt.client";

/**
 * Server shell. Exists only to hold `generateStaticParams()`, which a
 * "use client" file may not export — the whole view is client-rendered below.
 *
 * In mock mode the demo tenant is rebuilt from a deterministic seed on every
 * cold load, so prerendering the seeded ids covers every id that can resolve on
 * a fresh request. See lib/mock/prerender-ids.ts.
 */
export function generateStaticParams() {
  return receiptIds().map((receiptId) => ({ receiptId }));
}

export default function ReceiptPage() {
  return <ReceiptPageClient />;
}
