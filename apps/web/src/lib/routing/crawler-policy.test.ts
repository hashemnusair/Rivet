import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_SITEMAP_PATHS, publicSitemap, robotsForHost } from "./crawler-policy";
import { hostnameForPath, RIVET_HOSTS } from "./host-routing";

describe("crawler policy", () => {
  it("opens the public website and points at its sitemap", () => {
    const robots = robotsForHost("www.rivetjo.com");
    expect(robots.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(robots.sitemap).toBe("https://www.rivetjo.com/sitemap.xml");
  });

  it("keeps crawlers out of the gym workspace and the platform console", () => {
    for (const host of [RIVET_HOSTS.gym, RIVET_HOSTS.platform]) {
      expect(robotsForHost(host)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }
  });

  it("closes hosts that are not a RIVET address, such as previews", () => {
    expect(robotsForHost("rivet-git-some-branch.vercel.app")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(robotsForHost("localhost:3000")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(robotsForHost(null)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("leaves gym discovery open on the member app but not signed-in member pages", () => {
    const rules = robotsForHost("app.rivetjo.com:443").rules;
    const disallow = Array.isArray(rules) ? [] : [rules.disallow].flat();
    expect(disallow).toContain("/customer/my-gyms");
    expect(disallow).not.toContain("/customer/discover");
    expect(disallow).not.toContain("/");
  });

  it("lists only pages that exist and are served by the public host", () => {
    expect(publicSitemap().map((entry) => entry.url)).toEqual(PUBLIC_SITEMAP_PATHS.map((path) => `https://www.rivetjo.com${path}`));
    for (const path of PUBLIC_SITEMAP_PATHS) {
      const page = path === "/" ? "src/app/page.tsx" : `src/app${path}/page.tsx`;
      expect(existsSync(resolve(page)), page).toBe(true);
      expect([null, RIVET_HOSTS.public]).toContain(hostnameForPath(path));
    }
  });
});
