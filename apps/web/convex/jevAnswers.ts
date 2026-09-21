import {
  JEV_MAX_CANDIDATES,
  JEV_MAX_SUBJECT_KEYS,
  JEV_MAX_SUBJECT_VALUE_LENGTH,
  JEV_MODEL_ID,
  JEV_REGISTRY_VERSION,
  type JevCandidate,
  type JevFailureReason,
  type JevJson,
  type JevJudgment,
  type JevQuestion,
  type JevSimulation,
  type JevState,
} from "./jevRegistry";

/**
 * Pure helpers shared by the server adapter, the preview adapter and tests:
 * turning a registered question into the SDK request shape, scoping
 * candidate options, validating what the model returns, hashing state, and
 * producing fixture outcomes. No Convex or SDK imports.
 */

/** The single question id used in every request; answers must contain exactly this key. */
export const JEV_QUESTION_ID = "judgment";
const PROBABILITY_SUM_TOLERANCE = 0.05;
const CHOICE_ARGMAX_TOLERANCE = 0.01;

/** Structurally identical to the AI SDK's `Experimental_EvaluationQuestion` union; kept local so this module stays SDK-free. */
export type JevSdkQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "boolean"; instructions: string; criteria?: { true?: string; false?: string } };

export interface JevPreparedQuestions {
  questions: Record<string, JevSdkQuestion>;
  /** Scoped option key → candidate id, present only for candidate-based choice questions. */
  candidateKeys?: Record<string, string>;
}

export type JevEvaluationOutcome =
  | {
      ok: true;
      judgment: JevJudgment;
      modelId: string;
      modelVersion?: string;
      inputTokens?: number;
      outputTokens?: number;
      /** Cost reported by AI Gateway metadata, in USD. Undefined when the response carried none. */
      reportedCostUsd?: number;
      latencyMs: number;
      warnings: string[];
    }
  | { ok: false; reason: JevFailureReason; message: string; latencyMs: number; retryable: boolean };

export type JevSubject = Record<string, string | number | boolean>;

const SUBJECT_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;

/** Page-supplied identifiers are bounded and primitive; loaders re-check access for every one they use. */
export function sanitizeJevSubject(input: unknown): JevSubject {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const subject: JevSubject = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(subject).length >= JEV_MAX_SUBJECT_KEYS) break;
    if (!SUBJECT_KEY.test(key)) continue;
    if (typeof value === "string") subject[key] = value.slice(0, JEV_MAX_SUBJECT_VALUE_LENGTH);
    else if (typeof value === "number" && Number.isFinite(value)) subject[key] = value;
    else if (typeof value === "boolean") subject[key] = value;
  }
  return subject;
}

function scopedOptionKey(index: number): string {
  return `option_${String(index + 1).padStart(2, "0")}`;
}

export function buildJevQuestions(question: JevQuestion, candidates?: JevCandidate[]): { ok: true; prepared: JevPreparedQuestions } | { ok: false; message: string } {
  if (question.kind === "boolean") {
    const criteria = question.criteria && (question.criteria.true || question.criteria.false) ? { ...question.criteria } : undefined;
    return { ok: true, prepared: { questions: { [JEV_QUESTION_ID]: { type: "boolean", instructions: question.instructions, ...(criteria ? { criteria } : {}) } } } };
  }
  if (question.kind === "score") {
    return { ok: true, prepared: { questions: { [JEV_QUESTION_ID]: { type: "score", instructions: question.instructions, criteria: [...question.levels] } } } };
  }
  if (question.options) {
    return { ok: true, prepared: { questions: { [JEV_QUESTION_ID]: { type: "choice", instructions: question.instructions, criteria: { ...question.options } } } } };
  }
  const max = question.maxCandidates ?? JEV_MAX_CANDIDATES;
  const list = candidates ?? [];
  if (list.length === 0) return { ok: false, message: "This question needs at least one candidate option." };
  if (list.length > max) return { ok: false, message: `This question accepts at most ${max} candidate options.` };
  const ids = new Set<string>();
  const criteria: Record<string, string> = {};
  const candidateKeys: Record<string, string> = {};
  for (const [index, candidate] of list.entries()) {
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
    if (!id || id.length > 120 || ids.has(id)) return { ok: false, message: "Candidate ids must be unique, non-empty strings." };
    if (!description || description.length > 500) return { ok: false, message: "Every candidate needs a description of at most 500 characters." };
    ids.add(id);
    const key = scopedOptionKey(index);
    criteria[key] = description;
    candidateKeys[key] = id;
  }
  if (Object.keys(criteria).length === 1) {
    // Jev needs at least two options to choose between. A single candidate is
    // answered by the application without a model call.
    return { ok: false, message: "A choice needs at least two candidate options." };
  }
  return { ok: true, prepared: { questions: { [JEV_QUESTION_ID]: { type: "choice", instructions: question.instructions, criteria } }, candidateKeys } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function unitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readProbabilities(raw: unknown, allowed: readonly string[]): { ok: true; probabilities: Record<string, number> | undefined } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, probabilities: undefined };
  if (!isRecord(raw)) return { ok: false, message: "probabilities must be an object" };
  const probabilities: Record<string, number> = {};
  let sum = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key)) return { ok: false, message: `probability for unknown option "${key}"` };
    if (!unitInterval(value)) return { ok: false, message: `probability for "${key}" is not between 0 and 1` };
    probabilities[key] = value;
    sum += value;
  }
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) return { ok: false, message: `probabilities sum to ${sum.toFixed(3)}, not 1` };
  for (const key of allowed) probabilities[key] ??= 0;
  return { ok: true, probabilities };
}

