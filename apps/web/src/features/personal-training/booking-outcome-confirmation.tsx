"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import type { PtBooking } from "@/lib/domain/types";
import { ptBookingCreditConsequence, type PtBookingOutcomeAction } from "@/lib/domain/personal-training";
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
  onOpenChange,
  onConfirm,
}: {
  booking?: PtBooking;
  action?: PtBookingOutcomeAction;
  open: boolean;
  pending?: boolean;
  cancelledByGym?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { booking: PtBooking; action: PtBookingOutcomeAction; reason?: string }) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open, booking?.id, action]);
  if (!booking || !action) return null;
  const consequence = ptBookingCreditConsequence({ action, startsAt: booking.startsAt, cancelledByGym });
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
          <p className={consequence.effect === "consume" ? "rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep" : "rounded-md border border-success/30 bg-success-bg p-3 text-[12px] text-success-deep"}>{consequence.text}</p>
          {reasonRequired ? <Field label={action === "no_show" ? "No-show reason" : "Cancellation reason"} htmlFor={reasonId} required hint="This explanation is included in the immutable audit history."><Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "no_show" ? "What happened?" : "Why is the gym cancelling this session?"} /></Field> : <p className="text-[12px] text-ink-3">Routine completion stays fast: no reason is required.</p>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Back</Button><Button variant={action === "completed" ? "primary" : action === "cancelled" ? "danger" : "secondary"} loading={pending} disabled={reasonRequired && reason.trim().length < 3} onClick={() => onConfirm({ booking, action, reason: reason.trim() || undefined })}>{ACTION[action]}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
