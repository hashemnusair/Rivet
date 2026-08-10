import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useApiQuery } from "./use-api";

function Harness() {
  const queryClient = useQueryClient();
  const [fail, setFail] = useState(false);
  const query = useApiQuery(
    ["refresh-recovery"],
    async () => {
      if (fail) throw new Error("temporary network failure");
      return "loaded snapshot";
    },
    { retry: false },
  );

  useEffect(() => {
    if (fail) void queryClient.invalidateQueries({ queryKey: ["refresh-recovery"] });
  }, [fail, queryClient]);

  return (
    <div>
      <span data-testid="data">{query.data ?? "no data"}</span>
      <span data-testid="error">{String(query.isError)}</span>
      <span data-testid="background-error">{String(query.isBackgroundError)}</span>
      <button type="button" onClick={() => setFail(true)}>
        Refresh
      </button>
    </div>
  );
}

function renderHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
}

describe("useApiQuery refresh recovery", () => {
  it("keeps the last snapshot when a background refetch fails", async () => {
    const user = userEvent.setup();
    renderHarness();

    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("loaded snapshot"));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByTestId("background-error")).toHaveTextContent("true"));
    expect(screen.getByTestId("data")).toHaveTextContent("loaded snapshot");
    expect(screen.getByTestId("error")).toHaveTextContent("false");
  });

  it("does not hide the initial error behind an empty snapshot", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const failingApi = vi.fn(async () => { throw new Error("initial outage"); });

    function InitialFailure() {
      const query = useApiQuery(["initial-failure"], failingApi, { retry: false });
      return <><span data-testid="initial-error">{String(query.isError)}</span><span data-testid="initial-data">{query.data ?? "none"}</span></>;
    }

    render(<QueryClientProvider client={client}><InitialFailure /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("initial-error")).toHaveTextContent("true"));
    expect(screen.getByTestId("initial-data")).toHaveTextContent("none");
  });
});
