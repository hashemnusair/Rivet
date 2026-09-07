"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { PtBooking } from "@/lib/domain/types";
import { PT_DEFAULT_CANCELLATION_CUTOFF_HOURS, ptBookingCreditConsequence, type PtBookingOutcomeAction } from "@/lib/domain/personal-training";
import { formatDateTime } from "@/lib/utils/dates";

const TITLE: Record<PtBookingOutcomeAction, string> = {
  completed: "Complete PT session?",
  no_show: "Mark PT session as no-show?",
  cancelled: "Cancel PT session?",
};

const ACTION: Record<PtBookingOutcomeAction, string> = {
  completed: "Complete session",
  no_show: "Record no-show",
  cancelled: "Cancel session",
};

export function BookingOutcomeConfirmation({
  booking,
  action,
  open,
  pending,
  cancelledByGym = false,
  cutoffHours = PT_DEFAULT_CANCELLATION_CUTOFF_HOURS,
  allowCancellationChoice = false,
  onOpenChange,
  onConfirm,
}: {
  booking?: PtBooking;
  action?: PtBookingOutcomeAction;
  open: boolean;
  pending?: boolean;
  /** Initial answer to "who is cancelling"; staff may change it when allowCancellationChoice is set. */
  cancelledByGym?: boolean;
  /** The gym's PT cutoff, so the stated ledger consequence matches what the server will do. */
  cutoffHours?: number;
  /** Let staff record a member-requested cancellation, which follows the cutoff rule. */
  allowCancellationChoice?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { booking: PtBooking; action: PtBookingOutcomeAction; reason?: string; cancelledByGym: boolean }) => void;
}) {
  const [reason, setReason] = useState("");
  const [byGym, setByGym] = useState(cancelledByGym);
  useEffect(() => { if (open) { setReason(""); setByGym(cancelledByGym); } }, [open, booking?.id, action, cancelledByGym]);
  if (!booking || !action) return null;
  const consequence = ptBookingCreditConsequence({ action, startsAt: booking.startsAt, cutoffHours, cancelledByGym: byGym });
  const reasonRequired = action === "no_show" || action === "cancelled";
  const reasonId = `pt-outcome-reason-${booking.id}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{TITLE[action]}</DialogTitle><DialogDescription>Review the member, trainer, time, and ledger impact before recording this audited outcome.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <dl className="grid gap-3 rounded-md border border-line bg-sunken p-3 text-[12px] sm:grid-cols-2">
            <div><dt className="context-label">Member</dt><dd className="mt-1 font-medium text-ink">{booking.memberName}</dd></div>
            <div><dt className="context-label">Trainer</dt><dd className="mt-1 font-medium text-ink">{booking.trainerName}</dd></div>
            <div className="sm:col-span-2"><dt className="context-label">Session time</dt><dd className="mt-1 font-medium text-ink">{formatDateTime(booking.startsAt)} · {booking.branchName}</dd></div>
          </dl>
          {action === "cancelled" && allowCancellationChoice ? (
            <RadioGroup aria-label="Who is cancelling" value={byGym ? "gym" : "member"} onValueChange={(value) => setByGym(value === "gym")}>
              <RadioCard value="gym"><span className="block text-[13px] font-medium text-ink">The gym is cancelling</span><span className="mt-0.5 block text-[12px] text-ink-2">The reserved credit goes back to the member.</span></RadioCard>
              <RadioCard value="member"><span className="block text-[13px] font-medium text-ink">The member asked to cancel</span><span className="mt-0.5 block text-[12px] text-ink-2">The gym&apos;s {cutoffHours}-hour cutoff decides whether the credit is returned.</span></RadioCard>
            </RadioGroup>
          ) : null}
          <p className={consequence.effect === "consume" ? "rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep" : "rounded-md border border-success/30 bg-success-bg p-3 text-[12px] text-success-deep"} role="status">{consequence.text}</p>
          {reasonRequired ? <Field label={action === "no_show" ? "No-show reason" : "Cancellation reason"} htmlFor={reasonId} required hint="This explanation is included in the immutable audit history."><Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "no_show" ? "What happened?" : byGym ? "Why is the gym cancelling this session?" : "What did the member say?"} /></Field> : <p className="text-[12px] text-ink-3">Routine completion stays fast: no reason is required.</p>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Back</Button><Button variant={action === "completed" ? "primary" : action === "cancelled" ? "danger" : "secondary"} loading={pending} disabled={reasonRequired && reason.trim().length < 3} onClick={() => onConfirm({ booking, action, reason: reason.trim() || undefined, cancelledByGym: action === "cancelled" && byGym })}>{ACTION[action]}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
