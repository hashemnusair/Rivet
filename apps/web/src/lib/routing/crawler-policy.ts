import type { MetadataRoute } from "next";
import { RIVET_HOSTS, normalizeHostname } from "./host-routing";

/** The pages of the public website that search engines should list. */
export const PUBLIC_SITEMAP_PATHS = ["/", "/signup", "/terms", "/privacy"] as const;

/**
 * Tools and internals served on the public host that are not pages to list.
 * Pages that carry their own `noindex` (/arabic-room, /billing, /offers) are
 * left out on purpose: a crawler has to be able to read that tag to obey it.
 */
const PUBLIC_SITE_DISALLOW = ["/api/", "/dev/", "/offline", "/onboarding/"];

/** Signed-in member pages. Gym discovery stays open. */
const MEMBER_APP_DISALLOW = [
  "/api/",
  "/customer/finance",
  "/customer/getting-started",
  "/customer/my-gyms",
  "/customer/profile",
  "/customer/receipts",
];

/**
 * One robots file per host. Only the public website is meant for search
 * engines. The gym workspace and the platform console are signed-in tools, so
 * crawlers are kept out of them. Any other host (a preview, localhost) is not
 * a public address and is closed too.
 */
export function robotsForHost(hostname: string | null | undefined): MetadataRoute.Robots {
  const host = normalizeHostname(hostname);
  if (host === RIVET_HOSTS.public) {
    return {
      rules: { userAgent: "*", allow: "/", disallow: PUBLIC_SITE_DISALLOW },
      sitemap: `https://${RIVET_HOSTS.public}/sitemap.xml`,
    };
  }
  if (host === RIVET_HOSTS.member) {
    return { rules: { userAgent: "*", allow: "/", disallow: MEMBER_APP_DISALLOW } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}

export function publicSitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_PATHS.map((path) => ({ url: `https://${RIVET_HOSTS.public}${path}` }));
}
