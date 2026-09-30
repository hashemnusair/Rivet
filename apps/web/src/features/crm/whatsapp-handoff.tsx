"use client";

import { ExternalLink, MessageCircle, Send } from "lucide-react";
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
  initialMessage?: string;
  buttonLabel?: string;
  onLogged?: () => void;
  className?: string;
  /** Drive the dialog from outside (for example with a suggested message); otherwise it renders its own button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function defaultWhatsAppMessage(recipientName: string, organizationName: string): string {
  return `Hi ${firstName(recipientName)}, this is ${organizationName}. Just following up with you — reply here whenever it suits you.`;
}

/** The timeline keeps what was prepared, so the next person knows what was said. */
export function whatsAppHandoffNotes(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  const excerpt = trimmed.length > 400 ? `${trimmed.slice(0, 397)}…` : trimmed;
  return `Opened WhatsApp with this message ready: “${excerpt}”. RIVET did not send it and cannot confirm delivery.`;
}

/**
 * Opens WhatsApp with a prefilled message, then records only that the handoff
 * was opened. RIVET deliberately does not claim delivery or a read receipt,
 * and it records nothing at all when the window never opened.
 */
export function WhatsAppHandoff({
  subject,
  subjectId,
  recipientName,
  phone,
  organizationName,
  defaultCountryCallingCode,
  initialMessage,
  buttonLabel = "WhatsApp",
  onLogged,
  className,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: WhatsAppHandoffProps) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const gymName = organizationName ?? session?.organization.name ?? "RIVET";
  const callingCode = defaultCountryCallingCode ?? session?.organization.phoneCountryCallingCode ?? DEFAULT_PHONE_COUNTRY_CALLING_CODE;
  const preparedMessage = useMemo(() => initialMessage?.trim() || defaultWhatsAppMessage(recipientName, gymName), [gymName, initialMessage, recipientName]);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [message, setMessage] = useState(preparedMessage);
  const [nextFollowUp, setNextFollowUp] = useState(() => addDays(todayISODate(session?.organization.timezone), 1));
  const [error, setError] = useState<string>();
  /** Set when the browser refused the popup: the person opens the link by hand and that click is what gets logged. */
  const [blockedUrl, setBlockedUrl] = useState<string>();
  const [logFailed, setLogFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(preparedMessage);
    setNextFollowUp(addDays(todayISODate(session?.organization.timezone), 1));
    setError(undefined);
    setBlockedUrl(undefined);
    setLogFailed(false);
  }, [open, preparedMessage, session?.organization.timezone]);

  const logHandoff = useApiMutation<unknown, void>(
    (api) => {
      const input = {
        outcome: "whatsapp_opened" as const,
        notes: whatsAppHandoffNotes(message),
        nextFollowUpAt: nextFollowUp ? localDateTimeToISO(nextFollowUp, "10:00", session?.organization.timezone) : undefined,
      };
      return subject === "lead" ? api.logContactAttempt(subjectId, input) : api.logMemberContactAttempt(subjectId, input);
    },
    {
      onSuccess: async () => {
        toast.success("WhatsApp opened and noted on the timeline. Remember to send the message there.");
        setOpen(false);
        await invalidate();
        onLogged?.();
      },
      // Keep the dialog, the message and the date: nothing is lost on a failed log.
      onError: () => {
        setLogFailed(true);
        setError("WhatsApp opened, but this was not saved on the timeline. Your message and date are still here. Try again, or close without saving.");
      },
    },
  );

  const launch = () => {
    const url = buildWhatsAppUrl({ phone, message, defaultCountryCallingCode: callingCode });
    if (!url) {
      setError("This number cannot be opened in WhatsApp. Edit the contact and include the full country code, such as +962.");
      return;
    }
    const handoff = window.open(url, "_blank", "noopener,noreferrer");
    if (!handoff) {
      // Nothing opened, so nothing is logged: a blocked popup is not a contact.
      setBlockedUrl(url);
      setError("Your browser blocked the WhatsApp window. Open it with the link below.");
      return;
    }
    handoff.opener = null;
    logHandoff.mutate();
  };

  return (
    <>
      {hideTrigger ? null : (
        <Button type="button" variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
          <MessageCircle /> {buttonLabel}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Message {recipientName}</DialogTitle>
            <DialogDescription>WhatsApp opens with this message ready. You press send there.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5">
              <p className="context-label">Phone number</p>
              <p className="mt-1 font-mono text-[13px]" dir="ltr">{phone}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">Numbers without a country code use +{callingCode}. Numbers starting with + or 00 keep their own country code.</p>
            </div>
            <Field label="Message" required>
              <Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} aria-label="WhatsApp message" disabled={logFailed || Boolean(blockedUrl)} />
            </Field>
            <Field label="Follow up on" hint="Keeps them on your list if they don&apos;t reply. Clear it if no follow-up is needed.">
              <Input type="date" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} aria-label="WhatsApp follow-up date" disabled={logFailed} />
            </Field>
            {error ? <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
            {blockedUrl ? (
              <Button asChild variant="secondary" className="w-full">
                <a href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => { setBlockedUrl(undefined); setError(undefined); logHandoff.mutate(); }}>
                  <ExternalLink /> Open WhatsApp in a new tab
                </a>
              </Button>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{logFailed ? "Close without saving" : "Cancel"}</Button>
            {logFailed ? (
              <Button type="button" loading={logHandoff.isPending} onClick={() => { setError(undefined); logHandoff.mutate(); }}>Try again</Button>
            ) : blockedUrl ? null : (
              <Button type="button" loading={logHandoff.isPending} disabled={!message.trim()} onClick={launch}><Send /> Open WhatsApp</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
