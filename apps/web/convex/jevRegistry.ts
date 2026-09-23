/**
 * Jev question registry: the shared, versioned contract for every bounded
 * semantic judgment RIVET may ask for.
 *
 * Jev is TypeSafe AI's evaluation model, reached through Vercel AI Gateway as
 * `typesafe-ai/jev` with the AI SDK's `experimental_evaluate`. It answers typed
 * questions about one piece of state: a choice between named options, a score
 * on an ordered scale, or the probability that a statement is true. It never
 * writes text, and it never decides anything on its own: application code
 * chooses the state it sees, validates what comes back, decides what is shown
 * and which actions a person may take, and every workflow keeps working when
 * Jev is off or unavailable.
 *
 * Feature modules declare their questions (`jevQuestions<Feature>.ts`) and
 * `jevQuestions.ts` aggregates them. Each question carries a version, the
 * permission a caller must hold, caching and timeout rules, and a synthetic
 * fixture: sample state plus the judgment Jev would give. Fixtures drive the
 * preview adapter, the `fixture` mode, the unit tests and the live smoke test,
 * so no real customer data is ever needed to exercise the pattern.
 *
 * This module has no Convex or SDK imports so the browser preview adapter and
 * the tests can share it.
 */

/** Bump when the shapes in this file change in a way that invalidates cached judgments. */
export const JEV_REGISTRY_VERSION = 1;
/** The only model RIVET may use. There is no paid fallback and no other model. */
export const JEV_MODEL_ID = "typesafe-ai/jev";
/** The AI Gateway provider slug that must serve every request. */
export const JEV_PROVIDER = "typesafe-ai";
export const JEV_DEFAULT_TIMEOUT_MS = 8_000;
export const JEV_MAX_TIMEOUT_MS = 15_000;
/** Canonical JSON bytes; far below the model's 32k-token state limit so cost stays bounded. */
export const JEV_MAX_STATE_BYTES = 24_000;
export const JEV_MAX_CANDIDATES = 120;
export const JEV_MIN_SCORE_LEVELS = 2;
export const JEV_MAX_SCORE_LEVELS = 10;
export const JEV_MAX_CHOICE_OPTIONS = 255;
/** Subject identifiers a page may pass to a loader; loaders never trust them without an access check. */
export const JEV_MAX_SUBJECT_KEYS = 20;
export const JEV_MAX_SUBJECT_VALUE_LENGTH = 512;

export type JevJson = string | number | boolean | null | JevJson[] | { [key: string]: JevJson };
export type JevState = string | { [key: string]: JevJson } | JevJson[];
export type JevKind = "choice" | "score" | "boolean";

/**
 * A dynamic option for a choice question. The adapter never sends the id to
 * the model: candidates are renumbered as scoped option keys for one request
 * and mapped back after validation, so an answer can only ever name a
 * candidate this request supplied.
 */
export interface JevCandidate {
  id: string;
  description: string;
}

/** Failure modes a synthetic question may simulate, for tests and the preview. */
export const JEV_SIMULATIONS = ["invalid_output", "timeout", "provider_error"] as const;
export type JevSimulation = (typeof JEV_SIMULATIONS)[number];

export type JevJudgment =
  | { kind: "choice"; choice: string; probabilities: Record<string, number>; confidence?: number }
  | { kind: "score"; score: number; level: number; levelCount: number; probabilities: Record<string, number>; confidence?: number }
  | { kind: "boolean"; probability: number; confidence?: number };

export interface JevFixture {
  state: JevState;
  candidates?: JevCandidate[];
  judgment: JevJudgment;
}

interface JevQuestionCommon {
  /** `<feature>.<name>`; stable, referenced by pages and cache rows. */
  key: string;
  feature: string;
  /** Bump whenever instructions, options, levels or the loader's state shape change. */
  version: number;
  label: string;
  description: string;
  instructions: string;
  /**
   * Who may ask. Tenant questions (the default) resolve a gym actor and check
   * `permission` against the role catalogue. Platform questions require a
   * platform administrator; their loader names the gym the judgment belongs
   * to, whose switch, cache and counters still apply.
   */
  scope?: "tenant" | "platform";
  /** Server permission the caller must hold; checked before any state is loaded. `platform.admin` for platform questions. */
  permission: string;
  /** 0 disables caching. Cached rows are tenant-scoped and keyed by the state hash. */
  cacheTtlMs: number;
  timeoutMs?: number;
  /** Synthetic questions load only their fixture; they never read tenant data. */
  synthetic: boolean;
  fixture: JevFixture;
  /**
   * The preview's stand-in for the model: given the actual state and
   * candidates of a request, produce a plausible judgment deterministically.
   * Fixture mode and the preview adapter use it for questions whose candidates
   * are dynamic, so previews and tests exercise the real outcome handling.
   * Never called in live mode.
   */
  fixtureResolver?: (input: { state: JevState; candidates?: JevCandidate[] }) => JevJudgment | undefined;
}

