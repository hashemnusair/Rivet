import type { JevBlockReason } from "./jevRegistry";

/**
 * Jev switches. Everything is off unless an operator turns it on, and live
 * calls need every one of these to agree:
 *
 *   RIVET_JEV_MODE = off | fixture | live      (default off)
 *     off      no judgments at all; every suggestion surface stays hidden
 *     fixture  no external calls; answers come from the registered synthetic
 *              fixtures (previews, tests, demos)
 *     live     Vercel AI Gateway, model typesafe-ai/jev only
 *   RIVET_JEV_FEATURES        comma list of feature keys allowed to call live
 *                             (for example `foundation,crm`); empty means none
 *   RIVET_JEV_FREE_UNTIL      YYYY-MM-DD, the last UTC day the operator has
 *                             confirmed Jev is free on the account; live calls
 *                             stop when it is missing, malformed or in the past
 *   RIVET_JEV_DAILY_CAP       live requests per UTC day across all gyms (200)
 *   RIVET_JEV_TENANT_DAILY_CAP live requests per gym per UTC day (50)
 *   RIVET_JEV_ZERO_DATA_RETENTION=1 asks the gateway for zero-data-retention
 *                             routing (Pro and Enterprise teams only)
 *   AI_GATEWAY_API_KEY        Convex-only secret; only its presence is read
 *
 * A gym must also switch suggestions on for itself (Settings → Jev
 * assistance), and a zero-cost breaker stops live calls the moment the
 * gateway reports a billed request. No Convex imports: shared with the
 * preview adapter and tests.
 */
export const JEV_MODES = ["off", "fixture", "live"] as const;
export type JevMode = (typeof JEV_MODES)[number];
export type JevFreeTerms = "confirmed" | "unconfirmed" | "expired" | "invalid";

export const JEV_DEFAULT_DAILY_CAP = 200;
export const JEV_DEFAULT_TENANT_DAILY_CAP = 50;

type Env = Record<string, string | undefined>;

export interface JevModeResolution {
  mode: JevMode;
  source: "RIVET_JEV_MODE" | "default";
  /** Whether AI_GATEWAY_API_KEY is present. The value is never read into memory beyond this boolean. */
  keyConfigured: boolean;
  features: string[];
  freeUntil?: string;
  freeTerms: JevFreeTerms;
  dailyCap: number;
  tenantDailyCap: number;
  zeroDataRetention: boolean;
  warnings: string[];
}

export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function parseCap(raw: string | undefined, fallback: number, name: string, warnings: string[]): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 0) {
    warnings.push(`${name} "${raw}" is not a non-negative integer; using ${fallback}.`);
    return fallback;
  }
  return value;
}

export function resolveJevMode(env: Env = process.env, now: number = Date.now()): JevModeResolution {
  const warnings: string[] = [];
  const raw = env.RIVET_JEV_MODE?.trim().toLowerCase();
  let mode: JevMode = "off";
  let source: JevModeResolution["source"] = "default";
  if (raw) {
    if ((JEV_MODES as readonly string[]).includes(raw)) {
      mode = raw as JevMode;
      source = "RIVET_JEV_MODE";
    } else {
      warnings.push(`RIVET_JEV_MODE "${raw}" is not one of ${JEV_MODES.join(", ")}; Jev stays off.`);
    }
  }
  const features = (env.RIVET_JEV_FEATURES ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const freeUntilRaw = env.RIVET_JEV_FREE_UNTIL?.trim();
  let freeUntil: string | undefined;
  let freeTerms: JevFreeTerms = "unconfirmed";
  if (freeUntilRaw) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(freeUntilRaw) && !Number.isNaN(Date.parse(`${freeUntilRaw}T00:00:00Z`))) {
      freeUntil = freeUntilRaw;
      freeTerms = utcDay(now) <= freeUntilRaw ? "confirmed" : "expired";
    } else {
      freeTerms = "invalid";
      warnings.push(`RIVET_JEV_FREE_UNTIL "${freeUntilRaw}" is not a YYYY-MM-DD date; live calls stay off.`);
    }
  }
  if (mode === "live" && features.length === 0) warnings.push("RIVET_JEV_MODE is live but RIVET_JEV_FEATURES is empty; no feature may call the model.");
  return {
    mode,
    source,
    keyConfigured: Boolean(env.AI_GATEWAY_API_KEY?.trim()),
    features,
    freeUntil,
    freeTerms,
    dailyCap: parseCap(env.RIVET_JEV_DAILY_CAP, JEV_DEFAULT_DAILY_CAP, "RIVET_JEV_DAILY_CAP", warnings),
    tenantDailyCap: parseCap(env.RIVET_JEV_TENANT_DAILY_CAP, JEV_DEFAULT_TENANT_DAILY_CAP, "RIVET_JEV_TENANT_DAILY_CAP", warnings),
    zeroDataRetention: env.RIVET_JEV_ZERO_DATA_RETENTION?.trim() === "1",
    warnings,
  };
}

