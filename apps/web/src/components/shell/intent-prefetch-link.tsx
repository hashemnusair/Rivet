"use client";

import Link from "next/link";
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * A navigation link that prepares its screen when the operator reaches for it
 * (the pointer arrives, keyboard focus lands, or a touch starts) rather than
 * when it scrolls into view.
 *
 * Workspace screens are client-rendered, so a full prefetch is small and lets
 * the screen open without a server round trip or a wait for its code. Doing
 * that for every sidebar entry at load made startup slower, and the default
 * prefetch of these dynamic routes did not save the round trip at all.
 */
export const IntentPrefetchLink = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof Link>>(function IntentPrefetchLink(
  { onPointerEnter, onFocus, onTouchStart, ...props },
  ref,
) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      ref={ref}
      {...props}
      prefetch={intent}
      onPointerEnter={(event) => { setIntent(true); onPointerEnter?.(event); }}
      onFocus={(event) => { setIntent(true); onFocus?.(event); }}
      onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
    />
  );
});
