export type HostRoutingDecision =
  | { kind: "next" }
  | { kind: "rewrite"; pathname: string }
  | { kind: "redirect"; hostname: string; pathname?: string; status: 308 };

export const RIVET_HOSTS = {
  public: "www.rivetjo.com",
  gym: "dashboard.rivetjo.com",
  member: "app.rivetjo.com",
  platform: "platform.rivetjo.com",
} as const;
export const RIVET_ORIGINS = ["https://rivetjo.com", ...Object.values(RIVET_HOSTS).map((host) => `https://${host}`)];

export function normalizeHostname(hostname: string | null | undefined): string {
  const firstForwardedHost = (hostname ?? "").split(",")[0] ?? "";
  const hostWithoutPort = firstForwardedHost.trim().split(":")[0] ?? "";
  return hostWithoutPort.replace(/\.$/, "").toLowerCase();
}

export function isRivetHost(hostname: string | null | undefined): boolean {
  const host = normalizeHostname(hostname);
  return host === "rivetjo.com" || host === "admin.rivetjo.com" || Object.values(RIVET_HOSTS).some((value) => value === host);
}

function under(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

// Keep this list in sync with app/(app). The route-coverage test checks it.
const GYM_ROOTS = [
  "audit", "automations", "checklists", "checkout", "classes", "crm", "dashboard",
  "exports", "finance", "getting-started", "maintenance", "members", "memberships",
  "onboarding", "operations", "payments", "plans", "pt", "reception", "reports", "settings", "support",
];

/** Shared login resolves identity on whichever host received it. APIs, Clerk
 * handshakes, assets and unknown paths stay on their request origin. */
export function hostnameForPath(pathname: string): string | null {
  if (under(pathname, "/customer") || under(pathname, "/login/member")) return RIVET_HOSTS.member;
  if (under(pathname, "/platform") || under(pathname, "/login/admin")) return RIVET_HOSTS.platform;
  if (under(pathname, "/login/gym") || under(pathname, "/login/accept-invitation") || GYM_ROOTS.some((root) => under(pathname, `/${root}`))) return RIVET_HOSTS.gym;
  if (["/signup", "/terms", "/privacy"].includes(pathname)) return RIVET_HOSTS.public;
  if (under(pathname, "/offers")) return RIVET_HOSTS.member;
  return null;
}

/** Domains select canonical URLs. Clerk and Convex still enforce access. */
export function decideHostRouting(hostname: string | null | undefined, pathname: string): HostRoutingDecision {
  const host = normalizeHostname(hostname);
  if (!isRivetHost(host)) return { kind: "next" };

  // The member signup alias must be resolved before the public gym application.
  if (host === RIVET_HOSTS.member && pathname === "/signup") {
    return { kind: "redirect", hostname: host, pathname: "/login/member/create", status: 308 };
  }
  const owner = hostnameForPath(pathname);
  if (owner && host !== owner) return { kind: "redirect", hostname: owner, status: 308 };
  if (host === "admin.rivetjo.com") return { kind: "redirect", hostname: RIVET_HOSTS.platform, status: 308 };
  if (host === "rivetjo.com") return { kind: "redirect", hostname: RIVET_HOSTS.public, status: 308 };

  if (pathname === "/") {
    if (host === RIVET_HOSTS.member) return { kind: "rewrite", pathname: "/customer/discover" };
    if (host === RIVET_HOSTS.gym) return { kind: "rewrite", pathname: "/dashboard" };
    if (host === RIVET_HOSTS.platform) return { kind: "rewrite", pathname: "/platform" };
  }
  return { kind: "next" };
}

/** Only local paths are accepted as auth continuations. Backslashes and control
 * characters can be normalized by the browser into an external URL. */
export function safeInternalRedirect(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return fallback;
  return value;
}

/** Absolute only when crossing a production host. Preview and localhost stay local. */
export function canonicalHref(href: string, hostname: string): string {
  if (!isRivetHost(hostname) || safeInternalRedirect(href, "") !== href) return href;
  const url = new URL(href, `https://${normalizeHostname(hostname)}`);
  const decision = decideHostRouting(hostname, url.pathname);
  if (decision.kind !== "redirect") return href;
  url.hostname = decision.hostname;
  if (decision.pathname) url.pathname = decision.pathname;
  return url.href;
}

export function publicSiteHref(hostname: string): string {
  return isRivetHost(hostname) ? `https://${RIVET_HOSTS.public}/` : "/";
}

/** A continuation cannot override the account's area or return to a login loop. */
export function postSignInPath(fallback: string, search: string): string {
  const next = safeInternalRedirect(new URLSearchParams(search).get("next"), "");
  if (!next) return fallback;
  const pathname = new URL(next, "https://local.invalid").pathname;
  if (under(pathname, "/login") || pathname === "/signup" || under(pathname, "/customer/login") || under(pathname, "/customer/signup")) return fallback;
  const owner = hostnameForPath(pathname);
  return owner && owner === hostnameForPath(fallback) ? next : fallback;
}

export function loginHref(path: string): string {
  return `/login?next=${encodeURIComponent(safeInternalRedirect(path, "/"))}`;
}