export const JEV_BLOCK_MESSAGES: Record<JevBlockReason, string> = {
  mode_off: "Jev suggestions are switched off for this RIVET environment.",
  feature_off: "This suggestion is not enabled for this RIVET environment yet.",
  tenant_off: "Jev suggestions are switched off for this gym. An owner can turn them on under Settings → Jev assistance.",
  key_missing: "RIVET's AI Gateway key is not configured, so nothing was sent.",
  free_terms_unconfirmed: "Live Jev calls wait until RIVET confirms the free terms (RIVET_JEV_FREE_UNTIL).",
  free_terms_expired: "The confirmed free period for Jev has ended, so live calls are stopped until it is confirmed again.",
  breaker_tripped: "Live Jev calls are stopped because AI Gateway reported a billed request. An operator must reset the breaker.",
  daily_cap: "RIVET's daily limit for Jev requests has been reached. Suggestions resume tomorrow.",
  tenant_daily_cap: "This gym's daily limit for Jev requests has been reached. Suggestions resume tomorrow.",
  state_too_large: "This record is too large to send for a suggestion.",
  unknown_question: "This suggestion is not registered.",
};

export interface JevGateInput {
  resolution: JevModeResolution;
  /** Omit to evaluate the environment without a feature (status screens). */
  featureKey?: string;
  tenantEnabled: boolean;
  breakerTripped: boolean;
  globalRequestsToday: number;
  tenantRequestsToday: number;
}

export type JevGate = { allowed: true; mode: "fixture" | "live" } | { allowed: false; reason: JevBlockReason; message: string };

function blocked(reason: JevBlockReason): JevGate {
  return { allowed: false, reason, message: JEV_BLOCK_MESSAGES[reason] };
}

/**
 * The one decision every request passes through before any state is loaded.
 * Order matters: the cheapest, most global refusals come first so a switched
 * off environment never touches tenant data or counters.
 */
export function gateJevRequest(input: JevGateInput): JevGate {
  const { resolution } = input;
  if (resolution.mode === "off") return blocked("mode_off");
  if (resolution.mode === "fixture") return input.tenantEnabled ? { allowed: true, mode: "fixture" } : blocked("tenant_off");
  if (input.featureKey !== undefined && !resolution.features.includes(input.featureKey)) return blocked("feature_off");
  if (!input.tenantEnabled) return blocked("tenant_off");
  if (!resolution.keyConfigured) return blocked("key_missing");
  if (resolution.freeTerms === "expired") return blocked("free_terms_expired");
  if (resolution.freeTerms !== "confirmed") return blocked("free_terms_unconfirmed");
  if (input.breakerTripped) return blocked("breaker_tripped");
  if (input.globalRequestsToday >= resolution.dailyCap) return blocked("daily_cap");
  if (input.tenantRequestsToday >= resolution.tenantDailyCap) return blocked("tenant_daily_cap");
  return { allowed: true, mode: "live" };
}
