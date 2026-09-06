"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * The one route-level not-found page. It cannot know which area the visitor
 * belongs to, so it offers the two next steps that are always safe: back to
 * where they were, or into RIVET through sign-in, which routes by role.
 */
export default function NotFound() {
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Image src="/brand/rivet-glyph.png" alt="" width={33} height={52} />
      <p className="mt-6 text-[12px] font-medium text-ink-3">Page not found</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">This page is not on the floor plan</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
        The record may have been removed, or the link may be incorrect. Check the address, or go back to where you were.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={goBack}>Go back</Button>
        <Button asChild variant="secondary"><Link href="/login">Open RIVET</Link></Button>
      </div>
      <p className="mt-5 text-[12px] text-ink-3"><Link href="/" className="underline underline-offset-4 hover:text-ink">rivet.jo</Link></p>
    </main>
  );
}
