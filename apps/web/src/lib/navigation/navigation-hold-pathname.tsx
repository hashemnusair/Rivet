"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NavigationHoldPathnameContext } from "./navigation-hold";

/**
 * In the root layout, around the route tree and `NavigationHoldGate`. During
 * a navigation `usePathname()` already returns the page being rendered, so
 * the query hooks under it can tell a pending navigation from the screen
 * that is on display (see navigation-hold.tsx).
 */
export function NavigationHoldPathname({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <NavigationHoldPathnameContext.Provider value={pathname}>{children}</NavigationHoldPathnameContext.Provider>;
}
