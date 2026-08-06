"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { Button } from "@/components/ui/button";
import { LoginLayout } from "./login-chrome";
import { AUDIENCE_FROM_HASH, PORTALS } from "./portals";

/**
 * The single sign-in address. It does not authenticate anyone itself — it sends
 * you to the portal you belong to, each of which keeps its own accounts.
 */
export default function LoginPage() {
  const router = useRouter();

  // Links written before the portals had routes used `/login#member` style
  // fragments. A hash never reaches the server, so it is resolved here.
  useEffect(() => {
    const audience = AUDIENCE_FROM_HASH[window.location.hash];
    if (audience) router.replace(PORTALS[audience].href);
  }, [router]);

  return (
    <LoginLayout>
      <div className="animate-fade-up">
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Sign in to RIVET</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
          One address for every sign-in. Choose the portal you belong to — each keeps its own accounts and permissions.
        </p>

        <AlreadySignedIn />

        <div className="mt-7 grid gap-3">
          {[PORTALS.staff, PORTALS.member].map((portal) => (
            <Link
              key={portal.id}
              href={portal.href}
              className="group flex items-center gap-4 rounded-lg border border-line-2 bg-surface p-4 transition-all hover:border-ink hover:shadow-pop"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2 transition-colors group-hover:bg-ink group-hover:text-paper">
                <portal.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-ink">{portal.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{portal.blurb}</span>
                <span className="mt-1.5 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">
                  {portal.audience}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
          ))}
        </div>

        <p className="mt-6 text-center text-[12px] text-ink-3">
          Need access?{" "}
          <Link href="/signup" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
            Send a gym application
          </Link>{" "}
          or{" "}
          <Link
            href="/login/member/create"
            className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink"
          >
            create a member account
          </Link>
          .
        </p>

        {/* Platform administration stays the quietest thing on the page. */}
        <div className="mt-7 border-t border-line pt-4">
          <Link
            href={PORTALS.admin.href}
            className="mx-auto flex w-fit items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4 transition-colors hover:text-ink-2"
          >
            <Lock className="size-3" /> Platform administrator
          </Link>
        </div>
      </div>
    </LoginLayout>
  );
}

const PORTAL_FOR_AREA = { platform: PORTALS.admin, gym: PORTALS.staff, member: PORTALS.member } as const;

/**
 * Someone who is already authenticated should not have to work out which portal
 * they belong to — Convex already knows. The chooser stays visible beneath, so a
 * person holding two roles can still take the other one.
 */
function AlreadySignedIn() {
  const identity = useRivetIdentity();
  if (identity.status !== "ready") return null;

  const destination = destinationFor(identity);
  const portal = PORTAL_FOR_AREA[destination.area];

  return (
    <div className="mt-6 rounded-lg border border-ink bg-surface p-4">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-4">Signed in as</p>
      <p className="mt-1 truncate text-[13.5px] font-medium">{identity.fullName || identity.email}</p>
      <p className="mt-2 text-[12.5px] leading-snug text-ink-2">
        {destination.area === "platform"
          ? "You administer the RIVET platform."
          : destination.area === "gym"
            ? `You are on the team at ${identity.memberships[0]?.organizationName}.`
            : "You do not hold a gym role, so RIVET opens your member dashboard."}
      </p>
      <Button asChild className="mt-4 w-full">
        <Link href={portal.href}>
          Continue to {portal.title.toLowerCase()} <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
