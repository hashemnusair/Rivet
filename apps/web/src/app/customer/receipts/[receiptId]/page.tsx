import CustomerReceiptClient from "./receipt.client";

export const dynamicParams = true;

export default async function CustomerReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  return <CustomerReceiptClient receiptId={receiptId} />;
}
