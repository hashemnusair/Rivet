"use client";
import type { MessageDescriptor } from "@/lib/i18n/core";
import { authMessage, renderAuthMessage } from "@/lib/auth/messages";
import { latinDigits } from "@/lib/utils/text";
import { createTranslator } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/provider";

import { useAuth, useSignUp } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, Check, ChevronDown, MailCheck, RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import { PORTALS } from "@/app/login/portals";
import { LoginLayout, PortalHeading } from "@/app/login/login-chrome";
import { IdentityPanel } from "@/app/login/identity-panels.client";

const signupEnglish = createTranslator("en");
const signupSchema = z
  .object({
    fullName: z.string().trim().min(3, signupEnglish("authErrors.fullName")).max(120, signupEnglish("authErrors.max120")),
    email: z.string().trim().email(signupEnglish("authErrors.email")),
    phone: z
      .string()
      .transform(latinDigits).pipe(z.string()
      .trim()
      .min(9, signupEnglish("authErrors.mobile"))
      .max(30, signupEnglish("authErrors.max30"))
      .regex(/^\+?[\d\s()\-]{9,30}$/, signupEnglish("authErrors.mobileInvalid"))),
    gender: z.enum(["female", "male"], { message: signupEnglish("authErrors.gender") }),
    password: z.string().min(8, signupEnglish("authErrors.passwordMin")),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: signupEnglish("authErrors.passwordMismatch"),
    path: ["confirmPassword"],
  });

export type CustomerSignupValues = z.infer<typeof signupSchema>;
type CustomerSignupDraft = Omit<CustomerSignupValues, "gender"> & { gender: "" | CustomerSignupValues["gender"] };

const SAFE_CONTEXT_VALUE = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,119}$/;
const PUBLIC_PLANS = new Set(["Starter", "Growth", "Pro", "Enterprise"]);
const BILLING_INTERVALS = new Set(["monthly", "annual"]);
const DEFAULT_RETURN_TO = "/customer/discover";

export type CustomerSignupContext = {
  returnTo: string;
  gymId?: string;
  branchId?: string;
  plan?: string;
  interval?: string;
};

/**
 * Keep only the member gym route and its non-sensitive selection context.
 * This is deliberately independent of any caller-supplied customer/member ID.
 */
export function resolveCustomerSignupContext(search: string): CustomerSignupContext {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const directGymId = safeContextValue(params.get("gymId"));
  const directBranchId = safeContextValue(params.get("branchId"));
  const directPlan = safePlan(params.get("plan"));
  const directInterval = safeInterval(params.get("interval"));
  const candidate = params.get("returnTo");

  if (candidate) {
    const safeCandidate = safeCustomerGymPath(candidate);
    if (safeCandidate) {
      const candidateUrl = new URL(safeCandidate, "https://rivet.local");
      const candidateGymId = safeContextValue(candidateUrl.pathname.split("/")[3]);
      const candidateParams = candidateUrl.searchParams;
      const branchId = safeContextValue(candidateParams.get("branchId"));
      const plan = safePlan(candidateParams.get("plan"));
      const interval = safeInterval(candidateParams.get("interval"));
      return {
        returnTo: buildGymReturnTo(candidateGymId, branchId, plan, interval),
        ...(candidateGymId ? { gymId: candidateGymId } : {}),
        ...(branchId ? { branchId } : {}),
        ...(plan ? { plan } : {}),
        ...(interval ? { interval } : {}),
      };
    }
  }

  if (directGymId) {
    return {
      returnTo: buildGymReturnTo(directGymId, directBranchId, directPlan, directInterval),
      gymId: directGymId,
      ...(directBranchId ? { branchId: directBranchId } : {}),
      ...(directPlan ? { plan: directPlan } : {}),
      ...(directInterval ? { interval: directInterval } : {}),
    };
  }

  return { returnTo: DEFAULT_RETURN_TO };
}

function safeContextValue(value: string | null | undefined): string | undefined {
  if (!value || !SAFE_CONTEXT_VALUE.test(value)) return undefined;
  return value;
}

function safePlan(value: string | null | undefined): string | undefined {
  return value && PUBLIC_PLANS.has(value) ? value : undefined;
}

function safeInterval(value: string | null | undefined): string | undefined {
  return value && BILLING_INTERVALS.has(value) ? value : undefined;
}

function safeCustomerGymPath(value: string): string | undefined {
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value, "https://rivet.local");
  } catch {
    return undefined;
  }
  if (parsed.origin !== "https://rivet.local" || !/^\/customer\/gyms\/[^/]+$/.test(parsed.pathname)) return undefined;
  return `${parsed.pathname}${parsed.search}`;
}

