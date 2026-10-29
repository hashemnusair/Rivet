"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MEMBER_TAB_HREFS } from "@/components/public/member-tabs";

/**
 * Re-mounts on every route change within this shell, so each page enters with
 * the same brief rise-and-fade instead of popping in. The dock's sections are
 * the exception: like a phone app's tab bar they switch instantly. Reduced-
 * motion users get an instant swap everywhere via the global animation
 * override.
 */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className={MEMBER_TAB_HREFS.includes(pathname) ? undefined : "page-transition"}>{children}</div>;
}
