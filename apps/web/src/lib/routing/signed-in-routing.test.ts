import { describe, expect, it } from "vitest";
import { isSameSiteReferer, signedInRedirectTarget } from "./signed-in-routing";

const at = (pathname: string, search = "", referer: string | null = null, host = "www.rivetjo.com") =>
  signedInRedirectTarget({ pathname, searchParams: new URLSearchParams(search), referer, host });

describe("signed-in routing", () => {
  it("sends a direct arrival on the landing to the resolver", () => {
    expect(at("/")).toBe("/login");
    expect(at("/", "", "https://www.google.com/")).toBe("/login");
  });

  it("keeps the landing open when it was reached from inside the site or asked for explicitly", () => {
    expect(at("/", "", "https://www.rivetjo.com/dashboard")).toBeNull();
    expect(at("/", "", "http://localhost:3210/platform", "localhost:3210")).toBeNull();
    expect(at("/", "site")).toBeNull();
    expect(at("/", "site=1", "https://www.google.com/")).toBeNull();
  });

  it("sends the application and every sign-in door to the resolver", () => {
    for (const path of ["/signup", "/login/gym", "/login/member", "/login/admin", "/login/member/create"]) {
      expect(at(path, "", "https://www.rivetjo.com/")).toBe("/login");
    }
  });

  it("leaves the resolver, the app and the documents alone", () => {
    for (const path of ["/login", "/login/accept-invitation", "/dashboard", "/customer/my-gyms", "/terms", "/privacy", "/customer/discover"]) {
      expect(at(path)).toBeNull();
    }
  });

  it("compares referers by host only", () => {
    expect(isSameSiteReferer("https://www.rivetjo.com/x", "www.rivetjo.com:443")).toBe(true);
    expect(isSameSiteReferer("http://localhost:3210/", "localhost")).toBe(true);
    expect(isSameSiteReferer("not a url", "www.rivetjo.com")).toBe(false);
    expect(isSameSiteReferer(null, "www.rivetjo.com")).toBe(false);
  });
});
