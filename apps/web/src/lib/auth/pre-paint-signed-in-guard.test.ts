import { describe, expect, it } from "vitest";
import { clerkFrontendApiOrigin, prePaintSignedInGuardScript } from "./pre-paint-signed-in-guard";

describe("pre-paint signed-in guard", () => {
  it("reads the Frontend API origin out of a publishable key", () => {
    const key = `pk_live_${Buffer.from("clerk.rivetjo.com$").toString("base64")}`;
    expect(clerkFrontendApiOrigin(key)).toBe("https://clerk.rivetjo.com");
    expect(clerkFrontendApiOrigin(`pk_test_${Buffer.from("welcomed-oriole-41.clerk.accounts.dev$").toString("base64")}`)).toBe("https://welcomed-oriole-41.clerk.accounts.dev");
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(clerkFrontendApiOrigin("nonsense")).toBeNull();
    expect(clerkFrontendApiOrigin(`pk_live_${Buffer.from("javascript:alert(1)$").toString("base64")}`)).toBeNull();
  });

  it("asks the Frontend API client resource on the landing only and never on an app host", () => {
    const script = prePaintSignedInGuardScript({ frontendApi: "https://clerk.rivetjo.com/", appHosts: ["dashboard.rivetjo.com", "app.rivetjo.com", "platform.rivetjo.com"] });
    expect(script).toContain('fetch("https://clerk.rivetjo.com/v1/client",{credentials:"include"})');
    expect(script).toContain('location.pathname!=="/"||["dashboard.rivetjo.com","app.rivetjo.com","platform.rivetjo.com"].indexOf(location.hostname)!==-1');
    expect(script).toContain('location.replace("/login"+location.search)');
    expect(script).toContain('x.status==="active"');
    expect(script).toContain("setTimeout(show,2000)");
    expect(script).toMatch(/__client_uat\(\?:_\[A-Za-z0-9_-\]\{1,8\}\)\?=/);
  });
});
