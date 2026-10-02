"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ManagementLedgerWorkspace } from "@/features/finance/management-ledger-workspace";

/**
 * Advanced posting and period controls remain available to owners/managers,
 * but are intentionally kept outside the everyday three-statement screen.
 */
export default function FinanceControlsPage() {
  return <div className="space-y-4">
    <Link href="/finance" className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">
      <ArrowLeft className="size-3.5" aria-hidden /> Back to statements
    </Link>
    <ManagementLedgerWorkspace />
  </div>;
}
