"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { DateText, DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { FollowUpEvidence, MemberFollowUpContext } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatTime } from "@/lib/utils/dates";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { percent } from "@/features/assist/assist-judgment";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";
import { eligibleReminderTemplates, reminderTemplateUnavailableReason, renderReminderForMember, resolveReminderTemplateReading, resolveRenewalContextReading } from "../../../convex/followupAssist";

/**
 * The member's recorded follow-up context, as the member workspace and the
 * renewal queue show it. Everything in the panel is a fact RIVET already
 * holds: the renewal target, whether the automated journey stops and why,
 * consent and suppression, quiet hours, the reminders RIVET queued (with
 * wording that never says "delivered"), the last contact, an agreed
 * callback, the recorded evidence with a link to each timeline event, and
 * the open work. Two optional Jev suggestions sit on top: which recorded
 * item matters most for the conversation, and whether an approved template
 * fits or staff should write the message. Nothing here sends anything.
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

const KIND_LABEL: Record<FollowUpEvidence["kind"], string> = { contact: "Contact", note: "Note", snooze: "Snoozed", message: "Message", freeze: "Freeze", renewal: "Renewal journey" };

export function EvidenceLine({ item, memberId, lead }: { item: FollowUpEvidence; memberId: string; lead?: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]" data-testid="follow-up-evidence" data-evidence-id={item.id}>
      {lead ? <span className="font-medium text-signal-deep">{lead}</span> : null}
      <span className="font-medium text-ink">{item.kind === "contact" ? item.outcomeLabel ?? "Contact" : KIND_LABEL[item.kind]}</span>
      <span className="text-ink-3"><RelativeText iso={item.occurredAt} /></span>
      {item.topics.map((topic) => (
        <Badge key={topic} variant={topic === "complaint" ? "danger" : topic === "callback" ? "warning" : "outline"}>{topic === "callback" ? "callback" : topic === "travel" ? "mentions travel" : "possible complaint"}</Badge>
      ))}
      {item.flags.includes("opened_not_sent") ? <Badge variant="outline">opened, not sent</Badge> : null}
      {item.flags.includes("not_sent") ? <Badge variant="outline">not sent</Badge> : null}
      {item.flags.includes("provider_accepted_not_confirmed") ? <Badge variant="outline">accepted, not confirmed</Badge> : null}
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
  const { session } = useApp();
  const { context, isLoading, isError, refetch } = useMemberFollowUpContext(memberId);
  const [showAll, setShowAll] = useState(false);
  if (isLoading && !context) return <Skeleton className="h-24 w-full" data-testid="follow-up-context-loading" />;
  if (!context) {
    return isError ? (
      <p className="text-[12.5px] text-ink-3">Follow-up context could not be loaded. <Button type="button" variant="link" size="xs" onClick={() => void refetch()}>Retry</Button></p>
    ) : null;
  }
  const { renewal, messaging } = context;
  const optedOut = messaging.consent === "explicit_opt_out" || messaging.channelOptedOut;
  const evidence = showAll ? context.evidence : context.evidence.slice(0, 5);
  return (
    <section data-testid="follow-up-context" aria-label="Follow-up context" className={cn("space-y-3", className)}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
        <Row label="Renewal">
          {renewal.membershipId && renewal.endDate ? <>{renewal.planName ?? "Membership"} · ends {formatDate(renewal.endDate)} <DaysUntilText date={renewal.endDate} /></> : "No membership to renew"}
          {renewal.hasSuccessor ? " · already renewed" : null}
        </Row>
        <Row label="Reminders">{renewal.journeyStopLabel ? <span data-testid="follow-up-journey-stopped">Automated renewal reminders stopped: {renewal.journeyStopLabel}</span> : "Automated renewal reminders may run for this term"}</Row>
        <Row label="Messages">
          {optedOut ? (
            <span className="font-medium text-danger" data-testid="follow-up-opt-out">Opted out of renewal messages · do not message; call instead</span>
          ) : messaging.consent === "explicit_opt_in" ? (
            <span data-testid="follow-up-consent-in">Opted in to renewal messages{messaging.suppressionReason ? ` · ${messaging.suppressionReason}` : ""}</span>
          ) : (
            <span data-testid="follow-up-consent-unknown">Consent unknown · automated reminders suppressed{messaging.suppressionReason ? ` (${messaging.suppressionReason})` : ""}</span>
          )}
        </Row>
        <Row label="Quiet hours">
          {messaging.quietHours.activeNow ? (
            <span className="font-medium text-warning-deep" data-testid="follow-up-quiet-hours">Now ({messaging.quietHours.start}–{messaging.quietHours.end}) · reminders deferred{messaging.quietHours.resumesAt ? ` until ${formatTime(messaging.quietHours.resumesAt)}` : ""}</span>
          ) : (
            `${messaging.quietHours.start}–${messaging.quietHours.end} · not now`
          )}
        </Row>
        {context.callback ? (
          <Row label="Callback">
            <span data-testid="follow-up-callback">
              Agreed <RelativeText iso={context.callback.requestedAt} />
              {context.callback.dueAt ? <> · due <DateText iso={context.callback.dueAt} />{context.callback.future ? "" : " (past)"}</> : " · no open date"}
              {" · "}
              <Link href={evidenceHref(memberId, context.callback.evidenceId)} className="underline decoration-line-3 underline-offset-2">evidence</Link>
            </span>
          </Row>
        ) : null}
        {context.lastContact ? <Row label="Last contact">{context.lastContact.label} · <RelativeText iso={context.lastContact.at} /></Row> : null}
        {renewal.outstanding.amount > 0 ? <Row label="Balance"><MoneyText money={renewal.outstanding} className="text-warning-deep" /></Row> : null}
      </dl>

      {messaging.deliveries.length > 0 ? (
        <div data-testid="follow-up-deliveries">
          <p className="context-label">Reminders RIVET queued for this term</p>
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
        <p className="context-label">Recorded</p>
        {evidence.length ? (
          <ul className="mt-1 space-y-1.5">{evidence.map((item) => <EvidenceLine key={item.id} item={item} memberId={memberId} />)}</ul>
        ) : (
          <p className="mt-1 text-[12.5px] text-ink-3">Nothing recorded yet: no calls, notes or messages.</p>
        )}
        {context.evidence.length > 5 ? (
          <Button type="button" variant="link" size="xs" className="mt-1" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show fewer" : `Show all ${context.evidence.length}`}</Button>
        ) : null}
      </div>

      {variant === "renewal" && context.relatedWork.length > 0 ? (
        <div data-testid="follow-up-related-work">
          <p className="context-label">Open work</p>
          <ul className="mt-1 space-y-1 text-[12.5px]">
            {context.relatedWork.map((task) => (
              <li key={task.id}><span className="text-ink">{task.title}</span> <span className="text-ink-3">· {task.ownerName} · due <RelativeText iso={task.dueAt} /></span>{task.relatedTaskTitle ? <span className="text-ink-3"> · follow-on to “{task.relatedTaskTitle}”</span> : null}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <RenewalContextHighlight context={context} />
      <ReminderTemplateSuggestion context={context} organizationName={session?.organization.name} />
    </section>
  );
}

/** Which recorded item matters most for the renewal conversation. Each item keeps its evidence link. */
export function RenewalContextHighlight({ context }: { context: MemberFollowUpContext }) {
  const suggestion = useAssistJudgment({ questionKey: "followup.renewal_context", subject: { memberId: context.memberId }, auto: false });
  if (!suggestion.featureReady || context.evidence.length === 0) return null;
  const render = (result: AssistReadyResult) => {
    const reading = resolveRenewalContextReading(result.judgment, context.evidence);
    if (reading.kind === "none") return <p data-testid="renewal-context-none">Nothing recorded changes how this conversation should go.</p>;
    return (
      <ul className="space-y-1.5" data-testid="renewal-context-items">
        {reading.items.map((item, index) => <EvidenceLine key={item.evidence.id} item={item.evidence} memberId={context.memberId} lead={`${index === 0 ? "Most relevant" : "Also"} · ${percent(item.probability)}`} />)}
      </ul>
    );
  };
  return (
    <div className="space-y-2" data-testid="renewal-context-highlight">
      <Button type="button" size="xs" variant="secondary" onClick={suggestion.request} loading={suggestion.state.status === "loading"} aria-label="Highlight what matters">
        <Sparkles /> {suggestion.state.status === "ready" ? "Highlight again" : "Highlight what matters"}
      </Button>
      <AssistSuggestion suggestion={suggestion} title="Before you talk about renewing" render={render} actions={<Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>} testId="renewal-context-card" />
    </div>
  );
}

