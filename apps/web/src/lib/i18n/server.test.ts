import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ cookies: new Map<string, string>(), userId: null as string | null, getToken: vi.fn(async () => "token"), fetchQuery: vi.fn(async () => ({ uiLocale: "ar" })) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined) }) }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: state.userId, getToken: state.getToken }) }));
vi.mock("convex/nextjs", () => ({ fetchQuery: state.fetchQuery }));
vi.mock("@/lib/auth/demo-auth", () => ({ DEMO_AUTH_BYPASS: false }));
vi.mock("./config", async (importOriginal) => ({ ...(await importOriginal<typeof import("./config")>()), ARABIC_ENABLED: true }));

const preference = (owner: string | null, locale: "en" | "ar") => encodeURIComponent(JSON.stringify({ version: 1, locale, owner }));

describe("request language", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "convex");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    state.cookies.clear();
    state.getToken.mockClear();
    state.fetchQuery.mockClear();
  });

  it("paints a signed-in page from the shared cookie that already names the account", async () => {
    const { getRequestUiPreference } = await import("./server");
    state.userId = "user_1";
    state.cookies.set("rivet_ui_locale_v1", preference("user_1", "ar"));
    await expect(getRequestUiPreference()).resolves.toMatchObject({ locale: "ar", owner: "user_1" });
    expect(state.getToken).not.toHaveBeenCalled();
    expect(state.fetchQuery).not.toHaveBeenCalled();
  });

  it("asks for the account's saved language when the cookie belongs to nobody or someone else", async () => {
    const { getRequestUiPreference } = await import("./server");
    state.userId = "user_1";
    state.cookies.set("rivet_ui_locale_v1", preference("user_2", "en"));
    await expect(getRequestUiPreference()).resolves.toMatchObject({ locale: "ar", owner: "user_1" });
    expect(state.fetchQuery).toHaveBeenCalledOnce();
  });

  it("never asks for a signed-out visitor", async () => {
    const { getRequestUiPreference } = await import("./server");
    state.userId = null;
    await expect(getRequestUiPreference()).resolves.toMatchObject({ locale: "en", owner: null });
    expect(state.getToken).not.toHaveBeenCalled();
  });
});
