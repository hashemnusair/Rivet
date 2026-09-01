import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ActorContext } from "./security";

type ReadContext = QueryCtx | MutationCtx;

export interface SupplierCashShiftMovements {
  /** Cash handed to suppliers from the drawer during this shift. */
  paidMinor: number;
  /** Cash returned to the drawer during this shift by reversing a cash payment. */
  reversedMinor: number;
  paymentCount: number;
  reversalCount: number;
}

/**
 * Supplier cash is part of the authoritative drawer story. Money leaves the
 * drawer during the shift that funded the payment and comes back during the
 * shift that recorded the reversal, which may be a later shift; both sides
 * are counted where they physically happened so no shift closes on a number
 * the drawer cannot match.
 */
export async function supplierCashShiftMovements(ctx: ReadContext, actor: ActorContext, shiftPublicId: string): Promise<SupplierCashShiftMovements> {
  const funded = await ctx.db.query("supplierPayments").withIndex("by_organization_shift", (q) => q.eq("organizationId", actor.organization._id).eq("shiftPublicId", shiftPublicId)).collect();
  const returned = await ctx.db.query("supplierPayments").withIndex("by_organization_reversal_shift", (q) => q.eq("organizationId", actor.organization._id).eq("reversalShiftPublicId", shiftPublicId)).collect();
  const paid = funded.filter((payment) => payment.method === "cash");
  const reversed = returned.filter((payment) => payment.method === "cash" && payment.status === "reversed");
  return {
    paidMinor: paid.reduce((sum, payment) => sum + payment.amountMinor, 0),
    reversedMinor: reversed.reduce((sum, payment) => sum + payment.amountMinor, 0),
    paymentCount: paid.length,
    reversalCount: reversed.length,
  };
}
