"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signedIn, sessionLoading, sidebarCollapsed } = useApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!sessionLoading && !signedIn) {
      router.replace("/login");
    }
  }, [sessionLoading, signedIn, router]);

  if (sessionLoading || !signedIn) {
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
