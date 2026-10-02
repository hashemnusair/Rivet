"use client";

import { loginHref, safeInternalRedirect } from "@/lib/routing/host-routing";
import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useT, type TFunction } from "@/lib/i18n/provider";

type VerificationKind = "email_code" | "phone_code" | "totp" | "backup_code";

/**
 * A stable password-first Clerk flow. Unlike Clerk's adaptive prebuilt view,
 * this always paints both primary fields immediately and only introduces a
 * second step when Client Trust or user-enabled MFA genuinely requires it.
 */
export function PasswordSignIn({ redirectUrl = "/login", signUp = true }: { redirectUrl?: string; signUp?: boolean }) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const t = useT();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [verification, setVerification] = useState<VerificationKind | null>(null);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
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
        setLocalError(messageFrom(error, t("auth.signIn.errors.couldNotSignIn")));
        return false;
      }
      if (/^https?:\/\//i.test(decoratedRedirect)) window.location.assign(decoratedRedirect);
      else router.replace(decoratedRedirect);
      return true;
    } catch (error) {
      setLocalError(messageFrom(error, t("auth.signIn.errors.couldNotSignIn")));
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

    throw new Error(t("auth.signIn.errors.unsupportedStep"));
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || busy) return;
    setLocalError(null);

    setSubmitting(true);
    try {
      const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
      if (error) {
        setLocalError(messageFrom(error, t("auth.signIn.errors.incorrect")));
        return;
      }

      if (signIn.status === "complete") {
        await finish();
        return;
      }

      if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        try {
          await beginVerification();
        } catch (verificationError) {
          setLocalError(messageFrom(verificationError, t("auth.signIn.errors.nextStepFailed")));
        }
        return;
      }

      setLocalError(t("auth.signIn.errors.anotherStep"));
    } catch (error) {
      setLocalError(messageFrom(error, t("auth.signIn.errors.incorrect")));
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
        setLocalError(messageFrom(result.error, t("auth.signIn.errors.codeIncorrect")));
        return;
      }
      if (!(await finish()) && signIn.status !== "complete") {
        setLocalError(t("auth.signIn.errors.notFinished"));
      }
    } catch (error) {
      setLocalError(messageFrom(error, t("auth.signIn.errors.codeIncorrect")));
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
      if (result.error) setLocalError(messageFrom(result.error, t("auth.signIn.errors.resendFailed")));
    } catch (error) {
      setLocalError(messageFrom(error, t("auth.signIn.errors.resendFailed")));
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
      setCode("");
      setLocalError(null);
    } catch (error) {
      setLocalError(messageFrom(error, t("auth.signIn.errors.startOverFailed")));
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
            <Field label={t("auth.signIn.verify.backupLabel")} htmlFor="login-code" error={errors.fields.code?.message} required>
              <Input
                id="login-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                dir="ltr"
                autoFocus
                aria-invalid={Boolean(errors.fields.code || localError)}
              />
            </Field>
          ) : (
            <VerificationCodeInput value={code} onChange={setCode} t={t} invalid={Boolean(errors.fields.code || localError)} />
          )}
          {localError ? <p className="text-center text-[12px] text-danger" role="alert">{localError}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!codeReady}>
            {t("auth.signIn.verify.submit")} <ArrowRight />
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
            <button type="button" onClick={() => void startOver()} disabled={busy} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-50">
              <ArrowLeft className="size-3.5" /> {t("auth.signIn.verify.useAnother")}
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

  return (
    <form onSubmit={submitPassword} className="mt-7 space-y-4" noValidate>
      <Field label={t("auth.signIn.emailLabel")} htmlFor="login-email" error={errors.fields.identifier?.message} required>
        <Input
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
      <Field label={t("common.label.password")} htmlFor="login-password" error={errors.fields.password?.message} required>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder={t("auth.signIn.passwordPlaceholder")}
          aria-invalid={Boolean(errors.fields.password)}
          aria-describedby={errors.fields.password ? "login-password-error" : undefined}
        />
      </Field>
      {localError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{localError}</p> : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={!signIn || !emailAddress.trim() || !password}
      >
        {t("common.action.signIn")} <ArrowRight />
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

function VerificationCodeInput({ value, onChange, invalid, t }: { value: string; onChange: (value: string) => void; invalid: boolean; t: TFunction }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: VERIFICATION_CODE_LENGTH }, (_, index) => value[index] ?? "");

  const update = (index: number, rawValue: string) => {
    const incoming = rawValue.replace(/\D/g, "");
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
      <legend className="mb-3 w-full text-center text-[12px] font-medium text-ink-2">{t("auth.signIn.verify.codeLegend")}</legend>
      {/* A code reads left to right in both languages, so the boxes do too. */}
      <div className="grid grid-cols-6 gap-2" dir="ltr" aria-label={t("auth.signIn.verify.codeLegend")}>
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

function messageFrom(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const candidate = error as { message?: unknown; errors?: Array<{ longMessage?: unknown; message?: unknown }> };
  const first = candidate.errors?.[0];
  if (typeof first?.longMessage === "string") return first.longMessage;
  if (typeof first?.message === "string") return first.message;
  if (typeof candidate.message === "string") return candidate.message;
  return fallback;
}
