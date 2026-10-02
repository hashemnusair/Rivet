"use client";

import { ExternalLink, MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useLocale } from "@/lib/i18n/provider";
import type { PreferredLanguage } from "@/lib/domain/types";
import { buildWhatsAppUrl, DEFAULT_PHONE_COUNTRY_CALLING_CODE } from "@/lib/utils/contact";
import { addDays, localDateTimeToISO, todayISODate } from "@/lib/utils/dates";
import { followUpHandoffDraft } from "../../../convex/followupAssist";

interface WhatsAppHandoffProps {
  subject: "lead" | "member";
  subjectId: string;
  recipientName: string;
  recipientPreferredLanguage?: PreferredLanguage;
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
  recipientPreferredLanguage,
  phone,
  organizationName,
  defaultCountryCallingCode,
  initialMessage,
  buttonLabel,
  onLogged,
  className,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: WhatsAppHandoffProps) {
  const { session } = useApp();
  const { t, isolate, isolateLtr } = useLocale();
  const invalidate = useInvalidate();
  const gymName = organizationName ?? session?.organization.name ?? "RIVET";
  const callingCode = defaultCountryCallingCode ?? session?.organization.phoneCountryCallingCode ?? DEFAULT_PHONE_COUNTRY_CALLING_CODE;
  const preparedMessage = initialMessage?.trim() || followUpHandoffDraft(
    { fullName: recipientName, preferredLanguage: recipientPreferredLanguage },
    gymName,
    session?.organization.defaultLanguage,
  ).text;
  const preparedMessageRef = useRef(preparedMessage);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [message, setMessage] = useState(preparedMessage);
  const [messageEdited, setMessageEdited] = useState(false);
  const [nextFollowUp, setNextFollowUp] = useState(() => addDays(todayISODate(session?.organization.timezone), 1));
  const [error, setError] = useState<string>();
  /** Set when the browser refused the popup: the person opens the link by hand and that click is what gets logged. */
  const [blockedUrl, setBlockedUrl] = useState<string>();
  const [logFailed, setLogFailed] = useState(false);

  useEffect(() => { preparedMessageRef.current = preparedMessage; }, [preparedMessage]);

  useEffect(() => {
    if (!open) return;
    setMessage(preparedMessageRef.current);
    setMessageEdited(false);
    setNextFollowUp(addDays(todayISODate(session?.organization.timezone), 1));
    setError(undefined);
    setBlockedUrl(undefined);
    setLogFailed(false);
  }, [open, subjectId, session?.organization.timezone]);

  useEffect(() => {
    if (open && !messageEdited) setMessage(preparedMessage);
  }, [open, messageEdited, preparedMessage]);

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
        toast.success(t("memberProfile.whatsapp.logged"));
        setOpen(false);
        await invalidate();
        onLogged?.();
      },
      // Keep the dialog, the message and the date: nothing is lost on a failed log.
      onError: () => {
        setLogFailed(true);
        setError(t("memberProfile.whatsapp.logFailed"));
      },
    },
  );

  const launch = () => {
    const url = buildWhatsAppUrl({ phone, message, defaultCountryCallingCode: callingCode });
    if (!url) {
      setError(t("memberProfile.whatsapp.numberCannotOpen", { example: isolateLtr("+962") }));
      return;
    }
    const handoff = window.open(url, "_blank", "noopener,noreferrer");
    if (!handoff) {
      // Nothing opened, so nothing is logged: a blocked popup is not a contact.
      setBlockedUrl(url);
      setError(t("memberProfile.whatsapp.popupBlocked"));
      return;
    }
    handoff.opener = null;
    logHandoff.mutate();
  };

  return (
    <>
      {hideTrigger ? null : (
        <Button type="button" variant="secondary" size="sm" className={className} onClick={() => setOpen(true)}>
          <MessageCircle /> {buttonLabel ?? t("domain.leadSource.whatsapp")}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("memberProfile.whatsapp.title", { name: isolate(recipientName) })}</DialogTitle>
            <DialogDescription>{t("memberProfile.whatsapp.description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5">
              <p className="context-label">{t("memberProfile.whatsapp.phoneNumber")}</p>
              <p className="mt-1 font-mono text-[13px]" dir="ltr">{phone}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("memberProfile.whatsapp.countryCodeHelp", { code: isolateLtr(`+${callingCode}`) })}</p>
            </div>
            <Field label={t("memberProfile.whatsapp.message")} required>
              <Textarea rows={5} dir="auto" value={message} onChange={(event) => { setMessage(event.target.value); setMessageEdited(true); }} aria-label={t("memberProfile.whatsapp.messageAria")} disabled={logFailed || Boolean(blockedUrl)} />
            </Field>
            <Field label={t("memberProfile.whatsapp.followUpOn")} hint={t("memberProfile.whatsapp.followUpHint")}>
              <Input type="date" value={nextFollowUp} onChange={(event) => setNextFollowUp(event.target.value)} aria-label={t("memberProfile.whatsapp.followUpAria")} dir="ltr" disabled={logFailed} />
            </Field>
            {error ? <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
            {blockedUrl ? (
              <Button asChild variant="secondary" className="w-full">
                <a href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={() => { setBlockedUrl(undefined); setError(undefined); logHandoff.mutate(); }}>
                  <ExternalLink /> {t("memberProfile.whatsapp.openInNewTab")}
                </a>
              </Button>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{logFailed ? t("memberProfile.whatsapp.closeWithoutSaving") : t("common.action.cancel")}</Button>
            {logFailed ? (
              <Button type="button" loading={logHandoff.isPending} onClick={() => { setError(undefined); logHandoff.mutate(); }}>{t("common.action.retry")}</Button>
            ) : blockedUrl ? null : (
              <Button type="button" loading={logHandoff.isPending} disabled={!message.trim()} onClick={launch}><Send className="rtl:-scale-x-100" /> {t("memberProfile.whatsapp.open")}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
