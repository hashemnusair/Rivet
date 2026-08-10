"use client";

import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "@/components/ui/states";
import type { ExperienceStatus } from "@/lib/providers/experience-provider";

export function ExperienceDataState({
  status,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  compact,
  className,
}: {
  status: ExperienceStatus;
  error?: string;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (status === "loading") {
    return (
      <div className={`flex items-center justify-center gap-2 border border-dashed border-line-2 bg-surface/60 px-6 py-10 text-center text-[13px] text-ink-2 ${className ?? ""}`} role="status" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin text-ink-3" aria-hidden />
        Loading the live RIVET network…
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState title="Live RIVET data is unavailable" description={error ?? "The network could not be loaded. Try again in a moment."} onRetry={onRetry} className={className} />;
  }
  return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} compact={compact} className={className} />;
}
