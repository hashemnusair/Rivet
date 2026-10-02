import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { entitledModulesForPlan, entitledModulesForPlanSelection } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleKey } from "@/lib/domain/types";

type GymPlan = PlatformSaasPlan["name"];

const workspaceModuleLabels: Record<WorkspaceModuleKey, string> = {
  foundation: "Gym foundation",
  revenue: "Revenue protection",
  operations: "Daily operations",
  finance: "Financial operating system",
  reporting: "Management reporting",
};

function selectedWorkspaceModules(plan: Pick<PlatformSaasPlan, "name" | "entitledModules">): WorkspaceModuleKey[] {
  return entitledModulesForPlanSelection(plan.name, plan.entitledModules);
}

/** Resolve the human-readable capability list from the canonical module contract. */
export function workspaceFeatureLabels(plan: GymPlan | Pick<PlatformSaasPlan, "name" | "entitledModules">): string[] {
  const modules = typeof plan === "string" ? entitledModulesForPlan(plan) : selectedWorkspaceModules(plan);
  return modules.map((key) => workspaceModuleLabels[key]);
}

/** Resolve capabilities for a live catalog plan, including explicit overrides. */
export function workspaceFeatureLabelsForPlan(plan: Pick<PlatformSaasPlan, "name" | "entitledModules">): string[] {
  return selectedWorkspaceModules(plan).map((key) => workspaceModuleLabels[key]);
}
