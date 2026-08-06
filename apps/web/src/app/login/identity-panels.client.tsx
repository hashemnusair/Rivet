"use client";

import { CircleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { destinationFor, useRivetIdentity, type RivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";

const ENTRY_TRANSITION_MS = 900;
const holdTransition = () => new Promise<void>((resolve) => window.setTimeout(resolve, ENTRY_TRANSITION_MS));

/**
 * Once Clerk authenticates someone, their Convex role—not the portal they
 * happened to open—decides where they go. This prevents an administrator from
 * being offered member access merely because they signed in on the gym page.
 */
export function IdentityPanel() {
  const identity = useRivetIdentity();

  if (identity.status === "loading" || identity.status === "pending") {
    return <AutomaticEntry label="Preparing your workspace" />;
  }

  // Only a confirmed synchronization/query failure becomes an error. Normal
  // Clerk → Convex handoff states stay on the branded transition above.
  if (identity.status === "error") {
    return (
      <NotEntitled
        title="Your role could not be loaded"
        body={identity.errorMessage ?? "You are signed in, but RIVET could not read your account's role. Please try signing in again."}
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

  if (identity.status === "anonymous") return null;

  if (identity.status !== "ready") return null;

  const destination = destinationFor(identity);
  if (destination.area === "platform") return <AdminEntry identity={identity} />;
  if (destination.area === "gym") return <GymEntry identity={identity} />;
  return <MemberEntry identity={identity} />;
}

function GymEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signIn } = useApp();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const membership = identity.memberships[0];
  const destination = destinationFor(identity);

  useEffect(() => {
    if (!membership || started.current) return;
    started.current = true;
    void Promise.all([
      signIn(membership.role, undefined, {
        name: identity.fullName || identity.email || "RIVET user",
        email: identity.email || "",
      }),
      holdTransition(),
    ])
      .then(() => router.replace(destination.href))
      .catch(() => {
        setFailed(true);
        toast.error("Could not open the workspace.");
      });
  }, [destination.href, identity.email, identity.fullName, membership, router, signIn]);

  if (!membership) {
    return (
      <NotEntitled
        title="This account is not on a gym team"
        body="Gym staff are added by the gym's owner or manager. Once someone puts your email on the team, this portal opens your workspace automatically."
        primary={{ label: "Back to sign-in", href: "/login" }}
      />
    );
  }

  if (failed) {
    return (
      <NotEntitled
        title="The workspace could not be opened"
        body="Your gym access was found, but RIVET could not initialize this browser session. Sign out and try again."
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

  return <AutomaticEntry label="Opening your gym workspace" />;
}

function MemberEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signInAsIdentity } = useExperience();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.all([
      signInAsIdentity({ email: identity.email ?? "", fullName: identity.fullName ?? "" }),
      holdTransition(),
    ])
      .then(() => router.replace("/customer/my-gyms"))
      .catch(() => setFailed(true));
  }, [identity.email, identity.fullName, router, signInAsIdentity]);

  if (failed) {
    return (
      <NotEntitled
        title="Your member dashboard could not be opened"
        body="Your account is signed in, but RIVET could not initialize this browser session. Sign out and try again."
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

  return <AutomaticEntry label="Opening your member dashboard" />;
}

function AdminEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signInPlatformAdmin } = useExperience();
  const started = useRef(false);
  const signInPlatformAdminRef = useRef(signInPlatformAdmin);

  useEffect(() => {
    signInPlatformAdminRef.current = signInPlatformAdmin;
  }, [signInPlatformAdmin]);

  useEffect(() => {
    if (!identity.platformAdmin || started.current) return;
    started.current = true;
    signInPlatformAdminRef.current();
    const timer = window.setTimeout(() => router.replace("/platform"), ENTRY_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [identity.platformAdmin, router]);

  if (!identity.platformAdmin) {
    return (
      <NotEntitled
        title="This account is not a platform administrator"
        body="The platform console manages every gym on RIVET, so access is granted deliberately in Convex rather than requested here."
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

  return <AutomaticEntry label="Opening the platform console" />;
}

function AutomaticEntry({ label }: { label: string }) {
  return (
    <div className="mt-7 flex min-h-56 flex-col items-center justify-center" role="status" aria-live="polite">
      <div className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full border border-line-3 opacity-30" aria-hidden />
        <span className="absolute inset-2 rounded-full bg-sunken" aria-hidden />
        <Image src="/brand/rivet-glyph.png" alt="" width={26} height={36} className="relative h-9 w-auto" />
      </div>
      <p className="mt-5 font-display text-[18px] font-semibold tracking-tight">You’re signed in</p>
      <p className="mt-1.5 text-center text-[12.5px] text-ink-3">{label}…</p>
      <div className="mt-5 h-1 w-36 overflow-hidden rounded-full bg-sunken-2" aria-hidden>
        <div className="h-full w-2/3 animate-pulse rounded-full bg-ink" />
      </div>
    </div>
  );
}

function NotEntitled({
  title,
  body,
  primary,
}: {
  title: string;
  body: string;
  primary: { label: string; href: string };
}) {
  return (
    <div className="mt-7">
      <div className="rounded-lg border border-warning/30 bg-warning-bg p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium text-warning-deep">
          <CircleAlert className="size-4" /> {title}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep/90">{body}</p>
      </div>
      <Button asChild variant="secondary" className="mt-5 w-full" size="lg">
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
    </div>
  );
}
