"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { ArrowRight, Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import type { CreateGymOnboardingResult } from "@/lib/api/GymOSApi";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { DEFAULT_GYM_ONBOARDING_DRAFT, GYM_ONBOARDING_DRAFT_KEY, type GymOnboardingDraft } from "@/lib/onboarding/gym-draft";

type FormErrors = Partial<Record<"gymName" | "city" | "branchName" | "ownerFullName", string>>;

export default function GymOnboardingPage() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [draft, setDraft] = useState<GymOnboardingDraft>(DEFAULT_GYM_ONBOARDING_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string>();
  const [result, setResult] = useState<CreateGymOnboardingResult>();

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(GYM_ONBOARDING_DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<GymOnboardingDraft>;
        setDraft({ ...DEFAULT_GYM_ONBOARDING_DRAFT, ...parsed });
      }
    } catch {
      // A malformed browser draft should not block a new onboarding attempt.
      window.sessionStorage.removeItem(GYM_ONBOARDING_DRAFT_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!DEMO_AUTH_BYPASS && authLoaded && !isSignedIn) {
      router.replace("/login/gym/create?next=%2Fonboarding%2Fgym");
    }
  }, [authLoaded, isSignedIn, router]);

  const clerkName = useMemo(
    () => [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(" "),
    [user?.firstName, user?.lastName],
  );

  useEffect(() => {
    if (clerkName && !draft.ownerFullName) setDraft((current) => ({ ...current, ownerFullName: clerkName }));
  }, [clerkName, draft.ownerFullName]);

  const update = <K extends keyof GymOnboardingDraft>(key: K, value: GymOnboardingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(undefined);
  };

  const submit = async () => {
    const nextErrors: FormErrors = {};
    if (draft.ownerFullName.trim().length < 2) nextErrors.ownerFullName = "Enter the owner name.";
    if (draft.gymName.trim().length < 2) nextErrors.gymName = "Enter the gym name.";
    if (draft.city.trim().length < 2) nextErrors.city = "Enter the gym city.";
    if (draft.branchName.trim().length < 2) nextErrors.branchName = "Enter the first branch name.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const activeMembers = draft.currentActiveMembers.trim() ? Number(draft.currentActiveMembers) : undefined;
    if (activeMembers !== undefined && (!Number.isFinite(activeMembers) || activeMembers < 0)) {
      setFormError("Current active members must be a zero or positive number.");
      return;
    }

    setSubmitting(true);
    setFormError(undefined);
    try {
      const created = await getApi().createGymOnboarding({
        ownerFullName: draft.ownerFullName.trim(),
        ownerPhone: draft.ownerPhone.trim() || undefined,
        gymName: draft.gymName.trim(),
        city: draft.city.trim(),
        branchName: draft.branchName.trim(),
        currentActiveMembers: activeMembers,
        plan: draft.plan,
      });
      window.sessionStorage.removeItem(GYM_ONBOARDING_DRAFT_KEY);
      setResult(created);
    } catch (error) {
      setFormError(isApiError(error) ? error.message : "We could not create the gym workspace. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated || (!DEMO_AUTH_BYPASS && !authLoaded)) {
    return <OnboardingShell><LoadingState label="Preparing your workspace…" /></OnboardingShell>;
  }

  if (!DEMO_AUTH_BYPASS && !isSignedIn) {
    return <OnboardingShell><LoadingState label="Taking you to secure sign-up…" /></OnboardingShell>;
  }

  if (result) {
    return (
      <OnboardingShell>
        <div className="mx-auto max-w-xl border border-ink bg-surface p-7 text-center shadow-pop sm:p-12">
          <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-bg text-success"><CheckCircle2 className="size-8" /></span>
          <p className="mt-7 eyebrow">Workspace created</p>
          <h1 className="mt-3 text-[32px] font-semibold tracking-tight">{result.organizationName} is ready.</h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-2">
            {result.branchName} is your first branch. Your {result.plan} trial runs through {formatDate(result.trialEndsAt)}.
          </p>
          <div className="mt-8 grid gap-3 text-start sm:grid-cols-2">
            <Summary label="Workspace" value={result.organizationSlug} />
            <Summary label="Branch" value={result.branchName} />
          </div>
          <Button asChild variant="signal" size="lg" className="mt-8 w-full">
            <Link href="/login/gym">Open your gym workspace <ArrowRight /></Link>
          </Button>
          <p className="mt-4 text-[11.5px] text-ink-3">RIVET will load your role from Convex before showing the dashboard.</p>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-7">
          <p className="eyebrow">Final setup · Workspace owner</p>
          <h1 className="mt-3 text-[32px] font-semibold tracking-tight">Confirm the details for your first gym.</h1>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-2">
            This creates the tenant boundary, your first branch, default staff permissions, and the trial subscription. You can add staff and branches after you enter the workspace.
          </p>
        </div>

        <div className="grid gap-5 border border-ink bg-surface p-6 shadow-pop sm:p-8 md:grid-cols-2">
          <Field label="Owner name" htmlFor="gym-owner" error={errors.ownerFullName} required>
            <Input id="gym-owner" value={draft.ownerFullName} onChange={(event) => update("ownerFullName", event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.ownerFullName)} />
          </Field>
          <Field label="Mobile number" htmlFor="gym-phone" hint="Optional — used for workspace contact details.">
            <Input id="gym-phone" value={draft.ownerPhone} onChange={(event) => update("ownerPhone", event.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Gym name" htmlFor="gym-name" error={errors.gymName} required>
            <Input id="gym-name" value={draft.gymName} onChange={(event) => update("gymName", event.target.value)} aria-invalid={Boolean(errors.gymName)} autoFocus />
          </Field>
          <Field label="City" htmlFor="gym-city" error={errors.city} required>
            <Input id="gym-city" value={draft.city} onChange={(event) => update("city", event.target.value)} aria-invalid={Boolean(errors.city)} />
          </Field>
          <Field label="First branch" htmlFor="gym-branch" error={errors.branchName} required>
            <Input id="gym-branch" value={draft.branchName} onChange={(event) => update("branchName", event.target.value)} aria-invalid={Boolean(errors.branchName)} />
          </Field>
          <Field label="Active members" htmlFor="gym-members" hint="Optional estimate for your starting workspace.">
            <Input id="gym-members" type="number" min={0} value={draft.currentActiveMembers} onChange={(event) => update("currentActiveMembers", event.target.value)} />
          </Field>
          <div className="md:col-span-2">
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Starting plan</p>
            <div className="flex items-center gap-3 rounded-md border border-line-2 bg-sunken/40 px-3 py-2.5">
              <span className="flex size-7 items-center justify-center rounded bg-signal text-white"><Building2 className="size-3.5" /></span>
              <span className="text-[13.5px] font-semibold">{draft.plan}</span>
              <span className="text-[12px] text-ink-3">14-day trial · changeable before billing</span>
            </div>
          </div>
          {formError ? <p className="md:col-span-2 text-[12.5px] text-danger" role="alert">{formError}</p> : null}
          <div className="md:col-span-2 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost"><Link href="/signup">Edit trial details</Link></Button>
            <Button type="button" variant="signal" size="lg" loading={submitting} onClick={() => void submit()}>
              Create gym workspace <ArrowRight />
            </Button>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-ink-3"><ShieldCheck className="size-3.5 text-success" /> Your Clerk identity is linked to this owner role; no role is selected in the browser.</p>
      </div>
    </OnboardingShell>
  );
}

function OnboardingShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-paper"><PublicHeader /><main className="marketing-grid px-5 py-10 sm:px-8 lg:px-12 lg:py-16">{children}</main></div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="flex min-h-[360px] items-center justify-center gap-3 text-[13px] text-ink-2" role="status"><Loader2 className="size-4 animate-spin" />{label}</div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="border border-line bg-sunken/30 px-3 py-2.5"><p className="eyebrow">{label}</p><p className="mt-1 truncate text-[13px] font-medium">{value}</p></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-JO", { dateStyle: "medium" }).format(new Date(value));
}
