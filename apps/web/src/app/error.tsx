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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-2 font-display text-[24px] font-semibold tracking-tight">An unexpected error occurred</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-ink-2">
        We could not display this page. Your previous action may still have completed, so check the relevant record before repeating it.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>
      </div>
    </div>
  );
}
