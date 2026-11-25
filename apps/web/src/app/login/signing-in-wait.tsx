"use client";

import { RivetMarkLoader } from "@/components/motion/rivet-mark-loader";
import { useSigningInCover, useSigningInHold } from "@/lib/auth/signing-in";
import { useT } from "@/lib/i18n/provider";

/**
 * Every automatic wait after the password: Clerk starting the session, the
 * account being read, the gym opening. It holds the one full-screen cover
 * ("Signing you in…"), so the person sees a single screen however many of
 * these take turns. What it renders in the page is only seen if the cover
 * gives up after a long wait; it then says the same words, next to the
 * page's own sign-out.
 */
export function SigningInWait() {
  const t = useT();
  useSigningInHold(true);
  const covered = useSigningInCover();
  return (
    <div
      className="mt-7 flex min-h-56 flex-col items-center justify-center"
      role={covered ? undefined : "status"}
      aria-live={covered ? undefined : "polite"}
      aria-hidden={covered ? true : undefined}
      data-testid="signing-in-wait"
    >
      <RivetMarkLoader className="h-14 w-auto text-ink" />
      <p className="mt-6 text-center text-[13px] font-medium text-ink-2">{t("auth.identity.signingIn")}</p>
    </div>
  );
}
