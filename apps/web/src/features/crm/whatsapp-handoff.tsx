"use client";

import { MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { buildWhatsAppUrl, DEFAULT_PHONE_COUNTRY_CALLING_CODE } from "@/lib/utils/contact";
import { addDays, localDateTimeToISO, todayISODate } from "@/lib/utils/dates";

interface WhatsAppHandoffProps {
  subject: "lead" | "member";
  subjectId: string;
  recipientName: string;
  phone: string;
  organizationName?: string;
  defaultCountryCallingCode?: string;
  onLogged?: () => void;
  className?: string;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function defaultWhatsAppMessage(recipientName: string, organizationName: string): string {
  return `Hi ${firstName(recipientName)}, this is ${organizationName}. Just following up with you — reply here whenever it suits you.`;
}

/**
 * Opens WhatsApp with a prefilled message, then records only that the handoff
 * was opened. RIVET deliberately does not claim delivery or a read receipt.
 */
export function WhatsAppHandoff({
  subject,
  subjectId,
  recipientName,
  phone,
  organizationName,
  defaultCountryCallingCode,
  onLogged,
  className,
}: WhatsAppHandoffProps) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const gymName = organizationName ?? session?.organization.name ?? "RIVET";
  const callingCode = defaultCountryCallingCode ?? session?.organization.phoneCountryCallingCode ?? DEFAULT_PHONE_COUNTRY_CALLING_CODE;
  const initialMessage = useMemo(() => defaultWhatsAppMessage(recipientName, gymName), [gymName, recipientName]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [nextFollowUp, setNextFollowUp] = useState(() => addDays(todayISODate(session?.organization.timezone), 1));
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setMessage(initialMessage);
    setNextFollowUp(addDays(todayISODate(session?.organization.timezone), 1));
    setError(undefined);
  }, [initialMessage, open, session?.organization.timezone]);

  const logHandoff = useApiMutation<unknown, void>(
    (api) => {
      const input = {
        outcome: "whatsapp_opened" as const,
        notes: "Opened a provider-free WhatsApp handoff. Delivery was not confirmed by RIVET.",
        nextFollowUpAt: nextFollowUp ? localDateTimeToISO(nextFollowUp, "10:00", session?.organization.timezone) : undefined,
      };
      return subject === "lead" ? api.logContactAttempt(subjectId, input) : api.logMemberContactAttempt(subjectId, input);
    },
    {
      onSuccess: async () => {
        toast.success("WhatsApp opened — handoff logged, delivery not confirmed.");
        setOpen(false);
        await invalidate();
        onLogged?.();
      },
      onError: () => toast.error("WhatsApp opened, but RIVET could not log the handoff. Log it manually when you return."),
    },
  );

  const launch = () => {
    const url = buildWhatsAppUrl({ phone, message, defaultCountryCallingCode: callingCode });
    if (!url) {
      setError("This number cannot be opened in WhatsApp. Edit the contact and include the full country code, such as +962.");
      return;
    }
    const handoff = window.open(url, "_blank", "noopener,noreferrer");
    if (handoff) handoff.opener = null;
    logHandoff.mutate();
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
        <MessageCircle /> WhatsApp
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Message {recipientName}</DialogTitle>
            <DialogDescription>RIVET opens WhatsApp with this message ready. You stay in control of sending it.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">Destination</p>
              <p className="mt-1 font-mono text-[13px]" dir="ltr">{phone}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Local numbers use the gym&apos;s +{callingCode} default. A number beginning with + or 00 always keeps its own country.</p>
            </div>
            <Field label="Message" required>
              <Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} aria-label="WhatsApp message" />
            </Field>
            <Field label="Follow up on" hint="Keeps this person visible even if they do not reply.">
              <Input type="date" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} aria-label="WhatsApp follow-up date" />
            </Field>
            {error ? <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
            <p className="text-[11.5px] leading-relaxed text-ink-3">Opening WhatsApp is logged on the timeline. RIVET does not claim that the message was sent, delivered, or read.</p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" loading={logHandoff.isPending} disabled={!message.trim()} onClick={launch}><Send /> Open WhatsApp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
