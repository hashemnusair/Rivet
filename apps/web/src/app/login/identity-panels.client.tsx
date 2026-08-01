"use client";

import { ArrowRight, Building2, CircleAlert, Dumbbell, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { destinationFor, useRivetIdentity, type RivetIdentity } from "@/lib/auth/rivet-identity";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { LoginLoading } from "./login-chrome";
import type { Audience } from "./portals";

/**
 * What a portal shows once Clerk has authenticated someone and Convex has said
 * who they are. Nobody picks an account here: the role on their Convex
 * membership decides where they go, and a portal they do not belong to says so
 * plainly rather than offering a way in.
 */
export function IdentityPanel({ audience }: { audience: Audience }) {
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

  if (audience === "staff") return <GymEntry identity={identity} />;
  if (audience === "member") return <MemberEntry identity={identity} />;
  return <AdminEntry identity={identity} />;
}

function GymEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signIn } = useApp();
  const [loading, setLoading] = useState(false);
  const membership = identity.memberships[0];

  if (!membership) {
    return (
      <NotEntitled
        title="This account is not on a gym team"
        body="Gym staff are added by the gym's owner or manager. Once someone puts your email on the team, this portal opens your workspace automatically."
        primary={{ label: "Continue as a member", href: "/login/member" }}
      />
    );
  }

  const destination = destinationFor(identity);
  const enter = async () => {
    setLoading(true);
    try {
      await signIn(membership.role);
      router.push(destination.href);
    } catch {
      setLoading(false);
      toast.error("Could not open the workspace.");
    }
  };

  return (
    <div className="mt-7">
      <p className="eyebrow">Your gym</p>
      <div className="mt-3 rounded-lg border border-line-2 bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
            <Building2 className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">{membership.organizationName}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">
              {ROLE_LABELS[membership.role]}
              {membership.branches.length > 0 ? ` · ${membership.branches.map((b) => b.name).join(", ")}` : null}
            </p>
          </div>
        </div>
      </div>

      <Button className="mt-5 w-full" size="lg" loading={loading} onClick={() => void enter()} data-testid="enter-workspace">
        Open workspace <ArrowRight className="size-4" />
      </Button>
      <p className="mt-3 text-center text-[11.5px] text-ink-3">
        Opens as {ROLE_LABELS[membership.role].toLowerCase()} — your permissions come from your gym, not from this page.
      </p>
    </div>
  );
}

function MemberEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signInAsIdentity } = useExperience();
  const name = identity.fullName || identity.email || "your account";

  const enter = () => {
    signInAsIdentity({ email: identity.email ?? "", fullName: identity.fullName ?? "" });
    router.push("/customer/my-gyms");
  };

  return (
    <div className="mt-7">
      <p className="eyebrow">Your member account</p>
      <div className="mt-3 flex items-center gap-3 rounded-lg border border-line-2 bg-surface p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
          <Dumbbell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{identity.email}</p>
        </div>
      </div>

      <Button className="mt-5 w-full" size="lg" onClick={enter} data-testid="enter-member">
        Continue to my dashboard <ArrowRight className="size-4" />
      </Button>

      {identity.memberships.length > 0 ? (
        <p className="mt-4 text-center text-[12px] text-ink-3">
          You are also on the team at {identity.memberships[0]!.organizationName}.{" "}
          <Link href="/login/gym" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
            Open the gym workspace
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-center text-[12px] text-ink-3">
          No memberships yet — your dashboard will help you find a gym and book a free trial.
        </p>
      )}
    </div>
  );
}

function AdminEntry({ identity }: { identity: RivetIdentity }) {
  const router = useRouter();
  const { signInPlatformAdmin } = useExperience();

  if (!identity.platformAdmin) {
    return (
      <NotEntitled
        title="This account is not a platform administrator"
        body="The platform console manages every gym on RIVET, so access is granted deliberately in Convex rather than requested here."
        primary={{ label: "Back to sign-in options", href: "/login" }}
      />
    );
  }

  const enter = () => {
    signInPlatformAdmin();
    router.push("/platform");
  };

  return (
    <div className="mt-7">
      <div className="rounded-lg border border-line-2 bg-surface p-4">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <ShieldCheck className="size-4 text-signal" /> Platform administrator
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          Signed in as {identity.email}. Tenant management, subscriptions, billing and support across every gym on RIVET.
        </p>
      </div>
      <Button variant="signal" className="mt-5 w-full" size="lg" onClick={enter} data-testid="enter-platform">
        Open platform console <ArrowRight className="size-4" />
      </Button>
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
