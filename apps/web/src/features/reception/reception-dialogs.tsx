"use client";

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
import { REASON_CODE_LABELS } from "./reason-codes";

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
      onError: (e) => setServerError(isApiError(e) ? e.message : "Override failed."),
    },
  );

  const member = preview.member;
  if (!member) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-signal" aria-hidden /> Override and let in
          </DialogTitle>
          <DialogDescription>
            {member.fullName} · <span className="font-mono">{member.memberNumber}</span>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-md border border-signal/30 bg-signal-bg px-3 py-2.5">
            <p className="eyebrow text-signal-deep">Entry was blocked because</p>
            <ul className="mt-1.5 space-y-0.5">
              {preview.reasonCodes.map((code) => (
                <li key={code} className="text-[13px] text-signal-deep">
                  · {REASON_CODE_LABELS[code] ?? code}
                </li>
              ))}
            </ul>
          </div>

          <Field
            label="Override reason"
            required
            hint={`Recorded in the audit log against ${actorName}. Managers review overrides daily.`}
          >
            <Textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Paid at Abdoun branch this morning, receipt shown"
              data-testid="override-reason"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="signal"
            disabled={reason.trim().length < 4}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="confirm-override"
          >
            Override entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

