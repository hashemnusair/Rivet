import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { publicBranchId, requireActor } from "./security";
import { adapterConfig, aiSettingsFor, capabilityModeOf, globalStopped, platformAvailable, spentMicros, tenantModeOf } from "./aiPolicy";
import { aiDomainPort } from "./domain";
import { anthropicChatModel, type ChatEffort } from "./aiChatModel";
import {
  chatBlocked,
  chatMessages,
  CONTEXT_FRESH_MS,
  deleteChat,
  fileTypeAllowed,
  filesById,
  FLUSH_INTERVAL_MS,
  HEARTBEAT_MS,
  MAX_MODEL_CALLS,
  ownMessage,
  record,
  requireHuman,
  STALLED_MS,
  text,
  UNSTARTED_MS,
} from "./aiChatOps";
import { budgetBlocked, chatCallCostMicros } from "../src/lib/ai/model";
import type { AiErrorCategory } from "../src/lib/ai/contracts";
import { CHAT_PROMPT_VERSION, chatAnswerText, chatContextKey, type ChatContextItem, type ChatFileType, type ChatMessageStatus, type ChatPart } from "../src/lib/ai/chat/contracts";
import { ChatReadError, loadSource, type ChatEnv, type ChatReader, type ChatReadOperation, type SourceResult } from "../src/lib/ai/chat/sources";
import { CHAT_TOOLS } from "../src/lib/ai/chat/tools";
import { CHAT_SYSTEM_PROMPT, composeUserTurn, readableAreas, sentContextKeys, type ChatFrame } from "../src/lib/ai/chat/prompt";
import { buildHistory, HISTORY_TURNS_READ, turnsWithFiles, type StoredChatTurn } from "../src/lib/ai/chat/history";
import { runChatTurn, type ChatModel, type ChatUsage, type ModelBlock, type ModelImageType, type ModelMessage } from "../src/lib/ai/chat/engine";
import { fixtureChatModel } from "../src/lib/ai/chat/fixture-model";
import { decidedActionLines } from "../src/lib/ai/chat/actions";

/**
 * The Wazen (Ask RIVET in code) answer. The panel calls `respond` right after sending, as the
 * same signed-in person, so every record the assistant reads goes through the
 * existing domain reads with that person's access. The answer streams into
 * `aiChatStreams`, which the panel watches; the finished answer replaces it
 * in one write. Watchdogs mark an answer failed if it never starts or stops
 * reporting progress, so a conversation can always continue.
 */

const requestFields = { organizationId: v.optional(v.string()), activeBranchId: v.optional(v.string()), correlationId: v.optional(v.string()) };

type StoredFile = { id: string; name: string; mediaType: ChatFileType; storageId: Id<"_storage"> };

type PreparedTurn =
  | { skip: true }
  | { blocked: AiErrorCategory; organizationId: Id<"organizations">; messageId: string }
  | {
      organizationId: Id<"organizations">;
      chatId: string;
      messageId: string;
      userMessageId: string;
      words: string;
      context: ChatContextItem[];
      screen?: { route: string; title: string };
      files: StoredFile[];
      history: Array<Omit<StoredChatTurn, "files"> & { files?: StoredFile[] }>;
      earlierOmitted: boolean;
      sentContext: Record<string, number>;
      env: ChatEnv;
      frame: Omit<ChatFrame, "now" | "screen" | "attached" | "files">;
    };

