"use client";
import { useT } from "@/lib/i18n/provider";

import { PageHeader } from "@/components/shared/chrome";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { MemberInstallAndNotifications } from "@/components/pwa/member-pwa";

export default function CustomerGettingStartedPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <PageHeader sectionLabel={t("customerPortal.memberGuide")} title={t("customerPortal.welcome")} description={t("customerPortal.memberGuideDescription")} />
      <div className="mt-6">
        <OnboardingChecklist audience="member" />
      </div>
      <MemberInstallAndNotifications />
    </main>
  );
}
