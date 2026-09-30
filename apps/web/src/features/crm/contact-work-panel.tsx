"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { suggestedFollowUpDays } from "@/lib/crm/contact-outcomes";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { addDays, localDateTimeToISO, todayISODate } from "@/lib/utils/dates";
import type { ContactOutcome, LeadStage } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

/**
 * Outcomes a person can record by hand, most common first. The RIVET WhatsApp
 * handoff records `whatsapp_opened` itself; "WhatsApp sent" here means the
 * staff member sent a message from their own phone and is saying so.
 */
const MANUAL_OUTCOMES: ContactOutcome[] = [
  "no_answer",
  "answered_interested",
  "answered_call_back",
  "answered_not_interested",
  "whatsapp_sent",
  "trial_booked",
  "trial_completed",
  "wrong_number",
];

/** Trial outcomes only make sense for a lead; a member already has a membership. */
const LEAD_ONLY_OUTCOMES = new Set<ContactOutcome>(["trial_booked", "trial_completed"]);
const STAGE_OUTCOMES = new Set<ContactOutcome>(["answered_interested", "trial_booked", "trial_completed"]);
const STAGE_OPTIONS: Array<{ value: LeadStage; labelKey: TKey }> = [
  { value: "contacted", labelKey: "memberProfile.contact.stage.contacted" },
  { value: "trial_booked", labelKey: "memberProfile.contact.stage.trial_booked" },
  { value: "trial_completed", labelKey: "memberProfile.contact.stage.trial_completed" },
  { value: "offer_sent", labelKey: "memberProfile.contact.stage.offer_sent" },
];

/** The stage a reached lead most plausibly moves to; the person can still change it. */
export function recommendedLeadStage(outcome: ContactOutcome, currentStage?: LeadStage): LeadStage {
  if (outcome === "trial_booked") return "trial_booked";
  if (outcome === "trial_completed") return "trial_completed";
  if (currentStage && STAGE_OPTIONS.some((option) => option.value === currentStage)) return currentStage;
  return "contacted";
}

