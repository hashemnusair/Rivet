import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { domainError, requireActor, type ActorContext, type RequestArgs } from "./security";
import { adapterConfig, aiSettingsFor, authorityInput, newAiPublicId, spentMicros } from "./aiPolicy";
import type { AiDomainPort } from "./ai";
import { TOOLS, toolBlocked } from "../src/lib/ai/capabilities";
import { budgetBlocked } from "../src/lib/ai/model";
import type { AiErrorCategory } from "../src/lib/ai/contracts";
import {
  CHAT_CONTEXT_MAX,
  CHAT_FILE_TYPES,
  CHAT_FILES_MAX,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_PDF_MAX_BYTES,
  CHAT_RETENTION_MS,
  CHAT_TEXT_MAX,
  chatActionOpen,
  type ChatAction,
  type ChatAttachmentView,
  type ChatContextItem,
  type ChatFileRegisterResult,
  type ChatFileType,
  type ChatMessageView,
  type ChatPart,
  type ChatStreamView,
  type ChatSummaryView,
  type ChatThreadView,
  type SendChatResult,
} from "../src/lib/ai/chat/contracts";
import { parseContextItem } from "../src/lib/ai/chat/sources";
import { actionBasisHolds, actionOperation, actionResult, withAction } from "../src/lib/ai/chat/actions";

/**
 * Ask RIVET (shown to people as Wazen) operations on the domain transport, and the policy and record
 * helpers the answer action shares. This module never imports `domain.ts`,
 * which dispatches to it.
 *
 * Ask RIVET on the server. Conversations are private to the person who
 * started them. Sending saves the person's message and an empty answer; the
 * panel then calls `respond`, which runs as that same signed-in person, so
 * every record the assistant reads goes through the existing domain reads
 * with their access. The answer streams into a separate row that the panel
 * watches, and the finished answer replaces it in one write.
 */

type ReadCtx = QueryCtx | MutationCtx;
export type Data = Record<string, unknown>;

/** Messages in one conversation, counting answers. */
export const MAX_MESSAGES = 200;
/** Uploaded files waiting to be sent, per person. */
export const MAX_PENDING_FILES = 20;
export const UNATTACHED_FILE_MS = 86_400_000;
/** An answer the panel never started is marked failed after this. */
export const UNSTARTED_MS = 45_000;
/** An answer that stopped reporting progress is marked failed after this. */
export const STALLED_MS = 3 * 60_000;
/** A record sent this recently is not sent again; the assistant is told it is already above. */
export const CONTEXT_FRESH_MS = 10 * 60_000;
/** Model calls in one answer, including the written one. */
export const MAX_MODEL_CALLS = 6;
export const FLUSH_INTERVAL_MS = 60;
export const HEARTBEAT_MS = 1_000;

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function iso(value: number | undefined): string | undefined {
  return value === undefined ? undefined : new Date(value).toISOString();
}

