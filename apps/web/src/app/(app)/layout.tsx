"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { destinationFor, useRivetIdentity } from "@/lib/auth/rivet-identity";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signedIn, sessionLoading, signIn, sidebarCollapsed } = useApp();
  const { isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useAuth();
  const identity = useRivetIdentity();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();
  const identityReady = DEMO_AUTH_BYPASS || clerkLoaded;
  const identitySignedIn = DEMO_AUTH_BYPASS || clerkSignedIn;

  // Convex owns the role; the workspace still reads gym data from the mock
  // tenant, so the role it reports is bound to a mock session rather than
  // chosen from a list. Nobody picks who they are any more.
  const gymRole = identity.status === "ready" ? destinationFor(identity).role : undefined;
  const binding = useRef(false);

  useEffect(() => {
    if (binding.current || signedIn || sessionLoading || !gymRole) return;
    binding.current = true;
    void signIn(gymRole).catch(() => {
      binding.current = false;
    });
  }, [gymRole, signIn, sessionLoading, signedIn]);

  const identityStillResolving = identity.status === "loading" || identity.status === "pending";

  useEffect(() => {
    if (!identityReady || sessionLoading || identityStillResolving) return;
    if (!identitySignedIn) {
      // Straight to the gym portal — the chooser would throw away the fact that
      // we already know which side of the product they were trying to reach.
      router.replace("/login/gym");
      return;
    }
    // Signed in, but this account holds no gym role. The portal explains that
    // rather than leaving them on a workspace that would render empty.
    if (!signedIn && !gymRole && identity.status === "ready") router.replace("/login/gym");
  }, [identityReady, identitySignedIn, identityStillResolving, identity.status, gymRole, sessionLoading, signedIn, router]);

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
