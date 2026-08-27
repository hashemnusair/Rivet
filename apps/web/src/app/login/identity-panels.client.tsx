"use client";

import { useAction } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { CircleAlert, LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { destinationFor, INVITATION_CLAIMED_EVENT, useRivetIdentity, type RivetIdentity, type RivetMembership } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import type { Audience } from "./portals";
import { api } from "../../../convex/_generated/api";

const ENTRY_TRANSITION_MS = 900;
const holdTransition = () => new Promise<void>((resolve) => window.setTimeout(resolve, ENTRY_TRANSITION_MS));

/**
 * Once Clerk authenticates someone, their Convex role—not the portal they
 * happened to open—decides where they go. This prevents an administrator from
 * being offered member access merely because they signed in on the gym page.
 */
export function IdentityPanel({ audience = "account" }: { audience?: Audience }) {
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

  if (audience === "staff") {
    if (identity.memberships.length > 0) {
      const staffDestination = destinationFor(identity);
      if (staffDestination.area === "organization-selection") return <OrganizationSelection identity={identity} />;
      return <GymEntry identity={identity} />;
    }
    if (identity.gymAccessUnavailable && identity.invitationClaimEligible) return <StaffInvitationRecovery />;
    if (identity.gymAccessUnavailable) return <UnavailableGymEntry />;
    return <NoGymTeamEntry />;
  }

  if (audience === "member") {
    if (identity.gymAccessUnavailable) return <UnavailableGymEntry />;
    if (identity.platformAdmin || identity.memberships.length > 0) return <WrongAudienceEntry audience="member" />;
    return <MemberEntry identity={identity} />;
  }

  if (audience === "admin") {
    return identity.platformAdmin ? <AdminEntry identity={identity} /> : <WrongAudienceEntry audience="admin" />;
  }

  const destination = destinationFor(identity);
  if (destination.area === "platform") return <AdminEntry identity={identity} />;
  if (destination.area === "gym") return <GymEntry identity={identity} />;
  if (destination.area === "unavailable") {
    return identity.invitationClaimEligible ? <StaffInvitationRecovery /> : <UnavailableGymEntry />;
  }
  if (destination.area === "organization-selection") return <OrganizationSelection identity={identity} />;
  return <MemberEntry identity={identity} />;
}

function StaffInvitationRecovery() {
  const claimInvitation = useAction(api.users.claimInvitation);
  const attempted = useRef(false);
  const [state, setState] = useState<"checking" | "claimed" | "failed">("checking");

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    void claimInvitation({})
      .then((result) => {
        if (!result.claimed) {
          setState("failed");
          return;
        }
        setState("claimed");
        // ConvexIdentity listens for this event and retries its synchronized
        // identity query in place. Do not navigate through the member portal
        // while that provider-verified claim is being reconciled.
        window.dispatchEvent(new Event(INVITATION_CLAIMED_EVENT));
      })
      .catch(() => setState("failed"));
  }, [claimInvitation]);

  if (state === "checking" || state === "claimed") return <AutomaticEntry label={state === "claimed" ? "Verifying your gym invitation" : "Checking your gym invitation"} />;
  return (
    <NotEntitled
      title="Your gym invitation could not be verified"
      body="This staff account is not currently routable into a gym workspace. Ask the gym owner to resend the invitation, then try again."
    />
  );
}

function NoGymTeamEntry() {
  return (
    <NotEntitled
      title="This account is not on a gym team"
      body="The gym team portal is for gym staff. Ask a gym owner or manager to invite this account, or use the member portal if you train at a RIVET gym."
    />
  );
}

function WrongAudienceEntry({ audience }: { audience: "member" | "admin" }) {
  return (
    <NotEntitled
      title={audience === "admin" ? "Platform administrator access required" : "This is the member portal"}
      body={audience === "admin" ? "Only RIVET platform administrators can open this portal." : "Gym team accounts must use the gym team portal. Member access is kept separate from staff workspaces."}
    />
  );
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

export function UnavailableGymEntry() {
  return (
    <NotEntitled
      title="Your gym workspace is unavailable"
      body="This account belongs to a gym that is not currently active. Ask a RIVET platform administrator to restore the gym's subscription, or sign out and use another account."
    />
  );
}

function GymEntry({ identity }: { identity: RivetIdentity }) {
  const membership = identity.memberships[0];

  if (!membership) {
    return (
      <NotEntitled
        title="This account is not on a gym team"
        body="Gym staff are added by the gym's owner or manager. Once someone puts your email on the team, this portal opens your workspace automatically."
      />
    );
  }

  // Selected-scope staff with more than one visible branch cannot safely use
  // an implicit branch. Keep the login handoff on this page until the user
  // chooses one, instead of calling the session query without a branch and
  // leaving them on an endless loading state.
  if (membership.branchScope === "selected" && membership.branches.length > 1) {
    return <BranchSelection identity={identity} membership={membership} />;
  }

  if (membership.branchScope === "selected" && membership.branches.length === 0) {
    return (
      <NotEntitled
        title="No active branch is available"
        body="Your gym role is active, but it is not assigned to an active branch. Ask a gym manager to update your branch access."
      />
    );
  }

  return <AutomaticGymEntry identity={identity} membership={membership} />;
}

function BranchSelection({ identity, membership }: { identity: RivetIdentity; membership: RivetMembership }) {
  const { signIn } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [failed, setFailed] = useState(false);
  const destination = destinationFor(identity);

  const choose = async (branchId: string) => {
    if (busy) return;
    setBusy(branchId);
    setFailed(false);
    try {
      await Promise.all([
        signIn(membership.role, branchId, {
          name: identity.fullName || identity.email || "RIVET user",
          email: identity.email || "",
        }),
        holdTransition(),
      ]);
      router.replace(destination.href);
    } catch {
      setBusy(undefined);
      setFailed(true);
      toast.error("Could not open the selected branch.");
    }
  };

  return (
    <NotEntitled
      title="Choose a branch workspace"
      body="Your role has access to more than one branch. Select the branch you want to open so RIVET can protect branch-specific work."
      action={(
        <div className="mt-4 grid gap-2 text-left">
          {membership.branches.map((branch) => (
            <Button key={branch.id} variant="secondary" className="h-auto justify-between py-3 text-left" onClick={() => void choose(branch.id)} disabled={Boolean(busy)} loading={busy === branch.id}>
              <span><span className="block font-medium">{branch.name}</span><span className="mt-0.5 block text-[11px] text-ink-3">Code {branch.code}</span></span>
              <span aria-hidden>→</span>
            </Button>
          ))}
          {failed ? <p className="text-[12px] text-danger" role="alert">That branch could not be opened. Try again.</p> : null}
        </div>
      )}
    />
  );
}

function AutomaticGymEntry({ identity, membership }: { identity: RivetIdentity; membership: RivetMembership }) {
  const router = useRouter();
  const { signIn } = useApp();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const destination = destinationFor(identity);
  const branchId = membership.branchScope === "selected" ? membership.branches[0]?.id : undefined;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.all([
      signIn(membership.role, branchId, {
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
  }, [branchId, destination.href, identity.email, identity.fullName, membership.role, router, signIn]);

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
        <Image src="/brand/rivet-glyph.png" alt="" width={23} height={36} className="relative" />
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
