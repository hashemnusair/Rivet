"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * There is one sign-in portal for the whole product (`/login`). This route only
 * exists so older links and bookmarks still land on the member tab.
 */
export default function CustomerLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login/member");
  }, [router]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-5" role="status" aria-label="Opening sign-in">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
      </div>
    </main>
  );
}
