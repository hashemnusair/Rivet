"use client";

import Link from "next/link";
import { memo, useState, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ExternalLink, KanbanSquare, UserRound } from "lucide-react";
import { healMarkdown, splitBlocks } from "@/lib/ai/chat/streaming";
import { recordHref } from "@/lib/ai/chat/tools";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

/**
 * Answers are model output, so this renderer trusts nothing in them: raw
 * HTML is never rendered, images are dropped (a picture URL can leak data
 * when it loads), and links are limited to RIVET records, RIVET screens and
 * plainly marked external pages that open in a new tab.
 */

type HastNode = { type?: string; value?: string; children?: HastNode[] };

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

/** Only RIVET records, RIVET screens and https pages survive as link targets. */
function safeUrl(url: string): string {
  if (url.startsWith("rivet://")) return recordHref(url) ? url : "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    return new URL(url).protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

function DraftQuote({ text, children }: { text: string; children: ReactNode }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  return (
    <figure className="ask-draft group/draft relative rounded-md border border-line bg-surface ps-3.5 pe-10 py-2.5" data-testid="ask-draft">
      <div className="text-[13.5px] leading-[1.6] text-ink [&>p+p]:mt-2">{children}</div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text.trim()).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_600);
          }, () => undefined);
        }}
        className="absolute end-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        aria-label={copied ? t("askRivet.message.copied") : t("askRivet.message.copy")}
      >
        {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </figure>
  );
}

function RecordChip({ kind, href, children, onNavigate }: { kind: "member" | "lead"; href: string; children: ReactNode; onNavigate?: () => void }) {
  const Icon = kind === "member" ? UserRound : KanbanSquare;
  return (
    <Link
      href={href}
      onNavigate={onNavigate}
      className="ask-record mx-px inline-flex max-w-full items-baseline gap-1 rounded-sm bg-sunken px-1.5 py-px align-baseline text-[0.94em] font-medium text-ink no-underline transition-colors hover:bg-sunken-2 focus-visible:outline-2 focus-visible:outline-ink"
      data-testid="ask-record-link"
    >
      <Icon className="size-3 shrink-0 translate-y-[1px] self-center text-ink-3" aria-hidden />
      <bdi className="truncate">{children}</bdi>
    </Link>
  );
}

function components(onNavigate?: () => void): Components {
  return {
    a: ({ href, children }) => {
      const url = href ?? "";
      const record = url.startsWith("rivet://") ? recordHref(url) : undefined;
      if (record) return <RecordChip kind={record.kind} href={record.href} onNavigate={onNavigate}>{children}</RecordChip>;
      if (url.startsWith("/")) return <Link href={url} onNavigate={onNavigate} className="font-medium text-ink underline decoration-line-3 underline-offset-[3px] hover:decoration-ink">{children}</Link>;
      if (url.startsWith("https:")) return <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-baseline gap-0.5 font-medium text-ink underline decoration-line-3 underline-offset-[3px] hover:decoration-ink">{children}<ExternalLink className="size-3 self-center rtl:-scale-x-100" aria-hidden /></a>;
      return <span>{children}</span>;
    },
    img: () => null,
    p: ({ children }) => <p>{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
    ul: ({ children }) => <ul className="ask-list">{children}</ul>,
    ol: ({ children, start }) => <ol className="ask-list ask-list-ordered" start={start}>{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    h1: ({ children }) => <p className="ask-heading">{children}</p>,
    h2: ({ children }) => <p className="ask-heading">{children}</p>,
    h3: ({ children }) => <p className="ask-heading">{children}</p>,
    h4: ({ children }) => <p className="ask-heading">{children}</p>,
    hr: () => <hr className="border-line" />,
    blockquote: ({ node, children }) => <DraftQuote text={textOf(node as HastNode)}>{children}</DraftQuote>,
    table: ({ children }) => (
      <div className="ask-table-wrap -mx-0.5 overflow-x-auto overscroll-x-contain rounded-md border border-line bg-surface">
        <table className="ask-table w-full border-collapse text-[12.5px]">{children}</table>
      </div>
    ),
    th: ({ children, style }) => <th style={style} className="whitespace-nowrap border-b border-line bg-sunken/60 px-2.5 py-1.5 text-start font-medium text-ink-2">{children}</th>,
    td: ({ children, style }) => <td style={style} className="border-b border-line px-2.5 py-1.5 align-top text-ink tabular-nums [tr:last-child_&]:border-b-0">{children}</td>,
    code: ({ children, className }) => className ? <code className={cn(className, "font-mono text-[12px]")}>{children}</code> : <code className="rounded-xs bg-sunken px-1 py-px font-mono text-[0.86em] text-ink">{children}</code>,
    pre: ({ children }) => <pre className="overflow-x-auto rounded-md border border-line bg-sunken/70 px-3 py-2.5 leading-[1.55]" dir="ltr">{children}</pre>,
  };
}

const MarkdownBlock = memo(function MarkdownBlock({ source, onNavigate }: { source: string; onNavigate?: () => void }) {
  return (
    <div className="ask-block" dir="auto">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeUrl} components={components(onNavigate)}>
        {source}
      </Markdown>
    </div>
  );
});

/**
 * Renders an answer that may still be growing. Each top-level block renders
 * separately and only re-renders when its own text changes, so a long answer
 * costs the same per update as a short one, and finished paragraphs never
 * flicker while the last one streams.
 */
export function StreamingMarkdown({ text, streaming, onNavigate, className }: { text: string; streaming: boolean; onNavigate?: () => void; className?: string }) {
  const blocks = splitBlocks(text);
  return (
    <div className={cn("ask-markdown", className)}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} source={streaming && index === blocks.length - 1 ? healMarkdown(block) : block} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
