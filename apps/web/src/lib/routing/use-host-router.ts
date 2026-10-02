"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { canonicalHref } from "./host-routing";

/** A cross-subdomain transition must load a new document so Clerk can establish
 * the destination session and providers initialize in the correct origin. */
export function useHostRouter() {
  const router = useRouter();
  return useMemo(() => ({
    ...router,
    replace(href: string) {
      const target = canonicalHref(href, window.location.hostname);
      if (target !== href) window.location.replace(target);
      else router.replace(href);
    },
    push(href: string) {
      const target = canonicalHref(href, window.location.hostname);
      if (target !== href) window.location.assign(target);
      else router.push(href);
    },
  }), [router]);
}