/** A title from the first message: its first line, cut at a word. */
export function chatTitle(message: string): string {
  const line = message.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  if (line.length <= 60) return line || "Conversation";
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function requireHuman(actor: ActorContext): void {
  if (actor.delegation) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
}

/**
 * Whether this person may use Ask RIVET right now: deployment on, no stop,
 * the gym available with assistance and the capability on, and, for a live
 * assistant, both the gym's and RIVET's approval to send member details.
 */
export async function chatBlocked(ctx: ReadCtx, actor: ActorContext, entitled: string[]): Promise<AiErrorCategory | undefined> {
  const blocked = toolBlocked(TOOLS["chat.ask"]!, await authorityInput(ctx, actor, "chat", entitled));
  if (blocked) return blocked;
  const config = adapterConfig();
  if (config.mode !== "live") return undefined;
  if (!config.ready || config.protocol !== "anthropic_messages") return "model_unavailable";
  const settings = await aiSettingsFor(ctx, actor.organization._id);
  if (!settings?.externalProcessing || !config.memberDataApproved) return "data_policy";
  return undefined;
}

/** Refusals carry the safe reason so the panel can say why. */
function refuse(actor: ActorContext, reason: AiErrorCategory): never {
  domainError("FEATURE_NOT_AVAILABLE", "This feature is not available for your gym. Ask your gym owner.", { correlationId: actor.correlationId, details: { reason } });
}

export async function ownChat(ctx: ReadCtx, actor: ActorContext, chatId: string): Promise<Doc<"aiChats">> {
  const chat = chatId ? await ctx.db.query("aiChats").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", chatId)).unique() : null;
  // Another person's conversation reads exactly like a missing one.
  if (!chat || chat.userId !== actor.user._id || chat.expiresAt <= Date.now()) domainError("NOT_FOUND", "This record could not be found", { correlationId: actor.correlationId });
  return chat;
}

export async function ownMessage(ctx: ReadCtx, actor: ActorContext, messageId: string): Promise<{ chat: Doc<"aiChats">; message: Doc<"aiChatMessages"> }> {
  const message = messageId ? await ctx.db.query("aiChatMessages").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", messageId)).unique() : null;
  if (!message) domainError("NOT_FOUND", "This record could not be found", { correlationId: actor.correlationId });
  return { chat: await ownChat(ctx, actor, message.chatPublicId), message };
}

export async function chatMessages(ctx: ReadCtx, organizationId: Id<"organizations">, chatPublicId: string): Promise<Doc<"aiChatMessages">[]> {
  return await ctx.db.query("aiChatMessages").withIndex("by_organization_chat_seq", (q) => q.eq("organizationId", organizationId).eq("chatPublicId", chatPublicId)).take(MAX_MESSAGES + 2);
}

export async function filesById(ctx: ReadCtx, organizationId: Id<"organizations">, ids: readonly string[]): Promise<Map<string, Doc<"aiChatFiles">>> {
  const out = new Map<string, Doc<"aiChatFiles">>();
  for (const id of new Set(ids)) {
    const row = await ctx.db.query("aiChatFiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", id)).unique();
    if (row) out.set(id, row);
  }
  return out;
}

async function messageView(ctx: QueryCtx, row: Doc<"aiChatMessages">, files: Map<string, Doc<"aiChatFiles">>): Promise<ChatMessageView> {
  const attachments: ChatAttachmentView[] = [];
  for (const id of row.fileIds ?? []) {
    const file = files.get(id);
    if (!file) continue;
    const url = await ctx.storage.getUrl(file.storageId);
    attachments.push({ id, name: file.name, mediaType: file.mediaType as ChatFileType, size: file.size, ...(url ? { url } : {}) });
  }
  return {
    id: row.publicId,
    ...(row.clientId ? { clientId: row.clientId } : {}),
    role: row.role,
    seq: row.seq,
    text: row.text,
    parts: Array.isArray(row.parts) ? (row.parts as ChatPart[]) : [],
    context: Array.isArray(row.context) ? (row.context as ChatContextItem[]) : [],
    ...(row.screen ? { screen: row.screen } : {}),
    attachments,
    status: row.status,
    ...(row.errorCategory ? { error: row.errorCategory as AiErrorCategory } : {}),
    createdAt: new Date(row.createdAt).toISOString(),
    ...(row.completedAt ? { completedAt: iso(row.completedAt) } : {}),
  };
}

// ---------------------------------------------------------------------------
// Reads on the domain transport
// ---------------------------------------------------------------------------

