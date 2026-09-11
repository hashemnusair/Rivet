"use client";

import { useHostRouter as useRouter } from "@/lib/routing/use-host-router";
import { useEffect, useRef } from "react";
import { RIVET_HOSTS } from "@/lib/routing/host-routing";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { usePublicViewer } from "@/lib/auth/public-viewer";
import { isSameSiteReferer, SITE_PARAM } from "@/lib/routing/signed-in-routing";

/**
 * A direct arrival is a document loaded at this very address without a page
 * on this site behind it: typed, bookmarked or linked from elsewhere. A visit
 * that came from inside RIVET, a Back/Forward step, or one carrying `?site`
 * is a reader who chose the site.
 */
function isDirectEntry(): boolean {
  if (["rivetjo.com", RIVET_HOSTS.public].includes(window.location.hostname)) return false;
  if (new URLSearchParams(window.location.search).has(SITE_PARAM)) return false;
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (entry?.type === "back_forward") return false;
  if (entry) {
    try {
      if (new URL(entry.name).pathname !== window.location.pathname) return false;
    } catch {
      // An unreadable entry counts for nothing either way.
    }
  }
  return !isSameSiteReferer(document.referrer, window.location.hostname);
}

/**
 * Sends a visitor who arrives signed in at a signed-out page on to their own
 * area. In a real build the middleware has usually done this before the page
 * rendered; here it also covers demo mode, where the personas live in the
 * browser. Only an arrival counts: a sign-in completed on the page itself
 * (a door's own form) is left to the page, which knows where it is taking
 * that person.
 */
export function SignedInGuard({ directEntryOnly = false, demoOnly = false }: { directEntryOnly?: boolean; demoOnly?: boolean }) {
  const viewer = usePublicViewer();
  const router = useRouter();
  const arrival = useRef<"unknown" | "signed-in" | "signed-out">("unknown");

  useEffect(() => {
    if (viewer.status === "loading") return;
    if (arrival.current === "unknown") arrival.current = viewer.status;
    if (arrival.current !== "signed-in") return;
    if (demoOnly && !DEMO_AUTH_BYPASS) return;
    if (viewer.status !== "signed-in") return;
    if (directEntryOnly && !isDirectEntry()) return;
    router.replace(viewer.destination.href);
  }, [demoOnly, directEntryOnly, router, viewer]);

  return null;
}
