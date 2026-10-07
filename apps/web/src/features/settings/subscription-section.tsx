"use client";
import { useLocale } from "@/lib/i18n/provider";

import { FileText, Receipt } from "lucide-react";
import { feeLabel, findPlan, termPriceMinor } from "../../../convex/planCatalogue";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { useFormat } from "@/lib/i18n/format";
import { money } from "@/lib/utils/money";
import { formatBillingDate } from "@/lib/platform/subscription-billing";
import { openInvoicePdf } from "@/features/billing/invoice-pdf";
import { SettingsPanel, SettingsSection } from "@/features/settings/settings-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";




/** The plan this gym is on, what it costs, and when the paid term ends. */
function SubscriptionSummary() {
  const { t, locale } = useLocale();
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
  const subscription = session?.organization?.subscription;
  if (!subscription) return null;
  const status = PLAN_STATUS[subscription.status] ?? { label: subscription.status, variant: "neutral" as const };
  // Gym users read only the safe public plan projection. Fall back to the
  // shared launch catalogue until that projection has loaded or for legacy
  // plan names; never request the platform-admin plan editor here.
  const plan = saasPlans.find((candidate) => candidate.name === subscription.plan) ?? findPlan(subscription.plan);
  const cadence = subscription.billingInterval ?? "monthly";
  const term = subscription.status === "trial" ? subscription.trialEndsAt : subscription.currentPeriodEndsAt;
  const fee = subscription.plan === "Enterprise"
    ? t("publicCompletion.landing.pricing.customQuote")
    : plan
      ? t("settingsDetails.feeWithTax", { fee: locale === "en" ? feeLabel(plan.priceMinor, cadence) : t(cadence === "annual" ? "settingsDetails.annualFee" : "settingsDetails.monthlyFee", { amount: f.money(money(termPriceMinor(plan.priceMinor, cadence), "JOD")) }) })
      : undefined;
  const rows: Array<{ label: string; value: string }> = [
    { label: t("renewFlow.adjust.planChange.rowPlan"), value: subscription.plan ?? "—" },
    { label: t("settingsDetails.text128"), value: cadence === "annual" ? t("settingsDetails.text129") : t("settingsDetails.text130") },
    ...(fee ? [{ label: t("settingsDetails.text131"), value: fee }] : []),
    { label: subscription.status === "trial" ? t("settingsDetails.text132") : t("settingsDetails.text133"), value: term ? (locale === "en" ? formatBillingDate(new Date(term)) : f.date(term)) : "—" },
  ];
  return (
    <SettingsPanel title={t("settingsDetails.text134")} control={<Badge variant={status.variant} dot>{status.label}</Badge>} ariaLabel={t("settingsDetails.text135")} testId="subscription-summary">
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0 sm:last:border-b">
            <dt className="text-[12.5px] text-ink-3">{row.label}</dt>
            <dd className="text-end text-[13px] font-medium tabular">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text136")}</p>
    </SettingsPanel>
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
                  <Button size="sm" variant="secondary" onClick={() => openInvoicePdf(invoice, customer, { locale, timeZone: session?.organization.timezone })} aria-label={t("settingsDetails.viewInvoice", { number: invoice.id })} data-testid="view-invoice-pdf"><FileText /> PDF</Button>
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
                    <TableCell className="text-end"><Button size="xs" variant="secondary" onClick={() => openInvoicePdf(invoice, customer, { locale, timeZone: session?.organization.timezone })} aria-label={t("settingsDetails.viewInvoice", { number: invoice.id })} data-testid="view-invoice-pdf"><FileText /> {" "}{t("settingsDetails.text145")}</Button></TableCell>
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
