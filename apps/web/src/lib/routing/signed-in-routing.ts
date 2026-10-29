/**
 * Pages that exist only for people who are signed out: the landing, the gym
 * application and the sign-in doors. A signed-in visitor who opens one is
 * sent to the resolver instead, which reads the account's role and opens the
 * right area on its own host. The landing is never shown to a signed-in
 * account, on any host.
 */
export const RESOLVER_PATH = "/login";
export const SIGNED_OUT_ONLY_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/ar",
  "/signup",
  "/login/gym",
  "/login/member",
  "/login/admin",
  "/login/member/create",
]);

/**
 * Someone signed in can still open the landing on purpose, as the platform
 * console's "Landing page" link does, by asking for it with `?view=landing`.
 * A plain visit to `/` still opens their own area.
 */
export const LANDING_VIEW_QUERY = "view=landing";

export function landingViewRequested(search: string): boolean {
  return new URLSearchParams(search).get("view") === "landing";
}

export function signedInRedirectTarget(input: { pathname: string; search?: string }): string | null {
  if ((input.pathname === "/" || input.pathname === "/ar") && landingViewRequested(input.search ?? "")) return null;
  return SIGNED_OUT_ONLY_PATHS.has(input.pathname) ? RESOLVER_PATH : null;
}
