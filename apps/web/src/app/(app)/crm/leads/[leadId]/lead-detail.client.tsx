"use client";

import { CalendarClock, Check, CheckCircle2, CreditCard, Phone, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ERR, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { MembershipPlan, TrialBookingStatus, WeekdayKey } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { fromMajor, toMajor } from "@/lib/utils/money";
import { Breadcrumbs } from "@/components/shared/chrome";
import { DateTimeText, RelativeText } from "@/components/shared/data-display";
import { LEAD_SOURCE_LABELS, LeadStageChip } from "@/components/shared/status-chip";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { EditLeadContactDialog } from "@/features/crm/edit-lead-contact-dialog";

type TrialOutcome = Extract<TrialBookingStatus, "completed" | "no_show" | "cancelled">;

export default function LeadDetailPageClient() {
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const invalidate = useInvalidate();
  const [saleOpen, setSaleOpen] = useState(false);
  const [notSuccessfulOpen, setNotSuccessfulOpen] = useState(false);
  const [notSuccessfulReason, setNotSuccessfulReason] = useState("");
  const [trialOutcome, setTrialOutcome] = useState<TrialOutcome>();
  const [trialNote, setTrialNote] = useState("");
  const [trialDate, setTrialDate] = useState(() => addDays(todayISODate(), 1));
  const [trialTime, setTrialTime] = useState("18:00");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const { session } = useApp();

  const leadQuery = useRealtimeApiQuery({
    queryKey: qk.lead(leadId),
    query: (api) => api.getLead(leadId),
    subscribe: (api, onValue, onError) => api.subscribeLead(leadId, onValue, onError),
  });
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());

  const trialWindow = useMemo(() => {
    const weekday = weekdayForDate(trialDate);
    const schedule = settingsQuery.data?.operationalPolicies.trialSchedules.find((item) => item.branchId === leadQuery.data?.branchId);
    return weekday ? schedule?.days[weekday] : undefined;
  }, [leadQuery.data?.branchId, settingsQuery.data?.operationalPolicies.trialSchedules, trialDate]);

  useEffect(() => {
    if (!trialWindow?.enabled) return;
    if (trialTime < trialWindow.opensAt || trialTime > trialWindow.closesAt) setTrialTime(trialWindow.opensAt);
  }, [trialTime, trialWindow]);

  const markNotSuccessful = useApiMutation(
    (api, reason: string) => api.updateLead(leadId, { stage: "lost", lostReason: reason }),
    {
      onSuccess: async () => {
        toast.success("Sale marked as not successful.");
        setNotSuccessfulOpen(false);
        setNotSuccessfulReason("");
        await invalidate();
      },
    },
  );

  const updateTrial = useApiMutation(
    (api, input: { bookingId: string; status: Extract<TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }) =>
      api.updateTrialBooking(input.bookingId, { status: input.status, note: input.note }),
    {
      onSuccess: async (updated) => {
        toast.success(updated.trialBooking?.status === "completed" ? "Trial completed. Record the membership sale next." : updated.trialBooking?.status === "no_show" ? "Trial marked as no-show." : updated.trialBooking?.status === "cancelled" ? "Trial marked as cancelled." : "Trial confirmed.");
        setTrialOutcome(undefined);
        setTrialNote("");
        await invalidate();
      },
    },
  );

  const scheduleTrial = useApiMutation(
    (api) => api.scheduleLeadTrial(leadId, { preferredDate: trialDate, preferredTime: trialTime }),
    {
      onSuccess: async () => {
        toast.success("Trial scheduled and confirmed.");
        setScheduleOpen(false);
        await invalidate();
      },
      onError: (error) => toast.error(isApiError(error) ? error.message : "Could not schedule this trial."),
    },
  );

  if (leadQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }
  if (leadQuery.isError) {
    return isApiError(leadQuery.error) && leadQuery.error.code === "NOT_FOUND"
      ? <NotFoundState title="Lead not found" />
      : <ErrorState onRetry={() => leadQuery.refetch()} />;
  }
  if (!leadQuery.data) {
    return <div className="space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }

  const lead = leadQuery.data;
  const trialStatus = lead.trialBooking?.status;
  const trialDone = trialStatus === "completed" || trialStatus === "converted";
  const saleDone = lead.stage === "won" && Boolean(lead.convertedMemberId);
  const saleFailed = lead.stage === "lost";

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Leads", href: "/crm/pipeline" }, { label: lead.fullName }]} />

      <header className="panel px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[24px] font-semibold leading-none tracking-tight">{lead.fullName}</h1>
              <LeadStageChip stage={lead.stage} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-mono text-[12.5px] hover:text-ink" dir="ltr"><Phone className="size-3.5 text-ink-3" /> {lead.phone}</a>
              <span>{lead.branchName}</span>
              <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
            </div>
          </div>
          {saleDone && lead.convertedMemberId ? (
            <Button onClick={() => router.push(`/members/${lead.convertedMemberId}`)}>Open member <UserCheck /></Button>
          ) : null}
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Simple sales progress">
          <SimpleStep number={1} title="Trial" state={trialDone ? "done" : trialStatus === "no_show" || trialStatus === "cancelled" ? "stopped" : "current"} detail={trialDone ? "Completed" : trialStatus ? trialStatus.replaceAll("_", " ") : "Not booked"} />
          <SimpleStep number={2} title="Membership sale" state={saleDone ? "done" : saleFailed ? "stopped" : trialDone ? "current" : "waiting"} detail={saleDone ? "Membership sold" : saleFailed ? "Not sold" : trialDone ? "Ready" : "After trial"} />
          <SimpleStep number={3} title="Member" state={saleDone ? "done" : saleFailed ? "stopped" : "waiting"} detail={saleDone ? "Member and membership created" : "Created only after a successful sale"} />
        </ol>
      </header>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4 self-start">
          <section className="panel p-4" data-testid="trial-workflow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Step 1</p>
                <h2 className="mt-1 font-display text-[16px] font-semibold">Trial</h2>
              </div>
              {trialStatus ? <Badge variant={trialDone ? "success" : trialStatus === "no_show" || trialStatus === "cancelled" ? "signal" : "warning"}>{trialStatus.replaceAll("_", " ")}</Badge> : null}
            </div>

            {lead.trialBooking ? (
              <>
                <p className="mt-3 text-[13px] font-medium">{formatDate(lead.trialBooking.preferredDate)} · {lead.trialBooking.preferredTime}</p>
                {lead.trialBooking.goal ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{lead.trialBooking.goal}</p> : null}
                {trialStatus === "requested" ? (
                  <Button className="mt-4 w-full" loading={updateTrial.isPending} onClick={() => updateTrial.mutate({ bookingId: lead.trialBooking!.id, status: "confirmed" })}><CalendarClock /> Confirm trial</Button>
                ) : trialStatus === "confirmed" ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Button onClick={() => setTrialOutcome("completed")}><CheckCircle2 /> Completed</Button>
                    <Button variant="secondary" onClick={() => setTrialOutcome("no_show")}><UserX /> No-show</Button>
                    <Button variant="ghost" onClick={() => setTrialOutcome("cancelled")}>Cancelled</Button>
                  </div>
                ) : trialDone ? (
                  <div className="mt-4 rounded-md border border-success/30 bg-success-bg/50 p-3 text-[13px] text-success-deep">Trial complete. Record whether a membership was sold.</div>
                ) : (
                  <p className="mt-4 rounded-md border border-line bg-sunken p-3 text-[12.5px] text-ink-2">This trial was not completed. Keep a follow-up note below if you plan to contact them again.</p>
                )}
              </>
            ) : (
              <div className="mt-3">
                <p className="text-[12.5px] text-ink-2">Schedule the trial first. The member can choose any time inside the gym&apos;s saved trial window.</p>
                <Button className="mt-4 w-full" onClick={() => setScheduleOpen(true)}><CalendarClock /> Schedule trial</Button>
                <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Schedule trial</DialogTitle>
                      <DialogDescription>Choose a date and time inside the gym&apos;s saved trial window.</DialogDescription>
                    </DialogHeader>
                    <DialogBody className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Date" required><Input type="date" min={todayISODate()} value={trialDate} onChange={(event) => setTrialDate(event.target.value)} /></Field>
                        <Field label="Time" required><Input type="time" min={trialWindow?.enabled ? trialWindow.opensAt : undefined} max={trialWindow?.enabled ? trialWindow.closesAt : undefined} disabled={!trialWindow?.enabled} value={trialTime} onChange={(event) => setTrialTime(event.target.value)} /></Field>
                      </div>
                      {settingsQuery.isLoading ? <p className="text-[11.5px] text-ink-3">Loading the branch trial hours…</p> : trialWindow?.enabled ? <p className="text-[11.5px] text-ink-3">Available from {trialWindow.opensAt} to {trialWindow.closesAt}.</p> : <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2 text-[11.5px] text-ink-2">Trials are closed or not configured for this day. Choose another date or ask an owner or manager to update Trial scheduling in Settings.</p>}
                    </DialogBody>
                    <DialogFooter><Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button><Button disabled={!trialDate || !trialTime || !trialWindow?.enabled || trialTime < trialWindow.opensAt || trialTime > trialWindow.closesAt} loading={scheduleTrial.isPending} onClick={() => scheduleTrial.mutate()}><CalendarClock /> Schedule trial</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </section>

          {trialDone && !saleDone && !saleFailed ? (
            <section className="panel p-4" data-testid="membership-sale-step">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Step 2</p>
              <h2 className="mt-1 font-display text-[16px] font-semibold">Was a membership sold?</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">A successful sale creates the member and membership together. There is no separate conversion step.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button data-testid="sell-membership" onClick={() => setSaleOpen(true)}><CreditCard /> Membership sold</Button>
                <Button variant="secondary" onClick={() => setNotSuccessfulOpen(true)}>Not sold</Button>
              </div>
            </section>
          ) : null}

          {saleFailed ? (
            <section className="panel border-signal/25 p-4">
              <h2 className="font-display text-[15px] font-semibold">Sale not successful</h2>
              <p className="mt-2 text-[12.5px] text-ink-2">{lead.lostReason ?? "No reason recorded."}</p>
            </section>
          ) : null}

          {!saleDone ? (
            <section className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[14px] font-semibold">Follow-up note</h2>
                  <p className="mt-1 text-[11.5px] text-ink-3">Keep the lead timeline concise while you log the interaction.</p>
                </div>
                <LogContactDialog subject="lead" leadId={lead.id} currentStage={lead.stage} />
              </div>
            </section>
          ) : null}

          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-[14px] font-semibold">Contact</h2>
              {session?.permissions.includes("crm.write") ? <Button variant="secondary" size="sm" onClick={() => setContactEditOpen(true)}>Edit contact</Button> : null}
            </div>
            <dl className="space-y-2 text-[12.5px]">
              <ContextRow label="Phone"><span dir="ltr">{lead.phone}</span></ContextRow>
              <ContextRow label="Email">{lead.email ?? "—"}</ContextRow>
              <ContextRow label="Owner">{lead.ownerName ?? "Unassigned"}</ContextRow>
              <ContextRow label="Next follow-up">{lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} /> : "—"}</ContextRow>
              <ContextRow label="Created"><DateTimeText iso={lead.createdAt} /></ContextRow>
            </dl>
          </section>
        </div>

        <section className="panel self-start px-5 py-4">
          <h2 className="mb-3 font-display text-[14px] font-semibold">History</h2>
          <TimelineFeed events={lead.activities} empty="No activity yet." />
        </section>
      </div>

      <CompleteSaleDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} branchId={lead.branchId} open={saleOpen} onOpenChange={setSaleOpen} />
      <EditLeadContactDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} email={lead.email} open={contactEditOpen} onOpenChange={setContactEditOpen} />

      <Dialog open={Boolean(trialOutcome)} onOpenChange={(next) => { if (!next) { setTrialOutcome(undefined); setTrialNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trialOutcome === "completed" ? "Trial completed" : trialOutcome === "no_show" ? "Trial marked no-show" : "Trial cancelled"}</DialogTitle>
            <DialogDescription>{trialOutcome === "completed" ? "Next, record whether the membership sale was successful." : "Record a short reason so the next follow-up has context."}</DialogDescription>
          </DialogHeader>
          <DialogBody><Field label={trialOutcome === "completed" ? "Note (optional)" : "Reason"} required={trialOutcome !== "completed"}><Input value={trialNote} onChange={(event) => setTrialNote(event.target.value)} placeholder={trialOutcome === "completed" ? "Optional note" : trialOutcome === "no_show" ? "Why did the member miss the trial?" : "Why was the trial cancelled?"} /></Field></DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTrialOutcome(undefined)}>Back</Button>
            <Button disabled={!lead.trialBooking || !trialOutcome || (trialOutcome !== "completed" && trialNote.trim().length < 3)} loading={updateTrial.isPending} onClick={() => lead.trialBooking && trialOutcome && updateTrial.mutate({ bookingId: lead.trialBooking.id, status: trialOutcome, note: trialNote.trim() || undefined })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notSuccessfulOpen} onOpenChange={setNotSuccessfulOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Membership not sold</DialogTitle><DialogDescription>Choose the main reason. The lead stays in history and no member is created.</DialogDescription></DialogHeader>
          <DialogBody>
            <Field label="Reason" required>
              <Select value={notSuccessfulReason} onValueChange={setNotSuccessfulReason}>
                <SelectTrigger aria-label="Sale outcome reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not interested after trial">Not interested</SelectItem>
                  <SelectItem value="Price did not work">Price</SelectItem>
                  <SelectItem value="Timing did not work">Timing</SelectItem>
                  <SelectItem value="Could not reach after trial">Could not reach</SelectItem>
                  <SelectItem value="Chose another gym">Chose another gym</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setNotSuccessfulOpen(false)}>Back</Button><Button variant="signal" disabled={!notSuccessfulReason} loading={markNotSuccessful.isPending} onClick={() => markNotSuccessful.mutate(notSuccessfulReason)}>Save outcome</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SimpleStep({ number, title, detail, state }: { number: number; title: string; detail: string; state: "done" | "current" | "waiting" | "stopped" }) {
  return (
    <li className={`rounded-md border px-3 py-2.5 ${state === "current" ? "border-ink bg-sunken" : state === "done" ? "border-success/35 bg-success-bg/40" : state === "stopped" ? "border-signal/25 bg-signal-bg/30" : "border-line"}`} aria-current={state === "current" ? "step" : undefined}>
      <div className="flex items-center gap-2">
        <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono ${state === "done" ? "border-success bg-success text-white" : state === "current" ? "border-ink bg-ink text-paper" : "border-line-3 text-ink-3"}`}>{state === "done" ? <Check className="size-3" /> : number}</span>
        <span className="text-[12.5px] font-medium">{title}</span>
      </div>
      <p className="mt-1 ps-7 text-[11px] text-ink-3">{detail}</p>
    </li>
  );
}

function CompleteSaleDialog({ leadId, fullName, phone, branchId, open, onOpenChange }: { leadId: string; fullName: string; phone: string; branchId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { session } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 100 }));
  const [homeBranchId, setHomeBranchId] = useState(branchId);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "ar">("en");
  const [mode, setMode] = useState<"existing" | "custom">("existing");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDurationDays, setCustomDurationDays] = useState("30");
  const [customPtSessions, setCustomPtSessions] = useState("0");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateMemberId, setDuplicateMemberId] = useState<string | null>(null);
  const [navigationPending, setNavigationPending] = useState(false);

  const availablePlans = useMemo(() => (plansQuery.data?.items ?? []).filter((plan) => plan.branchAccess === "all" || plan.branchIds.includes(homeBranchId)), [homeBranchId, plansQuery.data?.items]);
  const selectedPlan = availablePlans.find((plan) => plan.id === planId);

  useEffect(() => {
    if (!open) return;
    setHomeBranchId(branchId);
    setPreferredLanguage("en");
    setStartDate(todayISODate());
    setIdempotencyKey(crypto.randomUUID());
    setServerError(null);
    setDuplicateMemberId(null);
    setNavigationPending(false);
  }, [branchId, open]);

  useEffect(() => {
    if (mode === "existing" && !availablePlans.some((plan) => plan.id === planId)) setPlanId(availablePlans[0]?.id ?? "");
  }, [availablePlans, mode, planId]);

  const mutation = useApiMutation(
    (api) => api.completeLeadSale(leadId, {
      homeBranchId,
      preferredLanguage,
      marketingOptIn: true,
      startDate,
      idempotencyKey,
      membership: mode === "existing"
        ? { mode: "existing", planId }
        : { mode: "custom", name: customName.trim(), price: fromMajor(Number(customPrice)), durationDays: Number(customDurationDays), includedPtSessions: Number(customPtSessions) },
    }),
    {
      onSuccess: (result) => {
        const memberHref = `/members/${result.member.id}`;
        setNavigationPending(true);
        queryClient.setQueryData(qk.member(result.member.id), result.member);
        void queryClient.invalidateQueries({ queryKey: qk.members() });
        void queryClient.invalidateQueries({ queryKey: qk.leads() });
        toast.success(`${result.member.fullName} is now a member with ${result.plan.name}.`);
        onOpenChange(false);
        router.replace(memberHref);
      },
      onError: (error) => {
        setServerError(isApiError(error) ? error.message : "Could not complete this membership sale.");
        if (isApiError(error) && error.code === ERR.DUPLICATE_MEMBER) {
          const first = Array.isArray(error.details?.matches) ? error.details.matches[0] : undefined;
          if (first && typeof first === "object" && typeof (first as { memberId?: unknown }).memberId === "string") setDuplicateMemberId((first as { memberId: string }).memberId);
        }
      },
    },
  );

  const customValid = customName.trim().length >= 2 && customPrice.trim().length > 0 && Number(customPrice) >= 0 && Number.isInteger(Number(customDurationDays)) && Number(customDurationDays) >= 1 && Number(customDurationDays) <= 730 && Number.isInteger(Number(customPtSessions)) && Number(customPtSessions) >= 0 && Number(customPtSessions) <= 100;
  const canSubmit = Boolean(homeBranchId && startDate && idempotencyKey && (mode === "existing" ? planId : customValid));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!navigationPending) onOpenChange(nextOpen); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{navigationPending ? "Opening member record" : "Complete membership sale"}</DialogTitle><DialogDescription>{navigationPending ? "The sale is complete. Opening the new member now…" : "This creates the member, membership, balance, and PT credits together."}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-line bg-sunken p-3 text-[13px]"><p className="font-medium">{fullName}</p><p className="font-mono text-[12px] text-ink-3" dir="ltr">{phone}</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Home branch" required>
              <Select value={homeBranchId} onValueChange={setHomeBranchId}><SelectTrigger aria-label="Home branch"><SelectValue /></SelectTrigger><SelectContent>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field label="Membership starts" required><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
          </div>
          <Field label="Preferred language" required>
            <select
              aria-label="Preferred language"
              className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]"
              value={preferredLanguage}
              onChange={(event) => setPreferredLanguage(event.target.value as "en" | "ar")}
              disabled={navigationPending}
            >
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </Field>
          <p className="text-[11.5px] text-ink-3">Marketing updates remain opted in by default; this language choice controls member-facing communication.</p>
          <Field label="Membership" required>
            <Select value={mode} onValueChange={(value) => setMode(value as "existing" | "custom")}><SelectTrigger aria-label="Membership source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="existing">Choose an existing plan</SelectItem><SelectItem value="custom">Enter a custom membership</SelectItem></SelectContent></Select>
          </Field>

          {mode === "existing" ? (
            <>
              <Field label="Plan" required>
                <Select value={planId} onValueChange={setPlanId} disabled={plansQuery.isLoading}><SelectTrigger aria-label="Membership plan"><SelectValue placeholder={plansQuery.isLoading ? "Loading plans…" : "Choose a plan"} /></SelectTrigger><SelectContent>{availablePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select>
              </Field>
              {selectedPlan ? <PlanSummary plan={selectedPlan} /> : !plansQuery.isLoading ? <p className="rounded-md border border-line bg-sunken p-3 text-[12.5px] text-ink-2">No active plans are available for this branch. Choose “Enter a custom membership”.</p> : null}
            </>
          ) : (
            <div className="space-y-3 rounded-md border border-line bg-sunken/40 p-3">
              <Field label="Membership name" required><Input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder="e.g. 8-week transformation" /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Price (JOD)" required><Input inputMode="decimal" value={customPrice} onChange={(event) => setCustomPrice(event.target.value)} placeholder="120.000" /></Field>
                <Field label="Duration (days)" required><Input type="number" min={1} max={730} value={customDurationDays} onChange={(event) => setCustomDurationDays(event.target.value)} /></Field>
                <Field label="PT sessions"><Input type="number" min={0} max={100} value={customPtSessions} onChange={(event) => setCustomPtSessions(event.target.value)} /></Field>
              </div>
              <p className="text-[11.5px] leading-relaxed text-ink-3">This custom membership is saved as an active plan for this branch, so it can be reused later.</p>
            </div>
          )}

          {navigationPending ? <p role="status" className="rounded-md border border-success/30 bg-success-bg/40 px-3 py-2.5 text-[13px] text-success-deep">Membership sold. Opening the member record…</p> : null}
          {serverError ? <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger"><p>{serverError}</p>{duplicateMemberId ? <Link href={`/members/${duplicateMemberId}`} className="mt-1 inline-flex font-medium underline underline-offset-2">Open existing member</Link> : null}</div> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" disabled={navigationPending} onClick={() => onOpenChange(false)}>Cancel</Button><Button data-testid="confirm-membership-sale" disabled={!canSubmit || navigationPending} loading={mutation.isPending || navigationPending} onClick={() => mutation.mutate()}>Create member & membership</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanSummary({ plan }: { plan: MembershipPlan }) {
  return <div className="grid grid-cols-3 divide-x divide-line rounded-md border border-line bg-sunken text-center text-[12px]"><div className="p-2"><p className="text-ink-3">Price</p><p className="mt-0.5 font-medium">JOD {toMajor(plan.basePrice).toFixed(3)}</p></div><div className="p-2"><p className="text-ink-3">Duration</p><p className="mt-0.5 font-medium">{plan.kind === "time" ? `${plan.durationDays ?? 0} days` : `${plan.visitAllowance ?? 0} visits`}</p></div><div className="p-2"><p className="text-ink-3">PT</p><p className="mt-0.5 font-medium">{plan.includedPtSessions} sessions</p></div></div>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-ink-3">{label}</dt><dd className="text-end">{children}</dd></div>;
}

function weekdayForDate(date: string): WeekdayKey | undefined {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[day];
}