export async function chatQuery(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  const actor = await requireActor(ctx, request);
  requireHuman(actor);
  if (operation === "ai.chat.list") {
    const now = Date.now();
    const rows = await ctx.db.query("aiChats").withIndex("by_organization_user_updated", (q) => q.eq("organizationId", actor.organization._id).eq("userId", actor.user._id)).order("desc").take(30);
    return rows.filter((row) => row.expiresAt > now && row.messageCount > 0).map((row): ChatSummaryView => ({ id: row.publicId, title: row.title, updatedAt: new Date(row.updatedAt).toISOString(), messageCount: row.messageCount }));
  }
  if (operation === "ai.chat.get") {
    const chat = await ownChat(ctx, actor, text(input.chatId));
    const rows = await chatMessages(ctx, actor.organization._id, chat.publicId);
    const files = await filesById(ctx, actor.organization._id, rows.flatMap((row) => row.fileIds ?? []));
    const messages: ChatMessageView[] = [];
    for (const row of rows) messages.push(await messageView(ctx, row, files));
    return { id: chat.publicId, title: chat.title, createdAt: new Date(chat.createdAt).toISOString(), updatedAt: new Date(chat.updatedAt).toISOString(), source: adapterConfig().mode === "live" ? "live" : "fixture", messages } satisfies ChatThreadView;
  }
  if (operation === "ai.chat.stream") {
    const { message } = await ownMessage(ctx, actor, text(input.messageId));
    const stream = await ctx.db.query("aiChatStreams").withIndex("by_organization_message", (q) => q.eq("organizationId", actor.organization._id).eq("messagePublicId", message.publicId)).unique();
    if (!stream) return null;
    return { messageId: message.publicId, status: message.status, parts: stream.parts as ChatPart[], version: stream.version } satisfies ChatStreamView;
  }
  domainError("NOT_FOUND", "This record could not be found", { correlationId: actor.correlationId });
}

// ---------------------------------------------------------------------------
// Writes on the domain transport
// ---------------------------------------------------------------------------

async function scheduleWatch(ctx: MutationCtx, organizationId: Id<"organizations">, messageId: string): Promise<void> {
  await ctx.scheduler.runAfter(UNSTARTED_MS, internal.aiChat.expireUnstarted, { organizationId, messageId });
}

async function sendMessage(ctx: MutationCtx, actor: ActorContext, input: Data, port: AiDomainPort): Promise<SendChatResult> {
  const blocked = await chatBlocked(ctx, actor, await port.entitledModules(ctx, actor));
  if (blocked) refuse(actor, blocked);
  const overBudget = budgetBlocked(adapterConfig(), await spentMicros(ctx, actor.organization._id));
  if (overBudget) refuse(actor, overBudget);

  const words = text(input.text);
  const fileIds = Array.isArray(input.fileIds) ? [...new Set(input.fileIds.map(String))] : [];
  if (!words && !fileIds.length) domainError("VALIDATION_ERROR", "Write a message first.", { correlationId: actor.correlationId });
  if (words.length > CHAT_TEXT_MAX) domainError("VALIDATION_ERROR", "This message is too long. Shorten it and try again.", { correlationId: actor.correlationId });
  if (fileIds.length > CHAT_FILES_MAX) domainError("VALIDATION_ERROR", "Too many files are waiting to be sent. Send or remove some first.", { correlationId: actor.correlationId });
  const context = (Array.isArray(input.context) ? input.context : []).slice(0, CHAT_CONTEXT_MAX).map(parseContextItem).filter((item): item is ChatContextItem => Boolean(item));
  const rawScreen = record(input.screen);
  const screen = text(rawScreen.route).startsWith("/") ? { route: text(rawScreen.route).slice(0, 300), title: text(rawScreen.title).slice(0, 120) } : undefined;
  const clientId = text(input.clientId).slice(0, 80) || undefined;
  const locale = input.locale === "ar" ? "ar" : "en";
  const now = Date.now();

  let chat: Doc<"aiChats">;
  if (text(input.chatId)) {
    chat = await ownChat(ctx, actor, text(input.chatId));
    const rows = await chatMessages(ctx, actor.organization._id, chat.publicId);
    if (rows.some((row) => row.role === "assistant" && (row.status === "pending" || row.status === "streaming"))) domainError("CONFLICT", "Wait for the current answer to finish, or stop it first.", { correlationId: actor.correlationId });
    if (chat.messageCount + 2 > MAX_MESSAGES) domainError("VALIDATION_ERROR", "This conversation is full. Start a new one.", { correlationId: actor.correlationId });
  } else {
    const id = await ctx.db.insert("aiChats", { organizationId: actor.organization._id, publicId: newAiPublicId("chat"), userId: actor.user._id, title: chatTitle(words || "Files"), messageCount: 0, sentContext: {}, createdAt: now, updatedAt: now, expiresAt: now + CHAT_RETENTION_MS });
    chat = (await ctx.db.get(id))!;
  }

  // Files must be this person's, unexpired, and not already sent elsewhere.
  const files = await filesById(ctx, actor.organization._id, fileIds);
  for (const id of fileIds) {
    const file = files.get(id);
    if (!file || file.userId !== actor.user._id || file.expiresAt <= now || (file.chatPublicId && file.chatPublicId !== chat.publicId)) domainError("VALIDATION_ERROR", "This file is no longer available. Attach it again.", { correlationId: actor.correlationId });
  }
  for (const file of files.values()) await ctx.db.patch(file._id, { chatPublicId: chat.publicId, expiresAt: now + CHAT_RETENTION_MS });

  const userMessageId = newAiPublicId("msg");
  const assistantMessageId = newAiPublicId("msg");
  await ctx.db.insert("aiChatMessages", { organizationId: actor.organization._id, chatPublicId: chat.publicId, publicId: userMessageId, ...(clientId ? { clientId } : {}), seq: chat.messageCount + 1, role: "user", text: words, context, ...(screen ? { screen } : {}), fileIds, locale, status: "complete", createdAt: now, updatedAt: now, completedAt: now });
  await ctx.db.insert("aiChatMessages", { organizationId: actor.organization._id, chatPublicId: chat.publicId, publicId: assistantMessageId, ...(clientId ? { clientId: `${clientId}:answer` } : {}), seq: chat.messageCount + 2, role: "assistant", text: "", parts: [], locale, status: "pending", createdAt: now, updatedAt: now });
  await ctx.db.patch(chat._id, { messageCount: chat.messageCount + 2, updatedAt: now, expiresAt: now + CHAT_RETENTION_MS });
  await scheduleWatch(ctx, actor.organization._id, assistantMessageId);
  return { chatId: chat.publicId, userMessageId, assistantMessageId };
}

