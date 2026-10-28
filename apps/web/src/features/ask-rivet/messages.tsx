"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, Copy, FileText, RotateCcw } from "lucide-react";
import type { AiErrorCategory } from "@/lib/ai/contracts";
import { chatAnswerText, isChatMessageWorking, type ChatAttachmentView, type ChatContextItem, type ChatMessageView, type ChatPart } from "@/lib/ai/chat/contracts";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAiErrorText } from "@/features/assist/ai-message";
import { ContextChip } from "./context-chip";
import { StreamingMarkdown } from "./markdown";
import { RivetGlyph } from "./rivet-glyph";
import { useSmoothText } from "./use-smooth-text";
import { WorkLog } from "./work-log";

type ToolPart = Extract<ChatPart, { type: "tool" }>;
type TextPart = Extract<ChatPart, { type: "text" }>;

function Attachment({ file }: { file: ChatAttachmentView }) {
  if (file.mediaType !== "application/pdf" && file.url) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block size-16 overflow-hidden rounded-md border border-line bg-sunken focus-visible:outline-2 focus-visible:outline-ink" title={file.name}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived storage link; not optimisable */}
        <img src={file.url} alt={file.name} className="size-full object-cover" loading="lazy" />
      </a>
    );
  }
  return (
    <span className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[12px] text-ink-2" title={file.name}>
      <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
      <bdi className="truncate">{file.name}</bdi>
    </span>
  );
}

export const UserMessage = memo(function UserMessage({ text, context, attachments }: { text: string; context: ChatContextItem[]; attachments: ChatAttachmentView[] }) {
  return (
    <div className="ask-user flex flex-col items-end gap-1.5" data-testid="ask-user-message">
      {context.length ? (
        <div className="flex max-w-[92%] flex-wrap justify-end gap-x-2.5 gap-y-0.5">
          {context.map((item, index) => <ContextChip key={`${item.kind}:${item.id ?? index}`} item={item} tone="message" />)}
        </div>
      ) : null}
      {attachments.length ? <div className="flex max-w-[92%] flex-wrap justify-end gap-1.5">{attachments.map((file) => <Attachment key={file.id} file={file} />)}</div> : null}
      {text ? <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] leading-[1.55] text-ink" dir="auto">{text}</div> : null}
    </div>
  );
});

function AnswerText({ part, streaming, onNavigate }: { part: TextPart; streaming: boolean; onNavigate?: () => void }) {
  const text = useSmoothText(part.text, streaming);
  if (!text) return null;
  return <StreamingMarkdown text={text} streaming={streaming} onNavigate={onNavigate} />;
}

function ScreenLinks({ links, onNavigate }: { links: NonNullable<ToolPart["link"]>[]; onNavigate?: () => void }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-0.5">
      {links.map((link) => (
        <Link key={link.href} href={link.href} onNavigate={onNavigate} className="group/link inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-line-2 bg-surface px-2.5 text-[12.5px] font-medium text-ink transition-colors hover:border-line-3 hover:bg-sunken/50 focus-visible:outline-2 focus-visible:outline-ink" data-testid="ask-screen-link">
          <bdi className="truncate">{link.label}</bdi>
          <ArrowUpRight className="size-3.5 shrink-0 text-ink-3 transition-transform duration-150 group-hover/link:-translate-y-px group-hover/link:translate-x-px rtl:-scale-x-100 rtl:group-hover/link:-translate-x-px" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

/** Consecutive work (reasoning and lookups) folds into one log; words render as they arrive. */
function groups(parts: ChatPart[]): Array<{ kind: "work"; parts: ChatPart[]; key: string } | { kind: "text"; part: TextPart; key: string }> {
  const out: Array<{ kind: "work"; parts: ChatPart[]; key: string } | { kind: "text"; part: TextPart; key: string }> = [];
  for (const part of parts) {
    if (part.type === "text") {
      if (part.text.trim()) out.push({ kind: "text", part, key: part.id });
      continue;
    }
    const last = out.at(-1);
    if (last?.kind === "work") last.parts.push(part);
    else out.push({ kind: "work", parts: [part], key: part.id });
  }
  return out;
}

function CopyAnswer({ text }: { text: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1_600); }, () => undefined)}
      className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
      aria-label={copied ? t("askRivet.message.copied") : t("askRivet.message.copy")}
      title={copied ? t("askRivet.message.copied") : t("askRivet.message.copy")}
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}

export const AssistantMessage = memo(function AssistantMessage({ status, parts, error, canRetry, onRetry, onNavigate }: { status: ChatMessageView["status"]; parts: ChatPart[]; error?: AiErrorCategory; canRetry: boolean; onRetry?: () => void; onNavigate?: () => void }) {
  const { t } = useLocale();
  const errorText = useAiErrorText();
  const working = isChatMessageWorking(status);
  const list = groups(parts);
  const lastText = [...list].reverse().find((group) => group.kind === "text");
  const links = parts.filter((part): part is ToolPart => part.type === "tool" && Boolean(part.link)).map((part) => part.link!);
  const answer = chatAnswerText(parts);
  return (
    <div className="ask-answer space-y-2.5" data-testid="ask-answer" data-status={status} data-last={canRetry || undefined} aria-busy={working || undefined}>
      {working && !list.length ? (
        <div className="flex min-h-6 items-center gap-2" data-testid="ask-pending">
          <span className="flex size-4 items-center justify-center"><RivetGlyph working className="h-3.5 text-ink-2" /></span>
          <span className="text-[12.5px] text-ink-2">{t("askRivet.work.thinking")}</span>
        </div>
      ) : null}
      {list.map((group, index) => group.kind === "work"
        ? <WorkLog key={group.key} parts={group.parts} live={working && index === list.length - 1} />
        : <AnswerText key={group.key} part={group.part} streaming={working && group === lastText} onNavigate={onNavigate} />)}
      {!working ? <ScreenLinks links={links} onNavigate={onNavigate} /> : null}
      {status === "failed" ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-2" role="status" data-testid="ask-error">
          <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span>{errorText(error)}</span>
          {canRetry && onRetry ? <button type="button" onClick={onRetry} className="font-medium text-ink underline decoration-line-3 underline-offset-[3px] hover:decoration-ink">{t("askRivet.message.retry")}</button> : null}
        </p>
      ) : null}
      {status === "complete" && error ? <p className="text-[12.5px] text-ink-3" data-testid="ask-error">{errorText(error)}</p> : null}
      {!working && status !== "failed" ? (
        <div className={cn("ask-actions -ms-1 flex items-center gap-0.5")}>
          {answer ? <CopyAnswer text={answer} /> : null}
          {canRetry && onRetry ? (
            <button type="button" onClick={onRetry} className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink" aria-label={t("askRivet.message.retry")} title={t("askRivet.message.retry")}>
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {status === "stopped" ? <span className="ms-1 text-[12px] text-ink-3">{t("askRivet.message.stopped")}</span> : null}
        </div>
      ) : null}
    </div>
  );
});
