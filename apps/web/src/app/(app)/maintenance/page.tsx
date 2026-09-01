"use client";

import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { MaintenanceWorkspace } from "@/features/operations/maintenance-workspace";

export default function MaintenancePage() {
  return (
    <WorkspaceModuleBoundary moduleKey="operations">
      <MaintenanceWorkspace />
    </WorkspaceModuleBoundary>
  );
}
