"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import type { ChatAttachmentView, ChatContextItem, ChatMessageView, ChatPart } from "@/lib/ai/chat/contracts";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { AssistantMessage, UserMessage } from "./messages";
import { ContextChip } from "./context-chip";

export type ConversationItem =
  | { key: string; role: "user"; text: string; context: ChatContextItem[]; attachments: ChatAttachmentView[] }
  | { key: string; role: "assistant"; messageId?: string; status: ChatMessageView["status"]; parts: ChatPart[]; error?: AiErrorCategory; canRetry: boolean };

/** Distance from the bottom, in pixels, within which the view keeps following new words. */
const FOLLOW_SLACK = 72;

/**
 * The conversation. It follows a streaming answer only while the person is
 * at the bottom; scrolling up to read stops the following, and a control
 * brings them back. Following is a direct scroll per frame, never a smooth
 * scroll racing the text, so nothing jitters.
 */
export function Conversation({ items, empty, onRetry, onNavigate }: { items: ConversationItem[]; empty: ReactNode; onRetry: (messageId: string) => void; onNavigate?: () => void }) {
  const { t } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const userCount = items.filter((item) => item.role === "user").length;
  const lastUserCount = useRef(userCount);

  // Follow growth while pinned to the bottom.
  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (following.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Opening a conversation starts at its end.
  const firstKey = items[0]?.key;
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    following.current = true;
  }, [firstKey]);

  // A new question always brings the view back to the end.
  useLayoutEffect(() => {
    if (userCount > lastUserCount.current) {
      following.current = true;
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      setShowJump(false);
    }
    lastUserCount.current = userCount;
  }, [userCount]);

  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    following.current = distance <= FOLLOW_SLACK;
    setShowJump(distance > FOLLOW_SLACK * 2);
  };

  const jump = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    following.current = true;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  };

  const lastAssistant = [...items].reverse().find((item) => item.role === "assistant");
  return (
    <div className="relative h-full">
      <div ref={scrollRef} onScroll={onScroll} className="ask-scroll h-full overflow-y-auto overscroll-contain" data-testid="ask-scroll">
        <div ref={contentRef} className={cn("mx-auto w-full max-w-[720px] px-3 sm:px-4", items.length ? "space-y-5 pb-6 pt-4" : "h-full")}>
          {items.length ? items.map((item) => item.role === "user"
            ? <UserMessage key={item.key} text={item.text} context={item.context} attachments={item.attachments} />
            : <AssistantMessage key={item.key} status={item.status} parts={item.parts} error={item.error} canRetry={item.canRetry && item === lastAssistant} onRetry={item.messageId ? () => onRetry(item.messageId!) : undefined} onNavigate={onNavigate} />) : empty}
        </div>
      </div>
      <button
        type="button"
        onClick={jump}
        tabIndex={showJump ? 0 : -1}
        aria-hidden={!showJump}
        className={cn(
          "absolute bottom-3 start-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[12px] font-medium text-ink-2 shadow-pop transition-[opacity,transform] duration-200 hover:text-ink rtl:translate-x-1/2",
          showJump ? "opacity-100" : "pointer-events-none translate-y-1 opacity-0",
        )}
      >
        <ArrowDown className="size-3.5" aria-hidden />
        {t("askRivet.message.jumpToLatest")}
      </button>
    </div>
  );
}

/** Before the first message: what RIVET can see here, and questions worth asking on this screen. */
export function EmptyConversation({ title, focus, prompts, onPrompt }: { title: string; focus?: ChatContextItem; prompts: string[]; onPrompt: (prompt: string) => void }) {
  const { t } = useLocale();
  return (
    <div className="flex h-full flex-col justify-end pb-2 pt-8" data-testid="ask-empty">
      <div className="mb-2 flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
        <span className="shrink-0 font-medium">{t("askRivet.empty.onScreen")}</span>
        {focus ? <ContextChip item={focus} tone="message" /> : <bdi className="truncate">{title}</bdi>}
      </div>
      <ul className="divide-y divide-line border-y border-line" data-testid="ask-prompts">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button type="button" onClick={() => onPrompt(prompt)} className="group/prompt flex w-full items-center gap-3 py-2.5 text-start text-[13.5px] text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              <bdi className="min-w-0 flex-1">{prompt}</bdi>
              <ArrowUpRight className="size-3.5 shrink-0 text-ink-4 transition-[color,transform] duration-150 group-hover/prompt:-translate-y-px group-hover/prompt:translate-x-px group-hover/prompt:text-ink-2 rtl:-scale-x-100 rtl:group-hover/prompt:-translate-x-px" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
