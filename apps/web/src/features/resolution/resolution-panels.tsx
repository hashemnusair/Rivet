"use client";

import { Banknote, CalendarClock, Dumbbell, ExternalLink, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateText, DateTimeText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from "@/components/shared/status-chip";
import type { MemberResolutionContext, PlanAttributeId, ResolutionClassOption, ResolutionEvidence, ResolutionPanelId, ResolutionTrainerOption } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { receiptHref } from "@/lib/utils/receipt-links";
import { AssistSuggestion } from "@/features/assist/assist-suggestion";
import { useAssistJudgment, type AssistReadyResult } from "@/features/assist/use-assist-judgment";
import { evidenceHref } from "@/features/followup/follow-up-context";
import {
  PLAN_ATTRIBUTES,
  SERVICE_LABELS,
  comparePlans,
  describeInstant,
  readTrainingPayment,
  resolveClassPickReading,
  resolvePlanPriorityReading,
  resolveTrainerPickReading,
  resolutionPanel,
} from "../../../convex/resolutionAssist";

/**
 * The approved panels of the member resolution workspace. Each one reads
 * the deterministic context the server built (never a second source of
 * truth for money or membership state), links every fact to its evidence,
 * and offers only actions that already exist on the page or in the app.
 * Nothing here executes on its own: every action is a click by the person.
 */
export interface PanelProps {
  context: MemberResolutionContext;
  goal: string;
  onClose: () => void;
  refetch: () => Promise<unknown>;
  onCreateTask?: () => void;
}

export function PanelFrame({ id, onClose, children, testId }: { id: ResolutionPanelId; onClose: () => void; children: React.ReactNode; testId?: string }) {
  const panel = resolutionPanel(id);
  return (
    <section className="panel p-4" aria-label={panel?.label ?? id} data-testid={testId ?? `resolution-panel-${id}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] font-semibold">{panel?.label ?? id}</h3>
          {panel ? <p className="mt-0.5 text-[12px] text-ink-3">{panel.description}</p> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={`Close ${panel?.label ?? id}`}><X /></Button>
      </header>
      {children}
    </section>
  );
}

function EvidenceLinks({ memberId, items, max = 6 }: { memberId: string; items: ResolutionEvidence[]; max?: number }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-[12px]" data-testid="resolution-evidence">
      {items.slice(0, max).map((event) => (
        <li key={event.id} className="flex flex-wrap items-baseline gap-x-2" data-evidence-id={event.id}>
          <span className="text-ink">{event.title}</span>
          <span className="text-ink-3"><DateTimeText iso={event.occurredAt} /></span>
          {event.receiptId ? <Link href={receiptHref(event.receiptId)} className="underline decoration-line-3 underline-offset-2">receipt</Link> : null}
          <Link href={evidenceHref(memberId, event.id)} className="text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">timeline</Link>
        </li>
      ))}
    </ul>
  );
}

function PaymentRows({ context, service }: { context: MemberResolutionContext; service?: "personal_training" | "membership" }) {
  const rows = context.payments.filter((payment) => !service || payment.service === service);
  if (!context.access.payments) return <p className="text-[12px] text-ink-3" data-testid="resolution-payments-restricted">Payment rows need financial report access. Charges and PT orders are shown from the member record.</p>;
  if (!rows.length) return <p className="text-[12px] text-ink-3">No payment recorded{service ? ` for ${SERVICE_LABELS[service].toLowerCase()}` : ""}.</p>;
  return (
    <ul className="divide-y divide-line" data-testid={`resolution-payments-${service ?? "all"}`}>
      {rows.map((payment) => (
        <li key={payment.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[12.5px]">
          <span className="font-medium text-ink"><MoneyText money={payment.amount} /></span>
          <span className="text-ink-2">{TRANSACTION_TYPE_LABELS[payment.type as keyof typeof TRANSACTION_TYPE_LABELS] ?? payment.type} · {PAYMENT_METHOD_LABELS[payment.method as keyof typeof PAYMENT_METHOD_LABELS] ?? payment.method}</span>
          <Badge variant={payment.service === "personal_training" ? "signal" : payment.service === "membership" ? "ink" : "outline"}>{SERVICE_LABELS[payment.service]}</Badge>
          <span className="text-ink-3"><DateTimeText iso={payment.occurredAt} /></span>
          {payment.chargeDescription ? <span className="text-ink-3">for “{payment.chargeDescription}”</span> : null}
          <Link href={receiptHref(payment.receiptId)} className="font-mono text-[12px] underline decoration-line-3 underline-offset-2">{payment.receiptNumber}</Link>
        </li>
      ))}
    </ul>
  );
}

function ChargeRows({ context, filter, testId }: { context: MemberResolutionContext; filter: (charge: MemberResolutionContext["charges"][number]) => boolean; testId: string }) {
  const rows = context.charges.filter(filter);
  if (!rows.length) return <p className="text-[12px] text-ink-3">None.</p>;
  return (
    <ul className="divide-y divide-line" data-testid={testId}>
      {rows.map((charge) => (
        <li key={charge.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[12.5px]">
          <span className="font-medium text-ink">{charge.description}</span>
          <Badge variant={charge.service === "personal_training" ? "signal" : charge.service === "membership" ? "ink" : "outline"}>{SERVICE_LABELS[charge.service]}</Badge>
          <span className="text-ink-2">total <MoneyText money={charge.total} /> · paid <MoneyText money={charge.paidAmount} /></span>
          {charge.outstandingAmount.amount > 0 ? <span className="font-medium text-warning-deep">outstanding <MoneyText money={charge.outstandingAmount} /></span> : <span className="text-success-deep">settled</span>}
          {charge.issueDate ? <span className="text-ink-3">issued <DateText iso={charge.issueDate} /></span> : null}
          {!charge.collectible && charge.outstandingAmount.amount > 0 ? <span className="text-ink-3">not collectible yet</span> : null}
        </li>
      ))}
    </ul>
  );
}

function CollectLink({ context }: { context: MemberResolutionContext }) {
  if (!context.access.collect || context.facts.outstandingMinor <= 0) return null;
  return <Button asChild size="sm" variant="secondary"><Link href={`/members/${context.memberId}?action=collect`}><Banknote /> Collect payment</Link></Button>;
}

// ---------------------------------------------------------------------------
// "I already paid for training"
// ---------------------------------------------------------------------------
export function TrainingPaymentPanel({ context, onClose }: PanelProps) {
  const reading = readTrainingPayment(context);
  const ptEvidence = context.evidence.filter((event) => event.type.startsWith("pt_") || event.type === "payment_collected" || event.type === "payment_refunded");
  return (
    <PanelFrame id="panel.training_payment" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="context-label">Paid for personal training</p>
          <PaymentRows context={context} service="personal_training" />
          {reading.ptOrders.length ? (
            <ul className="mt-2 space-y-1 text-[12.5px]" data-testid="resolution-pt-orders">
              {reading.ptOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-baseline gap-x-2">
                  <Dumbbell className="size-3.5 text-ink-3" aria-hidden />
                  <span className="font-medium text-ink">{order.packageName}</span>
                  <span className="text-ink-2">{order.sessionCount} sessions · <MoneyText money={order.totalPrice} /></span>
                  <Badge variant={order.status === "active" ? "success" : order.status === "pending_payment" ? "warning" : "outline"}>{order.status.replaceAll("_", " ")}</Badge>
                  {order.paidAt ? <span className="text-ink-3">paid <DateText iso={order.paidAt} /></span> : <span className="text-ink-3">created <DateText iso={order.createdAt} /></span>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[12px] text-ink-3">No PT package order on record.</p>}
          {reading.openPtCharges.length ? <><p className="context-label mt-3">PT charges still open</p><ChargeRows context={context} filter={(charge) => charge.service === "personal_training" && charge.outstandingAmount.amount > 0} testId="resolution-open-pt-charges" /></> : null}
        </div>
        <div>
          <p className="context-label">Membership charges still open</p>
          <ChargeRows context={context} filter={(charge) => charge.service === "membership" && charge.outstandingAmount.amount > 0} testId="resolution-open-membership-charges" />
          {reading.paidMembershipCharges.length ? <p className="mt-2 text-[12px] text-ink-3">{reading.paidMembershipCharges.length} membership charge{reading.paidMembershipCharges.length === 1 ? "" : "s"} already settled.</p> : null}
        </div>
      </div>
      <p className="mt-3 rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink-2" data-testid="resolution-service-note">
        A payment settles only the charge it was recorded against. {reading.crossedServices ? "The personal-training payment above does not settle the membership charge, and nothing on this page changes either balance." : "Each service keeps its own charge and its own payment; nothing here changes a balance."}
      </p>
      <EvidenceLinks memberId={context.memberId} items={ptEvidence} />
      <div className="mt-3 flex flex-wrap gap-2">
        <CollectLink context={context} />
        <Button asChild size="sm" variant="ghost"><Link href={`/members/${context.memberId}?tab=payments`}>Payments tab</Link></Button>
        <Button asChild size="sm" variant="ghost"><Link href={`/members/${context.memberId}?tab=pt`}>PT tab</Link></Button>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Balance and payments
// ---------------------------------------------------------------------------
export function BalancePanel({ context, onClose }: PanelProps) {
  const moneyEvidence = context.evidence.filter((event) => event.type.startsWith("payment_") || event.type === "membership_sold" || event.type === "membership_renewed");
  return (
    <PanelFrame id="panel.balance" onClose={onClose}>
      <p className="text-[13px]">
        Outstanding now: <strong><MoneyText money={{ amount: context.facts.outstandingMinor, currency: context.currency }} /></strong> across {context.facts.openCharges} open charge{context.facts.openCharges === 1 ? "" : "s"}.
      </p>
      <p className="context-label mt-3">Charges</p>
      <ChargeRows context={context} filter={() => true} testId="resolution-charges" />
      <p className="context-label mt-3">Payments, refunds and voids</p>
      <PaymentRows context={context} />
      <EvidenceLinks memberId={context.memberId} items={moneyEvidence} />
      <div className="mt-3 flex flex-wrap gap-2">
        <CollectLink context={context} />
        <Button asChild size="sm" variant="ghost"><Link href={`/members/${context.memberId}?tab=payments`}>Payments tab</Link></Button>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Membership terms
// ---------------------------------------------------------------------------
export function MembershipTermsPanel({ context, onClose }: PanelProps) {
  const term = context.membership;
  const termEvidence = context.evidence.filter((event) => event.type.startsWith("membership_"));
  return (
    <PanelFrame id="panel.membership_terms" onClose={onClose}>
      {term ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]" data-testid="resolution-terms">
          <dt className="text-ink-3">Plan</dt><dd>{term.planName} <Badge variant="outline">{term.status}</Badge></dd>
          <dt className="text-ink-3">Term</dt><dd>{formatDate(term.startDate)} → {formatDate(term.endDate)} · {term.daysUntilExpiry >= 0 ? `${term.daysUntilExpiry} days left` : `ended ${-term.daysUntilExpiry} days ago`}</dd>
          <dt className="text-ink-3">Freezing</dt><dd>{term.freezeAllowanceDays > 0 ? `${term.frozenDaysUsed} of ${term.freezeAllowanceDays} freeze days used` : "No freezing on this plan"}{term.activeFreeze ? ` · frozen ${formatDate(term.activeFreeze.startDate)} → ${formatDate(term.activeFreeze.endDate)}` : ""}</dd>
          {term.totalVisits != null ? <><dt className="text-ink-3">Visits</dt><dd>{term.remainingVisits ?? 0} of {term.totalVisits} left</dd></> : null}
          <dt className="text-ink-3">Included PT</dt><dd>{term.includedPtSessions > 0 ? `${term.includedPtSessions} sessions per term` : "None"}</dd>
          <dt className="text-ink-3">Branches</dt><dd>{term.branchAccess === "all" ? "All branches" : "Selected branches"}</dd>
          <dt className="text-ink-3">Price</dt><dd><MoneyText money={term.salePrice} /> · {term.paymentStatus}{term.outstanding.amount > 0 ? <> · <span className="text-warning-deep"><MoneyText money={term.outstanding} /> outstanding</span></> : null}</dd>
        </dl>
      ) : <p className="text-[12.5px] text-ink-3">No current membership term.</p>}
      <EvidenceLinks memberId={context.memberId} items={termEvidence} />
      <div className="mt-3 flex flex-wrap gap-2">
        {context.access.sell ? <Button asChild size="sm" variant="secondary"><Link href={`/members/${context.memberId}?action=renew`}><CalendarClock /> Renew</Link></Button> : null}
        <CollectLink context={context} />
        <Button asChild size="sm" variant="ghost"><Link href={`/members/${context.memberId}?tab=memberships`}>Memberships tab</Link></Button>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">Freeze, extend, transfer and change plan stay in the header&apos;s actions menu; each records a reason and an audit event.</p>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Plan comparison
// ---------------------------------------------------------------------------
export function PlanComparePanel({ context, goal, onClose }: PanelProps) {
  const [priorityText, setPriorityText] = useState(goal);
  const [asked, setAsked] = useState("");
  const [emphasized, setEmphasized] = useState<PlanAttributeId[]>([]);
  const suggestion = useAssistJudgment({ questionKey: "resolution.plan_priority", subject: { memberId: context.memberId, goal: asked }, enabled: true, auto: Boolean(asked) });
  const comparison = comparePlans(context.plans, context.membership?.planId, emphasized);
  const toggle = (attribute: PlanAttributeId) => setEmphasized((current) => (current.includes(attribute) ? current.filter((item) => item !== attribute) : [...current, attribute]));
  const render = (result: AssistReadyResult) => {
    const reading = resolvePlanPriorityReading(result.judgment);
    if (!reading.primary) return <p data-testid="plan-priority-none">The request names no plan priority. Pick what to emphasise below, or read the full table.</p>;
    return <p data-testid="plan-priority-reading">Emphasise <strong>{reading.emphasized.map((id) => PLAN_ATTRIBUTES.find((attribute) => attribute.id === id)?.label ?? id).join(", ")}</strong>. Every term and price stays in the table.</p>;
  };
  const actions = (result: AssistReadyResult) => {
    const reading = resolvePlanPriorityReading(result.judgment);
    if (!reading.primary) return <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>;
    return (
      <>
        <Button type="button" size="sm" onClick={() => { setEmphasized(reading.emphasized); suggestion.dismiss(); }} data-testid="plan-priority-apply">Emphasise these</Button>
        <Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Keep my choice</Button>
      </>
    );
  };
  return (
    <PanelFrame id="panel.plan_compare" onClose={onClose}>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (priorityText.trim().length >= 3) setAsked(priorityText.trim()); }}>
        <label className="grid min-w-0 flex-1 gap-1 text-[12px] font-medium">
          What matters to the member?
          <Input value={priorityText} onChange={(event) => setPriorityText(event.target.value)} placeholder="e.g. travels a lot, needs both branches, wants training included" aria-label="Plan priority request" />
        </label>
        {suggestion.featureReady ? <Button type="submit" size="sm" variant="secondary" disabled={priorityText.trim().length < 3}><Sparkles /> Suggest what to emphasise</Button> : null}
      </form>
      <AssistSuggestion suggestion={suggestion} title="Plan priority" render={render} actions={actions} testId="plan-priority-card" className="mt-2" />
      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Emphasised plan attributes">
        <span className="text-[12px] text-ink-3">Emphasise:</span>
        {PLAN_ATTRIBUTES.map((attribute) => (
          <button key={attribute.id} type="button" aria-pressed={emphasized.includes(attribute.id)} onClick={() => toggle(attribute.id)} className={cn("min-h-8 rounded-full border px-3 text-[12px] font-medium transition-colors", emphasized.includes(attribute.id) ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2 hover:border-line-3")}>{attribute.label}</button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]" data-testid="plan-comparison">
          <thead>
            <tr className="text-start text-[11.5px] text-ink-3">
              <th className="py-1.5 pe-3 text-start font-medium">Plan</th>
              {comparison.columns.map((column) => <th key={column} className={cn("py-1.5 pe-3 text-start font-medium", emphasized.includes(column) && "text-ink")}>{PLAN_ATTRIBUTES.find((attribute) => attribute.id === column)?.label}{emphasized.includes(column) ? " ★" : ""}</th>)}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.plan.id} className={cn("border-t border-line", row.current && "bg-sunken/50")} data-testid={`plan-row-${row.plan.code}`}>
                <td className="py-2 pe-3 font-medium text-ink">{row.plan.name}{row.current ? <Badge variant="ink" className="ms-1.5">current</Badge> : null}</td>
                {row.cells.map((cell) => (
                  <td key={cell.attribute} className={cn("py-2 pe-3", emphasized.includes(cell.attribute) && "font-medium text-ink", cell.versusCurrent === "more" && emphasized.includes(cell.attribute) && "text-success-deep", cell.versusCurrent === "less" && emphasized.includes(cell.attribute) && "text-warning-deep")}>
                    {cell.text}{!row.current && emphasized.includes(cell.attribute) && cell.versusCurrent !== "n/a" && cell.versusCurrent !== "same" ? <span className="ms-1 text-[11px] text-ink-3">({cell.versusCurrent === "more" ? "more than current" : "less than current"})</span> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">Comparison only. Changing the plan happens through the header&apos;s actions menu, with a reason and an audit event.</p>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------
function ClassLine({ option, timezone, action }: { option: ResolutionClassOption; timezone: string; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-[12.5px]" data-testid={`resolution-class-${option.id}`}>
      <span className="font-medium text-ink">{option.name}</span>
      <span className="text-ink-2">{describeInstant(option.startsAt, timezone)}</span>
      {option.coachName ? <span className="text-ink-3">coach {option.coachName}</span> : null}
      <Badge variant="outline">{option.audience === "mixed" ? "everyone" : option.audience === "women" ? "women only" : "men only"}</Badge>
      <span className={cn("tabular", option.spotsRemaining > 0 ? "text-ink-3" : "font-medium text-warning-deep")}>{option.spotsRemaining > 0 ? `${option.spotsRemaining} of ${option.capacity} spots` : `full · ${option.waitlistCount} waiting`}</span>
      {option.alreadyBooked ? <Badge variant="success">booked</Badge> : null}
      {!option.eligible && option.blockReason ? <span className="text-ink-3">{option.blockReason}</span> : null}
      {action}
    </li>
  );
}

export function ClassesPanel({ context, goal, onClose, refetch }: PanelProps) {
  const invalidate = useInvalidate();
  const [askText, setAskText] = useState(goal);
  const [asked, setAsked] = useState("");
  const [stale, setStale] = useState<string>();
  const [showBlocked, setShowBlocked] = useState(false);
  const joinable = context.classes.options.filter((option) => option.eligible);
  const blocked = context.classes.options.filter((option) => !option.eligible);
  const suggestion = useAssistJudgment({ questionKey: "resolution.class_pick", subject: { memberId: context.memberId, goal: asked }, enabled: joinable.length > 0, auto: Boolean(asked) });
  const add = useApiMutation((api, option: ResolutionClassOption) => api.addClassOccurrenceAttendee({ occurrenceId: option.id, memberId: context.memberId, membershipId: context.membership!.id }), {
    onSuccess: async (occurrence) => { toast.success(`${context.memberName} ${occurrence.roster.some((entry) => entry.memberId === context.memberId && entry.status === "waitlisted") ? "joined the waitlist for" : "is booked into"} ${occurrence.name}.`); await invalidate(); await refetch(); },
    onError: (error) => toast.error(isApiError(error) ? error.message : "The class could not be booked."),
  });
  const addToClass = async (option: ResolutionClassOption) => {
    setStale(undefined);
    // Availability is re-read before anything is booked: a class that filled or was cancelled since the suggestion is refused here, and the server refuses it again.
    const fresh = (await refetch()) as { data?: MemberResolutionContext } | undefined;
    const latest = fresh?.data?.classes.options.find((candidate) => candidate.id === option.id) ?? (await getApi().getMemberResolutionContext(context.memberId)).classes.options.find((candidate) => candidate.id === option.id);
    if (!latest || !latest.eligible) { setStale(`${option.name} changed since the suggestion${latest?.blockReason ? `: ${latest.blockReason}` : "."}`); suggestion.dismiss(); return; }
    add.mutate(latest);
  };
  const action = (option: ResolutionClassOption) => context.access.roster && context.membership && option.eligible
    ? <Button type="button" size="xs" variant="secondary" loading={add.isPending && add.variables?.id === option.id} onClick={() => void addToClass(option)} data-testid={`resolution-class-add-${option.id}`}>{option.wouldWaitlist ? "Join waitlist" : "Add to class"}</Button>
    : null;
  const render = (result: AssistReadyResult) => {
    const reading = resolveClassPickReading(result.judgment, context.classes.options);
    if (reading.kind === "none") return <p data-testid="class-pick-none">No joinable class fits that request. The full list below is what the member can actually join.</p>;
    return <ul data-testid="class-pick-match"><ClassLine option={reading.option} timezone={context.timezone} action={action(reading.option)} /></ul>;
  };
  return (
    <PanelFrame id="panel.classes" onClose={onClose}>
      {!context.classes.policyEnabled ? <p className="mb-2 text-[12.5px] text-warning-deep">Class booking is paused for this gym.</p> : null}
      {!context.membership ? <p className="mb-2 text-[12.5px] text-warning-deep">No current membership: classes cannot be booked.</p> : null}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (askText.trim().length >= 3) { setStale(undefined); setAsked(askText.trim()); } }}>
        <label className="grid min-w-0 flex-1 gap-1 text-[12px] font-medium">
          What did the member ask for?
          <Input value={askText} onChange={(event) => setAskText(event.target.value)} placeholder="e.g. a morning class this Sunday, boxing, yoga with Rami" aria-label="Class request" />
        </label>
        {suggestion.featureReady && joinable.length > 0 ? <Button type="submit" size="sm" variant="secondary" disabled={askText.trim().length < 3}><Sparkles /> Which class fits?</Button> : null}
      </form>
      {stale ? <p role="status" className="mt-2 text-[12.5px] text-warning-deep" data-testid="resolution-class-stale">{stale}</p> : null}
      <AssistSuggestion suggestion={suggestion} title="Suggested class" render={render} actions={<Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>} testId="class-pick-card" className="mt-2" />
      <p className="context-label mt-3">Joinable in the next {context.classes.horizonDays} days · {context.homeBranchName}</p>
      {joinable.length ? <ul className="divide-y divide-line" data-testid="resolution-classes-joinable">{joinable.map((option) => <ClassLine key={option.id} option={option} timezone={context.timezone} action={action(option)} />)}</ul> : <p className="text-[12.5px] text-ink-3" data-testid="resolution-classes-none">No class the member can join in this window.</p>}
      {blocked.length ? (
        <div className="mt-2">
          <Button type="button" variant="link" size="xs" onClick={() => setShowBlocked((current) => !current)}>{showBlocked ? "Hide" : "Show"} {blocked.length} not joinable</Button>
          {showBlocked ? <ul className="divide-y divide-line" data-testid="resolution-classes-blocked">{blocked.map((option) => <ClassLine key={option.id} option={option} timezone={context.timezone} />)}</ul> : null}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="ghost"><Link href={`/classes?branch=${encodeURIComponent(context.homeBranchId)}`}><ExternalLink /> Open Classes</Link></Button>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Trainers
// ---------------------------------------------------------------------------
function TrainerLine({ option, timezone, action }: { option: ResolutionTrainerOption; timezone: string; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-[12.5px]" data-testid={`resolution-trainer-${option.id}`}>
      <span className="font-medium text-ink">{option.displayName}</span>
      <span className="text-ink-2">specialties: {option.specialties.length ? option.specialties.join(", ") : "not recorded"}</span>
      <span className="text-ink-2">languages: {option.languages.length ? option.languages.map((code) => (code === "ar" ? "Arabic" : code === "en" ? "English" : code)).join(", ") : "not recorded"}</span>
      <span className="text-ink-3">{option.nextSlotAt ? `next open slot ${describeInstant(option.nextSlotAt, timezone)} · ${option.openSlots} open` : "no open slot in the next two weeks"}</span>
      {action}
    </li>
  );
}

export function TrainersPanel({ context, goal, onClose }: PanelProps) {
  const [askText, setAskText] = useState(goal);
  const [asked, setAsked] = useState("");
  const bookable = context.trainers.options.filter((option) => option.published && option.nextSlotAt);
  const suggestion = useAssistJudgment({ questionKey: "resolution.trainer_pick", subject: { memberId: context.memberId, goal: asked }, enabled: bookable.length > 0, auto: Boolean(asked) });
  const noCredit = context.trainers.credits <= 0;
  const action = (option: ResolutionTrainerOption) => option.nextSlotAt && context.membership
    ? noCredit
      ? <span className="text-[12px] text-warning-deep">needs a paid PT package first</span>
      : <Button asChild size="xs" variant="secondary"><Link href={`/members/${context.memberId}?tab=pt&trainer=${encodeURIComponent(option.id)}&book=1`} data-testid={`resolution-trainer-book-${option.id}`}>Book with {option.displayName.split(/\s+/)[0]}</Link></Button>
    : null;
  const render = (result: AssistReadyResult) => {
    const reading = resolveTrainerPickReading(result.judgment, context.trainers.options);
    if (reading.kind === "none") return <p data-testid="trainer-pick-none">No trainer with a recorded profile fits that request. What a profile does not record stays unknown; the list below is what is recorded.</p>;
    return <ul data-testid="trainer-pick-match"><TrainerLine option={reading.option} timezone={context.timezone} action={action(reading.option)} /></ul>;
  };
  return (
    <PanelFrame id="panel.trainers" onClose={onClose}>
      <p className="text-[12.5px]" data-testid="resolution-pt-credits">
        PT credits: <strong>{context.trainers.credits} available</strong>{context.pt.reserved ? `, ${context.pt.reserved} reserved` : ""}.{noCredit ? " No usable credit: create a package charge from the PT tab and collect it before booking." : ""}
      </p>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (askText.trim().length >= 3) setAsked(askText.trim()); }}>
        <label className="grid min-w-0 flex-1 gap-1 text-[12px] font-medium">
          What did the member ask for?
          <Input value={askText} onChange={(event) => setAskText(event.target.value)} placeholder="e.g. an Arabic-speaking trainer for strength work, the soonest slot" aria-label="Trainer request" />
        </label>
        {suggestion.featureReady && bookable.length > 0 ? <Button type="submit" size="sm" variant="secondary" disabled={askText.trim().length < 3}><Sparkles /> Who fits?</Button> : null}
      </form>
      <AssistSuggestion suggestion={suggestion} title="Suggested trainer" render={render} actions={<Button type="button" size="sm" variant="ghost" onClick={suggestion.dismiss}>Close</Button>} testId="trainer-pick-card" className="mt-2" />
      <p className="context-label mt-3">Trainers at {context.homeBranchName} with open slots in the next two weeks</p>
      {bookable.length ? <ul className="divide-y divide-line" data-testid="resolution-trainers-bookable">{bookable.map((option) => <TrainerLine key={option.id} option={option} timezone={context.timezone} action={action(option)} />)}</ul> : <p className="text-[12.5px] text-ink-3" data-testid="resolution-trainers-none">No trainer has an open slot at this branch in the next two weeks.</p>}
      {context.trainers.options.filter((option) => !option.nextSlotAt).length ? <p className="mt-2 text-[12px] text-ink-3">{context.trainers.options.filter((option) => !option.nextSlotAt).map((option) => option.displayName).join(", ")}: no open slot in this window.</p> : null}
      {context.pt.upcomingBookings.length ? <p className="mt-2 text-[12px] text-ink-3">Upcoming: {context.pt.upcomingBookings.map((booking) => `${booking.trainerName} · ${describeInstant(booking.startsAt, context.timezone)}`).join("; ")}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="ghost"><Link href={`/members/${context.memberId}?tab=pt`}>PT tab</Link></Button>
      </div>
    </PanelFrame>
  );
}

// ---------------------------------------------------------------------------
// Open work
// ---------------------------------------------------------------------------
export function OpenWorkPanel({ context, onClose, onCreateTask }: PanelProps) {
  return (
    <PanelFrame id="panel.open_work" onClose={onClose}>
      {context.tasks.length ? (
        <ul className="divide-y divide-line" data-testid="resolution-tasks">
          {context.tasks.map((task) => (
            <li key={task.id} className="py-2 text-[12.5px]">
              <p className="font-medium text-ink">{task.title}</p>
              <p className="text-ink-3">{task.ownerName} · due <RelativeText iso={task.dueAt} />{task.relatedTaskTitle ? ` · follow-on to “${task.relatedTaskTitle}”` : ""}</p>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-ink-3">No open tasks about this member.</p>}
      {context.taskEvents.length ? <><p className="context-label mt-3">Recent task events</p><EvidenceLinks memberId={context.memberId} items={context.taskEvents} /></> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onCreateTask ? <Button type="button" size="sm" variant="secondary" onClick={onCreateTask}><CalendarClock /> Create task</Button> : null}
      </div>
    </PanelFrame>
  );
}
