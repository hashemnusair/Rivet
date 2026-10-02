import LeadDetailPageClient from "./lead-detail.client";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";

export default function LeadDetailPage() {
  return <WorkspaceModuleBoundary moduleKey="revenue"><LeadDetailPageClient /></WorkspaceModuleBoundary>;
}
