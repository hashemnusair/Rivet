"use client";
import { useLocale } from "@/lib/i18n/provider";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { isApiError } from "@/lib/api/errors";
import type { CheckInPreview, CheckInResult } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { checkInReasonLabel } from "./reason-codes";

/**
 * Manual override. Deliberately heavy: the reason is required, the block
 * reasons are restated, and the dialog says who will be named in the audit log.
 */
export function OverrideCheckInDialog({
  open,
  onOpenChange,
  preview,
  branchId,
  actorName,
  onOverridden,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preview: CheckInPreview;
  branchId: string;
  actorName: string;
  onOverridden: (result: CheckInResult) => void;
}) {
  const { t, isolate } = useLocale();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setServerError(null);
    }
  }, [open]);

  const mutation = useApiMutation(
    (api) => api.overrideCheckIn({ memberId: preview.member!.id, branchId, reason, source: "manual" }),
    {
      onSuccess: async (result) => {
        await invalidate();
        onOverridden(result);
        onOpenChange(false);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : t("deskCompletion.reception.override.saveFailed")),
    },
  );

  const member = preview.member;
  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-signal" aria-hidden />{" "}{t("domain.checkInDecision.overridden")}</DialogTitle>
          <DialogDescription>
            <bdi>{member.fullName}</bdi> · <bdi dir="ltr" className="font-mono">{member.memberNumber}</bdi>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-signal/30 bg-signal-bg px-3 py-2.5">
            <p className="context-label text-signal-deep">{t("deskCompletion.reception.override.refusedBecause")}</p>
            <ul className="mt-1.5 space-y-0.5">
              {preview.reasonCodes.map((code) => (
                <li key={code} className="text-[13px] text-signal-deep">
                  · {checkInReasonLabel(code, t)}
                </li>
              ))}
            </ul>
          </div>

          <Field
            label={t("common.label.reason")}
            required
            hint={t("deskCompletion.reception.override.auditHint", { actor: isolate(actorName) })}
          >
            <Textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("deskCompletion.reception.override.placeholder")}
              data-testid="override-reason"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button
            variant="signal"
            disabled={reason.trim().length < 4}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="confirm-override"
          >{t("domain.checkInDecision.overridden")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
