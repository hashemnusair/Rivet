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

const SUBSCRIPTION: Record<string, Presentation> = {
  active: { label: "Active", variant: "success" },
  trial: { label: "Trial", variant: "neutral" },
  overdue: { label: "Past due", variant: "warning" },
  past_due: { label: "Past due", variant: "warning" },
  suspended: { label: "Suspended", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION[status]?.label ?? humanize(status);
}

export function SubscriptionStatusBadge({ status, className, ...props }: { status: string; className?: string } & Omit<BadgeProps, "variant" | "children">) {
  const presentation = SUBSCRIPTION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className} {...props}>{presentation.label}</Badge>;
}

const APPLICATION: Record<GymApplicationStatus, Presentation> = {
  pending: { label: "Pending", variant: "warning" },
  under_review: { label: "Under review", variant: "neutral" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};

export function applicationStatusLabel(status: GymApplicationStatus): string {
  return APPLICATION[status]?.label ?? humanize(status);
}

export function ApplicationStatusBadge({ status, className }: { status: GymApplicationStatus; className?: string }) {
  const presentation = APPLICATION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
}

const NOTIFICATION: Record<GymApplicationNotificationStatus, Presentation> = {
  pending: { label: "Pending", variant: "neutral" },
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  not_configured: { label: "Not configured", variant: "outline" },
};

export function NotificationStatusBadge({ status, className }: { status: GymApplicationNotificationStatus; className?: string }) {
  const presentation = NOTIFICATION[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
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

/** Renewal-clock invoices read as "Upcoming" and "In grace" rather than raw ledger states. */
export function InvoiceStatusBadge({ status, renewal = false, className }: { status: PlatformBillingInvoice["status"]; renewal?: boolean; className?: string }) {
  const base = INVOICE[status] ?? { label: humanize(status), variant: "neutral" as const };
  const presentation = renewal && status === "open" ? { label: "Upcoming", variant: "neutral" as const } : renewal && status === "past_due" ? { label: "In grace", variant: "danger" as const } : base;
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
}

const SUPPORT_STATUS: Record<PlatformSupportCase["status"], Presentation> = {
  open: { label: "Open", variant: "neutral" },
  waiting: { label: "Waiting", variant: "warning" },
  resolved: { label: "Resolved", variant: "success" },
};

export function SupportStatusBadge({ status, className }: { status: PlatformSupportCase["status"]; className?: string }) {
  const presentation = SUPPORT_STATUS[status] ?? { label: humanize(status), variant: "neutral" as const };
  return <Badge variant={presentation.variant} className={className}>{presentation.label}</Badge>;
}

export function SupportPriorityBadge({ priority, className }: { priority: PlatformSupportCase["priority"]; className?: string }) {
  return priority === "urgent" ? <Badge variant="signal" className={className}>Urgent</Badge> : <Badge variant="outline" className={className}>Normal</Badge>;
}

function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
