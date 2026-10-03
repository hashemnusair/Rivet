"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error("[rivet.client.error]", {
      digest: error.digest ?? "unassigned",
      errorName: error.name || "Error",
    });
  }, [error.digest, error.name]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center" role="alert">
      <p className="text-[12px] font-medium text-ink-3">{t("common.states.errorTitle")}</p>
      <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight tracking-tight">This page could not open</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
        Your last action may already be saved. Check before you try it again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Button variant="secondary" onClick={() => window.history.back()}>{t("common.action.goBack")}</Button>
      </div>
    </div>
  );
}
