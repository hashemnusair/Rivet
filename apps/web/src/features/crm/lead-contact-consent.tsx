"use client";

import { useState } from "react";
import { DateTimeText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LeadDetail } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";

/**
 * Whether a lead may be contacted, in the lead's Contact panel. A lead who
 * asked not to be contacted is recorded through its own audited action and
 * left out of the calls RIVET prepares; the reason is optional.
 */
export function LeadContactConsent({ lead, canEdit }: { lead: Pick<LeadDetail, "id" | "doNotContact">; canEdit: boolean }) {
  const { t } = useLocale();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const change = useApiMutation((api, doNotContact: boolean) => api.setLeadContactPreference(lead.id, { doNotContact, ...(doNotContact && reason.trim() ? { reason: reason.trim() } : {}) }), {
    successMessage: (result) => result.doNotContact ? t("crmCompletion.lead.consent.savedNoContact") : t("crmCompletion.lead.consent.savedAllowed"),
    onSuccess: async () => { setOpen(false); setReason(""); await invalidate(); },
  });
  return (
    <div className="flex items-start justify-between gap-3" data-testid="lead-contact-consent">
      <dt className="shrink-0 text-ink-3">{t("crmCompletion.lead.consent.label")}</dt>
      <dd className="space-y-1 text-end">
        {lead.doNotContact
          ? <p className="font-medium text-warning-deep" data-testid="lead-contact-consent-state">{t("crmCompletion.lead.consent.no")} · <DateTimeText iso={lead.doNotContact.since} /></p>
          : <p data-testid="lead-contact-consent-state">{t("crmCompletion.lead.consent.yes")}</p>}
        {canEdit ? (
          lead.doNotContact
            ? <Button type="button" variant="ghost" size="xs" loading={change.isPending} onClick={() => change.mutate(false)} data-testid="lead-contact-consent-allow">{t("crmCompletion.lead.consent.allow")}</Button>
            : <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)} data-testid="lead-contact-consent-mark">{t("crmCompletion.lead.consent.mark")}</Button>
        ) : null}
      </dd>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crmCompletion.lead.consent.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("crmCompletion.lead.consent.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={t("crmCompletion.lead.consent.note")} htmlFor="lead-contact-consent-note">
              <Input id="lead-contact-consent-note" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} dir="auto" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button>
            <Button type="button" loading={change.isPending} onClick={() => change.mutate(true)} data-testid="lead-contact-consent-confirm">{t("common.action.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
