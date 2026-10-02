import { act, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { OccupancyReading } from "./occupancy-widget";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("withdraws stale data even if there is no network response", () => {
  vi.useFakeTimers();
  const now = Date.now();
  render(<OccupancyReading data={{ current: 24, status: "moderate", availability: "available", generatedAt: now, validUntil: now + 5000, timezone: "Asia/Amman" }} />);
  expect(screen.getByText("~24 people")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.queryByText("~24 people")).not.toBeInTheDocument();
  expect(screen.getByText("Live estimate unavailable")).toBeInTheDocument();
});
it("does not render a failed feed as an empty gym", () => {
  render(<OccupancyReading failed />);
  expect(screen.queryByText("~0 people")).not.toBeInTheDocument();
  expect(screen.getByText("Live estimate unavailable")).toBeInTheDocument();
});

it("fetches only the aggregate URL without credentials and withdraws a revoked publication", async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, current: 12, status: "quiet", availability: "available", generatedAt: now, validUntil: now + 45_000, timezone: "Asia/Amman" }))).mockResolvedValue(new Response("not published", { status: 404 }));
  const { PublicOccupancyWidget } = await import("./occupancy-widget");
  render(<PublicOccupancyWidget endpoint="https://example.convex.site/api/v1/public/occupancy?organizationId=gym&branchId=a" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText("~12 people")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("branchId=a"), expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.queryByText("~12 people")).not.toBeInTheDocument();
  expect(screen.getByText("Live estimate unavailable")).toBeInTheDocument();
  fetcher.mockRestore();
});
