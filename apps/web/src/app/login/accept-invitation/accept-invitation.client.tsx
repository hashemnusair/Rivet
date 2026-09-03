"use client";

import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { ArrowRight, CircleAlert, LockKeyhole, MailCheck, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { LoginLayout } from "../login-chrome";
import { PORTALS } from "../portals";
import { api } from "../../../../convex/_generated/api";
import { INVITATION_CLAIMED_EVENT } from "@/lib/auth/rivet-identity";

export const invitationAccountSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name").max(80, "Use 80 characters or fewer"),
    lastName: z.string().trim().min(1, "Enter your last name").max(80, "Use 80 characters or fewer"),
    password: z.string().min(8, "Use at least 8 characters").max(128, "Use 128 characters or fewer"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type InvitationStatus = "sign_in" | "sign_up" | "complete" | "expired" | "revoked" | "invalid";
type InvitationState = "form" | "processing" | "success" | "error" | "conflict";

function normalizeInvitationStatus(value: string | null): InvitationStatus {
  if (value === "sign_in" || value === "sign_up" || value === "complete") return value;
  if (value === "expired" || value === "revoked") return value;
  return "invalid";
}

/** Never surface a Clerk response containing the invitation ticket itself. */
export function invitationErrorMessage(error: unknown): string {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; longMessage?: unknown; long_message?: unknown } : {};
  const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
  if (code.includes("expired")) return "This invitation has expired. Ask your RIVET contact to send a new one.";
  if (code.includes("revoked")) return "This invitation was revoked. Ask your RIVET contact to send a new one.";
  if (code.includes("already_accepted")) return "This invitation has already been accepted. Sign in with the invited email address.";
  if (code.includes("email_address_mismatch") || code.includes("email_mismatch")) return "This invitation belongs to a different email address. Open it from the invited inbox.";
  if (code.includes("invitation_not_accepted")) return "We could not verify this invitation. Open the original invitation link again or ask your RIVET contact to resend it.";
  const message = [record.longMessage, record.long_message, record.message].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return message ? message.replace(/(?:__clerk_ticket|ticket)=?[^&\s]*/gi, "invitation link").slice(0, 240) : "We could not accept this invitation. Ask your RIVET contact to send a new one.";
}

function InvitationFrame({ children }: { children: ReactNode }) {
  return <LoginLayout portal={PORTALS.staff} footer={<p className="text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-4">Secure identity by Clerk · gym access issued by RIVET</p>}>{children}</LoginLayout>;
}

export function AcceptInvitation() {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("__clerk_ticket");
  const status = normalizeInvitationStatus(searchParams.get("__clerk_status"));
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { fetchStatus: signInFetchStatus, signIn } = useSignIn();
  const { fetchStatus: signUpFetchStatus, signUp } = useSignUp();
  const claimInvitation = useAction(api.users.claimInvitation);
  const [state, setState] = useState<InvitationState>(status === "sign_up" ? "form" : "processing");
  const [error, setError] = useState<string>();
  const [values, setValues] = useState({ firstName: "", lastName: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof values, string>>>({});
  const attempted = useRef(false);

  useEffect(() => {
    if (!ticket || status !== "sign_in" || !authLoaded || isSignedIn || !signIn || signInFetchStatus === "fetching" || attempted.current) return;
    attempted.current = true;
    setState("processing");
    void (async () => {
      const result = await signIn.create({ strategy: "ticket", ticket });
      if (result.error) throw result.error;
      if (signIn.status !== "complete") {
        throw new Error("This invitation needs another sign-in step before it can be accepted.");
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
      setError(invitationErrorMessage(reason));
    });
  }, [authLoaded, claimInvitation, isSignedIn, router, signIn, signInFetchStatus, status, ticket]);

  useEffect(() => {
    if (status === "complete" && authLoaded && isSignedIn) {
      setState("success");
      router.replace("/login");
    }
  }, [authLoaded, isSignedIn, router, status]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ticket || status !== "sign_up" || !signUp || signUpFetchStatus === "fetching") return;
    const parsed = invitationAccountSchema.safeParse(values);
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
        throw new Error("Your account still needs information before the invitation can be accepted.");
      }
      const finalized = await signUp.finalize();
      if (finalized.error) throw finalized.error;
      const claim = await claimInvitation({});
      if (!claim.claimed) throw { code: "INVITATION_NOT_ACCEPTED" };
      window.dispatchEvent(new Event(INVITATION_CLAIMED_EVENT));
      setState("success");
      toast.success("Your gym account is ready.");
      router.replace("/login");
    } catch (reason: unknown) {
      setState("form");
      setError(invitationErrorMessage(reason));
    }
  };

  if (!ticket || status === "invalid") {
    return <InvitationFrame><InvitationError title="Invitation link not recognized" body="Open the invitation link from the email RIVET sent you. If it still fails, ask your RIVET contact to resend it." /></InvitationFrame>;
  }

  if (status === "expired" || status === "revoked") {
    return <InvitationFrame><InvitationError title={status === "expired" ? "Invitation expired" : "Invitation revoked"} body={invitationErrorMessage({ code: status })} /></InvitationFrame>;
  }

  if (authLoaded && isSignedIn && status !== "complete") {
    return <InvitationFrame><InvitationConflict onSignOut={() => void signOut({ redirectUrl: window.location.href })} /></InvitationFrame>;
  }

  if (status === "sign_up" && state === "form") {
    return (
      <InvitationFrame>
        <div className="animate-fade-up">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper"><ShieldCheck className="size-5" /></span>
            <div><p className="context-label">RIVET gym access</p><h1 className="mt-2 font-display text-[23px] font-semibold leading-tight tracking-tight">Create your owner account</h1><p className="mt-1 text-[13px] leading-snug text-ink-2">Your invitation is verified. Set a password to open the gym workspace.</p></div>
          </div>
          <form className="mt-7 grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="invitation-first-name" error={fieldErrors.firstName} required><Input id="invitation-first-name" autoComplete="given-name" autoFocus value={values.firstName} onChange={(event) => setValues((current) => ({ ...current, firstName: event.target.value }))} /></Field>
              <Field label="Last name" htmlFor="invitation-last-name" error={fieldErrors.lastName} required><Input id="invitation-last-name" autoComplete="family-name" value={values.lastName} onChange={(event) => setValues((current) => ({ ...current, lastName: event.target.value }))} /></Field>
            </div>
            <Field label="Password" htmlFor="invitation-password" hint="At least 8 characters" error={fieldErrors.password} required><Input id="invitation-password" type="password" autoComplete="new-password" value={values.password} onChange={(event) => setValues((current) => ({ ...current, password: event.target.value }))} /></Field>
            <Field label="Confirm password" htmlFor="invitation-confirm-password" error={fieldErrors.confirmPassword} required><Input id="invitation-confirm-password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={(event) => setValues((current) => ({ ...current, confirmPassword: event.target.value }))} /></Field>
            {error ? <p className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger-bg px-3 py-2.5 text-[12px] leading-relaxed text-danger" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
            <Button type="submit" size="lg" className="mt-1 w-full" loading={signUpFetchStatus === "fetching"} disabled={signUpFetchStatus === "fetching"}>Open gym workspace <ArrowRight className="size-4" /></Button>
          </form>
          <p className="mt-5 flex items-center gap-2 text-[11.5px] leading-relaxed text-ink-3"><LockKeyhole className="size-3.5 shrink-0" />This link is single-use and tied to the invited email address.</p>
        </div>
      </InvitationFrame>
    );
  }

  if (state === "error") {
    return <InvitationFrame><InvitationError title="Invitation could not be accepted" body={error ?? "Ask your RIVET contact to resend the invitation."} /></InvitationFrame>;
  }

  return <InvitationFrame><div className="flex min-h-56 flex-col items-center justify-center text-center" role="status" aria-live="polite"><div className="relative flex size-16 items-center justify-center"><span className="absolute inset-0 animate-ping rounded-full border border-line-3 opacity-30" aria-hidden /><span className="absolute inset-2 rounded-full bg-sunken" aria-hidden /><MailCheck className="relative size-7 text-signal" /></div><p className="mt-5 font-display text-[18px] font-semibold tracking-tight">{state === "success" ? "Invitation accepted" : "Verifying your invitation"}</p><p className="mt-1.5 text-[12.5px] text-ink-3">{state === "success" ? "Opening your workspace…" : "This only takes a moment…"}</p><AuthProgressBar className="mt-5 w-36" /></div></InvitationFrame>;
}

function InvitationError({ title, body }: { title: string; body: string }) {
  return <div className="mt-7" role="alert"><div className="rounded-lg border border-danger/25 bg-danger-bg p-4"><p className="flex items-center gap-2 text-[13px] font-semibold text-danger"><CircleAlert className="size-4" />{title}</p><p className="mt-2 text-[12.5px] leading-relaxed text-danger/90">{body}</p></div><Button asChild variant="secondary" className="mt-5 w-full" size="lg"><a href="/login">Back to sign in</a></Button></div>;
}

function InvitationConflict({ onSignOut }: { onSignOut: () => void }) {
  return <div className="mt-7"><div className="rounded-lg border border-warning/30 bg-warning-bg p-4"><p className="flex items-center gap-2 text-[13px] font-semibold text-warning-deep"><CircleAlert className="size-4" />You are already signed in</p><p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep/90">Sign out first so this invitation is accepted by the invited email, not the account currently open in this browser.</p></div><Button className="mt-5 w-full" size="lg" onClick={onSignOut}>Sign out and continue <ArrowRight className="size-4" /></Button></div>;
}
