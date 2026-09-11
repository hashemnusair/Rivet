// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({ userId: null as string | null, calls: 0 }));
vi.mock("@/lib/auth/demo-auth", () => ({ DEMO_AUTH_BYPASS: false }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: () => Promise<{ userId: string | null }>, request: NextRequest) => Promise<NextResponse>) => async (request: NextRequest) => {
    state.calls += 1;
    return handler(async () => ({ userId: state.userId }), request);
  },
}));
import proxy from "./proxy";

async function request(path: string, host: string) {
  const incoming = new NextRequest(`https://${host}${path}`);
  return proxy(incoming, {} as Parameters<typeof proxy>[1]);
}

describe("production host proxy", () => {
  beforeEach(() => { state.userId = null; state.calls = 0; });

  it("redirects old deep links before starting Clerk and retains the query", async () => {
    const response = await request("/members/123?tab=payments", "www.rivetjo.com");
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://dashboard.rivetjo.com/members/123?tab=payments");
    expect(state.calls).toBe(0);
  });

  it("initializes Clerk on root rewrites", async () => {
    for (const [host, path] of [["dashboard.rivetjo.com", "/dashboard"], ["app.rivetjo.com", "/customer/discover"], ["platform.rivetjo.com", "/platform"]]) {
      const response = await request("/", host!);
      expect(response?.headers.get("x-middleware-rewrite")).toBe(`https://${host}${path}`);
    }
    expect(state.calls).toBe(3);
  });

  it("retains the continuation when a signed-in door hands off to the resolver", async () => {
    state.userId = "test-identity";
    const response = await request("/login/gym?next=%2Fmembers%2F123", "dashboard.rivetjo.com");
    expect(response?.headers.get("location")).toBe("https://dashboard.rivetjo.com/login?next=%2Fmembers%2F123");
  });

  it("sends a signed-in visitor from the landing to the resolver", async () => {
    state.userId = "test-identity";
    const response = await request("/", "www.rivetjo.com");
    expect(response?.headers.get("location")).toBe("https://www.rivetjo.com/login");
  });

  it("leaves the landing to signed-out visitors", async () => {
    const response = await request("/", "www.rivetjo.com");
    expect(response?.headers.get("location")).toBeNull();
  });
});
