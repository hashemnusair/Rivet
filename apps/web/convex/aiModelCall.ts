import Anthropic, { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { buildAnthropicRequest, buildLiveRequest, callCostMicros, parseAnthropicResponse, parseLiveResponse, runFixtureTask, type AiAdapterConfig, type ModelTask, type ModelTaskFailure, type ModelTaskResult, PROMPT_VERSIONS } from "../src/lib/ai/model";

/**
 * The single place that performs a model request. Runs only inside Convex
 * actions, outside any database transaction. The key is read from the
 * deployment environment here and nowhere else; it never appears in a
 * result, trace, error or log line.
 */
export type ModelCallOutcome = (ModelTaskResult | ModelTaskFailure) & { latencyMs: number };

type LiveConfig = AiAdapterConfig & { baseUrl: string; price: NonNullable<AiAdapterConfig["price"]> };

export async function callModel(task: ModelTask, config: AiAdapterConfig, fetchImpl: typeof fetch = fetch): Promise<ModelCallOutcome> {
  const started = Date.now();
  if (config.mode === "fixture") return { ...runFixtureTask(task), latencyMs: Date.now() - started };
  if (config.mode !== "live" || !config.ready || !config.baseUrl || !config.price || !config.protocol) {
    return { ok: false, category: config.mode === "off" ? "ai_off" : "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: 0 };
  }
  const apiKey = process.env.RIVET_AI_API_KEY;
  if (!apiKey) return { ok: false, category: "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: 0 };
  const live: LiveConfig = { ...config, baseUrl: config.baseUrl, price: config.price };
  const result = config.protocol === "anthropic_messages" ? await callAnthropic(task, live, apiKey, fetchImpl) : await callChatCompletions(task, live, apiKey, fetchImpl);
  // Every billed reply is priced, including ones RIVET rejected, so the spend caps see it.
  const usage = result.usage ? { ...result.usage, costMicros: callCostMicros(result.usage, live.price) } : undefined;
  return { ...result, ...(usage ? { usage } : {}), latencyMs: Date.now() - started };
}

async function callAnthropic(task: ModelTask, config: LiveConfig, apiKey: string, fetchImpl: typeof fetch): Promise<ModelTaskResult | ModelTaskFailure> {
  // No SDK retries: RIVET never retries a model call inside a write. Logging is
  // off whatever the environment says, and the explicit key and base URL mean
  // the SDK reads no other credential or endpoint.
  const client = new Anthropic({ apiKey, baseURL: config.baseUrl, timeout: config.timeoutMs, maxRetries: 0, logLevel: "off", fetch: fetchImpl });
  try {
    return parseAnthropicResponse(task, await client.messages.create(buildAnthropicRequest(task, config)));
  } catch (error) {
    // Rate limits and provider errors are "unavailable"; the error itself is never recorded.
    return { ok: false, category: error instanceof APIConnectionTimeoutError ? "model_timeout" : "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind] };
  }
}

async function callChatCompletions(task: ModelTask, config: LiveConfig, apiKey: string, fetchImpl: typeof fetch): Promise<ModelTaskResult | ModelTaskFailure> {
  const request = buildLiveRequest(task, config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, "")}${request.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Rate limits and provider errors are "unavailable": RIVET never retries a model call inside a write.
      return { ok: false, category: "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind] };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, category: "model_malformed", promptVersion: PROMPT_VERSIONS[task.kind] };
    }
    return parseLiveResponse(task, body);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, category: aborted ? "model_timeout" : "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind] };
  } finally {
    clearTimeout(timer);
  }
}
