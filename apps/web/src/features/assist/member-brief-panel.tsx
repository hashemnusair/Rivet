"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import type { AiBriefLine, AiMemberBrief } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAiMessage } from "./ai-message";
import { useMemberBrief } from "./use-assist";

const VISIBLE_LINES = 4;

function BriefLine({ line }: { line: AiBriefLine }) {
  const { t } = useLocale();
  const present = useAiMessage();
  const source = line.sources.find((item) => item.href);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]" data-testid="member-brief-line" data-basis={line.basis} data-line={line.key}>
      <span className={cn("min-w-0 text-ink-2", line.tone === "attention" && "text-ink", line.tone === "positive" && "text-success-deep")} dir="auto">{present(line.message)}</span>
      {line.basis !== "observed" ? <Badge variant="outline">{t(`aiWork.brief.basis.${line.basis}`)}</Badge> : null}
      {source?.href ? <Link href={source.href} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{t("aiWork.brief.viewSource")}</Link> : null}
    </li>
  );
}

function PreparedDraft({ draft }: { draft: { language: "en" | "ar"; text: string; preparedAt: string } }) {
  const { t } = useLocale();
  const format = useFormat();
  return (
    <div className="space-y-1" data-testid="member-brief-draft">
      <p className="context-label">{t("aiWork.brief.preparedDraft")}</p>
      <p className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-2" dir={draft.language === "ar" ? "rtl" : "ltr"} lang={draft.language}>{draft.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[12px] text-ink-3">{t("aiWork.brief.preparedDraftHint", { at: format.dateTime(draft.preparedAt) })}</p>
        <Button type="button" variant="ghost" size="xs" onClick={() => { void navigator.clipboard?.writeText(draft.text).then(() => toast.success(t("aiWork.run.copied")), () => undefined); }}>{t("aiWork.run.copyDraft")}</Button>
      </div>
    </div>
  );
}

/** The brief itself, for callers that already loaded it. */
export function MemberBriefView({ brief, preparedDraft, className, compact = false }: { brief: AiMemberBrief; preparedDraft?: { language: "en" | "ar"; text: string; preparedAt: string }; className?: string; compact?: boolean }) {
  const { t } = useLocale();
  const present = useAiMessage();
  const invalidate = useInvalidate();
  const [showAll, setShowAll] = useState(false);
  const stopUsing = useApiMutation<void, string>((api, memoryId) => api.revokeMemberMemory(memoryId), {
    successMessage: t("aiWork.brief.stopped"),
    onSuccess: async () => { await invalidate([qk.memberBrief(brief.memberId)]); },
  });
  const lines = showAll || compact ? brief.lines : brief.lines.slice(0, VISIBLE_LINES);
  return (
    <section aria-label={t("aiWork.brief.title")} data-testid="member-brief" className={cn("space-y-2.5 rounded-lg border border-line bg-sunken/40 px-3.5 py-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="context-label">{t("aiWork.brief.title")}</p>
        {brief.source === "fixture" ? <Badge variant="outline">{t("aiWork.extract.testMode")}</Badge> : null}
      </div>
      <p className="text-[13.5px] font-medium text-ink" data-testid="member-brief-headline" dir="auto">{present(brief.headline)}</p>
      {lines.length ? <ul className="space-y-1">{lines.map((line) => <BriefLine key={line.key} line={line} />)}</ul> : null}
      {!compact && brief.lines.length > VISIBLE_LINES ? (
        <Button type="button" variant="link" size="xs" onClick={() => setShowAll((value) => !value)}>{showAll ? t("aiWork.run.hide") : t("aiWork.run.viewAll")}</Button>
      ) : null}
      {brief.gaps.length ? (
        <ul className="space-y-0.5" data-testid="member-brief-gaps">
          {brief.gaps.map((gap) => <li key={gap.key} className="text-[12px] text-ink-3">{present(gap)}</li>)}
        </ul>
      ) : null}
      {brief.activeStatements.length ? (
        <div className="space-y-1 border-t border-line pt-2" data-testid="member-brief-statements">
          <p className="context-label">{t("aiWork.brief.statementsTitle")}</p>
          <ul className="space-y-1">
            {brief.activeStatements.map((statement) => (
              <li key={statement.id} className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
                <span dir="auto">{statement.topic === "travel" && statement.effectiveUntil
                  ? present({ key: "aiWork.brief.travelStatement", params: { date: { date: statement.effectiveUntil }, name: statement.provenance.recordedByName } })
                  : statement.topic === "contact_time"
                    ? present({ key: "aiWork.brief.contactTimeStatement", params: { time: { enum: "timeOfDay", value: statement.text }, name: statement.provenance.recordedByName } })
                    : statement.text}</span>
                <Button type="button" variant="ghost" size="xs" loading={stopUsing.isPending && stopUsing.variables === statement.id} onClick={() => stopUsing.mutate(statement.id)}>{t("aiWork.brief.stopUsing")}</Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preparedDraft ? <PreparedDraft draft={preparedDraft} /> : null}
    </section>
  );
}

/**
 * Member context beside a contact action. Renders nothing while assistance
 * is off for the gym, and a short note if the details cannot be loaded; the
 * contact form beside it always keeps working.
 */
export function MemberBriefPanel({ memberId, className, compact }: { memberId: string; className?: string; compact?: boolean }) {
  const { t } = useLocale();
  const { data, isLoading, isError } = useMemberBrief(memberId);
  if (isLoading && !data) return <Skeleton className={cn("h-20 w-full", className)} aria-label={t("aiWork.brief.loading")} data-testid="member-brief-loading" />;
  if (isError) return <p className={cn("text-[12px] text-ink-3", className)} data-testid="member-brief-unavailable">{t("aiWork.brief.unavailable")}</p>;
  if (!data?.available) return null;
  return <MemberBriefView brief={data.brief} preparedDraft={data.preparedDraft} className={className} compact={compact} />;
}
