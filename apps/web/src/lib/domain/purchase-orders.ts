import { isCalendarDate } from "../utils/dates";

/** Delivery dates are gym-local calendar dates, independent of invoice due dates. */
export function validExpectedDeliveryDate(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  return isCalendarDate(value);
}

export function purchaseOrderIsOverdue(order: { status: string; expectedDeliveryDate?: string }, today: string): boolean {
  return ["approved", "partially_received"].includes(order.status) && Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate < today);
}
