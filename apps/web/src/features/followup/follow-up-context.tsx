"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { DateText, DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { FollowUpEvidence, MemberFollowUpContext } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { presentSystemText, type SystemTextContext } from "@/lib/i18n/system-messages";
import { followUpDeliveryDetailLabel, followUpDeliveryLabel, followUpOutcomeLabel, followUpStopReasonLabel, followUpSuppressionReasonLabel } from "@/features/followup/follow-up-labels";

/**
 * The member's recorded follow-up context, as the member workspace and the
 * renewal queue show it. Everything in the panel is a fact RIVET already
 * holds: the renewal target, whether the automated journey stops and why,
 * consent and suppression, quiet hours, the reminders RIVET queued (with
 * wording that never says "delivered"), the last contact, an agreed
 * callback, the recorded evidence with a link to each timeline event, and
 * the open work. Staff decide what matters and what to send from the recorded
 * context; this panel only presents the facts and their evidence.
 */
export function useMemberFollowUpContext(memberId: string | undefined, enabled = true) {
  const query = useApiQuery(qk.memberFollowUpContext(memberId ?? ""), (api) => api.getMemberFollowUpContext(memberId ?? ""), { enabled: enabled && Boolean(memberId), refetchOnWindowFocus: false });
  const data = query.data as unknown;
  const context = data && typeof data === "object" && "renewal" in data && "evidence" in data && "messaging" in data ? (data as MemberFollowUpContext) : undefined;
  return { ...query, context };
}

/** The reusable evidence reference: the member's timeline, scrolled to the event. */
export function evidenceHref(memberId: string, evidenceId: string): string {
  return `/members/${memberId}?tab=timeline#timeline-event-${evidenceId}`;
}

/** Translate generated evidence before clipping it; authored/unknown text stays its original excerpt. */
export function presentedFollowUpExcerpt(item: Pick<FollowUpEvidence, "excerpt" | "bodyMessage">, context: SystemTextContext): string | undefined {
  if (!item.bodyMessage && !item.excerpt) return undefined;
  const normalized = presentSystemText(item.excerpt, item.bodyMessage, context).replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= 200) return normalized;
  let prefix = normalized.slice(0, 199);
  while (true) {
    const starts = prefix.match(/[\u2066-\u2068]/g)?.length ?? 0;
    const ends = prefix.match(/\u2069/g)?.length ?? 0;
    const unclosed = Math.max(0, starts - ends);
    const overflow = prefix.length + unclosed + 1 - 200;
    if (overflow <= 0) return `${prefix}${"\u2069".repeat(unclosed)}…`;
    prefix = prefix.slice(0, Math.max(0, prefix.length - overflow));
  }
}

export function EvidenceLine({ item, memberId, lead }: { item: FollowUpEvidence; memberId: string; lead?: string }) {
  const { locale, t } = useLocale();
  const format = useFormat();
  const excerpt = presentedFollowUpExcerpt(item, { locale, t, format });
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]" data-testid="follow-up-evidence" data-evidence-id={item.id}>
      {lead ? <span className="font-medium text-signal-deep">{lead}</span> : null}
      <span className="font-medium text-ink">{item.kind === "contact" ? followUpOutcomeLabel(t, item.outcome, item.outcomeLabel) ?? t("memberProfile.followUp.evidenceKind.contact") : t(`memberProfile.followUp.evidenceKind.${item.kind}`)}</span>
      <span className="text-ink-3"><RelativeText iso={item.occurredAt} /></span>
      {item.topics.map((topic) => (
        <Badge key={topic} variant={topic === "complaint" ? "danger" : topic === "callback" ? "warning" : "outline"}>{topic === "callback" ? t("memberProfile.followUp.topicCallback") : topic === "travel" ? t("memberProfile.followUp.topicTravel") : t("memberProfile.followUp.topicComplaint")}</Badge>
      ))}
      {item.flags.includes("opened_not_sent") ? <Badge variant="outline">{t("memberProfile.followUp.flagOpenedNotSent")}</Badge> : null}
      {item.flags.includes("not_sent") ? <Badge variant="outline">{t("memberProfile.followUp.flagNotSent")}</Badge> : null}
      {item.flags.includes("provider_accepted_not_confirmed") ? <Badge variant="outline">{t("memberProfile.followUp.flagDeliveryNotConfirmed")}</Badge> : null}
      {excerpt ? <span className="basis-full text-ink-2" dir="auto">“{excerpt}”</span> : null}
      <Link href={evidenceHref(memberId, item.id)} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{t("memberProfile.followUp.viewOnTimeline")}</Link>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-ink-2">{children}</dd>
    </>
  );
}

