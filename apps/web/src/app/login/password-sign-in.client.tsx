"use client";

import { useSignIn } from "@clerk/nextjs";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
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
    return (
      <div className="mt-7">
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-line-2 bg-surface p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
            <LockKeyhole className="size-4" />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold">Verify this sign-in</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              {sentCode
                ? `Clerk sent a security code to your ${verification === "email_code" ? "email" : "phone"}.`
                : verification === "totp"
                  ? "Enter the code from your authenticator app."
                  : "Enter one of your backup codes."}
            </p>
          </div>
        </div>
        <form onSubmit={submitCode} className="space-y-4" noValidate>
          <Field label="Verification code" htmlFor="login-code" error={errors.fields.code?.message} required>
            <Input
              id="login-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode={verification === "backup_code" ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              aria-invalid={Boolean(errors.fields.code || localError)}
            />
          </Field>
          {localError ? <p className="text-[12px] text-danger" role="alert">{localError}</p> : null}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!code.trim()}>
            Verify and continue <ArrowRight />
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between gap-3 text-[12px]">
          <button type="button" onClick={() => void startOver()} className="text-ink-3 underline underline-offset-4 hover:text-ink">
            Use another account
          </button>
          {sentCode ? (
            <button type="button" onClick={() => void resend()} className="font-medium text-ink-2 underline underline-offset-4 hover:text-ink">
              Resend code
            </button>
          ) : null}
        </div>
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

function messageFrom(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const candidate = error as { message?: unknown; errors?: Array<{ longMessage?: unknown; message?: unknown }> };
  const first = candidate.errors?.[0];
  if (typeof first?.longMessage === "string") return first.longMessage;
  if (typeof first?.message === "string") return first.message;
  if (typeof candidate.message === "string") return candidate.message;
  return fallback;
}
