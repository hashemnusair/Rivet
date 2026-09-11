import { normalizeHostname, RIVET_HOSTS } from "./host-routing";

/**
 * Pages that exist only for people who are signed out: the gym application
 * and the sign-in doors. A signed-in visitor who opens one is sent to the
 * resolver instead, which reads the account's role and opens the right area.
 * Production marketing hosts always keep the landing open. Local previews
 * retain their direct-arrival resolver and explicit `?site` behavior.
 */
export const RESOLVER_PATH = "/login";
export const SITE_PARAM = "site";
export const SIGNED_OUT_ONLY_PATHS: ReadonlySet<string> = new Set([
  "/signup",
  "/login/gym",
  "/login/member",
  "/login/admin",
  "/login/member/create",
]);

/** True when the page that linked here is on the same site, whatever the scheme or port. */
export function isSameSiteReferer(referer: string | null | undefined, host: string | null | undefined): boolean {
  if (!referer || !host) return false;
  try {
    return normalizeHostname(new URL(referer).hostname) === normalizeHostname(host);
  } catch {
    return false;
  }
}

export function signedInRedirectTarget(input: {
  pathname: string;
  searchParams: URLSearchParams;
  referer?: string | null;
  host?: string | null;
}): string | null {
  const { pathname, searchParams, referer, host } = input;
  if (SIGNED_OUT_ONLY_PATHS.has(pathname)) return RESOLVER_PATH;
  if (pathname !== "/") return null;
  if (["rivetjo.com", RIVET_HOSTS.public].includes(normalizeHostname(host))) return null;
  if (searchParams.has(SITE_PARAM)) return null;
  if (isSameSiteReferer(referer, host)) return null;
  return RESOLVER_PATH;
}
