/**
 * Server-owned workspace capability catalog. Keep this file free of client
 * input and treat catalog version changes as migrations of the entitlement
 * contract. No music/signage or other speculative modules belong here.
 */

export const WORKSPACE_MODULE_CATALOG_VERSION = 2;

export type WorkspaceModuleKey = "foundation" | "revenue" | "operations" | "finance" | "reporting";
export type WorkspaceModulePlan = "Starter" | "Growth" | "Pro" | "Enterprise";

export interface WorkspaceModuleCatalogEntry {
  key: WorkspaceModuleKey;
  version: number;
  label: string;
  description: string;
  dependencies: WorkspaceModuleKey[];
  required: boolean;
  configurable: boolean;
  availableOn: WorkspaceModulePlan[];
  routePrefixes: string[];
}

export const WORKSPACE_MODULE_CATALOG: readonly WorkspaceModuleCatalogEntry[] = [
  {
    key: "foundation",
    version: 1,
    label: "Gym foundation",
    description: "Members, branches, identity, permissions, settings, and the shared timeline.",
    dependencies: [],
    required: true,
    configurable: false,
    availableOn: ["Starter", "Growth", "Pro", "Enterprise"],
    routePrefixes: ["/dashboard", "/members", "/reception", "/payments", "/reports", "/settings"],
  },
  {
    key: "revenue",
    version: 1,
    label: "Revenue protection",
    description: "Leads, renewal journeys, follow-ups, offers, and accountable sales actions.",
    dependencies: ["foundation"],
    required: false,
    configurable: true,
    availableOn: ["Starter", "Growth", "Pro", "Enterprise"],
    routePrefixes: ["/crm", "/memberships"],
  },
  {
    key: "operations",
    version: 1,
    label: "Daily operations",
    description: "Inventory, checkout, suppliers, purchase orders, and machines.",
    dependencies: ["foundation"],
    required: false,
    configurable: true,
    availableOn: ["Growth", "Pro", "Enterprise"],
    routePrefixes: ["/operations", "/inventory", "/equipment"],
  },
  {
    key: "finance",
    version: 1,
    label: "Financial operating system",
    description: "Purchasing, expenses, assets, ledger entries, reconciliation, and cash control.",
    dependencies: ["foundation", "operations"],
    required: false,
    configurable: true,
    availableOn: ["Pro", "Enterprise"],
    routePrefixes: ["/finance/controls"],
  },
  {
    key: "reporting",
    version: 1,
    label: "Management reporting",
    description: "Financial statements, branch analysis, budgets, and owner/GM decision support.",
    dependencies: ["finance"],
    required: false,
    configurable: true,
    availableOn: ["Pro", "Enterprise"],
    routePrefixes: ["/finance", "/reports/statements"],
  },
] as const;

const CATALOG_KEYS = new Set<WorkspaceModuleKey>(WORKSPACE_MODULE_CATALOG.map((entry) => entry.key));

export function allWorkspaceModuleKeys(): WorkspaceModuleKey[] {
  return WORKSPACE_MODULE_CATALOG.map((entry) => entry.key);
}

export function entitledModulesForPlan(plan?: WorkspaceModulePlan): WorkspaceModuleKey[] {
  // Organizations created before the entitlement table existed retain access
  // to all existing/current surfaces until platform billing sets a plan.
  if (!plan) return WORKSPACE_MODULE_CATALOG.map((entry) => entry.key);
  return WORKSPACE_MODULE_CATALOG.filter((entry) => entry.availableOn.includes(plan)).map((entry) => entry.key);
}

/** Resolve a persisted platform catalog selection with a safe default. */
export function entitledModulesForPlanSelection(plan: WorkspaceModulePlan, selection?: readonly unknown[]): WorkspaceModuleKey[] {
  const defaults = entitledModulesForPlan(plan);
  if (selection === undefined) return defaults;
  try {
    return validateWorkspaceModuleSelection(selection, allWorkspaceModuleKeys());
  } catch {
    return defaults;
  }
}

export function defaultWorkspacePreferences(entitledModules: readonly WorkspaceModuleKey[]): WorkspaceModuleKey[] {
  return WORKSPACE_MODULE_CATALOG.filter((entry) => entitledModules.includes(entry.key)).map((entry) => entry.key);
}

export function validateWorkspaceModuleSelection(enabledModules: readonly unknown[], entitledModules: readonly WorkspaceModuleKey[]): WorkspaceModuleKey[] {
  const values = enabledModules.map((value) => typeof value === "string" ? value : "").filter(Boolean);
  const unique = [...new Set(values)];
  const unknown = unique.filter((key) => !CATALOG_KEYS.has(key as WorkspaceModuleKey));
  if (unknown.length > 0) throw new Error(`Unknown workspace module: ${unknown.join(", ")}`);
  const notEntitled = unique.filter((key) => !entitledModules.includes(key as WorkspaceModuleKey));
  if (notEntitled.length > 0) throw new Error(`Workspace module is not included in this plan: ${notEntitled.join(", ")}`);
  const selected = new Set(unique as WorkspaceModuleKey[]);
  for (const entry of WORKSPACE_MODULE_CATALOG) {
    if (entry.required && !selected.has(entry.key)) throw new Error(`Required workspace module is disabled: ${entry.key}`);
    if (!selected.has(entry.key)) continue;
    const missing = entry.dependencies.filter((dependency) => !selected.has(dependency));
    if (missing.length > 0) throw new Error(`${entry.key} requires ${missing.join(", ")}`);
  }
  return WORKSPACE_MODULE_CATALOG.filter((entry) => selected.has(entry.key)).map((entry) => entry.key);
}

