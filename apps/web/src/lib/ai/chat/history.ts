import type { ChatFileType, ChatMessageStatus } from "./contracts";
import type { ModelBlock, ModelImageType, ModelMessage } from "./engine";

/**
 * Rebuilds earlier turns of a conversation for the next request, within a
 * budget. The most recent answers replay with their lookups and results so
 * follow-up questions ("which of them owes money?") work; older answers
 * replay as their words only. Files are re-sent only for the latest turns
 * that had them. When the conversation outgrows the budget, the oldest turns
 * are left out and the assistant is told so.
 */

export interface StoredChatTurn {
  role: "user" | "assistant";
  /** A person's turn: the composed text the assistant saw. */
  modelText?: string;
  /** A person's turn: its files; `data` is present only when they should be sent again. */
  files?: Array<{ name: string; mediaType: ChatFileType; data?: string }>;
  /** An answer: its calls and lookups without reasoning. */
  turnMessages?: ModelMessage[];
  /** The person's words, or the answer's text. */
  text: string;
  status: ChatMessageStatus;
}

/** Answers that replay with their lookups. */
export const HISTORY_FULL_ANSWERS = 3;
/** Person turns whose files are sent again. */
export const HISTORY_FILE_TURNS = 2;
/** About 30k tokens of earlier conversation. */
export const HISTORY_CHARS_MAX = 120_000;
const IMAGE_WEIGHT = 6_000;
const DOCUMENT_WEIGHT = 24_000;

export const EARLIER_LEFT_OUT = "[Earlier messages in this conversation are not included.]";

function weight(message: ModelMessage): number {
  return message.content.reduce((sum, block) => {
    switch (block.type) {
      case "text": return sum + block.text.length;
      case "image": return sum + IMAGE_WEIGHT;
      case "document": return sum + DOCUMENT_WEIGHT;
      case "tool_use": return sum + JSON.stringify(block.input ?? {}).length + 40;
      case "tool_result": return sum + block.content.length;
      default: return sum;
    }
  }, 0);
}

/** Which person turns (by index) should carry their files again: the latest ones that had files. */
export function turnsWithFiles(turns: readonly Pick<StoredChatTurn, "role" | "files">[], keep = HISTORY_FILE_TURNS): Set<number> {
  const out = new Set<number>();
  for (let index = turns.length - 1; index >= 0 && out.size < keep; index--) {
    if (turns[index]!.role === "user" && turns[index]!.files?.length) out.add(index);
  }
  return out;
}

function fileBlock(file: { name: string; mediaType: ChatFileType; data: string }): ModelBlock {
  return file.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data }, title: file.name.slice(0, 120) }
    : { type: "image", source: { type: "base64", media_type: file.mediaType as ModelImageType, data: file.data } };
}

/** Earlier turns, ready to precede the new message. */
/** Earlier turns read for one answer; anything older is beyond the budget anyway. */
export const HISTORY_TURNS_READ = 40;

export function buildHistory(turns: readonly StoredChatTurn[], options: { fullAnswers?: number; charsMax?: number; earlierOmitted?: boolean } = {}): ModelMessage[] {
  const fullAnswers = options.fullAnswers ?? HISTORY_FULL_ANSWERS;
  const charsMax = options.charsMax ?? HISTORY_CHARS_MAX;
  const answerIndexes = turns.map((turn, index) => (turn.role === "assistant" ? index : -1)).filter((index) => index >= 0);
  const recentAnswers = new Set(answerIndexes.slice(-fullAnswers));

  // One group per stored turn, so trimming never splits a lookup from its result.
  const groups: ModelMessage[][] = [];
  turns.forEach((turn, index) => {
    if (turn.role === "user") {
      const files = (turn.files ?? []).filter((file): file is { name: string; mediaType: ChatFileType; data: string } => Boolean(file.data));
      const dropped = (turn.files?.length ?? 0) - files.length;
      const content: ModelBlock[] = [...files.map(fileBlock), { type: "text", text: turn.modelText ?? turn.text }];
      if (dropped > 0) content.push({ type: "text", text: "(Files from this message were shared earlier and are no longer included.)" });
      groups.push([{ role: "user", content }]);
      return;
    }
    if (recentAnswers.has(index) && turn.turnMessages?.length) {
      groups.push(turn.turnMessages);
      return;
    }
    if (turn.text.trim()) groups.push([{ role: "assistant", content: [{ type: "text", text: turn.text.trim() }] }]);
  });

  let total = groups.reduce((sum, group) => sum + group.reduce((inner, message) => inner + weight(message), 0), 0);
  let trimmed = Boolean(options.earlierOmitted);
  while (groups.length > 1 && total > charsMax) {
    const removed = groups.shift()!;
    total -= removed.reduce((sum, message) => sum + weight(message), 0);
    trimmed = true;
  }
  // The conversation must open with the person; drop a leading answer left by trimming.
  while (groups.length && groups[0]![0]!.role !== "user") {
    groups.shift();
    trimmed = true;
  }
  const messages = groups.flat();
  if (trimmed && messages.length) {
    const first = messages[0]!;
    messages[0] = { ...first, content: [{ type: "text", text: EARLIER_LEFT_OUT }, ...first.content] };
  }
  return messages;
}
