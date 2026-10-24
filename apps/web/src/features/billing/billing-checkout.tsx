"use client";

import { useClerk } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RestrictedAccessNav } from "./restricted-access-nav";
import { useEffect, useState } from "react";
import { InvoiceLines } from "@/features/billing/invoice-lines";
import { PaymentProgress, type PaymentOutcome } from "@/features/billing/payment-progress";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/misc";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { LanguageButton } from "@/components/shared/language-switch";
import type { BillingCheckout, PlatformPaymentMethod, SubmitPlatformPaymentInput } from "@/lib/api/GymOSApi";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { loginHref } from "@/lib/routing/host-routing";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { cn } from "@/lib/utils/cn";
import { paymentNoteReference } from "../../../convex/firstPayment";

const SALES_EMAIL = "sales@rivetjo.com";

/** Today on the gym's calendar, YYYY-MM-DD, for the latest date a payment can be. */
function localToday(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * The gym's payment page. A gym waiting for its first payment, or stopped for
 * an unpaid invoice, can open this page and nothing else; a paying gym comes
 * here from its renewal warning. The gym pays by CliQ or bank transfer
 * outside RIVET, then sends the details here for RIVET's team to confirm.
 */
export function BillingCheckoutPage() {
  const router = useRouter();
  const { t } = useLocale();
  const identity = useRivetIdentity();
  const { signedIn, sessionLoading } = useApp();
  const destination = identity.status === "ready" ? destinationFor(identity) : undefined;
  // Previews and tests run on seeded personas instead of a real account.
  const demo = identity.status === "demo";
  const allowed = demo ? signedIn : destination?.area === "billing" || destination?.area === "gym";

  useEffect(() => {
    if (demo) {
      if (!sessionLoading && !signedIn) router.replace("/login/gym");
      return;
    }
    if (identity.status === "anonymous" || identity.status === "error") router.replace(loginHref("/billing"));
    else if (destination && destination.area !== "billing" && destination.area !== "gym") router.replace(destination.href);
  }, [demo, destination, identity.status, router, sessionLoading, signedIn]);

  const params = useSearchParams();
  const gyms = [...identity.memberships, ...(identity.billingAccess ?? [])];
  const requestedGym = params.get("organizationId");
  const organizationId = gyms.find(gym => gym.organizationId === requestedGym)?.organizationId ?? (!requestedGym && gyms.length === 1 ? gyms[0]!.organizationId : undefined);
  const fullAccess = demo ? signedIn : destination?.area === "gym";
  const selectedWorkspaceAccess = fullAccess && (demo || !organizationId || identity.memberships.some(gym => gym.organizationId === organizationId));
  const selectionRequired = Boolean((gyms.length || requestedGym) && !organizationId);
  const query = useApiQuery(organizationId ? [...qk.billingCheckout, organizationId] : qk.billingCheckout, (api) => api.getBillingCheckout(organizationId), { enabled: allowed && !selectionRequired });

  return (
    <div className="min-h-screen bg-paper text-ink">
      <BillingHeader gymName={query.data?.gym.name} fullAccess={fullAccess} />
      <RestrictedAccessNav />
      <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-8 sm:px-6 lg:pt-12">
        {allowed && selectionRequired ? <div className="grid gap-3"><h1>{t("commerce.checkout.chooseBillingGym")}</h1>{gyms.map(gym => <Link className="underline" key={gym.organizationId} href={`/billing?organizationId=${encodeURIComponent(gym.organizationId)}`}>{gym.organizationName}</Link>)}</div> : allowed ? <BillingCheckoutContent key={organizationId} organizationId={organizationId} fullAccess={selectedWorkspaceAccess} /> : <CheckoutLoading />}
      </main>
    </div>
  );
}

export function CheckoutLoading() {
  const { t } = useLocale();
  return (
    <div role="status" aria-label={t("commerce.checkout.loading")} className="grid gap-4">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <Skeleton className="mt-6 h-72 w-full" />
    </div>
  );
}

/** The payment page's content for a signed-in gym: the invoice and how to pay it. */
export function BillingCheckoutContent({ fullAccess, organizationId }: { fullAccess: boolean; organizationId?: string }) {
  const query = useApiQuery(organizationId ? [...qk.billingCheckout, organizationId] : qk.billingCheckout, (api) => api.getBillingCheckout(organizationId));
  if (query.isLoading) return <CheckoutLoading />;
  if (query.isError || !query.data) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <Checkout checkout={query.data} fullAccess={fullAccess} />;
}

function BillingHeader({ gymName, fullAccess }: { gymName?: string; fullAccess: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const { signOut } = useApp();
  const { signOut: signOutClerk } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const leave = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (!DEMO_AUTH_BYPASS) await signOutClerk({ redirectUrl: "/login" });
      await signOut();
      router.replace("/login");
    } catch {
      setSigningOut(false);
    }
  };
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-16 w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:flex-nowrap sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/brand/rivet-lockup-488.png" width={110} height={28} alt={t("common.brand.name")} className="dark:hidden" />
          <Image src="/brand/rivet-lockup-rev-488.png" width={110} height={28} alt={t("common.brand.name")} className="hidden dark:block" />
          {gymName ? <span className="truncate border-s border-line ps-3 text-[13px] font-medium text-ink-2" dir="auto">{gymName}</span> : null}
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <LanguageButton />
          {fullAccess ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard"><ArrowLeft className="rtl:rotate-180" aria-hidden />{t("commerce.checkout.backToDashboard")}</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void leave()} loading={signingOut}>
            <LogOut aria-hidden />{t("commerce.checkout.signOut")}
          </Button>
        </div>
      </div>
    </header>
  );
}

