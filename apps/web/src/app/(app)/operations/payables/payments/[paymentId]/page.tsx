"use client";

import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { SupplierPaymentConfirmation } from "@/features/operations/payables/supplier-payment-confirmation";

export default function SupplierPaymentConfirmationPage() {
  return (
    <WorkspaceModuleBoundary moduleKey="operations">
      <SupplierPaymentConfirmation />
    </WorkspaceModuleBoundary>
  );
}
