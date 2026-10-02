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
  "/signup",
  "/login/gym",
  "/login/member",
  "/login/admin",
  "/login/member/create",
]);

export function signedInRedirectTarget(input: { pathname: string }): string | null {
  return SIGNED_OUT_ONLY_PATHS.has(input.pathname) ? RESOLVER_PATH : null;
}