function Checkout({ checkout, fullAccess }: { checkout: BillingCheckout; fullAccess: boolean }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const { gym, invoice } = checkout;
  const upgradeTo = invoice?.planChange?.to;
  const kind = upgradeTo ? "upgrade" : gym.status === "pending_payment" ? "pending" : gym.status === "suspended" ? "suspended" : "renewal";
  const cadence = t(gym.billingInterval === "annual" ? "commerce.lines.year" : "commerce.lines.month");
  const outcome: PaymentOutcome = upgradeTo ? { kind: "upgrade", plan: upgradeTo } : kind === "pending" ? { kind: "workspace" } : { kind: "paid" };

  if (!invoice) {
    return (
      <StatePanel
        title={t("commerce.checkout.nothingToPay.title")}
        description={t("commerce.checkout.nothingToPay.body")}
        action={fullAccess ? <Button asChild variant="secondary"><Link href="/dashboard">{t("commerce.checkout.backToDashboard")}</Link></Button> : undefined}
      />
    );
  }

  const claim = invoice.paymentClaim;
  return (
    <div>
      <h1 className="max-w-2xl text-[clamp(1.7rem,3.4vw,2.4rem)] font-semibold leading-tight tracking-[-0.02em]">{t(`commerce.checkout.title.${kind}`, { plan: isolate(upgradeTo ?? "") })}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">{t(`commerce.checkout.intro.${kind}`)}</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-8">
          {claim?.status === "submitted" ? (
            <ClaimSent checkout={checkout} outcome={outcome} fullAccess={fullAccess} />
          ) : !checkout.canPay ? (
            <StatePanel title={t("commerce.checkout.ownerOnly.title")} description={t("commerce.checkout.ownerOnly.body")} />
          ) : (
            <>
              {claim?.status === "rejected" ? (
                <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-4 py-3 text-[13.5px]">
                  <p className="font-semibold text-danger">{t("commerce.checkout.rejected.title")}</p>
                  <p className="mt-1 text-ink-2">{t("commerce.checkout.rejected.body", { reason: claim.rejectionReason ?? "" })}</p>
                </div>
              ) : null}
              {upgradeTo ? <RefreshUpgradeQuote plan={upgradeTo} organizationId={checkout.gym.id} /> : null}
              <PaymentInstructions checkout={checkout} />
              <ClaimForm checkout={checkout} />
            </>
          )}
        </div>

        <aside aria-labelledby="invoice-title" className="rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-6">
          <h2 id="invoice-title" className="text-[15px] font-semibold">{t("commerce.checkout.invoiceTitle", { id: isolateLtr(paymentNoteReference(invoice.id)) })}</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">{t("commerce.checkout.due", { date: f.date(invoice.dueAt) })}</p>
          {upgradeTo && invoice.quoteValidUntil && claim?.status !== "submitted" ? <p className="mt-1 text-[12.5px] text-ink-3">{t("commerce.checkout.quoteValidUntil", { date: f.dateTime(invoice.quoteValidUntil) })}</p> : null}
          <InvoiceLines invoice={invoice} plan={upgradeTo ?? gym.plan} className="mt-4" />
          {invoice.firstPayment ? <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">{t("commerce.checkout.firstTerm", { cadence })}</p> : null}
          {upgradeTo ? <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">{t("commerce.checkout.upgradeTerm", { plan: isolate(upgradeTo) })}</p> : null}
          {upgradeTo && (invoice.creditMinor ?? 0) > 0 ? <p className="mt-4 text-[12.5px] leading-relaxed text-ink-3">{t("commerce.checkout.creditTiming")}</p> : null}
          {checkout.accessEndsAt ? <p className="mt-4 text-[12.5px] leading-relaxed text-warning-deep">{t("commerce.checkout.accessEnds", { date: f.date(checkout.accessEndsAt) })}</p> : null}
        </aside>
      </div>
    </div>
  );
}

function RefreshUpgradeQuote({ plan, organizationId }: { organizationId?: string; plan: NonNullable<NonNullable<BillingCheckout["invoice"]>["planChange"]>["to"] }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const refresh = useApiMutation((api) => api.requestPlanChange({ plan, organizationId }), {
    onSuccess: async checkout => {
      client.setQueryData(checkout.gym.id ? [...qk.billingCheckout, checkout.gym.id] : qk.billingCheckout, checkout);
      await client.invalidateQueries({ queryKey: qk.billingCheckout });
      await client.invalidateQueries({ queryKey: qk.billingPlans });
      await client.invalidateQueries({ queryKey: qk.myPlatformInvoices });
    },
  });
  return <Button variant="secondary" onClick={() => refresh.mutate(undefined)} loading={refresh.isPending}>{t("commerce.checkout.refreshUpgrade")}</Button>;
}

function StepHeading({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-[17px] font-semibold tracking-tight">
      <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-paper">{number}</span>
      {children}
    </h2>
  );
}

function CopyRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <dt className="text-[12px] text-ink-3">{label}</dt>
        <dd className={cn("mt-0.5 break-all text-[14px] font-medium", ltr && "tabular")} dir={ltr ? "ltr" : "auto"}>{value}</dd>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => void copy()} aria-label={t("commerce.checkout.copy", { label })}>
        {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
        <span className="sr-only" aria-live="polite">{copied ? t("commerce.checkout.copied") : ""}</span>
      </Button>
    </div>
  );
}

