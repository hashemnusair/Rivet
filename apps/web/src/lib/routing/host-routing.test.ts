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
      kind: "rewrite",
      pathname: "/login/member/create",
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
