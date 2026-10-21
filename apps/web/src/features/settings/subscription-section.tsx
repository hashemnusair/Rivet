"use client";
import { useLocale } from "@/lib/i18n/provider";

import { AddOnSummary } from "@/features/subscriptions/add-on-controls";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, FileText, Receipt } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { feeLabel, findPlan, termPriceMinor } from "../../../convex/planCatalogue";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { cn } from "@/lib/utils/cn";
import { ChangePlanDialog } from "@/features/billing/change-plan-dialog";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { useFormat } from "@/lib/i18n/format";
import { money } from "@/lib/utils/money";
import { formatBillingDate } from "@/lib/platform/subscription-billing";
import { invoicePdfIntent, openInvoicePdf, usePaymentDetailsLoader } from "@/features/billing/invoice-pdf";
import { SettingsPanel, SettingsSection } from "@/features/settings/settings-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** The plan this gym is on, what it costs, when it renews, and the way to a bigger plan. */
function SubscriptionSummary() {
  const { t, locale, isolate } = useLocale();
  const PLAN_STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
    trial: { label: t("settingsDetails.text124"), variant: "neutral" },
    active: { label: t("settingsCore.text001"), variant: "success" },
    past_due: { label: t("settingsDetails.text121"), variant: "danger" },
    suspended: { label: t("settingsDetails.text126"), variant: "danger" },
    cancelled: { label: t("settingsDetails.text123"), variant: "neutral" },
  };

  const { session } = useApp();
  const { saasPlans } = useExperience();
  const f = useFormat(session?.organization.timezone);
  const searchParams = useSearchParams();
  const plansQuery = useApiQuery(qk.billingPlans, (api) => api.getBillingPlans());
  const plans = plansQuery.data;
  const [changeOpen, setChangeOpen] = useState(false);
  // The Support page's "Change plan" lands here with ?change=plan.
  const changeRequested = searchParams.get("change") === "plan";
  useEffect(() => {
    if (changeRequested && plans && !plans.blockedReason && !plans.pending) setChangeOpen(true);
  }, [changeRequested, plans]);
  const subscription = session?.organization?.subscription;
  if (!subscription) return null;
  const status = PLAN_STATUS[subscription.status] ?? { label: subscription.status, variant: "neutral" as const };
  // Gym users read only the safe public plan projection. Fall back to the
  // shared launch catalogue until that projection has loaded or for legacy
  // plan names; never request the platform-admin plan editor here.
  const plan = subscription.effectivePlan ?? saasPlans.find((candidate) => candidate.name === subscription.plan) ?? findPlan(subscription.plan);
  const cadence = subscription.billingInterval ?? "monthly";
  const term = subscription.status === "trial" ? subscription.trialEndsAt : subscription.currentPeriodEndsAt;
  const termDate = term ? (locale === "en" ? formatBillingDate(new Date(term)) : f.date(term)) : undefined;
  // The server prices the gym's own plan (an Enterprise gym's quote); the
  // public catalogue stands in until that answer arrives.
  const monthlyPriceMinor = plans?.monthlyPriceMinor ?? (subscription.plan === "Enterprise" ? undefined : plan?.priceMinor);
  const fee = monthlyPriceMinor !== undefined
    ? t("settingsDetails.feeWithTax", { fee: locale === "en" ? feeLabel(monthlyPriceMinor, cadence) : t(cadence === "annual" ? "settingsDetails.annualFee" : "settingsDetails.monthlyFee", { amount: f.money(money(termPriceMinor(monthlyPriceMinor, cadence), "JOD")) }) })
    : subscription.plan === "Enterprise"
      ? t("publicCompletion.landing.pricing.customQuote")
      : undefined;
  const when = !termDate
    ? undefined
    : subscription.status === "trial"
      ? `${t("settingsDetails.text132")} ${termDate}`
      : subscription.status === "active"
        ? t("commerce.plans.renews", { date: termDate })
        : `${t("settingsDetails.text133")} ${termDate}`;
  const pending = plans?.pending;
  const canChange = Boolean(plans && !plans.blockedReason && !pending);
  return (
    <SettingsPanel title={t("settingsDetails.text134")} control={<Badge variant={status.variant} dot>{status.label}</Badge>} ariaLabel={t("settingsDetails.text135")} testId="subscription-summary">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[24px] font-semibold leading-tight tracking-[-0.01em]"><bdi>{subscription.plan ?? "—"}</bdi></p>
          <p className="mt-1 text-[13px] text-ink-2">{[fee, when].filter(Boolean).map((part) => isolate(part!)).join(" · ")}</p>
        </div>
        {canChange ? <Button variant="secondary" onClick={() => setChangeOpen(true)} data-testid="change-plan"><ArrowUpRight className="rtl:-scale-x-100" aria-hidden />{t("commerce.plans.change")}</Button> : null}
      </div>
      {subscription.plan === "Basic" ? <div className="mt-4"><h3 className="mb-2 text-[13px] font-medium">{t("platformFinance.addOns.included")}</h3><AddOnSummary value={subscription.addOns} /></div> : null}
      {pending ? <PendingUpgrade invoice={pending} /> : null}
      {plans?.blockedReason === "not_active" ? <p className="mt-4 rounded-md border border-line bg-sunken/50 px-3.5 py-2.5 text-[13px] text-ink-2">{t("commerce.plans.notActive")}</p> : null}
      <p className="mt-4 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text136")}</p>
      {plans && canChange ? <ChangePlanDialog open={changeOpen} onOpenChange={setChangeOpen} plans={plans} /> : null}
    </SettingsPanel>
  );
}