function PaymentInstructions({ checkout }: { checkout: BillingCheckout }) {
  const { t, isolateLtr } = useLocale();
  const details = checkout.paymentDetails;
  const hasCliq = Boolean(details.cliqAlias);
  const hasBank = Boolean(details.iban);
  return (
    <section aria-labelledby="pay-step-1">
      <StepHeading number={1}><span id="pay-step-1">{t("commerce.checkout.step1")}</span></StepHeading>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t("commerce.checkout.step1Body", { id: isolateLtr(paymentNoteReference(checkout.invoice?.id ?? "")) })}</p>
      {hasCliq || hasBank ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {hasCliq ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[14px] font-semibold">{t("commerce.checkout.cliq")}</h3>
              <dl className="mt-2 divide-y divide-line">
                <CopyRow label={t("commerce.checkout.cliqAlias")} value={details.cliqAlias} ltr />
                {details.cliqName ? <CopyRow label={t("commerce.checkout.cliqName")} value={details.cliqName} /> : null}
              </dl>
            </div>
          ) : null}
          {hasBank ? (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h3 className="text-[14px] font-semibold">{t("commerce.checkout.bank")}</h3>
              <dl className="mt-2 divide-y divide-line">
                {details.bankName ? <CopyRow label={t("commerce.checkout.bankName")} value={details.bankName} /> : null}
                {details.accountName ? <CopyRow label={t("commerce.checkout.accountName")} value={details.accountName} /> : null}
                <CopyRow label={t("commerce.checkout.iban")} value={details.iban} ltr />
              </dl>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-line bg-sunken px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
          {t("commerce.checkout.detailsMissing", { phone: isolateLtr(RIVET_CONTACT.phoneDisplay), email: isolateLtr(SALES_EMAIL) })}
        </p>
      )}
      {details.note ? <p className="mt-3 text-[13px] leading-relaxed text-ink-2" dir="auto">{details.note}</p> : null}
    </section>
  );
}

