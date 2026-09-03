"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { TenantBrandProvider } from "@/components/shell/tenant-brand-provider";
import { Topbar } from "@/components/shell/topbar";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { useDampedRootOverscroll } from "@/lib/hooks/use-damped-root-overscroll";
import { cn } from "@/lib/utils/cn";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { SubscriptionAgreementGate } from "@/features/legal/subscription-agreement-modal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, signedIn, sessionLoading, signIn, sidebarCollapsed } = useApp();
  const { customerSignedIn, platformAdminSignedIn } = useExperience();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const identity = useRivetIdentity();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const scrollShellRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const identityReady = DEMO_AUTH_BYPASS || clerkLoaded;
  const identitySignedIn = DEMO_AUTH_BYPASS || clerkSignedIn;
  const convexMode = isConvexMode();
  // The platform preview can leave a valid gym session mounted while an
  // operator follows the platform sidebar back to the gym workspace. Only
  // redirect an unbound protected route; never treat the platform flag as a
  // reason to discard an existing gym session.
  const previewMemberSignedIn = DEMO_AUTH_BYPASS && customerSignedIn && !signedIn;
  const previewPlatformAdminSignedIn = DEMO_AUTH_BYPASS && platformAdminSignedIn && !signedIn;

  // In Convex mode the session was hydrated from the authenticated identity;
  // mock mode retains its deterministic persona bootstrap for preview tests.
  const identityDestination = identity.status === "ready" ? destinationFor(identity) : undefined;
  const gymRole = identityDestination?.area === "gym" ? identityDestination.role : undefined;
  const binding = useRef(false);
  const identityName = identity.fullName || identity.email || "RIVET user";
  const identityEmail = identity.email || "";
  const identityStillResolving = identity.status === "loading" || identity.status === "pending";
  const sessionMatchesIdentity = convexMode || Boolean(
    signedIn &&
      session &&
      session.roles[0] === gymRole &&
      session.user.name === identityName &&
      session.user.email === identityEmail,
  );
  const workspaceReady = Boolean(identityReady && !sessionLoading && !identityStillResolving && identitySignedIn && signedIn);

  useDampedRootOverscroll(scrollShellRef, workspaceReady);

  // A gym owner who has not signed RIVET's subscription agreement gets a
  // blocking modal over the workspace until they do. Staff are never
  // blocked by it.
  const agreementRequired = workspaceReady && session?.legal?.agreementStatus === "required";

  useEffect(() => {
    if (convexMode || binding.current || sessionLoading || !gymRole || sessionMatchesIdentity) return;
    binding.current = true;
    void signIn(gymRole, undefined, { name: identityName, email: identityEmail }).finally(() => {
      binding.current = false;
    });
  }, [convexMode, gymRole, identityEmail, identityName, sessionLoading, sessionMatchesIdentity, signIn]);

  useEffect(() => {
    if (!identityReady || sessionLoading || identityStillResolving) return;
    if (!identitySignedIn) {
      // Straight to the gym portal — the chooser would throw away the fact that
      // we already know which side of the product they were trying to reach.
      router.replace("/login");
      return;
    }
    if (identity.status === "error" || identity.status === "anonymous") {
      router.replace("/login");
      return;
    }
    if (previewPlatformAdminSignedIn) {
      router.replace("/platform");
      return;
    }
    if (previewMemberSignedIn) {
      router.replace("/customer/my-gyms");
      return;
    }
    // A valid account that opened the wrong protected area should go directly
    // to its real destination. Routing through /login caused the visible
    // dashboard → login → platform flash reported in production.
    if (identityDestination && identityDestination.area !== "gym") router.replace(identityDestination.href);
  }, [identityDestination, identityReady, identitySignedIn, identityStillResolving, identity.status, previewMemberSignedIn, previewPlatformAdminSignedIn, sessionLoading, router]);

  if (!workspaceReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper" role="status" aria-label="Loading workspace">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
          <div className="h-full w-1/2 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-ink" />
        </div>
      </div>
    );
  }

  return (
    <TenantBrandProvider>
      <div className="min-h-screen bg-paper">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      {/* The fixed sidebar only exists ≥ lg; below that the drawer overlays
          instead, so the content column keeps the full viewport width. */}
      <div
        className={cn(
          "min-h-screen transition-[margin] duration-200",
          sidebarCollapsed ? "lg:ms-[60px]" : "lg:ms-[228px]",
        )}
      >
        {/* Keep the utility bar outside the damped edge-response layer. Desktop
            content can move a few pixels at a scroll boundary without pulling
            search and branch controls away from the fixed sidebar brand row. */}
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <div
          ref={scrollShellRef}
          data-testid="app-scroll-shell"
          className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-[calc(100dvh-4rem)]"
        >
          {session ? <OnboardingBanner audience={session.roles[0] === "owner" ? "owner" : "staff"} /> : null}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
      </div>
      <SubscriptionAgreementGate required={agreementRequired} />
    </TenantBrandProvider>
  );
}
