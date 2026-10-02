import type { FinancialPostingStatus } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/provider";
import { ledgerStatusLabel } from "@/lib/i18n/payables";
export { ledgerStatusLabel } from "@/lib/i18n/payables";

/** Recording a payment and posting it to the accounts are separate facts. */
export function LedgerStatusBadge({ status, className }: { status: FinancialPostingStatus | undefined; className?: string }) {
  const t = useT();
  const variant = status === "posted" ? "success" : status === "reversed" || status === "failed" ? "danger" : status === "pending" ? "warning" : "outline";
  return <Badge variant={variant} dot className={className}>{ledgerStatusLabel(status, t)}</Badge>;
}
