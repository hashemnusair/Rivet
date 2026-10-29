import type { CustomerTransactionQuery } from "@/lib/domain/qol";

/**
 * The member's Payments list query. The page and the dock's warm-up both build
 * it here so their cache keys are the same.
 */
export function customerTransactionQuery(filters: Omit<CustomerTransactionQuery, "pageSize" | "sort">): CustomerTransactionQuery {
  return { ...filters, page: filters.page ?? 1, pageSize: 20, sort: "-occurredAt" };
}