/**
 * An approved reminder template for the term's timing, or staff review. The
 * page decides the gates: an explicit opt-out offers nothing; unknown
 * consent shows the suppression; quiet hours are named. "Use in WhatsApp"
 * opens the normal handoff with the text ready, which logs an opened
 * handoff and never claims a send.
 */
export function ReminderTemplateSuggestion({ context, organizationName }: { context: MemberFollowUpContext; organizationName?: string }) {
  const suggestion = useAssistJudgment({ questionKey: "followup.reminder_template", subject: { memberId: context.memberId }, auto: false });
  const [handoffMessage, setHandoffMessage] = useState<string>();
  if (!suggestion.featureReady) return null;
  const optedOut = context.messaging.consent === "explicit_opt_out" || context.messaging.channelOptedOut;
  if (optedOut) return <p className="text-[12px] text-ink-3" data-testid="reminder-blocked">No message suggestions: this member opted out of renewal messages. Call instead.</p>;
  // The same deterministic gate the loader applies: nothing is asked when no approved template fits the timing.
  if (reminderTemplateUnavailableReason(context)) return null;
  const offered = eligibleReminderTemplates(context);
  const gym = organizationName ?? "RIVET";
  const whyStaff = context.callback?.future
    ? `a callback is agreed for ${context.callback.dueAt ? formatDate(context.callback.dueAt) : "later"}`
    : context.evidence.some((item) => item.topics.includes("complaint"))
      ? "a possible complaint is recorded"
      : context.lastContact?.outcome === "answered_not_interested"
        ? "the last contact declined"
        : undefined;
  const bodyFor = (result: AssistReadyResult) => {
    const reading = resolveReminderTemplateReading(result.judgment, offered);
    return reading.kind === "template" ? { reading, body: renderReminderForMember(reading.template, context, gym) } : { reading, body: undefined };
  };
  const render = (result: AssistReadyResult) => {
    const { reading, body } = bodyFor(result);
    if (reading.kind === "staff_review" || !body) {
      return (
        <div data-testid="reminder-staff-review">
          <p>Write this one yourself{whyStaff ? `: ${whyStaff}` : ""}. The standard reminder would read wrong here.</p>
        </div>
      );
    }
    return (
      <div data-testid="reminder-template">
        <p><strong>{reading.template.name}</strong> · approved utility template</p>
        <blockquote dir="auto" className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink">{body}</blockquote>
        {context.messaging.consent !== "explicit_opt_in" ? <p className="mt-1 text-[12px] text-warning-deep" data-testid="reminder-suppressed">RIVET&apos;s automated reminders are suppressed for this member{context.messaging.suppressionReason ? ` (${context.messaging.suppressionReason.toLowerCase()})` : ""}. A WhatsApp you open yourself is logged as opened, never as sent.</p> : null}
        {context.messaging.quietHours.activeNow ? <p className="mt-1 text-[12px] text-warning-deep">Quiet hours now: a message would reach them during quiet hours. Consider waiting{context.messaging.quietHours.resumesAt ? ` until ${formatTime(context.messaging.quietHours.resumesAt)}` : ""}.</p> : null}
      </div>
    );
  };
  const actions = (result: AssistReadyResult) => {
    const { reading, body } = bodyFor(result);
    if (reading.kind === "staff_review" || !body) return <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>;
    return (
      <>
        <Button type="button" size="sm" onClick={() => setHandoffMessage(body)} data-testid="reminder-use-whatsapp">Use in WhatsApp</Button>
        <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>
      </>
    );
  };
  return (
    <div className="space-y-2" data-testid="reminder-suggestion">
      <Button type="button" size="xs" variant="secondary" onClick={suggestion.request} loading={suggestion.state.status === "loading"} aria-label="Suggest a message">
        <Sparkles /> {suggestion.state.status === "ready" ? "Suggest again" : "Suggest a message"}
      </Button>
      <AssistSuggestion suggestion={suggestion} title="Reminder message" render={render} actions={actions} testId="reminder-card" />
      <WhatsAppHandoff subject="member" subjectId={context.memberId} recipientName={context.memberName} phone={context.phone ?? ""} organizationName={gym} initialMessage={handoffMessage} open={Boolean(handoffMessage)} onOpenChange={(open) => { if (!open) setHandoffMessage(undefined); }} hideTrigger />
    </div>
  );
}
