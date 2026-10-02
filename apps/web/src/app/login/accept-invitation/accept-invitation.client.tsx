"use client";

import { AuthFlowError, authErrorText } from "@/lib/auth/messages";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { ArrowRight, CircleAlert, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { LoginLayout } from "../login-chrome";
import { PORTALS } from "../portals";
import { api } from "../../../../convex/_generated/api";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { INVITATION_CLAIMED_EVENT } from "@/lib/auth/rivet-identity";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import { englishT } from "../english-t";

/** Field messages come from the reader's language; the exported default is English. */
export function createInvitationAccountSchema(t: TFunction) {
  return z
    .object({
      firstName: z.string().trim().min(1, t("auth.validation.firstName")).max(80, t("auth.validation.max80")),
      lastName: z.string().trim().min(1, t("auth.validation.lastName")).max(80, t("auth.validation.max80")),
      password: z.string().min(8, t("auth.validation.passwordMin")).max(128, t("auth.validation.passwordMax")),
      confirmPassword: z.string(),
    })
    .refine((value) => value.password === value.confirmPassword, {
      path: ["confirmPassword"],
      message: t("auth.validation.passwordMismatch"),
    });
}

export const invitationAccountSchema = createInvitationAccountSchema(englishT);

type InvitationStatus = "sign_in" | "sign_up" | "complete" | "expired" | "revoked" | "invalid";
type InvitationState = "form" | "processing" | "success" | "error" | "conflict";

function normalizeInvitationStatus(value: string | null): InvitationStatus {
  if (value === "sign_in" || value === "sign_up" || value === "complete") return value;
  if (value === "expired" || value === "revoked") return value;
  return "invalid";
}

/** Known invitation codes and safe provider descriptors only; never show a raw ticket. */
export function invitationErrorMessage(error: unknown, t: TFunction = englishT): string {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; longMessage?: unknown; long_message?: unknown } : {};
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  if (code.includes("expired")) return t("auth.invitation.error.expired");
  if (code.includes("revoked")) return t("auth.invitation.error.revoked");
  if (code.includes("already_accepted")) return t("auth.invitation.error.alreadyUsed");
  if (code.includes("email_address_mismatch") || code.includes("email_mismatch")) return t("auth.invitation.error.emailMismatch");
  if (code.includes("invitation_not_accepted")) return t("auth.invitation.error.notConfirmed");
  return authErrorText(error, "auth.invitation.error.generic", t);
}

