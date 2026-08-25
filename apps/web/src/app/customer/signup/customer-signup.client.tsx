"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, Check, MailCheck, RefreshCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import { PORTALS } from "@/app/login/portals";
import { LoginLayout, PortalHeading } from "@/app/login/login-chrome";

const signupSchema = z
  .object({
    fullName: z.string().trim().min(3, "Enter your full name").max(120, "Use 120 characters or fewer"),
    email: z.string().trim().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .min(9, "Enter your mobile number")
      .max(30, "Use 30 characters or fewer")
      .regex(/^\+?[\d\s()\-]{9,30}$/, "Enter a valid mobile number"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CustomerSignupValues = z.infer<typeof signupSchema>;

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

function clerkMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const value = error as { longMessage?: unknown; message?: unknown };
    if (typeof value.longMessage === "string" && value.longMessage.trim()) return value.longMessage;
    if (typeof value.message === "string" && value.message.trim()) return value.message;
  }
  return fallback;
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
  return { fullName: undefined, email: undefined, phone: undefined, password: undefined, confirmPassword: undefined } as Record<keyof CustomerSignupValues, string | undefined>;
}

function normalizePhoneForClerk(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

type VerificationKind = "email" | "phone";
type VerificationStart =
  | { status: "complete" }
  | { status: "verification"; kind: VerificationKind }
  | { status: "error"; message: string };

function hasField(fields: readonly string[] | undefined, ...names: string[]): boolean {
  return Boolean(fields?.some((field) => names.includes(field)));
}

export function CustomerSignupClient() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signUp, errors: _errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [context] = useState<CustomerSignupContext>(() =>
    typeof window === "undefined" ? { returnTo: DEFAULT_RETURN_TO } : resolveCustomerSignupContext(window.location.search),
  );
  const [values, setValues] = useState<CustomerSignupValues>({ fullName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState(emptyErrors);
  const [step, setStep] = useState<"details" | "verify-email" | "profile-pending">("details");
  const [verificationKind, setVerificationKind] = useState<VerificationKind>("email");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string>();
  const [profileError, setProfileError] = useState<string>();
  const [existingAccount, setExistingAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalizedReturnTo, setFinalizedReturnTo] = useState(context.returnTo);
  const busy = submitting || fetchStatus === "fetching";

  const updateValue = (key: keyof CustomerSignupValues, value: string) => {
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

  const finishProfile = async (profileValues: CustomerSignupValues, returnTo = finalizedReturnTo) => {
    setSubmitting(true);
    setProfileError(undefined);
    try {
      // The profile mutation derives the Clerk user and ownership server-side.
      // No caller-supplied member/customer ID is sent here.
      await getApi().registerCustomer({
        fullName: profileValues.fullName.trim(),
        email: profileValues.email.trim().toLowerCase(),
        phone: profileValues.phone.trim(),
      });
      navigateToReturn(returnTo);
    } catch {
      setStep("profile-pending");
      setProfileError("Your account is ready, but we could not finish the member profile. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const finalize = async (profileValues: CustomerSignupValues) => {
    if (!signUp) return;
    setSubmitting(true);
    setFormError(undefined);
    // Clerk calls this callback before activating the session. Capture its
    // decorated URL so Safari can refresh the Clerk cookie when needed, then
    // navigate only after the authenticated Convex profile exists.
    let decoratedReturnTo = context.returnTo;
    const result = await signUp.finalize({
      navigate: async ({ decorateUrl }) => {
        decoratedReturnTo = decorateUrl(context.returnTo);
      },
    });
    if (result.error) {
      setFormError(clerkMessage(result.error, "Your account could not be activated. Please try again."));
      setSubmitting(false);
      return;
    }
    setFinalizedReturnTo(decoratedReturnTo);
    setSubmitting(false);
    await finishProfile(profileValues, decoratedReturnTo);
  };

  const startVerification = async (profileValues: CustomerSignupValues): Promise<VerificationStart> => {
    if (!signUp) return { status: "error", message: "The signup session is not ready. Please try again." };

    // Clerk v7 can require a phone number at the identity boundary even when
    // the first password call leaves it in missingFields. Submit it through
    // Clerk before attempting verification; the Convex profile still receives
    // the original display value after finalization.
    if (hasField(signUp.missingFields, "phone_number", "phoneNumber")) {
      const updated = await signUp.update({ phoneNumber: normalizePhoneForClerk(profileValues.phone) });
      if (updated.error) {
        const message = clerkMessage(updated.error, "We could not save your mobile number. Please check it and try again.");
        setFieldErrors((current) => ({ ...current, phone: message }));
        return { status: "error", message };
      }
    }

    if (signUp.status === "complete") return { status: "complete" };

    if (hasField(signUp.unverifiedFields, "email_address", "emailAddress")) {
      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) return { status: "error", message: clerkMessage(verification.error, "We could not send the verification code. Please try again.") };
      return { status: "verification", kind: "email" };
    }

    if (hasField(signUp.unverifiedFields, "phone_number", "phoneNumber")) {
      const verification = await signUp.verifications.sendPhoneCode();
      if (verification.error) return { status: "error", message: clerkMessage(verification.error, "We could not send a phone verification code. Please try again.") };
      return { status: "verification", kind: "phone" };
    }

    const missing = signUp.missingFields?.map((field) => String(field).replaceAll("_", " ")).join(", ");
    return {
      status: "error",
      message: missing
        ? `Your account still needs: ${missing}. Please update those details and try again.`
        : "Your account needs another required detail before it can be verified. Please try again or contact RIVET support.",
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
        if (field && !next[field]) next[field] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    const name = splitName(parsed.data.fullName);
    setSubmitting(true);
    const result = await signUp.password({
      emailAddress: parsed.data.email.trim().toLowerCase(),
      phoneNumber: normalizePhoneForClerk(parsed.data.phone),
      password: parsed.data.password,
      firstName: name.firstName,
      ...(name.lastName ? { lastName: name.lastName } : {}),
    });
    if (result.error) {
      setSubmitting(false);
      const field = clerkFieldFor(result.error);
      if (field) setFieldErrors((current) => ({ ...current, [field]: clerkMessage(result.error, "Check this value and try again.") }));
      if (isExistingIdentifierError(result.error) || signUp.isTransferable) setExistingAccount(true);
      setFormError(clerkMessage(result.error, "We could not create the account. Please check your details."));
      return;
    }
    if (signUp.isTransferable) {
      setSubmitting(false);
      setExistingAccount(true);
      setFormError("An account already uses this email address. Sign in to continue.");
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
      setFormError("Enter the six-digit code from your email.");
      return;
    }
    setFormError(undefined);
    setSubmitting(true);
    const result = verificationKind === "email"
      ? await signUp.verifications.verifyEmailCode({ code: trimmedCode })
      : await signUp.verifications.verifyPhoneCode({ code: trimmedCode });
    setSubmitting(false);
    if (result.error) {
      setFormError(clerkMessage(result.error, "That verification code is not valid."));
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
    if (result.error) setFormError(clerkMessage(result.error, "A new code could not be sent."));
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

  if (authLoaded && isSignedIn) {
    return (
      <LoginLayout portal={PORTALS.member} mode="sign-up">
        <PortalHeading portal={PORTALS.member} mode="sign-up" />
        <div className="mt-7 rounded-lg border border-line-2 bg-surface p-4">
          <p className="text-[13px] font-medium">You are already signed in.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">Continue to your member dashboard to request a trial or review your gyms.</p>
          <Button type="button" className="mt-5 w-full" onClick={() => navigateToReturn(finalizedReturnTo)}>Continue <ArrowRight /></Button>
        </div>
      </LoginLayout>
    );
  }

  return (
    <LoginLayout
      portal={PORTALS.member}
      mode="sign-up"
      footer={<p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">Secure identity by Clerk · data by Convex</p>}
    >
      <PortalHeading portal={PORTALS.member} mode="sign-up" />

      {step === "details" ? (
        <form onSubmit={submitDetails} className="mt-7 space-y-4" noValidate>
          <Field label="Full name" htmlFor="customer-signup-name" error={fieldErrors.fullName} required>
            <Input id="customer-signup-name" value={values.fullName} onChange={(event) => updateValue("fullName", event.target.value)} autoComplete="name" placeholder="Lina Haddad" autoFocus aria-invalid={Boolean(fieldErrors.fullName)} />
          </Field>
          <Field label="Email address" htmlFor="customer-signup-email" error={fieldErrors.email} required>
            <Input id="customer-signup-email" type="email" value={values.email} onChange={(event) => updateValue("email", event.target.value)} autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(fieldErrors.email)} />
          </Field>
          <Field label="Mobile number" htmlFor="customer-signup-phone" error={fieldErrors.phone} hint="Gyms use this to confirm your trial booking." required>
            <Input id="customer-signup-phone" type="tel" value={values.phone} onChange={(event) => updateValue("phone", event.target.value)} autoComplete="tel" placeholder="+962 79 000 0000" aria-invalid={Boolean(fieldErrors.phone)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="customer-signup-password" error={fieldErrors.password} required>
              <Input id="customer-signup-password" type="password" value={values.password} onChange={(event) => updateValue("password", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} />
            </Field>
            <Field label="Confirm password" htmlFor="customer-signup-confirm" error={fieldErrors.confirmPassword} required>
              <Input id="customer-signup-confirm" type="password" value={values.confirmPassword} onChange={(event) => updateValue("confirmPassword", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmPassword)} />
            </Field>
          </div>
          {formError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{formError}</p> : null}
          {existingAccount ? <p className="text-[12px] text-ink-2">Already have an account? <Link href={signInHref(context.returnTo)} className="font-semibold underline underline-offset-4">Sign in</Link>.</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!signUp || !authLoaded}>Create account <ArrowRight /></Button>
          <div id="clerk-captcha" role="group" aria-label="Security verification" />
          <p className="text-center text-[11.5px] leading-relaxed text-ink-3">We will email you a verification code. Your password is handled by Clerk and never stored by RIVET.</p>
        </form>
      ) : null}

      {step === "verify-email" ? (
        <div className="mt-7 rounded-xl border border-line-2 bg-surface px-5 py-6 shadow-[0_18px_50px_rgba(21,20,15,0.06)] sm:px-7">
          <div className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-ink"><MailCheck className="size-5" /></span>
            <h2 className="mt-4 font-display text-[21px] font-semibold tracking-tight">Check your {verificationKind === "email" ? "email" : "phone"}</h2>
            <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">We sent a six-digit code to verify your {verificationKind === "email" ? "email address" : "mobile number"}. Enter it below to finish signing up.</p>
          </div>
          <form onSubmit={submitCode} className="mt-6 space-y-5" noValidate>
            <Field label={`${verificationKind === "email" ? "Email" : "Phone"} verification code`} htmlFor="customer-signup-code" error={formError} required>
              <Input id="customer-signup-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456" aria-invalid={Boolean(formError)} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>Verify and continue <ArrowRight /></Button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
            <button type="button" onClick={() => void startOver()} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink"><ArrowLeft className="size-3.5" /> Use another account</button>
            <button type="button" onClick={() => void resendCode()} className="inline-flex items-center gap-1.5 font-medium text-ink-2 transition-colors hover:text-ink"><RefreshCcw className="size-3.5" /> Resend code</button>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] uppercase tracking-[0.11em] text-ink-4"><ShieldCheck className="size-3" /> Secure verification by Clerk</p>
        </div>
      ) : null}

      {step === "profile-pending" ? (
        <div className="mt-7 rounded-lg border border-warning/30 bg-warning-bg p-5">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-warning-deep"><ShieldCheck className="size-4" /> Account created securely</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep">Your Clerk account is active. RIVET still needs to create the member profile before opening the selected gym.</p>
          {profileError ? <p className="mt-3 text-[12px] text-danger" role="alert">{profileError}</p> : null}
          <Button type="button" size="lg" className="mt-5 w-full" loading={busy} onClick={() => void finishProfile(values)}><Check /> Finish member setup</Button>
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-ink-3">Already have an account? <Link href={signInHref(context.returnTo)} className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">Sign in</Link></p>
    </LoginLayout>
  );
}
