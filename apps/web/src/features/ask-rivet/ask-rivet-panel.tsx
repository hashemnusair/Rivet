"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { History, ImageUp, SquarePen, Trash2, X } from "lucide-react";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import { isChatMessageWorking, type ChatAttachmentView, type ChatContextItem } from "@/lib/ai/chat/contracts";
import { useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAiSettings } from "@/features/assist/use-assist";
import { currentRoute, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, useAskRivet } from "./ask-rivet-context";
import { Composer, type ComposerHandle, type ComposerSend } from "./composer";
import { Conversation, EmptyConversation, type ConversationItem } from "./conversation";
import { RivetGlyph } from "./rivet-glyph";
import { forgetThread, useChatList, useChatStream, useChatThread } from "./use-chat";

export type PanelMode = "docked" | "overlay" | "full";

function subscribeMedia(query: string) {
  return (callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  };
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches, () => false);
}

/**
 * Docked beside the page from 1440 px, where the page keeps at least ~790 px
 * beside an open sidebar; over the page on smaller desktops and tablets; full
 * screen on phones.
 */
export function usePanelMode(): PanelMode {
  const wide = useMedia("(min-width: 1440px)");
  const tablet = useMedia("(min-width: 768px)");
  return wide ? "docked" : tablet ? "overlay" : "full";
}

interface Optimistic {
  clientId: string;
  text: string;
  context: ChatContextItem[];
  attachments: ChatAttachmentView[];
  error?: AiErrorCategory;
}

function errorReason(error: unknown): AiErrorCategory {
  if (isApiError(error)) {
    const reason = error.details?.reason;
    if (typeof reason === "string") return reason as AiErrorCategory;
    if (error.code === "CONFLICT") return "limit_reached";
    if (error.code === "VALIDATION_ERROR") return "validation";
  }
  return "model_unavailable";
}

