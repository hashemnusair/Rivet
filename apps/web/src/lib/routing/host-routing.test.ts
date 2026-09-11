import { describe, expect, it } from "vitest";
import { decideHostRouting, normalizeHostname } from "./host-routing";

describe("normalizeHostname", () => {
  it("normalizes forwarded hosts, ports, and trailing dots", () => {
    expect(normalizeHostname(" APP.RIVETJO.COM:443, proxy.internal ")).toBe("app.rivetjo.com");
  });
});

describe("decideHostRouting", () => {
  it("opens the member discovery surface on the app hostname", () => {
    expect(decideHostRouting("app.rivetjo.com", "/")).toEqual({
      kind: "rewrite",
      pathname: "/customer/discover",
    });
  });

  it("uses universal sign-in and member signup on the app hostname", () => {
    expect(decideHostRouting("app.rivetjo.com", "/login")).toEqual({ kind: "next" });
    expect(decideHostRouting("app.rivetjo.com", "/signup")).toEqual({
      kind: "redirect",
      hostname: "app.rivetjo.com",
      pathname: "/login/member/create",
      status: 308,
    });
  });

  it("opens the gym workspace while retaining universal sign-in", () => {
    expect(decideHostRouting("dashboard.rivetjo.com", "/")).toEqual({
      kind: "rewrite",
      pathname: "/dashboard",
    });
    expect(decideHostRouting("dashboard.rivetjo.com", "/login")).toEqual({ kind: "next" });
  });

  it("opens the platform console while retaining universal sign-in", () => {
    expect(decideHostRouting("platform.rivetjo.com", "/")).toEqual({
      kind: "rewrite",
      pathname: "/platform",
    });
    expect(decideHostRouting("platform.rivetjo.com", "/login")).toEqual({ kind: "next" });
  });

  it("redirects the admin alias to the platform canonical hostname", () => {
    expect(decideHostRouting("admin.rivetjo.com", "/platform/gyms")).toEqual({
      kind: "redirect",
      hostname: "platform.rivetjo.com",
      status: 308,
    });
  });

  it("redirects the apex domain to the public canonical hostname", () => {
    expect(decideHostRouting("rivetjo.com", "/")).toEqual({
      kind: "redirect",
      hostname: "www.rivetjo.com",
      status: 308,
    });
  });

  it("leaves the marketing host and unrelated paths unchanged", () => {
    expect(decideHostRouting("www.rivetjo.com", "/")).toEqual({ kind: "next" });
    expect(decideHostRouting("dashboard.rivetjo.com", "/members")).toEqual({ kind: "next" });
  });
});

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalHref, hostnameForPath, isRivetHost, postSignInPath, publicSiteHref, RIVET_HOSTS, safeInternalRedirect } from "./host-routing";

describe("route ownership", () => {
  const cases = [
    ["/members/example", "gym"], ["/reception", "gym"], ["/pt", "gym"],
    ["/login/gym", "gym"], ["/login/accept-invitation", "gym"],
    ["/customer/my-gyms", "member"], ["/customer/pt", "member"],
    ["/login/member/create", "member"], ["/offers/offer-token", "member"],
    ["/platform/gyms", "platform"], ["/login/admin", "platform"],
    ["/signup", "public"], ["/terms", "public"], ["/privacy", "public"],
  ] as const;

  for (const [path, area] of cases) {
    it(`owns ${path} on ${area} from every production host`, () => {
      const owner = RIVET_HOSTS[area];
      for (const host of ["rivetjo.com", "admin.rivetjo.com", ...Object.values(RIVET_HOSTS)]) {
        if (path === "/signup" && host === RIVET_HOSTS.member) continue;
        expect(decideHostRouting(host, path)).toEqual(host === owner
          ? { kind: "next" }
          : { kind: "redirect", hostname: owner, status: 308 });
      }
    });
  }

  it("covers every gym route tree", () => {
    const root = resolve(process.cwd(), "src/app/(app)");
    for (const entry of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      expect(hostnameForPath(`/${entry.name}`), entry.name).toBe(RIVET_HOSTS.gym);
    }
  });

  it("leaves local, preview and unrecognized hosts isolated from production", () => {
    for (const host of ["localhost:3100", "127.0.0.1", "rivet-preview.vercel.app", "evilrivetjo.com", "www.rivetjo.com.evil.test"]) {
      expect(isRivetHost(host)).toBe(false);
      expect(decideHostRouting(host, "/platform")).toEqual({ kind: "next" });
      expect(canonicalHref("/members?filter=due", host)).toBe("/members?filter=due");
    }
  });

  it("does not redirect APIs, Clerk handshakes, assets, generic login or prefix lookalikes", () => {
    for (const path of ["/api/health", "/__clerk/v1/client", "/_next/static/foo.js", "/login", "/platformish", "/memberships-unknown", "/offline"]) {
      expect(decideHostRouting(RIVET_HOSTS.member, path)).toEqual({ kind: "next" });
    }
  });

  it("preserves deep-link parameters and fragments across hosts and aliases", () => {
    expect(canonicalHref("/members/a?tab=payments#balance", RIVET_HOSTS.public)).toBe("https://dashboard.rivetjo.com/members/a?tab=payments#balance");
    expect(canonicalHref("/signup?returnTo=%2Fcustomer%2Fmy-gyms", RIVET_HOSTS.member)).toBe("https://app.rivetjo.com/login/member/create?returnTo=%2Fcustomer%2Fmy-gyms");
    expect(publicSiteHref(RIVET_HOSTS.gym)).toBe("https://www.rivetjo.com/?site");
    expect(publicSiteHref("localhost")).toBe("/");
  });

  it("rejects browser-normalized external continuations and mismatched areas", () => {
    for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", " /members"]) {
      expect(safeInternalRedirect(next, "/login")).toBe("/login");
    }
    for (const next of ["/platform", "/login/gym", "/customer/signup", "/customer/login", "//evil.test", "/customer/../platform"]) {
      expect(postSignInPath("/customer/my-gyms", `?next=${encodeURIComponent(next)}`)).toBe("/customer/my-gyms");
    }
    expect(postSignInPath("/reception", "?next=%2Fmembers%2Fa%3Ftab%3Dpayments%23balance")).toBe("/members/a?tab=payments#balance");
  });
});
