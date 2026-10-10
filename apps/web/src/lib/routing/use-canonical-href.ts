"use client";

import { useSyncExternalStore } from "react";
import { canonicalHref } from "./host-routing";

const subscribe = () => () => {};

/** A link straight to the host that serves `href`, so the browser skips the
 * redirect from this host. The server and hydration snapshot keep the local
 * path; production links resolve as soon as the browser host is known. */
export function useCanonicalHref(href: string) {
  return useSyncExternalStore(subscribe, () => canonicalHref(href, window.location.hostname), () => href);
}
