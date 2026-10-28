import { ApiError, ERR } from "@/lib/api/errors";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import {
  CHAT_CONTEXT_MAX,
  CHAT_FILE_TYPES,
  CHAT_FILES_MAX,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_PDF_MAX_BYTES,
  CHAT_TEXT_MAX,
  chatActionOpen,
  chatAnswerText,
  chatContextKey,
  type ChatAction,
  type ChatAttachmentView,
  type ChatContextItem,
  type ChatFileRegisterResult,
  type ChatFileType,
  type ChatMessageView,
  type ChatStreamView,
  type ChatSummaryView,
  type ChatThreadView,
  type DecideChatActionInput,
  type SendChatInput,
  type SendChatResult,
} from "@/lib/ai/chat/contracts";
import { actionBasisHolds, actionOperation, actionResult, decidedActionLines, withAction } from "@/lib/ai/chat/actions";
import { runChatTurn, type ModelMessage } from "@/lib/ai/chat/engine";
import { fixtureChatModel } from "@/lib/ai/chat/fixture-model";
import { buildHistory, type StoredChatTurn } from "@/lib/ai/chat/history";
import { CHAT_SYSTEM_PROMPT, composeUserTurn, sentContextKeys, type ChatFrame } from "@/lib/ai/chat/prompt";
import { loadSource, parseContextItem, type ChatEnv, type ChatReader } from "@/lib/ai/chat/sources";
import { CHAT_TOOLS } from "@/lib/ai/chat/tools";

/**
 * Wazen (Ask RIVET in code) in the local preview. It runs the same answer loop, tools and
 * context sources as the server, reading the seeded preview data through the
 * preview's own read methods, with RIVET's preview model streaming its words
 * at a realistic pace. Conversations live in memory like the rest of the
 * preview. Answers are labelled as test answers in the panel.
 */

export interface MockChatHost {
  reader: ChatReader;
  env(): ChatEnv;
  frame(): Omit<ChatFrame, "now" | "screen" | "attached" | "files">;
  /** Why the conversation is unavailable right now, if it is. */
  blocked(): AiErrorCategory | undefined;
  userId(): string;
  /** Pace streamed words like a live model; off when preview latency is off. */
  paced(): boolean;
  /** A membership's end date and status today, through the preview's own reads. */
  membershipBasis(membershipId: string): Promise<{ endDate: string; status: string }>;
  /** Runs an existing operation as the signed-in person, exactly as its screen would. */
  execute(operation: ReturnType<typeof actionOperation>["operation"], input: Record<string, unknown>): Promise<unknown>;
}

type StoredMessage = ChatMessageView & { modelText?: string; turnMessages?: ModelMessage[]; stopRequested?: boolean };

interface MockChat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sentContext: Record<string, number>;
  messages: StoredMessage[];
}

type Listener<T> = { onValue: (value: T) => void; onError?: (error: unknown) => void };

const CONTEXT_FRESH_MS = 10 * 60_000;
/** The server writes progress about this often; the preview matches it. */
const EMIT_INTERVAL_MS = 60;

