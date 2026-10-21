"use client";

import { AlertTriangle, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { BillingNotice } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

function useNoticeCopy(notice: BillingNotice) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const amount = notice.amountMinor === undefined ? "" : isolateLtr(f.money({ amount: notice.amountMinor, currency: notice.currency ?? "JOD" }));
  const id = notice.invoiceId ? isolateLtr(notice.invoiceId) : "";
  const date = f.date(notice.accessEndsAt);
  if (notice.state === "payment_sent") return { title: t("commerce.notice.paymentSent.title"), body: t("commerce.notice.paymentSent.body", { id }) };
  if (notice.state === "last_day") {
    return { title: t("commerce.notice.lastDay.title"), body: notice.invoiceId ? t("commerce.notice.lastDay.body", { id, amount }) : t("commerce.notice.lastDay.bodyNoInvoice") };
  }
  return { title: t("commerce.notice.overdue.title"), body: notice.invoiceId ? t("commerce.notice.overdue.body", { id, amount, date }) : t("commerce.notice.overdue.bodyNoInvoice", { date }) };
}

/**
 * The workspace's billing warning. On the last day of a paid term with
 * nothing paid for the next one, and every day after it until RIVET has the
 * payment, the team sees why and the owner gets a way to pay. Earlier
 * reminders go by email, so a normal month shows nothing here.
 */
export function BillingNoticeBanner() {
  const { session } = useApp();
  const { t } = useLocale();
  const notice = session?.organization.subscription?.billingNotice;
  if (!session || !notice) return null;
  const canPay = session.roles[0] === "owner" || session.permissions.includes("settings.manage");
  return (
    <>
      <NoticeBar notice={notice} canPay={canPay} />
      {notice.state === "last_day" && canPay ? <LastDayPrompt notice={notice} /> : null}
      {notice.paymentReturned && notice.state !== "payment_sent" ? <span className="sr-only">{t("commerce.notice.returned")}</span> : null}
    </>
  );
}

function NoticeBar({ notice, canPay }: { notice: BillingNotice; canPay: boolean }) {
  const { t } = useLocale();
  const copy = useNoticeCopy(notice);
  const sent = notice.state === "payment_sent";
  const Icon = sent ? Clock : AlertTriangle;
  return (
    <div
      role={sent ? "status" : "alert"}
      data-testid="billing-notice"
      data-state={notice.state}
      className={cn(
        "border-b px-4 py-3 sm:px-6 lg:px-8",
        sent ? "border-line bg-sunken" : notice.state === "last_day" ? "border-warning/30 bg-warning-bg" : "border-danger/30 bg-danger-bg",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={cn("mt-0.5 size-4 shrink-0", sent ? "text-ink-3" : notice.state === "last_day" ? "text-warning" : "text-danger")} aria-hidden />
          <div className="min-w-0 text-[13.5px]">
            <p className="font-semibold">{copy.title}</p>
            <p className="mt-0.5 text-ink-2">{copy.body}</p>
            {notice.paymentReturned && !sent ? <p className="mt-0.5 text-ink-2">{t("commerce.notice.returned")}</p> : null}
          </div>
        </div>
        {sent ? null : canPay ? (
          <Button asChild size="sm" variant={notice.state === "last_day" ? "primary" : "danger"}>
            <Link href="/billing">{t("commerce.notice.pay")}</Link>
          </Button>
        ) : (
          <p className="text-[12.5px] text-ink-3">{t("commerce.notice.askOwner")}</p>
        )}
      </div>
    </div>
  );
}

/** Shown once a day per invoice, so the owner sees it without being trapped by it. */
function LastDayPrompt({ notice }: { notice: BillingNotice }) {
  const { t } = useLocale();
  const copy = useNoticeCopy(notice);
  const [open, setOpen] = useState(false);
  const key = `rivet.billing-last-day.${notice.invoiceId ?? "term"}.${notice.periodEndsAt.slice(0, 10)}`;
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(key)) return;
    } catch {
      // Storage can be unavailable; the banner still carries the warning.
    }
    setOpen(true);
  }, [key]);
  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(key, "1");
    } catch {
      // See above.
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogBody />
        <DialogFooter>
          <Button variant="secondary" onClick={close}>{t("commerce.notice.later")}</Button>
          <Button asChild onClick={close}>
            <Link href="/billing">{t("commerce.notice.pay")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