function buildGymReturnTo(gymId: string | undefined, branchId?: string, plan?: string, interval?: string): string {
  if (!gymId) return DEFAULT_RETURN_TO;
  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  if (plan) params.set("plan", plan);
  if (interval) params.set("interval", interval);
  const query = params.toString();
  return `/customer/gyms/${encodeURIComponent(gymId)}${query ? `?${query}` : ""}`;
}

function signInHref(returnTo: string): string {
  return returnTo === DEFAULT_RETURN_TO ? "/login" : `/login?next=${encodeURIComponent(returnTo)}`;
}

function splitName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? fullName.trim(),
    ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}),
  };
}


function isExistingIdentifierError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && ["form_identifier_exists", "identifier_already_exists", "email_address_exists"].includes(code);
}

function clerkFieldFor(error: unknown): keyof CustomerSignupValues | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { code?: unknown; message?: unknown; longMessage?: unknown; paramName?: unknown };
  const text = [value.code, value.message, value.longMessage, value.paramName].filter((item): item is string => typeof item === "string").join(" ").toLowerCase();
  if (text.includes("phone")) return "phone";
  if (text.includes("email") || text.includes("identifier")) return "email";
  if (text.includes("password")) return "password";
  if (text.includes("first_name") || text.includes("last_name") || text.includes("name")) return "fullName";
  return undefined;
}

function emptyErrors() {
  return { fullName: undefined, email: undefined, phone: undefined, gender: undefined, password: undefined, confirmPassword: undefined } as Record<keyof CustomerSignupValues, MessageDescriptor | undefined>;
}

