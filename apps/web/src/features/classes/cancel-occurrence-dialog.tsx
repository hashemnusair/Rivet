"use client";
import { useLocale } from "@/lib/i18n/provider";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { ClassOccurrence } from "@/lib/domain/types";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";

export function CancelOccurrenceDialog({ occurrence, onClose, onSaved }: { occurrence: ClassOccurrence; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const [reason, setReason] = useState("");
  const cancel = useApiMutation(api => api.cancelClassOccurrence({ occurrenceId: occurrence.id, reason: reason.trim() }), {
    successMessage: t("classWorkspace.cancelledToast"),
    onSuccess: async () => { onClose(); await onSaved(); },
  });
  return <Dialog open onOpenChange={open => { if (!open && !cancel.isPending) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{t("classWorkspace.cancelTitle")}</DialogTitle><DialogDescription>{t("classWorkspace.cancelDescription", { name: isolate(occurrence.name), date: isolate(f.dateTime(occurrence.startsAt)) })}</DialogDescription></DialogHeader>
      <DialogBody><label className="grid gap-1.5 text-sm">{t("classWorkspace.cancelReason")}<Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} /></label><p className="mt-2 text-xs text-ink-3">{t("classWorkspace.cancelHint")}</p></DialogBody>
      <DialogFooter><Button variant="secondary" disabled={cancel.isPending} onClick={onClose}>{t("classWorkspace.keepThisClass")}</Button><Button variant="danger" loading={cancel.isPending} disabled={!reason.trim()} onClick={() => cancel.mutate()}>{t("classWorkspace.cancelClass")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
