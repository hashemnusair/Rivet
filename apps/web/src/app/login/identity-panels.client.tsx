"use client";

import { authErrorText } from "@/lib/auth/messages";
import { isRivetHost, RIVET_HOSTS, postSignInPath } from "@/lib/routing/host-routing";
import { useAction } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { CircleAlert, LogOut } from "lucide-react";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RivetMarkLoader } from "@/components/motion/rivet-mark-loader";
import { destinationFor, INVITATION_CLAIMED_EVENT, useRivetIdentity, type RivetIdentity, type RivetMembership } from "@/lib/auth/rivet-identity";
import { roleLabel } from "@/lib/i18n/labels";
import { useLocale } from "@/lib/i18n/provider";
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
  const { t } = useLocale();

  if (identity.status === "loading" || identity.status === "pending") {
    return <AutomaticEntry label={t("auth.identity.gettingReady")} />;
  }

  // Only a confirmed synchronization/query failure becomes an error. Normal
  // Clerk → Convex handoff states stay on the branded transition above.
  if (identity.status === "error") {
    return (
      <NotEntitled
        title={identity.accountDeactivated ? t("auth.identity.deactivatedTitle") : t("auth.identity.loadFailedTitle")}
        body={identity.accountDeactivated ? t("auth.identity.deactivatedBody") : authErrorText({ message: identity.errorMessage }, "auth.identity.loadFailedBody", t)}
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
  const { t } = useLocale();
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
  return ready ? children : <AutomaticEntry label={t("auth.identity.openingAccount")} />;
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
  const { t } = useLocale();
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

  if (state === "checking" || state === "claimed") return <AutomaticEntry label={state === "claimed" ? t("auth.identity.confirmingInvitation") : t("auth.identity.checkingInvitation")} />;
  return (
    <NotEntitled
      title={t("auth.identity.invitationFailedTitle")}
      body={t("auth.identity.invitationFailedBody")}
    />
  );
}

function NoGymTeamEntry() {
  const { t } = useLocale();
  return (
    <NotEntitled
      title={t("auth.identity.noTeamTitle")}
      body={t("auth.identity.noTeamBody")}
    />
  );
}

function WrongAudienceEntry({ audience }: { audience: "member" | "admin" }) {
  const { t } = useLocale();
  return (
    <NotEntitled
      title={audience === "admin" ? t("auth.identity.wrongAdminTitle") : t("auth.identity.wrongMemberTitle")}
      body={audience === "admin" ? t("auth.identity.wrongAdminBody") : t("auth.identity.wrongMemberBody")}
    />
  );
}

function OrganizationSelection({ identity }: { identity: RivetIdentity }) {
  const { selectOrganization } = useApp();
  const { t } = useLocale();
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
      title={t("auth.identity.chooseGymTitle")}
      body={t("auth.identity.chooseGymBody")}
      action={(
        <div className="mt-4 grid gap-2 text-start">
          {identity.memberships.map((membership) => (
            <Button key={membership.organizationId} variant="secondary" className="h-auto justify-between py-3 text-start" onClick={() => void choose(membership.organizationId)} disabled={Boolean(busy)} loading={busy === membership.organizationId}>
              <span><span className="block font-medium"><bdi>{membership.organizationName}</bdi></span><span className="mt-0.5 block text-[12px] text-ink-3">{roleLabel(t, membership.role)}</span></span>
              <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
            </Button>
          ))}
          {error ? <p className="text-[12px] text-danger" role="alert">{t("auth.identity.gymOpenFailed")}</p> : null}
        </div>
      )}
    />
  );
}

export function UnavailableGymEntry() {
  const { t } = useLocale();
  return (
    <NotEntitled
      title={t("auth.identity.unavailableTitle")}
      body={t("auth.identity.unavailableBody")}
    />
  );
}

function GymEntry({ identity }: { identity: RivetIdentity }) {
  const { t } = useLocale();
  const membership = identity.memberships[0];

  if (!membership) {
    return (
      <NotEntitled
        title={t("auth.identity.noTeamTitle")}
        body={t("auth.identity.noTeamAddBody")}
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
        title={t("auth.identity.noBranchTitle")}
        body={t("auth.identity.noBranchBody")}
      />
    );
  }

  return <AutomaticGymEntry identity={identity} membership={membership} />;
}

function BranchSelection({ identity, membership }: { identity: RivetIdentity; membership: RivetMembership }) {
  const { signIn } = useApp();
  const { t } = useLocale();
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
      toast.error(t("auth.identity.branchOpenToast"));
    }
  };

  return (
    <NotEntitled
      title={t("auth.identity.chooseBranchTitle")}
      body={t("auth.identity.chooseBranchBody")}
      action={(
        <div className="mt-4 grid gap-2 text-start">
          {membership.branches.map((branch) => (
            <Button key={branch.id} variant="secondary" className="h-auto justify-between py-3 text-start" onClick={() => void choose(branch.id)} disabled={Boolean(busy)} loading={busy === branch.id}>
              <span className="block font-medium"><bdi>{branch.name}</bdi></span>
              <span aria-hidden className="inline-block rtl:-scale-x-100">→</span>
            </Button>
          ))}
          {failed ? <p className="text-[12px] text-danger" role="alert">{t("auth.identity.branchOpenFailed")}</p> : null}
        </div>
      )}
    />
  );
}

function AutomaticGymEntry({ identity, membership }: { identity: RivetIdentity; membership: RivetMembership }) {
  const router = useRouter();
  const { signIn } = useApp();
  const { t } = useLocale();
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
        toast.error(t("auth.identity.gymToast"));
      });
  }, [branchId, destination.href, identity.email, identity.fullName, membership.role, router, signIn, t]);

  if (failed) {
    return (
      <NotEntitled
        title={t("auth.identity.gymFailedTitle")}
        body={t("auth.identity.gymFailedBody")}
      />
    );
  }

  return <AutomaticEntry label={t("auth.identity.openingGym")} />;
}

function MemberEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { t } = useLocale();
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
        title={t("auth.identity.memberFailedTitle")}
        body={t("auth.identity.memberFailedBody")}
      />
    );
  }

  return <AutomaticEntry label={t("auth.identity.openingMemberships")} />;
}

function AdminEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { t } = useLocale();
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
        title={t("auth.identity.notStaffTitle")}
        body={t("auth.identity.notStaffBody")}
      />
    );
  }

  return <AutomaticEntry label={t("auth.identity.openingConsole")} />;
}

function AutomaticEntry({ label }: { label: string }) {
  const { t } = useLocale();
  return (
    <div className="mt-7 flex min-h-56 flex-col items-center justify-center" role="status" aria-live="polite">
      <RivetMarkLoader className="h-14 w-auto text-ink" />
      <p className="mt-6 font-display text-[18px] font-semibold tracking-tight">{t("auth.identity.signedIn")}</p>
      <p className="mt-1.5 text-center text-[12.5px] text-ink-3">{label}…</p>
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
  const { t } = useLocale();
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
      toast.error(t("auth.identity.signOutFailed"));
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
        {signingOut ? t("auth.identity.signingOut") : t("auth.identity.signOutUseAnother")}
      </Button>
    </div>
  );
}
