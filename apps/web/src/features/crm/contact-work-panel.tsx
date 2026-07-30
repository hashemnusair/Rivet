"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import type { ContactOutcome, LeadStage } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";

const OUTCOMES: Array<{ value: ContactOutcome; label: string }> = [
  { value: "answered_interested", label: "Answered — interested" },
  { value: "answered_call_back", label: "Asked for a callback" },
  { value: "answered_not_interested", label: "Answered — not interested" },
  { value: "no_answer", label: "No answer" },
  { value: "whatsapp_sent", label: "WhatsApp sent" },
  { value: "trial_booked", label: "Trial booked" },
  { value: "trial_completed", label: "Trial completed" },
  { value: "wrong_number", label: "Wrong number" },
];

const schema = z.object({
  outcome: z.enum([
    "answered_interested",
    "answered_call_back",
    "answered_not_interested",
    "no_answer",
    "whatsapp_sent",
    "trial_booked",
    "trial_completed",
    "wrong_number",
  ]),
  notes: z.string().optional(),
  nextFollowUp: z.string().optional(),
  stage: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * The core sales action: log what just happened, decide what happens next.
 * Used for leads (pipeline) and members (renewal calls) alike.
 */
export function LogContactForm({
  subject,
  leadId,
  memberId,
  currentStage,
  onLogged,
  compact,
}: {
  subject: "lead" | "member";
  leadId?: string;
  memberId?: string;
  currentStage?: LeadStage;
  onLogged?: () => void;
  compact?: boolean;
}) {
  const invalidate = useInvalidate();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { outcome: "answered_interested", notes: "", nextFollowUp: "", stage: currentStage },
  });

  const outcome = form.watch("outcome");

  const mutation = useApiMutation<unknown, FormValues>(
    (api, v) => {
      const input = {
        outcome: v.outcome as ContactOutcome,
        notes: v.notes || undefined,
        nextFollowUpAt: v.nextFollowUp ? new Date(`${v.nextFollowUp}T10:00:00Z`).toISOString() : undefined,
        stage: subject === "lead" && v.stage ? (v.stage as LeadStage) : undefined,
      };
      return subject === "lead" ? api.logContactAttempt(leadId!, input) : api.logMemberContactAttempt(memberId!, input);
    },
    {
      onSuccess: async () => {
        toast.success("Contact logged — timeline updated.");
        form.reset({ outcome: "answered_interested", notes: "", nextFollowUp: "", stage: currentStage });
        await invalidate();
        onLogged?.();
      },
      onError: () => setError("Could not log the contact. Try again."),
    },
  );

  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        setError(null);
        mutation.mutate(v);
      })}
      className={cn("space-y-3", compact && "space-y-2.5")}
      data-testid="log-contact-form"
    >
      <Field label="Outcome" required>
        <Controller
          control={form.control}
          name="outcome"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger aria-label="Call outcome" data-testid="contact-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      {subject === "lead" && (outcome === "trial_booked" || outcome === "trial_completed" || outcome === "answered_interested") ? (
        <Field label="Move stage to">
          <Controller
            control={form.control}
            name="stage"
            render={({ field }) => (
              <Select value={field.value ?? currentStage ?? "contacted"} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Lead stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="trial_booked">Trial booked</SelectItem>
                  <SelectItem value="trial_completed">Trial completed</SelectItem>
                  <SelectItem value="offer_sent">Offer sent</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
      ) : null}

      <Field label="Notes">
        <Textarea rows={compact ? 2 : 3} placeholder="What did they say?" {...form.register("notes")} data-testid="contact-notes" />
      </Field>

      <Field label="Next follow-up" hint={outcome === "no_answer" ? "Recommended — retry within 2 days." : undefined}>
        <Input type="date" {...form.register("nextFollowUp")} data-testid="contact-next-followup" />
      </Field>

      {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}

      <Button type="submit" loading={mutation.isPending} className="w-full" data-testid="log-contact-submit">
        Log contact
      </Button>
    </form>
  );
}
