/** Delivery dates are gym-local calendar dates, independent of invoice due dates. */
export function validExpectedDeliveryDate(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function purchaseOrderIsOverdue(order: { status: string; expectedDeliveryDate?: string }, today: string): boolean {
  return ["approved", "partially_received"].includes(order.status) && Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate < today);
}
