"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { isRivetHost, safeInternalRedirect } from "@/lib/routing/host-routing";
import { SIGNING_IN_ARRIVAL_COOKIE, SIGNING_IN_ARRIVAL_TTL_SECONDS, signingInMarkerFresh } from "./signing-in-marker";

/**
 * One cover for the whole of signing in.
 *
 * After the password (and a code, when Clerk asks for one) several things
 * still have to happen: Clerk starts the session, Convex learns who this is,
 * the gym session loads and the right page for the role opens. Each of those
 * used to show its own wait with its own words. Now every one of them *holds*
 * the same full-screen cover ("Signing you in…"), which is rendered once in
 * the root layout and so stays put while the page underneath changes, from
 * the sign-in page to the dashboard.
 *
 * A component holds the cover for as long as it is waiting
 * (`useSigningInHold`). A destination shell keeps it until the shell is ready
 * (`useSignInArrival`). When nothing holds it any more, it lifts off whatever
 * is underneath: the dashboard, or a screen that needs the person (wrong
 * door, choose a branch, finish your name).
 */

export type DecorateUrl = (url: string) => string;

/** Longest the cover may hide the page. After it, the waits underneath show, with their sign-out. */
export const SIGNING_IN_MAX_COVER_MS = 15_000;
/** One waiting screen hands over to the next inside a single commit; this bridges it. */
const RELEASE_GRACE_MS = 60;

let holds = 0;
let covering = false;
let coverDeadline = 0;
let releaseTimer: number | undefined;
let decorateUrl: DecorateUrl | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isCovering = () => covering;
const notOnServer = () => false;

function arrivalCookieSuffix(maxAge: number) {
  const shared = isRivetHost(window.location.hostname) ? "; domain=rivetjo.com" : "";
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  return `; path=/; max-age=${maxAge}; samesite=lax${shared}${secure}`;
}

/** Tells the next document (see `signing-in-marker.ts`) that it is part of this sign-in. */
function markArrival() {
  try {
    document.cookie = `${SIGNING_IN_ARRIVAL_COOKIE}=${Date.now()}${arrivalCookieSuffix(SIGNING_IN_ARRIVAL_TTL_SECONDS)}`;
  } catch {
    // A browser that refuses cookies only loses the matching words.
  }
}

function clearArrival() {
  try {
    document.cookie = `${SIGNING_IN_ARRIVAL_COOKIE}=${arrivalCookieSuffix(0)}`;
  } catch {
    // Nothing to clear.
  }
}

function arrivedSigningIn(): boolean {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SIGNING_IN_ARRIVAL_COOKIE}=(\\d+)`));
    return signingInMarkerFresh(match?.[1], Date.now());
  } catch {
    return false;
  }
}

/**
 * Keeps the cover up until the returned function is called. The cover has one
 * deadline for the whole sign-in, however many screens take turns holding it.
 */
export function holdSigningIn(): () => void {
  const now = Date.now();
  if (!covering) coverDeadline = now + SIGNING_IN_MAX_COVER_MS;
  // Overdue: the page underneath is showing its own wait, with a way out.
  if (now >= coverDeadline) return () => {};

  holds += 1;
  window.clearTimeout(releaseTimer);
  markArrival();
  if (!covering) {
    covering = true;
    emit();
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    window.clearTimeout(limit);
    holds -= 1;
    if (holds > 0) return;
    releaseTimer = window.setTimeout(() => {
      if (holds > 0 || !covering) return;
      covering = false;
      emit();
    }, RELEASE_GRACE_MS);
  };
  const limit = window.setTimeout(release, coverDeadline - now);
  return release;
}

/** Holds the cover while `active`, from before the paint that would otherwise show the wait. */
export function useSigningInHold(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    return holdSigningIn();
  }, [active]);
}

/** Whether the cover is up. The root layout's cover and the waits beneath it read this. */
export function useSigningInCover(): boolean {
  return useSyncExternalStore(subscribe, isCovering, notOnServer);
}

/**
 * For the shell someone lands in after signing in (gym, member, platform).
 *
 * `covered`: the sign-in cover is up, so the shell must not draw its own.
 * The shell keeps that cover until it is `ready`.
 * `arriving`: this document was loaded as part of a sign-in, so the shell's
 * own cover uses the sign-in words instead of its usual ones.
 */
export function useSignInArrival(ready: boolean): { covered: boolean; arriving: boolean } {
  const covered = useSigningInCover();
  const arriving = useSyncExternalStore(subscribe, arrivedSigningIn, notOnServer);

  useLayoutEffect(() => {
    if (ready || !covering) return;
    return holdSigningIn();
  }, [ready]);

  // Once the shell is open the sign-in is over: a later reload is a plain load.
  useEffect(() => {
    if (!ready) return;
    clearArrival();
    emit();
  }, [ready]);

  return { covered, arriving: arriving && !ready };
}

/**
 * Clerk hands sign-in a function that, in Safari, turns the next address into
 * one that renews its cookie on the way. It is kept here until the page for
 * this account is known, so that renewal goes straight to that page instead
 * of back to the sign-in page first.
 */
export function rememberSignInUrlDecorator(decorate: DecorateUrl | null) {
  decorateUrl = decorate;
}

/** Opens the page a signed-in account belongs on, through Clerk's renewal when it asked for one. */
export function openSignedInPage(router: { replace: (href: string) => void }, href: string) {
  const decorate = decorateUrl;
  decorateUrl = null;
  let target = href;
  if (decorate) {
    try {
      target = decorate(href);
    } catch {
      target = href;
    }
  }
  // Clerk's renewal address is absolute and needs a full page load. Anything
  // else must still be a path inside the app, or the plain address is used.
  if (target !== href && /^https:\/\//i.test(target)) window.location.replace(target);
  else router.replace(safeInternalRedirect(target, href));
}

/**
 * Fallback for a sign-in door that did not take over from its form: load the
 * door again, signed in, which is what sign-in did before it stayed in place.
 * The door then reads the account and opens its page as usual.
 */
export function reloadSignedInDoor(href: string) {
  const decorate = decorateUrl;
  decorateUrl = null;
  let target = href;
  if (decorate) {
    try {
      target = decorate(href);
    } catch {
      target = href;
    }
  }
  window.location.replace(/^https:\/\//i.test(target) ? target : safeInternalRedirect(target, href));
}

/** Test seam: forget everything between tests. */
export function resetSigningInForTests() {
  window.clearTimeout(releaseTimer);
  holds = 0;
  covering = false;
  coverDeadline = 0;
  decorateUrl = null;
  clearArrival();
  emit();
}
