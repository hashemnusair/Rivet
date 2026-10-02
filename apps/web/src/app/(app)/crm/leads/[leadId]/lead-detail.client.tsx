"use client";
import { useT } from "@/lib/i18n/provider";


import { CalendarClock, Check, CheckCircle2, CreditCard, Phone, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ERR, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { deriveLeadProgressFacts } from "@/lib/crm/lead-progression";
import { describeContactOutcome } from "@/lib/crm/contact-outcomes";
import { leadStageProgress } from "@/lib/crm/lead-stage-progress";
import type { MembershipPlan, TrialBookingStatus, WeekdayKey } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { exponentFor, money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { Breadcrumbs } from "@/components/shared/chrome";
import { DateTimeText, MoneyText, RelativeText } from "@/components/shared/data-display";
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
import { Switch } from "@/components/ui/switch";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { EditLeadContactDialog } from "@/features/crm/edit-lead-contact-dialog";
import { OfferWorkPanel } from "@/features/crm/offer-work-panel";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";

type TrialOutcome = Extract<TrialBookingStatus, "completed" | "no_show" | "cancelled">;

const TRIAL_STATUS_LABEL: Partial<Record<TrialBookingStatus, string>> = { requested: "Requested", confirmed: "Confirmed", completed: "Completed", no_show: "No-show", cancelled: "Cancelled", converted: "Membership sold" };

function trialStatusLabel(status: TrialBookingStatus): string {
  return TRIAL_STATUS_LABEL[status] ?? status.replaceAll("_", " ");
}

export default function LeadDetailPageClient() {
  const t = useT();
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  // Today and the queues link here with ?action=contact so the outcome can be
  // recorded without hunting for the button; closing the dialog drops the flag.
  const [contactOpen, setContactOpen] = useState(searchParams.get("action") === "contact");
  const closeContact = () => {
    setContactOpen(false);
    if (searchParams.get("action") === "contact") router.replace(`/crm/leads/${leadId}`, { scroll: false });
  };
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
  const plansQuery = useApiQuery(qk.plans({ status: "active", pageSize: 100 }), (api) => api.listPlans({ status: "active", pageSize: 100 }));

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
        toast.success("Marked as not sold.");
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
        toast.success(updated.trialBooking?.status === "completed" ? "Trial completed. Next, record if a membership was sold." : updated.trialBooking?.status === "no_show" ? "Trial marked as no-show." : updated.trialBooking?.status === "cancelled" ? "Trial marked as cancelled." : "Trial confirmed.");
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
        toast.success(t("crm.lead.trialScheduled"));
        setScheduleOpen(false);
        await invalidate();
      },
      onError: (error) => toast.error(isApiError(error) ? error.message : "Could not schedule this trial."),
    },
  );

  if (leadQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }
  if (leadQuery.isError && !leadQuery.data) {
    return isApiError(leadQuery.error) && leadQuery.error.code === "NOT_FOUND"
      ? <NotFoundState title={t("crm.lead.notFound")} />
      : <ErrorState onRetry={() => leadQuery.refetch()} />;
  }
  if (!leadQuery.data) {
    return <div className="space-y-4"><Skeleton className="h-6 w-56" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
  }

  const lead = leadQuery.data;
  const trialStatus = lead.trialBooking?.status;
  const progressFacts = lead.progressFacts ?? deriveLeadProgressFacts(lead);
  const progression = leadStageProgress(lead);
  const trialMilestone = progression.find((item) => item.stage === "trial_completed");
  const saleMilestone = progression.find((item) => item.stage === "won");
  const trialDone = progressFacts.hasTrialCompletion && Boolean(trialMilestone);
  const saleDone = progressFacts.hasConversion && Boolean(saleMilestone);
  const saleFailed = progressFacts.hasLoss;
  const trialStopped = progressFacts.hasTrialNoShow || progressFacts.hasTrialCancellation;

  return (
    <div className="space-y-4">
      {leadQuery.isBackgroundError ? <ErrorState layout="inline" title="Lead could not refresh" onRetry={() => leadQuery.refetch()} /> : null}
      <Breadcrumbs items={[{ label: t("crm.pipeline.title"), href: "/crm/pipeline" }, { label: lead.fullName }]} />

      <header className="panel px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[26px] font-semibold leading-tight break-words tracking-tight">{lead.fullName}</h1>
              <LeadStageChip stage={lead.stage} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-[13px] hover:text-ink" dir="ltr"><Phone className="size-3.5 text-ink-3" /> {lead.phone}</a>
              <span>{lead.branchName}</span>
              <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppHandoff
              subject="lead"
              subjectId={lead.id}
              recipientName={lead.fullName}
              phone={lead.phone}
              organizationName={settingsQuery.data?.organization.name}
              defaultCountryCallingCode={settingsQuery.data?.organization.phoneCountryCallingCode}
            />
            {saleDone && lead.convertedMemberId ? (
              <Button onClick={() => router.push(`/members/${lead.convertedMemberId}`)}>{t("crm.lead.openMember")}{" "}<UserCheck /></Button>
            ) : null}
          </div>
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Sales steps" data-testid="lead-stage-progress">
          <SimpleStep number={1} title={t("crm.lead.trial")} state={trialDone ? "done" : trialStopped ? "stopped" : "current"} detail={trialDone ? t("crm.lead.completed") : trialStatus ? trialStatusLabel(trialStatus) : progressFacts.hasTrialBooking ? t("memberProfile.pt.bookingStatus.reserved") : "Not booked"} />
          <SimpleStep number={2} title={t("crm.lead.membershipSale")} state={saleDone ? "done" : saleFailed ? "stopped" : trialDone ? "current" : "waiting"} detail={saleDone ? t("crm.lead.membershipSold") : saleFailed ? t("crm.lead.notSold") : trialDone ? t("crm.lead.ready") : t("crm.lead.afterTrial")} />
          <SimpleStep number={3} title={t("crm.lead.member")} state={saleDone ? "done" : saleFailed ? "stopped" : "waiting"} detail={saleDone ? "Member and membership added" : "Added after the sale"} />
        </ol>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="space-y-4 self-start">
          {plansQuery.isError || plansQuery.isBackgroundError ? <ErrorState layout="inline" title="Membership plans could not be loaded" onRetry={() => plansQuery.refetch()} /> : null}
          <section className="panel p-4" data-testid="trial-workflow">
            <div className="flex items-start justify-between gap-3">
              <div>

                <h2 className="mt-1 font-display text-[16px] font-semibold">{t("crm.lead.trial")}</h2>
              </div>
              {trialStatus ? <Badge variant={trialDone ? "success" : trialStatus === "no_show" || trialStatus === "cancelled" ? "signal" : "warning"}>{trialStatusLabel(trialStatus).toLowerCase()}</Badge> : null}
            </div>

            {lead.trialBooking ? (
              <>
                <p className="mt-3 text-[13px] font-medium">{formatDate(lead.trialBooking.preferredDate)} · {lead.trialBooking.preferredTime}</p>
                {lead.trialBooking.goal ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{lead.trialBooking.goal}</p> : null}
                {trialStatus === "requested" ? (
                  <Button className="mt-4 w-full" loading={updateTrial.isPending} onClick={() => updateTrial.mutate({ bookingId: lead.trialBooking!.id, status: "confirmed" })}><CalendarClock />{" "}{t("crm.lead.confirmTrial")}</Button>
                ) : trialStatus === "confirmed" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => setTrialOutcome("completed")}><CheckCircle2 />{" "}{t("crm.lead.completed")}</Button>
                    <Button variant="secondary" onClick={() => setTrialOutcome("no_show")}><UserX />{" "}{t("crm.lead.noShow")}</Button>
                    <Button variant="ghost" onClick={() => setTrialOutcome("cancelled")}>{t("crm.lead.cancelled")}</Button>
                  </div>
                ) : trialDone ? (
                  <div className="mt-4 rounded-md border border-success/30 bg-success-bg/50 p-3 text-[13px] text-success-deep">Trial complete. Now record if a membership was sold.</div>
                ) : (
                  <p className="mt-4 rounded-md border border-line bg-sunken p-3 text-[12.5px] text-ink-2">This trial did not happen. Add a follow-up note below if you will contact them again.</p>
                )}
              </>
            ) : (
              <div className="mt-3">
                <p className="text-[12.5px] text-ink-2">Schedule the trial first. Pick a time within the gym&apos;s trial hours.</p>
                <Button className="mt-4 w-full" onClick={() => setScheduleOpen(true)}><CalendarClock />{" "}{t("crm.lead.scheduleTrial")}</Button>
                <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("crm.lead.scheduleTrial")}</DialogTitle>
                      <DialogDescription>Pick a date and a time within the gym&apos;s trial hours.</DialogDescription>
                    </DialogHeader>
                    <DialogBody className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={t("crm.lead.date")} required><Input type="date" min={todayISODate()} value={trialDate} onChange={(event) => setTrialDate(event.target.value)} /></Field>
                        <Field label={t("crm.lead.time")} required><Input type="time" min={trialWindow?.enabled ? trialWindow.opensAt : undefined} max={trialWindow?.enabled ? trialWindow.closesAt : undefined} disabled={!trialWindow?.enabled} value={trialTime} onChange={(event) => setTrialTime(event.target.value)} /></Field>
                      </div>
                      {(settingsQuery.isError || settingsQuery.isBackgroundError) ? <ErrorState layout="section" title="Trial hours could not be loaded" onRetry={() => settingsQuery.refetch()} /> : settingsQuery.isLoading ? <p className="text-[12px] text-ink-3">Loading trial hours…</p> : trialWindow?.enabled ? <p className="text-[12px] text-ink-3">Available from {trialWindow.opensAt} to {trialWindow.closesAt}{t("members.bulk.toast.end")}</p> : <p role="status" className="rounded-md border border-line bg-sunken px-3 py-2 text-[12px] text-ink-2">No trials on this day. Choose another date, or ask an owner or manager to set trial hours in Settings.</p>}
                    </DialogBody>
                    <DialogFooter><Button variant="secondary" onClick={() => setScheduleOpen(false)}>{t("common.action.cancel")}</Button><Button disabled={!trialDate || !trialTime || !trialWindow?.enabled || trialTime < trialWindow.opensAt || trialTime > trialWindow.closesAt} loading={scheduleTrial.isPending} onClick={() => scheduleTrial.mutate()}><CalendarClock />{" "}{t("crm.lead.scheduleTrial")}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </section>

          {trialDone && !saleDone && !saleFailed ? (
            <section className="panel p-4" data-testid="membership-sale-step">

              <h2 className="mt-1 font-display text-[16px] font-semibold">{t("crm.lead.wasSold")}</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">Selling a membership adds them as a member.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button data-testid="sell-membership" onClick={() => setSaleOpen(true)}><CreditCard />{" "}{t("crm.lead.membershipSold")}</Button>
                <Button variant="secondary" onClick={() => setNotSuccessfulOpen(true)}>{t("crm.lead.notSold")}</Button>
              </div>
            </section>
          ) : null}

          {saleFailed ? (
            <section className="panel border-signal/25 p-4">
              <h2 className="font-display text-[15px] font-semibold">{t("crm.lead.notSold")}</h2>
              <p className="mt-2 text-[12.5px] text-ink-2">{lead.lostReason ?? "No reason given."}</p>
            </section>
          ) : null}

          {!saleDone && !saleFailed ? <OfferWorkPanel leadId={lead.id} leadName={lead.fullName} phone={lead.phone} organizationName={settingsQuery.data?.organization.name ?? session?.organization.name ?? "RIVET"} currency={settingsQuery.data?.organization.currency ?? session?.organization.currency ?? "JOD"} defaultCountryCallingCode={settingsQuery.data?.organization.phoneCountryCallingCode} offers={lead.offers} plans={plansQuery.data?.items ?? []} /> : null}

          {!saleDone ? (
            <section className="panel p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[14px] font-semibold">{t("crm.lead.followUpNote")}</h2>
                  <p className="mt-1 text-[12px] text-ink-3">Record each call or message and when to follow up.</p>
                </div>
                <LogContactDialog subject="lead" leadId={lead.id} currentStage={lead.stage} open={contactOpen} onOpenChange={(next) => { if (next) setContactOpen(true); else closeContact(); }} />
              </div>
            </section>
          ) : null}

          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-[14px] font-semibold">{t("crm.lead.contact")}</h2>
              {session?.permissions.includes("crm.write") ? <Button variant="secondary" size="sm" onClick={() => setContactEditOpen(true)}>Edit contact</Button> : null}
            </div>
            <dl className="space-y-2 text-[12.5px]">
              <ContextRow label={t("crm.newLead.phone")}><span dir="ltr">{lead.phone}</span></ContextRow>
              <ContextRow label={t("crm.newLead.email")}>{lead.email ?? "—"}</ContextRow>
              <ContextRow label={t("crm.lead.ownerLabel")}>{lead.ownerName ?? "Unassigned"}</ContextRow>
              <ContextRow label={t("crm.queues.lastContact")}>{lead.lastContactAt ? <>{describeContactOutcome(lead.lastContactOutcome) ?? "Contacted"} · <RelativeText iso={lead.lastContactAt} /></> : "Not contacted yet"}</ContextRow>
              <ContextRow label={t("crm.lead.nextFollowUp")}>{lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} className={lead.overdue ? "font-medium text-danger" : undefined} /> : "—"}</ContextRow>
              <ContextRow label="Added"><DateTimeText iso={lead.createdAt} /></ContextRow>
            </dl>
          </section>
        </div>

        <section className="panel self-start px-5 py-4">
          <h2 className="mb-3 font-display text-[14px] font-semibold">{t("crm.lead.history")}</h2>
          <TimelineFeed events={lead.activities} empty="No activity yet." />
        </section>
      </div>

      <CompleteSaleDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} branchId={lead.branchId} open={saleOpen} onOpenChange={setSaleOpen} />
      <EditLeadContactDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} email={lead.email} open={contactEditOpen} onOpenChange={setContactEditOpen} />

      <Dialog open={Boolean(trialOutcome)} onOpenChange={(next) => { if (!next) { setTrialOutcome(undefined); setTrialNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trialOutcome === "completed" ? t("memberProfile.contact.stage.trial_completed") : trialOutcome === "no_show" ? "Trial marked no-show" : "Trial cancelled"}</DialogTitle>
            <DialogDescription>{trialOutcome === "completed" ? "Next, record if they bought a membership." : "Write a short reason. It helps the next follow-up."}</DialogDescription>
          </DialogHeader>
          <DialogBody><Field label={trialOutcome === "completed" ? "Note (optional)" : t("common.label.reason")} required={trialOutcome !== "completed"}><Input value={trialNote} onChange={(event) => setTrialNote(event.target.value)} placeholder={trialOutcome === "completed" ? "Optional note" : trialOutcome === "no_show" ? "Why did they miss the trial?" : "Why was the trial cancelled?"} /></Field></DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTrialOutcome(undefined)}>{t("common.action.back")}</Button>
            <Button disabled={!lead.trialBooking || !trialOutcome || (trialOutcome !== "completed" && trialNote.trim().length < 3)} loading={updateTrial.isPending} onClick={() => lead.trialBooking && trialOutcome && updateTrial.mutate({ bookingId: lead.trialBooking.id, status: trialOutcome, note: trialNote.trim() || undefined })}>{t("common.action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notSuccessfulOpen} onOpenChange={setNotSuccessfulOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("crm.lead.notSoldHeading")}</DialogTitle><DialogDescription>Choose the main reason. The lead is kept, but no member is added.</DialogDescription></DialogHeader>
          <DialogBody>
            <Field label={t("common.label.reason")} required>
              <Select value={notSuccessfulReason} onValueChange={setNotSuccessfulReason}>
                <SelectTrigger aria-label="Why not sold"><SelectValue placeholder={t("crm.lead.chooseReason")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not interested after trial">{t("crm.lead.reason.notInterested")}</SelectItem>
                  <SelectItem value="Price did not work">{t("crm.lead.membership.priceColumn")}</SelectItem>
                  <SelectItem value="Timing did not work">{t("crm.lead.reason.timing")}</SelectItem>
                  <SelectItem value="Could not reach after trial">{t("crm.lead.reason.couldNotReach")}</SelectItem>
                  <SelectItem value="Chose another gym">{t("crm.lead.reason.choseAnotherGym")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setNotSuccessfulOpen(false)}>{t("common.action.back")}</Button><Button variant="signal" disabled={!notSuccessfulReason} loading={markNotSuccessful.isPending} onClick={() => markNotSuccessful.mutate(notSuccessfulReason)}>{t("common.action.save")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SimpleStep({ number, title, detail, state }: { number: number; title: string; detail: string; state: "done" | "current" | "waiting" | "stopped" }) {
  return (
    <li className={`border-t px-3 py-2.5 ${state === "current" ? "border-ink bg-sunken" : state === "done" ? "border-success/35 bg-success-bg/40" : state === "stopped" ? "border-signal/25 bg-signal-bg/30" : "border-line"}`} aria-current={state === "current" ? "step" : undefined}>
      <div className="flex items-center gap-2">
        <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-mono ${state === "done" ? "border-success bg-success text-white" : state === "current" ? "border-ink bg-ink text-paper" : "border-line-3 text-ink-3"}`}>{state === "done" ? <Check className="size-3" /> : number}</span>
        <span className="text-[12.5px] font-medium">{title}</span>
      </div>
      <p className="mt-1 ps-7 text-[12px] text-ink-3">{detail}</p>
    </li>
  );
}

function CompleteSaleDialog({ leadId, fullName, phone, branchId, open, onOpenChange }: { leadId: string; fullName: string; phone: string; branchId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { session } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 100 }));
  const [homeBranchId, setHomeBranchId] = useState(branchId);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "ar">("en");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [marketingPreferenceSource, setMarketingPreferenceSource] = useState<"system_default" | "staff_selected">("system_default");
  const [mode, setMode] = useState<"existing" | "custom">("existing");
  const [planId, setPlanId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const currency = session?.organization.currency ?? "JOD";
  const customPriceRead = readMoneyInput(customPrice, currency);
  // A malformed price is named beside the field while the draft stays as typed.
  const customPriceProblem = !customPriceRead.ok && customPriceRead.problem !== "empty" ? customPriceRead.message : undefined;
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
    setGender("");
    setMarketingOptIn(true);
    setMarketingPreferenceSource("system_default");
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
    (api) => {
      if (!gender) throw new Error("Choose male or female before completing the sale.");
      return api.completeLeadSale(leadId, {
      homeBranchId,
      gender,
      preferredLanguage,
      marketingOptIn,
      marketingPreferenceSource,
      startDate,
      idempotencyKey,
      membership: mode === "existing"
        ? { mode: "existing", planId }
        : { mode: "custom", name: customName.trim(), price: customPriceRead.ok ? customPriceRead.money : money(0, currency), durationDays: Number(customDurationDays), includedPtSessions: Number(customPtSessions) },
      });
    },
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
        setServerError(isApiError(error) ? error.message : t("renewFlow.sale.errors.saveFailed"));
        if (isApiError(error) && error.code === ERR.DUPLICATE_MEMBER) {
          const first = Array.isArray(error.details?.matches) ? error.details.matches[0] : undefined;
          if (first && typeof first === "object" && typeof (first as { memberId?: unknown }).memberId === "string") setDuplicateMemberId((first as { memberId: string }).memberId);
        }
      },
    },
  );

  const customValid = customName.trim().length >= 2 && customPriceRead.ok && Number.isInteger(Number(customDurationDays)) && Number(customDurationDays) >= 1 && Number(customDurationDays) <= 730 && Number.isInteger(Number(customPtSessions)) && Number(customPtSessions) >= 0 && Number(customPtSessions) <= 100;
  const canSubmit = Boolean(homeBranchId && gender && startDate && idempotencyKey && (mode === "existing" ? planId : customValid));

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!navigationPending) onOpenChange(nextOpen); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{navigationPending ? "Opening member record" : "Complete membership sale"}</DialogTitle><DialogDescription>{navigationPending ? "The sale is complete. Opening the new member now…" : "This adds the member, the membership, what they owe, and any PT sessions."}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-line bg-sunken p-3 text-[13px]"><p className="font-medium">{fullName}</p><p className="font-mono text-[12px] text-ink-3" dir="ltr">{phone}</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("crm.lead.membership.homeBranch")} required>
              <Select value={homeBranchId} onValueChange={setHomeBranchId}><SelectTrigger aria-label={t("crm.lead.membership.homeBranch")}><SelectValue /></SelectTrigger><SelectContent>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select>
            </Field>
            <Field label={t("crm.lead.membership.starts")} required><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("memberProfile.details.gender")} required>
              <select aria-label={t("memberProfile.details.gender")} className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]" value={gender} onChange={(event) => setGender(event.target.value as "male" | "female" | "")} disabled={navigationPending} required>
                <option value="" disabled>Choose male or female</option>
                <option value="female">{t("memberProfile.details.female")}</option>
                <option value="male">{t("memberProfile.details.male")}</option>
              </select>
            </Field>
            <Field label={t("crm.lead.membership.preferredLanguage")} required>
              <select
                aria-label={t("crm.lead.membership.preferredLanguage")}
                className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]"
                value={preferredLanguage}
                onChange={(event) => setPreferredLanguage(event.target.value as "en" | "ar")}
                disabled={navigationPending}
              >
                <option value="en">{t("crm.lead.membership.english")}</option>
                <option value="ar">{t("crm.lead.membership.arabic")}</option>
              </select>
            </Field>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken/40 px-3 py-3">
            <div>
              <p className="text-[13px] font-medium">{t("members.header.marketingMessages")}</p>
              <p className="text-[12px] text-ink-3">It starts on, but that does not mean they agreed. No marketing messages are sent until you change this switch.</p>
            </div>
            <Switch
              checked={marketingOptIn}
              onCheckedChange={(checked) => {
                setMarketingOptIn(checked);
                setMarketingPreferenceSource("staff_selected");
              }}
              aria-label="Agreed to marketing messages"
              disabled={navigationPending}
            />
          </div>
          <Field label={t("crm.lead.membership.heading")} required>
            <Select value={mode} onValueChange={(value) => setMode(value as "existing" | "custom")}><SelectTrigger aria-label="Plan or custom membership"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="existing">{t("crm.lead.membership.chooseExisting")}</SelectItem><SelectItem value="custom">{t("crm.lead.membership.enterCustom")}</SelectItem></SelectContent></Select>
          </Field>

          {mode === "existing" ? (
            <>
              <Field label={t("crm.lead.membership.plan")} required>
                <Select value={planId} onValueChange={setPlanId} disabled={plansQuery.isLoading}><SelectTrigger aria-label={t("crm.lead.membership.planLabel")}><SelectValue placeholder={plansQuery.isLoading ? t("renewFlow.adjust.planChange.loadingPlans") : t("renewFlow.sale.errors.choosePlan")} /></SelectTrigger><SelectContent>{availablePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}</SelectContent></Select>
              </Field>
              {selectedPlan ? <PlanSummary plan={selectedPlan} /> : !plansQuery.isLoading ? <p className="rounded-md border border-line bg-sunken p-3 text-[12.5px] text-ink-2">No plans for this branch. Choose “Enter a custom membership”.</p> : null}
            </>
          ) : (
            <div className="space-y-3 rounded-md border border-line bg-sunken/40 p-3">
              <Field label={t("crm.lead.membership.name")} required><Input value={customName} onChange={(event) => setCustomName(event.target.value)} placeholder={t("crm.lead.membership.namePlaceholder")} /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label={`Price (${currency})`} required error={customPriceProblem}><Input inputMode="decimal" dir="ltr" value={customPrice} aria-invalid={customPriceProblem ? true : undefined} onChange={(event) => setCustomPrice(event.target.value)} placeholder={toMajorString(money(120 * 10 ** exponentFor(currency), currency))} /></Field>
                <Field label={t("crm.lead.membership.duration")} required><Input type="number" min={1} max={730} value={customDurationDays} onChange={(event) => setCustomDurationDays(event.target.value)} /></Field>
                <Field label={t("crm.lead.membership.ptSessions")}><Input type="number" min={0} max={100} value={customPtSessions} onChange={(event) => setCustomPtSessions(event.target.value)} /></Field>
              </div>
              <p className="text-[12px] leading-relaxed text-ink-3">It is also saved as a plan for this branch, so you can use it again.</p>
            </div>
          )}

          {navigationPending ? <p role="status" className="rounded-md border border-success/30 bg-success-bg/40 px-3 py-2.5 text-[13px] text-success-deep">{t("crm.lead.openingMember")}</p> : null}
          {serverError ? <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger"><p>{serverError}</p>{duplicateMemberId ? <Link href={`/members/${duplicateMemberId}`} className="mt-1 inline-flex font-medium underline underline-offset-2">{t("crm.lead.membership.openExistingMember")}</Link> : null}</div> : null}
        </DialogBody>
        <DialogFooter><Button variant="secondary" disabled={navigationPending} onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button data-testid="confirm-membership-sale" disabled={!canSubmit || navigationPending} loading={mutation.isPending || navigationPending} onClick={() => mutation.mutate()}>Add member and membership</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanSummary({ plan }: { plan: MembershipPlan }) {
  const t = useT();
  return <div className="grid grid-cols-3 divide-x divide-line rounded-md border border-line bg-sunken text-center text-[12px]"><div className="p-2"><p className="text-ink-3">{t("crm.lead.membership.priceColumn")}</p><p className="mt-0.5 font-medium"><MoneyText money={plan.basePrice} /></p></div><div className="p-2"><p className="text-ink-3">{t("crm.lead.membership.durationColumn")}</p><p className="mt-0.5 font-medium">{plan.kind === "time" ? `${plan.durationDays ?? 0} days` : `${plan.visitAllowance ?? 0} visits`}</p></div><div className="p-2"><p className="text-ink-3">{t("memberProfile.tabs.pt")}</p><p className="mt-0.5 font-medium">{plan.includedPtSessions} sessions</p></div></div>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-ink-3">{label}</dt><dd className="text-end">{children}</dd></div>;
}

function weekdayForDate(date: string): WeekdayKey | undefined {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[day];
}
