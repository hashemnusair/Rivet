"use client";

import { RivetMarkLoader } from "@/components/motion/rivet-mark-loader";
import { cn } from "@/lib/utils/cn";

export function AuthProgressBar({ className }: { className?: string }) {
  return (
    <div className={cn("auth-progress-bar h-1 w-40 overflow-hidden rounded-full bg-sunken-2", className)} dir="ltr" aria-hidden>
      <span className="block h-full w-1/3 rounded-full bg-ink motion-reduce:animate-pulse" />
    </div>
  );
}

/** A whole-screen moment between accounts (signing out, opening an area): the mark lifting while it happens. */
export function AuthTransition({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center" role="status" aria-live="polite">
      <RivetMarkLoader className="h-14 w-auto text-ink" />
      <h1 className="mt-6 font-display text-[19px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{detail}</p>
    </div>
  );
}