export const prepareTurn = internalQuery({
  args: { ...requestFields, messageId: v.string() },
  handler: async (ctx, args): Promise<PreparedTurn> => {
    const request = { organizationId: args.organizationId, activeBranchId: args.activeBranchId, correlationId: args.correlationId };
    const actor = await requireActor(ctx, request);
    requireHuman(actor);
    const { chat, message } = await ownMessage(ctx, actor, args.messageId);
    if (message.role !== "assistant" || message.status !== "pending") return { skip: true };
    const blocked = await chatBlocked(ctx, actor, await aiDomainPort.entitledModules(ctx, actor)) ?? budgetBlocked(adapterConfig(), await spentMicros(ctx, actor.organization._id));
    if (blocked) return { blocked, organizationId: actor.organization._id, messageId: message.publicId };
    const rows = (await chatMessages(ctx, actor.organization._id, chat.publicId)).filter((row) => row.seq < message.seq);
    const question = rows.at(-1);
    if (!question || question.role !== "user") return { skip: true };
    const kept = rows.slice(0, -1).slice(-HISTORY_TURNS_READ);
    const files = await filesById(ctx, actor.organization._id, [...kept, question].flatMap((row) => row.fileIds ?? []));
    const storedFiles = (ids: readonly string[] | undefined): StoredFile[] => (ids ?? []).flatMap((id) => {
      const file = files.get(id);
      return file && fileTypeAllowed(file.mediaType) ? [{ id, name: file.name, mediaType: file.mediaType, storageId: file.storageId }] : [];
    });
    const branches = actor.branchScope === "all"
      ? (await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect()).filter((branch) => branch.active)
      : (await Promise.all(actor.branchIds.map((id) => ctx.db.get(id)))).filter((branch): branch is Doc<"branches"> => Boolean(branch?.active));
    return {
      organizationId: actor.organization._id,
      chatId: chat.publicId,
      messageId: message.publicId,
      userMessageId: question.publicId,
      words: question.text,
      context: Array.isArray(question.context) ? (question.context as ChatContextItem[]) : [],
      ...(question.screen ? { screen: question.screen } : {}),
      files: storedFiles(question.fileIds),
      earlierOmitted: rows.length - 1 > HISTORY_TURNS_READ,
      history: kept.map((row) => ({
        role: row.role,
        text: row.text,
        status: row.status as ChatMessageStatus,
        ...(row.modelText ? { modelText: row.modelText } : {}),
        ...(row.role === "assistant" && Array.isArray(row.turnMessages) ? { turnMessages: row.turnMessages as ModelMessage[] } : {}),
        ...(row.fileIds?.length ? { files: storedFiles(row.fileIds) } : {}),
      })),
      sentContext: chat.sentContext ?? {},
      env: {
        today: aiDomainPort.tenantToday(actor),
        timezone: actor.organization.timezone || "Asia/Amman",
        currency: actor.organization.currency,
        ...(actor.branch ? { activeBranchId: publicBranchId(actor.branch) } : {}),
        branchIds: branches.map((branch) => publicBranchId(branch)),
        permissions: [...actor.permissions],
      },
      frame: {
        timezone: actor.organization.timezone || "Asia/Amman",
        gymName: actor.organization.name,
        currency: actor.organization.currency,
        ...(actor.branch ? { branchName: actor.branch.name } : {}),
        person: { name: actor.user.fullName, role: actor.role, reads: readableAreas(actor.permissions) },
        decided: decidedActionLines(rows.filter((row) => row.role === "assistant").map((row) => ({ parts: Array.isArray(row.parts) ? (row.parts as ChatPart[]) : [] }))),
      },
    };
  },
});

export const claimTurn = internalMutation({
  args: { organizationId: v.id("organizations"), messageId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const message = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.messageId)).unique();
    // Exactly one respond call may write an answer.
    if (!message || message.status !== "pending") return false;
    const now = Date.now();
    await ctx.db.patch(message._id, { status: "streaming", startedAt: now, updatedAt: now, source: adapterConfig().mode === "live" ? "live" : "fixture" });
    await ctx.db.insert("aiChatStreams", { organizationId: args.organizationId, messagePublicId: args.messageId, parts: [], version: 0, updatedAt: now });
    await ctx.scheduler.runAfter(STALLED_MS, internal.aiChat.expireStalled, { organizationId: args.organizationId, messageId: args.messageId });
    return true;
  },
});

export const writeStream = internalMutation({
  args: { organizationId: v.id("organizations"), messageId: v.string(), parts: v.any(), version: v.number() },
  handler: async (ctx, args): Promise<{ stop: boolean }> => {
    const message = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.messageId)).unique();
    if (!message || message.status !== "streaming") return { stop: true };
    const stream = await ctx.db.query("aiChatStreams").withIndex("by_organization_message", (q) => q.eq("organizationId", args.organizationId).eq("messagePublicId", args.messageId)).unique();
    if (stream && args.version > stream.version) await ctx.db.patch(stream._id, { parts: args.parts, version: args.version, updatedAt: Date.now() });
    return { stop: Boolean(message.stopRequestedAt) };
  },
});

/** Stops and availability are rechecked before every model call of an answer. */
export const turnGate = internalQuery({
  args: { organizationId: v.id("organizations"), runPublicId: v.string() },
  handler: async (ctx, args): Promise<AiErrorCategory | null> => {
    const config = adapterConfig();
    if (config.mode === "off") return "ai_off";
    if ((await globalStopped(ctx)).stopped) return "global_stop";
    const [settings, available] = await Promise.all([aiSettingsFor(ctx, args.organizationId), platformAvailable(ctx, args.organizationId)]);
    if (tenantModeOf(settings, available) === "off") return "tenant_off";
    if (capabilityModeOf(settings, "chat", available) === "off") return "capability_off";
    return budgetBlocked(config, await spentMicros(ctx, args.organizationId, args.runPublicId)) ?? null;
  },
});

