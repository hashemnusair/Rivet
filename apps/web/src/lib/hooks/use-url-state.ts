"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./use-debounced";

/**
 * Writes list state into the current URL with `router.replace`, so filters,
 * sections and pages survive a refresh and Back/Forward without adding a
 * history entry per keystroke. Empty values delete their key. `page` is
 * dropped whenever a change does not name it, because every other change
 * invalidates the current page number.
 */
export function useReplaceSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (changes: Record<string, string | undefined>, options?: { keepPage?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!("page" in changes) && !options?.keepPage) next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

/**
 * A search box whose settled text lives in the URL. Typing stays local and
 * debounced; the URL is written once the text settles; and an external URL
 * change (Back/Forward, a saved view, a pasted link) refills the box.
 *
 * Our own writes are remembered until they land, so an intermediate URL from
 * two quick writes is never mistaken for the operator navigating back.
 */
export function useUrlSearchText(key = "q", delayMs = 250) {
  const params = useSearchParams();
  const replace = useReplaceSearchParams();
  const urlValue = params.get(key) ?? "";
  const [text, setText] = useState(urlValue);
  const settled = useDebouncedValue(text, delayMs);
  const pendingWrite = useRef<string | null>(null);

  useEffect(() => {
    if (urlValue === settled) return;
    pendingWrite.current = settled;
    replace({ [key]: settled || undefined });
    // Only settled search text drives this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  useEffect(() => {
    if (pendingWrite.current !== null) {
      if (urlValue === pendingWrite.current) pendingWrite.current = null;
      return;
    }
    if (urlValue !== settled) setText(urlValue);
    // An external URL change is the only trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlValue]);

  return { text, setText, settled };
}

/** Reads a positive page number from the URL; anything else is page 1. */
export function pageFromParams(params: Pick<URLSearchParams, "get">): number {
  return Math.max(1, Number(params.get("page")) || 1);
}

/** Keeps a URL value only when it is one of the allowed choices. */
export function choiceFromParams<T extends string>(params: Pick<URLSearchParams, "get">, key: string, allowed: readonly T[], fallback: T): T {
  const value = params.get(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Keeps a URL value only when it is a real calendar date written as YYYY-MM-DD. */
export function isoDateFromParams(params: Pick<URLSearchParams, "get">, key: string): string | undefined {
  const value = params.get(key);
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) return undefined;
  return value;
}
