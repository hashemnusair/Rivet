"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp } from "@/lib/providers/app-providers";

export default function IndexPage() {
  const { signedIn, sessionLoading, session } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!signedIn) {
      router.replace("/login");
      return;
    }
    router.replace(session?.roles[0] === "receptionist" ? "/reception" : "/dashboard");
  }, [sessionLoading, signedIn, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper" role="status" aria-label="Loading">
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
