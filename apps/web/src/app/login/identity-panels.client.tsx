"use client";

import { isRivetHost, RIVET_HOSTS, postSignInPath } from "@/lib/routing/host-routing";
import { useAction } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { CircleAlert, LogOut } from "lucide-react";
import Image from "next/image";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { destinationFor, INVITATION_CLAIMED_EVENT, useRivetIdentity, type RivetIdentity, type RivetMembership } from "@/lib/auth/rivet-identity";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import type { Audience } from "./portals";
import { api } from "../../../convex/_generated/api";
import { MemberProfileMissingError } from "@/lib/auth/member-profile";
import { MemberProfileCompletion } from "./member-profile-completion";

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
    return <AutomaticEntry label="Getting your account ready" />;
  }

  // Only a confirmed synchronization/query failure becomes an error. Normal
  // Clerk → Convex handoff states stay on the branded transition above.
  if (identity.status === "error") {
    return (
      <NotEntitled
        title={identity.accountDeactivated ? "This account was deactivated" : "We could not load your account"}
        body={identity.errorMessage ?? "You are signed in, but we could not load your account. Sign out and sign in again."}
      />
    );
  }

  if (identity.status === "anonymous") return null;

  if (identity.status !== "ready") return null;

  return <IdentityHostGate identity={identity}><IdentityEntries identity={identity} audience={audience} /></IdentityHostGate>;
}

/**
 * Where an already-authorized account can open directly on its own host: the
 * gym, member and platform shells hydrate a Clerk session from Convex on their
 * own, so the resolver's browser bootstrap is not needed there. Selected-branch
 * staff, an account with several gyms and an unavailable gym still go through
 * the resolver on the destination host, which asks or explains.
 */
export function directEntryPath(identity: RivetIdentity): string | null {
  const destination = destinationFor(identity);
  if (destination.area === "platform" || destination.area === "member") return destination.href;
  if (destination.area === "gym" && identity.memberships[0]?.branchScope !== "selected") return destination.href;
  return null;
}

/** Resolve the host before branch/member setup, whose browser state is origin-scoped.
 * An account arriving from another host (the landing, an old link) opens its
 * page there in one hop rather than through a second sign-in screen. */
function IdentityHostGate({ identity, children }: { identity: RivetIdentity; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const destination = destinationFor(identity);
  const host = destination.area === "platform" ? RIVET_HOSTS.platform
    : destination.area === "member" ? RIVET_HOSTS.member : RIVET_HOSTS.gym;
  useEffect(() => {
    if (isRivetHost(window.location.hostname) && window.location.hostname !== host) {
      const direct = directEntryPath(identity);
      window.location.replace(direct
        ? `https://${host}${postSignInPath(direct, window.location.search)}`
        : `https://${host}/login${window.location.search}`);
      return;
    }
    setReady(true);
  }, [host, identity]);
  return ready ? children : <AutomaticEntry label="Opening your account" />;
}

function IdentityEntries({ identity, audience }: { identity: RivetIdentity; audience: Audience }) {
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

  if (state === "checking" || state === "claimed") return <AutomaticEntry label={state === "claimed" ? "Confirming your gym invitation" : "Checking your gym invitation"} />;
  return (
    <NotEntitled
      title="We could not confirm your gym invitation"
      body="Ask your gym owner to send the invitation again. Then sign in again."
    />
  );
}

function NoGymTeamEntry() {
  return (
    <NotEntitled
      title="This account is not on a gym team"
      body="This sign-in is for gym staff. Ask your gym owner or manager to invite you. If you train at a gym, use member sign-in."
    />
  );
}

function WrongAudienceEntry({ audience }: { audience: "member" | "admin" }) {
  return (
    <NotEntitled
      title={audience === "admin" ? "This is for RIVET staff only" : "This sign-in is for gym members"}
      body={audience === "admin" ? "Only RIVET staff can sign in here." : "Gym staff accounts cannot sign in here. Use gym team sign-in."}
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
      if (selected) router.replace(postSignInPath(selected.role === "receptionist" ? "/reception" : "/dashboard", window.location.search));
    } catch {
      setBusy(undefined);
      setError(true);
    }
  };

  return (
    <NotEntitled
      title="Choose a gym"
      body="You work at more than one gym. Choose the one to open."
      action={(
        <div className="mt-4 grid gap-2 text-left">
          {identity.memberships.map((membership) => (
            <Button key={membership.organizationId} variant="secondary" className="h-auto justify-between py-3 text-left" onClick={() => void choose(membership.organizationId)} disabled={Boolean(busy)} loading={busy === membership.organizationId}>
              <span><span className="block font-medium">{membership.organizationName}</span><span className="mt-0.5 block text-[12px] text-ink-3">{ROLE_LABELS[membership.role]}</span></span>
              <span aria-hidden>→</span>
            </Button>
          ))}
          {error ? <p className="text-[12px] text-danger" role="alert">That gym could not be opened. Try again.</p> : null}
        </div>
      )}
    />
  );
}

