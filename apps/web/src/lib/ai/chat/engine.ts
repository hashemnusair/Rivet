import type { AiErrorCategory } from "../contracts";
import { CHAT_ACTIONS_PER_ANSWER, type ChatPart } from "./contracts";
import type { ChatEnv, ChatReader } from "./sources";
import { runChatTool, type ChatToolSpec } from "./tools";

/**
 * One answer: the model is called, its words and reasoning summaries stream
 * into parts, the lookups it asks for run as the person asking, and the loop
 * continues until it answers, the person stops it, or a limit is reached.
 *
 * The model is behind a small interface so the same loop drives Claude in
 * production and RIVET's deterministic preview model in tests and the local
 * preview. Callers persist and present the parts; the loop never writes
 * business records.
 */

export type ModelImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Request content blocks, in the Messages API's own shapes. */
export type ModelBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: ModelImageType; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title?: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

export interface ModelMessage {
  role: "user" | "assistant";
  content: ModelBlock[];
}

export interface ChatModelRequest {
  system: string;
  tools: readonly ChatToolSpec[];
  messages: ModelMessage[];
  /** `none` asks for a written answer without further lookups. */
  toolChoice: "auto" | "none";
}

export interface ChatUsage {
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export type ModelStopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface ModelTurnResult {
  content: ModelBlock[];
  stopReason: ModelStopReason;
  usage: ChatUsage;
}

export type ModelStreamEvent =
  | { type: "block_start"; index: number; block: "thinking" | "text" | "tool_use" | "other"; name?: string }
  | { type: "thinking_delta"; index: number; text: string }
  | { type: "text_delta"; index: number; text: string }
  | { type: "block_stop"; index: number };

export interface ChatModel {
  stream(request: ChatModelRequest, onEvent: (event: ModelStreamEvent) => void, signal: AbortSignal): Promise<ModelTurnResult>;
}

/** A model call that failed for a reason the person can be told about safely. */
export class ChatModelError extends Error {
  constructor(readonly category: AiErrorCategory, readonly usage?: ChatUsage) {
    super(category);
    this.name = "ChatModelError";
  }
}

export interface ChatTurnHooks {
  /** The parts changed. The array is live: snapshot it before keeping it. */
  emit(parts: readonly ChatPart[]): void;
  /** Checked before every model call: spend caps, stops and availability. */
  beforeCall(): Promise<AiErrorCategory | undefined>;
  /** Every billed call is recorded, including ones that failed. */
  afterCall(usage: ChatUsage | undefined, latencyMs: number, outcome: "ok" | "timeout" | "refused" | "unavailable" | "malformed"): Promise<void>;
  /** Whether the person asked to stop; polled while the answer streams. */
  stopRequested(): boolean;
  now(): number;
}

export interface ChatTurnInput {
  model: ChatModel;
  reader: ChatReader;
  env: ChatEnv;
  system: string;
  tools: readonly ChatToolSpec[];
  history: ModelMessage[];
  userContent: ModelBlock[];
  hooks: ChatTurnHooks;
  /** Model calls in one answer, including the final written one. */
  maxCalls: number;
  /** Prefix for part ids, unique to the answer. */
  idPrefix: string;
}

export interface ChatTurnOutcome {
  status: "complete" | "stopped" | "failed";
  error?: AiErrorCategory;
  parts: ChatPart[];
  /** The calls and lookups of this answer, without reasoning blocks, for later turns. */
  turnMessages: ModelMessage[];
}

/** Reasoning blocks belong to the turn that produced them; later turns replay only words, lookups and results. */
export function withoutThinking(messages: readonly ModelMessage[]): ModelMessage[] {
  return messages
    .map((message) => ({ ...message, content: message.content.filter((block) => block.type !== "thinking" && block.type !== "redacted_thinking") }))
    .filter((message) => message.content.length > 0);
}

function outcomeOf(error: unknown): "timeout" | "refused" | "unavailable" | "malformed" {
  if (error instanceof ChatModelError) {
    if (error.category === "model_timeout") return "timeout";
    if (error.category === "model_refused") return "refused";
    if (error.category === "model_malformed") return "malformed";
  }
  return "unavailable";
}

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnOutcome> {
  const { hooks } = input;
  const parts: ChatPart[] = [];
  const loop: ModelMessage[] = [{ role: "user", content: input.userContent }];
  /** Messages kept for later turns: only complete exchanges, never a lookup without its result. */
  let kept: ModelMessage[] = [];
  let partSeq = 0;
  const nextId = () => `${input.idPrefix}-${++partSeq}`;
  const controller = new AbortController();
  let stopped = false;

  const checkStop = () => {
    if (!stopped && hooks.stopRequested()) {
      stopped = true;
      controller.abort();
    }
    return stopped;
  };

  const finish = (status: ChatTurnOutcome["status"], error?: AiErrorCategory): ChatTurnOutcome => {
    const now = hooks.now();
    for (const part of parts) {
      if (part.type === "thinking" && part.endedAt === undefined) part.endedAt = now;
      if (part.type === "tool" && part.status === "running") {
        part.status = "error";
        part.endedAt = now;
      }
    }
    // Words already shown stay in the conversation even when the answer was cut short.
    const partialText = parts.filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text").map((part) => part.text).join("\n\n").trim();
    const turnMessages = withoutThinking(kept);
    const endsWithWords = turnMessages.at(-1)?.role === "assistant" && turnMessages.at(-1)!.content.some((block) => block.type === "text");
    if (status !== "complete" && partialText && !endsWithWords) turnMessages.push({ role: "assistant", content: [{ type: "text", text: partialText }] });
    const visible = parts.filter((part) => !(part.type === "thinking" && !part.text.trim()));
    hooks.emit(visible);
    return { status, ...(error ? { error } : {}), parts: visible, turnMessages };
  };

  for (let call = 1; call <= input.maxCalls; call++) {
    if (checkStop()) return finish("stopped");
    const blocked = await hooks.beforeCall();
    if (blocked) return finish(call === 1 ? "failed" : "complete", blocked);
    const blockParts = new Map<number, ChatPart>();
    const started = hooks.now();
    let result: ModelTurnResult;
    try {
      result = await input.model.stream(
        { system: input.system, tools: input.tools, messages: [...input.history, ...loop], toolChoice: call === input.maxCalls ? "none" : "auto" },
        (event) => {
          if (checkStop()) return;
          const now = hooks.now();
          if (event.type === "block_start") {
            if (event.block === "thinking") {
              const part: ChatPart = { type: "thinking", id: nextId(), text: "", startedAt: now };
              parts.push(part);
              blockParts.set(event.index, part);
            } else if (event.block === "text") {
              const part: ChatPart = { type: "text", id: nextId(), text: "" };
              parts.push(part);
              blockParts.set(event.index, part);
            } else if (event.block === "tool_use" && event.name) {
              const part: ChatPart = { type: "tool", id: nextId(), tool: event.name as Extract<ChatPart, { type: "tool" }>["tool"], input: {}, status: "running", startedAt: now };
              parts.push(part);
              blockParts.set(event.index, part);
            }
          } else if (event.type === "thinking_delta") {
            const part = blockParts.get(event.index);
            if (part?.type === "thinking") part.text += event.text;
          } else if (event.type === "text_delta") {
            const part = blockParts.get(event.index);
            if (part?.type === "text") part.text += event.text;
          } else if (event.type === "block_stop") {
            const part = blockParts.get(event.index);
            if (part?.type === "thinking") {
              part.endedAt = now;
              part.text = part.text.trim();
              if (!part.text) parts.splice(parts.indexOf(part), 1);
            }
          }
          hooks.emit(parts);
        },
        controller.signal,
      );
    } catch (error) {
      if (stopped || controller.signal.aborted) {
        await hooks.afterCall(error instanceof ChatModelError ? error.usage : undefined, hooks.now() - started, "ok");
        return finish("stopped");
      }
      await hooks.afterCall(error instanceof ChatModelError ? error.usage : undefined, hooks.now() - started, outcomeOf(error));
      return finish("failed", error instanceof ChatModelError ? error.category : "model_unavailable");
    }
    await hooks.afterCall(result.usage, hooks.now() - started, result.stopReason === "refusal" ? "refused" : "ok");
    if (result.stopReason === "refusal") return finish("failed", "model_refused");

    const assistant: ModelMessage = { role: "assistant", content: result.content };
    const toolUses = result.content.filter((block): block is Extract<ModelBlock, { type: "tool_use" }> => block.type === "tool_use");
    if (result.stopReason !== "tool_use" || toolUses.length === 0) {
      kept = [...loop.slice(1), assistant];
      // A reply cut at its length limit keeps its words; a cut lookup is never run.
      return finish(result.stopReason === "max_tokens" && toolUses.length ? "failed" : "complete", result.stopReason === "max_tokens" && toolUses.length ? "model_malformed" : undefined);
    }
    if (checkStop()) return finish("stopped");

    // Tool parts were created from the stream in block order; match them to the final blocks.
    const toolParts = [...blockParts.entries()].filter(([, part]) => part.type === "tool").sort(([a], [b]) => a - b).map(([, part]) => part as Extract<ChatPart, { type: "tool" }>);
    const results: ModelBlock[] = [];
    // A few proposals per answer at most, so a person reviews each card rather than a wall of them.
    let proposals = parts.filter((part) => part.type === "tool" && part.action).length;
    await Promise.all(toolUses.map(async (use, index) => {
      let part = toolParts[index];
      if (!part) {
        part = { type: "tool", id: nextId(), tool: use.name as Extract<ChatPart, { type: "tool" }>["tool"], input: {}, status: "running", startedAt: hooks.now() };
        parts.push(part);
      }
      const overLimit = use.name.startsWith("propose_") && ++proposals > CHAT_ACTIONS_PER_ANSWER;
      const run = overLimit
        ? { content: JSON.stringify({ error: `At most ${CHAT_ACTIONS_PER_ANSWER} changes can be proposed in one answer. Ask the person to confirm these first.` }), isError: true, input: {}, outcome: { failure: "refused" as const } }
        : await runChatTool(input.reader, input.env, use.name, use.input);
      part.input = run.input;
      part.status = run.isError ? "error" : "done";
      part.outcome = run.outcome;
      if ("link" in run && run.link) part.link = run.link;
      if ("action" in run && run.action) part.action = run.action;
      part.endedAt = hooks.now();
      results[index] = { type: "tool_result", tool_use_id: use.id, content: run.content, ...(run.isError ? { is_error: true } : {}) };
      hooks.emit(parts);
    }));
    loop.push(assistant, { role: "user", content: results });
    kept = loop.slice(1);
  }
  return finish("complete", "limit_reached");
}
