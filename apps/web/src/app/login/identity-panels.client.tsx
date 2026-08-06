"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { destinationFor, useRivetIdentity, type RivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { LoginLoading } from "./login-chrome";

/**
 * Once Clerk authenticates someone, their Convex role—not the portal they
 * happened to open—decides where they go. This prevents an administrator from
 * being offered member access merely because they signed in on the gym page.
 */
export function IdentityPanel() {
  const identity = useRivetIdentity();

  if (identity.status === "loading" || identity.status === "pending") return <LoginLoading />;

  // Convex holds the roles. If it cannot see this session there is nothing to
  // route on, and silently rendering nothing would strand a signed-in person on
  // a page with no way forward.
  if (identity.status === "anonymous") {
    return (
      <NotEntitled
        title="Your role could not be loaded"
        body="You are signed in, but RIVET could not read your account's role. This usually means the Convex deployment is unreachable or is not configured to verify Clerk sessions."
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

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
    void signIn(membership.role, undefined, {
      name: identity.fullName || identity.email || "RIVET user",
      email: identity.email || "",
    })
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
        primary={{ label: "Continue as a member", href: "/login/member" }}
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
    void signInAsIdentity({ email: identity.email ?? "", fullName: identity.fullName ?? "" })
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

  useEffect(() => {
    if (!identity.platformAdmin || started.current) return;
    started.current = true;
    signInPlatformAdmin();
    router.replace("/platform");
  }, [identity.platformAdmin, router, signInPlatformAdmin]);

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
    <div className="mt-7" role="status" aria-live="polite">
      <LoginLoading />
      <p className="mt-3 text-center text-[12px] text-ink-3">{label}…</p>
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
