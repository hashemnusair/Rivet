import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { MouseEvent, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/keys";
import { MEMBER_TAB_HREFS, useMemberTabs } from "./member-tabs";

const router = vi.hoisted(() => ({ prefetch: vi.fn() }));
const api = vi.hoisted(() => ({ getCustomerFinancialSummary: vi.fn(async () => ({ outstanding: [] })), listCustomerTransactions: vi.fn(async () => ({ items: [], total: 0 })) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/client", () => ({ getApi: () => api }));

function click(overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  return { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...overrides } as unknown as MouseEvent<HTMLAnchorElement>;
}

function setup(pathname: string, signedIn = false) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(({ path }) => useMemberTabs(path, signedIn), { initialProps: { path: pathname }, wrapper }) };
}

describe("member dock tabs", () => {
  afterEach(() => { vi.restoreAllMocks(); router.prefetch.mockReset(); });

  it("lights the tapped section at once and lets the link navigate", () => {
    const { result } = setup("/customer/my-gyms");
    const event = click();
    act(() => result.current.press("/customer/finance", event));
    expect(result.current.activeHref).toBe("/customer/finance");
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("scrolls the open section to the top instead of reloading it", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { result } = setup("/customer/discover");
    const event = click();
    act(() => result.current.press("/customer/discover", event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("returns to a section where it was left", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    const { result, rerender } = setup("/customer/discover");
    act(() => result.current.press("/customer/finance", click()));
    rerender({ path: "/customer/finance" });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "instant" });
    act(() => result.current.press("/customer/discover", click()));
    rerender({ path: "/customer/discover" });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: "instant" });
  });

  it("leaves new-tab clicks to the browser", () => {
    const { result } = setup("/customer/my-gyms");
    act(() => result.current.press("/customer/finance", click({ metaKey: true })));
    expect(result.current.activeHref).toBe("/customer/my-gyms");
  });

  it("keeps the sections and Payments data ready for a signed-in member", async () => {
    const { client } = setup("/customer/my-gyms", true);
    await act(async () => { await Promise.resolve(); });
    expect(client.getQueryData(qk.customerFinance("summary"))).toEqual({ outstanding: [] });
    expect(client.getQueryData(qk.customerFinance({ page: 1, pageSize: 20, sort: "-occurredAt" }))).toEqual({ items: [], total: 0 });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(router.prefetch.mock.calls).toEqual(MEMBER_TAB_HREFS.map((href) => [href, { kind: "full" }]));
  });
});
