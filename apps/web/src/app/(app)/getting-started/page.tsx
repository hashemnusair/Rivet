"use client";

import { ArrowRight, BookOpen, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { ROLE_LABELS, PERMISSION_LABELS, type Permission } from "@/lib/domain/permissions";
import type { Session } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";

export default function GettingStartedPage() {
  const { session } = useApp();
  const audience = session?.roles[0] === "owner" ? "owner" : "staff";

  return (
    <div className="space-y-5">
      <PageHeader
        title={audience === "owner" ? "Get your gym ready" : "Learn how to use RIVET"}
        description={audience === "owner" ? "Finish the required steps first. Optional steps can wait. You can stop and come back any time." : "What your role can do, how to find things, and how to handle money and access."}
      />
      {audience === "staff" && session ? <StaffGettingStartedGuide session={session} /> : null}
      <OnboardingChecklist audience={audience} />
    </div>
  );
}

/**
 * Staff task links land on these guide sections. Keep these targets separate
 * from task cards: a task describes completion, while the guide teaches the
 * workflow the staff member is expected to use.
 */
function StaffGettingStartedGuide({ session }: { session: Session }) {
  const role = session.roles[0];
  const roleLabel = role ? ROLE_LABELS[role] : "Staff member";
  const capabilities = session.permissions.flatMap((permission) => {
    const detail = PERMISSION_LABELS[permission as Permission];
    return detail ? [{ permission, ...detail }] : [];
  });
  const canReadAudit = session.permissions.includes("audit.read");

  return (
    <div className="grid gap-3">
      <section id="role" aria-labelledby="getting-started-role" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="context-label">Your access</p>
            <h2 id="getting-started-role" className="mt-1 text-[16px] font-semibold">You are signed in as {roleLabel}</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">This is what your account can do. If your job changes, ask the owner or a manager to change your role.</p>
          </div>
          <Link href="/settings?section=my-profile" className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-signal-deep underline-offset-4 hover:underline">
            Open my profile <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        {capabilities.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li key={capability.permission} className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
                <p className="text-[12.5px] font-semibold">{capability.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{capability.hint}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-md border border-line bg-sunken/35 px-3 py-2.5 text-[12px] text-ink-3">Loading what your role can do. Refresh the page if nothing appears.</p>
        )}
      </section>

      <section id="navigation" aria-labelledby="getting-started-navigation" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><BookOpen className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">Finding your way</p>
            <h2 id="getting-started-navigation" className="mt-1 text-[16px] font-semibold">Use the menu to move around, and search when you know what you need</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">Use the menu to move between pages. To record work for a member, open their page. Their timeline keeps calls, visits, memberships, payments and staff actions together.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold"><Search className="size-3.5 text-signal-deep" aria-hidden />Find a member, receipt, or page</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Press <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd> on a Mac or <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd> on Windows. Then type a name, phone number, receipt number, page or action.</p>
          </div>
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold">Check the branch first</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Check the branch and filters before you save. If you change branch, make sure the member or payment belongs to that branch.</p>
          </div>
        </div>
      </section>

      <section id="security" aria-labelledby="getting-started-security" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><ShieldCheck className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">Money and access</p>
            <h2 id="getting-started-security" className="mt-1 text-[16px] font-semibold">Give a clear reason when you change money or access</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">Take extra care with discounts, refunds, cancelled payments and freezes. Also take care with membership date changes, letting someone in anyway, cash differences and access changes. Check the request first. Give a clear reason when asked. Never use another person&apos;s account.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12px] text-warning-deep">
          <p>Each of these changes is saved with your name and your reason.</p>
          {canReadAudit ? <Link href="/audit" className="inline-flex shrink-0 items-center gap-1.5 font-medium underline underline-offset-4">Open activity log <ArrowRight className="size-3.5" aria-hidden /></Link> : <p className="shrink-0 font-medium">Managers can check them in the activity log.</p>}
        </div>
      </section>
    </div>
  );
}
