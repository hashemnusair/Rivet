"use client";

import { AuthFlowError, authErrorText, authMessage, renderAuthMessage } from "@/lib/auth/messages";
import type { MessageDescriptor, TKey } from "@/lib/i18n/core";
import { latinDigits } from "@/lib/utils/text";
import { loginHref, safeInternalRedirect } from "@/lib/routing/host-routing";
import { useClerk, useSignIn } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT, type TFunction } from "@/lib/i18n/provider";

type VerificationKind = "email_code" | "phone_code" | "totp" | "backup_code";
/** Forgot password: ask for the email, then take the emailed code and a new password together. */
type ResetStep = "email" | "code";

/** Clerk says "no such account" the same way for sign-in; here it gets its own words. */
function resetSendMessage(error: unknown): MessageDescriptor {
  const message = authMessage(error, "authErrors.codeSendFailed");
  return message.key === "auth.signIn.errors.incorrect" ? { key: "auth.signIn.reset.notFound" } : message;
}

/**
 * A stable password-first Clerk flow. Unlike Clerk's adaptive prebuilt view,
 * this always paints both primary fields immediately and only introduces a
 * second step when Client Trust or user-enabled MFA genuinely requires it.
 * The fields are in the server's HTML and take typing while Clerk's script is
 * still loading; only the submit waits for it. "Forgot password?" opens an
 * email-code reset in the same card; a successful reset signs the person in
 * and, if Clerk then wants a second factor, continues into the same second
 * step as a normal sign-in.
 */
