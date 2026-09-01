import type { FinancialPostingStatus } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";

/**
 * "Recorded" and "posted" are two different facts. A payment is recorded the
 * moment staff save it; it reaches the management ledger only when the
 * accounting queue posts it. The badge never blurs the two.
 */
export function ledgerStatusLabel(status: FinancialPostingStatus | undefined): string {
  switch (status) {
    case "posted": return "Posted to ledger";
    case "reversed": return "Reversed in ledger";
    case "pending": return "Awaiting ledger posting";
    case "failed": return "Ledger posting failed";
    default: return "Not posted to ledger yet";
  }
}

export function LedgerStatusBadge({ status, className }: { status: FinancialPostingStatus | undefined; className?: string }) {
  const variant = status === "posted" ? "success" : status === "reversed" || status === "failed" ? "danger" : status === "pending" ? "warning" : "outline";
  return <Badge variant={variant} dot className={className}>{ledgerStatusLabel(status)}</Badge>;
}