async function retryMessage(ctx: MutationCtx, actor: ActorContext, input: Data, port: AiDomainPort): Promise<SendChatResult> {
  const { chat, message } = await ownMessage(ctx, actor, text(input.messageId));
  const rows = await chatMessages(ctx, actor.organization._id, chat.publicId);
  const last = rows.at(-1);
  // Only the latest answer, once it has finished, can be asked again.
  if (message.role !== "assistant" || last?._id !== message._id || message.status === "pending" || message.status === "streaming") domainError("CONFLICT", "Wait for the current answer to finish, or stop it first.", { correlationId: actor.correlationId });
  const blocked = await chatBlocked(ctx, actor, await port.entitledModules(ctx, actor));
  if (blocked) refuse(actor, blocked);
  const overBudget = budgetBlocked(adapterConfig(), await spentMicros(ctx, actor.organization._id));
  if (overBudget) refuse(actor, overBudget);
  const now = Date.now();
  await ctx.db.replace(message._id, { organizationId: message.organizationId, chatPublicId: message.chatPublicId, publicId: message.publicId, ...(message.clientId ? { clientId: message.clientId } : {}), seq: message.seq, role: "assistant", text: "", parts: [], ...(message.locale ? { locale: message.locale } : {}), status: "pending", createdAt: message.createdAt, updatedAt: now });
  await ctx.db.patch(chat._id, { updatedAt: now, expiresAt: now + CHAT_RETENTION_MS });
  await scheduleWatch(ctx, actor.organization._id, message.publicId);
  const question = rows.filter((row) => row.role === "user" && row.seq < message.seq).at(-1);
  return { chatId: chat.publicId, userMessageId: question?.publicId ?? "", assistantMessageId: message.publicId };
}

/** Longest conversation name a person can give. */
export const CHAT_TITLE_MAX = 80;

const ACTION_AUDIT: Record<ChatAction["kind"], string> = {
  renew_membership: "Renewal",
  freeze_membership: "Freeze",
  unfreeze_membership: "Early end of a freeze",
};

/**
 * The person's decision on a change the assistant proposed. Dismissing only
 * marks the card. Confirming checks the card is still current, then runs the
 * existing operation as this person in the same transaction, with its own
 * permission checks, validation, timeline and audit; anything it refuses
 * leaves both the record and the card unchanged.
 */
