"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import type { ClassExclusion, ClassTimeOfDay } from "@/lib/ai/class-finder";
import type { AiRunView } from "@/lib/ai/contracts";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { useAiErrorText } from "./ai-message";
import { AiRunPanel } from "./run-panel";
import { capabilityAvailable, useAiSettings } from "./use-assist";

const TIMES: Array<ClassTimeOfDay | "any"> = ["any", "morning", "afternoon", "evening"];
const EXCLUSIONS = ["full", "not_eligible", "audience", "already_booked"] as const satisfies readonly ClassExclusion[];

/**
 * "Find a class" on the member overview. RIVET lists this week's classes the
 * member can actually be booked into (membership, audience, open spots); a
 * person chooses, and booking runs through the ordinary roster rules with
 * the spot rechecked at that moment.
 */
export function ClassFinder({ memberId }: { memberId: string }) {
  const { data: settings } = useAiSettings();
  if (!capabilityAvailable(settings, "class_finder")) return null;
  return <ClassFinderPanel memberId={memberId} />;
}

function ClassFinderPanel({ memberId }: { memberId: string }) {
  const { t } = useLocale();
  const format = useFormat();
  const errorText = useAiErrorText();
  const [time, setTime] = useState<ClassTimeOfDay | "any">("any");
  const [requested, setRequested] = useState(false);
  const [run, setRun] = useState<AiRunView | undefined>();
  const query = useApiQuery(qk.aiClassOptions({ memberId, time }), (api) => api.getClassOptions({ memberId, ...(time !== "any" ? { timeOfDay: time } : {}) }), { enabled: requested });
  const book = useApiMutation((api, occurrenceKey: string) => api.startAiRun({ playbook: "class_finder", params: { memberId, book: true, occurrenceKey }, requestKey: crypto.randomUUID() }), {
    onSuccess: (started) => setRun(started),
  });
  const data = query.data;
  return (
    <section className="panel px-4 py-3 lg:col-span-2" aria-labelledby={`class-finder-${memberId}`} data-testid="class-finder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`class-finder-${memberId}`} className="text-[13px] font-semibold">{t("aiWork.classes.title")}</h3>
          <p className="text-[12px] text-ink-3">{t("aiWork.classes.hint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("aiWork.classes.timeLabel")}>
          {TIMES.map((option) => (
            <button key={option} type="button" aria-pressed={time === option} onClick={() => setTime(option)} className={cn("min-h-8 rounded-md border px-2.5 text-[12.5px]", time === option ? "border-ink bg-sunken font-medium text-ink" : "border-line text-ink-2 hover:bg-sunken/60")}>
              {option === "any" ? t("aiWork.classes.anyTime") : t(`aiWork.classes.time.${option}` as TKey)}
            </button>
          ))}
          <Button type="button" size="sm" variant="secondary" loading={query.isFetching} onClick={() => { if (requested) void query.refetch(); else setRequested(true); }} data-testid="class-finder-find">{t("aiWork.classes.find")}</Button>
        </div>
      </div>
      {!requested ? null : query.isLoading ? <Skeleton className="mt-3 h-20 w-full" /> : query.isError ? <div className="mt-3"><ErrorState layout="section" onRetry={() => query.refetch()} /></div> : data && !data.available ? (
        <p className="mt-3 text-[12.5px] text-ink-2" role="status">{data.reason === "classes_paused" ? t("aiWork.classes.paused") : errorText(data.reason)}</p>
      ) : data?.available ? (
        <div className="mt-2 space-y-2" role="status">
          {data.options.length === 0 ? <p className="text-[12.5px] text-ink-2">{t("aiWork.classes.none")}</p> : (
            <ul className="divide-y divide-line" data-testid="class-finder-options">
              {data.options.map((option) => (
                <li key={option.occurrenceId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]" data-testid="class-option">
                  <div className="min-w-0">
                    <p className="font-medium text-ink" dir="auto">{option.name}</p>
                    <p className="text-ink-3">{format.dateTime(option.startsAt)} · <bdi>{option.branchName}</bdi>{option.coachName ? <> · <bdi>{option.coachName}</bdi></> : null} · {t("aiWork.classes.spots", { count: option.spotsLeft })}</p>
                  </div>
                  {data.canBook ? <Button type="button" size="xs" loading={book.isPending && book.variables === option.occurrenceId} disabled={book.isPending || Boolean(run)} onClick={() => book.mutate(option.occurrenceId)} data-testid="class-option-book">{t("aiWork.classes.book")}</Button> : null}
                </li>
              ))}
            </ul>
          )}
          {EXCLUSIONS.some((key) => data.excluded[key]) ? (
            <p className="text-[12px] text-ink-3" data-testid="class-finder-excluded">{t("aiWork.classes.notShown")} {EXCLUSIONS.filter((key) => data.excluded[key]).map((key) => t(`aiWork.classes.excluded.${key}`, { count: data.excluded[key]! })).join(" · ")}</p>
          ) : null}
          {!data.canBook && data.options.length ? <p className="text-[12px] text-ink-3">{t("aiWork.classes.bookingNeeds")}</p> : null}
        </div>
      ) : null}
      {run ? <div className="mt-3"><AiRunPanel runId={run.id} onClose={() => { setRun(undefined); void query.refetch(); }} /></div> : null}
    </section>
  );
}
