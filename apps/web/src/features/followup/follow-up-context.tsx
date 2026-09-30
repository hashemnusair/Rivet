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
import { formatDate, formatTime } from "@/lib/utils/dates";

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

const KIND_LABEL: Record<FollowUpEvidence["kind"], string> = { contact: "Contact", note: "Note", snooze: "Hidden for later", message: "Message", freeze: "Freeze", renewal: "Renewal" };

export function EvidenceLine({ item, memberId, lead }: { item: FollowUpEvidence; memberId: string; lead?: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]" data-testid="follow-up-evidence" data-evidence-id={item.id}>
      {lead ? <span className="font-medium text-signal-deep">{lead}</span> : null}
      <span className="font-medium text-ink">{item.kind === "contact" ? item.outcomeLabel ?? "Contact" : KIND_LABEL[item.kind]}</span>
      <span className="text-ink-3"><RelativeText iso={item.occurredAt} /></span>
      {item.topics.map((topic) => (
        <Badge key={topic} variant={topic === "complaint" ? "danger" : topic === "callback" ? "warning" : "outline"}>{topic === "callback" ? "callback" : topic === "travel" ? "mentions travel" : "possible complaint"}</Badge>
      ))}
      {item.flags.includes("opened_not_sent") ? <Badge variant="outline">not confirmed as sent</Badge> : null}
      {item.flags.includes("not_sent") ? <Badge variant="outline">not sent</Badge> : null}
      {item.flags.includes("provider_accepted_not_confirmed") ? <Badge variant="outline">delivery not confirmed</Badge> : null}
      {item.excerpt ? <span className="basis-full text-ink-2" dir="auto">“{item.excerpt}”</span> : null}
      <Link href={evidenceHref(memberId, item.id)} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">View on timeline</Link>
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
  const { context, isLoading, isError, refetch } = useMemberFollowUpContext(memberId);
  const [showAll, setShowAll] = useState(false);
  if (isLoading && !context) return <Skeleton className="h-24 w-full" data-testid="follow-up-context-loading" />;
  if (!context) {
    return isError ? (
      <p className="text-[12.5px] text-ink-3">Follow-up details could not be loaded. <Button type="button" variant="link" size="xs" onClick={() => void refetch()}>Try again</Button></p>
    ) : null;
  }
  const { renewal, messaging } = context;
  const optedOut = messaging.consent === "explicit_opt_out" || messaging.channelOptedOut;
  const evidence = showAll ? context.evidence : context.evidence.slice(0, 5);
  return (
    <section data-testid="follow-up-context" aria-label="Follow-up details" className={cn("space-y-3", className)}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
        <Row label="Renewal">
          {renewal.membershipId && renewal.endDate ? <>{renewal.planName ?? "Membership"} · ends {formatDate(renewal.endDate)} <DaysUntilText date={renewal.endDate} /></> : "No membership to renew"}
          {renewal.hasSuccessor ? " · already renewed" : null}
        </Row>
        <Row label="Reminders">{renewal.journeyStopLabel ? <span data-testid="follow-up-journey-stopped">Automatic renewal reminders stopped: {renewal.journeyStopLabel}</span> : "Automatic renewal reminders may run for this membership"}</Row>
        <Row label="Messages">
          {optedOut ? (
            <span className="font-medium text-danger" data-testid="follow-up-opt-out">Said no to renewal messages · call instead</span>
          ) : messaging.consent === "explicit_opt_in" ? (
            <span data-testid="follow-up-consent-in">Agreed to receive renewal messages{messaging.suppressionReason ? ` · ${messaging.suppressionReason}` : ""}</span>
          ) : (
            <span data-testid="follow-up-consent-unknown">Not known if they agreed to messages · automatic reminders not sent{messaging.suppressionReason ? ` (${messaging.suppressionReason})` : ""}</span>
          )}
        </Row>
        <Row label="No messages">
          {messaging.quietHours.activeNow ? (
            <span className="font-medium text-warning-deep" data-testid="follow-up-quiet-hours">Now, {messaging.quietHours.start} to {messaging.quietHours.end} · reminders wait{messaging.quietHours.resumesAt ? ` until ${formatTime(messaging.quietHours.resumesAt)}` : ""}</span>
          ) : (
            `${messaging.quietHours.start} to ${messaging.quietHours.end} · not now`
          )}
        </Row>
        {context.callback ? (
          <Row label="Callback">
            <span data-testid="follow-up-callback">
              Asked <RelativeText iso={context.callback.requestedAt} />
              {context.callback.dueAt ? <> · call on <DateText iso={context.callback.dueAt} />{context.callback.future ? "" : " (date passed)"}</> : " · no date set"}
              {" · "}
              <Link href={evidenceHref(memberId, context.callback.evidenceId)} className="underline decoration-line-3 underline-offset-2">see timeline</Link>
            </span>
          </Row>
        ) : null}
        {context.lastContact ? <Row label="Last contact">{context.lastContact.label} · <RelativeText iso={context.lastContact.at} /></Row> : null}
        {renewal.outstanding.amount > 0 ? <Row label="Owes"><MoneyText money={renewal.outstanding} className="text-warning-deep" /></Row> : null}
      </dl>

      {messaging.deliveries.length > 0 ? (
        <div data-testid="follow-up-deliveries">
          <p className="context-label">Automatic reminders for this membership</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {messaging.deliveries.map((delivery) => (
              <li key={delivery.id}>
                <span className="text-ink">{delivery.label}</span>
                {delivery.detail ? <span className="text-ink-3"> · {delivery.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div data-testid="follow-up-recorded">
        <p className="context-label">Recent history</p>
        {evidence.length ? (
          <ul className="mt-1 space-y-1.5">{evidence.map((item) => <EvidenceLine key={item.id} item={item} memberId={memberId} />)}</ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-ink-3">No calls, notes or messages yet.</p>
        )}
        {context.evidence.length > 5 ? (
          <Button type="button" variant="link" size="xs" className="mt-1" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : `Show all ${context.evidence.length}`}</Button>
        ) : null}
      </div>

      {variant === "renewal" && context.relatedWork.length > 0 ? (
        <div data-testid="follow-up-related-work">
          <p className="context-label">Open tasks</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {context.relatedWork.map((task) => (
              <li key={task.id}><span className="text-ink">{task.title}</span> <span className="text-ink-3">· {task.ownerName} · due <RelativeText iso={task.dueAt} /></span>{task.relatedTaskTitle ? <span className="text-ink-3"> · after “{task.relatedTaskTitle}”</span> : null}</li>
            ))}
          </ul>
        </div>
      ) : null}

    </section>
  );
}
