"use client";

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
  return (
    <LoginLayout portal={PORTALS.member} mode="sign-up">
      <PortalHeading portal={PORTALS.member} mode="sign-up" />
      <div className="mt-7 rounded-lg border border-line-2 bg-surface p-4 sm:p-5">
        <h2 className="text-[14px] font-semibold">You cannot create an account in this demo.</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">This demo does not create accounts or save passwords. Use a demo member to look around.</p>
        <Button asChild size="lg" className="mt-4 w-full">
          <Link href="/login/member">Open member preview</Link>
        </Button>
      </div>
    </LoginLayout>
  );
}
