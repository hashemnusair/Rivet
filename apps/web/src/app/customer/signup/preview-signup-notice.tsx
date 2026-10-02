"use client";

import { useT } from "@/lib/i18n/provider";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoginLayout, PortalHeading } from "@/app/login/login-chrome";
import { PORTALS } from "@/app/login/portals";

/**
 * Member signup always runs through Clerk in real deployments. The preview
 * deliberately refuses to imitate account creation or collect a password and
 * points at the seeded member personas instead, inside the same sign-in frame
 * a real member would see.
 */
export function PreviewMemberSignupNotice() {
  const t = useT();
  return (
    <LoginLayout portal={PORTALS.member} mode="sign-up">
      <PortalHeading portal={PORTALS.member} mode="sign-up" />
      <div className="mt-7 rounded-lg border border-line-2 bg-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold">{t("authErrors.previewUnavailable")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{t("authErrors.previewDescription")}</p>
        <Button asChild size="lg" className="mt-4 w-full">
          <Link href="/login/member">{t("authErrors.previewOpen")}</Link>
        </Button>
      </div>
    </LoginLayout>
  );
}
