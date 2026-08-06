"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, signedIn, sessionLoading, signIn, sidebarCollapsed } = useApp();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const identity = useRivetIdentity();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();
  const identityReady = DEMO_AUTH_BYPASS || clerkLoaded;
  const identitySignedIn = DEMO_AUTH_BYPASS || clerkSignedIn;
  const convexMode = isConvexMode();

  // In Convex mode the session was hydrated from the authenticated identity;
  // mock mode retains its deterministic persona bootstrap for preview tests.
  const identityDestination = identity.status === "ready" ? destinationFor(identity) : undefined;
  const gymRole = identityDestination?.area === "gym" ? identityDestination.role : undefined;
  const binding = useRef(false);
  const identityName = identity.fullName || identity.email || "RIVET user";
  const identityEmail = identity.email || "";
  const sessionMatchesIdentity = convexMode || Boolean(
    signedIn &&
      session &&
      session.roles[0] === gymRole &&
      session.user.name === identityName &&
      session.user.email === identityEmail,
  );

  useEffect(() => {
    if (convexMode || binding.current || sessionLoading || !gymRole || sessionMatchesIdentity) return;
    binding.current = true;
    void signIn(gymRole, undefined, { name: identityName, email: identityEmail }).finally(() => {
      binding.current = false;
    });
  }, [convexMode, gymRole, identityEmail, identityName, sessionLoading, sessionMatchesIdentity, signIn]);

  const identityStillResolving = identity.status === "loading" || identity.status === "pending";

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
    // A valid account that opened the wrong protected area should go directly
    // to its real destination. Routing through /login caused the visible
    // dashboard → login → platform flash reported in production.
    if (identityDestination && identityDestination.area !== "gym") router.replace(identityDestination.href);
  }, [identityDestination, identityReady, identitySignedIn, identityStillResolving, identity.status, sessionLoading, router]);

  if (!identityReady || sessionLoading || identityStillResolving || !identitySignedIn || !signedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper" role="status" aria-label="Loading workspace">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
          <div className="h-full w-1/2 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-ink" />
        </div>
        <style jsx>{`
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <Sidebar />
      <MobileNav open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      {/* The fixed sidebar only exists ≥ lg; below that the drawer overlays
          instead, so the content column keeps the full viewport width. */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-[margin] duration-200",
          sidebarCollapsed ? "lg:ms-[60px]" : "lg:ms-[228px]",
        )}
      >
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
