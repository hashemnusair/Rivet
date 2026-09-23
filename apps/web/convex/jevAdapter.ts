"use node";

import { experimental_evaluate, type Experimental_EvaluationModel } from "ai";
import { buildJevQuestions, validateJevAnswers, type JevEvaluationOutcome } from "./jevAnswers";
import { JEV_MODEL_ID, JEV_PROVIDER, type JevCandidate, type JevFailureReason, type JevQuestion, type JevState } from "./jevRegistry";
import { logRedactedServerError } from "./telemetry";

/**
 * The one place RIVET talks to the model. Runs in the Node action runtime
 * because the AI SDK targets Node 22 or later. Everything it needs is passed
 * in: the registered question, the server-loaded state and the timeout. It
 * returns a validated judgment or a classified failure, never a raw model
 * response, and it never logs request or response bodies.
 *
 * Bounds: one question per call, `maxRetries: 0`, an abort timeout, the
 * gateway restricted to the TypeSafe provider (no fallback model), and a
 * response check that the model that answered is Jev.
 */
export type JevEvaluate = typeof experimental_evaluate;

export interface JevEvaluationInput {
  question: JevQuestion;
  state: JevState;
  candidates?: JevCandidate[];
  timeoutMs: number;
  zeroDataRetention?: boolean;
  correlationId?: string;
  /** Test seams: a mock evaluation model, or a replacement for the SDK call. */
  model?: Experimental_EvaluationModel;
  evaluate?: JevEvaluate;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** AI SDK errors are named `AI_<Name>`; gateway errors carry plain names. Compare without the prefix. */
function errorName(error: unknown): string {
  const raw = error instanceof Error ? error.name : isRecord(error) && typeof error.name === "string" ? error.name : typeof error;
  return raw.replace(/^AI_/, "");
}

/** The SDK wraps the last failure of a retried call; classify the failure itself. */
function unwrapError(error: unknown, depth = 0): unknown {
  if (depth > 3 || !isRecord(error)) return error;
  if (errorName(error) === "RetryError") {
    const last = error.lastError ?? (Array.isArray(error.errors) ? error.errors[error.errors.length - 1] : undefined);
    if (last !== undefined) return unwrapError(last, depth + 1);
  }
  return error;
}

function statusCodeOf(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  const status = error.statusCode ?? error.status;
  return typeof status === "number" ? status : undefined;
}

/** Map an SDK or transport failure to a bounded reason with generic copy; provider text never reaches the page. */
export function classifyJevError(rawError: unknown, timedOut: boolean, timeoutMs: number): { reason: JevFailureReason; message: string; retryable: boolean } {
  if (timedOut) return { reason: "timeout", message: `The model did not answer within ${timeoutMs} ms.`, retryable: true };
  const error = unwrapError(rawError);
  const name = errorName(error);
  const status = statusCodeOf(error);
  if (name === "InvalidResponseDataError" || name === "TypeValidationError" || name === "JSONParseError") return { reason: "invalid_output", message: "The model answer could not be read.", retryable: false };
  if (name === "Experimental_EvaluationUnsupportedQuestionTypeError" || name === "InvalidArgumentError") return { reason: "request_invalid", message: "The question could not be sent to the model.", retryable: false };
  if (name === "GatewayAuthenticationError" || status === 401) return { reason: "auth_error", message: "AI Gateway refused RIVET's credentials.", retryable: false };
  if (status === 402) return { reason: "payment_required", message: "AI Gateway reports no available credit for this request, so nothing was served.", retryable: false };
  if (status === 403) return { reason: "auth_error", message: "AI Gateway refused this request for this account.", retryable: false };
  if (name === "GatewayRateLimitError" || status === 429) return { reason: "rate_limited", message: "AI Gateway is rate limiting requests. Try again shortly.", retryable: true };
  if (name === "GatewayModelNotFoundError" || name === "NoSuchModelError") return { reason: "unexpected_model", message: "The Jev model is not available through AI Gateway.", retryable: false };
  return { reason: "provider_error", message: "The model could not be reached.", retryable: true };
}

/** Only Jev itself: the pinned id, or the same provider's versioned Jev id (for example `typesafe-ai/jev-1`). */
export function isJevModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  return id === JEV_MODEL_ID || id === "jev" || id.startsWith(`${JEV_MODEL_ID}-`) || id.startsWith(`${JEV_MODEL_ID}@`);
}

function reportedCost(providerMetadata: unknown): number | undefined {
  if (!isRecord(providerMetadata) || !isRecord(providerMetadata.gateway)) return undefined;
  const raw = providerMetadata.gateway.cost;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function resolvedProvider(providerMetadata: unknown): string | undefined {
  if (!isRecord(providerMetadata) || !isRecord(providerMetadata.gateway) || !isRecord(providerMetadata.gateway.routing)) return undefined;
  const provider = providerMetadata.gateway.routing.resolvedProvider ?? providerMetadata.gateway.routing.finalProvider;
  return typeof provider === "string" ? provider : undefined;
}

export async function runJevEvaluation(input: JevEvaluationInput): Promise<JevEvaluationOutcome> {
  const now = input.now ?? (() => Date.now());
  const startedAt = now();
  const built = buildJevQuestions(input.question, input.candidates);
  if (!built.ok) return { ok: false, reason: "request_invalid", message: built.message, latencyMs: 0, retryable: false };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);

  try {
    const evaluate = input.evaluate ?? experimental_evaluate;
    const result = await evaluate({
      model: input.model ?? JEV_MODEL_ID,
      state: input.state,
      questions: built.prepared.questions,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: {
        gateway: {
          only: [JEV_PROVIDER],
          ...(input.zeroDataRetention ? { zeroDataRetention: true } : {}),
        },
      },
    });
    const latencyMs = Math.max(0, now() - startedAt);
    const modelId = result.response.modelId;
    const provider = resolvedProvider(result.providerMetadata);
    // Whatever happens next, the gateway has served (and may have billed) this response.
    const usage = { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens, reportedCostUsd: reportedCost(result.providerMetadata) };
    if (!isJevModelId(modelId) || (provider !== undefined && provider !== JEV_PROVIDER)) {
      return { ok: false, reason: "unexpected_model", message: "A model other than Jev answered, so the answer was discarded.", detail: `model ${modelId}${provider ? ` via ${provider}` : ""}`, latencyMs, retryable: false, ...usage };
    }
    const validated = validateJevAnswers(input.question, result.answers, built.prepared.candidateKeys, result.providerMetadata);
    if (!validated.ok) return { ok: false, reason: "invalid_output", message: "The model answer could not be used.", detail: validated.message, latencyMs, retryable: false, ...usage };
    return {
      ok: true,
      judgment: validated.judgment,
      modelId: JEV_MODEL_ID,
      modelVersion: modelId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      reportedCostUsd: reportedCost(result.providerMetadata),
      latencyMs,
      warnings: (result.warnings ?? []).map((warning) => (typeof warning === "string" ? warning : warning.type)),
    };
  } catch (error) {
    const latencyMs = Math.max(0, now() - startedAt);
    const classified = classifyJevError(error, timedOut, input.timeoutMs);
    logRedactedServerError({ operation: `jev.evaluate:${input.question.key}:${classified.reason}`, correlationId: input.correlationId, error });
    return { ok: false, ...classified, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