export interface JevChoiceQuestion extends JevQuestionCommon {
  kind: "choice";
  /** Static options. Omit for candidate-based questions whose loader supplies the options. */
  options?: Record<string, string>;
  maxCandidates?: number;
}

export interface JevScoreQuestion extends JevQuestionCommon {
  kind: "score";
  /** Ordered lowest to highest; each level is a description Jev can match against. */
  levels: string[];
}

export interface JevBooleanQuestion extends JevQuestionCommon {
  kind: "boolean";
  criteria?: { true?: string; false?: string };
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevBooleanQuestion;

export interface JevFeature {
  key: string;
  label: string;
  description: string;
}

/** Why a request was refused before any model call. Application copy lives in `JEV_BLOCK_MESSAGES`. */
export type JevBlockReason =
  | "mode_off"
  | "feature_off"
  | "tenant_off"
  | "key_missing"
  | "free_terms_unconfirmed"
  | "free_terms_expired"
  | "breaker_tripped"
  | "daily_cap"
  | "tenant_daily_cap"
  | "state_too_large"
  | "unknown_question";

/** Why a model call that was allowed did not produce a usable judgment. */
export type JevFailureReason =
  | "timeout"
  | "invalid_output"
  | "provider_error"
  | "rate_limited"
  | "auth_error"
  | "payment_required"
  | "cost_unconfirmed"
  | "unexpected_model"
  | "request_invalid";

/** What the server action returns to the page. Only `ready` carries a judgment. */
export type JevJudgeResult =
  | {
      status: "ready";
      source: "live" | "fixture" | "cache";
      judgment: JevJudgment;
      questionKey: string;
      questionVersion: number;
      modelId: string;
      stateHash: string;
      latencyMs: number;
      createdAt: string;
      correlationId: string;
      warning?: string;
    }
  | { status: "blocked"; reason: JevBlockReason; message: string }
  | { status: "in_progress"; retryAfterMs: number }
  | { status: "stale"; message: string }
  | { status: "unavailable"; reason: JevFailureReason; message: string; retryable: boolean; correlationId: string };

export function jevTimeoutMs(question: Pick<JevQuestion, "timeoutMs">): number {
  const requested = question.timeoutMs ?? JEV_DEFAULT_TIMEOUT_MS;
  return Math.min(JEV_MAX_TIMEOUT_MS, Math.max(1_000, requested));
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const OPTION_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Structural checks a registry must pass. Returned as messages so a test can
 * list every problem at once; nothing here throws at module load.
 */
export function validateJevRegistry(questions: readonly JevQuestion[], features: readonly JevFeature[]): string[] {
  const problems: string[] = [];
  const featureKeys = new Set(features.map((feature) => feature.key));
  const seen = new Set<string>();
  for (const feature of features) {
    if (!OPTION_PATTERN.test(feature.key)) problems.push(`feature key "${feature.key}" must be lower snake case`);
    if (!feature.label.trim() || !feature.description.trim()) problems.push(`feature "${feature.key}" needs a label and a description`);
  }
  for (const question of questions) {
    const prefix = `question "${question.key}"`;
    if (!KEY_PATTERN.test(question.key)) problems.push(`${prefix} must look like feature.name in lower snake case`);
    if (seen.has(question.key)) problems.push(`${prefix} is declared twice`);
    seen.add(question.key);
    if (!featureKeys.has(question.feature)) problems.push(`${prefix} names unknown feature "${question.feature}"`);
    if (!question.key.startsWith(`${question.feature}.`)) problems.push(`${prefix} must be prefixed by its feature "${question.feature}"`);
    if (!Number.isInteger(question.version) || question.version < 1) problems.push(`${prefix} needs an integer version of at least 1`);
    if (!question.label.trim() || !question.description.trim() || !question.instructions.trim()) problems.push(`${prefix} needs a label, description and instructions`);
    if (!question.permission.trim()) problems.push(`${prefix} needs a permission`);
    if (question.scope === "platform" && question.permission !== "platform.admin") problems.push(`${prefix} is platform-scoped and must name the platform.admin permission`);
    if (question.scope !== "platform" && question.permission === "platform.admin") problems.push(`${prefix} names platform.admin but is not platform-scoped`);
    if (!Number.isFinite(question.cacheTtlMs) || question.cacheTtlMs < 0) problems.push(`${prefix} needs a non-negative cacheTtlMs`);
    if (question.timeoutMs !== undefined && (question.timeoutMs < 1_000 || question.timeoutMs > JEV_MAX_TIMEOUT_MS)) problems.push(`${prefix} timeout must be between 1000 and ${JEV_MAX_TIMEOUT_MS} ms`);
    if (question.kind === "choice") {
      if (question.options) {
        const keys = Object.keys(question.options);
        if (keys.length < 2 || keys.length > JEV_MAX_CHOICE_OPTIONS) problems.push(`${prefix} needs between 2 and ${JEV_MAX_CHOICE_OPTIONS} options`);
        for (const key of keys) {
          if (!OPTION_PATTERN.test(key)) problems.push(`${prefix} option "${key}" must be lower snake case`);
          if (!question.options[key]?.trim()) problems.push(`${prefix} option "${key}" needs a description`);
        }
        if (question.fixture.candidates) problems.push(`${prefix} has static options and must not carry fixture candidates`);
      } else {
        const max = question.maxCandidates ?? JEV_MAX_CANDIDATES;
        if (max < 1 || max > JEV_MAX_CANDIDATES) problems.push(`${prefix} maxCandidates must be between 1 and ${JEV_MAX_CANDIDATES}`);
        if (!question.fixture.candidates?.length) problems.push(`${prefix} is candidate-based and needs fixture candidates`);
        if (!question.synthetic && !question.fixtureResolver) problems.push(`${prefix} is candidate-based and not synthetic, so it needs a fixtureResolver for previews`);
      }
      const judgment = question.fixture.judgment;
      if (judgment.kind !== "choice") problems.push(`${prefix} fixture judgment must be a choice`);
      else {
        const allowed = question.options ? Object.keys(question.options) : (question.fixture.candidates ?? []).map((candidate) => candidate.id);
        if (!allowed.includes(judgment.choice)) problems.push(`${prefix} fixture choice "${judgment.choice}" is not one of its options`);
        for (const key of Object.keys(judgment.probabilities)) if (!allowed.includes(key)) problems.push(`${prefix} fixture probability "${key}" is not one of its options`);
      }
    }
    if (question.kind === "score") {
      if (question.levels.length < JEV_MIN_SCORE_LEVELS || question.levels.length > JEV_MAX_SCORE_LEVELS) problems.push(`${prefix} needs between ${JEV_MIN_SCORE_LEVELS} and ${JEV_MAX_SCORE_LEVELS} levels`);
      if (question.levels.some((level) => !level.trim())) problems.push(`${prefix} has an empty level description`);
      const judgment = question.fixture.judgment;
      if (judgment.kind !== "score") problems.push(`${prefix} fixture judgment must be a score`);
      else if (judgment.levelCount !== question.levels.length || judgment.score < 0 || judgment.score > question.levels.length - 1) problems.push(`${prefix} fixture score does not fit its levels`);
    }
    if (question.kind === "boolean" && question.fixture.judgment.kind !== "boolean") problems.push(`${prefix} fixture judgment must be boolean`);
    if (question.synthetic && typeof question.fixture.state === "string" && !question.fixture.state.trim()) problems.push(`${prefix} synthetic fixture needs state`);
  }
  return problems;
}

/** What Settings and the suggestion hook read before asking anything. Never carries secrets. */
export interface JevStatusView {
  mode: "off" | "fixture" | "live";
  modeSource: "RIVET_JEV_MODE" | "default";
  modelId: string;
  registryVersion: number;
  keyConfigured: boolean;
  freeUntil?: string;
  freeTerms: "confirmed" | "unconfirmed" | "expired" | "invalid";
  zeroDataRetention: boolean;
  breaker: { tripped: boolean; reason?: string; trippedAt?: string };
  tenant: { enabled: boolean; updatedAt?: string; updatedBy?: string; reason?: string };
  usage: { day: string; tenantRequests: number; tenantDailyCap: number; globalRequests: number; globalDailyCap: number };
  features: JevFeatureStatus[];
  /** Whether this gym could get a judgment right now for at least one enabled feature. */
  ready: boolean;
  readyMode?: "fixture" | "live";
  blockedReason?: JevBlockReason;
  blockedMessage?: string;
  warnings: string[];
  canManage: boolean;
}

export interface JevFeatureStatus {
  key: string;
  label: string;
  description: string;
  enabledGlobally: boolean;
  ready: boolean;
  blockedReason?: JevBlockReason;
  questions: JevQuestionSummary[];
}

export interface JevQuestionSummary {
  key: string;
  label: string;
  description: string;
  kind: JevKind;
  version: number;
  scope: "tenant" | "platform";
  permission: string;
  synthetic: boolean;
  cacheTtlMs: number;
}
