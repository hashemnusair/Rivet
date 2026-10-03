import type { TFunction } from "./core";
import type { Locale } from "./locale";
import { latinDigits } from "../utils/text";

export const CLASS_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

/** The timetable deliberately uses 12-hour clocks in both languages. */
export function classClockText(minute: number, locale: Locale, withMeridiem = true): string {
  const hour = Math.floor(minute / 60) % 24;
  const period = locale === "ar" ? hour < 12 ? "ص" : "م" : hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")}${withMeridiem ? ` ${period}` : ""}`;
}

export function classTimeRange(start: number, duration: number, locale: Locale): string {
  const end = start + duration;
  const samePeriod = (Math.floor(start / 60) % 24 < 12) === (Math.floor(end / 60) % 24 < 12);
  return `${classClockText(start, locale, !samePeriod)}–${classClockText(end, locale)}`;
}

export function classHourText(hour: number, locale: Locale): string {
  return classClockText((hour % 24) * 60, locale).replace(":00", "");
}

/** Logical geometry keeps a click aligned with the rendered hour in either direction. */
export function classMinuteAtPosition(x: number, left: number, width: number, firstHour: number, visibleHours: number, rtl: boolean): number {
  const physical = width > 0 ? (x - left) / width : 0;
  const ratio = Math.min(Math.max(rtl ? 1 - physical : physical, 0), 1);
  return firstHour * 60 + Math.floor((ratio * visibleHours * 60) / 30) * 30;
}

export function validClassCapacity(value: string): boolean {
  return /^\d+$/.test(latinDigits(value)) && Number.isSafeInteger(Number(latinDigits(value))) && Number(latinDigits(value)) >= 1 && Number(latinDigits(value)) <= 200;
}

/** Previous class uploads generated this exact fallback; distinct authored alt text is preserved. */
export function classImageAlt(t: TFunction, name: string, original?: string): string {
  return original && original !== `${name} photo` && original !== "Class photo" ? original : t("classWorkspace.photoAlt", { name });
}