function InvitationFrame({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return <LoginLayout portal={PORTALS.staff} footer={<p className="text-center text-[12px] text-ink-3">{t("auth.chrome.secureSignIn")}</p>}>{children}</LoginLayout>;
}

/**
 * The link states that need no identity service (no ticket, expired, revoked)
 * render on their own. Everything else needs Clerk and the Convex claim
 * action, which only exist in a connected deployment; the mock preview says
 * so instead of throwing.
 */
export function AcceptInvitation() {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("__clerk_ticket");
  const status = normalizeInvitationStatus(searchParams.get("__clerk_status"));
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { t } = useLocale();
  // The seeded preview never has a Clerk session, so its identity is known
  // to be signed out even though Clerk itself never reports as loaded.
  const identityKnown = authLoaded || DEMO_AUTH_BYPASS;
  const signedIn = authLoaded && Boolean(isSignedIn);
  const [invitationFlowStarted, setInvitationFlowStarted] = useState(false);
  const markInvitationFlowStarted = useCallback(() => setInvitationFlowStarted(true), []);

  useEffect(() => {
    if (status === "complete" && signedIn) router.replace("/login");
  }, [router, signedIn, status]);

  if (!ticket || status === "invalid") {
    return <InvitationFrame><InvitationError title={t("auth.invitation.linkBrokenTitle")} body={t("auth.invitation.linkBrokenBody")} /></InvitationFrame>;
  }

  if (status === "expired" || status === "revoked") {
    return <InvitationFrame><InvitationError title={status === "expired" ? t("auth.invitation.expiredTitle") : t("auth.invitation.cancelledTitle")} body={invitationErrorMessage({ code: status }, t)} /></InvitationFrame>;
  }

  // Clerk marks a ticket complete once its account exists. Opened again while
  // signed out, the link has nothing left to do except point at sign-in.
  if (status === "complete") {
    if (signedIn) return <InvitationFrame><InvitationProgress state="success" /></InvitationFrame>;
    if (identityKnown) return <InvitationFrame><InvitationError tone="done" title={t("auth.invitation.alreadyAcceptedTitle")} body={t("auth.invitation.alreadyAcceptedBody")} action={t("auth.invitation.signIn")} /></InvitationFrame>;
    return <InvitationFrame><InvitationProgress state="processing" /></InvitationFrame>;
  }

  // Do not mount the ticket flow while Clerk is still hydrating. A session
  // that is about to become visible must be treated as preexisting so the
  // invitation cannot auto-claim it for the wrong account.
  if (!identityKnown) {
    return <InvitationFrame><InvitationProgress state="processing" /></InvitationFrame>;
  }

  if (signedIn && !invitationFlowStarted) {
    return <InvitationFrame><InvitationConflict onSignOut={() => void signOut({ redirectUrl: window.location.href })} /></InvitationFrame>;
  }

  if (!CONVEX_ENABLED) {
    return <InvitationFrame><InvitationError tone="done" title={t("auth.invitation.notHereTitle")} body={t("auth.invitation.notHereBody")} action={t("auth.chrome.backToSignIn")} /></InvitationFrame>;
  }

  return <InvitationFlow ticket={ticket} status={status} onSignInStarted={markInvitationFlowStarted} />;
}

function InvitationFlow({ ticket, status, onSignInStarted }: { ticket: string; status: "sign_in" | "sign_up"; onSignInStarted: () => void }) {
  const router = useRouter();
  const { t } = useLocale();
  const invitationAccountSchemaForReader = invitationAccountSchema;
  const { fetchStatus: signInFetchStatus, signIn } = useSignIn();
  const { fetchStatus: signUpFetchStatus, signUp } = useSignUp();
  const claimInvitation = useAction(api.users.claimInvitation);
  const [state, setState] = useState<InvitationState>(status === "sign_up" ? "form" : "processing");
  const [errorSource, setError] = useState<unknown>();
  const error = errorSource ? invitationErrorMessage(errorSource, t) : undefined;
  const [values, setValues] = useState({ firstName: "", lastName: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const attempted = useRef(false);

  useEffect(() => {
    if (status !== "sign_in" || !signIn || signInFetchStatus === "fetching" || attempted.current) return;
    onSignInStarted();
    attempted.current = true;
    setState("processing");
    void (async () => {
      const result = await signIn.create({ strategy: "ticket", ticket });
      if (result.error) throw result.error;
      if (signIn.status !== "complete") {
        throw new AuthFlowError({ key: "auth.invitation.error.needsSignInStep" });
      }
      const finalized = await signIn.finalize();
      if (finalized.error) throw finalized.error;
      const claim = await claimInvitation({});
      if (!claim.claimed) throw { code: "INVITATION_NOT_ACCEPTED" };
      window.dispatchEvent(new Event(INVITATION_CLAIMED_EVENT));
      setState("success");
      router.replace("/login");
    })().catch((reason: unknown) => {
      setState("error");
      setError(reason);
    });
  }, [claimInvitation, onSignInStarted, router, signIn, signInFetchStatus, status, t, ticket]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status !== "sign_up" || !signUp || signUpFetchStatus === "fetching") return;
    const parsed = invitationAccountSchemaForReader.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof typeof values, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof values;
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    setError(undefined);
    onSignInStarted();
    setState("processing");
    try {
      const result = await signUp.create({
        strategy: "ticket",
        ticket,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        password: parsed.data.password,
      });
      if (result.error) throw result.error;
      if (signUp.status !== "complete") {
        throw new AuthFlowError({ key: "auth.invitation.error.needsDetails" });
      }
      const finalized = await signUp.finalize();
      if (finalized.error) throw finalized.error;
      const claim = await claimInvitation({});
      if (!claim.claimed) throw { code: "INVITATION_NOT_ACCEPTED" };
      window.dispatchEvent(new Event(INVITATION_CLAIMED_EVENT));
      setState("success");
      toast.success(t("auth.invitation.form.accountReady"));
      router.replace("/login");
    } catch (reason: unknown) {
      setState("form");
      setError(reason);
    }
  };

  if (status === "sign_up" && state === "form") {
    return (
      <InvitationFrame>
        <div className="animate-fade-up">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper" aria-hidden><ShieldCheck className="size-5" /></span>
            <div><h1 className="font-display text-[23px] font-semibold leading-tight tracking-tight">{t("auth.invitation.form.title")}</h1><p className="mt-1 text-[13px] leading-snug text-ink-2">{t("auth.invitation.form.intro")}</p></div>
          </div>
          <form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("auth.invitation.form.firstName")} htmlFor="invitation-first-name" error={fieldErrors.firstName ? authErrorText({ message: fieldErrors.firstName }, "auth.validation.firstName", t) : undefined} required><Input id="invitation-first-name" autoComplete="given-name" dir="auto" autoFocus value={values.firstName} onChange={(event) => setValues((current) => ({ ...current, firstName: event.target.value }))} /></Field>
              <Field label={t("auth.invitation.form.lastName")} htmlFor="invitation-last-name" error={fieldErrors.lastName ? authErrorText({ message: fieldErrors.lastName }, "auth.validation.lastName", t) : undefined} required><Input id="invitation-last-name" autoComplete="family-name" dir="auto" value={values.lastName} onChange={(event) => setValues((current) => ({ ...current, lastName: event.target.value }))} /></Field>
            </div>
            <Field label={t("auth.invitation.form.password")} htmlFor="invitation-password" hint={t("auth.invitation.form.passwordHint")} error={fieldErrors.password ? authErrorText({ message: fieldErrors.password }, "auth.validation.passwordMin", t) : undefined} required><PasswordInput id="invitation-password" autoComplete="new-password" value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} aria-describedby={fieldErrors.password ? "invitation-password-error" : "invitation-password-hint"} /></Field>
            <Field label={t("auth.invitation.form.confirmPassword")} htmlFor="invitation-confirm-password" error={fieldErrors.confirmPassword ? authErrorText({ message: fieldErrors.confirmPassword }, "auth.validation.passwordMismatch", t) : undefined} required><PasswordInput id="invitation-confirm-password" autoComplete="new-password" value={values.confirmPassword} onChange={(event) => setValues((current) => ({ ...current, confirmPassword: event.target.value }))} aria-describedby={fieldErrors.confirmPassword ? "invitation-confirm-password-error" : undefined} /></Field>
            {error ? <p className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-bg px-3 py-2.5 text-[12px] leading-relaxed text-danger" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
            <Button type="submit" size="lg" className="mt-1 w-full" loading={signUpFetchStatus === "fetching"} disabled={signUpFetchStatus === "fetching"}>{t("auth.invitation.form.submit")} <ArrowRight className="size-4 rtl:rotate-180" /></Button>
          </form>
          <p className="mt-5 flex items-center gap-2 text-[12.5px] leading-relaxed text-ink-3"><LockKeyhole className="size-3.5 shrink-0" aria-hidden />{t("auth.invitation.form.onceOnly")}</p>
        </div>
      </InvitationFrame>
    );
  }

  if (state === "error") {
    return <InvitationFrame><InvitationError title={t("auth.invitation.couldNotAcceptTitle")} body={error ?? t("auth.invitation.couldNotAcceptBody")} /></InvitationFrame>;
  }

  return <InvitationFrame><InvitationProgress state={state === "success" ? "success" : "processing"} /></InvitationFrame>;
}

function InvitationProgress({ state }: { state: "processing" | "success" }) {
  const { t } = useLocale();
  return <div className="flex min-h-56 flex-col items-center justify-center text-center" role="status" aria-live="polite"><div className="relative flex size-16 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full border border-line-3 opacity-30" aria-hidden /><span className="absolute inset-2 rounded-full bg-sunken" aria-hidden /><MailCheck className="relative size-7 text-signal" aria-hidden /></div><p className="mt-5 font-display text-[18px] font-semibold tracking-tight">{state === "success" ? t("auth.invitation.progress.accepted") : t("auth.invitation.progress.checking")}</p><p className="mt-1.5 text-[12.5px] text-ink-3">{state === "success" ? t("auth.invitation.progress.opening") : t("auth.invitation.progress.moment")}</p><AuthProgressBar className="mt-5 w-36" /></div>;
}

function InvitationError({ title, body, tone = "error", action }: { title: string; body: string; tone?: "error" | "done"; action?: string }) {
  const { t } = useLocale();
  const done = tone === "done";
  return (
    <div className="mt-7" role={done ? "status" : "alert"}>
      <div className={done ? "rounded-lg border border-line-2 bg-surface p-4" : "rounded-lg border border-danger/25 bg-danger-bg p-4"}>
        <p className={done ? "flex items-center gap-2 text-[13px] font-semibold text-ink" : "flex items-center gap-2 text-[13px] font-semibold text-danger"}>{done ? <MailCheck className="size-4 text-ink-3" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}{title}</p>
        <p className={done ? "mt-2 text-[12.5px] leading-relaxed text-ink-2" : "mt-2 text-[12.5px] leading-relaxed text-danger/90"}>{body}</p>
      </div>
      <Button asChild variant={done ? "primary" : "secondary"} className="mt-5 w-full" size="lg"><a href="/login">{action ?? t("auth.chrome.backToSignIn")}</a></Button>
    </div>
  );
}

function InvitationConflict({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useLocale();
  return <div className="mt-7" role="status"><div className="rounded-lg border border-warning/30 bg-warning-bg p-4"><p className="flex items-center gap-2 text-[13px] font-semibold text-warning-deep"><CircleAlert className="size-4" aria-hidden />{t("auth.invitation.conflict.title")}</p><p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep/90">{t("auth.invitation.conflict.body")}</p></div><Button className="mt-5 w-full" size="lg" onClick={onSignOut}>{t("auth.invitation.conflict.submit")} <ArrowRight className="size-4 rtl:rotate-180" /></Button></div>;
}
