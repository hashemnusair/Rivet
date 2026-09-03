"use client";

import { CheckCircle2, FileSignature, Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { AgreementIdType, AgreementPlan, SignSubscriptionAgreementInput, SubscriptionAgreementContext } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { sha256Hex } from "../../../convex/legalAgreementText";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { AgreementRecord, AgreementText } from "./agreement-record";
import { SignaturePad, type SignatureValue } from "./signature-pad";

const PLANS: AgreementPlan[] = ["Starter", "Growth", "Pro", "Enterprise"];
const CONSENTS: Array<{ key: keyof SignSubscriptionAgreementInput["consents"]; label: string }> = [
  { key: "agreement", label: "I have read this subscription agreement, the Terms of service including the data processing addendum, and the Privacy policy, and I agree to them on behalf of the gym." },
  { key: "authority", label: "I am the owner of the gym, or I am authorised by the owner to sign this agreement and bind the gym." },
  { key: "electronic", label: "I agree to sign electronically and I understand that this signature, with the record of my details, the time of signing and the fingerprint of the document, is legally binding." },
  { key: "accurate", label: "The details I have entered are true and complete, and I will tell RIVET if they change." },
];

function newIdempotencyKey() {
  return `agreement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The onboarding step where a gym owner signs RIVET's subscription agreement.
 * Reads the versioned text from the server, lets the owner check the gym's
 * details, capture a signature, accept the declarations, and submits one
 * evidence record. After signing it shows the record with a print action.
 */
export function SubscriptionAgreementSigning({ embedded = false }: { embedded?: boolean }) {
  const { refreshSession } = useApp();
  const invalidate = useInvalidate();
  const query = useApiQuery(qk.legalAgreement, (api) => api.getSubscriptionAgreementContext());
  const context = query.data;

  if (query.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  if (query.isError || !context) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;

  if (context.agreement) {
    return (
      <div className="space-y-5">
        {!embedded ? <PageHeader title="Your subscription agreement" description={context.agreement.status === "countersigned" ? "Signed by you and countersigned by RIVET. Keep a copy for your records." : "Signed. RIVET will countersign and confirm the completed agreement by email."} actions={<Button variant="secondary" onClick={() => window.print()}><Printer /> Print or save as PDF</Button>} /> : null}
        <AgreementRecord agreement={context.agreement} sections={context.sections} />
        {!embedded ? <p className="text-[12.5px] text-ink-3">Questions about the agreement? WhatsApp RIVET on <a href={RIVET_CONTACT.whatsappHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a>.</p> : null}
      </div>
    );
  }

  if (!context.canSign) {
    return <StatePanel icon={FileSignature} title="The gym owner signs this agreement" description="Only the owner account can sign RIVET's subscription agreement. Ask the owner to sign in and complete onboarding." />;
  }

  return <SigningForm context={context} onSigned={async () => { await invalidate([qk.legalAgreement, qk.session]); await refreshSession(); }} />;
}

function SigningForm({ context, onSigned }: { context: SubscriptionAgreementContext; onSigned: () => Promise<void> }) {
  const prefill = context.prefill;
  const [form, setForm] = useState({
    legalName: prefill.legalName,
    tradeName: prefill.tradeName ?? "",
    registrationNumber: "",
    address: prefill.address ?? "",
    city: prefill.city ?? "Amman",
    branches: String(prefill.branches),
    signatoryName: prefill.signatoryName,
    signatoryTitle: prefill.signatoryTitle,
    idType: "national" as AgreementIdType,
    idNumber: "",
    phone: prefill.phone ?? "",
    email: prefill.email,
    plan: prefill.plan,
    quote: "",
    startDate: prefill.startDate,
    termMonths: String(prefill.termMonths),
    placeOfSigning: prefill.placeOfSigning,
  });
  const [consents, setConsents] = useState({ agreement: false, authority: false, electronic: false, accurate: false });
  const [signature, setSignature] = useState<SignatureValue>({ method: "drawn" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [clientHash, setClientHash] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    sha256Hex(context.text).then((hash) => { if (!cancelled) setClientHash(hash); }).catch(() => { if (!cancelled) setClientHash(undefined); });
    return () => { cancelled = true; };
  }, [context.text]);

  const signatureReady = signature.method === "drawn" ? Boolean(signature.imageDataUrl) : Boolean(signature.typedName?.trim());
  const allConsents = Object.values(consents).every(Boolean);
  const branchesNumber = Number.parseInt(form.branches, 10);
  const requiredFilled = [form.legalName, form.address, form.city, form.signatoryName, form.signatoryTitle, form.idNumber, form.phone, form.email, form.startDate].every((value) => value.trim().length > 0) && Number.isSafeInteger(branchesNumber) && branchesNumber >= 1;
  const canSubmit = requiredFilled && allConsents && signatureReady;

  const mutation = useApiMutation((api, input: SignSubscriptionAgreementInput) => api.signSubscriptionAgreement(input), {
    onSuccess: async () => { await onSigned(); },
    onError: (failure) => {
      if (isApiError(failure)) {
        setError(failure.message);
        const errors = (failure as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
        setFieldErrors(Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0] ?? ""])));
      } else setError("The agreement could not be signed. Try again.");
    },
  });

  const idHint = useMemo(() => form.idType === "national" ? "Ten digits, as printed on the Jordanian ID card." : "As printed in the passport.", [form.idType]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!canSubmit) {
      setError("Complete every required field, accept the four declarations, and sign.");
      return;
    }
    mutation.mutate({
      customer: { legalName: form.legalName.trim(), tradeName: form.tradeName.trim() || undefined, registrationNumber: form.registrationNumber.trim() || undefined, address: form.address.trim(), city: form.city.trim(), branches: branchesNumber },
      signatory: { name: form.signatoryName.trim(), title: form.signatoryTitle.trim(), idType: form.idType, idNumber: form.idNumber.trim(), phone: form.phone.trim(), email: form.email.trim() },
      subscription: { plan: form.plan, startDate: form.startDate, termMonths: Number.parseInt(form.termMonths, 10), quote: form.quote.trim() || undefined },
      consents,
      signature: signature.method === "drawn" ? { method: "drawn", imageDataUrl: signature.imageDataUrl } : { method: "typed", typedName: signature.typedName?.trim() },
      client: { userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent, language: typeof navigator === "undefined" ? "" : navigator.language, viewport: typeof window === "undefined" ? "" : `${window.innerWidth}x${window.innerHeight}` },
      placeOfSigning: form.placeOfSigning.trim() || form.city.trim(),
      clientDocumentSha256: clientHash ?? "",
      idempotencyKey,
    });
  };

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-6" data-testid="agreement-signing">
      <PageHeader title="Sign your RIVET agreement" description={`This is the subscription agreement between ${context.organizationName} and RIVET. Read it, check the gym's details, sign, and keep a copy. RIVET countersigns and sends you the final version.`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="panel max-h-[70vh] overflow-y-auto p-5 sm:p-6" aria-label="Agreement text">
          <AgreementText version={context.version} sections={context.sections} />
        </section>

        <form className="space-y-6" onSubmit={submit} noValidate>
          <section className="panel space-y-4 p-5">
            <div><p className="context-label">01 · The gym</p><p className="mt-1 text-[12.5px] text-ink-3">Use the name on the commercial registration, and the trade name the gym is known by if it differs.</p></div>
            <Field label="Registered name of the gym or company" required error={fieldErrors.legalName}><Input value={form.legalName} onChange={set("legalName")} required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Trade name, if different"><Input value={form.tradeName} onChange={set("tradeName")} /></Field>
              <Field label="Commercial registration number" hint="Optional now; RIVET will ask for it before invoicing." error={fieldErrors.registrationNumber}><Input value={form.registrationNumber} onChange={set("registrationNumber")} dir="ltr" /></Field>
            </div>
            <Field label="Address" required error={fieldErrors.address}><Input value={form.address} onChange={set("address")} required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" required error={fieldErrors.city}><Input value={form.city} onChange={set("city")} required /></Field>
              <Field label="Number of branches" required error={fieldErrors.branches}><Input type="number" min={1} max={100} step={1} value={form.branches} onChange={set("branches")} dir="ltr" required /></Field>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div><p className="context-label">02 · The person signing</p><p className="mt-1 text-[12.5px] text-ink-3">The owner, or a person authorised to sign for the gym. The name must match the ID.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name, as on your ID" required error={fieldErrors.signatoryName}><Input value={form.signatoryName} onChange={set("signatoryName")} required /></Field>
              <Field label="Role at the gym" required error={fieldErrors.signatoryTitle}><Input value={form.signatoryTitle} onChange={set("signatoryTitle")} required /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ID document" required>
                <Select value={form.idType} onValueChange={(value) => setForm((current) => ({ ...current, idType: value as AgreementIdType }))}>
                  <SelectTrigger aria-label="ID document"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="national">Jordanian national ID</SelectItem><SelectItem value="passport">Passport</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="ID number" required hint={idHint} error={fieldErrors.idNumber}><Input value={form.idNumber} onChange={set("idNumber")} inputMode={form.idType === "national" ? "numeric" : "text"} dir="ltr" autoComplete="off" required /></Field>
            </div>
            <p className="flex gap-2 rounded-md border border-line bg-sunken/40 px-3 py-2 text-[11.5px] text-ink-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />Your ID number is asked for once, to tie the agreement to an authorised person. It is sent to RIVET over an encrypted connection, kept only in the contract record, never shown to gym staff, and masked in the copy you receive.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone or WhatsApp" required error={fieldErrors.phone}><Input value={form.phone} onChange={set("phone")} dir="ltr" inputMode="tel" required /></Field>
              <Field label="Email for the signed copy" required error={fieldErrors.email}><Input type="email" value={form.email} onChange={set("email")} dir="ltr" required /></Field>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div><p className="context-label">03 · The subscription</p><p className="mt-1 text-[12.5px] text-ink-3">As agreed with RIVET. If a quote number was given to you, enter it; the quote sets the fees and the limits of the plan.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Plan" required error={fieldErrors.plan}>
                <Select value={form.plan} onValueChange={(value) => setForm((current) => ({ ...current, plan: value as AgreementPlan }))}>
                  <SelectTrigger aria-label="Plan"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLANS.map((plan) => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="RIVET quote number" error={fieldErrors.quote}><Input value={form.quote} onChange={set("quote")} dir="ltr" placeholder="Q-1042" /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contract start date" required error={fieldErrors.startDate}><Input type="date" value={form.startDate} onChange={set("startDate")} dir="ltr" required /></Field>
              <Field label="Initial term" required>
                <Select value={form.termMonths} onValueChange={(value) => setForm((current) => ({ ...current, termMonths: value }))}>
                  <SelectTrigger aria-label="Initial term"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="12">12 months</SelectItem><SelectItem value="24">24 months</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div><p className="context-label">04 · Signature</p><p className="mt-1 text-[12.5px] text-ink-3">Sign with your finger, a pen or the mouse. If you would rather type, you can adopt your typed name as your signature.</p></div>
            <SignaturePad value={signature} onChange={setSignature} signatoryName={form.signatoryName} invalid={Boolean(fieldErrors.signature)} />
            {fieldErrors.signature ? <p className="text-[12px] text-danger" role="alert">{fieldErrors.signature}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date of signing" hint="Set by RIVET's server at the moment you sign, Amman time."><Input value="Set automatically" readOnly disabled /></Field>
              <Field label="Place of signing"><Input value={form.placeOfSigning} onChange={set("placeOfSigning")} /></Field>
            </div>
          </section>

          <section className="panel space-y-3 p-5">
            <p className="context-label">05 · Declarations</p>
            {CONSENTS.map((consent) => (
              <label key={consent.key} className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
                <Checkbox checked={consents[consent.key]} onCheckedChange={(checked) => setConsents((current) => ({ ...current, [consent.key]: checked === true }))} aria-label={consent.label} className="mt-0.5" />
                <span>{consent.label}</span>
              </label>
            ))}
            <p className="text-[11.5px] text-ink-3">Read the <Link href="/terms" className="underline underline-offset-4" target="_blank">Terms of service</Link> and the <Link href="/privacy" className="underline underline-offset-4" target="_blank">Privacy policy</Link>.</p>
          </section>

          {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[12.5px] text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11.5px] text-ink-3">You will get a copy at once, and the countersigned agreement from RIVET.</p>
            <Button type="submit" size="lg" loading={mutation.isPending} disabled={!canSubmit || !clientHash} data-testid="sign-agreement"><CheckCircle2 /> Sign the agreement</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
