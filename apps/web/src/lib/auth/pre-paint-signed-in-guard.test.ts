import { describe, expect, it, vi } from "vitest";
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
    const script = prePaintSignedInGuardScript({ frontendApi: "https://clerk.rivetjo.com/", appHosts: ["dashboard.rivetjo.com", "app.rivetjo.com", "platform.rivetjo.com"], accountCookie: "rivet_ui_locale_v1" });
    expect(script).toContain('fetch("https://clerk.rivetjo.com/v1/client",{credentials:"include"})');
    expect(script).toContain('location.pathname!=="/"||["dashboard.rivetjo.com","app.rivetjo.com","platform.rivetjo.com"].indexOf(location.hostname)!==-1');
    expect(script).toContain('location.replace("/login"+location.search)');
    // A landing asked for on purpose is shown before anything is hidden.
    expect(script.indexOf('get("view")==="landing")return;')).toBeGreaterThan(-1);
    expect(script.indexOf('get("view")==="landing")return;')).toBeLessThan(script.indexOf('d.style.visibility="hidden"'));
    expect(script).toContain('x.status==="active"');
    expect(script).toContain("setTimeout(show,2000)");
    expect(script).toMatch(/__client_uat\(\?:_\[A-Za-z0-9_-\]\{1,8\}\)\?=/);
  });

  describe("on the landing", () => {
    const script = prePaintSignedInGuardScript({ frontendApi: "https://clerk.rivetjo.com", appHosts: ["dashboard.rivetjo.com"], accountCookie: "rivet_ui_locale_v1" });
    const accountCookie = `rivet_ui_locale_v1=${encodeURIComponent(JSON.stringify({ version: 1, locale: "en", owner: "user_123" }))}`;

    function run(cookie: string, sessions: Array<{ status: string }> = []) {
      const doc = { cookie, documentElement: { style: { visibility: "" } } };
      const location = { pathname: "/", hostname: "www.rivetjo.com", search: "", replace: vi.fn() };
      let answer: () => void = () => undefined;
      const fetch = vi.fn(() => new Promise((resolve) => { answer = () => resolve({ json: () => ({ response: { sessions } }) }); }));
      new Function("location", "document", "fetch", "addEventListener", "setTimeout", "clearTimeout", script)(location, doc, fetch, () => undefined, () => 0, () => undefined);
      return { doc, location, fetch, answer: async () => { answer(); await new Promise((resolve) => setTimeout(resolve, 0)); } };
    }

    it("paints at once for a browser that has never had a signed-in account, and still checks behind it", async () => {
      const visit = run("rivet_ui_locale_v1=" + encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null })), [{ status: "active" }]);
      expect(visit.doc.documentElement.style.visibility).toBe("");
      expect(visit.fetch).toHaveBeenCalledOnce();
      await visit.answer();
      expect(visit.location.replace).toHaveBeenCalledWith("/login");
    });

    it("waits for Clerk when this browser has had a signed-in account", async () => {
      const visit = run(accountCookie);
      expect(visit.doc.documentElement.style.visibility).toBe("hidden");
      await visit.answer();
      expect(visit.doc.documentElement.style.visibility).toBe("");
      expect(visit.location.replace).not.toHaveBeenCalled();
    });

    it("sends a visitor with Clerk's signed-in marker on without asking", () => {
      const visit = run("__client_uat=1730000000");
      expect(visit.doc.documentElement.style.visibility).toBe("hidden");
      expect(visit.location.replace).toHaveBeenCalledWith("/login");
      expect(visit.fetch).not.toHaveBeenCalled();
    });
  });
});
