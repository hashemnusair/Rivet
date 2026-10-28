"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { ArrowLeft, History, ImageUp, Maximize2, Minimize2, SquarePen, X } from "lucide-react";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import { isChatMessageWorking, type ChatAttachmentView, type ChatContextItem } from "@/lib/ai/chat/contracts";
import { useInvalidate } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { useAiSettings } from "@/features/assist/use-assist";
import { currentRoute, useAskRivet } from "./ask-rivet-context";
import { Composer, type ComposerHandle, type ComposerSend } from "./composer";
import { Conversation, EmptyConversation, type ConversationItem } from "./conversation";
import { RivetGlyph } from "./rivet-glyph";
import { ThreadList } from "./threads";
import { useChatStream, useChatThread } from "./use-chat";

/**
 * A floating window in the corner wherever there is room for one, so the page
 * underneath keeps its full width and never reflows; full screen on phones
 * and very short windows.
 */
export type PanelMode = "popup" | "full";

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

export function usePanelMode(): PanelMode {
  return useMedia("(min-width: 640px) and (min-height: 540px)") ? "popup" : "full";
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

function HeaderButton({ label, onClick, disabled, active, testId, children }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-40", active && "bg-sunken text-ink")}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Toasts keep clear of the window: beside it when there is room, otherwise above its message box. */
function useToastClearance(panel: React.RefObject<HTMLElement | null>, open: boolean, mode: PanelMode, size: string) {
  useEffect(() => {
    const root = document.documentElement;
    const place = () => {
      if (!open) {
        root.dataset.askRivet = "launcher";
        root.style.removeProperty("--ask-rivet-clearance");
        return;
      }
      const width = panel.current?.offsetWidth ?? 0;
      const beside = mode === "popup" && window.innerWidth - width - 48 >= 360;
      root.dataset.askRivet = beside ? "popup" : "cover";
      if (beside) root.style.setProperty("--ask-rivet-clearance", `${width + 16}px`);
      else root.style.removeProperty("--ask-rivet-clearance");
    };
    place();
    // The window animates to its new size; measure again once it has settled.
    const settle = window.setTimeout(place, 300);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
      delete root.dataset.askRivet;
      root.style.removeProperty("--ask-rivet-clearance");
    };
  }, [panel, open, mode, size]);
}

export function AskRivetPanel() {
  const context = useAskRivet();
  const { t, locale } = useLocale();
  const mode = usePanelMode();
  const roomForList = useMedia("(min-width: 900px)");
  const settings = useAiSettings(Boolean(context?.available));
  const invalidate = useInvalidate();
  const composer = useRef<ComposerHandle>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [optimistic, setOptimistic] = useState<Optimistic | undefined>();
  const [view, setView] = useState<"chat" | "threads">("chat");
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const open = Boolean(context?.open);
  const chatId = context?.chatId;
  const size = mode === "popup" ? context?.size ?? "compact" : "compact";
  const large = mode === "popup" && size === "large";
  // The large window keeps the conversation list beside the chat; otherwise it is a view of its own.
  const rail = large && roomForList;
  const showThreads = !rail && view === "threads";
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
      : { key: message.clientId ?? message.id, role: "assistant", messageId: message.id, ...(message.completedAt ? { completedAt: message.completedAt } : {}), status: message.status, parts: message.id === streaming?.id ? (streamParts ?? message.parts) : message.parts, ...(message.error ? { error: message.error } : {}), canRetry: index === messages.length - 1 });
    if (optimistic && !reconciled) {
      list.push({ key: optimistic.clientId, role: "user", text: optimistic.text, context: optimistic.context, attachments: optimistic.attachments });
      list.push({ key: `${optimistic.clientId}:answer`, role: "assistant", status: optimistic.error ? "failed" : "pending", parts: [], ...(optimistic.error ? { error: optimistic.error } : {}), canRetry: false });
    }
    return list;
  }, [messages, optimistic, reconciled, streamParts, streaming?.id]);

  const working = Boolean(streaming) || Boolean(optimistic && !optimistic.error && !reconciled);
  const close = useCallback(() => context?.setOpen(false), [context]);
  // Following a link: a phone shows the screen instead; a large window steps aside so the screen is visible.
  const onNavigate = useCallback(() => {
    if (mode === "full") close();
    else if (large) context?.setSize("compact");
  }, [mode, large, close, context]);

  // Focus the message box when the window opens; hand focus back to the launcher when it closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) window.setTimeout(() => composer.current?.focus(), 60);
    if (!open && wasOpen.current) {
      setView("chat");
      const active = document.activeElement;
      // The launcher that is showing at this width: the corner button, the home screen's box, or the phone button.
      const launcher = [...document.querySelectorAll<HTMLElement>("[data-ask-launcher]")].find((element) => element.offsetParent !== null);
      if (!active || active === document.body || panelRef.current?.contains(active)) launcher?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useToastClearance(panelRef, open, mode, size);

  // Escape closes the window when focus is inside it (or it covers the screen) and nothing inside claimed the key.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (mode === "full" || panelRef.current?.contains(document.activeElement)) {
        if (showThreads) setView("chat");
        else close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, close, showThreads]);

  // A question asked from elsewhere (search, the dashboard) belongs in the conversation, not the list.
  const requestNonce = context?.request?.nonce;
  useEffect(() => {
    if (requestNonce) setView("chat");
  }, [requestNonce]);

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
    setView("chat");
    window.setTimeout(() => composer.current?.focus(), 0);
  }, [context]);

  const selectChat = useCallback((id: string) => {
    setOptimistic(undefined);
    context?.setChatId(id);
    setView("chat");
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
    setView("chat");
    composer.current?.addFiles(Array.from(event.dataTransfer.files));
  };

  if (!context?.available) return null;
  const testAnswers = (thread?.source ?? settings.data?.adapterMode) === "fixture";
  const prompts = context.screen.prompts.length ? context.screen.prompts : [t("askRivet.prompts.default.p1"), t("askRivet.prompts.default.p2"), t("askRivet.prompts.default.p3")];
  const title = thread?.title ?? (optimistic ? optimistic.text : undefined);
  const threads = (autoFocusSearch: boolean, className?: string) => (
    <ThreadList activeId={chatId} onSelect={selectChat} onNew={newChat} onDeleted={(id) => { if (id === chatId) newChat(); }} autoFocusSearch={autoFocusSearch} className={className} />
  );

  return (
    <section
      ref={panelRef}
      id="ask-rivet-panel"
      role="dialog"
      aria-modal={mode === "full" || undefined}
      aria-label={t("askRivet.name")}
      data-testid="ask-rivet-panel"
      data-state={open ? "open" : "closed"}
      data-mode={mode}
      data-size={size}
      inert={!open || undefined}
      onDragEnter={onDragEnter}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "ask-panel fixed z-50 flex overflow-hidden bg-paper",
        mode === "full" ? "inset-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "ask-popup bottom-4 end-4 rounded-xl border border-line-2 shadow-dialog",
      )}
    >
      {rail ? (
        <aside className="flex w-[244px] shrink-0 flex-col border-e border-line bg-sunken/35" aria-label={t("askRivet.history")} data-testid="ask-rail">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
            <RivetGlyph className="h-[18px] text-ink" />
            <span className="font-display text-[14px] font-semibold text-ink">{t("askRivet.name")}</span>
          </div>
          {threads(false, "min-h-0 flex-1")}
        </aside>
      ) : null}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line pe-2 ps-3.5">
          {showThreads ? (
            <>
              <HeaderButton label={t("askRivet.back")} onClick={() => setView("chat")} testId="ask-back"><ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden /></HeaderButton>
              <p className="ms-1 min-w-0 flex-1 truncate font-display text-[14px] font-semibold text-ink">{t("askRivet.history")}</p>
            </>
          ) : (
            <>
              {rail ? null : <RivetGlyph className="h-[18px] text-ink" />}
              <div className={cn("min-w-0 flex-1", !rail && "ms-1.5")}>
                <p className="truncate font-display text-[14px] font-semibold leading-tight text-ink" data-testid="ask-title"><bdi>{title ?? (rail ? t("askRivet.newChat") : t("askRivet.name"))}</bdi></p>
                {title && !rail ? <p className="text-[11.5px] leading-tight text-ink-3">{t("askRivet.name")}</p> : null}
              </div>
            </>
          )}
          {testAnswers ? <Badge variant="outline" className="me-1 hidden shrink-0 min-[400px]:inline-flex" title={t("askRivet.testAnswersHint")} data-testid="ask-test-badge">{t("askRivet.testAnswers")}</Badge> : null}
          {rail ? null : <HeaderButton label={t("askRivet.history")} onClick={() => setView(showThreads ? "chat" : "threads")} active={showThreads} testId="ask-history"><History className="size-4" aria-hidden /></HeaderButton>}
          {rail ? null : <HeaderButton label={t("askRivet.newChat")} onClick={newChat} disabled={!chatId && !optimistic && !showThreads} testId="ask-new"><SquarePen className="size-4" aria-hidden /></HeaderButton>}
          {mode === "popup" ? (
            <HeaderButton label={large ? t("askRivet.shrink") : t("askRivet.expand")} onClick={() => context.setSize(large ? "compact" : "large")} testId="ask-size">
              {large ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
            </HeaderButton>
          ) : null}
          <HeaderButton label={t("askRivet.close")} onClick={close} testId="ask-close"><X className="size-4" aria-hidden /></HeaderButton>
        </header>
        {showThreads ? threads(true, "min-h-0 flex-1") : (
          <div className="relative min-h-0 flex-1">
            <Conversation
              items={items}
              onRetry={retry}
              onNavigate={onNavigate}
              empty={<EmptyConversation title={context.screen.title} focus={context.screen.focus} prompts={prompts} onPrompt={(prompt) => context.ask(prompt, { send: true })} />}
            />
          </div>
        )}
        {/* Kept mounted under the list so a half-written message and its attachments survive a look at earlier conversations. */}
        <div className={cn(showThreads && "hidden")}>
          <Composer ref={composer} screen={context.screen} working={working} onSend={send} onStop={stop} request={context.request} onEscape={close} />
        </div>
        {dragging ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-3 bg-paper/95 text-[13px] font-medium text-ink-2" data-testid="ask-drop">
            <ImageUp className="size-5 text-ink-3" aria-hidden />
            {t("askRivet.composer.dropFiles")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
