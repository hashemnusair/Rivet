"use client";

import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { PayablesWorkspace } from "@/features/operations/payables/payables-workspace";

export default function PayablesPage() {
  return (
    <WorkspaceModuleBoundary moduleKey="operations">
      <PayablesWorkspace />
    </WorkspaceModuleBoundary>
  );
}
