"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CalendarClock, Check, CheckCircle2, FileText, Phone, UserCheck, UserX, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ERR, isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { LeadStage, OfferDeliveryChannel, TrialBookingStatus } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { fromMajor, toMajor } from "@/lib/utils/money";
import { Breadcrumbs } from "@/components/shared/chrome";
import { MoneyText, RelativeText, DateTimeText } from "@/components/shared/data-display";
import { LeadStageChip, LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { LogContactForm } from "@/features/crm/contact-work-panel";

const STAGE_ORDER: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won"];
const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  attempted: "Attempted",
  contacted: "Contacted",
  trial_booked: "Trial booked",
  trial_completed: "Trial done",
  offer_sent: "Offer sent",
  won: "Won",
  lost: "Lost",
};

export default function LeadDetailPageClient() {
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const invalidate = useInvalidate();
  const [offerOpen, setOfferOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [trialOutcome, setTrialOutcome] = useState<Extract<TrialBookingStatus, "completed" | "no_show" | "cancelled">>();
  const [trialNote, setTrialNote] = useState("");

  const leadQuery = useApiQuery(qk.lead(leadId), (api) => api.getLead(leadId));

  const markLost = useApiMutation((api, reason: string) => api.updateLead(leadId, { stage: "lost", lostReason: reason }), {
    onSuccess: async () => {
      toast.success("Lead marked as lost — reason recorded.");
      setLostOpen(false);
      await invalidate();
    },
  });

  const updateTrial = useApiMutation(
    (api, input: { bookingId: string; status: Extract<TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }) =>
      api.updateTrialBooking(input.bookingId, { status: input.status, note: input.note }),
    {
      onSuccess: async (updated) => {
        toast.success(`Trial ${updated.trialBooking?.status.replaceAll("_", " ") ?? "updated"}.`);
        setTrialOutcome(undefined);
        setTrialNote("");
        await invalidate();
      },
    },
  );

  if (leadQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (leadQuery.isError) {
    return isApiError(leadQuery.error) && leadQuery.error.code === "NOT_FOUND" ? (
      <NotFoundState title="Lead not found" />
    ) : (
      <ErrorState onRetry={() => leadQuery.refetch()} />
    );
  }

  const lead = leadQuery.data!;
  const open = lead.stage !== "won" && lead.stage !== "lost";
  const currentStageIdx = STAGE_ORDER.indexOf(lead.stage);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Pipeline", href: "/crm/pipeline" }, { label: lead.fullName }]} />

      {/* Header */}
      <header className="panel px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[24px] font-semibold leading-none tracking-tight">{lead.fullName}</h1>
              <LeadStageChip stage={lead.stage} />
              {lead.overdue ? <Badge variant="signal">follow-up overdue</Badge> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
              <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-mono text-[12.5px] hover:text-ink" dir="ltr">
                <Phone className="size-3.5 text-ink-3" /> {lead.phone}
              </a>
              <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
              <span>{lead.branchName}</span>
              <span>Owner: {lead.ownerName ?? "unassigned"}</span>
              {lead.expectedValue ? (
                <span>
                  Expected <MoneyText money={lead.expectedValue} />
                </span>
              ) : null}
            </div>
          </div>
          {open ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setOfferOpen(true)}>
                <FileText /> Create offer
              </Button>
              <Button onClick={() => setConvertOpen(true)} data-testid="convert-lead">
                <UserCheck /> Convert to member
              </Button>
              <Button variant="ghost" onClick={() => setLostOpen(true)}>
                <XCircle /> Mark lost
              </Button>
            </div>
          ) : lead.stage === "won" && lead.convertedMemberId ? (
            <Button onClick={() => router.push(`/members/${lead.convertedMemberId}`)}>
              Open member record <ArrowRight />
            </Button>
          ) : null}
        </div>

        {/* Stage stepper */}
        <ol className="mt-5 flex items-center gap-1 overflow-x-auto" aria-label="Lead stage">
          {STAGE_ORDER.map((stage, i) => {
            const done = lead.stage === "lost" ? false : i < currentStageIdx;
            const current = lead.stage === stage;
            return (
              <li key={stage} className="flex min-w-0 flex-1 items-center gap-1" aria-current={current ? "step" : undefined}>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono",
                    done && "border-success bg-success text-white",
                    current && (lead.stage === "lost" ? "border-signal bg-signal text-white" : "border-ink bg-ink text-paper"),
                    !done && !current && "border-line-3 text-ink-3",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={cn("hidden truncate text-[11px] md:block", current ? "font-medium text-ink" : "text-ink-3")}>
                  {STAGE_LABELS[stage]}
                </span>
                {i < STAGE_ORDER.length - 1 ? <span className={cn("h-px min-w-3 flex-1", done ? "bg-success" : "bg-line-2")} /> : null}
              </li>
            );
          })}
          {lead.stage === "lost" ? (
            <span className="ms-2 rounded-sm bg-signal-bg px-2 py-1 text-[11px] font-medium text-signal-deep">Lost — {lead.lostReason}</span>
          ) : null}
        </ol>
      </header>

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        {/* Work column */}
        <div className="space-y-4 self-start">
          {lead.trialBooking ? (
            <section className="panel p-4" data-testid="trial-workflow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Free trial</p>
                  <h2 className="mt-1 font-display text-[15px] font-semibold">
                    {formatDate(lead.trialBooking.preferredDate)} · {lead.trialBooking.preferredTime}
                  </h2>
                </div>
                <Badge variant={lead.trialBooking.status === "completed" || lead.trialBooking.status === "converted" ? "success" : lead.trialBooking.status === "cancelled" ? "signal" : "warning"}>
                  {lead.trialBooking.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">{lead.trialBooking.goal}</p>
              {lead.trialBooking.status === "requested" ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button loading={updateTrial.isPending} onClick={() => updateTrial.mutate({ bookingId: lead.trialBooking!.id, status: "confirmed" })}>
                    <CalendarClock /> Confirm
                  </Button>
                  <Button variant="secondary" onClick={() => setTrialOutcome("cancelled")}><XCircle /> Cancel</Button>
                </div>
              ) : lead.trialBooking.status === "confirmed" ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button onClick={() => setTrialOutcome("completed")}><CheckCircle2 /> Complete</Button>
                  <Button variant="secondary" onClick={() => setTrialOutcome("no_show")}><UserX /> No-show</Button>
                  <Button variant="ghost" className="col-span-2" onClick={() => setTrialOutcome("cancelled")}><XCircle /> Cancel trial</Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="panel p-4">
            <h2 className="mb-3 font-display text-[14px] font-semibold">Log contact</h2>
            {open ? (
              <LogContactForm subject="lead" leadId={lead.id} currentStage={lead.stage} />
            ) : (
              <p className="text-[12.5px] text-ink-3">This lead is closed — the record below is the full history.</p>
            )}
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 font-display text-[14px] font-semibold">Context</h2>
            <dl className="space-y-2 text-[12.5px]">
              <ContextRow label="Next follow-up">
                {lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} className={lead.overdue ? "font-medium text-danger" : ""} /> : "—"}
              </ContextRow>
              <ContextRow label="Created"><DateTimeText iso={lead.createdAt} /></ContextRow>
              <ContextRow label="Email">{lead.email ?? "—"}</ContextRow>
              {lead.notes ? <ContextRow label="First notes">{lead.notes}</ContextRow> : null}
            </dl>
          </section>

          {lead.offers.length > 0 ? (
            <section className="panel p-4">
              <h2 className="mb-3 font-display text-[14px] font-semibold">Offers</h2>
              <ul className="space-y-2">
                {lead.offers.map((offer) => (
                  <li key={offer.id} className="rounded-md border border-line p-2.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{offer.planName}</span>
                      <Badge variant={offer.status === "accepted" ? "success" : offer.status === "sent" ? "warning" : "neutral"}>
                        {offer.status === "draft" ? "Draft · not delivered" : offer.status === "sent" && offer.deliveryChannel ? `Delivered · ${offer.deliveryChannel}` : offer.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-ink-3">
                      <MoneyText money={offer.price} />
                      <span className="text-end">
                        {offer.expiresAt ? <>expires {formatDate(offer.expiresAt)}</> : null}
                        {offer.status === "sent" && offer.deliveredAt ? <span className="ms-2">· {formatDate(offer.deliveredAt)}</span> : null}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Timeline */}
        <section className="panel self-start px-5 py-4">
          <h2 className="mb-3 font-display text-[14px] font-semibold">History</h2>
          <TimelineFeed events={lead.activities} empty="Nothing yet — make the first call." />
        </section>
      </div>

      <CreateOfferDialog leadId={lead.id} email={lead.email} phone={lead.phone} open={offerOpen} onOpenChange={setOfferOpen} />
      <ConvertLeadDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} branchId={lead.branchId} open={convertOpen} onOpenChange={setConvertOpen} />

      <Dialog open={Boolean(trialOutcome)} onOpenChange={(open) => { if (!open) { setTrialOutcome(undefined); setTrialNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{trialOutcome === "completed" ? "Complete free trial" : trialOutcome === "no_show" ? "Mark as no-show" : "Cancel free trial"}</DialogTitle>
            <DialogDescription>
              {trialOutcome === "completed" ? "This moves the lead into post-trial follow-up and creates a task for tomorrow." : trialOutcome === "no_show" ? "Record what happened so the sales owner can reschedule with context." : "Cancelling closes this lead and records the reason in its history."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={trialOutcome === "completed" ? "Outcome note" : "Reason"} required={trialOutcome !== "completed"}>
              <Input value={trialNote} onChange={(event) => setTrialNote(event.target.value)} placeholder={trialOutcome === "completed" ? "Optional coaching or sales notes" : "Required operational reason"} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTrialOutcome(undefined)}>Back</Button>
            <Button
              variant={trialOutcome === "cancelled" ? "signal" : "primary"}
              disabled={!lead.trialBooking || !trialOutcome || (trialOutcome !== "completed" && !trialNote.trim())}
              loading={updateTrial.isPending}
              onClick={() => lead.trialBooking && trialOutcome && updateTrial.mutate({ bookingId: lead.trialBooking.id, status: trialOutcome, note: trialNote.trim() || undefined })}
            >
              Save outcome
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark lost */}
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark lead as lost</DialogTitle>
            <DialogDescription>The reason feeds the lost-reason report — be specific.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Lost reason" required>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger aria-label="Lost reason">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Price too high">Price too high</SelectItem>
                  <SelectItem value="Chose a competitor">Chose a competitor</SelectItem>
                  <SelectItem value="No response">No response</SelectItem>
                  <SelectItem value="Timing — later">Timing — will reconsider later</SelectItem>
                  <SelectItem value="Location inconvenient">Location inconvenient</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLostOpen(false)}>Back</Button>
            <Button variant="signal" disabled={!lostReason} loading={markLost.isPending} onClick={() => markLost.mutate(lostReason)}>
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create offer
// ---------------------------------------------------------------------------
const offerSchema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  price: z.string().min(1, "Price is required"),
  expiresInDays: z.coerce.number().int().min(1).max(60),
});
type OfferValues = z.infer<typeof offerSchema>;

function CreateOfferDialog({ leadId, email, phone, open, onOpenChange }: { leadId: string; email?: string; phone: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const invalidate = useInvalidate();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 50 }));
  const form = useForm<OfferValues>({ resolver: zodResolver(offerSchema), defaultValues: { planId: "", price: "", expiresInDays: 7 } });
  const [deliveryMode, setDeliveryMode] = useState<"draft" | "manual">("draft");
  const [channel, setChannel] = useState<OfferDeliveryChannel>(email ? "email" : phone ? "whatsapp" : "manual");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (!open) return;
    setDeliveryMode("draft");
    setChannel(email ? "email" : phone ? "whatsapp" : "manual");
    setReference("");
  }, [email, open, phone]);

  const mutation = useApiMutation(
    async (api, v: OfferValues) => {
      const offer = await api.createOffer({ leadId, planId: v.planId, price: fromMajor(Number(v.price)), expiresInDays: v.expiresInDays });
      return deliveryMode === "manual" ? api.markOfferDelivered(offer.id, { channel, reference: reference.trim() || undefined }) : offer;
    },
    {
      onSuccess: async () => {
        toast.success(deliveryMode === "manual" ? "Offer delivery confirmed and lead stage updated." : "Offer saved as a draft — it has not been delivered.");
        onOpenChange(false);
        await invalidate();
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create offer</DialogTitle>
          <DialogDescription>Record the price and expiry first. A lead only moves to “Offer sent” after delivery is explicitly confirmed.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))}>
          <DialogBody className="space-y-4">
            <Field label="Plan" required error={form.formState.errors.planId?.message}>
              <Controller
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      const plan = plansQuery.data?.items.find((p) => p.id === v);
                      if (plan) form.setValue("price", toMajor(plan.basePrice).toFixed(3));
                    }}
                  >
                    <SelectTrigger aria-label="Plan">
                      <SelectValue placeholder="Choose…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(plansQuery.data?.items ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — JOD {toMajor(p.basePrice).toFixed(3)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Offer price (JOD)" required error={form.formState.errors.price?.message}>
                <Input inputMode="decimal" {...form.register("price")} />
              </Field>
              <Field label="Valid for (days)">
                <Input type="number" min={1} max={60} {...form.register("expiresInDays")} />
              </Field>
            </div>
            <Field label="Delivery state" hint="RIVET does not send CRM offers yet; manual confirmation records what happened outside the app.">
              <Select value={deliveryMode} onValueChange={(value) => setDeliveryMode(value as "draft" | "manual")}>
                <SelectTrigger aria-label="Delivery state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Keep as draft · not delivered</SelectItem>
                  <SelectItem value="manual">Confirm manual delivery</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {deliveryMode === "manual" ? (
              <div className="space-y-3 rounded-md border border-line bg-sunken px-3.5 py-3">
                <p className="text-[12px] text-ink-2">Confirm that you already sent the offer outside RIVET. This does not call an email or messaging provider.</p>
                <Field label="Channel" required>
                  <Select value={channel} onValueChange={(value) => setChannel(value as OfferDeliveryChannel)}>
                    <SelectTrigger aria-label="Delivery channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email" disabled={!email}>Email{email ? ` · ${email}` : " · no email captured"}</SelectItem>
                      <SelectItem value="whatsapp" disabled={!phone}>WhatsApp · {phone}</SelectItem>
                      <SelectItem value="sms" disabled={!phone}>SMS · {phone}</SelectItem>
                      <SelectItem value="manual">Other manual channel</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="External reference (optional)" hint="Message ID, call note, or other safe reference — never paste credentials.">
                  <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. WhatsApp note · 12 Aug" />
                </Field>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>{deliveryMode === "manual" ? "Confirm manual delivery" : "Record draft"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Convert lead
// ---------------------------------------------------------------------------
function ConvertLeadDialog({
  leadId,
  fullName,
  phone,
  branchId,
  open,
  onOpenChange,
}: {
  leadId: string;
  fullName: string;
  phone: string;
  branchId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { session } = useApp();
  const router = useRouter();
  const invalidate = useInvalidate();
  const [language, setLanguage] = useState<"en" | "ar">("en");
  const [gender, setGender] = useState<"male" | "female" | undefined>(undefined);
  const [homeBranch, setHomeBranch] = useState(branchId);
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicateMemberId, setDuplicateMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setServerError(null);
      setDuplicateMemberId(null);
      setHomeBranch(branchId);
    }
  }, [branchId, open]);

  const mutation = useApiMutation(
    (api) => api.convertLead(leadId, { homeBranchId: homeBranch, preferredLanguage: language, gender }),
    {
      onSuccess: async (member) => {
        toast.success(`${member.fullName} is now member ${member.memberNumber}. Sell the membership next.`);
        onOpenChange(false);
        await invalidate();
        router.push(`/members/${member.id}`);
      },
      onError: (error) => {
        setServerError(isApiError(error) ? error.message : "Could not convert this lead.");
        if (isApiError(error) && error.code === ERR.DUPLICATE_MEMBER) {
          const firstMatch = Array.isArray(error.details?.matches) ? error.details.matches[0] : undefined;
          if (firstMatch && typeof firstMatch === "object" && typeof (firstMatch as { memberId?: unknown }).memberId === "string") {
            setDuplicateMemberId((firstMatch as { memberId: string }).memberId);
          }
        }
      },
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to member</DialogTitle>
          <DialogDescription>
            Creates the member record without re-typing contact data, closes open follow-ups, and links both timelines.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-line bg-sunken/50 p-3 text-[13px]">
            <p className="font-medium">{fullName}</p>
            <p className="font-mono text-[12px] text-ink-3" dir="ltr">{phone}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Home branch">
              <Select value={homeBranch} onValueChange={setHomeBranch}>
                <SelectTrigger aria-label="Home branch">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {session?.branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Language">
              <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "ar")}>
                <SelectTrigger aria-label="Preferred language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">العربية</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Gender">
              <Select value={gender ?? ""} onValueChange={(v) => setGender((v || undefined) as "male" | "female" | undefined)}>
                <SelectTrigger aria-label="Gender">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {serverError ? (
            <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger">
              <p>{serverError}</p>
              {duplicateMemberId ? (
                <Link href={`/members/${duplicateMemberId}`} className="mt-1 inline-flex font-medium underline underline-offset-2">
                  Open existing member
                </Link>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} data-testid="confirm-convert">
            Convert to member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
