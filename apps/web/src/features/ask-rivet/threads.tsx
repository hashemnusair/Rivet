"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Pencil, Search, SquarePen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getApi } from "@/lib/api/client";
import { localizeApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { ChatSummaryView } from "@/lib/ai/chat/contracts";
import { useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { forgetThread, useChatList } from "./use-chat";

type Bucket = "today" | "yesterday" | "week" | "older";
const BUCKETS: readonly Bucket[] = ["today", "yesterday", "week", "older"];

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Which heading a conversation sits under, by the day it was last used on this device's calendar. */
function bucketOf(updatedAt: string, now: Date): Bucket {
  const updated = new Date(updatedAt);
  if (dayKey(updated) === dayKey(now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(updated) === dayKey(yesterday)) return "yesterday";
  return now.getTime() - updated.getTime() < 7 * 86_400_000 ? "week" : "older";
}

function ThreadRow({ chat, active, onSelect, onDeleted }: { chat: ChatSummaryView; active: boolean; onSelect: () => void; onDeleted: () => void }) {
  const { t, locale } = useLocale();
  const format = useFormat();
  const invalidate = useInvalidate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(chat.title);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const save = async () => {
    const next = name.trim();
    if (!next || next === chat.title) {
      setRenaming(false);
      setName(chat.title);
      return;
    }
    setBusy(true);
    try {
      await getApi().renameAiChat(chat.id, next);
      await invalidate([qk.aiChats]);
      setRenaming(false);
    } catch (error) {
      toast.error(localizeApiError(error, locale).message);
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
    if (event.key === "Escape") {
      // Leave the conversation list open; only the rename is cancelled.
      event.preventDefault();
      event.stopPropagation();
      setRenaming(false);
      setName(chat.title);
    }
  };

  if (renaming) {
    return (
      <li className="px-1.5 py-1">
        <input
          ref={input}
          autoFocus
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => void save()}
          aria-label={t("askRivet.renameLabel")}
          dir="auto"
          className="h-8 w-full rounded-md border border-ink bg-paper px-2 text-[13px] text-ink outline-none"
          data-testid="ask-thread-rename-input"
        />
      </li>
    );
  }

  return (
    <li className={cn("group/chat relative flex items-center rounded-md transition-colors hover:bg-sunken", active && "bg-sunken")} data-testid="ask-thread">
      <button type="button" onClick={onSelect} aria-current={active || undefined} className="min-w-0 flex-1 rounded-md py-2 pe-16 ps-2.5 text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink">
        <bdi className={cn("block truncate text-[13px]", active ? "font-medium text-ink" : "text-ink-2")}>{chat.title}</bdi>
        <span className="block text-[11.5px] text-ink-3">{format.relative(chat.updatedAt)}</span>
      </button>
      <span className="absolute inset-y-0 end-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/chat:opacity-100 [@media(hover:none)]:opacity-100">
        <button type="button" onClick={() => { setName(chat.title); setRenaming(true); }} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={`${t("askRivet.renameChat")}: ${chat.title}`} title={t("askRivet.renameChat")} data-testid="ask-thread-rename">
          <Pencil className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={async () => {
            await getApi().deleteAiChat(chat.id).catch(() => undefined);
            forgetThread(chat.id);
            onDeleted();
            toast.success(t("askRivet.deleted"));
            await invalidate([qk.aiChats]);
          }}
          className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
          aria-label={`${t("askRivet.deleteChat")}: ${chat.title}`}
          title={t("askRivet.deleteChat")}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </span>
    </li>
  );
}

/**
 * The person's conversations, newest first under day headings. Each one is
 * its own thread with its own context on the server; picking one continues
 * it exactly where it stopped.
 */
export function ThreadList({ activeId, onSelect, onNew, onDeleted, className, autoFocusSearch = false }: { activeId?: string; onSelect: (chatId: string) => void; onNew: () => void; onDeleted: (chatId: string) => void; className?: string; autoFocusSearch?: boolean }) {
  const { t } = useLocale();
  const list = useChatList(true);
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const now = new Date();
    const needle = query.trim().toLocaleLowerCase();
    const chats = (list.data ?? []).filter((chat) => !needle || chat.title.toLocaleLowerCase().includes(needle));
    return BUCKETS.map((bucket) => ({ bucket, chats: chats.filter((chat) => bucketOf(chat.updatedAt, now) === bucket) })).filter((group) => group.chats.length);
  }, [list.data, query]);
  const total = list.data?.length ?? 0;

  return (
    <div className={cn("flex min-h-0 flex-col", className)} data-testid="ask-threads">
      <div className="space-y-2 p-2.5 pb-2">
        <button type="button" onClick={onNew} className="flex h-9 w-full items-center gap-2 rounded-md border border-line-2 bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors hover:border-line-3 hover:bg-sunken/50 focus-visible:outline-2 focus-visible:outline-ink" data-testid="ask-thread-new">
          <SquarePen className="size-4 text-ink-3" aria-hidden />
          {t("askRivet.newChat")}
        </button>
        {total > 4 ? (
          <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-paper px-2.5 focus-within:border-ink">
            <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span className="sr-only">{t("askRivet.historySearch")}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus={autoFocusSearch} placeholder={t("askRivet.historySearch")} dir="auto" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4" data-testid="ask-thread-search" />
          </label>
        ) : null}
      </div>
      <div className="ask-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-3">
        {grouped.length ? grouped.map((group) => (
          <section key={group.bucket} className="mt-2 first:mt-0" aria-label={t(`askRivet.when.${group.bucket}` as TKey)}>
            <h3 className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-medium text-ink-3">{t(`askRivet.when.${group.bucket}` as TKey)}</h3>
            <ul className="space-y-px">
              {group.chats.map((chat) => <ThreadRow key={`${chat.id}:${chat.title}`} chat={chat} active={chat.id === activeId} onSelect={() => onSelect(chat.id)} onDeleted={() => onDeleted(chat.id)} />)}
            </ul>
          </section>
        )) : (
          <p className="px-2.5 py-3 text-[12.5px] text-ink-3" data-testid="ask-threads-empty">{list.isLoading ? t("common.state.loading" as TKey) : total ? t("askRivet.historyNoMatch") : t("askRivet.historyEmpty")}</p>
        )}
      </div>
    </div>
  );
}
