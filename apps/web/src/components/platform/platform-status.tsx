"use client";

import { useT, type TFunction, type TKey } from "@/lib/i18n/provider";
import { createTranslator } from "@/lib/i18n/core";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { GymApplicationNotificationStatus, GymApplicationStatus, PlatformBillingInvoice, PlatformSupportCase } from "@/lib/api/GymOSApi";

/**
 * One administrative status language for the console. Every platform record
 * (tenant, application, invoice, support case, email) uses the same shape,
 * sentence-case labels, and the same four meanings: healthy, waiting,
 * blocked, or retired.
 */
type Variant = NonNullable<BadgeProps["variant"]>;
type Presentation = { label: string; variant: Variant };
const EN = createTranslator("en");

const SUBSCRIPTION_KEYS: Record<string, TKey> = {
  active: "platformConsole.status.subscription.active",
  trial: "platformConsole.status.subscription.trial",
  overdue: "platformConsole.status.subscription.pastDue",
  past_due: "platformConsole.status.subscription.pastDue",
  suspended: "platformConsole.status.subscription.suspended",
  cancelled: "platformConsole.status.subscription.cancelled",
};

const SUBSCRIPTION: Record<string, Presentation> = {
  active: { label: "Active", variant: "success" },
  trial: { label: "Trial", variant: "neutral" },
  overdue: { label: "Past due", variant: "warning" },
  past_due: { label: "Past due", variant: "warning" },
  suspended: { label: "Suspended", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function subscriptionStatusLabel(status: string, t: TFunction = EN): string {
  return subscriptionStatusLabelWith(status, t);
}

export function subscriptionStatusLabelWith(status: string, t: TFunction): string {
  const key = SUBSCRIPTION_KEYS[status];
  return key ? t(key) : humanize(status);
}

export function SubscriptionStatusBadge({ status, className, ...props }: { status: string; className?: string } & Omit<BadgeProps, "variant" | "children">) {
  const t = useT();
  const presentation = SUBSCRIPTION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className} {...props}>{subscriptionStatusLabelWith(status, t)}</Badge>;
}

const APPLICATION: Record<GymApplicationStatus, Presentation> = {
  pending: { label: "Pending", variant: "warning" },
  under_review: { label: "Under review", variant: "neutral" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};
const APPLICATION_KEYS: Record<GymApplicationStatus, TKey> = {
  pending: "platformConsole.status.application.pending",
  under_review: "platformConsole.status.application.underReview",
  approved: "platformConsole.status.application.approved",
  rejected: "platformConsole.status.application.rejected",
};

export function applicationStatusLabel(status: GymApplicationStatus, t: TFunction = EN): string {
  return applicationStatusLabelWith(status, t);
}

export function applicationStatusLabelWith(status: GymApplicationStatus, t: TFunction): string {
  return t(APPLICATION_KEYS[status]);
}

export function ApplicationStatusBadge({ status, className }: { status: GymApplicationStatus; className?: string }) {
  const t = useT();
  const presentation = APPLICATION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{applicationStatusLabelWith(status, t)}</Badge>;
}

const NOTIFICATION: Record<GymApplicationNotificationStatus, Presentation> = {
  pending: { label: "Pending", variant: "neutral" },
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  not_configured: { label: "Not configured", variant: "outline" },
};
const NOTIFICATION_KEYS: Record<GymApplicationNotificationStatus, TKey> = {
  pending: "platformConsole.status.notification.pending",
  sent: "platformConsole.status.notification.sent",
  failed: "platformConsole.status.notification.failed",
  not_configured: "platformConsole.status.notification.notConfigured",
};

export function NotificationStatusBadge({ status, className }: { status: GymApplicationNotificationStatus; className?: string }) {
  const t = useT();
  const presentation = NOTIFICATION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{t(NOTIFICATION_KEYS[status])}</Badge>;
}

const INVOICE: Record<PlatformBillingInvoice["status"], Presentation> = {
  draft: { label: "Draft", variant: "outline" },
  open: { label: "Open", variant: "neutral" },
  paid: { label: "Paid", variant: "success" },
  past_due: { label: "Past due", variant: "danger" },
  failed: { label: "Failed", variant: "danger" },
  void: { label: "Void", variant: "outline" },
  trial: { label: "Trial", variant: "neutral" },
};
const INVOICE_KEYS: Record<PlatformBillingInvoice["status"], TKey> = {
  draft: "platformConsole.status.invoice.draft",
  open: "platformConsole.status.invoice.open",
  paid: "platformConsole.status.invoice.paid",
  past_due: "platformConsole.status.invoice.pastDue",
  failed: "platformConsole.status.invoice.failed",
  void: "platformConsole.status.invoice.void",
  trial: "platformConsole.status.invoice.trial",
};

/** Renewal-clock invoices read as "Upcoming" and "In grace" rather than raw ledger states. */
export function InvoiceStatusBadge({ status, renewal = false, className }: { status: PlatformBillingInvoice["status"]; renewal?: boolean; className?: string }) {
  const t = useT();
  const base = INVOICE[status] ?? { label: humanize(status), variant: "neutral" as const };
  const presentation = { label: invoiceStatusLabel(status, t, renewal), variant: invoiceVariant(status, renewal, base.variant) };
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
}

export function invoiceStatusLabel(status: PlatformBillingInvoice["status"], t: TFunction = EN, renewal = false): string {
  if (renewal && status === "open") return t("platformConsole.status.invoice.upcoming");
  if (renewal && status === "past_due") return t("platformConsole.status.invoice.inGrace");
  return t(INVOICE_KEYS[status]);
}

function invoiceVariant(status: PlatformBillingInvoice["status"], renewal: boolean, fallback: Variant): Variant {
  if (renewal && status === "past_due") return "danger";
  return fallback;
}

const SUPPORT_STATUS: Record<PlatformSupportCase["status"], Presentation> = {
  open: { label: "Open", variant: "neutral" },
  waiting: { label: "Waiting", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
};
const SUPPORT_STATUS_KEYS: Record<PlatformSupportCase["status"], TKey> = {
  open: "platformConsole.status.support.open",
  waiting: "platformConsole.status.support.waiting",
  resolved: "platformConsole.status.support.resolved",
};

export function SupportStatusBadge({ status, className }: { status: PlatformSupportCase["status"]; className?: string }) {
  const t = useT();
  const presentation = SUPPORT_STATUS[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{supportStatusLabel(status, t)}</Badge>;
}

export function supportStatusLabel(status: PlatformSupportCase["status"], t: TFunction = EN): string {
  return t(SUPPORT_STATUS_KEYS[status]);
}

export function SupportPriorityBadge({ priority, className }: { priority: PlatformSupportCase["priority"]; className?: string }) {
  const t = useT();
  return priority === "urgent"
    ? <Badge variant="signal" className={className}>{t("platformConsole.status.priority.urgent")}</Badge>
    : <Badge variant="outline" className={className}>{t("platformConsole.status.priority.normal")}</Badge>;
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
