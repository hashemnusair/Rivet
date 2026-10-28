"use client";

import { useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import type { ChatPart, ChatStreamView, ChatSummaryView, ChatThreadView } from "@/lib/ai/chat/contracts";
import { useApiQuery } from "@/lib/hooks/use-api";

/**
 * Live data for Ask RIVET. The conversation and the answer being written are
 * two subscriptions: the conversation changes when a message is saved, the
 * stream changes with every few words, and neither re-sends the other.
 */

/** Remembered across panel openings so reopening a conversation paints at once. */
const threads = new Map<string, ChatThreadView>();

export function useChatThread(chatId: string | undefined): { thread?: ChatThreadView; error?: unknown } {
  const [state, setState] = useState<{ chatId?: string; thread?: ChatThreadView; error?: unknown }>(() => (chatId ? { chatId, thread: threads.get(chatId) } : {}));
  useEffect(() => {
    if (!chatId) {
      setState({});
      return;
    }
    setState({ chatId, thread: threads.get(chatId) });
    let stop: (() => void) | undefined;
    let cancelled = false;
    void getApi().subscribeAiChat(chatId, (thread) => {
      threads.set(chatId, thread);
      if (!cancelled) setState({ chatId, thread });
    }, (error) => {
      if (!cancelled) setState((current) => ({ ...current, chatId, error }));
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [chatId]);
  return state.chatId === chatId ? { thread: state.thread, error: state.error } : {};
}

/** The parts of the answer being written, or undefined once it is saved. */
export function useChatStream(messageId: string | undefined): ChatPart[] | undefined {
  const [stream, setStream] = useState<ChatStreamView | null>(null);
  const latestVersion = useRef(-1);
  useEffect(() => {
    latestVersion.current = -1;
    setStream(null);
    if (!messageId) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void getApi().subscribeAiChatStream(messageId, (value) => {
      if (cancelled) return;
      // Updates can arrive out of order across reconnects; never step backwards.
      if (value && value.version < latestVersion.current) return;
      latestVersion.current = value?.version ?? -1;
      setStream(value);
    }, () => undefined).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [messageId]);
  return stream && stream.messageId === messageId ? stream.parts : undefined;
}

export function useChatList(enabled: boolean) {
  return useApiQuery<ChatSummaryView[]>(qk.aiChats, (api) => api.listAiChats(), { enabled, staleTime: 5_000, refetchOnWindowFocus: false });
}

export function forgetThread(chatId: string): void {
  threads.delete(chatId);
}