/** An upgrade the gym asked for: what is left to do, or that RIVET is checking the payment. */
function PendingUpgrade({ invoice }: { invoice: PlatformBillingInvoice }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const queryClient = useQueryClient();
  const claim = invoice.paymentClaim;
  const sent = claim?.status === "submitted";
  const returned = claim?.status === "rejected";
  const plan = invoice.planChange?.to ?? "";
  const cancel = useApiMutation((api) => api.cancelPlanChange({ invoiceId: invoice.id }), {
    successMessage: t("commerce.plans.cancelled"),
    onSuccess: (next) => {
      queryClient.setQueryData(qk.billingPlans, next);
      void queryClient.invalidateQueries({ queryKey: qk.billingCheckout });
      void queryClient.invalidateQueries({ queryKey: qk.myPlatformInvoices });
    },
  });
  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3", returned ? "border-danger/30 bg-danger-bg" : "border-warning/30 bg-warning-bg")} data-testid="pending-upgrade">
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold">{t("commerce.plans.pendingTitle", { plan: isolate(plan) })}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">{sent ? t("commerce.plans.pendingSent") : returned ? t("commerce.plans.pendingReturned") : t("commerce.plans.pendingPay", { amount: isolateLtr(f.money({ amount: invoice.amountMinor ?? 0, currency: invoice.currency ?? "JOD" })) })}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {sent ? (
          invoice.supportCaseId ? <Button asChild size="sm" variant="secondary"><Link href={`/support?case=${encodeURIComponent(invoice.supportCaseId)}`}>{t("commerce.plans.seeRequest")}</Link></Button> : null
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} loading={cancel.isPending}>{t("commerce.plans.cancel")}</Button>
            <Button asChild size="sm"><Link href="/billing">{returned ? t("commerce.checkout.form.update") : t("commerce.plans.payNow")}</Link></Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Settings → Subscription: the plan this gym is on, and every RIVET invoice with its PDF. */
export function SubscriptionSection() {
  const { t, locale } = useLocale();
  const STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  open: { label: t("settingsDetails.text119"), variant: "warning" },
  paid: { label: t("settingsDetails.text120"), variant: "success" },
  past_due: { label: t("settingsDetails.text121"), variant: "danger" },
  failed: { label: t("settingsDetails.text122"), variant: "danger" },
  void: { label: t("settingsDetails.text123"), variant: "neutral" },
  trial: { label: t("settingsDetails.text124"), variant: "neutral" },
  draft: { label: t("settingsDetails.text125"), variant: "neutral" },
};

  const DESCRIPTION = t("settingsDetails.text127");

  const { session } = useApp();
  const f = useFormat(session?.organization.timezone);
  const query = useApiQuery(qk.myPlatformInvoices, (api) => api.listMyPlatformInvoices());
  const paymentDetails = usePaymentDetailsLoader("gym");
  if (query.isLoading) {
    return (
      <SettingsSection title={t("settingsCore.text183")} description={DESCRIPTION}>
        <Skeleton className="h-48 w-full" />
      </SettingsSection>
    );
  }
  if (query.isError || !query.data) {
    return (
      <SettingsSection title={t("settingsCore.text183")} description={DESCRIPTION}>
        <SubscriptionSummary />
        <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SettingsSection>
    );
  }
  const invoices = query.data;
  const customer = { name: session?.organization?.name ?? invoices[0]?.gym ?? "", contactName: session?.user.name ? t("settingsDetails.ownerContact", { name: session.user.name }) : undefined, contactEmail: session?.user.email };
  return (
    <SettingsSection title={t("settingsCore.text183")} description={DESCRIPTION} testId={invoices.length ? "subscription-invoices" : undefined}>
      <SubscriptionSummary />
      {invoices.some((invoice) => ["open", "past_due", "failed"].includes(invoice.status) && !invoice.planChange) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-bg px-4 py-3">
          <p className="text-[13.5px] font-medium">{t("commerce.settings.unpaid")}</p>
          <Button asChild size="sm"><Link href="/billing">{t("commerce.notice.pay")}</Link></Button>
        </div>
      ) : null}
      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} layout="section" title={t("settingsDetails.text137")} description={t("settingsDetails.text138")} />
      ) : (
        <SettingsPanel title={t("settingsDetails.text139")} description={t("settingsDetails.text140")} bodyClassName="p-0">
          <ul className="divide-y divide-line md:hidden" aria-label={t("settingsDetails.text139")}>
            {invoices.map((invoice) => {
              const status = STATUS[invoice.status] ?? { label: invoice.status, variant: "neutral" as const };
              return (
                <li key={invoice.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[12px]" dir="ltr">{invoice.id}</span>
                      <Badge variant={status.variant} dot>{status.label}</Badge>
                    </div>
                    <p className="mt-1 text-[12.5px] text-ink-2"><span className="font-semibold tabular text-ink">{invoice.amountMinor === undefined ? invoice.amount : f.money(money(invoice.amountMinor, invoice.currency ?? "JOD"))}</span> {" "}{t("settingsDetails.text141")}{" "}<span dir="ltr">{invoice.issuedAt ? f.date(invoice.issuedAt) : invoice.date}</span>{invoice.dueAt ? <> {" "}{t("settingsDetails.text142")}{" "}<span dir="ltr">{f.date(invoice.dueAt)}</span></> : null}</p>
                  </div>
                  <Button size="sm" variant="secondary" {...invoicePdfIntent} onClick={() => openInvoicePdf(invoice, customer, { locale, timeZone: session?.organization.timezone }, paymentDetails)} aria-label={t("settingsDetails.viewInvoice", { number: invoice.id })} data-testid="view-invoice-pdf"><FileText /> PDF</Button>
                </li>
              );
            })}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("renewFlow.payment.invoice")}</TableHead>
                <TableHead>{t("settingsDetails.text143")}</TableHead>
                <TableHead>{t("settingsDetails.text144")}</TableHead>
                <TableHead className="text-end">{t("common.label.amount")}</TableHead>
                <TableHead>{t("common.label.status")}</TableHead>
                <TableHead className="text-end">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const status = STATUS[invoice.status] ?? { label: invoice.status, variant: "neutral" as const };
                return (
                  <TableRow key={invoice.id} data-testid="subscription-invoice-row">
                    <TableCell><span className="font-mono text-[12px]" dir="ltr">{invoice.id}</span></TableCell>
                    <TableCell>{invoice.issuedAt ? f.date(invoice.issuedAt) : invoice.date}</TableCell>
                    <TableCell>{invoice.dueAt ? f.date(invoice.dueAt) : "—"}</TableCell>
                    <TableCell className="text-end font-semibold tabular">{invoice.amountMinor === undefined ? invoice.amount : f.money(money(invoice.amountMinor, invoice.currency ?? "JOD"))}</TableCell>
                    <TableCell><Badge variant={status.variant} dot>{status.label}</Badge></TableCell>
                    <TableCell className="text-end"><Button size="xs" variant="secondary" {...invoicePdfIntent} onClick={() => openInvoicePdf(invoice, customer, { locale, timeZone: session?.organization.timezone }, paymentDetails)} aria-label={t("settingsDetails.viewInvoice", { number: invoice.id })} data-testid="view-invoice-pdf"><FileText /> {" "}{t("settingsDetails.text145")}</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SettingsPanel>
      )}
    </SettingsSection>
  );
}
