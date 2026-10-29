"use client";

import { loginHref } from "@/lib/routing/host-routing";
import { usePathname } from "next/navigation";
import { terminationExportDeadline } from "@/lib/domain/export-access";
import { TerminationExportFrame } from "@/features/exports/termination-export-frame";
import { useAuth } from "@clerk/nextjs";
import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { PhonePageBoundary } from "@/components/shell/phone-page-boundary";
import { Sidebar } from "@/components/shell/sidebar";
import { TenantBrandProvider } from "@/components/shell/tenant-brand-provider";
import { Topbar } from "@/components/shell/topbar";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { useT } from "@/lib/i18n/provider";
import { useExperience } from "@/lib/providers/experience-provider";
import { useDampedRootOverscroll } from "@/lib/hooks/use-damped-root-overscroll";
import { cn } from "@/lib/utils/cn";
import { OnboardingBanner } from "@/components/onboarding/onboarding-banner";
import { SubscriptionAgreementGate } from "@/features/legal/subscription-agreement-gate";
import { BillingNoticeBanner } from "@/features/billing/billing-notice";
import { WorkspaceCurtain } from "@/components/motion/workspace-curtain";
import { AskRivetProvider, useAskRivet } from "@/features/ask-rivet/ask-rivet-context";
import { AskRivetPanel } from "@/features/ask-rivet/ask-rivet-panel";
import { AskRivetLauncher, AskRivetPhoneLauncher } from "@/features/ask-rivet/launcher";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
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
  const pathname = usePathname();
  const subscription = session?.organization.subscription;
  const previewExportOnly = DEMO_AUTH_BYPASS && session?.roles[0] === "owner" && subscription && terminationExportDeadline({ status: subscription.status, cancelledAt: subscription.cancelledAt ? Date.parse(subscription.cancelledAt) : undefined }) !== undefined;
  const exportOnly = Boolean((identity.exportAccess?.length && !identity.memberships.length) || previewExportOnly);
  const exportRouteAllowed = pathname === "/exports" && Boolean(identity.exportAccess?.length || previewExportOnly);
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
  const workspaceDestinationAllowed = identity.status === "demo" || identityDestination?.area === "gym";
  const workspaceReady = Boolean(workspaceDestinationAllowed && identityReady && !sessionLoading && !identityStillResolving && identitySignedIn && signedIn && !exportOnly);

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
      // Keep the requested page while the resolver authenticates this account.
      router.replace(DEMO_AUTH_BYPASS ? "/login" : loginHref(`${window.location.pathname}${window.location.search}${window.location.hash}`));
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
    if (exportRouteAllowed) return;
    if (exportOnly && identityDestination?.area !== "billing") {
      if (pathname !== "/exports") router.replace("/exports");
      return;
    }
    if (identityDestination && identityDestination.area !== "gym") router.replace(identityDestination.href);
  }, [identityDestination, identityReady, identitySignedIn, identityStillResolving, identity.status, previewMemberSignedIn, previewPlatformAdminSignedIn, sessionLoading, router, exportOnly, exportRouteAllowed, pathname]);

  // The curtain is the second child either way, so React keeps it across the
  // change and it lifts off the shell it was covering instead of vanishing.
  const curtain = <WorkspaceCurtain ready={workspaceReady} label={t("palette.layout.loadingGym")} />;
  // Termination exports do not require choosing an unrelated active workspace.
  if (exportRouteAllowed && (exportOnly || !workspaceDestinationAllowed)) return <TerminationExportFrame>{children}</TerminationExportFrame>;
  if (!workspaceReady) return <>{null}{curtain}</>;

  return (
    <>
    <TenantBrandProvider>
    <AskRivetProvider>
      <div className="min-h-screen bg-paper">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      {/* The fixed sidebar only exists ≥ lg; below that the drawer overlays
          instead, so the content column keeps the full viewport width. */}
      <WorkspaceColumn sidebarCollapsed={sidebarCollapsed}>
        {/* Keep the utility bar outside the damped edge-response layer. Desktop
            content can move a few pixels at a scroll boundary without pulling
            search and branch controls away from the fixed sidebar brand row. */}
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <div
          ref={scrollShellRef}
          data-testid="app-scroll-shell"
          className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:min-h-[calc(100dvh-4rem)]"
        >
          <BillingNoticeBanner />
          {session ? <OnboardingBanner audience={session.roles[0] === "owner" ? "owner" : "staff"} /> : null}
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8"><PhonePageBoundary>{children}</PhonePageBoundary></main>
        </div>
      </WorkspaceColumn>
      <AskRivetLauncher />
      <AskRivetPhoneLauncher />
      <AskRivetPanel />
      </div>
      <SubscriptionAgreementGate required={agreementRequired} />
    </AskRivetProvider>
    </TenantBrandProvider>
    {curtain}
    </>
  );
}

/**
 * The workspace column. Wazen floats above it in the bottom corner and never
 * takes its width, so screens keep their own layout; where Wazen is
 * available the page ends with room to scroll its last row clear of the
 * launcher.
 */
function WorkspaceColumn({ sidebarCollapsed, children }: { sidebarCollapsed: boolean; children: React.ReactNode }) {
  const askRivet = useAskRivet();
  return (
    <div
      className={cn(
        "min-h-screen",
        sidebarCollapsed ? "lg:ms-[60px]" : "lg:ms-[228px]",
        askRivet?.available && "[&_main]:pb-24",
      )}
    >
      {children}
    </div>
  );
}
