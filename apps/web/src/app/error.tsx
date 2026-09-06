"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[rivet.client.error]", {
      digest: error.digest ?? "unassigned",
      errorName: error.name || "Error",
    });
  }, [error.digest, error.name]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="alert">
      <p className="text-[12px] font-medium text-ink-3">Something went wrong</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">This page could not be displayed</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
        Your previous action may still have completed, so check the relevant record before repeating it. Reloading keeps you where you are.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>
      </div>
    </div>
  );
}
