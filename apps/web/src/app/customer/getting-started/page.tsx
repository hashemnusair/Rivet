"use client";

import { GraduationCap } from "lucide-react";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { MemberInstallAndNotifications } from "@/components/pwa/member-pwa";

export default function CustomerGettingStartedPage() { return <main className="mx-auto max-w-[1080px] px-4 py-8 pb-24 sm:px-6 lg:px-8"><header className="mb-6 flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-signal-bg text-signal-deep"><GraduationCap /></span><div><p className="eyebrow">Member guide</p><h1 className="mt-1 font-display text-[27px] font-semibold">Welcome to RIVET</h1><p className="mt-1 max-w-2xl text-[13px] text-ink-2">Learn where your entry pass, memberships, payments, receipts, and profile live. You can replay this guide anytime.</p></div></header><OnboardingChecklist audience="member" /><MemberInstallAndNotifications /></main>; }