function normalizePhoneForClerk(value: string): string {
  const trimmed = latinDigits(value).trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

type VerificationKind = "email" | "phone";
type VerificationStart =
  | { status: "complete" }
  | { status: "verification"; kind: VerificationKind }
  | { status: "error"; message: MessageDescriptor };

function hasField(fields: readonly string[] | undefined, ...names: string[]): boolean {
  return Boolean(fields?.some((field) => names.includes(field)));
}

export function CustomerSignupClient() {
  const t = useT();
  const present = (message: MessageDescriptor | undefined) => message ? renderAuthMessage(message, t) : undefined;
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signUp, errors: _errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [context] = useState<CustomerSignupContext>(() =>
    typeof window === "undefined" ? { returnTo: DEFAULT_RETURN_TO } : resolveCustomerSignupContext(window.location.search),
  );
  const [values, setValues] = useState<CustomerSignupDraft>({ fullName: "", email: "", phone: "", gender: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState(emptyErrors);
  const [step, setStep] = useState<"details" | "verify-email" | "profile-pending">("details");
  const [verificationKind, setVerificationKind] = useState<VerificationKind>("email");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<MessageDescriptor>();
  const [profileError, setProfileError] = useState<MessageDescriptor>();
  const [existingAccount, setExistingAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalizedReturnTo, setFinalizedReturnTo] = useState(context.returnTo);
  const busy = submitting || fetchStatus === "fetching";
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setSubmitting(true);
    try { await action(); }
    catch (error) {
      const message = authMessage(error, "authErrors.checkDetails");
      setFormError(message);
      setProfileError(message);
    } finally { setSubmitting(false); }
  };


  const updateValue = (key: keyof CustomerSignupDraft, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(undefined);
  };

  const navigateToReturn = (returnTo: string) => {
    if (/^https?:\/\//i.test(returnTo)) {
      window.location.assign(returnTo);
      return;
    }
    router.replace(returnTo);
  };

  const finishProfile = async (profileDraft: CustomerSignupDraft, returnTo = finalizedReturnTo) => {
    const parsedProfile = signupSchema.safeParse(profileDraft);
    if (!parsedProfile.success) {
      setProfileError({ key: "authErrors.checkDetails" });
      setStep("details");
      return;
    }
    const profileValues = parsedProfile.data;
    setSubmitting(true);
    setProfileError(undefined);
    try {
      // The profile mutation derives the Clerk user and ownership server-side.
      // No caller-supplied member/customer ID is sent here.
      await getApi().registerCustomer({
        fullName: profileValues.fullName.trim(),
        email: profileValues.email.trim().toLowerCase(),
        phone: profileValues.phone.trim(),
        gender: profileValues.gender,
      });
      navigateToReturn(returnTo);
    } catch {
      setStep("profile-pending");
      setProfileError({ key: "authErrors.profilePending" });
    } finally {
      setSubmitting(false);
    }
  };

  const finalize = async (profileDraft: CustomerSignupDraft) => {
    if (!signUp) return;
    const parsedProfile = signupSchema.safeParse(profileDraft);
    if (!parsedProfile.success) {
      setFormError({ key: "authErrors.checkDetails" });
      setStep("details");
      return;
    }
    const profileValues = parsedProfile.data;
    setSubmitting(true);
    setFormError(undefined);
    // Clerk calls this callback before activating the session. Capture its
    // decorated URL so Safari can refresh the Clerk cookie when needed, then
    // navigate only after the authenticated Convex profile exists.
    let decoratedReturnTo = context.returnTo;
    setStep("profile-pending");
    const result = await signUp.finalize({
      navigate: async ({ decorateUrl }) => {
        decoratedReturnTo = decorateUrl(context.returnTo);
      },
    });
    if (result.error) {
      setStep("verify-email");
      setFormError(authMessage(result.error, "authErrors.finalizeFailed"));
      setSubmitting(false);
      return;
    }
    setFinalizedReturnTo(decoratedReturnTo);
    setSubmitting(false);
    await finishProfile(profileValues, decoratedReturnTo);
  };

  const startVerification = async (profileDraft: CustomerSignupDraft): Promise<VerificationStart> => {
    if (!signUp) return { status: "error", message: { key: "authErrors.notReady" } };
    const parsedProfile = signupSchema.safeParse(profileDraft);
    if (!parsedProfile.success) return { status: "error", message: { key: "authErrors.checkDetails" } };
    const profileValues = parsedProfile.data;

    // Clerk v7 can require a phone number at the identity boundary even when
    // the first password call leaves it in missingFields. Submit it through
    // Clerk before attempting verification; the Convex profile still receives
    // the original display value after finalization.
    if (hasField(signUp.missingFields, "phone_number", "phoneNumber")) {
      const updated = await signUp.update({ phoneNumber: normalizePhoneForClerk(profileValues.phone) });
      if (updated.error) {
        const message = authMessage(updated.error, "authErrors.phoneSaveFailed");
        setFieldErrors((current) => ({ ...current, phone: message }));
        return { status: "error", message };
      }
    }

    if (signUp.status === "complete") return { status: "complete" };

    if (hasField(signUp.unverifiedFields, "email_address", "emailAddress")) {
      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) return { status: "error", message: authMessage(verification.error, "authErrors.codeSendFailed") };
      return { status: "verification", kind: "email" };
    }

    if (hasField(signUp.unverifiedFields, "phone_number", "phoneNumber")) {
      const verification = await signUp.verifications.sendPhoneCode();
      if (verification.error) return { status: "error", message: authMessage(verification.error, "authErrors.phoneCodeSendFailed") };
      return { status: "verification", kind: "phone" };
    }

    const missing = signUp.missingFields?.join(",");
    return {
      status: "error",
      message: missing
        ? { key: "authErrors.missingFields", params: { fields: missing } }
        : { key: "authErrors.additionalDetails" },
    };
  };

  const submitDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp || busy) return;
    setFormError(undefined);
    setExistingAccount(false);
    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      const next = emptyErrors();
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CustomerSignupValues | undefined;
        if (field && !next[field]) next[field] = authMessage({ message: issue.message }, "authErrors.checkValue");
      }
      setFieldErrors(next);
      return;
    }

    const name = splitName(parsed.data.fullName);
    setSubmitting(true);
    // Mobile is required for the RIVET profile, but may be disabled as a
    // Clerk identifier. startVerification supplies it if Clerk requires it.
    const result = await signUp.password({
      emailAddress: parsed.data.email.trim().toLowerCase(),
      password: parsed.data.password,
      firstName: name.firstName,
      ...(name.lastName ? { lastName: name.lastName } : {}),
    });
    if (result.error) {
      setSubmitting(false);
      const field = clerkFieldFor(result.error);
      if (field) setFieldErrors((current) => ({ ...current, [field]: authMessage(result.error, "authErrors.checkValue") }));
      if (isExistingIdentifierError(result.error) || signUp.isTransferable) setExistingAccount(true);
      setFormError(authMessage(result.error, "authErrors.createFailed"));
      return;
    }
    if (signUp.isTransferable) {
      setSubmitting(false);
      setExistingAccount(true);
      setFormError({ key: "authErrors.existingEmail" });
      return;
    }

    if (signUp.status === "complete") {
      await finalize(parsed.data);
      return;
    }

    const verification = await startVerification(parsed.data);
    if (verification.status === "verification") {
      setSubmitting(false);
      setVerificationKind(verification.kind);
      setStep("verify-email");
      return;
    }
    setSubmitting(false);
    if (verification.status === "complete") {
      await finalize(parsed.data);
      return;
    }
    setFormError(verification.message);
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp || busy) return;
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setFormError({ key: "authErrors.codeRequired" });
      return;
    }
    setFormError(undefined);
    setSubmitting(true);
    const result = verificationKind === "email"
      ? await signUp.verifications.verifyEmailCode({ code: trimmedCode })
      : await signUp.verifications.verifyPhoneCode({ code: trimmedCode });
    setSubmitting(false);
    if (result.error) {
      setFormError(authMessage(result.error, "authErrors.codeIncorrect"));
      return;
    }
    if (signUp.status === "complete") {
      await finalize(values);
      return;
    }

    setSubmitting(true);
    const nextVerification = await startVerification(values);
    setSubmitting(false);
    if (nextVerification.status === "verification") {
      setVerificationKind(nextVerification.kind);
      setFormError(undefined);
      return;
    }
    if (nextVerification.status === "complete") {
      await finalize(values);
      return;
    }
    setFormError(nextVerification.message);
  };

  const resendCode = async () => {
    if (!signUp || busy) return;
    setFormError(undefined);
    const result = verificationKind === "email"
      ? await signUp.verifications.sendEmailCode()
      : await signUp.verifications.sendPhoneCode();
    if (result.error) setFormError(authMessage(result.error, "authErrors.resendFailed"));
  };

  const startOver = async () => {
    if (!signUp || busy) return;
    await signUp.reset();
    setStep("details");
    setVerificationKind("email");
    setCode("");
    setFormError(undefined);
    setProfileError(undefined);
    setExistingAccount(false);
  };

  // Clerk can publish the session between finalization and the authenticated
  // member-profile mutation. Keep that handoff mounted until the profile
  // step finishes instead of briefly replacing it with an "already signed in"
  // message.
  if (authLoaded && isSignedIn && step === "details" && !submitting) {
    return (
      <LoginLayout portal={PORTALS.member} mode="sign-up">
        <IdentityPanel audience="member" />
      </LoginLayout>
    );
  }

  return (
    <LoginLayout
      portal={PORTALS.member}
      mode="sign-up"
      footer={<p className="text-center text-[12px] text-ink-3">{t("authErrors.secureSignup")}</p>}
    >
      <PortalHeading portal={PORTALS.member} mode="sign-up" />

      {step === "details" ? (
        <form onSubmit={(event) => { event.preventDefault(); void run(() => submitDetails(event)); }} className="mt-6 space-y-3.5" noValidate>
          {/* Paired fields, so the whole form fits one screen without scrolling. */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label={t("common.label.fullName")} htmlFor="customer-signup-name" error={present(fieldErrors.fullName)} required>
              <Input id="customer-signup-name" dir="auto" value={values.fullName} onChange={(event) => updateValue("fullName", event.target.value)} autoComplete="name" placeholder={t("authErrors.namePlaceholder")} autoFocus aria-invalid={Boolean(fieldErrors.fullName)} />
            </Field>
            <Field label={t("auth.signIn.emailLabel")} htmlFor="customer-signup-email" error={present(fieldErrors.email)} required>
              <Input id="customer-signup-email" dir="ltr" type="email" value={values.email} onChange={(event) => updateValue("email", event.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(fieldErrors.email)} />
            </Field>
          </div>
          {/* On a phone the gender column takes a little more, so its prompt is never cut off. */}
          <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start gap-3 sm:grid-cols-2">
            <Field label={t("auth.memberSetup.mobile")} htmlFor="customer-signup-phone" error={present(fieldErrors.phone)} hint={t("authErrors.phonePurpose")} required>
              <Input id="customer-signup-phone" dir="ltr" type="tel" value={values.phone} onChange={(event) => updateValue("phone", event.target.value)} autoComplete="tel" placeholder="+962 79 000 0000" aria-invalid={Boolean(fieldErrors.phone)} />
            </Field>
            <Field label={t("memberProfile.details.gender")} htmlFor="customer-signup-gender" error={present(fieldErrors.gender)} required>
              {/* A slim arrow of its own, so the prompt has the room on a narrow phone. */}
              <div className="relative">
                <select id="customer-signup-gender" value={values.gender} onChange={(event) => updateValue("gender", event.target.value)} className="h-11 w-full appearance-none rounded-md border border-line-2 bg-surface ps-2 pe-6 text-[12.5px] sm:ps-3 sm:pe-8 sm:text-[13.5px]" aria-invalid={Boolean(fieldErrors.gender)} required>
                  <option value="" disabled>{t("auth.validation.genderRequired")}</option>
                  <option value="female">{t("memberProfile.details.female")}</option>
                  <option value="male">{t("memberProfile.details.male")}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-3 sm:end-3" aria-hidden />
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.label.password")} htmlFor="customer-signup-password" error={present(fieldErrors.password)} required>
              <PasswordInput id="customer-signup-password" value={values.password} onChange={(event) => updateValue("password", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "customer-signup-password-error" : undefined} />
            </Field>
            <Field label={t("auth.invitation.form.confirmPassword")} htmlFor="customer-signup-confirm" error={present(fieldErrors.confirmPassword)} required>
              <PasswordInput id="customer-signup-confirm" value={values.confirmPassword} onChange={(event) => updateValue("confirmPassword", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? "customer-signup-confirm-error" : undefined} />
            </Field>
          </div>
          {formError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{present(formError)}</p> : null}
          {existingAccount ? <p className="text-[12px] text-ink-2">{t("authErrors.alreadyAccount")}{" "}<Link href={signInHref(context.returnTo)} className="font-semibold underline underline-offset-4">{t("common.action.signIn")}</Link>{t("members.bulk.toast.end")}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!signUp || !authLoaded}>{t("marketing.actions.createAccount")}{" "}<ArrowRight className="rtl:rotate-180" /></Button>
          <div id="clerk-captcha" role="group" aria-label={t("authErrors.securityCheck")} />
          {/* The code's own screen says the same, so a short screen drops the line to fit. */}
          <p className="text-center text-[12.5px] leading-relaxed text-ink-3 [@media(max-height:760px)]:hidden">{t("authErrors.emailCodeNote")}</p>
        </form>
      ) : null}

      {step === "verify-email" ? (
        <div className="mt-7 rounded-lg border border-line-2 bg-surface px-5 py-6 sm:px-7">
          <div className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-ink"><MailCheck className="size-5" /></span>
            <h2 className="mt-4 font-display text-[21px] font-semibold tracking-tight">{t(verificationKind === "email" ? "authErrors.checkEmail" : "authErrors.checkPhone")}</h2>
            <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">{t(verificationKind === "email" ? "authErrors.emailSent" : "authErrors.phoneSent")}</p>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void run(() => submitCode(event)); }} className="mt-6 space-y-5" noValidate>
            <Field label={t(verificationKind === "email" ? "authErrors.emailCode" : "authErrors.phoneCode")} htmlFor="customer-signup-code" error={present(formError)} required>
              <Input id="customer-signup-code" dir="ltr" value={code} onChange={(event) => setCode(latinDigits(event.target.value).replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" aria-invalid={Boolean(formError)} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>{t("auth.signIn.verify.submit")}{" "}<ArrowRight className="rtl:rotate-180" /></Button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
            <button type="button" onClick={() => void run(startOver)} disabled={busy} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"><ArrowLeft className="size-3.5 rtl:rotate-180" />{" "}{t("authErrors.startOver")}</button>
            <button type="button" onClick={() => void run(resendCode)} disabled={busy} className="inline-flex items-center gap-1.5 font-medium text-ink-2 transition-colors hover:text-ink"><RefreshCcw className="size-3.5" />{" "}{t("authErrors.resend")}</button>
          </div>
        </div>
      ) : null}

      {step === "profile-pending" ? (
        <div className="mt-7 rounded-lg border border-warning/30 bg-warning-bg p-5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-warning-deep"><ShieldCheck className="size-4" />{" "}{t("authErrors.created")}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep">{t("authErrors.finishSetup")}</p>
          {profileError ? <p className="mt-3 text-[12px] text-danger" role="alert">{present(profileError)}</p> : null}
          <Button type="button" size="lg" className="mt-5 w-full" loading={busy} onClick={() => void run(() => finishProfile(values))}><Check />{" "}{t("auth.memberSetup.submit")}</Button>
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-ink-3">{t("authErrors.alreadyAccount")}{" "}<Link href={signInHref(context.returnTo)} className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">{t("common.action.signIn")}</Link></p>
    </LoginLayout>
  );
}
