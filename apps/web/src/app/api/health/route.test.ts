// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));

const { CONVEX_HEALTH_TIMEOUT_MS, GET } = await import("./route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    fetchQuery.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("answers ok when Convex answers, never cached and with no data", async () => {
    fetchQuery.mockResolvedValue({ status: "ok", serverTime: 1 });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", web: "ok", convex: "ok", checkedAt: expect.any(String) });
  });

  it("answers 503 when Convex fails or does not answer in time, so a monitor alerts", async () => {
    fetchQuery.mockRejectedValue(new Error("down"));
    expect((await GET()).status).toBe(503);

    vi.useFakeTimers();
    fetchQuery.mockReturnValue(new Promise(() => undefined));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(CONVEX_HEALTH_TIMEOUT_MS + 1);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "degraded", convex: "unreachable" });
  });

  it("says Convex is not configured on a build without it (the preview)", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    const response = await GET();
    expect(await response.json()).toMatchObject({ status: "ok", convex: "not_configured" });
    expect(fetchQuery).not.toHaveBeenCalled();
  });
});