function ConversationsMenu({ activeId, onSelect, onDeleted }: { activeId?: string; onSelect: (chatId: string) => void; onDeleted: (chatId: string) => void }) {
  const { t } = useLocale();
  const format = useFormat();
  const [open, setOpen] = useState(false);
  const list = useChatList(open);
  const invalidate = useInvalidate();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink data-[state=open]:bg-sunken data-[state=open]:text-ink" aria-label={t("askRivet.history")} title={t("askRivet.history")} data-testid="ask-history">
          <History className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="border-b border-line px-3 py-2 text-[12px] font-medium text-ink-3">{t("askRivet.history")}</p>
        {list.data?.length ? (
          <ul className="max-h-80 overflow-y-auto py-1" data-testid="ask-history-list">
            {list.data.map((chat) => (
              <li key={chat.id} className={cn("group/chat flex items-center gap-1 pe-1", chat.id === activeId && "bg-sunken/70")}>
                <button type="button" onClick={() => { onSelect(chat.id); setOpen(false); }} className="min-w-0 flex-1 px-3 py-2 text-start focus-visible:outline-2 focus-visible:outline-ink">
                  <bdi className="block truncate text-[13px] text-ink">{chat.title}</bdi>
                  <span className="block text-[11.5px] text-ink-3">{format.relative(chat.updatedAt)}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await getApi().deleteAiChat(chat.id).catch(() => undefined);
                    forgetThread(chat.id);
                    onDeleted(chat.id);
                    await invalidate([qk.aiChats]);
                  }}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 opacity-0 transition-[opacity,color] hover:bg-sunken hover:text-ink focus-visible:opacity-100 group-hover/chat:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={`${t("askRivet.deleteChat")}: ${chat.title}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="px-3 py-3 text-[12.5px] text-ink-3">{list.isLoading ? t("common.state.loading" as TKey) : t("askRivet.historyEmpty")}</p>}
      </PopoverContent>
    </Popover>
  );
}

function Resizer({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  const { t } = useLocale();
  const dragging = useRef(false);
  const frame = useRef<number | undefined>(undefined);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const rtl = document.documentElement.dir === "rtl";
    const next = rtl ? event.clientX : window.innerWidth - event.clientX;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => onWidth(next));
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("askRivet.resize")}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(event) => {
        const rtl = document.documentElement.dir === "rtl";
        if (event.key === "ArrowLeft") onWidth(width + (rtl ? -16 : 16));
        if (event.key === "ArrowRight") onWidth(width + (rtl ? 16 : -16));
      }}
      className="group/resize absolute inset-y-0 start-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none rtl:translate-x-1/2"
    >
      <span className="absolute inset-y-0 start-1/2 w-px bg-transparent transition-colors group-hover/resize:bg-line-3 group-focus-visible/resize:bg-ink" />
    </div>
  );
}

export function AskRivetPanel() {
  const context = useAskRivet();
  const { t, locale } = useLocale();
  const mode = usePanelMode();
  const settings = useAiSettings(Boolean(context?.available));
  const invalidate = useInvalidate();
  const composer = useRef<ComposerHandle>(null);
  const [optimistic, setOptimistic] = useState<Optimistic | undefined>();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const open = Boolean(context?.open);
  const chatId = context?.chatId;
  const { thread, error: threadError } = useChatThread(open ? chatId : undefined);

  // A conversation that no longer exists (deleted elsewhere, or expired) starts a new one.
  useEffect(() => {
    if (threadError && isApiError(threadError) && threadError.code === "NOT_FOUND") context?.setChatId(undefined);
  }, [threadError, context]);

  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  const streaming = [...messages].reverse().find((message) => message.role === "assistant" && isChatMessageWorking(message.status));
  const streamParts = useChatStream(streaming?.id);
  const reconciled = Boolean(optimistic && messages.some((message) => message.clientId === optimistic.clientId));
  useEffect(() => {
    if (reconciled) setOptimistic(undefined);
  }, [reconciled]);

  const items = useMemo<ConversationItem[]>(() => {
    const list: ConversationItem[] = messages.map((message, index) => message.role === "user"
      ? { key: message.clientId ?? message.id, role: "user", text: message.text, context: message.context, attachments: message.attachments }
      : { key: message.clientId ?? message.id, role: "assistant", messageId: message.id, status: message.status, parts: message.id === streaming?.id ? (streamParts ?? message.parts) : message.parts, ...(message.error ? { error: message.error } : {}), canRetry: index === messages.length - 1 });
    if (optimistic && !reconciled) {
      list.push({ key: optimistic.clientId, role: "user", text: optimistic.text, context: optimistic.context, attachments: optimistic.attachments });
      list.push({ key: `${optimistic.clientId}:answer`, role: "assistant", status: optimistic.error ? "failed" : "pending", parts: [], ...(optimistic.error ? { error: optimistic.error } : {}), canRetry: false });
    }
    return list;
  }, [messages, optimistic, reconciled, streamParts, streaming?.id]);

  const working = Boolean(streaming) || Boolean(optimistic && !optimistic.error && !reconciled);
  const overlay = mode !== "docked";
  const close = useCallback(() => context?.setOpen(false), [context]);
  const onNavigate = useCallback(() => { if (overlay) close(); }, [overlay, close]);

  // Focus the message box when the panel opens; hand focus back to the launcher when it closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) window.setTimeout(() => composer.current?.focus(), 60);
    if (!open && wasOpen.current) {
      const active = document.activeElement;
      if (!active || active === document.body || document.getElementById("ask-rivet-panel")?.contains(active)) document.getElementById("ask-rivet-launcher")?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Toasts share the panel's corner; while it is open they move clear of the message box (see globals.css).
  const width = context?.width;
  useEffect(() => {
    const root = document.documentElement;
    if (open) {
      root.dataset.askRivet = mode;
      root.style.setProperty("--ask-rivet-clearance", `${mode === "overlay" ? Math.min(width ?? 0, 480) : width ?? 0}px`);
    } else {
      delete root.dataset.askRivet;
      root.style.removeProperty("--ask-rivet-clearance");
    }
    return () => {
      delete root.dataset.askRivet;
      root.style.removeProperty("--ask-rivet-clearance");
    };
  }, [open, mode, width]);

  // Escape closes the panel when focus is inside it and nothing inside claimed the key.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const panel = document.getElementById("ask-rivet-panel");
      if (overlay || panel?.contains(document.activeElement)) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, overlay, close]);

  const send = useCallback(async (input: ComposerSend): Promise<boolean> => {
    if (!context) return false;
    const clientId = `c-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
    setOptimistic({ clientId, text: input.text, context: input.context, attachments: input.files });
    try {
      const result = await getApi().sendAiChatMessage({ ...(context.chatId ? { chatId: context.chatId } : {}), clientId, text: input.text, context: input.context, screen: { route: currentRoute(context.screen.route), title: context.screen.title }, fileIds: input.files.map((file) => file.id), locale });
      if (!context.chatId) context.setChatId(result.chatId);
      void invalidate([qk.aiChats]);
    } catch (error) {
      setOptimistic((current) => (current && current.clientId === clientId ? { ...current, error: errorReason(error) } : current));
    }
    return true;
  }, [context, invalidate, locale]);

  // Stop works from the first moment: pressed before the server has the answer, it applies as soon as it does.
  const stopWhenSaved = useRef<string | undefined>(undefined);
  const stop = useCallback(() => {
    if (streaming) void getApi().stopAiChatMessage(streaming.id).catch(() => undefined);
    else if (optimistic && !optimistic.error) stopWhenSaved.current = `${optimistic.clientId}:answer`;
  }, [streaming, optimistic]);
  useEffect(() => {
    if (!streaming || !stopWhenSaved.current || streaming.clientId !== stopWhenSaved.current) return;
    stopWhenSaved.current = undefined;
    void getApi().stopAiChatMessage(streaming.id).catch(() => undefined);
  }, [streaming]);

  const retry = useCallback((messageId: string) => {
    void getApi().retryAiChatMessage(messageId).catch(() => undefined);
  }, []);

  const newChat = useCallback(() => {
    context?.setChatId(undefined);
    setOptimistic(undefined);
    window.setTimeout(() => composer.current?.focus(), 0);
  }, [context]);

  const onDragEnter = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    composer.current?.addFiles(Array.from(event.dataTransfer.files));
  };

  if (!context?.available) return null;
  const testAnswers = (thread?.source ?? settings.data?.adapterMode) === "fixture";
  const prompts = context.screen.prompts.length ? context.screen.prompts : [t("askRivet.prompts.default.p1"), t("askRivet.prompts.default.p2"), t("askRivet.prompts.default.p3")];
  const title = thread?.title ?? (optimistic ? optimistic.text : undefined);

  return (
    <aside
      id="ask-rivet-panel"
      aria-label={t("askRivet.name")}
      data-testid="ask-rivet-panel"
      data-state={open ? "open" : "closed"}
      data-mode={mode}
      inert={!open || undefined}
      onDragEnter={onDragEnter}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={mode === "full" ? undefined : { width: mode === "docked" ? context.width : Math.min(context.width, 480) }}
      className={cn(
        "ask-panel fixed z-40 flex flex-col bg-paper transition-[transform,visibility] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        mode === "full" ? "inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "inset-y-0 end-0 max-w-[calc(100vw-48px)] border-s border-line",
        mode === "overlay" && "shadow-dialog",
        open ? "visible translate-x-0" : "invisible translate-x-full rtl:-translate-x-full",
      )}
    >
      {mode === "docked" ? <Resizer width={context.width} onWidth={context.setWidth} /> : null}
      <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line ps-3.5 pe-2 sm:ps-4 lg:h-16">
        <RivetGlyph className="h-[18px] text-ink" />
        <div className="ms-1 min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-semibold leading-tight text-ink" data-testid="ask-title"><bdi>{title ?? t("askRivet.name")}</bdi></p>
          {title ? <p className="text-[11.5px] leading-tight text-ink-3">{t("askRivet.name")}</p> : null}
        </div>
        {testAnswers ? <Badge variant="outline" className="shrink-0" title={t("askRivet.testAnswersHint")} data-testid="ask-test-badge">{t("askRivet.testAnswers")}</Badge> : null}
        <ConversationsMenu activeId={chatId} onSelect={(id) => { setOptimistic(undefined); context.setChatId(id); }} onDeleted={(id) => { if (id === chatId) newChat(); }} />
        <button type="button" onClick={newChat} disabled={!chatId && !optimistic} className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40" aria-label={t("askRivet.newChat")} title={t("askRivet.newChat")} data-testid="ask-new">
          <SquarePen className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={close} className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.close")} title={t("askRivet.close")} data-testid="ask-close">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <Conversation
          items={items}
          onRetry={retry}
          onNavigate={onNavigate}
          empty={<EmptyConversation title={context.screen.title} focus={context.screen.focus} prompts={prompts} onPrompt={(prompt) => context.ask(prompt, { send: true })} />}
        />
      </div>
      <Composer ref={composer} screen={context.screen} working={working} onSend={send} onStop={stop} request={context.request} onEscape={close} />
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-3 bg-paper/95 text-[13px] font-medium text-ink-2" data-testid="ask-drop">
          <ImageUp className="size-5 text-ink-3" aria-hidden />
          {t("askRivet.composer.dropFiles")}
        </div>
      ) : null}
    </aside>
  );
}
