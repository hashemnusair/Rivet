"use client";

import { useClerk } from "@clerk/nextjs";
import { CircleAlert, LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthProgressBar } from "@/components/auth/auth-transition";
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
      />
    );
  }

  if (identity.status === "anonymous") return null;

  if (identity.status !== "ready") return null;

  const destination = destinationFor(identity);
  if (destination.area === "platform") return <AdminEntry identity={identity} />;
  if (destination.area === "gym") return <GymEntry identity={identity} />;
  if (destination.area === "unavailable") return <UnavailableGymEntry />;
  if (destination.area === "organization-selection") return <OrganizationSelection identity={identity} />;
  return <MemberEntry identity={identity} />;
}

function OrganizationSelection({ identity }: { identity: RivetIdentity }) {
  const { selectOrganization } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState(false);

  const choose = async (organizationId: string) => {
    if (busy) return;
    setBusy(organizationId);
    setError(false);
    try {
      await selectOrganization(organizationId);
      const selected = identity.memberships.find((membership) => membership.organizationId === organizationId);
      if (selected) router.replace(selected.role === "receptionist" ? "/reception" : selected.role === "auditor" ? "/reports" : "/dashboard");
    } catch {
      setBusy(undefined);
      setError(true);
    }
  };

  return (
    <NotEntitled
      title="Choose a gym workspace"
      body="This account has access to more than one gym. Select the workspace you want to open."
      action={(
        <div className="mt-4 grid gap-2 text-left">
          {identity.memberships.map((membership) => (
            <Button key={membership.organizationId} variant="secondary" className="h-auto justify-between py-3 text-left" onClick={() => void choose(membership.organizationId)} disabled={Boolean(busy)} loading={busy === membership.organizationId}>
              <span><span className="block font-medium">{membership.organizationName}</span><span className="mt-0.5 block text-[11px] text-ink-3">{membership.role}</span></span>
              <span aria-hidden>→</span>
            </Button>
          ))}
          {error ? <p className="text-[12px] text-danger" role="alert">That workspace could not be opened. Try again.</p> : null}
        </div>
      )}
    />
  );
}

function UnavailableGymEntry() {
  return (
    <NotEntitled
      title="Your gym workspace is unavailable"
      body="This account belongs to a gym that is not currently active. Ask a RIVET platform administrator to restore the gym's subscription, or sign out and use another account."
    />
  );
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
      />
    );
  }

  if (failed) {
    return (
      <NotEntitled
        title="The workspace could not be opened"
        body="Your gym access was found, but RIVET could not initialize this browser session. Sign out and try again."
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
      <AuthProgressBar className="mt-5 w-36" />
    </div>
  );
}

function NotEntitled({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  const { signOut: signOutClerk } = useClerk();
  const { signOut } = useApp();
  const { signOutCustomer, signOutPlatformAdmin } = useExperience();
  const [signingOut, setSigningOut] = useState(false);

  const recover = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      signOutCustomer();
      signOutPlatformAdmin();
      await signOutClerk({ redirectUrl: "/login" });
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <div className="mt-7">
      <div className="rounded-lg border border-warning/30 bg-warning-bg p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium text-warning-deep">
          <CircleAlert className="size-4" /> {title}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-warning-deep/90">{body}</p>
      </div>
      {action}
      <Button
        type="button"
        variant="secondary"
        className="mt-5 w-full"
        size="lg"
        loading={signingOut}
        onClick={() => void recover()}
      >
        <LogOut aria-hidden />
        {signingOut ? "Signing out" : "Sign out and use another account"}
      </Button>
    </div>
  );
}
