"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { ClassOccurrence } from "@/lib/domain/types";
import { useApiMutation } from "@/lib/hooks/use-api";
import { formatDateTime } from "@/lib/utils/dates";

export function CancelOccurrenceDialog({ occurrence, onClose, onSaved }: { occurrence: ClassOccurrence; onClose: () => void; onSaved: () => Promise<void> }) {
  const [reason, setReason] = useState("");
  const cancel = useApiMutation(api => api.cancelClassOccurrence({ occurrenceId: occurrence.id, reason: reason.trim() }), {
    successMessage: "Class cancelled.",
    onSuccess: async () => { onClose(); await onSaved(); },
  });
  return <Dialog open onOpenChange={open => { if (!open && !cancel.isPending) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Cancel this class?</DialogTitle><DialogDescription>{occurrence.name} · {formatDateTime(occurrence.startsAt)}. All bookings and waitlist places are cancelled. Nobody gets a late cancel. The weekly schedule stays the same.</DialogDescription></DialogHeader>
      <DialogBody><label className="grid gap-1.5 text-sm">Cancellation reason<Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label><p className="mt-2 text-xs text-ink-3">Members can see this reason in their app. No message is sent to them, so contact them yourself.</p></DialogBody>
      <DialogFooter><Button variant="secondary" disabled={cancel.isPending} onClick={onClose}>Keep class</Button><Button variant="danger" loading={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate()}>Cancel class</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
