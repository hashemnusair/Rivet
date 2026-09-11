"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { canonicalHref } from "@/lib/routing/host-routing";

/** Also covers cached Next links and history navigation that bypass Proxy. */
export function HostRouteGuard() {
  const pathname = usePathname();
  useEffect(() => {
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = canonicalHref(path, window.location.hostname);
    if (target !== path) window.location.replace(target);
  }, [pathname]);
  return null;
}
