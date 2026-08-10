import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiForTests } from "@/lib/api/client";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useRealtimeApiQuery } from "./use-realtime-api";

type Snapshot = { id: string; value: string };

afterEach(() => {
  setApiForTests(null);
  vi.useRealTimers();
});

function renderRealtimeHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const listeners = new Map<string, { emit: (value: Snapshot) => void; fail: (error: unknown) => void }>();
  const disposers: string[] = [];

  function Harness() {
    const [recordId, setRecordId] = useState("first");
    const query = useRealtimeApiQuery({
      queryKey: ["record", recordId],
      query: async () => ({ id: recordId, value: `initial-${recordId}` }),
      subscribe: async (_api, onValue, onError) => {
        listeners.set(recordId, { emit: onValue, fail: onError });
        return () => {
          listeners.delete(recordId);
          disposers.push(recordId);
        };
      },
      fallbackIntervalMs: 60_000,
    });
    return (
      <div>
        <span data-testid="snapshot">{query.data?.value ?? "empty"}</span>
        <span data-testid="stream-state">{query.streamState}</span>
        <span data-testid="background-error">{String(query.isBackgroundError)}</span>
        <button type="button" onClick={() => setRecordId("second")}>Next record</button>
      </div>
    );
  }

  setApiForTests(new MockGymOSApi());
  const rendered = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return { ...rendered, listeners, disposers };
}

describe("useRealtimeApiQuery", () => {
  it("writes live values into the normal query cache and preserves them on stream failure", async () => {
    const { listeners } = renderRealtimeHarness();
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("initial-first"));
    await waitFor(() => expect(listeners.has("first")).toBe(true));

    act(() => listeners.get("first")?.emit({ id: "first", value: "live-first" }));
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("live-first"));
    expect(screen.getByTestId("stream-state")).toHaveTextContent("live");

    act(() => listeners.get("first")?.fail(new Error("temporary stream outage")));
    await waitFor(() => expect(screen.getByTestId("stream-state")).toHaveTextContent("fallback"));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("live-first");
    expect(screen.getByTestId("background-error")).toHaveTextContent("false");
  });

  it("disposes the previous subscription when the route or record key changes", async () => {
    const user = userEvent.setup();
    const { listeners, disposers, unmount } = renderRealtimeHarness();
    await waitFor(() => expect(listeners.has("first")).toBe(true));

    await user.click(screen.getByRole("button", { name: "Next record" }));
    await waitFor(() => expect(listeners.has("second")).toBe(true));
    expect(disposers).toContain("first");
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("initial-second"));

    unmount();
    expect(disposers).toContain("second");
  });

  it("keeps the last snapshot offline and reconnects after the browser returns online", async () => {
    const { listeners, disposers } = renderRealtimeHarness();
    await waitFor(() => expect(listeners.has("first")).toBe(true));
    act(() => listeners.get("first")?.emit({ id: "first", value: "before-offline" }));
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("before-offline"));

    act(() => window.dispatchEvent(new Event("offline")));
    await waitFor(() => expect(screen.getByTestId("stream-state")).toHaveTextContent("fallback"));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("before-offline");
    expect(disposers).toContain("first");

    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(listeners.has("first")).toBe(true));
    act(() => listeners.get("first")?.emit({ id: "first", value: "after-reconnect" }));
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("after-reconnect"));
    expect(screen.getByTestId("stream-state")).toHaveTextContent("live");
  });
});