/**
 * Server-owned entitlement snapshots. Once an organization has an explicit
 * subscription plan, that plan is authoritative and the entitlement row is a
 * materialized projection. This prevents a stale row from granting or
 * withholding modules during a plan transition. The row remains the
 * compatibility source for tenants created before the plan field/table
 * existed. Preferences stay separate and can only enable an entitled module.
 */
export interface StoredWorkspaceEntitlement {
  subscriptionPlan?: WorkspaceModulePlan;
  entitledModules?: readonly unknown[];
  source?: "subscription_plan" | "legacy_default";
  updatedAt?: number;
}

export interface StoredWorkspacePreferences {
  enabledModules?: readonly unknown[];
  updatedAt?: number;
  updatedById?: string;
}

export interface WorkspaceEntitlementState {
  catalogVersion: number;
  subscriptionPlan?: WorkspaceModulePlan;
  entitledModules: WorkspaceModuleKey[];
  source: "subscription_plan" | "legacy_default";
  updatedAt?: number;
}

export interface WorkspacePreferenceState {
  catalogVersion: number;
  enabledModules: WorkspaceModuleKey[];
  updatedAt?: number;
  updatedById?: string;
}

export interface WorkspaceModuleRequirementAccess {
  entitledModules: readonly WorkspaceModuleKey[];
  enabledModules: readonly WorkspaceModuleKey[];
}

export function resolveWorkspaceEntitlements(
  plan?: WorkspaceModulePlan,
  stored?: StoredWorkspaceEntitlement,
  catalogSelection?: readonly unknown[],
): WorkspaceEntitlementState {
  const candidate = plan
    ? entitledModulesForPlanSelection(plan, catalogSelection)
    : stored?.entitledModules ?? entitledModulesForPlan();
  const candidateSet = new Set(candidate.filter((module): module is WorkspaceModuleKey => typeof module === "string" && CATALOG_KEYS.has(module as WorkspaceModuleKey)));
  return {
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    subscriptionPlan: plan ?? stored?.subscriptionPlan,
    entitledModules: WORKSPACE_MODULE_CATALOG.filter((entry) => candidateSet.has(entry.key)).map((entry) => entry.key),
    source: plan ? "subscription_plan" : stored?.source ?? "legacy_default",
    updatedAt: stored?.updatedAt,
  };
}

export function resolveWorkspacePreferences(entitledModules: readonly WorkspaceModuleKey[], stored?: StoredWorkspacePreferences): WorkspacePreferenceState {
  const candidate = stored?.enabledModules ?? defaultWorkspacePreferences(entitledModules);
  let enabledModules: WorkspaceModuleKey[];
  try {
    enabledModules = validateWorkspaceModuleSelection(candidate, entitledModules);
  } catch {
    // A stale preference set after a downgrade must never grant a module or
    // make the tenant unusable. Fall back to the current entitled defaults.
    enabledModules = defaultWorkspacePreferences(entitledModules);
  }
  return {
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    enabledModules,
    updatedAt: stored?.updatedAt,
    updatedById: stored?.updatedById,
  };
}

export function requireWorkspaceModule(moduleKey: WorkspaceModuleKey, access: WorkspaceModuleRequirementAccess): void {
  const entry = WORKSPACE_MODULE_CATALOG.find((candidate) => candidate.key === moduleKey);
  const entitled = access.entitledModules.includes(moduleKey);
  const enabled = access.enabledModules.includes(moduleKey);
  const missingDependency = entry?.dependencies.find((dependency) => !access.enabledModules.includes(dependency));
  if (!entry || !entitled || !enabled || missingDependency) {
    throw new Error(`The ${moduleKey} workspace module is not enabled for this organization.`);
  }
}

export function buildWorkspaceAccess(
  organizationId: string,
  entitlements: { catalogVersion: number; subscriptionPlan?: WorkspaceModulePlan; entitledModules: WorkspaceModuleKey[]; source: "subscription_plan" | "legacy_default"; updatedAt?: string },
  preferences: { catalogVersion: number; enabledModules: WorkspaceModuleKey[]; updatedAt?: string; updatedById?: string },
) {
  const modules = WORKSPACE_MODULE_CATALOG.map((entry) => {
    const entitled = entitlements.entitledModules.includes(entry.key);
    const enabled = entitled && preferences.enabledModules.includes(entry.key);
    const dependencyDisabled = enabled && entry.dependencies.some((dependency) => !preferences.enabledModules.includes(dependency));
    return {
      ...entry,
      dependencies: [...entry.dependencies],
      availableOn: [...entry.availableOn],
      routePrefixes: [...entry.routePrefixes],
      entitled,
      enabled,
      lockedReason: !entitled ? "not_entitled" as const : dependencyDisabled ? "dependency_disabled" as const : entry.required ? "required" as const : undefined,
    };
  });
  return {
    organizationId,
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    catalog: WORKSPACE_MODULE_CATALOG.map((entry) => ({ ...entry, dependencies: [...entry.dependencies], availableOn: [...entry.availableOn], routePrefixes: [...entry.routePrefixes] })),
    entitlements: { organizationId, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: entitlements.subscriptionPlan, entitledModules: [...entitlements.entitledModules], source: entitlements.source, updatedAt: entitlements.updatedAt },
    preferences: { organizationId, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules: [...preferences.enabledModules], updatedAt: preferences.updatedAt, updatedById: preferences.updatedById },
    modules,
  };
}
