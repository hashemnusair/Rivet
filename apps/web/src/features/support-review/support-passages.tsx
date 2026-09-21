"use client";

import type { ReactNode } from "react";
import type { SupportPassage } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { locatePassage } from "../../../convex/assistPassages";

export function supportPassageElementId(passageId: string): string {
  return `support-passage-${passageId}`;
}

/**
 * A message body with the flagged passages marked in place. A passage is
 * marked only when its exact text is still found in the body: an id whose
 * text no longer matches (an edited or replaced message) is silently not
 * highlighted rather than guessed at.
 */
export function HighlightedMessageBody({ messageId, body, highlights, className }: { messageId: string; body: string; highlights: readonly SupportPassage[]; className?: string }) {
  const own = highlights
    .filter((passage) => passage.messageId === messageId)
    .map((passage) => ({ passage, range: locatePassage(body, passage.text) }))
    .filter((entry): entry is { passage: SupportPassage; range: { start: number; end: number } } => Boolean(entry.range))
    .sort((left, right) => left.range.start - right.range.start);
  if (!own.length) return <p className={className}>{body}</p>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const { passage, range } of own) {
    if (range.start < cursor) continue;
    if (range.start > cursor) nodes.push(body.slice(cursor, range.start));
    nodes.push(
      <mark key={passage.id} id={supportPassageElementId(passage.id)} data-testid="support-passage-highlight" data-passage-id={passage.id} className={cn("rounded-sm bg-warning-bg px-0.5 text-inherit ring-1 ring-warning/40")}>
        {body.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < body.length) nodes.push(body.slice(cursor));
  return <p className={className}>{nodes}</p>;
}
