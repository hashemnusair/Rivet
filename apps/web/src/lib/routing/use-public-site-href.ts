"use client";

import { useSyncExternalStore } from "react";
import { publicSiteHref } from "./host-routing";

const subscribe = () => () => {};
const getSnapshot = () => publicSiteHref(window.location.hostname);
const getServerSnapshot = () => "/";

/** The server/hydration snapshot stays local; production links resolve as soon
 * as the browser host is available without varying prerendered HTML by host. */
export function usePublicSiteHref() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