export const finishTurn = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    messageId: v.string(),
    userMessageId: v.optional(v.string()),
    status: v.union(v.literal("complete"), v.literal("stopped"), v.literal("failed")),
    errorCategory: v.optional(v.string()),
    parts: v.any(),
    turnMessages: v.optional(v.any()),
    modelText: v.optional(v.string()),
    sentKeys: v.optional(v.array(v.string())),
    modelCalls: v.optional(v.number()),
    costMicros: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.messageId)).unique();
    if (!message) return null;
    const now = Date.now();
    const parts = Array.isArray(args.parts) ? (args.parts as ChatPart[]) : [];
    // A stop the person asked for wins over an answer that finished in the same moment.
    const status = message.stopRequestedAt && args.status === "complete" ? "stopped" : args.status;
    await ctx.db.patch(message._id, { status, parts, text: chatAnswerText(parts), ...(args.turnMessages ? { turnMessages: args.turnMessages } : {}), ...(args.errorCategory ? { errorCategory: args.errorCategory } : {}), ...(args.modelCalls !== undefined ? { modelCalls: args.modelCalls } : {}), ...(args.costMicros !== undefined ? { costMicros: args.costMicros } : {}), updatedAt: now, completedAt: now });
    if (args.userMessageId && args.modelText) {
      const question = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.userMessageId!)).unique();
      if (question && question.chatPublicId === message.chatPublicId) await ctx.db.patch(question._id, { modelText: args.modelText });
    }
    const chat = await ctx.db.query("aiChats").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", message.chatPublicId)).unique();
    if (chat) {
      const sentContext = { ...(chat.sentContext ?? {}) };
      for (const key of args.sentKeys ?? []) sentContext[key] = now;
      await ctx.db.patch(chat._id, { sentContext, updatedAt: now });
    }
    const stream = await ctx.db.query("aiChatStreams").withIndex("by_organization_message", (q) => q.eq("organizationId", args.organizationId).eq("messagePublicId", args.messageId)).unique();
    if (stream) await ctx.db.delete(stream._id);
    return null;
  },
});

/** An answer the panel never started: marked failed so the conversation can continue. */
export const expireUnstarted = internalMutation({
  args: { organizationId: v.id("organizations"), messageId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.messageId)).unique();
    if (message?.status === "pending" && message.updatedAt <= Date.now() - UNSTARTED_MS + 1_000) {
      const now = Date.now();
      await ctx.db.patch(message._id, { status: "failed", errorCategory: "model_unavailable", updatedAt: now, completedAt: now });
    }
    return null;
  },
});

/** An answer whose action stopped reporting: kept as far as it got and marked failed. */
export const expireStalled = internalMutation({
  args: { organizationId: v.id("organizations"), messageId: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const message = await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", args.organizationId).eq("publicId", args.messageId)).unique();
    if (message?.status !== "streaming") return null;
    const stream = await ctx.db.query("aiChatStreams").withIndex("by_organization_message", (q) => q.eq("organizationId", args.organizationId).eq("messagePublicId", args.messageId)).unique();
    const lastProgress = stream?.updatedAt ?? message.updatedAt;
    if (lastProgress > Date.now() - STALLED_MS + 1_000) {
      await ctx.scheduler.runAfter(STALLED_MS, internal.aiChat.expireStalled, args);
      return null;
    }
    const now = Date.now();
    const parts = (Array.isArray(stream?.parts) ? (stream!.parts as ChatPart[]) : []).map((part) => (part.type === "tool" && part.status === "running" ? { ...part, status: "error" as const, endedAt: now } : part.type === "thinking" && part.endedAt === undefined ? { ...part, endedAt: now } : part));
    await ctx.db.patch(message._id, { status: "failed", errorCategory: "deadline", parts, text: chatAnswerText(parts), updatedAt: now, completedAt: now });
    if (stream) await ctx.db.delete(stream._id);
    return null;
  },
});

/** Conversations and unsent files past their retention, with their stored files. */
export const expireChats = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    let removed = 0;
    for (const chat of await ctx.db.query("aiChats").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(20)) {
      await deleteChat(ctx, chat.organizationId, chat);
      removed += 1;
    }
    for (const file of await ctx.db.query("aiChatFiles").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(100)) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
      removed += 1;
    }
    return removed;
  },
});

