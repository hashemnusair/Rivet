"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-2 font-display text-[24px] font-semibold tracking-tight">An unexpected error occurred</h1>
      <p className="mt-2 max-w-sm text-[13.5px] text-ink-2">
        The demo runs fully in-memory — retrying is safe and nothing is lost.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
