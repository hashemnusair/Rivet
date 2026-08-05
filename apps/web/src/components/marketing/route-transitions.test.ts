import { describe, expect, it } from "vitest";
import { shouldTransition } from "./route-transitions";

describe("route transition journeys", () => {
  it("holds between the landing page and auth pages in either direction", () => {
    expect(shouldTransition("/", "/login")).toBe(true);
    expect(shouldTransition("/login/gym", "/")).toBe(true);
    expect(shouldTransition("/", "/customer/signup")).toBe(true);
    expect(shouldTransition("/login/member/create", "/")).toBe(true);
  });

  it("holds between the landing page and gym discovery in either direction", () => {
    expect(shouldTransition("/", "/customer/discover")).toBe(true);
    expect(shouldTransition("/customer/gyms/forge-fitness", "/")).toBe(true);
  });

  it("holds between auth and authenticated home surfaces in either direction", () => {
    expect(shouldTransition("/login/gym", "/dashboard")).toBe(true);
    expect(shouldTransition("/dashboard", "/login")).toBe(true);
    expect(shouldTransition("/login/member", "/customer/my-gyms")).toBe(true);
  });

  it("does not interrupt ordinary product work", () => {
    expect(shouldTransition("/", "/#product")).toBe(false);
    expect(shouldTransition("/members", "/members/123")).toBe(false);
    expect(shouldTransition("/customer/discover", "/customer/gyms/forge-fitness")).toBe(false);
  });
});