function readConfidence(providerMetadata: unknown): number | undefined {
  if (!isRecord(providerMetadata)) return undefined;
  const typesafe = providerMetadata.typesafe;
  if (!isRecord(typesafe) || !isRecord(typesafe.confidence)) return undefined;
  const value = typesafe.confidence[JEV_QUESTION_ID];
  return unitInterval(value) ? value : undefined;
}

/**
 * Accept only an answer that fits the question exactly: the right id, the
 * right type, a known option, and coherent probabilities. Anything else is
 * rejected as invalid model output and is never cached or shown.
 */
export function validateJevAnswers(
  question: JevQuestion,
  answers: unknown,
  candidateKeys?: Record<string, string>,
  providerMetadata?: unknown,
): { ok: true; judgment: JevJudgment } | { ok: false; message: string } {
  if (!isRecord(answers)) return { ok: false, message: "answers is not an object" };
  const keys = Object.keys(answers);
  if (keys.length !== 1 || keys[0] !== JEV_QUESTION_ID) return { ok: false, message: `answers must contain exactly "${JEV_QUESTION_ID}"` };
  const answer = answers[JEV_QUESTION_ID];
  if (!isRecord(answer)) return { ok: false, message: "answer is not an object" };
  if (answer.type !== question.kind) return { ok: false, message: `answer type "${String(answer.type)}" does not match the ${question.kind} question` };
  const confidence = readConfidence(providerMetadata);

  if (question.kind === "boolean") {
    if (!unitInterval(answer.probability)) return { ok: false, message: "boolean probability is not between 0 and 1" };
    return { ok: true, judgment: { kind: "boolean", probability: answer.probability, ...(confidence !== undefined ? { confidence } : {}) } };
  }

  if (question.kind === "score") {
    const levelCount = question.levels.length;
    const score = answer.score;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > levelCount - 1) return { ok: false, message: `score is not between 0 and ${levelCount - 1}` };
    const indices = question.levels.map((_, index) => String(index));
    const read = readProbabilities(answer.probabilities, indices);
    if (!read.ok) return read;
    const level = Math.min(levelCount - 1, Math.max(0, Math.round(score)));
    const probabilities = read.probabilities ?? Object.fromEntries(indices.map((index) => [index, index === String(level) ? 1 : 0]));
    return { ok: true, judgment: { kind: "score", score, level, levelCount, probabilities, ...(confidence !== undefined ? { confidence } : {}) } };
  }

  const allowed = question.options ? Object.keys(question.options) : Object.keys(candidateKeys ?? {});
  if (allowed.length === 0) return { ok: false, message: "no options were offered for this choice" };
  const choice = answer.choice;
  if (typeof choice !== "string" || !allowed.includes(choice)) return { ok: false, message: `choice "${String(choice)}" is not one of the offered options` };
  const read = readProbabilities(answer.probabilities, allowed);
  if (!read.ok) return read;
  const scoped = read.probabilities ?? Object.fromEntries(allowed.map((key) => [key, key === choice ? 1 : 0]));
  const best = Math.max(...Object.values(scoped));
  if ((scoped[choice] ?? 0) < best - CHOICE_ARGMAX_TOLERANCE) return { ok: false, message: "the chosen option does not carry the highest probability" };
  const map = (key: string) => (candidateKeys ? candidateKeys[key] ?? key : key);
  const probabilities = Object.fromEntries(Object.entries(scoped).map(([key, value]) => [map(key), value]));
  return { ok: true, judgment: { kind: "choice", choice: map(choice), probabilities, ...(confidence !== undefined ? { confidence } : {}) } };
}

