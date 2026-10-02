import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHostRouter } from "./use-host-router";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("host-aware navigation", () => {
  it("loads a new document for another role's host instead of keeping origin-scoped providers", () => {
    const location = { hostname: "www.rivetjo.com", replace: vi.fn(), assign: vi.fn() };
    vi.stubGlobal("window", new Proxy(window, { get: (target, key) => key === "location" ? location : Reflect.get(target, key) }));
    const { result } = renderHook(useHostRouter);
    result.current.replace("/platform");
    result.current.push("/customer/my-gyms?tab=active#membership");
    expect(location.replace).toHaveBeenCalledWith("https://platform.rivetjo.com/platform");
    expect(location.assign).toHaveBeenCalledWith("https://app.rivetjo.com/customer/my-gyms?tab=active#membership");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("uses the Next router for navigation within the workspace", () => {
    const location = { hostname: "dashboard.rivetjo.com", replace: vi.fn(), assign: vi.fn() };
    vi.stubGlobal("window", new Proxy(window, { get: (target, key) => key === "location" ? location : Reflect.get(target, key) }));
    const { result } = renderHook(useHostRouter);
    result.current.replace("/members");
    expect(router.replace).toHaveBeenCalledWith("/members");
    expect(location.replace).not.toHaveBeenCalled();
  });
});
