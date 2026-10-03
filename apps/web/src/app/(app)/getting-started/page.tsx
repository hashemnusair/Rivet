"use client";
import { useT } from "@/lib/i18n/provider";

import { ArrowRight, BookOpen, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { roleLabel as roleName } from "@/lib/i18n/labels";
import { knownPermissionCopy } from "@/lib/i18n/permissions";
import type { Session } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";

export default function GettingStartedPage() {
  const t = useT();
  const { session } = useApp();
  const audience = session?.roles[0] === "owner" ? "owner" : "staff";

  return (
    <div className="space-y-5">
      <PageHeader
        title={audience === "owner" ? t("setup.getGymReady") : t("setup.learnRivet")}
        description={audience === "owner" ? t("setup.ownerGuideDescription") : t("setup.staffGuideDescription")}
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
  const t = useT();
  const role = session.roles[0];
  const roleLabel = role ? roleName(t, role) : t("setup.staffMember");
  const capabilities = session.permissions.flatMap((permission) => {
    const detail = knownPermissionCopy(t, permission);
    return detail ? [{ permission, ...detail }] : [];
  });
  const canReadAudit = session.permissions.includes("audit.read");

  return (
    <div className="grid gap-3">
      <section id="role" aria-labelledby="getting-started-role" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="context-label">{t("setup.access")}</p>
            <h2 id="getting-started-role" className="mt-1 text-[16px] font-semibold">{t("setup.signedInRole", { role: roleLabel })}</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">{t("setup.roleHint")}</p>
          </div>
          <Link href="/settings?section=my-profile" className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-signal-deep underline-offset-4 hover:underline">
            {" "}{t("setup.openProfile")}{" "}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
        {capabilities.length ? (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li key={capability.permission} className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
                <p className="text-[12.5px] font-semibold">{capability.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{capability.hint}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-md border border-line bg-sunken/35 px-3 py-2.5 text-[12px] text-ink-3">{t("setup.loadingRole")}</p>
        )}
      </section>

      <section id="navigation" aria-labelledby="getting-started-navigation" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><BookOpen className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">{t("setup.navigation")}</p>
            <h2 id="getting-started-navigation" className="mt-1 text-[16px] font-semibold">{t("setup.navigationTitle")}</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{t("setup.navigationDescription")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="flex items-center gap-2 text-[12.5px] font-semibold"><Search className="size-3.5 text-signal-deep" aria-hidden />{t("setup.searchTitle")}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("setup.searchPress")} <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd> {t("setup.searchMac")} <kbd className="rounded border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd> {t("setup.searchWindows")}</p>
          </div>
          <div className="rounded-md border border-line bg-sunken/35 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold">{t("setup.checkBranch")}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t("setup.checkBranchDescription")}</p>
          </div>
        </div>
      </section>

      <section id="security" aria-labelledby="getting-started-security" className="panel scroll-mt-24 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-signal-bg text-signal-deep"><ShieldCheck className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <p className="context-label">{t("setup.moneyAccess")}</p>
            <h2 id="getting-started-security" className="mt-1 text-[16px] font-semibold">{t("setup.reasonTitle")}</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{t("setup.reasonDescription")}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning-bg px-3 py-2.5 text-[12px] text-warning-deep">
          <p>{t("setup.changesAudited")}</p>
          {canReadAudit ? <Link href="/audit" className="inline-flex shrink-0 items-center gap-1.5 font-medium underline underline-offset-4">{t("setup.openAudit")}{" "}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden /></Link> : <p className="shrink-0 font-medium">{t("setup.managerAudit")}</p>}
        </div>
      </section>
    </div>
  );
}
