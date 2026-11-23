import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setApiForTests } from "@/lib/api/client";
import { bumpApiScope } from "@/lib/api/scope";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useRealtimeApiQuery } from "./use-realtime-api";

/*
 * A live list keeps its last rows while its filter changes, but never carries
 * them across a sign-in, organization or branch change (the API scope epoch).
 */

const pending = new Map<string, (value: string) => void>();
const read = (key: string) => new Promise<string>((resolve) => { pending.set(key, resolve); });

function List({ filter }: { filter: string }) {
  const query = useRealtimeApiQuery({
    queryKey: ["live-list", filter],
    query: () => read(filter),
    subscribe: async () => () => undefined,
  });
  return <p>{query.data ?? "loading"}</p>;
}

function setup() {
  setApiForTests(new MockGymOSApi());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><List filter="all" /></QueryClientProvider>);
  return (filter: string) => view.rerender(<QueryClientProvider client={client}><List filter={filter} /></QueryClientProvider>);
}

afterEach(() => { setApiForTests(null); pending.clear(); });

describe("useRealtimeApiQuery placeholder scope", () => {
  it("keeps the last rows while the filter changes within the same scope", async () => {
    const show = setup();
    await act(async () => pending.get("all")!("rows for all"));
    expect(await screen.findByText("rows for all")).toBeInTheDocument();
    show("overdue");
    expect(screen.getByText("rows for all")).toBeInTheDocument();
    await act(async () => pending.get("overdue")!("rows for overdue"));
    expect(await screen.findByText("rows for overdue")).toBeInTheDocument();
  });

  it("shows loading instead of the previous scope's rows after a scope change", async () => {
    const show = setup();
    await act(async () => pending.get("all")!("rows for all"));
    expect(await screen.findByText("rows for all")).toBeInTheDocument();
    act(() => bumpApiScope());
    show("branch-2");
    expect(screen.getByText("loading")).toBeInTheDocument();
  });
});