/** Deterministic JSON: object keys sorted at every depth, undefined dropped, non-finite numbers null. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): JevJson {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: { [key: string]: JevJson } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = normalize(item);
    }
    return out;
  }
  return null;
}

export function jevStateBytes(canonical: string): number {
  return new TextEncoder().encode(canonical).length;
}

export function jevStateHash(input: { questionKey: string; questionVersion: number; sourceVersion: string; state: JevState; candidates?: JevCandidate[] }): string {
  return sha256Hex(canonicalJson({
    registry: JEV_REGISTRY_VERSION,
    model: JEV_MODEL_ID,
    question: input.questionKey,
    version: input.questionVersion,
    source: input.sourceVersion,
    candidates: input.candidates ?? null,
    state: input.state,
  }));
}

export function jevLeaseKey(questionKey: string, scopeKey: string, stateHash: string): string {
  return `${questionKey}|${scopeKey}|${stateHash}`;
}

// --- Fixtures -----------------------------------------------------------------

/** The raw SDK-shaped answers a fixture stands in for, with candidate ids re-scoped like a real request. */
export function fixtureRawAnswers(question: JevQuestion, simulate?: JevSimulation): Record<string, unknown> {
  const judgment = question.fixture.judgment;
  if (simulate === "invalid_output") {
    if (judgment.kind === "choice") return { [JEV_QUESTION_ID]: { type: "choice", choice: "not_an_offered_option", probabilities: { not_an_offered_option: 1 } } };
    if (judgment.kind === "score") return { [JEV_QUESTION_ID]: { type: "score", score: -1 } };
    return { [JEV_QUESTION_ID]: { type: "boolean", probability: 1.7 } };
  }
  if (judgment.kind === "boolean") return { [JEV_QUESTION_ID]: { type: "boolean", probability: judgment.probability } };
  if (judgment.kind === "score") return { [JEV_QUESTION_ID]: { type: "score", score: judgment.score, probabilities: { ...judgment.probabilities } } };
  const candidates = question.fixture.candidates;
  if (!candidates) return { [JEV_QUESTION_ID]: { type: "choice", choice: judgment.choice, probabilities: { ...judgment.probabilities } } };
  const keyFor = (id: string) => scopedOptionKey(candidates.findIndex((candidate) => candidate.id === id));
  return {
    [JEV_QUESTION_ID]: {
      type: "choice",
      choice: keyFor(judgment.choice),
      probabilities: Object.fromEntries(Object.entries(judgment.probabilities).map(([id, value]) => [keyFor(id), value])),
    },
  };
}

export function fixtureProviderMetadata(question: JevQuestion): Record<string, unknown> {
  return confidenceMetadata(question.fixture.judgment.confidence);
}

function confidenceMetadata(confidence: number | undefined): Record<string, unknown> {
  return confidence === undefined ? {} : { typesafe: { confidence: { [JEV_QUESTION_ID]: confidence } } };
}

/** The raw SDK-shaped answer for a judgment expressed in candidate ids, re-scoped to the request's option keys. */
export function rawAnswersFromJudgment(judgment: JevJudgment, candidateKeys?: Record<string, string>): Record<string, unknown> {
  if (judgment.kind === "boolean") return { [JEV_QUESTION_ID]: { type: "boolean", probability: judgment.probability } };
  if (judgment.kind === "score") return { [JEV_QUESTION_ID]: { type: "score", score: judgment.score, probabilities: { ...judgment.probabilities } } };
  const scopedFor = new Map(Object.entries(candidateKeys ?? {}).map(([scoped, id]) => [id, scoped] as const));
  const key = (id: string) => scopedFor.get(id) ?? id;
  return { [JEV_QUESTION_ID]: { type: "choice", choice: key(judgment.choice), probabilities: Object.fromEntries(Object.entries(judgment.probabilities).map(([id, value]) => [key(id), value])) } };
}

/**
 * The fixture path runs the same question builder and validator as a live
 * call, so fixture mode and the preview exercise real validation, including
 * the simulated failures.
 */
export function evaluateJevFixture(question: JevQuestion, simulate?: JevSimulation, latencyMs = 0, actual?: { state: JevState; candidates?: JevCandidate[] }): JevEvaluationOutcome {
  if (simulate === "timeout") return { ok: false, reason: "timeout", message: "Simulated timeout: the model did not answer in time.", latencyMs, retryable: true };
  if (simulate === "provider_error") return { ok: false, reason: "provider_error", message: "Simulated provider error.", latencyMs, retryable: true };
  // A question with dynamic candidates answers from the request's own state
  // and candidates through its resolver; everything else replays the fixture.
  const useResolver = Boolean(actual && question.fixtureResolver && !simulate);
  const candidates = useResolver ? actual?.candidates : question.fixture.candidates;
  const built = buildJevQuestions(question, candidates);
  if (!built.ok) return { ok: false, reason: "request_invalid", message: built.message, latencyMs, retryable: false };
  const resolved = useResolver && actual ? question.fixtureResolver?.({ state: actual.state, candidates }) : undefined;
  if (useResolver && !resolved) return { ok: false, reason: "invalid_output", message: "The preview resolver produced no answer.", latencyMs, retryable: false };
  const raw = resolved ? rawAnswersFromJudgment(resolved, built.prepared.candidateKeys) : fixtureRawAnswers(question, simulate);
  const metadata = resolved ? confidenceMetadata(resolved.confidence) : fixtureProviderMetadata(question);
  const validated = validateJevAnswers(question, raw, built.prepared.candidateKeys, metadata);
  if (!validated.ok) return { ok: false, reason: "invalid_output", message: `The model answer could not be used: ${validated.message}.`, latencyMs, retryable: false };
  return { ok: true, judgment: validated.judgment, modelId: JEV_MODEL_ID, modelVersion: "fixture", inputTokens: 0, outputTokens: 0, reportedCostUsd: 0, latencyMs, warnings: [] };
}

// --- SHA-256 ------------------------------------------------------------------
// A small pure implementation so hashing behaves identically in the Convex
// isolate, the Node action runtime, the browser preview and jsdom tests,
// none of which expose the same synchronous digest API.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
}
