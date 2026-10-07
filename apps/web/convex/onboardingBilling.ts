import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** One setup charge per new gym, carried forward if its invoice was voided. */
export async function pendingOnboardingFee(ctx: MutationCtx | QueryCtx, organization: Doc<"organizations">): Promise<number> {
  const fee = organization.onboardingFeeMinor;
  if (fee === undefined || !Number.isSafeInteger(fee) || fee <= 0) return 0;
  const invoices = await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice")).collect();
  const alreadyBilled = invoices.some(row => {
    const invoice = row.data as Record<string, unknown>;
    return invoice.status !== "void" && typeof invoice.onboardingFeeMinor === "number" && invoice.onboardingFeeMinor > 0;
  });
  return alreadyBilled ? 0 : fee;
}
