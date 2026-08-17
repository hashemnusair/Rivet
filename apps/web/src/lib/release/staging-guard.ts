export const STAGING_ROLES = ["platform_admin", "owner", "manager", "salesperson", "receptionist", "trainer", "member", "foreign_tenant"] as const;
export type StagingRole = typeof STAGING_ROLES[number];

export const STAGING_JOURNEY_MANIFEST = {
  provisioning: ["platform_admin", "owner"],
  "owner-settings": ["owner"],
  "staff-authorization": ["owner", "manager", "salesperson", "receptionist", "trainer"],
  "trial-crm": ["manager", "salesperson", "member"],
  "membership-lifecycle": ["owner", "manager", "receptionist", "member"],
  "reception-entry": ["manager", "receptionist", "member"],
  "finance-reconciliation": ["owner", "manager", "receptionist"],
  automation: ["owner", "manager"],
  "member-portal": ["member"],
  "isolation-audit": ["platform_admin", "owner", "foreign_tenant"],
  "personal-training": ["owner", "manager", "trainer", "member"],
  "realtime-smoke": ["owner"],
} as const satisfies Record<string, readonly StagingRole[]>;

export type StagingJourney = keyof typeof STAGING_JOURNEY_MANIFEST;

export type StagingJourneyStatus = "implemented" | "credential-blocked" | "deferred" | "not-run";

/** Current release readiness; this is deliberately separate from role requirements. */
export const STAGING_JOURNEY_READINESS: Record<StagingJourney, Exclude<StagingJourneyStatus, "not-run">> = {
  provisioning: "credential-blocked",
  "owner-settings": "implemented",
  "staff-authorization": "credential-blocked",
  "trial-crm": "credential-blocked",
  "membership-lifecycle": "implemented",
  "reception-entry": "credential-blocked",
  "finance-reconciliation": "credential-blocked",
  automation: "deferred",
  "member-portal": "credential-blocked",
  "isolation-audit": "credential-blocked",
  "personal-training": "credential-blocked",
  "realtime-smoke": "implemented",
};

export type StagingGuardResult = {
  runId: string;
  convexUrl: string;
  selectedJourneys: Array<StagingJourney | "all">;
};

const LEGACY_JOURNEY_ALIASES: Readonly<Record<string, StagingJourney>> = {
  finance: "finance-reconciliation",
  pt: "personal-training",
  "core-commercial": "membership-lifecycle",
  realtime: "realtime-smoke",
};

function normalizedUrl(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

export function validateStagingEnvironment(env: Record<string, string | undefined>, baseUrl: string): StagingGuardResult {
  if (env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging") throw new Error("Staging writes require PLAYWRIGHT_TARGET_CLASSIFICATION=staging.");
  const runId = (env.PLAYWRIGHT_RUN_ID ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{5,80}$/.test(runId)) throw new Error("PLAYWRIGHT_RUN_ID must be a unique 6-81 character disposable-run marker.");
  const expectedConvex = normalizedUrl(env.PLAYWRIGHT_EXPECTED_CONVEX_URL);
  const actualConvex = normalizedUrl(env.NEXT_PUBLIC_CONVEX_URL);
  if (!expectedConvex || !actualConvex || expectedConvex !== actualConvex) throw new Error("The configured Convex URL does not match PLAYWRIGHT_EXPECTED_CONVEX_URL.");
  if (!/^https:\/\/[^/]+\.convex\.cloud$/i.test(actualConvex)) throw new Error("The staging Convex URL must be an explicit convex.cloud deployment URL.");
  const productionConvex = normalizedUrl(env.PLAYWRIGHT_PRODUCTION_CONVEX_URL);
  if (!productionConvex) throw new Error("PLAYWRIGHT_PRODUCTION_CONVEX_URL must be configured so the staging suite can prove it is not targeting Production.");
  if (productionConvex === actualConvex) throw new Error("The staging suite refuses to target the configured Production Convex deployment.");
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  const productionHosts = (env.PLAYWRIGHT_PRODUCTION_HOSTS ?? "rivetjo.com,www.rivetjo.com").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (productionHosts.includes(hostname)) throw new Error(`The staging suite refuses to write to Production host ${hostname}.`);
  const requested = (env.PLAYWRIGHT_STAGING_JOURNEYS ?? "all").split(",").map((item) => item.trim()).filter(Boolean);
  const selectedJourneys = (requested.length ? requested : ["all"]).map((requestedJourney) => {
    if (requestedJourney === "all") return "all" as const;
    const journey = LEGACY_JOURNEY_ALIASES[requestedJourney] ?? requestedJourney;
    if (!(journey in STAGING_JOURNEY_MANIFEST)) throw new Error(`Unknown staging journey \"${requestedJourney}\". Use one of: ${Object.keys(STAGING_JOURNEY_MANIFEST).join(", ")}, or all.`);
    return journey as StagingJourney;
  });
  return { runId, convexUrl: actualConvex, selectedJourneys: [...new Set(selectedJourneys)] };
}

export function stagingJourneySelected(selected: Array<StagingJourney | "all">, journey: StagingJourney): boolean {
  return selected.includes("all") || selected.includes(journey);
}

export function stagingJourneyStatus(selected: Array<StagingJourney | "all">, journey: StagingJourney): StagingJourneyStatus {
  if (!stagingJourneySelected(selected, journey)) return "not-run";
  return STAGING_JOURNEY_READINESS[journey];
}

export function stagingJourneyRoles(journey: StagingJourney): readonly StagingRole[] {
  return STAGING_JOURNEY_MANIFEST[journey];
}

export function storageStateEnvironmentKey(role: StagingRole): string {
  return `PLAYWRIGHT_CLERK_STORAGE_${role.toUpperCase()}`;
}
