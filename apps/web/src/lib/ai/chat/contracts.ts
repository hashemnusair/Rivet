/**
 * Shared contracts for Ask RIVET, the conversation panel.
 *
 * Imported by the Convex functions, the preview adapter and the panel, so
 * this module uses relative imports only and has no runtime dependencies.
 *
 * A conversation is private to the person who started it. Every record the
 * assistant reads, whether attached from a screen or looked up with a tool,
 * is loaded through that person's own access by the existing domain reads.
 * Nothing here writes business records.
 */

import type { AiErrorCategory } from "../contracts";

export const CHAT_PROMPT_VERSION = "rivet-chat.v1";

/** Longest message a person can send. */
export const CHAT_TEXT_MAX = 4_000;
/** Context items attached to one message. */
export const CHAT_CONTEXT_MAX = 8;
/** Files attached to one message. */
export const CHAT_FILES_MAX = 4;
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const CHAT_FILE_TYPES = [...CHAT_IMAGE_TYPES, "application/pdf"] as const;
export type ChatFileType = (typeof CHAT_FILE_TYPES)[number];
/** Conversations and their files are removed this long after the last message. */
export const CHAT_RETENTION_MS = 30 * 86_400_000;

/**
 * What the panel can put in front of the assistant. Each kind resolves on the
 * server through the asker's access; the label is only what the person saw.
 */
export type ChatSourceKind =
  | "member"
  | "member_payments"
  | "member_timeline"
  | "lead"
  | "member_list"
  | "lead_list"
  | "today"
  | "renewals"
  | "at_risk"
  | "tasks"
  | "payments"
  | "shifts"
  | "classes"
  | "report"
  | "plans";

export const CHAT_SOURCE_KINDS: readonly ChatSourceKind[] = ["member", "member_payments", "member_timeline", "lead", "member_list", "lead_list", "today", "renewals", "at_risk", "tasks", "payments", "shifts", "classes", "report", "plans"];

export type ChatContextParams = Record<string, string | number | boolean>;

export interface ChatContextItem {
  kind: ChatSourceKind;
  /** The record, for record kinds. */
  id?: string;
  /** Filters or a date range; validated per kind on the server. */
  params?: ChatContextParams;
  /** What the person saw on the chip. Never read as data. */
  label: string;
}

/** Where the person was when they asked. */
export interface ChatScreen {
  /** Path and query, without the host. */
  route: string;
  /** The page title in the person's language. */
  title: string;
}

export interface ChatAttachmentView {
  id: string;
  name: string;
  mediaType: ChatFileType;
  size: number;
  /** A short-lived link for the person who attached it. */
  url?: string;
}

export type ChatToolKey =
  | "search_members"
  | "get_member"
  | "search_leads"
  | "get_lead"
  | "list_tasks"
  | "renewals_due"
  | "at_risk_members"
  | "today_overview"
  | "list_payments"
  | "cash_shifts"
  | "class_schedule"
  | "gym_report"
  | "list_plans"
  | "open_screen";

/** What a finished lookup found, presented in the reader's language by the panel. */
export interface ChatToolOutcome {
  /** Rows found, when the lookup returns a list. */
  count?: number;
  /** Total rows matching, when more exist than were read. */
  total?: number;
  /** A name or title the lookup was about. */
  subject?: string;
  /** Why a lookup could not run. */
  failure?: "forbidden" | "not_found" | "invalid" | "unavailable";
}

export interface ChatScreenLink {
  href: string;
  /** Which screen: drives the icon and the default label. */
  screen: string;
  /** What the assistant called it; plain text. */
  label: string;
}

export type ChatPart =
  | { type: "thinking"; id: string; text: string; startedAt: number; endedAt?: number }
  | {
      type: "tool";
      id: string;
      tool: ChatToolKey;
      /** The validated input, for the step's label (a search, a name, a date range). */
      input: Record<string, string | number | boolean>;
      status: "running" | "done" | "error";
      outcome?: ChatToolOutcome;
      link?: ChatScreenLink;
      startedAt: number;
      endedAt?: number;
    }
  | { type: "text"; id: string; text: string };

export type ChatMessageStatus = "pending" | "streaming" | "complete" | "stopped" | "failed";

export interface ChatMessageView {
  id: string;
  /** The id the panel gave the message before the server saved it. */
  clientId?: string;
  role: "user" | "assistant";
  seq: number;
  /** The person's words; for an answer, its text without the work log. */
  text: string;
  parts: ChatPart[];
  context: ChatContextItem[];
  screen?: ChatScreen;
  attachments: ChatAttachmentView[];
  status: ChatMessageStatus;
  error?: AiErrorCategory;
  createdAt: string;
  completedAt?: string;
}

export interface ChatThreadView {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Test answers come from RIVET's preview reader, not a live assistant. */
  source: "fixture" | "live";
  messages: ChatMessageView[];
}

export interface ChatSummaryView {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

/** The answer being written: read separately so a long conversation is not re-sent with every word. */
export interface ChatStreamView {
  messageId: string;
  status: ChatMessageStatus;
  parts: ChatPart[];
  version: number;
}

/** A refused upload is removed in the same write, so refusals are results rather than errors. */
export type ChatFileRegisterResult =
  | { ok: true; file: ChatAttachmentView }
  | { ok: false; reason: "file_type" | "file_size" | "unavailable" };

export interface SendChatInput {
  chatId?: string;
  clientId: string;
  text: string;
  context: ChatContextItem[];
  screen?: ChatScreen;
  fileIds: string[];
  locale: "en" | "ar";
}

export interface SendChatResult {
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export function isChatMessageWorking(status: ChatMessageStatus): boolean {
  return status === "pending" || status === "streaming";
}

/** The answer's text, joined from its text parts. */
export function chatAnswerText(parts: readonly ChatPart[]): string {
  return parts.filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text").map((part) => part.text).join("\n\n").trim();
}

/** A stable key for one context item, used to avoid sending the same record twice. */
export function chatContextKey(item: Pick<ChatContextItem, "kind" | "id" | "params">): string {
  const params = item.params ? Object.keys(item.params).sort().map((key) => `${key}=${String(item.params![key])}`).join("&") : "";
  return `${item.kind}:${item.id ?? ""}:${params}`;
}
