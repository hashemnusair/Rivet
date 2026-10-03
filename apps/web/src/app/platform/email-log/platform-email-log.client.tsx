"use client";
import { useT, type TFunction, type TKey } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { MailX } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { PlatformEmailDelivery } from "@/lib/domain/types";
import { PageHeader } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel } from "@/components/platform/platform-page";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS: Record<PlatformEmailDelivery["status"], { labelKey: TKey; variant: "success" | "warning" | "danger" | "neutral" }> = {
  queued: { labelKey: "platformConsole.status.email.queued", variant: "neutral" },
  leased: { labelKey: "platformConsole.status.email.sending", variant: "neutral" },
  provider_accepted: { labelKey: "platformConsole.status.email.accepted", variant: "success" },
  delivered: { labelKey: "platformConsole.status.email.delivered", variant: "success" },
  retrying: { labelKey: "platformConsole.status.email.retrying", variant: "warning" },
  failed: { labelKey: "platformConsole.status.email.failed", variant: "danger" },
  suppressed: { labelKey: "platformConsole.status.email.notSent", variant: "neutral" },
};

const EMAIL_KIND_KEYS: Record<string, TKey> = {
  subscription_agreement_signed: "platformConsole.emailLog.kind.subscriptionAgreementSigned",
  subscription_agreement_countersigned: "platformConsole.emailLog.kind.subscriptionAgreementCountersigned",
  subscription_agreement_copy: "platformConsole.emailLog.kind.subscriptionAgreementCopy",
  trial_request_confirmation: "platformConsole.emailLog.kind.trialRequestConfirmation",
  trial_status: "platformConsole.emailLog.kind.trialStatus",
  payment_receipt: "platformConsole.emailLog.kind.paymentReceipt",
  renewal_reminder: "platformConsole.emailLog.kind.renewalReminder",
  membership_expiry: "platformConsole.emailLog.kind.membershipExpiry",
  support_acknowledgement: "platformConsole.emailLog.kind.supportAcknowledgement",
  support_reply: "platformConsole.emailLog.kind.supportReply",
  support_resolved: "platformConsole.emailLog.kind.supportResolved",
  platform_invoice_issued: "platformConsole.emailLog.kind.platformInvoiceIssued",
  platform_invoice_reminder: "platformConsole.emailLog.kind.platformInvoiceReminder",
  platform_invoice_paid: "platformConsole.emailLog.kind.platformInvoicePaid",
  platform_invoice_past_due: "platformConsole.emailLog.kind.platformInvoicePastDue",
  platform_subscription_suspended: "platformConsole.emailLog.kind.platformSubscriptionSuspended",
  platform_subscription_cancelled: "platformConsole.emailLog.kind.platformSubscriptionCancelled",
  pt_package_paid: "platformConsole.emailLog.kind.ptPackagePaid",
  pt_booking_confirmation: "platformConsole.emailLog.kind.ptBookingConfirmation",
  pt_booking_update: "platformConsole.emailLog.kind.ptBookingUpdate",
  pt_booking_reminder: "platformConsole.emailLog.kind.ptBookingReminder",
  pt_low_balance: "platformConsole.emailLog.kind.ptLowBalance",
};

function emailKindLabel(kind: string, t: TFunction): string {
  const key = EMAIL_KIND_KEYS[kind];
  return key ? t(key) : kind;
}

/** What happened to a message, in one line a person can act on. */
function outcome(delivery: PlatformEmailDelivery, t: TFunction): string {
  if (delivery.status === "suppressed") {
    if (delivery.suppressionReason === "Operational email mode is off (RIVET_EMAIL_MODE)") return t("platformConsole.emailLog.operationalEmailModeOff");
    return delivery.suppressionReason ?? t("platformConsole.emailLog.suppressed");
  }
  const last = delivery.attempts.at(-1);
  if (delivery.status === "failed" || delivery.status === "retrying") return `${last?.errorCode ?? delivery.lastErrorCode ?? t("platformConsole.emailLog.providerError")}${last?.statusCode ? ` (${t("platformConsole.emailLog.httpStatus", { status: last.statusCode })})` : ""}`;
  if (last?.deliveredTo && last.deliveredTo !== delivery.recipientEmail) return t("platformConsole.emailLog.redirected", { email: last.deliveredTo, mode: emailModeLabel(last.mode, t) });
  if (delivery.status === "queued") return t("platformConsole.emailLog.queuedOutcome");
  return last?.mode ? t("platformConsole.emailLog.sentMode", { mode: emailModeLabel(last.mode, t) }) : "";
}

