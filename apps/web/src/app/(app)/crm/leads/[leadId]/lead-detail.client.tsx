"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, FileText, Phone, UserCheck, XCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { LeadStage } from "@/lib/domain/types";
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

  const leadQuery = useApiQuery(qk.lead(leadId), (api) => api.getLead(leadId));

  const markLost = useApiMutation((api, reason: string) => api.updateLead(leadId, { stage: "lost", lostReason: reason }), {
    onSuccess: async () => {
      toast.success("Lead marked as lost — reason recorded.");
      setLostOpen(false);
      await invalidate();
    },
  });

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
                        {offer.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-ink-3">
                      <MoneyText money={offer.price} />
                      {offer.expiresAt ? <span>expires {formatDate(offer.expiresAt)}</span> : null}
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

      <CreateOfferDialog leadId={lead.id} open={offerOpen} onOpenChange={setOfferOpen} />
      <ConvertLeadDialog leadId={lead.id} fullName={lead.fullName} phone={lead.phone} branchId={lead.branchId} open={convertOpen} onOpenChange={setConvertOpen} />

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

function CreateOfferDialog({ leadId, open, onOpenChange }: { leadId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const invalidate = useInvalidate();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 50 }));
  const form = useForm<OfferValues>({ resolver: zodResolver(offerSchema), defaultValues: { planId: "", price: "", expiresInDays: 7 } });

  const mutation = useApiMutation(
    (api, v: OfferValues) => api.createOffer({ leadId, planId: v.planId, price: fromMajor(Number(v.price)), expiresInDays: v.expiresInDays }),
    {
      onSuccess: async () => {
        toast.success("Offer recorded and stage moved to “Offer sent”.");
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
          <DialogDescription>Records the commercial offer on the lead timeline and moves the stage forward.</DialogDescription>
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
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={mutation.isPending}>Send offer</Button>
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

  const mutation = useApiMutation(
    (api) => api.convertLead(leadId, { homeBranchId: homeBranch, preferredLanguage: language, gender }),
    {
      onSuccess: async (member) => {
        toast.success(`${member.fullName} is now member ${member.memberNumber}. Sell the membership next.`);
        onOpenChange(false);
        await invalidate();
        router.push(`/members/${member.id}`);
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
