// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth/demo-auth", () => ({ DEMO_AUTH_BYPASS: false }));
vi.mock("@/lib/i18n/config", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/i18n/config")>()), ARABIC_ENABLED: true }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: () => Promise<{ userId: string | null }>, request: NextRequest) => Promise<NextResponse>) => async (request: NextRequest) => handler(async () => ({ userId: state.userId }), request),
}));
import proxy from "./proxy";

const arabicDevice = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: null }));
const arabicOfEarlierAccount = encodeURIComponent(JSON.stringify({ version: 1, locale: "ar", owner: "user_1" }));

async function request(path: string, host = "www.rivetjo.com", cookie?: string) {
  const incoming = new NextRequest(`https://${host}${path}`, cookie ? { headers: { cookie } } : undefined);
  return proxy(incoming, {} as Parameters<typeof proxy>[1]);
}

describe("landing addresses", () => {
  beforeEach(() => { state.userId = null; });

  it("answers / with the English page built at /en, keeping the query", async () => {
    const response = await request("/?utm_source=x");
    expect(response?.headers.get("x-middleware-rewrite")).toBe("https://www.rivetjo.com/en?utm_source=x");
  });

  it("sends a reader whose own language is Arabic to /ar", async () => {
    const response = await request("/", "www.rivetjo.com", `rivet_ui_locale_v1=${arabicDevice}`);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("https://www.rivetjo.com/ar");
    expect((await request("/", "www.rivetjo.com", "rivet_locale=ar"))?.headers.get("location")).toBe("https://www.rivetjo.com/ar");
  });

  it("keeps English for someone signed out whose Arabic belonged to an earlier account", async () => {
    const response = await request("/", "www.rivetjo.com", `rivet_ui_locale_v1=${arabicOfEarlierAccount}`);
    expect(response?.headers.get("location")).toBeNull();
    expect(response?.headers.get("x-middleware-rewrite")).toBe("https://www.rivetjo.com/en");
  });

  it("serves /ar as it is and points the English build path back to /", async () => {
    const arabic = await request("/ar");
    expect(arabic?.headers.get("location")).toBeNull();
    expect(arabic?.headers.get("x-middleware-rewrite")).toBeNull();
    const english = await request("/en?x=1");
    expect(english?.status).toBe(308);
    expect(english?.headers.get("location")).toBe("https://www.rivetjo.com/?x=1");
  });

  it("sends a signed-in visitor from either landing to the resolver", async () => {
    state.userId = "user_1";
    expect((await request("/"))?.headers.get("location")).toBe("https://www.rivetjo.com/login");
    expect((await request("/ar"))?.headers.get("location")).toBe("https://www.rivetjo.com/login");
  });

  it("moves the landing's addresses off the product hosts", async () => {
    const response = await request("/ar", "dashboard.rivetjo.com");
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://www.rivetjo.com/ar");
  });
});
