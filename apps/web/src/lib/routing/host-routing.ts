export type HostRoutingDecision =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; hostname: string; status: 308 };

/**
 * Normalize the host value supplied by a proxy or local development server.
 * Forwarded host headers may include a port, a trailing dot, or a comma
 * separated list when more than one proxy is involved.
 */
export function normalizeHostname(hostname: string | null | undefined): string {
  const firstForwardedHost = (hostname ?? "").split(",")[0] ?? "";
  const hostWithoutPort = firstForwardedHost.trim().split(":")[0] ?? "";
  return hostWithoutPort.replace(/\.$/, "").toLowerCase();
}

/**
 * Keep the public hostnames clean while reusing the existing route trees.
 * Authorization still happens in Clerk/Convex and the protected layouts;
 * hostname routing is only an entry-point and canonical-URL concern.
 */
export function decideHostRouting(
  hostname: string | null | undefined,
  pathname: string,
): HostRoutingDecision {
  const normalized = normalizeHostname(hostname);

  if (normalized === "admin.rivetjo.com") {
    return { kind: "redirect", hostname: "platform.rivetjo.com", status: 308 };
  }

  if (normalized === "app.rivetjo.com") {
    if (pathname === "/") return { kind: "rewrite", pathname: "/customer/discover" };
    if (pathname === "/login") return { kind: "rewrite", pathname: "/login/member" };
    if (pathname === "/signup") return { kind: "rewrite", pathname: "/customer/signup" };
  }

  if (normalized === "dashboard.rivetjo.com") {
    if (pathname === "/") return { kind: "rewrite", pathname: "/dashboard" };
    if (pathname === "/login") return { kind: "rewrite", pathname: "/login/gym" };
  }

  if (normalized === "platform.rivetjo.com") {
    if (pathname === "/") return { kind: "rewrite", pathname: "/platform" };
    if (pathname === "/login") return { kind: "rewrite", pathname: "/login/admin" };
  }

  return { kind: "next" };
}
