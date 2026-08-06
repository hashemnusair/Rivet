"use client";

import Image from "next/image";
import { cn } from "@/lib/utils/cn";

export function AuthProgressBar({ className }: { className?: string }) {
  return (
    <div className={cn("auth-progress-bar h-1 w-40 overflow-hidden rounded-full bg-sunken-2", className)} aria-hidden>
      <span className="block h-full w-1/3 rounded-full bg-ink motion-reduce:animate-pulse" />
    </div>
  );
}

export function AuthTransition({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center" role="status" aria-live="polite">
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-line-3 opacity-25 motion-reduce:animate-none" aria-hidden />
        <span className="absolute inset-2 rounded-full bg-sunken" aria-hidden />
        <Image src="/brand/rivet-glyph.png" alt="" width={26} height={36} className="relative h-9 w-auto" priority />
      </div>
      <h1 className="mt-5 font-display text-[19px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{detail}</p>
      <AuthProgressBar className="mt-5" />
    </div>
  );
}
