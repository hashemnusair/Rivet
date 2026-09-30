"use client";

import { usePublicSiteHref } from "@/lib/routing/use-public-site-href";
import { ArrowLeft } from "lucide-react";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import type { Audience, Portal } from "./portals";

const BRAND_COPY: Record<Audience | "chooser", { context: string; headline: string; body: string }> = {
  chooser: {
    context: "Gym revenue & operations",
    headline: "Never lose a renewal, a lead, or a dinar again.",
    body: "Members, sales, reception, payments and cash in one place. Every member has one full history. You always know who did what.",
  },
  account: {
    context: "One sign-in for everyone",
    headline: "Sign in once. We open the right page for you.",
    body: "Members see their memberships. Gym staff see their gym. RIVET staff see the platform console.",
  },
  staff: {
    context: "RIVET for gyms",
    headline: "Never lose a renewal, a lead, or a dinar again.",
    body: "Members, sales, reception, payments and cash in one place. Every member has one full history. You always know who did what.",
  },
  member: {
    context: "RIVET for members",
    headline: "Every gym you train at, in one account.",
    body: "See your membership, when it ends, your visits, what you owe and your receipts. Show your entry code to get in.",
  },
  admin: {
    context: "RIVET platform",
    headline: "Every gym on RIVET, on one screen.",
    body: "Gym health, plans, invoices and support in one place.",
  },
};

/** Shared two-column frame for `/login` and every portal beneath it. */
export function LoginLayout({
  portal,
  mode = "sign-in",
  footer,
  children,
}: {
  portal?: Portal;
  mode?: "sign-in" | "sign-up";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const publicHref = usePublicSiteHref();
  const copy = BRAND_COPY[portal?.id ?? "chooser"];

  return (
    <div className="grid min-h-screen lg:grid-cols-[42%_58%]">
      <div className="night-surface relative hidden flex-col justify-between bg-night p-10 text-night-ink lg:flex">
        <Link href={publicHref} aria-label="RIVET home">
          <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={149} height={38} priority />
        </Link>

        <div className="max-w-md">
          <p className="context-label mb-4 text-night-ink-3">{copy.context}</p>
          <h2 className="font-display text-[38px] font-semibold leading-[1.08] tracking-tight">{copy.headline}</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-night-ink-2">{copy.body}</p>
          <p className="mt-4 font-['var(--font-plex-arabic)'] text-[15px] leading-relaxed text-night-ink-3" dir="rtl">
            نظام الإيرادات والعمليات للنوادي الرياضية — من العضو المحتمل إلى التجديد والتحصيل.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-night-line pt-5 text-[12px] font-medium text-night-ink-3">
          <span>RIVET · Gym revenue &amp; operations</span>
          <span>Amman · JOD</span>
        </div>
      </div>

      <div className="flex flex-col bg-paper px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href={publicHref} className="flex min-h-8 items-center gap-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> rivet.jo
          </Link>
          {/* Members can create accounts here; gym access is issued by RIVET
              after an application is reviewed. */}
          {portal && mode === "sign-up" ? (
            <Link href={portal.href} className="flex min-h-8 items-center text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              Already have an account? Sign in
            </Link>
          ) : portal?.signUpUrl ? (
            <Link href={portal.signUpUrl} className="flex min-h-8 items-center text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              Create a member account
            </Link>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={126} height={32} priority />
          </div>
          {children}
        </div>

        <div className="mx-auto w-full max-w-md border-t border-line pt-4">
          {footer ?? (
            <div className="space-y-2 text-center">
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                <a href={RIVET_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="hover:text-ink" dir="ltr">WhatsApp {RIVET_CONTACT.phoneDisplay}</a>
                <span aria-hidden>·</span>
                <a href={RIVET_CONTACT.instagramHref} target="_blank" rel="noreferrer" className="hover:text-ink" dir="ltr">{RIVET_CONTACT.instagramHandle}</a>
                <span aria-hidden>·</span>
                {LEGAL_LINKS.map((item, index) => (
                  <span key={item.href} className="contents">
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <Link href={item.href} className="hover:text-ink">{item.label}</Link>
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PortalHeading({ portal, mode = "sign-in" }: { portal: Portal; mode?: "sign-in" | "sign-up" }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper" aria-hidden>
        <portal.icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="font-display text-[23px] font-semibold leading-tight tracking-tight">
          {mode === "sign-up" ? (portal.signUpTitle ?? `Create a ${portal.title.toLowerCase()} account`) : portal.title}
        </h1>
        <p className="mt-1 text-[13px] leading-snug text-ink-2">{portal.blurb}</p>
      </div>
    </div>
  );
}

export function LoginLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Checking sign-in">
      <AuthProgressBar />
    </div>
  );
}