function emailModeLabel(mode: string | undefined, t: TFunction): string {
  if (mode === "live") return t("platformConsole.emailLog.modeLive");
  if (mode === "sandbox") return t("platformConsole.emailLog.modeSandbox");
  if (mode === "allowlist") return t("platformConsole.emailLog.modeAllowlist");
  if (mode === "off") return t("platformConsole.emailLog.modeOff");
  return mode ?? "";
}

/**
 * Platform console: the last hundred operational emails and what became of
 * each one. Every suppression carries its reason and every provider failure
 * its code, so a missing message is explained here rather than guessed at.
 */
export function PlatformEmailLog() {
  const t = useT();
  const f = useFormat();
  const query = useApiQuery(qk.platformEmailDeliveries, (api) => api.listPlatformEmailDeliveries());
  if (query.isLoading) return <PlatformPage><div className="space-y-3" role="status" aria-label={t("platformConsole.emailLog.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div></PlatformPage>;
  if (query.isError || !query.data) return <PlatformPage><QueryErrorState error={query.error} onRetry={() => void query.refetch()} /></PlatformPage>;
  const rows = query.data;
  const sent = rows.filter((row) => row.status === "delivered" || row.status === "provider_accepted").length;
  return (
    <PlatformPage className="space-y-5" data-testid="platform-email-log">
      <PageHeader
        title={t("platformConsole.emailLog.title")}
        description={t("platformConsole.emailLog.description")}
        actions={<Badge variant={sent > 0 ? "success" : "neutral"} dot>{t("platformConsole.emailLog.sentCount", { count: sent, sent, total: rows.length })}</Badge>}
      />
      {rows.length === 0 ? <EmptyState layout="page" icon={MailX} title={t("platformConsole.emailLog.nothingQueued")} description={t("platformConsole.emailLog.emptyDescription")} /> : (
        <PlatformPanel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("platformConsole.emailLog.date")}</TableHead>
                <TableHead>{t("platformConsole.emailLog.subject")}</TableHead>
                <TableHead>{t("platformConsole.emailLog.recipient")}</TableHead>
                <TableHead>{t("platformConsole.emailLog.gym")}</TableHead>
                <TableHead>{t("platformConsole.emailLog.status")}</TableHead>
                <TableHead>{t("platformConsole.emailLog.outcome")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = STATUS[row.status];
                const attachments = row.attachments.length ? t("platformConsole.emailLog.attachments", { count: row.attachments.length }) : "";
                return (
                  <TableRow key={row.id} data-testid="email-log-row">
                    <TableCell className="whitespace-nowrap text-[12px] text-ink-3">{f.dateTime(row.createdAt)}</TableCell>
                    <TableCell><span className="block max-w-[320px] truncate text-[13px]" title={row.subject} dir="auto">{row.subject ?? emailKindLabel(row.kind, t)}</span><span className="block text-[11px] text-ink-3" dir="auto">{t("platformConsole.emailLog.kindAndAttachments", { kind: emailKindLabel(row.kind, t), attachments })}</span></TableCell>
                    <TableCell dir="ltr" className="text-[12.5px]">{row.recipientEmail ?? "—"}</TableCell>
                    <TableCell className="text-[12.5px]" dir="auto">{row.gym}</TableCell>
                    <TableCell><Badge variant={status.variant} dot>{t(status.labelKey)}</Badge></TableCell>
                    <TableCell className="max-w-[360px] text-[12px] text-ink-2" data-testid="email-log-outcome" dir="auto">{outcome(row, t)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </PlatformPanel>
      )}
    </PlatformPage>
  );
}
