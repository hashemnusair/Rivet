"use client";

import { useMemo, useState } from "react";
import { classTimeOfDay, memberClassSuggestions, usualClassTime, type ClassTimeOfDay } from "@/lib/ai/class-finder";
import type { CustomerClassExperience } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { partsInTimeZone } from "@/lib/utils/dates";

const TIMES: ClassTimeOfDay[] = ["morning", "afternoon", "evening"];

function localMinute(iso: string, timeZone: string): number {
  const parts = partsInTimeZone(new Date(iso), timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/**
 * "Classes that fit you" in the member's own class view. It uses only this
 * member's bookable classes and their own attended history; choosing one opens
 * that day, where the member books as usual. Nothing is booked or saved here.
 */
export function MemberClassSuggestions({ experience, timeZone, onPick }: { experience: CustomerClassExperience; timeZone: string; onPick: (date: string) => void }) {
  const { t } = useLocale();
  const format = useFormat();
  const usual = useMemo(() => usualClassTime(experience.history.filter((item) => item.booking?.status === "attended").map((item) => localMinute(item.startsAt, timeZone))), [experience.history, timeZone]);
  const [time, setTime] = useState<ClassTimeOfDay | undefined>(usual);
  const suggestions = memberClassSuggestions(experience.upcoming.map((item) => ({ ...item, startMinuteLocal: localMinute(item.startsAt, timeZone) })), time);
  return (
    <section className="panel space-y-2 px-4 py-3" aria-labelledby="member-class-suggestions-title" data-testid="member-class-suggestions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="member-class-suggestions-title" className="text-[14px] font-semibold">{t("aiWork.memberClasses.title")}</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("aiWork.classes.timeLabel")}>
          {TIMES.map((option) => (
            <button key={option} type="button" aria-pressed={time === option} onClick={() => setTime(time === option ? undefined : option)} className={cn("min-h-9 rounded-md border px-2.5 text-[12.5px]", time === option ? "border-ink bg-sunken font-medium text-ink" : "border-line text-ink-2 hover:bg-sunken/60")}>
              {t(`aiWork.classes.time.${option}` as TKey)}
            </button>
          ))}
        </div>
      </div>
      {usual ? <p className="text-[12px] text-ink-3">{t("aiWork.memberClasses.usual", { time: t(`aiWork.timeOfDay.${usual}` as TKey) })}</p> : null}
      {suggestions.length ? (
        <ul className="divide-y divide-line" data-testid="member-class-suggestion-list">
          {suggestions.map((item) => (
            <li key={item.id}>
              <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-2 py-2 text-start text-[13px] hover:bg-sunken/40" onClick={() => onPick(item.date)} data-testid="member-class-suggestion">
                <span className="font-medium text-ink" dir="auto">{item.name}</span>
                <span className="text-[12px] text-ink-3">{format.dateTime(item.startsAt)} · {t("aiWork.classes.spots", { count: item.spotsRemaining })} · {t(`aiWork.timeOfDay.${classTimeOfDay(item.startMinuteLocal)}` as TKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[12.5px] text-ink-2">{t("aiWork.memberClasses.none")}</p>}
    </section>
  );
}
