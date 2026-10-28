import Anthropic, { APIConnectionTimeoutError, APIUserAbortError } from "@anthropic-ai/sdk";
import type { ChatModel, ChatUsage, ModelBlock, ModelStopReason } from "../src/lib/ai/chat/engine";
import { ChatModelError } from "../src/lib/ai/chat/engine";

/**
 * Claude for Ask RIVET: one streamed Messages API call per step of an answer.
 * Runs only inside the respond action. The key is passed in by the caller,
 * which read it from the deployment environment; it never appears in a
 * result, part, error or log line. No SDK retries and no SDK logging.
 */

/** Room for the reasoning summary, the lookups and a full answer. */
export const CHAT_MAX_TOKENS = 8_000;
/** A connection that sends nothing for this long is abandoned. */
const CHAT_TIMEOUT_MS = 90_000;

export type ChatEffort = "low" | "medium" | "high";

function usageOf(raw: Anthropic.Usage | undefined): ChatUsage | undefined {
  if (!raw) return undefined;
  return { inputTokens: raw.input_tokens ?? 0, cacheWriteTokens: raw.cache_creation_input_tokens ?? 0, cacheReadTokens: raw.cache_read_input_tokens ?? 0, outputTokens: raw.output_tokens ?? 0 };
}

function stopOf(reason: Anthropic.Message["stop_reason"]): ModelStopReason {
  return reason === "end_turn" || reason === "tool_use" || reason === "max_tokens" || reason === "refusal" ? reason : "other";
}

/** Keeps the blocks this conversation uses; reasoning blocks keep their signatures for the rest of the answer. */
function contentOf(blocks: Anthropic.ContentBlock[]): ModelBlock[] {
  const out: ModelBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") out.push({ type: "text", text: block.text });
    else if (block.type === "thinking") out.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    else if (block.type === "redacted_thinking") out.push({ type: "redacted_thinking", data: block.data });
    else if (block.type === "tool_use") out.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
  }
  return out;
}

export function anthropicChatModel(config: { baseUrl: string; model: string; effort: ChatEffort }, apiKey: string): ChatModel {
  const client = new Anthropic({ apiKey, baseURL: config.baseUrl, timeout: CHAT_TIMEOUT_MS, maxRetries: 0, logLevel: "off" });
  return {
    async stream(request, onEvent, signal) {
      const stream = client.messages.stream({
        model: config.model,
        max_tokens: CHAT_MAX_TOKENS,
        // Tools and the system prompt never change, so the prefix caches; the
        // automatic marker caches the conversation so far for the next step.
        system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
        tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.input_schema })),
        tool_choice: { type: request.toolChoice },
        messages: request.messages as Anthropic.MessageParam[],
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: config.effort },
        cache_control: { type: "ephemeral" },
      }, { signal });
      try {
        for await (const event of stream) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            onEvent({ type: "block_start", index: event.index, block: block.type === "thinking" || block.type === "text" || block.type === "tool_use" ? block.type : "other", ...(block.type === "tool_use" ? { name: block.name } : {}) });
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") onEvent({ type: "text_delta", index: event.index, text: event.delta.text });
            else if (event.delta.type === "thinking_delta") onEvent({ type: "thinking_delta", index: event.index, text: event.delta.thinking });
          } else if (event.type === "content_block_stop") {
            onEvent({ type: "block_stop", index: event.index });
          }
        }
        const message = await stream.finalMessage();
        return { content: contentOf(message.content), stopReason: stopOf(message.stop_reason), usage: usageOf(message.usage)! };
      } catch (error) {
        // A stopped or failed stream is still billed for what it produced.
        const usage = usageOf(stream.currentMessage?.usage);
        if (error instanceof APIUserAbortError || signal.aborted) throw new ChatModelError("internal", usage);
        // Rate limits and provider errors are "unavailable"; the error itself is never recorded.
        throw new ChatModelError(error instanceof APIConnectionTimeoutError ? "model_timeout" : "model_unavailable", usage);
      }
    },
  };
}
