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
        title={audience === "owner" ? "Open your gym with confidence" : "Learn your RIVET workspace"}
        description={audience === "owner" ? "A resumable readiness checklist separates what must be ready to operate from what can wait." : "A role-aware tour of navigation, member work, follow-ups, and audited actions."}
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
            <p className="context-label">Role access</p>
            <h2 id="getting-started-role" className="mt-1 text-[16px] font-semibold">You are signed in as {roleLabel}</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">These are the capabilities currently granted to this account. If your work changes, ask a gym owner or manager to review your role.</p>
          </div>
          <Link href="/settings?section=my-profile" className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-signal-deep underline-offset-4 hover:underline">
            Open personal settings <ArrowRight className="size-3.5" aria-hidden />
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
          <p className="mt-4 rounded-md border border-line bg-sunken/35 px-3 py-2.5 text-[12px] text-ink-3">Your role capabilities are still loading. Refresh this page if they do not appear.</p>
        )}
      </section>

      <section id="navigation" aria-labelledby="getting-started-navigation" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><BookOpen className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">Navigation and search</p>
            <h2 id="getting-started-navigation" className="mt-1 text-[16px] font-semibold">Start from the sidebar, then search when you know what you need</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">Use the sidebar to move between your workspace areas. Open a member record when work needs to be recorded on their timeline; the timeline keeps calls, visits, memberships, payments, and staff actions together.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold"><Search className="size-3.5 text-signal-deep" aria-hidden />Find a member, receipt, or page</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Press <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd> on macOS or <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd> on Windows, then type a name, phone number, receipt, page, or available action.</p>
          </div>
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold">Keep your context visible</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Check the active branch and filters before saving. If you switch branches, confirm the member or transaction belongs to the branch you intend to work in.</p>
          </div>
        </div>
      </section>

      <section id="security" aria-labelledby="getting-started-security" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><ShieldCheck className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">Sensitive actions</p>
            <h2 id="getting-started-security" className="mt-1 text-[16px] font-semibold">Leave a clear reason when an action changes money or access</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">Discounts, refunds, voids, membership freezes or date changes, check-in overrides, cash variances, and permission changes are sensitive. Confirm the request, enter a useful reason when asked, and never use another person&apos;s account.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12px] text-warning-deep">
          <p>Every sensitive change keeps an immutable audit record with the actor, reason, and affected record.</p>
          {canReadAudit ? <Link href="/audit" className="inline-flex shrink-0 items-center gap-1.5 font-medium underline underline-offset-4">Open audit log <ArrowRight className="size-3.5" aria-hidden /></Link> : <p className="shrink-0 font-medium">Ask a manager to review the audit log.</p>}
        </div>
      </section>
    </div>
  );
}
