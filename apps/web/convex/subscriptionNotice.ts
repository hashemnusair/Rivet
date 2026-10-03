import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { DAY_MS, SUSPENSION_AFTER_DUE_DAYS } from "./subscriptionTerm";

type ReadContext = QueryCtx | MutationCtx;

/**
 * What a gym's owner and managers are told about money owed to RIVET. A
 * past-due gym keeps full access through the agreement's notice period; the
 * notice is how they learn the amount and the day access may be suspended.
 */
export interface SubscriptionNotice {
  kind: "past_due" | "trial_ended";
  /** Everything still unpaid on RIVET invoices, in minor units. */
  amountMinor?: number;
  currency?: string;
  /** The earliest unpaid due date, which starts the suspension clock. */
  dueAt?: number;
  /** When access may be suspended: 21 days after that due date. */
  suspendsAt?: number;
  trialEndedAt?: number;
}

const UNPAID = new Set(["draft", "open", "past_due"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * The notice from an organization's status, trial end and RIVET invoices.
 * Pure, so the mock adapter tells a gym the same thing Convex does.
 */
export function subscriptionNoticeFrom(organization: { status: string; trialEndsAt?: number }, invoiceRows: readonly unknown[], now: number): SubscriptionNotice | undefined {
  const trialEnded = organization.status === "trial" && organization.trialEndsAt !== undefined && organization.trialEndsAt <= now;
  if (organization.status !== "past_due" && !trialEnded) return undefined;
  const invoices = invoiceRows.map(record).filter((invoice) => UNPAID.has(String(invoice.status)));
  let amountMinor = 0;
  let currency: string | undefined;
  let dueAt: number | undefined;
  for (const invoice of invoices) {
    if (typeof invoice.amountMinor === "number" && Number.isFinite(invoice.amountMinor)) amountMinor += invoice.amountMinor;
    currency ??= typeof invoice.currency === "string" ? invoice.currency : undefined;
    const due = Date.parse(String(invoice.dueAt ?? ""));
    if (Number.isFinite(due)) dueAt = dueAt === undefined ? due : Math.min(dueAt, due);
  }
  return {
    kind: organization.status === "past_due" ? "past_due" : "trial_ended",
    ...(invoices.length > 0 ? { amountMinor, currency: currency ?? "JOD" } : {}),
    ...(dueAt === undefined ? {} : { dueAt, suspendsAt: dueAt + SUSPENSION_AFTER_DUE_DAYS * DAY_MS }),
    ...(trialEnded ? { trialEndedAt: organization.trialEndsAt } : {}),
  };
}

export async function subscriptionNoticeFor(ctx: ReadContext, organization: Doc<"organizations">, now: number): Promise<SubscriptionNotice | undefined> {
  const trialEnded = organization.status === "trial" && organization.trialEndsAt !== undefined && organization.trialEndsAt <= now;
  if (organization.status !== "past_due" && !trialEnded) return undefined;
  const invoices = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice"))
    .collect();
  return subscriptionNoticeFrom(organization, invoices.map((row) => row.data), now);
}
