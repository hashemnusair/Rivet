"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import type { Audience, Portal } from "./portals";

const BRAND_COPY: Record<Audience | "chooser", { eyebrow: string; headline: string; body: string }> = {
  chooser: {
    eyebrow: "Gym revenue & operations",
    headline: "Never lose a renewal, a lead, or a dinar again.",
    body: "Members, sales follow-up, reception, payments and cash — one chronological record per member, full accountability per staff action.",
  },
  account: {
    eyebrow: "One account · the right workspace",
    headline: "Sign in once. RIVET handles the rest.",
    body: "Your assigned role decides whether RIVET opens the member dashboard, gym operations, reception, or the platform console.",
  },
  staff: {
    eyebrow: "RIVET for gyms",
    headline: "Never lose a renewal, a lead, or a dinar again.",
    body: "Members, sales follow-up, reception, payments and cash — one chronological record per member, full accountability per staff action.",
  },
  member: {
    eyebrow: "RIVET for members",
    headline: "Every gym you train at, in one account.",
    body: "Membership status, expiry, visits, balance and receipts — plus a single QR identity that gets you through the door.",
  },
  admin: {
    eyebrow: "RIVET platform",
    headline: "Every gym on the network, on one screen.",
    body: "Tenant health, subscriptions, invoices and support in one console — with the same audit discipline the gyms get.",
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
  const copy = BRAND_COPY[portal?.id ?? "chooser"];

  return (
    <div className="grid min-h-screen lg:grid-cols-[42%_58%]">
      <div className="night-surface relative hidden flex-col justify-between bg-night p-10 text-night-ink lg:flex">
        <Link href="/" aria-label="RIVET home">
          <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={149} height={38} priority />
        </Link>

        <div className="max-w-md">
          <p className="eyebrow-night mb-4">{copy.eyebrow}</p>
          <h2 className="font-display text-[38px] font-semibold leading-[1.08] tracking-tight">{copy.headline}</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-night-ink-2">{copy.body}</p>
          <p className="mt-4 font-['var(--font-plex-arabic)'] text-[15px] leading-relaxed text-night-ink-3" dir="rtl">
            نظام الإيرادات والعمليات للنوادي الرياضية — من العضو المحتمل إلى التجديد والتحصيل.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-night-line pt-5 font-mono text-[11px] tracking-[0.12em] text-night-ink-3">
          <span>RIVET · GYM REVENUE &amp; OPERATIONS</span>
          <span>AMMAN · JOD</span>
        </div>
      </div>

      <div className="flex flex-col bg-paper px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[12px] text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" /> rivet.jo
          </Link>
          {/* Members can create accounts here; gym access is issued by RIVET
              after an application is reviewed. */}
          {portal && mode === "sign-up" ? (
            <Link href={portal.href} className="text-[12px] font-medium text-ink-2 transition-colors hover:text-ink">
              Already have an account? Sign in
            </Link>
          ) : portal?.signUpUrl ? (
            <Link href={portal.signUpUrl} className="text-[12px] font-medium text-ink-2 transition-colors hover:text-ink">
              Create a member account
            </Link>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={126} height={32} style={{ height: "auto" }} priority />
          </div>
          {children}
        </div>

        <div className="mx-auto w-full max-w-md border-t border-line pt-4">
          {footer ?? (
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
              Secure identity by Clerk · application data by Convex
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PortalHeading({ portal, mode = "sign-in" }: { portal: Portal; mode?: "sign-in" | "sign-up" }) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg border",
          portal.id === "admin" ? "border-line-2 bg-surface text-signal" : "border-transparent bg-ink text-paper",
        )}
      >
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