/** Built per render so the "choose what happened" message follows the reader's language. */
function makeSchema(t: TFunction) {
  return z.object({
    outcome: z.enum(["no_answer", "answered_interested", "answered_not_interested", "answered_call_back", "wrong_number", "whatsapp_sent", "whatsapp_opened", "trial_booked", "trial_completed"], { message: t("memberProfile.contact.outcomeRequired") }),
    notes: z.string().optional(),
    nextFollowUp: z.string().optional(),
    stage: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/**
 * The core sales action: log what just happened, decide what happens next.
 * Used for leads (pipeline) and members (renewal calls) alike. The outcome is
 * a deliberate choice, never a default, so the timeline only ever records
 * what a person actually said happened.
 */
export function LogContactForm({
  subject,
  leadId,
  memberId,
  currentStage,
  defaultOutcome,
  submitLabel,
  onLogged,
  compact,
}: {
  subject: "lead" | "member";
  leadId?: string;
  memberId?: string;
  currentStage?: LeadStage;
  /** Preselect an outcome the caller already knows (for example a queue action). */
  defaultOutcome?: ContactOutcome;
  submitLabel?: string;
  onLogged?: () => void;
  compact?: boolean;
}) {
  const invalidate = useInvalidate();
  const { session } = useApp();
  const { t } = useLocale();
  const schema = useMemo(() => makeSchema(t), [t]);
  const timezone = session?.organization.timezone;
  const today = todayISODate(timezone);
  const [saveFailed, setSaveFailed] = useState(false);
  const [followUpTouched, setFollowUpTouched] = useState(false);
  const [suggestedDays, setSuggestedDays] = useState<number | undefined>(() => defaultOutcome ? suggestedFollowUpDays(defaultOutcome) : undefined);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      outcome: defaultOutcome,
      notes: "",
      nextFollowUp: defaultOutcome && suggestedFollowUpDays(defaultOutcome) ? addDays(today, suggestedFollowUpDays(defaultOutcome)!) : "",
      stage: defaultOutcome ? recommendedLeadStage(defaultOutcome, currentStage) : undefined,
    },
  });

  const outcome = form.watch("outcome");
  const showsStage = subject === "lead" && outcome !== undefined && STAGE_OUTCOMES.has(outcome);
  const stageOptions = currentStage && !STAGE_OPTIONS.some((option) => option.value === currentStage) && !["new", "attempted", "won", "lost"].includes(currentStage)
    ? [{ value: currentStage, label: currentStage.replaceAll("_", " ") }, ...STAGE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))]
    : STAGE_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }));

  const chooseOutcome = (next: ContactOutcome) => {
    form.setValue("outcome", next, { shouldValidate: true });
    form.setValue("stage", subject === "lead" ? recommendedLeadStage(next, currentStage) : undefined);
    // A suggested retry date is a default the person can see and change; it
    // never overrides a date they typed themselves.
    const days = suggestedFollowUpDays(next);
    setSuggestedDays(days);
    if (!followUpTouched) form.setValue("nextFollowUp", days ? addDays(today, days) : "");
  };

  const mutation = useApiMutation<unknown, FormValues>(
    (api, v) => {
      const input = {
        outcome: v.outcome as ContactOutcome,
        notes: v.notes?.trim() || undefined,
        nextFollowUpAt: v.nextFollowUp ? localDateTimeToISO(v.nextFollowUp, "10:00", timezone) : undefined,
        // Only send a stage when the person was shown the stage choice; a
        // "no answer" must not pin a lead to its current stage.
        stage: showsStage && v.stage ? (v.stage as LeadStage) : undefined,
      };
      return subject === "lead" ? api.logContactAttempt(leadId!, input) : api.logMemberContactAttempt(memberId!, input);
    },
    {
      onSuccess: async () => {
        toast.success(t("memberProfile.contact.saved"));
        form.reset({ outcome: undefined, notes: "", nextFollowUp: "", stage: undefined });
        setFollowUpTouched(false);
        setSuggestedDays(undefined);
        await invalidate();
        onLogged?.();
      },
      // The form keeps every value so nothing has to be retyped after a retry.
      onError: () => setSaveFailed(true),
    },
  );

  const followUp = form.watch("nextFollowUp");
  const followUpInPast = Boolean(followUp && followUp < today);

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        if (followUpInPast) return;
        setSaveFailed(false);
        mutation.mutate(v);
      })}
      className={cn("space-y-3", compact && "space-y-2.5")}
      data-testid="log-contact-form"
    >
      <Field label={t("memberProfile.contact.whatHappened")} required error={form.formState.errors.outcome?.message}>
        <div role="radiogroup" aria-label={t("memberProfile.contact.outcomeGroup")} data-testid="contact-outcome" className="flex flex-wrap gap-1.5">
          {MANUAL_OUTCOMES.filter((option) => subject === "lead" || !LEAD_ONLY_OUTCOMES.has(option)).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={outcome === option}
              data-touch-target
              onClick={() => chooseOutcome(option)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-[12.5px] font-medium transition-colors",
                outcome === option ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2 hover:border-line-3",
              )}
            >
              {t(`memberProfile.contact.outcome.${option}`)}
            </button>
          ))}
        </div>
      </Field>

      {showsStage ? (
        <Field label={t("memberProfile.contact.moveLeadTo")} hint={t("memberProfile.contact.moveLeadHint")}>
          <Controller
            control={form.control}
            name="stage"
            render={({ field }) => (
              <Select value={field.value ?? recommendedLeadStage(outcome!, currentStage)} onValueChange={field.onChange}>
                <SelectTrigger aria-label={t("memberProfile.contact.leadStageAria")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      ) : null}

      <Field label={t("common.label.notes")}>
        <Textarea rows={compact ? 2 : 3} dir="auto" placeholder={t("memberProfile.contact.notesPlaceholder")} {...form.register("notes")} data-testid="contact-notes" />
      </Field>
      <Field
        label={t("memberProfile.contact.nextFollowUp")}
        hint={
          followUpInPast
            ? undefined
            : suggestedDays && !followUpTouched
              ? suggestedDays === 1
                ? t("memberProfile.contact.suggestedTomorrow")
                : t("memberProfile.contact.suggestedInDays", { count: suggestedDays })
              : t("memberProfile.contact.followUpOptional")
        }
        error={followUpInPast ? t("memberProfile.contact.pastDate") : undefined}
      >
        <Input
          type="date"
          dir="ltr"
          min={today}
          {...form.register("nextFollowUp", { onChange: () => setFollowUpTouched(true) })}
          data-testid="contact-next-followup"
        />
      </Field>

      {saveFailed ? <p role="alert" className="text-[12.5px] text-danger">{t("memberProfile.contact.failed")}</p> : null}

      <Button type="submit" loading={mutation.isPending} disabled={followUpInPast} className="w-full" data-testid="log-contact-submit">
        {submitLabel ?? t("memberProfile.contact.log")}
      </Button>
    </form>
  );
}

/**
 * Open the contact workflow in a centered dialog so queue/detail pages keep
 * their context visible and the form never pushes the work surface downward.
 * Pass `open`/`onOpenChange` to drive it from a deep link such as
 * `?action=contact`; otherwise it renders its own trigger.
 */
export function LogContactDialog({
  subject,
  leadId,
  memberId,
  currentStage,
  defaultOutcome,
  onLogged,
  open,
  onOpenChange,
  hideTrigger = false,
  triggerLabel,
  triggerVariant = "secondary",
}: {
  subject: "lead" | "member";
  leadId?: string;
  memberId?: string;
  currentStage?: LeadStage;
  defaultOutcome?: ContactOutcome;
  onLogged?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  triggerLabel?: string;
  triggerVariant?: "secondary" | "primary" | "ghost";
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const { t } = useLocale();

  return (
    <>
      {hideTrigger ? null : (
        <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
          {triggerLabel ?? t("memberProfile.contact.log")}
        </Button>
      )}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("memberProfile.contact.log")}</DialogTitle>
            <DialogDescription>{subject === "lead" ? t("memberProfile.contact.dialogDescriptionLead") : t("memberProfile.contact.dialogDescriptionMember")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <LogContactForm
              subject={subject}
              leadId={leadId}
              memberId={memberId}
              currentStage={currentStage}
              defaultOutcome={defaultOutcome}
              onLogged={() => {
                setOpen(false);
                onLogged?.();
              }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
