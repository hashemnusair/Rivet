"use client";

import { PageHeader } from "@/components/shared/chrome";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { MemberInstallAndNotifications } from "@/components/pwa/member-pwa";

export default function CustomerGettingStartedPage() {
  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <PageHeader sectionLabel="Member guide" title="Welcome to RIVET" description="Where your entry pass, memberships, payments, receipts and profile live. You can replay this guide any time." />
      <div className="mt-6">
        <OnboardingChecklist audience="member" />
      </div>
      <MemberInstallAndNotifications />
    </main>
  );
}
