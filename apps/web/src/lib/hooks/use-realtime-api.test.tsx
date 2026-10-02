import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiForTests } from "@/lib/api/client";
import { ApiError, ERR } from "@/lib/api/errors";
import { bumpApiScope } from "@/lib/api/scope";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useRealtimeApiQuery } from "./use-realtime-api";

type Snapshot = { id: string; value: string };

afterEach(() => {
  setApiForTests(null);
  vi.unstubAllEnvs();
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
  it("keeps the initial query available while a Convex watch is still connecting", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "convex");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    let queryCalls = 0;

    function Harness() {
      const query = useRealtimeApiQuery({
        queryKey: ["record", "convex-initial"],
        query: async () => {
          queryCalls += 1;
          return { id: "convex-initial", value: "initial-from-query" };
        },
        // Simulate a native watch that has connected but has not exposed its
        // first local snapshot yet.
        subscribe: async () => () => undefined,
      });
      return <span data-testid="convex-initial-snapshot">{query.data?.value ?? "empty"}</span>;
    }

    setApiForTests(new MockGymOSApi());
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);

    await waitFor(() => expect(screen.getByTestId("convex-initial-snapshot")).toHaveTextContent("initial-from-query"));
    expect(queryCalls).toBe(1);
  });

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

  it("re-binds the watch when the API scope changes even though the key does not name the branch", async () => {
    const { listeners, disposers } = renderRealtimeHarness();
    await waitFor(() => expect(listeners.has("first")).toBe(true));
    act(() => listeners.get("first")?.emit({ id: "first", value: "branch-a" }));
    await waitFor(() => expect(screen.getByTestId("stream-state")).toHaveTextContent("live"));

    // A branch or organization switch: the old watch is disposed and a new
    // one is opened under the current scope; the cached snapshot stays on
    // screen meanwhile rather than flashing empty.
    act(() => bumpApiScope());
    await waitFor(() => expect(disposers.filter((id) => id === "first")).toHaveLength(1));
    await waitFor(() => expect(listeners.has("first")).toBe(true));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("branch-a");
    act(() => listeners.get("first")?.emit({ id: "first", value: "branch-b" }));
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("branch-b"));
    expect(screen.getByTestId("stream-state")).toHaveTextContent("live");
  });

  it("fetches the new record when the key changes while the previous watch was live in Convex mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_DATA_MODE", "convex");
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const queried: string[] = [];
    const listeners = new Map<string, (value: Snapshot) => void>();

    function Harness() {
      const [recordId, setRecordId] = useState("first");
      const query = useRealtimeApiQuery({
        queryKey: ["record", recordId],
        query: async () => { queried.push(recordId); return { id: recordId, value: `initial-${recordId}` }; },
        subscribe: async (_api, onValue) => { listeners.set(recordId, onValue); return () => { listeners.delete(recordId); }; },
      });
      return (
        <div>
          <span data-testid="convex-snapshot">{query.data?.value ?? "empty"}</span>
          <span data-testid="convex-stream-state">{query.streamState}</span>
          <button type="button" onClick={() => setRecordId("second")}>Next record</button>
        </div>
      );
    }

    setApiForTests(new MockGymOSApi());
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    await waitFor(() => expect(listeners.has("first")).toBe(true));
    act(() => listeners.get("first")?.({ id: "first", value: "live-first" }));
    await waitFor(() => expect(screen.getByTestId("convex-stream-state")).toHaveTextContent("live"));

    // While live, the ordinary query is off. Changing the record must not
    // leave the hook claiming "live" for a key whose stream has not started:
    // the ordinary query fetches the new record under the new key.
    await user.click(screen.getByRole("button", { name: "Next record" }));
    await waitFor(() => expect(queried).toContain("second"));
    await waitFor(() => expect(screen.getByTestId("convex-snapshot")).toHaveTextContent("initial-second"));
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

describe("useRealtimeApiQuery access revocation", () => {
  it("withdraws the live snapshot when the fallback fetch is refused after the watch fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const deny = { current: false };
    let fail: ((error: unknown) => void) | undefined;
    function Harness() {
      const query = useRealtimeApiQuery({
        queryKey: ["revoked-record"],
        query: async () => {
          if (deny.current) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
          return { id: "record", value: "loaded" } as Snapshot;
        },
        subscribe: async (_api, _onValue, onError) => { fail = onError; return () => undefined; },
        fallbackIntervalMs: 60_000,
      });
      return (
        <div>
          <span data-testid="snapshot">{query.data?.value ?? "empty"}</span>
          <span data-testid="error">{String(query.isError)}</span>
          <span data-testid="background-error">{String(query.isBackgroundError)}</span>
        </div>
      );
    }
    setApiForTests(new MockGymOSApi());
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("snapshot")).toHaveTextContent("loaded"));

    deny.current = true;
    await act(async () => { fail?.(new Error("watch closed")); });
    await client.invalidateQueries({ queryKey: ["revoked-record"] });
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("true"));
    expect(screen.getByTestId("snapshot")).toHaveTextContent("empty");
    expect(screen.getByTestId("background-error")).toHaveTextContent("false");
  });
});
