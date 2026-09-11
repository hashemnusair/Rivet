"use client";

import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef } from "react";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { usePublicViewer } from "@/lib/auth/public-viewer";

/**
 * Sends a visitor who arrives signed in at a signed-out page (the landing,
 * the application, a sign-in door) on to their own area. In a real build the
 * middleware has usually done this before the page rendered; here it also
 * covers demo mode, where the personas live in the browser, and a cached
 * client navigation. Only an arrival counts: a sign-in completed on the page
 * itself (a door's own form) is left to the page, which knows where it is
 * taking that person.
 */
export function SignedInGuard({ demoOnly = false }: { demoOnly?: boolean }) {
  const viewer = usePublicViewer();
  const router = useRouter();
  const arrival = useRef<"unknown" | "signed-in" | "signed-out">("unknown");

  useEffect(() => {
    if (viewer.status === "loading") return;
    if (arrival.current === "unknown") arrival.current = viewer.status;
    if (arrival.current !== "signed-in") return;
    if (demoOnly && !DEMO_AUTH_BYPASS) return;
    if (viewer.status !== "signed-in") return;
    router.replace(viewer.destination.href);
  }, [demoOnly, router, viewer]);

  return null;
}
