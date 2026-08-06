"use client";

import { useSignIn } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type VerificationKind = "email_code" | "phone_code" | "totp" | "backup_code";

/**
 * A stable password-first Clerk flow. Unlike Clerk's adaptive prebuilt view,
 * this always paints both primary fields immediately and only introduces a
 * second step when Client Trust or user-enabled MFA genuinely requires it.
 */
export function PasswordSignIn() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState<VerificationKind | null>(null);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const busy = fetchStatus === "fetching" || finishing;

  const finish = async () => {
    if (!signIn || signIn.status !== "complete") return false;
    setFinishing(true);
    const { error } = await signIn.finalize();
    if (error) {
      setLocalError(messageFrom(error, "Your session could not be started. Please try again."));
      setFinishing(false);
      return false;
    }
    return true;
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

    throw new Error("This account requires a verification method that is not available on this page.");
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || busy) return;
    setLocalError(null);

    const { error } = await signIn.password({ emailAddress: emailAddress.trim(), password });
    if (error) {
      setLocalError(messageFrom(error, "The email or password is incorrect."));
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
        setLocalError(messageFrom(verificationError, "Additional verification could not be started."));
      }
      return;
    }

    setLocalError("Sign-in needs an additional step. Please try again or contact RIVET support.");
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signIn || !verification || busy) return;
    setLocalError(null);

    const result =
      verification === "email_code"
        ? await signIn.mfa.verifyEmailCode({ code: code.trim() })
        : verification === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code: code.trim() })
          : verification === "totp"
            ? await signIn.mfa.verifyTOTP({ code: code.trim() })
            : await signIn.mfa.verifyBackupCode({ code: code.trim() });

    if (result.error) {
      setLocalError(messageFrom(result.error, "That verification code is not valid."));
      return;
    }
    if (!(await finish())) setLocalError("Verification is not complete yet. Please try again.");
  };

  const resend = async () => {
    if (!signIn || busy) return;
    setLocalError(null);
    const result = verification === "email_code" ? await signIn.mfa.sendEmailCode() : await signIn.mfa.sendPhoneCode();
    if (result.error) setLocalError(messageFrom(result.error, "A new code could not be sent."));
  };

  const startOver = async () => {
    if (!signIn) return;
    await signIn.reset();
    setVerification(null);
    setCode("");
    setLocalError(null);
  };

  if (verification) {
    const sentCode = verification === "email_code" || verification === "phone_code";
    const codeReady = verification === "backup_code" ? Boolean(code.trim()) : code.length === VERIFICATION_CODE_LENGTH;
    const title = verification === "email_code"
      ? "Check your email"
      : verification === "phone_code"
        ? "Check your phone"
        : "Two-step verification";
    return (
      <div className="mt-7 rounded-xl border border-line-2 bg-surface px-5 py-6 shadow-[0_18px_50px_rgba(21,20,15,0.06)] sm:px-7">
        <div className="text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-sunken text-ink">
            {verification === "email_code" ? <MailCheck className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <h2 className="mt-4 font-display text-[21px] font-semibold tracking-tight">{title}</h2>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">
            {sentCode
              ? `We sent a six-digit security code to your ${verification === "email_code" ? "email address" : "phone number"}. Enter it below to finish signing in.`
              : verification === "totp"
                ? "Enter the six-digit code from your authenticator app to finish signing in."
                : "Enter one of the backup codes saved when two-step verification was enabled."}
          </p>
        </div>
        <form onSubmit={submitCode} className="mt-6 space-y-5" noValidate>
          {verification === "backup_code" ? (
            <Field label="Backup code" htmlFor="login-code" error={errors.fields.code?.message} required>
              <Input
                id="login-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="one-time-code"
                autoFocus
                aria-invalid={Boolean(errors.fields.code || localError)}
              />
            </Field>
          ) : (
            <VerificationCodeInput value={code} onChange={setCode} invalid={Boolean(errors.fields.code || localError)} />
          )}
          {localError ? <p className="text-center text-[12px] text-danger" role="alert">{localError}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!codeReady}>
            Verify and continue <ArrowRight />
          </Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
          <button type="button" onClick={() => void startOver()} className="inline-flex items-center gap-1.5 text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" /> Use another account
          </button>
          {sentCode ? (
            <button type="button" onClick={() => void resend()} className="font-medium text-ink-2 transition-colors hover:text-ink">
              Didn’t receive it? Resend
            </button>
          ) : null}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] uppercase tracking-[0.11em] text-ink-4">
          <LockKeyhole className="size-3" /> Secure verification by Clerk
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submitPassword} className="mt-7 space-y-4" noValidate>
      <Field label="Email address" htmlFor="login-email" error={errors.fields.identifier?.message} required>
        <Input
          id="login-email"
          type="email"
          value={emailAddress}
          onChange={(event) => setEmailAddress(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          autoFocus
          aria-invalid={Boolean(errors.fields.identifier)}
        />
      </Field>
      <Field label="Password" htmlFor="login-password" error={errors.fields.password?.message} required>
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="pe-10"
            aria-invalid={Boolean(errors.fields.password)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {localError ? <p className="text-[12px] leading-relaxed text-danger" role="alert">{localError}</p> : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={!signIn || !emailAddress.trim() || !password}
      >
        Sign in <ArrowRight />
      </Button>
      <p className="text-center text-[12px] text-ink-3">
        New member?{" "}
        <Link href="/login/member/create" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
          Create a free account
        </Link>
      </p>
    </form>
  );
}

const VERIFICATION_CODE_LENGTH = 6;

function VerificationCodeInput({ value, onChange, invalid }: { value: string; onChange: (value: string) => void; invalid: boolean }) {
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
      <legend className="mb-3 w-full text-center text-[12px] font-medium text-ink-2">Verification code</legend>
      <div className="grid grid-cols-6 gap-2" aria-label="Verification code">
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
            aria-label={`Digit ${index + 1}`}
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
