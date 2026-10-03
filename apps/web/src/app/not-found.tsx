"use client";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Image src="/brand/rivet-glyph.png" alt="" width={33} height={52} />
      <p className="mt-6 text-[12px] font-medium text-ink-3">Page not found</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">We could not find this page</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
        It may have been removed, or the link may be wrong. Check the address, or go back.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={goBack}>{t("common.action.goBack")}</Button>
        <Button asChild variant="secondary"><Link href="/login">{t("marketing.actions.openRivet")}</Link></Button>
      </div>
      <p className="mt-5 text-[12px] text-ink-3"><Link href="/" className="underline underline-offset-4 hover:text-ink">rivet.jo</Link></p>
    </main>
  );
}