function readFailure(error: unknown): ChatReadError {
  const code = error instanceof ConvexError ? text(record(error.data).code) : "";
  if (code === "FORBIDDEN" || code === "FEATURE_NOT_AVAILABLE") return new ChatReadError("forbidden");
  if (code === "NOT_FOUND") return new ChatReadError("not_found");
  if (code === "VALIDATION_ERROR") return new ChatReadError("invalid");
  return new ChatReadError("unavailable");
}

/** The first bytes must match the declared type; anything else is not sent. */
function sniffed(bytes: Uint8Array, mediaType: ChatFileType): boolean {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  switch (mediaType) {
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/gif": return starts(0x47, 0x49, 0x46, 0x38);
    case "image/webp": return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case "application/pdf": return starts(0x25, 0x50, 0x44, 0x46);
  }
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** Sends at most one write at a time and coalesces everything that changed meanwhile. */
class StreamFlusher {
  private latest: readonly ChatPart[] = [];
  private version = 0;
  private inFlight: Promise<void> | undefined;
  private queued = false;
  private lastSent = 0;
  private heartbeat: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  stopRequested = false;

  constructor(private readonly send: (parts: ChatPart[], version: number) => Promise<{ stop: boolean }>) {
    this.beat();
  }

  update(parts: readonly ChatPart[]): void {
    this.latest = parts;
    if (this.inFlight) {
      this.queued = true;
      return;
    }
    this.inFlight = this.flush();
  }

  private beat(): void {
    // Progress and the stop flag are read at least once a second, even while a lookup runs.
    this.heartbeat = setTimeout(() => {
      if (this.closed) return;
      if (!this.inFlight && Date.now() - this.lastSent >= HEARTBEAT_MS) this.update(this.latest);
      this.beat();
    }, HEARTBEAT_MS);
  }

  private async flush(): Promise<void> {
    const wait = FLUSH_INTERVAL_MS - (Date.now() - this.lastSent);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const parts = JSON.parse(JSON.stringify(this.latest)) as ChatPart[];
    this.version += 1;
    this.lastSent = Date.now();
    try {
      if ((await this.send(parts, this.version)).stop) this.stopRequested = true;
    } catch {
      // A failed progress write is not fatal; the finished answer is written separately.
    }
    this.inFlight = undefined;
    if (this.queued && !this.closed) {
      this.queued = false;
      this.inFlight = this.flush();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.heartbeat) clearTimeout(this.heartbeat);
    while (this.inFlight) await this.inFlight;
  }
}

function effort(): ChatEffort {
  const value = (process.env.RIVET_AI_CHAT_EFFORT ?? "").trim().toLowerCase();
  return value === "medium" || value === "high" ? value : "low";
}

export const respond = action({
  args: { ...requestFields, messageId: v.string() },
  handler: async (ctx, args): Promise<{ status: string }> => {
    // Only a signed-in person can start an answer; prepareTurn then rebuilds them as an actor and checks the conversation is theirs.
    if (!(await ctx.auth.getUserIdentity())) return { status: "skipped" };
    const turn: PreparedTurn = await ctx.runQuery(internal.aiChat.prepareTurn, args);
    if ("skip" in turn) return { status: "skipped" };
    if ("blocked" in turn) {
      if (!(await ctx.runMutation(internal.aiChat.claimTurn, { organizationId: turn.organizationId, messageId: turn.messageId }))) return { status: "skipped" };
      await ctx.runMutation(internal.aiChat.finishTurn, { organizationId: turn.organizationId, messageId: turn.messageId, status: "failed", errorCategory: turn.blocked, parts: [] });
      return { status: "failed" };
    }
    if (!(await ctx.runMutation(internal.aiChat.claimTurn, { organizationId: turn.organizationId, messageId: turn.messageId }))) return { status: "skipped" };

    const config = adapterConfig();
    const runPublicId = `chat:${turn.messageId}`;
    let modelCalls = 0;
    let costMicros = 0;
    const flusher = new StreamFlusher((parts, version) => ctx.runMutation(internal.aiChat.writeStream, { organizationId: turn.organizationId, messageId: turn.messageId, parts, version }));
    try {
      const reader: ChatReader = {
        read: async (operation: ChatReadOperation, input: Record<string, unknown>) => {
          try {
            return await ctx.runQuery(api.domain.query, { operation, input, organizationId: args.organizationId, activeBranchId: args.activeBranchId, correlationId: args.correlationId });
          } catch (error) {
            throw readFailure(error);
          }
        },
      };

      // Records attached for this message, each read once per ten minutes of conversation.
      const now = Date.now();
      const attached: ChatFrame["attached"] = await Promise.all(turn.context.map(async (item) => {
        const providedAt = turn.sentContext[chatContextKey(item)];
        if (providedAt !== undefined && now - providedAt < CONTEXT_FRESH_MS) return { item, providedAt };
        const result: SourceResult = await loadSource(reader, item, turn.env);
        return { item, result };
      }));

      // Files: this message's, plus those of the latest earlier turns that had files.
      const fileData = async (file: StoredFile): Promise<string | undefined> => {
        const blob = await ctx.storage.get(file.storageId);
        if (!blob) return undefined;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return sniffed(bytes, file.mediaType) ? base64(bytes) : undefined;
      };
      const currentFiles = await Promise.all(turn.files.map(async (file) => ({ file, data: await fileData(file) })));
      const keepFiles = turnsWithFiles(turn.history, 1);
      const history: StoredChatTurn[] = await Promise.all(turn.history.map(async (stored, index) => ({
        ...stored,
        ...(stored.files ? { files: await Promise.all(stored.files.map(async (file) => ({ name: file.name, mediaType: file.mediaType, ...(keepFiles.has(index) ? { data: await fileData(file) } : {}) }))) } : {}),
      })));

      const modelText = composeUserTurn({ ...turn.frame, now: new Date(now), ...(turn.screen ? { screen: turn.screen } : {}), attached, files: currentFiles.map(({ file, data }) => ({ name: file.name, kind: file.mediaType === "application/pdf" ? "pdf" : "image", included: Boolean(data) })) }, turn.words || "(See the attached files.)");
      const userContent: ModelBlock[] = [
        ...currentFiles.flatMap(({ file, data }): ModelBlock[] => !data ? [] : file.mediaType === "application/pdf"
          ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: file.name }]
          : [{ type: "image", source: { type: "base64", media_type: file.mediaType as ModelImageType, data } }]),
        { type: "text", text: modelText },
      ];

      const apiKey = process.env.RIVET_AI_API_KEY;
      const model: ChatModel = config.mode === "live" && config.baseUrl && config.model && apiKey
        ? anthropicChatModel({ baseUrl: config.baseUrl, model: config.model, effort: effort() }, apiKey)
        : fixtureChatModel();

      const outcome = await runChatTurn({
        model,
        reader,
        env: turn.env,
        system: CHAT_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        history: buildHistory(history, { earlierOmitted: turn.earlierOmitted }),
        userContent,
        maxCalls: MAX_MODEL_CALLS,
        idPrefix: turn.messageId,
        hooks: {
          emit: (parts) => flusher.update(parts),
          beforeCall: async () => (await ctx.runQuery(internal.aiChat.turnGate, { organizationId: turn.organizationId, runPublicId })) ?? undefined,
          afterCall: async (usage: ChatUsage | undefined, latencyMs, result) => {
            modelCalls += 1;
            const cost = usage && config.mode === "live" && config.price ? chatCallCostMicros(usage, config.price) : 0;
            costMicros += cost;
            await ctx.runMutation(internal.aiRuns.recordUsage, {
              organizationId: turn.organizationId,
              runPublicId,
              task: "chat",
              source: config.mode === "live" ? "live" : "fixture",
              promptVersion: CHAT_PROMPT_VERSION,
              latencyMs,
              outcome: result,
              ...(usage ? { inputTokens: usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens, outputTokens: usage.outputTokens, costMicros: cost } : {}),
              ...(config.model ? { model: config.model } : {}),
            });
          },
          stopRequested: () => flusher.stopRequested,
          now: () => Date.now(),
        },
      });
      await flusher.close();
      await ctx.runMutation(internal.aiChat.finishTurn, {
        organizationId: turn.organizationId,
        messageId: turn.messageId,
        userMessageId: turn.userMessageId,
        status: outcome.status,
        ...(outcome.error ? { errorCategory: outcome.error } : {}),
        parts: outcome.parts,
        turnMessages: outcome.turnMessages,
        modelText,
        sentKeys: sentContextKeys(attached),
        modelCalls,
        costMicros,
      });
      return { status: outcome.status };
    } catch {
      // Nothing about the failure is recorded beyond a safe category.
      await flusher.close();
      await ctx.runMutation(internal.aiChat.finishTurn, { organizationId: turn.organizationId, messageId: turn.messageId, status: "failed", errorCategory: "internal", parts: [], modelCalls, costMicros });
      return { status: "failed" };
    }
  },
});
