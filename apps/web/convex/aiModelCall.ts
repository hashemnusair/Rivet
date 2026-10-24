import { buildLiveRequest, parseLiveResponse, runFixtureTask, type AiAdapterConfig, type ModelTask, type ModelTaskFailure, type ModelTaskResult, PROMPT_VERSIONS } from "../src/lib/ai/model";

/**
 * The single place that performs a model request. Runs only inside Convex
 * actions, outside any database transaction. The key is read from the
 * deployment environment here and nowhere else; it never appears in a
 * result, trace, error or log line.
 */
export type ModelCallOutcome = (ModelTaskResult | ModelTaskFailure) & { latencyMs: number };

export async function callModel(task: ModelTask, config: AiAdapterConfig, fetchImpl: typeof fetch = fetch): Promise<ModelCallOutcome> {
  const started = Date.now();
  if (config.mode === "fixture") return { ...runFixtureTask(task), latencyMs: Date.now() - started };
  if (config.mode !== "live" || !config.ready || !config.baseUrl || config.protocol !== "openai_chat_json") {
    return { ok: false, category: config.mode === "off" ? "ai_off" : "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: 0 };
  }
  const apiKey = process.env.RIVET_AI_API_KEY;
  if (!apiKey) return { ok: false, category: "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: 0 };
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
      return { ok: false, category: "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: Date.now() - started };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, category: "model_malformed", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: Date.now() - started };
    }
    return { ...parseLiveResponse(task, body), latencyMs: Date.now() - started };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, category: aborted ? "model_timeout" : "model_unavailable", promptVersion: PROMPT_VERSIONS[task.kind], latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}