export function UnavailableGymEntry() {
  return (
    <NotEntitled
      title="Your gym is not active on RIVET"
      body="Your gym's RIVET plan is not active right now. Contact RIVET to turn it back on, or sign out and use another account."
    />
  );
}

function GymEntry({ identity }: { identity: RivetIdentity }) {
  const membership = identity.memberships[0];

  if (!membership) {
    return (
      <NotEntitled
        title="This account is not on a gym team"
        body="Ask your gym owner or manager to add your email to the team. Then sign in here again."
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
        title="You are not added to a branch"
        body="Ask your gym manager to add you to a branch."
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
      router.replace(postSignInPath(destination.href, window.location.search));
    } catch {
      setBusy(undefined);
      setFailed(true);
      toast.error("Could not open that branch. Try again.");
    }
  };

  return (
    <NotEntitled
      title="Choose a branch"
      body="You work at more than one branch. Choose the one to open."
      action={(
        <div className="mt-4 grid gap-2 text-left">
          {membership.branches.map((branch) => (
            <Button key={branch.id} variant="secondary" className="h-auto justify-between py-3 text-left" onClick={() => void choose(branch.id)} disabled={Boolean(busy)} loading={busy === branch.id}>
              <span className="block font-medium">{branch.name}</span>
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
      .then(() => router.replace(postSignInPath(destination.href, window.location.search)))
      .catch(() => {
        setFailed(true);
        toast.error("Could not open your gym. Try again.");
      });
  }, [branchId, destination.href, identity.email, identity.fullName, membership.role, router, signIn]);

  if (failed) {
    return (
      <NotEntitled
        title="Your gym could not be opened"
        body="We found your gym but could not open it here. Sign out and sign in again."
      />
    );
  }

  return <AutomaticEntry label="Opening your gym" />;
}

function MemberEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signInAsIdentity } = useExperience();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.all([
      signInAsIdentity({ email: identity.email ?? "", fullName: identity.fullName ?? "" }),
      holdTransition(),
    ])
      .then(() => router.replace(postSignInPath("/customer/my-gyms", window.location.search)))
      .catch((error: unknown) => {
        if (error instanceof MemberProfileMissingError) setNeedsProfile(true);
        else setFailed(true);
      });
  }, [identity.email, identity.fullName, router, signInAsIdentity]);

  if (needsProfile) {
    return <MemberProfileCompletion identity={identity} onComplete={async () => {
      await signInAsIdentity({ email: identity.email ?? "", fullName: identity.fullName ?? "" });
      router.replace(postSignInPath("/customer/my-gyms", window.location.search));
    }} />;
  }

  if (failed) {
    return (
      <NotEntitled
        title="Your member account could not be opened"
        body="You are signed in, but we could not open your account here. Sign out and sign in again."
      />
    );
  }

  return <AutomaticEntry label="Opening your memberships" />;
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
    const timer = window.setTimeout(() => router.replace(postSignInPath("/platform", window.location.search)), ENTRY_TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [identity.platformAdmin, router]);

  if (!identity.platformAdmin) {
    return (
      <NotEntitled
        title="This account is not RIVET staff"
        body="Only RIVET staff can open the platform console."
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
