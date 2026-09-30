"use client";

import { Check, Circle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { OnboardingAudience, OnboardingTaskState } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";

export function OnboardingChecklist({ audience, compact = false }: { audience: OnboardingAudience; compact?: boolean }) {
  const invalidate = useInvalidate();
  const experience = useApiQuery(qk.onboarding(audience), (api) => api.getOnboardingExperience(audience));
  const restoredHashRef = useRef<string | null>(null);
  const update = useApiMutation((api, input: { completedStepKey?: string; dismissed?: boolean; restart?: boolean }) => api.updateOnboardingProgress({ audience, ...input }), { onSuccess: async (_result, input) => {
    if (input.completedStepKey) toast.success("Step marked as done.");
    await invalidate();
  } });

  // The guide and checklist are client-rendered, so the browser's initial
  // hash pass can happen before the requested guide section exists in the DOM.
  // Re-apply the hash after the checklist data mounts; this keeps links such
  // as #role useful for both direct loads and next-step suggestions.
  useEffect(() => {
    if (!experience.data || typeof window === "undefined") return;

    let frame: number | undefined;
    const scrollToHash = () => {
      const hash = window.location.hash;
      const anchor = hash.slice(1);
      if (!anchor) {
        restoredHashRef.current = null;
        return;
      }
      if (restoredHashRef.current === hash) return;
      const target = document.getElementById(anchor);
      if (!target || typeof target.scrollIntoView !== "function") return;
      const scroll = () => {
        restoredHashRef.current = hash;
        target.scrollIntoView({ block: "start" });
      };
      if (typeof window.requestAnimationFrame !== "function") {
        scroll();
        return;
      }
      frame = window.requestAnimationFrame(scroll);
    };

    const handleHashChange = () => {
      restoredHashRef.current = null;
      scrollToHash();
    };

    scrollToHash();
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [experience.data]);

  if (compact && !experience.data) return null;
  if (experience.isLoading) return <Skeleton className={compact ? "h-20" : "h-80"} />;
  if (experience.isError || !experience.data) return <ErrorState onRetry={() => experience.refetch()} />;
  const required = experience.data.tasks.filter((task) => task.category === "required");
  const requiredComplete = required.filter((task) => task.complete).length;
  const percent = required.length ? Math.round(requiredComplete / required.length * 100) : 100;
  if (compact && (requiredComplete === required.length || experience.data.progress.dismissedAt || experience.data.progress.completedAt)) return null;
  if (compact) return <section className="border-b border-line bg-signal-bg/20 px-4 py-2.5 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-[1440px] items-center gap-3"><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-[12.5px] font-semibold">{audience === "owner" ? `Finish setting up ${experience.data.organizationName ?? "your gym"}` : audience === "member" ? "Finish setting up your member account" : "Finish getting started"}</p><span className="shrink-0 text-[12px] text-ink-3">{requiredComplete} of {required.length} steps done</span></div><div className="mt-1 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${percent}%` }} /></div></div><Button asChild size="sm" variant="secondary"><Link href={audience === "member" ? "/customer/getting-started" : "/getting-started"}>Continue setup</Link></Button><button type="button" className="text-[12px] text-ink-3 underline underline-offset-4" onClick={() => update.mutate({ dismissed: true })}>Hide</button></div></section>;

  return <section className="space-y-4"><div className="panel p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="context-label">Progress</p><p className="mt-1 font-display text-[24px] font-semibold">{percent}% ready</p><p className="mt-1 text-[12px] text-ink-3">{requiredComplete} of {required.length} required steps done. Optional steps can wait.</p></div><div className="w-full max-w-xs"><div className="h-2 overflow-hidden rounded-full bg-sunken-2"><div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${percent}%` }} /></div><Button size="sm" variant="ghost" className="mt-2" loading={update.isPending} onClick={() => update.mutate({ restart: true })}><RotateCcw /> Start over</Button></div></div></div><ol className="grid gap-3 lg:grid-cols-2">{experience.data.tasks.map((task, index) => <OnboardingTask key={task.key} task={task} index={index} onComplete={() => update.mutate({ completedStepKey: task.key })} loading={update.isPending} />)}</ol></section>;
}

function OnboardingTask({ task, index, onComplete, loading }: { task: OnboardingTaskState; index: number; onComplete: () => void; loading: boolean }) {
  return <li data-onboarding-task={task.key} className={cn("panel relative flex gap-3 p-4", task.complete && "bg-sunken/30")}><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px]", task.complete ? "border-signal bg-signal text-white" : "border-line-3 text-ink-3")}>{task.complete ? <Check className="size-4" /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-[13.5px] font-semibold">{task.title}</h2><span className="rounded-full bg-sunken px-2 py-0.5 text-[12px] font-medium text-ink-3">{task.category === "required" ? "Required" : task.category === "recommended" ? "Recommended" : "Optional"}</span></div><p className="mt-1 text-[12px] leading-relaxed text-ink-2">{task.description}</p>{task.unavailableReason ? <p className="mt-2 text-[12px] text-warning-deep">{task.unavailableReason}</p> : null}<div className="mt-3 flex items-center gap-2"><Button asChild size="sm" variant="secondary"><Link href={task.href}>{task.complete ? "Review" : "Open"}</Link></Button>{!task.complete && task.completionMode === "manual" && !task.unavailableReason ? <Button size="sm" variant="ghost" loading={loading} onClick={onComplete}><Circle /> Mark as done</Button> : null}</div></div></li>;
}