export function PasswordSignIn({ redirectUrl = "/login", signUp = true }: { redirectUrl?: string; signUp?: boolean }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { loaded: clerkLoaded } = useClerk();
  const router = useRouter();
  const t = useT();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Whatever was typed or filled in before the page came alive stays, and counts.
  useEffect(() => {
    const typedEmail = emailRef.current?.value;
    const typedPassword = passwordRef.current?.value;
    if (typedEmail) setEmailAddress((current) => current || typedEmail);
    if (typedPassword) setPassword((current) => current || typedPassword);
  }, []);
  const [verification, setVerification] = useState<VerificationKind | null>(null);
  const [code, setCode] = useState("");
  const [resetStep, setResetStep] = useState<ResetStep | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [localError, setLocalError] = useState<MessageDescriptor | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = fetchStatus === "fetching" || finishing || submitting;

  const finish = async () => {
    if (!signIn || signIn.status !== "complete") return false;
    setFinishing(true);
    try {
      const continuation = safeInternalRedirect(redirectUrl, "/login");
      const resolver = continuation.startsWith("/login") ? "/login" : loginHref(continuation);
      let decoratedRedirect = resolver;
      const { error } = await signIn.finalize({
        navigate: async ({ decorateUrl }) => {
          decoratedRedirect = decorateUrl(resolver);
        },
      });
      if (error) {
        setLocalError(authMessage(error, "auth.signIn.errors.couldNotSignIn"));
        return false;
      }
      if (/^https?:\/\//i.test(decoratedRedirect)) window.location.assign(decoratedRedirect);
      else router.replace(decoratedRedirect);
      return true;
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.couldNotSignIn"));
      return false;
    } finally {
      setFinishing(false);
    }
  };

  const beginVerification = async () => {
    if (!signIn) return;
    const strategies = signIn.supportedSecondFactors.map((factor) => factor.strategy);

    if (strategies.includes("email_code")) {
      const { error } = await signIn.mfa.sendEmailCode();
      if (error) throw error;
      setVerification("email_code");
      return;
    }
    if (strategies.includes("phone_code")) {
      const { error } = await signIn.mfa.sendPhoneCode();
      if (error) throw error;
      setVerification("phone_code");
      return;
    }
    if (strategies.includes("totp")) {
      setVerification("totp");
      return;
    }
    if (strategies.includes("backup_code")) {
      setVerification("backup_code");
      return;
    }

    throw new AuthFlowError({ key: "auth.signIn.errors.unsupportedStep" });
  };

  /** Whatever Clerk wants after the first factor: finish, a second factor, or something we cannot show. */
  const continueSignIn = async () => {
    if (!signIn) return;
    if (signIn.status === "complete") {
      await finish();
      return;
    }

    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      // The reset's code and new password must not carry into the second step.
      setCode("");
      setNewPassword("");
      try {
        await beginVerification();
      } catch (verificationError) {
        setLocalError(authMessage(verificationError, "auth.signIn.errors.nextStepFailed"));
      }
      return;
    }

    setLocalError({ key: "auth.signIn.errors.anotherStep" });
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || !clerkLoaded || busy) return;
    setLocalError(null);

    setSubmitting(true);
    try {
      const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
      if (error) {
        setLocalError(authMessage(error, "auth.signIn.errors.incorrect"));
        return;
      }
      await continueSignIn();
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.incorrect"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || !verification || busy) return;
    setLocalError(null);

    setSubmitting(true);
    try {
      const result =
        verification === "email_code"
          ? await signIn.mfa.verifyEmailCode({ code: code.trim() })
          : verification === "phone_code"
            ? await signIn.mfa.verifyPhoneCode({ code: code.trim() })
            : verification === "totp"
              ? await signIn.mfa.verifyTOTP({ code: code.trim() })
              : await signIn.mfa.verifyBackupCode({ code: code.trim() });

      if (result.error) {
        setLocalError(authMessage(result.error, "auth.signIn.errors.codeIncorrect"));
        return;
      }
      if (!(await finish()) && signIn.status !== "complete") {
        setLocalError({ key: "auth.signIn.errors.notFinished" });
      }
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.codeIncorrect"));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (!signIn || busy) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      const result = verification === "email_code" ? await signIn.mfa.sendEmailCode() : await signIn.mfa.sendPhoneCode();
      if (result.error) setLocalError(authMessage(result.error, "auth.signIn.errors.resendFailed"));
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.resendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const startOver = async () => {
    if (!signIn) return;
    setSubmitting(true);
    try {
      await signIn.reset();
      setVerification(null);
      setResetStep(null);
      setCode("");
      setNewPassword("");
      setLocalError(null);
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.startOverFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const openReset = () => {
    setLocalError(null);
    setResetStep("email");
  };

  const closeReset = () => {
    // Forget the lookup so an old "no such account" cannot linger under the sign-in email.
    if (signIn && clerkLoaded) void Promise.resolve(signIn.reset()).catch(() => undefined);
    setLocalError(null);
    setResetStep(null);
  };

  const sendResetCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || !clerkLoaded || busy) return;
    setLocalError(null);

    setSubmitting(true);
    try {
      const created = await signIn.create({ identifier: emailAddress.trim() });
      if (created.error) {
        setLocalError(resetSendMessage(created.error));
        return;
      }
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) {
        setLocalError(resetSendMessage(sent.error));
        return;
      }
      setCode("");
      setNewPassword("");
      setResetStep("code");
    } catch (error) {
      setLocalError(resetSendMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resendResetCode = async () => {
    if (!signIn || busy) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      const result = await signIn.resetPasswordEmailCode.sendCode();
      if (result.error) setLocalError(authMessage(result.error, "authErrors.resendFailed"));
      else setCode("");
    } catch (error) {
      setLocalError(authMessage(error, "authErrors.resendFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const chooseAnotherEmail = async () => {
    if (busy) return;
    setSubmitting(true);
    try {
      await signIn?.reset();
      setCode("");
      setNewPassword("");
      setLocalError(null);
      setResetStep("email");
    } catch (error) {
      setLocalError(authMessage(error, "auth.signIn.errors.startOverFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || !clerkLoaded || busy) return;
    setLocalError(null);

    setSubmitting(true);
    let failure: TKey = "auth.signIn.errors.codeIncorrect";
    try {
      // A retry after the code was accepted, or after the session failed to
      // finalize, picks up where it stopped instead of repeating a step Clerk
      // has already completed.
      if (signIn.status !== "complete") {
        if (signIn.status !== "needs_new_password") {
          const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
          if (verified.error) {
            setLocalError(authMessage(verified.error, failure));
            return;
          }
        }
        failure = "auth.signIn.errors.resetFailed";
        const saved = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword, signOutOfOtherSessions: true });
        if (saved.error) {
          setLocalError(authMessage(saved.error, failure));
          return;
        }
      }
      await continueSignIn();
    } catch (error) {
      setLocalError(authMessage(error, failure));
    } finally {
      setSubmitting(false);
    }
  };

  if (verification) {
    const sentCode = verification === "email_code" || verification === "phone_code";
    const codeReady = verification === "backup_code" ? Boolean(code.trim()) : code.length === VERIFICATION_CODE_LENGTH;
    const title = verification === "email_code"
      ? t("auth.signIn.verify.emailTitle")
      : verification === "phone_code"
        ? t("auth.signIn.verify.phoneTitle")
        : t("auth.signIn.verify.moreTitle");
    return (
      <div className="mt-7 rounded-lg border border-line-2 bg-surface px-5 py-6 sm:px-7">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-ink">
            {verification === "email_code" ? <MailCheck className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <h2 className="mt-4 font-display text-[21px] font-semibold tracking-tight">{title}</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">
            {sentCode
              ? t(verification === "email_code" ? "auth.signIn.verify.emailSent" : "auth.signIn.verify.phoneSent")
              : verification === "totp"
                ? t("auth.signIn.verify.totp")
                : t("auth.signIn.verify.backup")}
          </p>
        </div>
        <form onSubmit={submitCode} className="mt-6 space-y-5" noValidate>
          {verification === "backup_code" ? (
            <Field label={t("auth.signIn.verify.backupLabel")} htmlFor="login-code" error={errors.fields.code ? authErrorText(errors.fields.code, "auth.signIn.errors.codeIncorrect", t) : undefined} required>
              <Input
                id="login-code"
                value={code}
                onChange={(event) => setCode(latinDigits(event.target.value))}
                autoComplete="one-time-code"
                dir="ltr"
                autoFocus
                aria-invalid={Boolean(errors.fields.code || localError)}
              />
            </Field>
          ) : (
            <VerificationCodeInput value={code} onChange={setCode} t={t} invalid={Boolean(errors.fields.code || localError)} />
          )}
          {localError ? <p className="text-center text-[12px] text-danger" role="alert">{renderAuthMessage(localError, t)}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!codeReady}>
            {t("auth.signIn.verify.submit")} <ArrowRight className="rtl:rotate-180" />
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
            <button type="button" onClick={() => void startOver()} disabled={busy} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
              <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("auth.signIn.verify.useAnother")}
            </button>
          {sentCode ? (
            <button type="button" onClick={() => void resend()} disabled={busy} className="font-medium text-ink-2 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
              {t("auth.signIn.verify.resend")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (resetStep === "email") {
    return (
      <StepCard icon={<KeyRound className="size-5" />} title={t("auth.signIn.reset.emailTitle")} body={t("auth.signIn.reset.emailBody")}>
        <form onSubmit={sendResetCode} className="mt-6 space-y-5" noValidate>
          <Field label={t("auth.signIn.emailLabel")} htmlFor="reset-email" required>
            <Input
              id="reset-email"
              type="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              autoComplete="email"
              dir="ltr"
              placeholder={t("auth.signIn.emailPlaceholder")}
              autoFocus
              aria-invalid={Boolean(localError)}
            />
          </Field>
          {localError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{renderAuthMessage(localError, t)}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!signIn || !clerkLoaded || !emailAddress.trim()}>
            {t("auth.signIn.reset.sendCode")} <ArrowRight className="rtl:rotate-180" />
          </Button>
        </form>
        <div className="mt-5 flex border-t border-line pt-4 text-[12px]">
          <button type="button" onClick={closeReset} disabled={busy} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("auth.chrome.backToSignIn")}
          </button>
        </div>
      </StepCard>
    );
  }

  if (resetStep === "code") {
    // Once Clerk has taken the code, only the new password is still needed.
    const codeAccepted = signIn?.status === "needs_new_password" || signIn?.status === "complete";
    const codeReady = codeAccepted || code.length === VERIFICATION_CODE_LENGTH;
    return (
      <StepCard
        icon={<MailCheck className="size-5" />}
        title={t(codeAccepted ? "auth.signIn.reset.passwordTitle" : "auth.signIn.reset.codeTitle")}
        body={t(codeAccepted ? "auth.signIn.reset.codeAccepted" : "auth.signIn.reset.codeSent")}
      >
        <form onSubmit={submitReset} className="mt-6 space-y-5" noValidate>
          {codeAccepted ? null : (
            <VerificationCodeInput value={code} onChange={setCode} t={t} invalid={Boolean(localError)} legend={t("auth.signIn.reset.codeLegend")} />
          )}
          <Field label={t("auth.signIn.reset.newPasswordLabel")} htmlFor="reset-new-password" required>
            <PasswordInput
              id="reset-new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder={t("auth.signIn.reset.newPasswordPlaceholder")}
              aria-invalid={Boolean(localError)}
            />
          </Field>
          {localError ? <p className="text-center text-[12px] leading-relaxed text-danger" role="alert">{renderAuthMessage(localError, t)}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!signIn || !clerkLoaded || !codeReady || !newPassword}>
            {t("auth.signIn.reset.submit")} <ArrowRight className="rtl:rotate-180" />
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
          <button type="button" onClick={() => void chooseAnotherEmail()} disabled={busy} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> {t("auth.signIn.reset.useAnotherEmail")}
          </button>
          {codeAccepted ? null : (
            <button type="button" onClick={() => void resendResetCode()} disabled={busy} className="font-medium text-ink-2 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
              {t("authErrors.resend")}
            </button>
          )}
        </div>
      </StepCard>
    );
  }

  return (
    <form onSubmit={submitPassword} className="mt-7 space-y-4" noValidate>
      <Field label={t("auth.signIn.emailLabel")} htmlFor="login-email" error={errors.fields.identifier ? authErrorText(errors.fields.identifier, "auth.signIn.errors.incorrect", t) : undefined} required>
        <Input
          ref={emailRef}
          id="login-email"
          type="email"
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
          autoComplete="email"
          dir="ltr"
          placeholder={t("auth.signIn.emailPlaceholder")}
          autoFocus
          aria-invalid={Boolean(errors.fields.identifier)}
        />
      </Field>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <Label htmlFor="login-password" className="mb-0">
            {t("common.label.password")}
            <span className="ms-1 text-signal" aria-hidden>*</span>
          </Label>
          <button
            type="button"
            onClick={openReset}
            disabled={busy}
            className="text-[12px] font-medium text-ink-2 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            {t("auth.signIn.forgotPassword")}
          </button>
        </div>
        <Field htmlFor="login-password" error={errors.fields.password ? authErrorText(errors.fields.password, "auth.signIn.errors.incorrect", t) : undefined}>
          <PasswordInput
            ref={passwordRef}
            id="login-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder={t("auth.signIn.passwordPlaceholder")}
            aria-invalid={Boolean(errors.fields.password)}
            aria-describedby={errors.fields.password ? "login-password-error" : undefined}
          />
        </Field>
      </div>
      {localError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{renderAuthMessage(localError, t)}</p> : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={!signIn || !clerkLoaded || !emailAddress.trim() || !password}
      >
        {t("common.action.signIn")} <ArrowRight className="rtl:rotate-180" />
      </Button>
      {signUp ? (
        <p className="text-center text-[12px] text-ink-3">
          {t("auth.signIn.newMember")}{" "}
          <Link
            href={redirectUrl === "/login" ? "/login/member/create" : `/login/member/create?returnTo=${encodeURIComponent(redirectUrl)}`}
            className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink"
          >
            {t("auth.signIn.createFreeAccount")}
          </Link>
        </p>
      ) : null}
    </form>
  );
}

const VERIFICATION_CODE_LENGTH = 6;

/** The card both reset steps sit in; it matches the second sign-in step's. */
function StepCard({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children: ReactNode }) {
  return (
    <div className="mt-7 rounded-lg border border-line-2 bg-surface px-5 py-6 sm:px-7">
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-ink">{icon}</span>
        <h2 className="mt-4 font-display text-[21px] font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-ink-2">{body}</p>
      </div>
      {children}
    </div>
  );
}

function VerificationCodeInput({ value, onChange, invalid, t, legend }: { value: string; onChange: (value: string) => void; invalid: boolean; t: TFunction; legend?: string }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => value[index] ?? "");

  const update = (index: number, rawValue: string) => {
    const incoming = latinDigits(rawValue).replace(/\D/g, "");
    if (incoming.length > 1) {
      const next = incoming.slice(0, VERIFICATION_CODE_LENGTH);
      onChange(next);
      inputs.current[Math.max(0, Math.min(next.length, VERIFICATION_CODE_LENGTH) - 1)]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = incoming.slice(-1);
    onChange(next.join(""));
    if (incoming && index < VERIFICATION_CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < VERIFICATION_CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  return (
    <fieldset>
      <legend className="mb-3 w-full text-center text-[12px] font-medium text-ink-2">{legend ?? t("auth.signIn.verify.codeLegend")}</legend>
      {/* A code reads left to right in both languages, so the boxes do too. */}
      <div className="grid grid-cols-6 gap-2" dir="ltr" aria-label={legend ?? t("auth.signIn.verify.codeLegend")}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(node) => { inputs.current[index] = node; }}
            id={`login-code-${index}`}
            value={digit}
            onChange={(event) => update(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={index === 0 ? VERIFICATION_CODE_LENGTH : 1}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            autoFocus={index === 0}
            aria-label={t("auth.signIn.verify.digit", { number: index + 1 })}
            aria-invalid={invalid}
            className="h-13 min-w-0 rounded-md border border-line-2 bg-paper text-center font-mono text-[20px] font-semibold text-ink outline-none transition-[border-color,box-shadow,background] focus:border-ink focus:bg-surface focus:ring-2 focus:ring-ink/10 aria-invalid:border-danger"
          />
        ))}
      </div>
    </fieldset>
  );
}