function id(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function title(text: string): string {
  const line = text.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  if (line.length <= 60) return line || "Conversation";
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function publicView(message: StoredMessage): ChatMessageView {
  const { modelText: _modelText, turnMessages: _turnMessages, stopRequested: _stop, ...view } = message;
  return clone(view);
}

export class MockChatEngine {
  private readonly chats = new Map<string, MockChat>();
  private readonly streams = new Map<string, ChatStreamView>();
  private readonly files = new Map<string, ChatAttachmentView & { userId: string; chatId?: string }>();
  private readonly chatListeners = new Map<string, Set<Listener<ChatThreadView>>>();
  private readonly streamListeners = new Map<string, Set<Listener<ChatStreamView | null>>>();
  private readonly pendingEmit = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly host: MockChatHost) {}

  dispose(): void {
    this.disposed = true;
    for (const timer of this.pendingEmit.values()) clearTimeout(timer);
    this.pendingEmit.clear();
    for (const file of this.files.values()) if (file.url?.startsWith("blob:")) URL.revokeObjectURL?.(file.url);
  }

  private refuse(reason: AiErrorCategory): never {
    throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, "This feature is not available for your gym. Ask your gym owner.", { details: { reason } });
  }

  private own(chatId: string): MockChat {
    const chat = this.chats.get(chatId);
    if (!chat || chat.userId !== this.host.userId()) throw ApiError.of(ERR.NOT_FOUND, "This record could not be found");
    return chat;
  }

  private find(messageId: string): { chat: MockChat; message: StoredMessage } {
    for (const chat of this.chats.values()) {
      const message = chat.messages.find((item) => item.id === messageId);
      if (message) return { chat: this.own(chat.id), message };
    }
    throw ApiError.of(ERR.NOT_FOUND, "This record could not be found");
  }

  private view(chat: MockChat): ChatThreadView {
    return { id: chat.id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt, source: "fixture", messages: chat.messages.map(publicView) };
  }

  private emitChat(chat: MockChat): void {
    const listeners = this.chatListeners.get(chat.id);
    if (!listeners?.size) return;
    const value = this.view(chat);
    for (const listener of listeners) listener.onValue(clone(value));
  }

  private emitStream(messageId: string, now = false): void {
    const send = () => {
      this.pendingEmit.delete(messageId);
      const value = this.streams.get(messageId) ?? null;
      for (const listener of this.streamListeners.get(messageId) ?? []) listener.onValue(value ? clone(value) : null);
    };
    if (now) {
      const timer = this.pendingEmit.get(messageId);
      if (timer) clearTimeout(timer);
      send();
      return;
    }
    if (!this.pendingEmit.has(messageId)) this.pendingEmit.set(messageId, setTimeout(send, EMIT_INTERVAL_MS));
  }

  list(): ChatSummaryView[] {
    return [...this.chats.values()]
      .filter((chat) => chat.userId === this.host.userId() && chat.messages.length)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((chat) => ({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, messageCount: chat.messages.length }));
  }

  get(chatId: string): ChatThreadView {
    return this.view(this.own(chatId));
  }

  subscribe(chatId: string, onValue: (chat: ChatThreadView) => void, onError?: (error: unknown) => void): () => void {
    const listener = { onValue, onError };
    try {
      const chat = this.own(chatId);
      const set = this.chatListeners.get(chatId) ?? new Set();
      set.add(listener);
      this.chatListeners.set(chatId, set);
      queueMicrotask(() => onValue(this.view(chat)));
    } catch (error) {
      queueMicrotask(() => onError?.(error));
    }
    return () => { this.chatListeners.get(chatId)?.delete(listener); };
  }

  subscribeStream(messageId: string, onValue: (stream: ChatStreamView | null) => void, onError?: (error: unknown) => void): () => void {
    const listener = { onValue, onError };
    try {
      this.find(messageId);
      const set = this.streamListeners.get(messageId) ?? new Set();
      set.add(listener);
      this.streamListeners.set(messageId, set);
      queueMicrotask(() => {
        const value = this.streams.get(messageId);
        onValue(value ? clone(value) : null);
      });
    } catch (error) {
      queueMicrotask(() => onError?.(error));
    }
    return () => { this.streamListeners.get(messageId)?.delete(listener); };
  }

  send(input: SendChatInput): SendChatResult {
    const blocked = this.host.blocked();
    if (blocked) this.refuse(blocked);
    const words = (input.text ?? "").trim();
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (!words && !fileIds.length) throw ApiError.of(ERR.VALIDATION, "Write a message first.");
    if (words.length > CHAT_TEXT_MAX) throw ApiError.of(ERR.VALIDATION, "This message is too long. Shorten it and try again.");
    if (fileIds.length > CHAT_FILES_MAX) throw ApiError.of(ERR.VALIDATION, "Too many files are waiting to be sent. Send or remove some first.");
    const context = (input.context ?? []).slice(0, CHAT_CONTEXT_MAX).map(parseContextItem).filter((item): item is ChatContextItem => Boolean(item));
    const now = new Date().toISOString();
    let chat: MockChat;
    if (input.chatId) {
      chat = this.own(input.chatId);
      if (chat.messages.some((message) => message.role === "assistant" && (message.status === "pending" || message.status === "streaming"))) throw ApiError.of(ERR.CONFLICT, "Wait for the current answer to finish, or stop it first.");
    } else {
      chat = { id: id("chat"), userId: this.host.userId(), title: title(words || "Files"), createdAt: now, updatedAt: now, sentContext: {}, messages: [] };
      this.chats.set(chat.id, chat);
    }
    const attachments = fileIds.map((fileId) => {
      const file = this.files.get(fileId);
      if (!file || file.userId !== this.host.userId() || (file.chatId && file.chatId !== chat.id)) throw ApiError.of(ERR.VALIDATION, "This file is no longer available. Attach it again.");
      file.chatId = chat.id;
      return { id: file.id, name: file.name, mediaType: file.mediaType, size: file.size, ...(file.url ? { url: file.url } : {}) };
    });
    const question: StoredMessage = { id: id("msg"), clientId: input.clientId, role: "user", seq: chat.messages.length + 1, text: words, parts: [], context, ...(input.screen ? { screen: { route: input.screen.route.slice(0, 300), title: input.screen.title.slice(0, 120) } } : {}), attachments, status: "complete", createdAt: now, completedAt: now };
    const answer: StoredMessage = { id: id("msg"), clientId: `${input.clientId}:answer`, role: "assistant", seq: chat.messages.length + 2, text: "", parts: [], context: [], attachments: [], status: "pending", createdAt: now };
    chat.messages.push(question, answer);
    chat.updatedAt = now;
    this.emitChat(chat);
    void this.answer(chat, answer);
    return { chatId: chat.id, userMessageId: question.id, assistantMessageId: answer.id };
  }

  retry(messageId: string): SendChatResult {
    const { chat, message } = this.find(messageId);
    if (message.role !== "assistant" || chat.messages.at(-1) !== message || message.status === "pending" || message.status === "streaming") throw ApiError.of(ERR.CONFLICT, "Wait for the current answer to finish, or stop it first.");
    const blocked = this.host.blocked();
    if (blocked) this.refuse(blocked);
    Object.assign(message, { status: "pending", parts: [], text: "", error: undefined, completedAt: undefined, stopRequested: false, turnMessages: undefined });
    chat.updatedAt = new Date().toISOString();
    this.emitChat(chat);
    void this.answer(chat, message);
    const question = chat.messages.filter((item) => item.role === "user" && item.seq < message.seq).at(-1);
    return { chatId: chat.id, userMessageId: question?.id ?? "", assistantMessageId: message.id };
  }

  stop(messageId: string): void {
    const { chat, message } = this.find(messageId);
    if (message.status === "pending" || message.status === "streaming") {
      message.stopRequested = true;
      this.emitChat(chat);
    }
  }

  rename(chatId: string, name: string): ChatSummaryView {
    const chat = this.own(chatId);
    const next = name.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, 80).trim();
    if (!next) throw ApiError.of(ERR.VALIDATION, "Write a name first.");
    chat.title = next;
    this.emitChat(chat);
    return { id: chat.id, title: chat.title, updatedAt: chat.updatedAt, messageCount: chat.messages.length };
  }

  /** The person's decision on a proposed change; mirrors `decideAction` in convex/aiChatOps.ts. */
  async decide(input: DecideChatActionInput): Promise<ChatAction> {
    const { chat, message } = this.find(input.messageId);
    const part = message.parts.find((item) => item.type === "tool" && item.id === input.partId);
    const action = part?.type === "tool" ? part.action : undefined;
    if (message.role !== "assistant" || !action) throw ApiError.of(ERR.NOT_FOUND, "This record could not be found");
    if (action.status !== "proposed") throw ApiError.of(ERR.CONFLICT, "This was already decided.");
    const now = Date.now();
    if (input.decision === "dismiss") {
      const next: ChatAction = { ...action, status: "dismissed", decidedAt: new Date(now).toISOString() };
      message.parts = withAction(message.parts, input.partId, next);
      this.emitChat(chat);
      return clone(next);
    }
    if (message.status !== "complete" || !chatActionOpen(action, message.completedAt, now)) throw ApiError.of(ERR.CONFLICT, "This is out of date. Ask Wazen again.");
    const blocked = this.host.blocked();
    if (blocked) this.refuse(blocked);
    if (!actionBasisHolds(action, await this.host.membershipBasis(action.membershipId))) throw ApiError.of(ERR.CONFLICT, "This membership changed after Wazen checked it. Ask Wazen again.");
    const { operation, input: operationInput } = actionOperation(action, `wazen:${message.id}:${input.partId}`);
    const result = await this.host.execute(operation, operationInput);
    const next: ChatAction = { ...action, status: "done", decidedAt: new Date(now).toISOString(), result: actionResult(action, result) };
    message.parts = withAction(message.parts, input.partId, next);
    chat.updatedAt = new Date(now).toISOString();
    this.emitChat(chat);
    return clone(next);
  }

  delete(chatId: string): void {
    const chat = this.own(chatId);
    for (const message of chat.messages) message.stopRequested = true;
    for (const file of this.files.values()) if (file.chatId === chatId) {
      if (file.url?.startsWith("blob:")) URL.revokeObjectURL?.(file.url);
      this.files.delete(file.id);
    }
    this.chats.delete(chatId);
  }

  upload(file: Blob, input: { name: string; mediaType: ChatFileType }): ChatFileRegisterResult {
    const blocked = this.host.blocked();
    if (blocked) this.refuse(blocked);
    if (!(CHAT_FILE_TYPES as readonly string[]).includes(input.mediaType)) return { ok: false, reason: "file_type" };
    if (file.size > (input.mediaType === "application/pdf" ? CHAT_PDF_MAX_BYTES : CHAT_IMAGE_MAX_BYTES)) return { ok: false, reason: "file_size" };
    const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined;
    const view: ChatAttachmentView = { id: id("file"), name: input.name.slice(0, 120) || "file", mediaType: input.mediaType, size: file.size, ...(url ? { url } : {}) };
    this.files.set(view.id, { ...view, userId: this.host.userId() });
    return { ok: true, file: view };
  }

  private async answer(chat: MockChat, message: StoredMessage): Promise<void> {
    if (message.stopRequested) {
      Object.assign(message, { status: "stopped", completedAt: new Date().toISOString() });
      this.emitChat(chat);
      return;
    }
    message.status = "streaming";
    this.streams.set(message.id, { messageId: message.id, status: "streaming", parts: [], version: 0 });
    this.emitChat(chat);
    this.emitStream(message.id, true);
    const index = chat.messages.indexOf(message);
    const question = chat.messages[index - 1]!;
    const env = this.host.env();
    const now = Date.now();
    try {
      const attached: ChatFrame["attached"] = await Promise.all(question.context.map(async (item) => {
        const providedAt = chat.sentContext[chatContextKey(item)];
        if (providedAt !== undefined && now - providedAt < CONTEXT_FRESH_MS) return { item, providedAt };
        return { item, result: await loadSource(this.host.reader, item, env) };
      }));
      const decided = decidedActionLines(chat.messages.slice(0, index - 1).filter((item) => item.role === "assistant"));
      const modelText = composeUserTurn({ ...this.host.frame(), decided, now: new Date(now), ...(question.screen ? { screen: question.screen } : {}), attached, files: question.attachments.map((file) => ({ name: file.name, kind: file.mediaType === "application/pdf" ? "pdf" : "image", included: false })) }, question.text || "(See the attached files.)");
      const earlier: StoredChatTurn[] = chat.messages.slice(0, index - 1).map((item) => ({ role: item.role, text: item.text, status: item.status, ...(item.modelText ? { modelText: item.modelText } : {}), ...(item.turnMessages ? { turnMessages: item.turnMessages } : {}) }));
      const paced = this.host.paced();
      const outcome = await runChatTurn({
        model: fixtureChatModel(paced ? { delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } : {}),
        reader: this.host.reader,
        env,
        system: CHAT_SYSTEM_PROMPT,
        tools: CHAT_TOOLS,
        history: buildHistory(earlier),
        userContent: [{ type: "text", text: modelText }],
        maxCalls: 6,
        idPrefix: message.id,
        hooks: {
          emit: (parts) => {
            const stream = this.streams.get(message.id);
            if (!stream || this.disposed) return;
            stream.parts = clone([...parts]);
            stream.version += 1;
            this.emitStream(message.id);
          },
          beforeCall: async () => this.host.blocked(),
          afterCall: async () => undefined,
          stopRequested: () => Boolean(message.stopRequested) || this.disposed,
          now: () => Date.now(),
        },
      });
      question.modelText = modelText;
      for (const key of sentContextKeys(attached)) chat.sentContext[key] = now;
      const status = message.stopRequested && outcome.status === "complete" ? "stopped" : outcome.status;
      Object.assign(message, { status, parts: outcome.parts, text: chatAnswerText(outcome.parts), turnMessages: outcome.turnMessages, completedAt: new Date().toISOString(), ...(outcome.error ? { error: outcome.error } : {}) });
    } catch {
      Object.assign(message, { status: "failed", error: "internal", completedAt: new Date().toISOString() });
    }
    chat.updatedAt = new Date().toISOString();
    this.streams.delete(message.id);
    if (!this.chats.has(chat.id)) return;
    this.emitChat(chat);
    this.emitStream(message.id, true);
  }
}
