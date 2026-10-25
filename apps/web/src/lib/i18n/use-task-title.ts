"use client";

import { useCallback } from "react";
import { useFormat } from "./format";
import { useLocale } from "./provider";
import { presentSystemText } from "./system-messages";

/**
 * A task title in the reader's language. Tasks RIVET prepared carry a title
 * descriptor beside their stored English title; every other task, including
 * older prepared ones, keeps showing the title exactly as it was stored.
 */
export function useTaskTitle(): (task: { title: string; titleMessage?: unknown }) => string {
  const { locale, t } = useLocale();
  const format = useFormat();
  return useCallback((task) => presentSystemText(task.title, task.titleMessage, { locale, t, format }), [locale, t, format]);
}
