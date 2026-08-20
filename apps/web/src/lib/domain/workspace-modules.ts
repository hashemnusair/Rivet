import type {
  OrganizationEntitlements,
  WorkspaceAccess,
  WorkspaceModuleCatalogEntry,
  WorkspaceModuleKey,
  WorkspaceModulePlan,
  WorkspaceModulePreferences,
  WorkspaceModuleStatus,
} from "./types";

/** Increment only when the module contract or dependency graph changes. */
export const WORKSPACE_MODULE_CATALOG_VERSION = 1;

export const WORKSPACE_MODULE_CATALOG: readonly WorkspaceModuleCatalogEntry[] = [
  {
    key: "foundation",
    version: 1,
    label: "Gym foundation",
    description: "Members, branches, identity, permissions, settings, and the shared timeline.",
    dependencies: [],
    required: true,
    configurable: false,
    availableOn: ["Starter", "Growth", "Pro"],
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
    availableOn: ["Starter", "Growth", "Pro"],
    routePrefixes: ["/crm", "/memberships"],
  },
  {
    key: "operations",
    version: 1,
    label: "Daily operations",
    description: "Cleaning, facilities, equipment, inventory, suppliers, and branch work queues.",
    dependencies: ["foundation"],
    required: false,
    configurable: true,
    availableOn: ["Growth", "Pro"],
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
    availableOn: ["Pro"],
    routePrefixes: ["/finance"],
  },
  {
    key: "reporting",
    version: 1,
    label: "Management reporting",
    description: "Financial statements, branch analysis, budgets, and owner/GM decision support.",
    dependencies: ["finance"],
    required: false,
    configurable: true,
    availableOn: ["Pro"],
    routePrefixes: ["/reports/statements"],
  },
] as const;

const CATALOG_KEYS = new Set<WorkspaceModuleKey>(WORKSPACE_MODULE_CATALOG.map((entry) => entry.key));

export function catalogEntry(key: WorkspaceModuleKey): WorkspaceModuleCatalogEntry {
  const entry = WORKSPACE_MODULE_CATALOG.find((catalogEntry) => catalogEntry.key === key);
  if (!entry) throw new Error(`Unknown workspace module: ${key}`);
  return entry;
}

/**
 * Missing subscription plans are legacy tenants created before entitlements
 * existed. Keep those tenants fully operational until an explicit plan is
 * present; this is the compatibility path, not a client-controlled grant.
 */
export function entitledModulesForPlan(plan?: WorkspaceModulePlan): WorkspaceModuleKey[] {
  if (!plan) return WORKSPACE_MODULE_CATALOG.map((entry) => entry.key);
  return WORKSPACE_MODULE_CATALOG
    .filter((entry) => entry.availableOn.includes(plan))
    .map((entry) => entry.key);
}

export function defaultWorkspacePreferences(entitledModules: readonly WorkspaceModuleKey[]): WorkspaceModuleKey[] {
  return WORKSPACE_MODULE_CATALOG
    .filter((entry) => entitledModules.includes(entry.key))
    .map((entry) => entry.key);
}

export function validateWorkspaceModuleSelection(
  enabledModules: readonly unknown[],
  entitledModules: readonly WorkspaceModuleKey[],
): WorkspaceModuleKey[] {
  const values = enabledModules
    .filter((value): value is string => typeof value === "string" && value.length > 0);
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

  return WORKSPACE_MODULE_CATALOG
    .filter((entry) => selected.has(entry.key))
    .map((entry) => entry.key);
}

export function workspaceModuleStatus(
  entry: WorkspaceModuleCatalogEntry,
  entitledModules: readonly WorkspaceModuleKey[],
  enabledModules: readonly WorkspaceModuleKey[],
): WorkspaceModuleStatus {
  const entitled = entitledModules.includes(entry.key);
  const enabled = entitled && enabledModules.includes(entry.key);
  const dependencyDisabled = enabled && entry.dependencies.some((dependency) => !enabledModules.includes(dependency));
  return {
    ...entry,
    dependencies: [...entry.dependencies],
    availableOn: [...entry.availableOn],
    routePrefixes: [...entry.routePrefixes],
    entitled,
    enabled,
    lockedReason: !entitled ? "not_entitled" : dependencyDisabled ? "dependency_disabled" : entry.required ? "required" : undefined,
  };
}

export function buildWorkspaceAccess(
  entitlements: OrganizationEntitlements,
  preferences: WorkspaceModulePreferences,
): WorkspaceAccess {
  return {
    catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
    catalog: WORKSPACE_MODULE_CATALOG.map((entry) => ({
      ...entry,
      dependencies: [...entry.dependencies],
      availableOn: [...entry.availableOn],
      routePrefixes: [...entry.routePrefixes],
    })),
    entitlements: {
      ...entitlements,
      entitledModules: [...entitlements.entitledModules],
    },
    preferences: {
      ...preferences,
      enabledModules: [...preferences.enabledModules],
    },
    modules: WORKSPACE_MODULE_CATALOG.map((entry) => workspaceModuleStatus(entry, entitlements.entitledModules, preferences.enabledModules)),
  };
}
