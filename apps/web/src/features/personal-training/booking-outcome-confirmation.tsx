"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { PtBooking } from "@/lib/domain/types";
import { PT_DEFAULT_CANCELLATION_CUTOFF_HOURS, ptBookingCreditConsequence, type PtBookingOutcomeAction } from "@/lib/domain/personal-training";
import { useFormat } from "@/lib/i18n/format";

const TITLE = { completed: "ptWorkspace.completeTitle", no_show: "ptWorkspace.noShowTitle", cancelled: "ptWorkspace.cancelTitle" } as const;

const ACTION = { completed: "ptWorkspace.completeAction", no_show: "ptWorkspace.noShowAction", cancelled: "ptWorkspace.cancelAction" } as const;

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
  const t = useT();
  const f = useFormat();
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
        <DialogHeader><DialogTitle>{t(TITLE[action])}</DialogTitle><DialogDescription>{t("ptWorkspace.confirmDetails")}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <dl className="grid gap-3 rounded-md border border-line bg-sunken p-3 text-[12px] sm:grid-cols-2">
            <div><dt className="context-label">{t("palette.kind.member")}</dt><dd className="mt-1 font-medium text-ink">{booking.memberName}</dd></div>
            <div><dt className="context-label">{t("members.tabs.pt.trainer")}</dt><dd className="mt-1 font-medium text-ink">{booking.trainerName}</dd></div>
            <div className="sm:col-span-2"><dt className="context-label">{t("ptWorkspace.sessionTime")}</dt><dd className="mt-1 font-medium text-ink">{f.dateTime(booking.startsAt)} · {booking.branchName}</dd></div>
          </dl>
          {action === "cancelled" && allowCancellationChoice ? (
            <RadioGroup aria-label={t("ptWorkspace.whoCancels")} value={byGym ? "gym" : "member"} onValueChange={(value) => setByGym(value === "gym")}>
              <RadioCard value="gym"><span className="block text-[13px] font-medium text-ink">{t("ptWorkspace.gymCancels")}</span><span className="mt-0.5 block text-[12px] text-ink-2">{t("ptWorkspace.memberCreditBack")}</span></RadioCard>
              <RadioCard value="member"><span className="block text-[13px] font-medium text-ink">{t("ptWorkspace.memberCancels")}</span><span className="mt-0.5 block text-[12px] text-ink-2">{t("ptWorkspace.cutoffHint", { count: cutoffHours })}</span></RadioCard>
            </RadioGroup>
          ) : null}
          <p className={consequence.effect === "consume" ? "rounded-md border border-warning/30 bg-warning-bg p-3 text-[12px] text-warning-deep" : "rounded-md border border-success/30 bg-success-bg p-3 text-[12px] text-success-deep"} role="status">{t(consequence.messageKey)}</p>
          {reasonRequired ? <Field label={action === "no_show" ? t("ptWorkspace.noShowReason") : t("ptWorkspace.cancellationReason")} htmlFor={reasonId} required><Textarea id={reasonId} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "no_show" ? t("memberProfile.contact.whatHappened") : byGym ? t("ptWorkspace.gymCancelReason") : t("ptWorkspace.memberCancelReason")} /></Field> : <p className="text-[12px] text-ink-3">{t("ptWorkspace.completeNoReason")}</p>}
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.back")}</Button><Button variant={action === "completed" ? "primary" : action === "cancelled" ? "danger" : "secondary"} loading={pending} disabled={reasonRequired && reason.trim().length < 3} onClick={() => onConfirm({ booking, action, reason: reason.trim() || undefined, cancelledByGym: action === "cancelled" && byGym })}>{t(ACTION[action])}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
