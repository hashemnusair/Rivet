import { act, renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function click(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  return { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides } as unknown as MouseEvent<HTMLAnchorElement>;
}

// Each test gets a fresh module: the warm-up remembers when it last ran.
async function load() {
  vi.resetModules();
  return await import("./instant-navigation");
}

describe("instant workspace navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    router.prefetch.mockReset();
    vi.stubGlobal("requestIdleCallback", undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("fetches every navigation page whole once the workspace is idle, one at a time", async () => {
    const { useWarmNavigation } = await load();
    renderHook(() => useWarmNavigation(["/members", "/payments"], "/dashboard"));
    expect(router.prefetch).not.toHaveBeenCalled();
    // One idle period to start, then one page per idle period.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_300); });
    expect(router.prefetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(router.prefetch.mock.calls).toEqual([["/members", { kind: "full" }], ["/payments", { kind: "full" }]]);
  });

  it("fetches nothing when the browser asks to save data", async () => {
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    const { useWarmNavigation } = await load();
    renderHook(() => useWarmNavigation(["/members"], "/dashboard"));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it("fetches the page just left so going back is instant too", async () => {
    const { useWarmNavigation } = await load();
    const { rerender } = renderHook(({ path }) => useWarmNavigation(["/dashboard", "/members"], path), { initialProps: { path: "/dashboard" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    router.prefetch.mockReset();
    rerender({ path: "/members" });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(router.prefetch).toHaveBeenCalledWith("/dashboard", { kind: "full" });
  });

  it("lights the clicked item until its page arrives, and leaves new-tab clicks alone", async () => {
    const { usePendingNavigation } = await load();
    const { result, rerender } = renderHook(({ path }) => usePendingNavigation(path), { initialProps: { path: "/dashboard" } });
    act(() => result.current.onNavigate("/members", click({ metaKey: true })));
    expect(result.current.pendingHref).toBeUndefined();
    act(() => result.current.onNavigate("/members", click()));
    expect(result.current.pendingHref).toBe("/members");
    rerender({ path: "/members" });
    expect(result.current.pendingHref).toBeUndefined();
  });
});