type FormErrors = Partial<Record<"method" | "reference" | "payerName" | "paidOn", string>>;

function ClaimForm({ checkout }: { checkout: BillingCheckout }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const invoice = checkout.invoice!;
  const previous = invoice.paymentClaim;
  const today = localToday(checkout.gym.timezone || "Asia/Amman");
  const [method, setMethod] = useState<PlatformPaymentMethod | "">(previous?.method ?? "");
  const [reference, setReference] = useState(previous?.reference ?? "");
  const [payerName, setPayerName] = useState(previous?.payerName ?? "");
  const [paidOn, setPaidOn] = useState(previous?.paidOn ?? today);
  const [note, setNote] = useState(previous?.note ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const mutation = useApiMutation((api, input: SubmitPlatformPaymentInput) => api.submitPlatformPayment(input), {
    successMessage: t("commerce.checkout.sentToast"),
    onSuccess: (next) => {
      queryClient.setQueryData(next.gym.id ? [...qk.billingCheckout, next.gym.id] : qk.billingCheckout, next);
      void queryClient.invalidateQueries({ queryKey: qk.billingCheckout });
      void queryClient.invalidateQueries({ queryKey: qk.myPlatformInvoices });
    },
    onError: (error) => {
      if (!isApiError(error) || !error.sourceFieldErrors) return;
      const fields = Object.keys(error.sourceFieldErrors) as Array<keyof FormErrors>;
      setErrors(Object.fromEntries(fields.filter((field) => ["method", "reference", "payerName", "paidOn"].includes(field)).map((field) => [field, t(`commerce.checkout.errors.${field}`)])));
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!method) next.method = t("commerce.checkout.errors.method");
    if (reference.trim().length < 3) next.reference = t("commerce.checkout.errors.reference");
    if (payerName.trim().length < 2) next.payerName = t("commerce.checkout.errors.payerName");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today) next.paidOn = t("commerce.checkout.errors.paidOn");
    setErrors(next);
    if (Object.keys(next).length > 0 || !method) return;
    mutation.mutate({ organizationId: checkout.gym.id, invoiceId: invoice.id, method, reference: reference.trim(), payerName: payerName.trim(), paidOn, ...(note.trim() ? { note: note.trim() } : {}) });
  };

  return (
    <section aria-labelledby="pay-step-2">
      <StepHeading number={2}><span id="pay-step-2">{t("commerce.checkout.step2")}</span></StepHeading>
      <form noValidate onSubmit={submit} className="mt-4 grid gap-5 rounded-lg border border-line bg-surface p-5">
        <Field label={t("commerce.checkout.form.method")} error={errors.method} required>
          <RadioGroup
            value={method}
            onValueChange={(value) => setMethod(value as PlatformPaymentMethod)}
            aria-label={t("commerce.checkout.form.method")}
            className="grid-cols-2"
          >
            {(["cliq", "bank_transfer"] as const).map((value) => (
              <RadioCard key={value} value={value} className="text-[14px] font-medium">
                {value === "cliq" ? t("commerce.checkout.cliq") : t("commerce.checkout.bank")}
              </RadioCard>
            ))}
          </RadioGroup>
        </Field>
        <Field label={t("commerce.checkout.form.reference")} hint={t("commerce.checkout.form.referenceHint")} error={errors.reference} required>
          <Input value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" dir="ltr" maxLength={80} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("commerce.checkout.form.payerName")} error={errors.payerName} required>
            <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} autoComplete="name" dir="auto" maxLength={120} />
          </Field>
          <Field label={t("commerce.checkout.form.paidOn")} error={errors.paidOn} required>
            <Input type="date" value={paidOn} max={today} onChange={(event) => setPaidOn(event.target.value)} />
          </Field>
        </div>
        <Field label={t("commerce.checkout.form.note")}>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={500} dir="auto" />
        </Field>
        <div>
          <Button type="submit" size="lg" loading={mutation.isPending}>
            {previous ? t("commerce.checkout.form.update") : t("commerce.checkout.form.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ClaimSent({ checkout, outcome, fullAccess }: { checkout: BillingCheckout; outcome: PaymentOutcome; fullAccess: boolean }) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const [requesting, setRequesting] = useState(false);
  const [reason, setReason] = useState("");
  const client = useQueryClient();
  const correction = useApiMutation((api) => api.requestPaymentCorrection({ invoiceId: checkout.invoice!.id, reason, organizationId: checkout.gym.id }), { onSuccess: async next => { client.setQueryData(checkout.gym.id ? [...qk.billingCheckout, checkout.gym.id] : qk.billingCheckout, next); await client.invalidateQueries({ queryKey: qk.billingCheckout }); } });
  const claim = checkout.invoice!.paymentClaim!;
  const supportCaseId = checkout.invoice?.supportCaseId;
  const requested = (checkout.invoice!.paymentCorrection?.claimSubmissionId ?? checkout.invoice!.paymentCorrection?.claimSubmittedAt) === (claim.submissionId ?? claim.submittedAt);
  return (
    <section role="status" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-[17px] font-semibold tracking-tight">{t("commerce.checkout.submitted.title")}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        {t("commerce.checkout.submitted.body", {
          amount: isolateLtr(f.money({ amount: claim.amountMinor, currency: checkout.invoice?.currency ?? "JOD" })),
          method: t(`commerce.methods.${claim.method}`),
          date: f.date(claim.paidOn),
          reference: isolateLtr(claim.reference),
        })}
      </p>
      <PaymentProgress className="mt-5" state="sent" outcome={outcome} />
      <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">{t(requested ? "commerce.checkout.submitted.correctionSent" : "commerce.checkout.submitted.correctionHelp")}</p>
      {requesting && !requested ? <form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); if (reason.trim()) correction.mutate(undefined); }}>
        <Field label={t("commerce.checkout.submitted.correctionReason")} required><Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required dir="auto" /></Field>
        <Button type="submit" loading={correction.isPending} disabled={!reason.trim()}>{t("commerce.checkout.submitted.correctionSubmit")}</Button>
      </form> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {supportCaseId && fullAccess ? <Button asChild variant="secondary" size="sm"><Link href={`/support?case=${encodeURIComponent(supportCaseId)}`}>{t("commerce.plans.seeRequest")}</Link></Button> : null}
        {checkout.canRequestCorrection && !requested ? <Button variant="ghost" size="sm" onClick={() => setRequesting(true)}>{t("commerce.checkout.submitted.correction")}</Button> : null}
      </div>
    </section>
  );
}
