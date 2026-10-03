"use client";
import { LanguageButton } from "@/components/shared/language-switch";
import { useT, useLocale } from "@/lib/i18n/provider";

import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileSignature, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { AgreementIdType, SignSubscriptionAgreementInput, SubscriptionAgreement, SubscriptionAgreementContext } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { latinDigits } from "@/lib/utils/text";
import { cn } from "@/lib/utils/cn";
import { AGREEMENT_COPY_RECIPIENTS, maskIdNumber, sha256Hex, validCalendarDate, validNationalId, validPassportNumber } from "../../../convex/legalAgreementText";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { AgreementText } from "./agreement-record";
import { downloadAgreementPdf } from "./agreement-pdf";
import { SignaturePad, type SignatureValue } from "./signature-pad";

type Step = "read" | "details" | "sign";
const STEPS: Array<{ key: Step; label: "read" | "details" | "sign" }> = [
  { key: "read", label: "read" },
  { key: "details", label: "details" },
  { key: "sign", label: "sign" },
];

/** Pixels from the bottom that still count as "reached the end". */
const END_TOLERANCE = 24;

function newIdempotencyKey() {
  return `agreement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Mounted by the app shell. While the session says the owner still owes a
 * signature, the modal covers the workspace and cannot be closed. After a
 * successful signing it stays open on the confirmation until the owner
 * continues, even though the refreshed session no longer requires it.
 */
export function SubscriptionAgreementGate({ required }: { required: boolean }) {
  const [holdOpen, setHoldOpen] = useState(false);
  if (!required && !holdOpen) return null;
  return <SubscriptionAgreementModal onSigned={() => setHoldOpen(true)} onFinished={() => setHoldOpen(false)} />;
}

function SubscriptionAgreementModal({ onSigned, onFinished }: { onSigned: () => void; onFinished: () => void }) {
  const t = useT();
  const { refreshSession } = useApp();
  const invalidate = useInvalidate();
  const { locale } = useLocale();
  const query = useApiQuery([...qk.legalAgreement, locale], (api) => api.getSubscriptionAgreementContext({ language: locale }), { placeholderData: previous => previous });
  const [signed, setSigned] = useState<SubscriptionAgreement | null>(null);
  const [finishing, setFinishing] = useState(false);
  const context = query.data;
  const prevent = (event: Event) => event.preventDefault();

  const finish = async () => {
    setFinishing(true);
    try {
      await invalidate([qk.legalAgreement, qk.session]);
      await refreshSession();
    } finally {
      setFinishing(false);
      onFinished();
    }
  };

  const record = signed ?? context?.agreement ?? null;

  return (
    <Dialog open>
      <DialogContent
        hideClose
        onEscapeKeyDown={prevent}
        onPointerDownOutside={prevent}
        onInteractOutside={prevent}
        className="flex h-[min(92dvh,880px)] max-h-none w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        data-testid="agreement-modal"
      >
        {query.isLoading ? (
          <div className="space-y-4 p-6"><Skeleton className="h-7 w-72" /><Skeleton className="h-64 w-full" /></div>
        ) : query.isError || !context ? (
          <div className="p-6"><DialogTitle className="sr-only">{t("agreementDocument.title")}</DialogTitle><DialogDescription className="sr-only">{t("agreementFlow.loadFailed")}</DialogDescription><QueryErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
        ) : record ? (
          <SignedConfirmation agreement={record} finishing={finishing} onContinue={() => void finish()} />
        ) : !context.canSign ? (
          <div className="p-6"><DialogTitle className="sr-only">{t("agreementDocument.title")}</DialogTitle><DialogDescription className="sr-only">{t("agreementFlow.ownerOnly")}</DialogDescription><StatePanel icon={FileSignature} title={t("agreementFlow.ownerSigns")} description={t("agreementFlow.ownerOnlyBody")} /></div>
        ) : (
          <SigningFlow context={context} localeLoading={query.isFetching} onSigned={(agreement) => { onSigned(); setSigned(agreement); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StepHeader({ step, progress }: { step: Step; progress: number }) {
  const t = useT();
  const index = STEPS.findIndex((item) => item.key === step);
  return (
    <header className="border-b border-line px-5 pb-3 pt-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="context-label">{t("agreementFlow.beforeStart")}</p>
          <DialogTitle className="mt-1">{t("agreementFlow.title")}</DialogTitle>
          <DialogDescription>{t("agreementFlow.intro")}</DialogDescription>
        </div>
        <LanguageButton />
        <ol className="flex items-center gap-2 text-[12px]" aria-label={t("agreementFlow.steps")}>
          {STEPS.map((item, position) => {
            const state = position < index ? "done" : position === index ? "current" : "todo";
            return (
              <li key={item.key} className={cn("flex items-center gap-1.5", state === "todo" ? "text-ink-3" : "text-ink")} aria-current={state === "current" ? "step" : undefined}>
                <span className={cn("grid size-5 place-items-center rounded-full border font-mono text-[10.5px]", state === "done" ? "border-ink bg-ink text-paper" : state === "current" ? "border-ink" : "border-line-2")}>{state === "done" ? "✓" : position + 1}</span>
                <span className="hidden sm:inline">{t(`agreementFlow.${item.label}`)}</span>
                {position < STEPS.length - 1 ? <span className="mx-1 h-px w-4 bg-line-2" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      </div>
      {step === "read" ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-sunken-2" role="progressbar" aria-label={t("agreementFlow.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full rounded-full bg-ink transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
    </header>
  );
}

function Footer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <footer className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper/60 px-5 py-3.5 sm:px-6", className)}>{children}</footer>;
}

function SigningFlow({ context, onSigned, localeLoading }: { context: SubscriptionAgreementContext; localeLoading: boolean; onSigned: (agreement: SubscriptionAgreement) => void }) {
  const { t, isolate, isolateLtr } = useLocale();
  const prefill = context.prefill;
  const [step, setStep] = useState<Step>("read");
  const [readToEnd, setReadToEnd] = useState(false);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    legalName: prefill.legalName,
    address: prefill.address ?? "",
    signatoryName: prefill.signatoryName,
    idType: "national" as AgreementIdType,
    idNumber: "",
    startDate: prefill.startDate,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [declarations, setDeclarations] = useState({ identity: false, electronic: false });
  const [signature, setSignature] = useState<SignatureValue>({ method: "drawn" });
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [clientHash, setClientHash] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setClientHash(undefined);
    setStep("read");
    setReadToEnd(false);
    setProgress(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setDeclarations({ identity: false, electronic: false });
    sha256Hex(context.text).then((hash) => { if (!cancelled) setClientHash(hash); }).catch(() => { if (!cancelled) setClientHash(undefined); });
    return () => { cancelled = true; };
  }, [context.text]);

  // "Read to the end" is measured on the scroll container itself: the
  // button unlocks once the bottom of the text has been in view. Text that
  // fits without scrolling counts as read.
  //
  // Progress is how far down the scrollable range the reader has moved, so
  // it starts empty at the top and is full exactly when the button unlocks.
  // It never runs backwards: scrolling up to re-read a clause should not
  // look like lost progress.
  const measure = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    const range = element.scrollHeight - element.clientHeight;
    const reached = remaining <= END_TOLERANCE || range <= 0 ? 1 : Math.min(1, Math.max(0, element.scrollTop / range));
    setProgress((current) => Math.max(current, reached));
    if (remaining <= END_TOLERANCE) setReadToEnd(true);
  }, []);

  useEffect(() => {
    if (step !== "read") return;
    measure();
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [step, measure, context.version]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = key === "idNumber" ? latinDigits(event.target.value) : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => { if (!(key in current)) return current; const next = { ...current }; delete next[key]; return next; });
  };

  const validateDetails = (): boolean => {
    const errors: Record<string, string> = {};
    if (form.legalName.trim().length < 2) errors.legalName = t("agreementFlow.legalNameError");
    if (form.address.trim().length < 3) errors.address = t("agreementFlow.addressError");
    if (form.signatoryName.trim().length < 2) errors.signatoryName = t("agreementFlow.nameError");
    if (form.idType === "national" ? !validNationalId(form.idNumber) : !validPassportNumber(form.idNumber)) errors.idNumber = form.idType === "national" ? t("agreementFlow.nationalError") : t("agreementFlow.passportError");
    if (!validCalendarDate(form.startDate)) errors.startDate = t("agreementFlow.dateError");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const mutation = useApiMutation((api, input: SignSubscriptionAgreementInput) => api.signSubscriptionAgreement(input), {
    onSuccess: (agreement) => onSigned(agreement),
    onError: (failure) => {
      if (isApiError(failure)) {
        setError(failure.message);
        const errors = (failure as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
        const mapped = Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0] ?? ""]));
        setFieldErrors(mapped);
        // A detail the server rejected is fixed on the details step.
        if (Object.keys(mapped).some((key) => ["legalName", "address", "signatoryName", "idNumber", "idType", "startDate", "email"].includes(key))) setStep("details");
      } else setError(t("agreementFlow.failed"));
    },
  });

  const signatureReady = signature.method === "drawn" ? Boolean(signature.imageDataUrl) : Boolean(signature.typedName?.trim());
  const canSign = signatureReady && declarations.identity && declarations.electronic && clientHash === context.sha256 && !localeLoading;
  const idHint = t(form.idType === "national" ? "agreementFlow.nationalHint" : "agreementFlow.passportHint");

  const submit = () => {
    setError(null);
    if (!canSign) {
      setError(t("agreementFlow.consentRequired"));
      return;
    }
    mutation.mutate({
      agreementVersion: context.version,
      customer: { legalName: form.legalName.trim(), address: form.address.trim() },
      signatory: { name: form.signatoryName.trim(), idType: form.idType, idNumber: form.idNumber.trim(), email: prefill.email },
      subscription: { plan: prefill.plan, startDate: form.startDate },
      consents: { agreement: true, authority: declarations.identity, electronic: declarations.electronic, accurate: declarations.identity },
      signature: signature.method === "drawn" ? { method: "drawn", imageDataUrl: signature.imageDataUrl, printImageDataUrl: signature.printImageDataUrl } : { method: "typed", typedName: signature.typedName?.trim() },
      client: { userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent, language: typeof navigator === "undefined" ? "" : navigator.language, viewport: typeof window === "undefined" ? "" : `${window.innerWidth}x${window.innerHeight}` },
      clientDocumentSha256: clientHash ?? "",
      idempotencyKey,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="agreement-signing">
      <StepHeader step={step} progress={step === "read" ? progress : 1} />

      {step === "read" ? (
        <>
          <div ref={scrollRef} onScroll={measure} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" data-testid="agreement-scroll" tabIndex={0}>
            <AgreementText version={context.version} sections={context.sections} preview={context.prefill} />
            <p className="mt-6 border-t border-dashed border-line-3 pt-4 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3" data-testid="agreement-end">{t("agreementFlow.end")}</p>
          </div>
          <Footer>
            <p className="text-[12.5px] text-ink-3" aria-live="polite">{readToEnd ? t("agreementFlow.reachedEnd") : t("agreementFlow.scrollEnd")}</p>
            <Button size="lg" disabled={!readToEnd || localeLoading} onClick={() => setStep("details")} data-testid="agree-continue"><CheckCircle2 /> {t("agreementFlow.readAgree")}</Button>
          </Footer>
        </>
      ) : null}

      {step === "details" ? (
        <>
          <form className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6" onSubmit={(event) => { event.preventDefault(); if (validateDetails()) setStep("sign"); }} noValidate>
            <p className="text-[13px] text-ink-2">{t("agreementFlow.essentialDetails")}</p>
            <section className="space-y-3">
              <p className="context-label">{t("agreementFlow.gym")}</p>
              <Field label={t("agreementFlow.legalName")} required error={fieldErrors.legalName}><Input value={form.legalName} onChange={set("legalName")} required /></Field>
              <Field label={t("agreementFlow.address")} required hint={t("agreementFlow.addressHint")} error={fieldErrors.address}><Input value={form.address} onChange={set("address")} required /></Field>
            </section>
            <section className="space-y-3">
              <p className="context-label">{t("agreementFlow.signingOwner")}</p>
              <Field label={t("agreementFlow.fullName")} required error={fieldErrors.signatoryName}><Input value={form.signatoryName} onChange={set("signatoryName")} required /></Field>
              <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div>
                  <p className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("agreementFlow.idDocument")}<span className="ms-1 text-signal" aria-hidden>*</span></p>
                  <div className="flex gap-2" role="radiogroup" aria-label={t("agreementFlow.idDocument")}>
                    {(["national", "passport"] as const).map((type) => (
                      <button key={type} type="button" role="radio" aria-checked={form.idType === type} onClick={() => { setForm((current) => ({ ...current, idType: type })); setFieldErrors((current) => { const next = { ...current }; delete next.idNumber; return next; }); }} className={cn("inline-flex h-10 items-center rounded-md border px-3 text-[13px]", form.idType === type ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-line-3")}>
                        {t(type === "national" ? "agreementDocument.nationalId" : "agreementDocument.passport")}
                      </button>
                    ))}
                  </div>
                </div>
                <Field label={t("agreementFlow.idNumber")} required hint={idHint} error={fieldErrors.idNumber}><Input value={form.idNumber} onChange={set("idNumber")} inputMode={form.idType === "national" ? "numeric" : "text"} dir="ltr" autoComplete="off" required /></Field>
              </div>
              <p className="flex gap-2 rounded-md border border-line bg-sunken/40 px-3 py-2 text-[12px] text-ink-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />{t("agreementFlow.idPrivacy")}</p>
            </section>
            <section className="space-y-3">
              <p className="context-label">{t("agreementFlow.contract")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("agreementFlow.startDate")} required error={fieldErrors.startDate}><Input type="date" value={form.startDate} onChange={set("startDate")} dir="ltr" required /></Field>
                <Field label={t("renewFlow.adjust.planChange.rowPlan")} hint={t("agreementFlow.planHint")}><Input value={prefill.plan} readOnly aria-readonly /></Field>
              </div>
              <p className="text-[12px] text-ink-3">{t("agreementFlow.emailCopy", { email: isolateLtr(prefill.email) })}</p>
            </section>
            {fieldErrors.email ? <p role="alert" className="text-[12.5px] text-danger">{fieldErrors.email}</p> : null}
          </form>
          <Footer>
            <Button variant="secondary" onClick={() => setStep("read")}><ArrowLeft className="rtl:rotate-180" />{" "}{t("common.action.back")}</Button>
            <Button size="lg" onClick={() => { if (validateDetails()) setStep("sign"); }} data-testid="details-continue">{t("agreementFlow.continueSignature")} <ArrowRight className="rtl:rotate-180" /></Button>
          </Footer>
        </>
      ) : null}

      {step === "sign" ? (
        <>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <dl className="grid gap-x-6 gap-y-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12.5px] sm:grid-cols-2" data-testid="signing-summary">
              <div><dt className="text-ink-3">{t("shell.topbar.gym")}</dt><dd className="text-ink">{form.legalName}</dd></div>
              <div><dt className="text-ink-3">{t("memberProfile.details.address")}</dt><dd className="text-ink">{form.address}</dd></div>
              <div><dt className="text-ink-3">{t("domain.role.owner")}</dt><dd className="text-ink">{form.signatoryName}</dd></div>
              <div><dt className="text-ink-3">{t(form.idType === "national" ? "agreementDocument.nationalId" : "agreementDocument.passport")}</dt><dd className="font-mono text-ink" dir="ltr">{maskIdNumber(form.idNumber)}</dd></div>
              <div><dt className="text-ink-3">{t("renewFlow.adjust.planChange.rowPlan")}</dt><dd className="text-ink">{prefill.plan}</dd></div>
              <div><dt className="text-ink-3">{t("agreementFlow.contractStart")}</dt><dd className="text-ink" dir="ltr">{form.startDate}</dd></div>
            </dl>
            <section className="space-y-3">
              <div><p className="context-label">{t("agreementFlow.signature")}</p><p className="mt-1 text-[12.5px] text-ink-3">{t("agreementFlow.signatureHint")}</p></div>
              <SignaturePad value={signature} onChange={setSignature} signatoryName={form.signatoryName} invalid={Boolean(fieldErrors.signature)} />
              {fieldErrors.signature ? <p className="text-[12px] text-danger" role="alert">{fieldErrors.signature}</p> : null}
            </section>
            <section className="space-y-2.5">
              <p className="context-label">{t("agreementFlow.declarations")}</p>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <Checkbox checked={declarations.identity} onCheckedChange={(checked) => setDeclarations((current) => ({ ...current, identity: checked === true }))} aria-label={t("agreementFlow.authorityLabel")} className="mt-0.5" />
                <span>{t("agreementFlow.authority", { gym: isolate(form.legalName || context.organizationName) })}</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <Checkbox checked={declarations.electronic} onCheckedChange={(checked) => setDeclarations((current) => ({ ...current, electronic: checked === true }))} aria-label={t("agreementFlow.electronicLabel")} className="mt-0.5" />
                <span>{t("agreementFlow.electronic")}</span>
              </label>
            </section>
            {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[12.5px] text-danger">{error}</p> : null}
          </div>
          <Footer>
            <Button variant="secondary" onClick={() => setStep("details")} disabled={mutation.isPending}><ArrowLeft className="rtl:rotate-180" />{" "}{t("common.action.back")}</Button>
            <Button size="lg" loading={mutation.isPending} disabled={!canSign} onClick={submit} data-testid="sign-agreement"><FileSignature /> {t("agreementFlow.signAgreement")}</Button>
          </Footer>
        </>
      ) : null}
    </div>
  );
}

function SignedConfirmation({ agreement, finishing, onContinue }: { agreement: SubscriptionAgreement; finishing: boolean; onContinue: () => void }) {
  const { t, isolate, isolateLtr } = useLocale();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="agreement-signed">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-7" aria-hidden /></span>
        <DialogTitle className="mt-5 text-[22px]">{t("agreementFlow.signed")}</DialogTitle>
        <DialogDescription className="mt-2 max-w-md text-[13.5px]">
          {t("agreementFlow.signedReference", { reference: isolateLtr(agreement.reference), date: isolate(agreement.signedAtLocal), timezone: isolateLtr(agreement.timezone) })}
        </DialogDescription>
        <dl className="mt-6 w-full max-w-md space-y-2 text-start text-[12.5px]">
          <div className="flex justify-between gap-4 rounded-md border border-line px-3 py-2"><dt className="text-ink-3">{t("agreementFlow.yourCopy")}</dt><dd className="text-ink" dir="ltr">{agreement.signatory.email}</dd></div>
          <div className="flex justify-between gap-4 rounded-md border border-line px-3 py-2"><dt className="text-ink-3">{t("agreementFlow.rivetCopies")}</dt><dd className="text-end text-ink" dir="ltr">{AGREEMENT_COPY_RECIPIENTS.join(" · ")}</dd></div>
        </dl>
        <p className="mt-5 max-w-md text-[12.5px] text-ink-3">{t("agreementFlow.copyBody")}</p>
      </div>
      <Footer>
        <Button variant="secondary" onClick={() => downloadAgreementPdf(agreement)} data-testid="download-agreement-pdf"><Download /> {t("agreementFlow.download")}</Button>
        <Button size="lg" loading={finishing} onClick={onContinue} data-testid="agreement-continue">{t("agreementFlow.continueRivet")} <ArrowRight className="rtl:rotate-180" /></Button>
      </Footer>
    </div>
  );
}
