"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, AtSign, FileText, ImageUp, KanbanSquare, Loader2, Paperclip, Plus, Square, TriangleAlert, UserRound, X } from "lucide-react";
import { getApi } from "@/lib/api/client";
import { CHAT_FILES_MAX, CHAT_TEXT_MAX, chatContextKey, type ChatAttachmentView, type ChatContextItem, type ChatFileRegisterResult, type ChatFileType } from "@/lib/ai/chat/contracts";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ContextChip, CONTEXT_ICONS } from "./context-chip";
import { prepareFile } from "./prepare-file";
import type { AskRivetScreen } from "./ask-rivet-context";

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
  focus: () => void;
}

interface PendingFile {
  localId: string;
  name: string;
  mediaType?: ChatFileType;
  previewUrl?: string;
  status: "uploading" | "ready" | "failed";
  file?: ChatAttachmentView;
  reason?: Exclude<ChatFileRegisterResult, { ok: true }>["reason"];
}

interface MentionOption {
  kind: "member" | "lead";
  id: string;
  name: string;
  detail?: string;
}

export interface ComposerSend {
  text: string;
  context: ChatContextItem[];
  files: ChatAttachmentView[];
}

const MENTION = /(?:^|\s)@([^\s@]{0,40})$/;

function useMentionOptions(query: string | undefined): { options: MentionOption[]; loading: boolean } {
  const [state, setState] = useState<{ query?: string; options: MentionOption[]; loading: boolean }>({ options: [], loading: false });
  useEffect(() => {
    if (query === undefined || !query.trim()) {
      setState({ options: [], loading: false });
      return;
    }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    const timer = window.setTimeout(() => {
      const api = getApi();
      // Each list is read through the person's own access; one they cannot read simply contributes nothing.
      void Promise.allSettled([api.listMembers({ search: query, pageSize: 5 }), api.listLeads({ search: query, pageSize: 3 })]).then(([members, leads]) => {
        if (cancelled) return;
        const options: MentionOption[] = [
          ...(members.status === "fulfilled" ? members.value.items.map((member) => ({ kind: "member" as const, id: member.id, name: member.fullName, detail: member.memberNumber })) : []),
          ...(leads.status === "fulfilled" ? leads.value.items.map((lead) => ({ kind: "lead" as const, id: lead.id, name: lead.fullName, detail: lead.phone })) : []),
        ];
        setState({ query, options, loading: false });
      });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);
  return { options: state.options, loading: state.loading };
}

export const Composer = forwardRef<ComposerHandle, {
  screen: AskRivetScreen;
  working: boolean;
  onSend: (input: ComposerSend) => Promise<boolean>;
  onStop: () => void;
  request?: { text: string; send: boolean; nonce: number };
  onEscape?: () => void;
}>(function Composer({ screen, working, onSend, onStop, request, onEscape }, ref) {
  const { t, isolate } = useLocale();
  const [text, setText] = useState("");
  const [manual, setManual] = useState<ChatContextItem[]>([]);
  const [dismissedFocus, setDismissedFocus] = useState<string | undefined>();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [notice, setNotice] = useState<string | undefined>();
  const [mention, setMention] = useState<{ query: string; start: number } | undefined>();
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const mentionOptions = useMentionOptions(mention?.query);
  const handledRequest = useRef(0);

  const focusKey = screen.focus ? chatContextKey(screen.focus) : undefined;
  const attached = useMemo(() => {
    const items: ChatContextItem[] = [];
    if (screen.focus && focusKey !== dismissedFocus && !manual.some((item) => chatContextKey(item) === focusKey)) items.push(screen.focus);
    return [...items, ...manual];
  }, [dismissedFocus, focusKey, manual, screen.focus]);
  const suggestions = screen.suggestions.filter((item) => !attached.some((attachedItem) => chatContextKey(attachedItem) === chatContextKey(item)));
  const uploading = files.some((file) => file.status === "uploading");
  const readyFiles = files.filter((file) => file.status === "ready" && file.file).map((file) => file.file!);
  const canSend = !sending && !uploading && (text.trim().length > 0 || readyFiles.length > 0);

  const autosize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`;
  }, []);
  useEffect(autosize, [text, autosize]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? undefined : current)), 4_000);
  };

  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);
  const addFiles = useCallback((incoming: File[]) => {
    if (!incoming.length) return;
    const room = CHAT_FILES_MAX - filesRef.current.filter((file) => file.status !== "failed").length;
    if (incoming.length > room) showNotice(t("askRivet.composer.tooManyFiles"));
    const accepted = incoming.slice(0, Math.max(0, room));
    const entries: PendingFile[] = accepted.map((file) => ({ localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, status: "uploading", ...(file.type.startsWith("image/") && typeof URL.createObjectURL === "function" ? { previewUrl: URL.createObjectURL(file) } : {}) }));
    setFiles((current) => [...current, ...entries]);
    entries.forEach((entry, index) => {
      const update = (patch: Partial<PendingFile>) => setFiles((list) => list.map((file) => (file.localId === entry.localId ? { ...file, ...patch } : file)));
      void (async () => {
        const prepared = await prepareFile(accepted[index]!);
        if ("refused" in prepared) return update({ status: "failed", reason: prepared.refused });
        update({ mediaType: prepared.mediaType, name: prepared.name });
        try {
          const result = await getApi().uploadAiChatFile(prepared.blob, { name: prepared.name, mediaType: prepared.mediaType });
          update(result.ok ? { status: "ready", file: result.file } : { status: "failed", reason: result.reason });
        } catch {
          update({ status: "failed", reason: "unavailable" });
        }
      })();
    });
  }, [t]);

  useImperativeHandle(ref, () => ({ addFiles, focus: () => textareaRef.current?.focus() }), [addFiles]);

  const removeFile = (localId: string) => setFiles((current) => {
    const file = current.find((item) => item.localId === localId);
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    return current.filter((item) => item.localId !== localId);
  });

  const submit = useCallback(async (override?: string) => {
    const words = (override ?? text).trim();
    if (sending || uploading || (!words && !readyFiles.length)) return;
    setSending(true);
    const accepted = await onSend({ text: words.slice(0, CHAT_TEXT_MAX), context: attached, files: readyFiles });
    setSending(false);
    if (!accepted) return;
    setText("");
    setManual([]);
    setFiles([]);
    setMention(undefined);
  }, [attached, onSend, readyFiles, sending, text, uploading]);

  // A question asked from elsewhere (search, a suggested prompt) lands here.
  useEffect(() => {
    if (!request || request.nonce === handledRequest.current) return;
    handledRequest.current = request.nonce;
    if (request.send) void submit(request.text);
    else {
      setText(request.text);
      requestAnimationFrame(() => {
        const element = textareaRef.current;
        if (!element) return;
        element.focus();
        element.setSelectionRange(request.text.length, request.text.length);
      });
    }
  }, [request, submit]);

  const updateMention = (value: string, caret: number) => {
    const match = MENTION.exec(value.slice(0, caret));
    if (!match) {
      setMention(undefined);
      return;
    }
    setMention({ query: match[1]!, start: caret - match[1]!.length - 1 });
    setMentionIndex(0);
  };

  const chooseMention = (option: MentionOption) => {
    if (!mention) return;
    const element = textareaRef.current;
    const caret = element?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}${text.slice(caret)}`.replace(/\s{2,}/g, " ");
    setText(next);
    setManual((current) => current.some((item) => item.kind === option.kind && item.id === option.id) ? current : [...current, { kind: option.kind, id: option.id, label: option.name }]);
    setMention(undefined);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(mention.start, mention.start);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (mention && mentionOptions.options.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const count = mentionOptions.options.length;
        setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        chooseMention(mentionOptions.options[Math.min(mentionIndex, mentionOptions.options.length - 1)]!);
        return;
      }
    }
    if (event.key === "Escape") {
      if (mention) {
        event.preventDefault();
        setMention(undefined);
        return;
      }
      if (!text) onEscape?.();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (working) return;
      void submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files ?? []).filter((file) => file.type.startsWith("image/") || file.type === "application/pdf");
    if (!pasted.length) return;
    event.preventDefault();
    addFiles(pasted);
  };

  const startMention = () => {
    const element = textareaRef.current;
    if (!element) return;
    const caret = element.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const insert = `${before && !/\s$/.test(before) ? " " : ""}@`;
    const next = `${before}${insert}${text.slice(caret)}`;
    setText(next);
    requestAnimationFrame(() => {
      element.focus();
      const position = caret + insert.length;
      element.setSelectionRange(position, position);
      updateMention(next, position);
    });
  };

  const placeholder = screen.focus && attached.some((item) => item.kind === screen.focus!.kind && item.id === screen.focus!.id) && (screen.focus.kind === "member" || screen.focus.kind === "lead")
    ? t("askRivet.composer.placeholderAbout", { name: isolate(screen.focus.label) })
    : t("askRivet.composer.placeholder");
  const mentionOpen = Boolean(mention);

  return (
    <div className="ask-composer relative px-3 pb-3 pt-2 sm:px-4 sm:pb-4" data-testid="ask-composer">
      {suggestions.length ? (
        <div className="ask-suggestions -mx-3 mb-2 flex items-center gap-1.5 overflow-x-auto px-3 sm:-mx-4 sm:px-4" role="group" aria-label={t("askRivet.composer.add")} data-testid="ask-suggestions">
          <span className="shrink-0 text-[12px] font-medium text-ink-3">{t("askRivet.composer.add")}</span>
          {suggestions.map((item) => {
            const Icon = CONTEXT_ICONS[item.kind];
            return (
              <button
                key={chatContextKey(item)}
                type="button"
                onClick={() => setManual((current) => [...current, item])}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-sm border border-dashed border-line-3 px-2 text-[12px] text-ink-2 transition-colors hover:border-solid hover:border-line-3 hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
                aria-label={t("askRivet.composer.addContext", { label: item.label })}
                data-testid="ask-suggestion"
              >
                <Plus className="size-3 text-ink-3" aria-hidden />
                <Icon className="size-3 text-ink-3" aria-hidden />
                <bdi className="max-w-44 truncate">{item.label}</bdi>
              </button>
            );
          })}
        </div>
      ) : null}

      {mentionOpen ? (
        <div className="absolute inset-x-3 bottom-full z-10 mb-1 overflow-hidden rounded-md border border-line bg-surface shadow-pop sm:inset-x-4" data-testid="ask-mentions">
          <p className="border-b border-line px-3 py-2 text-[12px] font-medium text-ink-3">{t("askRivet.mention.title")}</p>
          <ul id={listboxId} role="listbox" aria-label={t("askRivet.mention.title")} className="max-h-60 overflow-y-auto py-1">
            {mentionOptions.loading && !mentionOptions.options.length ? <li className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-ink-3"><Loader2 className="size-3.5 animate-spin" aria-hidden />{t("askRivet.mention.searching")}</li> : null}
            {!mentionOptions.loading && mention?.query && !mentionOptions.options.length ? <li className="px-3 py-2 text-[12.5px] text-ink-3">{t("askRivet.mention.empty")}</li> : null}
            {mentionOptions.options.map((option, index) => (
              <li
                key={`${option.kind}:${option.id}`}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === mentionIndex}
                onMouseDown={(event) => { event.preventDefault(); chooseMention(option); }}
                onMouseEnter={() => setMentionIndex(index)}
                className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px]", index === mentionIndex && "bg-sunken")}
              >
                {option.kind === "member" ? <UserRound className="size-3.5 shrink-0 text-ink-3" aria-hidden /> : <KanbanSquare className="size-3.5 shrink-0 text-ink-3" aria-hidden />}
                <bdi className="min-w-0 truncate font-medium text-ink">{option.name}</bdi>
                <span className="ms-auto shrink-0 text-[11.5px] text-ink-3">{t(option.kind === "member" ? "askRivet.mention.member" : "askRivet.mention.lead")}{option.detail ? <> · <bdi dir="ltr">{option.detail}</bdi></> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ask-box rounded-lg border border-line-2 bg-surface transition-[border-color,box-shadow] duration-150 focus-within:border-line-3 focus-within:shadow-[0_0_0_3px_rgb(27_26_21/0.05)]">
        {attached.length || files.length ? (
          <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5" data-testid="ask-attached">
            {attached.map((item) => (
              <ContextChip
                key={chatContextKey(item)}
                item={item}
                onRemove={() => {
                  if (focusKey && chatContextKey(item) === focusKey) setDismissedFocus(focusKey);
                  setManual((current) => current.filter((entry) => chatContextKey(entry) !== chatContextKey(item)));
                }}
              />
            ))}
            {files.map((file) => (
              <span key={file.localId} className={cn("group/file relative inline-flex h-12 max-w-48 items-center gap-2 overflow-hidden rounded-md border bg-paper pe-7 ps-1", file.status === "failed" ? "border-warning/40" : "border-line")} data-testid="ask-file" data-status={file.status} title={file.reason ? t(`askRivet.composer.fileRefused.${file.reason}` as TKey) : file.name}>
                <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the person's own file */}
                  {file.previewUrl ? <img src={file.previewUrl} alt="" className={cn("size-full object-cover transition-opacity", file.status === "uploading" && "opacity-60")} /> : file.mediaType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? <FileText className="size-4 text-ink-3" aria-hidden /> : <ImageUp className="size-4 text-ink-3" aria-hidden />}
                  {file.status === "uploading" ? <Loader2 className="absolute size-4 animate-spin text-ink" aria-label={t("askRivet.composer.uploading")} /> : null}
                </span>
                <span className="min-w-0">
                  <bdi className="block truncate text-[12px] text-ink-2">{file.name}</bdi>
                  {file.status === "failed" ? <span className="flex items-center gap-1 text-[11px] text-warning"><TriangleAlert className="size-3" aria-hidden />{t(`askRivet.composer.fileRefused.${file.reason ?? "unavailable"}` as TKey)}</span> : null}
                </span>
                <button type="button" onClick={() => removeFile(file.localId)} className="absolute end-1 top-1 inline-flex size-5 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.composer.remove", { label: file.name })}>
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            updateMention(event.target.value, event.target.selectionStart ?? event.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={(event) => updateMention(event.currentTarget.value, event.currentTarget.selectionStart ?? 0)}
          onBlur={() => window.setTimeout(() => setMention(undefined), 120)}
          rows={1}
          maxLength={CHAT_TEXT_MAX}
          placeholder={placeholder}
          aria-label={t("askRivet.composer.label")}
          role="combobox"
          aria-expanded={mentionOpen}
          aria-controls={mentionOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={mentionOpen && mentionOptions.options.length ? `${listboxId}-${mentionIndex}` : undefined}
          dir="auto"
          className="block max-h-48 min-h-[44px] w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[14px] leading-[1.5] text-ink outline-none placeholder:text-ink-4"
          data-testid="ask-input"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.composer.attach")} data-testid="ask-attach">
                <Paperclip className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}><ImageUp /> {t("askRivet.composer.attachFile")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.setTimeout(startMention, 0)}><AtSign /> {t("askRivet.composer.attachRecord")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={startMention} className="inline-flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.composer.attachRecord")} data-testid="ask-mention">
            <AtSign className="size-4" aria-hidden />
          </button>
          {notice ? <span className="ms-1 truncate text-[11.5px] text-warning" role="status">{notice}</span> : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => (working ? onStop() : void submit())}
            disabled={!working && !canSend}
            className={cn(
              "relative inline-flex size-8 items-center justify-center rounded-md transition-[background-color,color,transform] duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              working || canSend ? "bg-ink text-paper hover:bg-night-3" : "bg-sunken-2 text-ink-4",
            )}
            aria-label={working ? t("askRivet.composer.stop") : t("askRivet.composer.send")}
            data-testid={working ? "ask-stop" : "ask-send"}
          >
            <ArrowUp className={cn("absolute size-4 transition-[opacity,transform] duration-150", working ? "scale-50 opacity-0" : "scale-100 opacity-100")} aria-hidden />
            <Square className={cn("absolute size-3 fill-current transition-[opacity,transform] duration-150", working ? "scale-100 opacity-100" : "scale-50 opacity-0")} aria-hidden />
          </button>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    </div>
  );
});
