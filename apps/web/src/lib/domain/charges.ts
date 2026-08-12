import type { Charge } from "@/lib/domain/types";

type ChargeLike = Pick<Charge, "createdAt" | "outstandingAmount" | "status"> &
  Partial<Pick<Charge, "issueDate" | "dueDate">>;

/**
 * Legacy charges predate explicit invoice dates. Treat their creation date as
 * both the issue and due date so existing balances remain collectible.
 */
export function chargeIssueDate(charge: ChargeLike): string {
  return charge.issueDate ?? charge.createdAt.slice(0, 10);
}

export function chargeDueDate(charge: ChargeLike): string {
  return charge.dueDate ?? chargeIssueDate(charge);
}

export function chargeIsCollectible(charge: ChargeLike, today: string): boolean {
  if (charge.status === "refunded" || charge.status === "void") return false;
  return chargeDueDate(charge) <= today;
}

export function collectibleOutstandingMinor(charge: ChargeLike, today: string): number {
  return chargeIsCollectible(charge, today) ? Math.max(0, charge.outstandingAmount.amount) : 0;
}