async function decideAction(ctx: MutationCtx, actor: ActorContext, input: Data, request: RequestArgs, port: AiDomainPort): Promise<ChatAction> {
  const { chat, message } = await ownMessage(ctx, actor, text(input.messageId));
  const partId = text(input.partId);
  const decision = input.decision === "confirm" || input.decision === "dismiss" ? input.decision : undefined;
  if (!decision) domainError("VALIDATION_ERROR", "Choose confirm or dismiss.", { correlationId: actor.correlationId });
  const parts = Array.isArray(message.parts) ? (message.parts as ChatPart[]) : [];
  const part = parts.find((item) => item.type === "tool" && item.id === partId);
  const action = part?.type === "tool" ? part.action : undefined;
  if (message.role !== "assistant" || !action) domainError("NOT_FOUND", "This record could not be found", { correlationId: actor.correlationId });
  if (action.status !== "proposed") domainError("CONFLICT", "This was already decided.", { correlationId: actor.correlationId });
  const now = Date.now();
  if (decision === "dismiss") {
    const next: ChatAction = { ...action, status: "dismissed", decidedAt: new Date(now).toISOString() };
    await ctx.db.patch(message._id, { parts: withAction(parts, partId, next), updatedAt: now });
    return next;
  }
  if (message.status !== "complete" || !chatActionOpen(action, iso(message.completedAt), now)) domainError("CONFLICT", "This is out of date. Ask Wazen again.", { correlationId: actor.correlationId });
  const blocked = await chatBlocked(ctx, actor, await port.entitledModules(ctx, actor));
  if (blocked) refuse(actor, blocked);
  const basis = await port.membershipBasis(ctx, actor, action.membershipId);
  if (!actionBasisHolds(action, basis)) domainError("CONFLICT", "This membership changed after Wazen checked it. Ask Wazen again.", { correlationId: actor.correlationId });
  const { operation, input: operationInput } = actionOperation(action, `wazen:${message.publicId}:${partId}`);
  const result = await port.executeApproved(ctx, operation, operationInput, request);
  const next: ChatAction = { ...action, status: "done", decidedAt: new Date(now).toISOString(), result: actionResult(action, result) };
  await ctx.db.patch(message._id, { parts: withAction(parts, partId, next), updatedAt: now });
  await ctx.db.patch(chat._id, { updatedAt: now, expiresAt: now + CHAT_RETENTION_MS });
  // The operation wrote its own audit; this one records that the change came from a Wazen card.
  await port.insertAudit(ctx, actor, { category: "ai", action: "ai.chat.action.confirm", entityType: "membership", entityId: action.membershipId, entityLabel: action.memberName, summary: `${ACTION_AUDIT[action.kind]} confirmed from a Wazen proposal`, ...(action.reason ? { reason: action.reason } : {}), ...(basis.branchId ? { branchId: basis.branchId } : {}) });
  return next;
}

export async function deleteChat(ctx: MutationCtx, organizationId: Id<"organizations">, chat: Doc<"aiChats">): Promise<void> {
  for (const row of await chatMessages(ctx, organizationId, chat.publicId)) {
    const stream = await ctx.db.query("aiChatStreams").withIndex("by_organization_message", (q) => q.eq("organizationId", organizationId).eq("messagePublicId", row.publicId)).unique();
    if (stream) await ctx.db.delete(stream._id);
    await ctx.db.delete(row._id);
  }
  for (const file of await ctx.db.query("aiChatFiles").withIndex("by_organization_chat", (q) => q.eq("organizationId", organizationId).eq("chatPublicId", chat.publicId)).take(MAX_MESSAGES * CHAT_FILES_MAX)) {
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(file._id);
  }
  await ctx.db.delete(chat._id);
}

export function fileTypeAllowed(mediaType: string): mediaType is ChatFileType {
  return (CHAT_FILE_TYPES as readonly string[]).includes(mediaType);
}

