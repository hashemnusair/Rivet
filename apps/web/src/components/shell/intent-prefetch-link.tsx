"use client";

import Link from "next/link";
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { useRouteDataIntent } from "@/lib/navigation/use-route-data-prefetch";

/**
 * A navigation link that prepares its screen when the operator reaches for it
 * (the pointer arrives, keyboard focus lands, or a touch starts) rather than
 * when it scrolls into view.
 *
 * Workspace screens are client-rendered, so a full prefetch is small and lets
 * the screen open without a server round trip or a wait for its code. Doing
 * that for every sidebar entry at load made startup slower, and the default
 * prefetch of these dynamic routes did not save the round trip at all.
 *
 * The screen's first reads start at the same moments (after a short rest of
 * the pointer or focus, at once on touch or press; see
 * lib/navigation/route-reads.ts for which screens), so when the click lands
 * its data is usually in memory or on the way and the screen opens complete.
 */
export const IntentPrefetchLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof Link>>(function IntentPrefetchLink(
  { onPointerEnter, onPointerLeave, onPointerDown, onFocus, onBlur, onTouchStart, ...props },
  ref,
) {
  const [intent, setIntent] = useState(false);
  const data = useRouteDataIntent(typeof props.href === "string" ? props.href : undefined);
  return (
    <Link
      ref={ref}
      {...props}
      prefetch={intent}
      onPointerEnter={(event) => { setIntent(true); data.onPointerEnter(); onPointerEnter?.(event); }}
      onPointerLeave={(event) => { data.onPointerLeave(); onPointerLeave?.(event); }}
      onPointerDown={(event) => { data.onPointerDown(); onPointerDown?.(event); }}
      onFocus={(event) => { setIntent(true); data.onFocus(); onFocus?.(event); }}
      onBlur={(event) => { data.onBlur(); onBlur?.(event); }}
      onTouchStart={(event) => { setIntent(true); data.onTouchStart(); onTouchStart?.(event); }}
    />
  );
});
