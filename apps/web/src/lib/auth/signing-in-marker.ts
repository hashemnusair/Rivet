/**
 * A full page load can fall inside a sign-in: Safari renews Clerk's cookie
 * that way, and each area lives on its own host. The next document cannot see
 * the previous one's memory, so a marker that lasts half a minute tells it to
 * carry on with the same words ("Signing you in…"). It says nothing about who
 * is signed in and grants nothing; the server never reads it.
 *
 * Kept apart from `signing-in.ts` (a client module) so the root layout, a
 * server component, can import the pre-paint script as a plain string.
 */
export const SIGNING_IN_ARRIVAL_COOKIE = "rivet_signing_in";
/** How long a full page load after signing in still counts as part of it. */
export const SIGNING_IN_ARRIVAL_TTL_SECONDS = 30;
/** Set on the document before the first paint when a page load is part of a sign-in. */
export const SIGNING_IN_DOCUMENT_ATTRIBUTE = "data-signing-in";

/** Whether a marker value (a millisecond timestamp) is still fresh at `now`. */
export function signingInMarkerFresh(value: string | undefined, now: number): boolean {
  if (!value || !/^\d{1,16}$/.test(value)) return false;
  const age = now - Number(value);
  return age >= 0 && age < SIGNING_IN_ARRIVAL_TTL_SECONDS * 1000;
}

/**
 * Runs before the first paint (root layout). On a page load that is part of
 * a sign-in it marks the document, so a cover the server drew with its usual
 * words ("Loading your gym") keeps them hidden until the page has swapped in
 * the sign-in words (`workspace-curtain.module.css`).
 */
export const SIGNING_IN_PRE_PAINT =
  `try{var m=document.cookie.match(/(?:^|; )${SIGNING_IN_ARRIVAL_COOKIE}=(\\d{1,16})/);` +
  `if(m){var a=Date.now()-Number(m[1]);if(a>=0&&a<${SIGNING_IN_ARRIVAL_TTL_SECONDS * 1000})` +
  `document.documentElement.setAttribute("${SIGNING_IN_DOCUMENT_ATTRIBUTE}","")}}catch(e){}`;