export async function chatMutation(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs, port: AiDomainPort): Promise<unknown> {
  const actor = await requireActor(ctx, request);
  requireHuman(actor);
  switch (operation) {
    case "ai.chat.send": return await sendMessage(ctx, actor, input, port);
    case "ai.chat.retry": return await retryMessage(ctx, actor, input, port);
    case "ai.chat.stop": {
      const { message } = await ownMessage(ctx, actor, text(input.messageId));
      const now = Date.now();
      if (message.status === "pending") await ctx.db.patch(message._id, { status: "stopped", stopRequestedAt: now, updatedAt: now, completedAt: now });
      else if (message.status === "streaming") await ctx.db.patch(message._id, { stopRequestedAt: now, updatedAt: now });
      return null;
    }
    case "ai.chat.action": return await decideAction(ctx, actor, input, request, port);
    case "ai.chat.rename": {
      const chat = await ownChat(ctx, actor, text(input.chatId));
      const title = text(input.title).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").slice(0, CHAT_TITLE_MAX).trim();
      if (!title) domainError("VALIDATION_ERROR", "Write a name first.", { correlationId: actor.correlationId });
      await ctx.db.patch(chat._id, { title });
      return { id: chat.publicId, title, updatedAt: new Date(chat.updatedAt).toISOString(), messageCount: chat.messageCount } satisfies ChatSummaryView;
    }
    case "ai.chat.delete": {
      const chat = await ownChat(ctx, actor, text(input.chatId));
      await deleteChat(ctx, actor.organization._id, chat);
      return null;
    }
    case "ai.chat.file.upload_url": {
      const blocked = await chatBlocked(ctx, actor, await port.entitledModules(ctx, actor));
      if (blocked) refuse(actor, blocked);
      const since = Date.now() - UNATTACHED_FILE_MS;
      const pending = (await ctx.db.query("aiChatFiles").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", actor.user._id).gte("createdAt", since)).take(MAX_PENDING_FILES + 1)).filter((file) => !file.chatPublicId);
      if (pending.length >= MAX_PENDING_FILES) domainError("VALIDATION_ERROR", "Too many files are waiting to be sent. Send or remove some first.", { correlationId: actor.correlationId });
      return await ctx.storage.generateUploadUrl();
    }
    case "ai.chat.file.register": {
      const blocked = await chatBlocked(ctx, actor, await port.entitledModules(ctx, actor));
      if (blocked) refuse(actor, blocked);
      const storageId = ctx.db.system.normalizeId("_storage", text(input.storageId));
      const meta = storageId ? await ctx.db.system.get(storageId) : null;
      if (!storageId || !meta) return { ok: false, reason: "unavailable" } satisfies ChatFileRegisterResult;
      const existing = await ctx.db.query("aiChatFiles").withIndex("by_storage", (q) => q.eq("storageId", storageId)).unique();
      if (existing) return { ok: false, reason: "unavailable" } satisfies ChatFileRegisterResult;
      // The panel declares the type; a stored type must agree. The bytes are checked again before anything is sent.
      const mediaType = text(input.mediaType).toLowerCase();
      const stored = text(meta.contentType).toLowerCase();
      if (!fileTypeAllowed(mediaType) || (stored && stored !== mediaType)) {
        await ctx.storage.delete(storageId);
        return { ok: false, reason: "file_type" } satisfies ChatFileRegisterResult;
      }
      if (meta.size > (mediaType === "application/pdf" ? CHAT_PDF_MAX_BYTES : CHAT_IMAGE_MAX_BYTES)) {
        await ctx.storage.delete(storageId);
        return { ok: false, reason: "file_size" } satisfies ChatFileRegisterResult;
      }
      const now = Date.now();
      const publicId = newAiPublicId("file");
      const name = (text(input.name) || (mediaType === "application/pdf" ? "document.pdf" : "image")).replace(/[\u0000-\u001f<>]/g, "").slice(0, 120);
      await ctx.db.insert("aiChatFiles", { organizationId: actor.organization._id, publicId, userId: actor.user._id, storageId, name, mediaType, size: meta.size, createdAt: now, expiresAt: now + UNATTACHED_FILE_MS });
      return { ok: true, file: { id: publicId, name, mediaType, size: meta.size } } satisfies ChatFileRegisterResult;
    }
  }
  domainError("NOT_FOUND", "This record could not be found", { correlationId: actor.correlationId });
}