export function FollowUpContextPanel({ memberId, variant = "workspace", className }: { memberId: string; variant?: "workspace" | "renewal"; className?: string }) {
  const { t, isolate } = useLocale();
  const format = useFormat();
  const { context, isLoading, isError, refetch } = useMemberFollowUpContext(memberId);
  const [showAll, setShowAll] = useState(false);
  if (isLoading && !context) return <Skeleton className="h-24 w-full" data-testid="follow-up-context-loading" />;
  if (!context) {
    return isError ? (
      <p className="text-[12.5px] text-ink-3">{t("memberProfile.followUp.loadFailed")} <Button type="button" variant="link" size="xs" onClick={() => void refetch()}>{t("common.action.retry")}</Button></p>
    ) : null;
  }
  const { renewal, messaging } = context;
  const optedOut = messaging.consent === "explicit_opt_out" || messaging.channelOptedOut;
  const journeyStopReason = followUpStopReasonLabel(t, renewal.journeyStopReason, renewal.journeyStopLabel);
  const evidence = showAll ? context.evidence : context.evidence.slice(0, 5);
  return (
    <section data-testid="follow-up-context" aria-label={t("memberProfile.followUp.label")} className={cn("space-y-3", className)}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
        <Row label={t("memberProfile.followUp.rowRenewal")}>
          {renewal.membershipId && renewal.endDate ? <><bdi>{renewal.planName ?? t("memberProfile.followUp.membershipFallback")}</bdi> · {t("memberProfile.followUp.ends")} {format.date(renewal.endDate)} <DaysUntilText date={renewal.endDate} /></> : t("memberProfile.followUp.noRenewal")}
          {renewal.hasSuccessor ? ` · ${t("memberProfile.followUp.alreadyRenewed")}` : null}
        </Row>
        <Row label={t("memberProfile.followUp.rowReminders")}>{journeyStopReason ? <span data-testid="follow-up-journey-stopped">{t("memberProfile.followUp.journeyStopped", { reason: isolate(journeyStopReason) })}</span> : t("memberProfile.followUp.journeyRuns")}</Row>
        <Row label={t("memberProfile.followUp.rowMessages")}>
          {optedOut ? (
            <span className="font-medium text-danger" data-testid="follow-up-opt-out">{t("memberProfile.followUp.optedOut")}</span>
          ) : messaging.consent === "explicit_opt_in" ? (
            <span data-testid="follow-up-consent-in">{t("memberProfile.followUp.consentIn")}{messaging.suppressionReason ? ` · ${isolate(followUpSuppressionReasonLabel(t, messaging.suppressionReason)!)}` : ""}</span>
          ) : (
            <span data-testid="follow-up-consent-unknown">{t("memberProfile.followUp.consentUnknown")}{messaging.suppressionReason ? ` (${isolate(followUpSuppressionReasonLabel(t, messaging.suppressionReason)!)})` : ""}</span>
          )}
        </Row>
        {context.callback ? (
          <Row label={t("memberProfile.followUp.rowCallback")}>
            <span data-testid="follow-up-callback">
              {t("memberProfile.followUp.callbackAsked")} <RelativeText iso={context.callback.requestedAt} />
              {context.callback.dueAt ? <> · {t("memberProfile.followUp.callbackCallOn")} <DateText iso={context.callback.dueAt} />{context.callback.future ? "" : ` (${t("memberProfile.followUp.callbackPassed")})`}</> : ` · ${t("memberProfile.followUp.callbackNoDate")}`}
              {" · "}
              <Link href={evidenceHref(memberId, context.callback.evidenceId)} className="underline decoration-line-3 underline-offset-2">{t("memberProfile.followUp.seeTimeline")}</Link>
            </span>
          </Row>
        ) : null}
        {context.lastContact ? <Row label={t("memberProfile.followUp.rowLastContact")}><bdi>{followUpOutcomeLabel(t, context.lastContact.outcome, context.lastContact.label)}</bdi> · <RelativeText iso={context.lastContact.at} /></Row> : null}
        {renewal.outstanding.amount > 0 ? <Row label={t("memberProfile.shared.owes")}><MoneyText money={renewal.outstanding} className="text-warning-deep" /></Row> : null}
      </dl>

      {messaging.deliveries.length > 0 ? (
        <div data-testid="follow-up-deliveries">
          <p className="context-label">{t("memberProfile.followUp.deliveries")}</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {messaging.deliveries.map((delivery) => (
              <li key={delivery.id}>
                <span className="text-ink">{followUpDeliveryLabel(t, delivery)}</span>
                {delivery.detail ? <span className="text-ink-3"> · {followUpDeliveryDetailLabel(t, delivery, format.clock) ?? delivery.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-testid="follow-up-recorded">
        <p className="context-label">{t("memberProfile.followUp.recentHistory")}</p>
        {evidence.length ? (
          <ul className="mt-1 space-y-1.5">{evidence.map((item) => <EvidenceLine key={item.id} item={item} memberId={memberId} />)}</ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-ink-3">{t("memberProfile.followUp.noHistory")}</p>
        )}
        {context.evidence.length > 5 ? (
          <Button type="button" variant="link" size="xs" className="mt-1" onClick={() => setShowAll((current) => !current)}>{showAll ? t("memberProfile.followUp.showFewer") : t("memberProfile.followUp.showAll", { count: context.evidence.length })}</Button>
        ) : null}
      </div>

      {variant === "renewal" && context.relatedWork.length > 0 ? (
        <div data-testid="follow-up-related-work">
          <p className="context-label">{t("memberProfile.shared.openTasks")}</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {context.relatedWork.map((task) => (
              <li key={task.id}><span className="text-ink" dir="auto">{task.title}</span> <span className="text-ink-3">· <bdi>{task.ownerName}</bdi> · {t("memberProfile.relatedTask.due")} <RelativeText iso={task.dueAt} /></span>{task.relatedTaskTitle ? <span className="text-ink-3"> · {t("memberProfile.relatedTask.after", { title: isolate(task.relatedTaskTitle) })}</span> : null}</li>
            ))}
          </ul>
        </div>
      ) : null}

    </section>
  );
}
