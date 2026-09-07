import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import { useApiMutation, useApiQuery } from "./use-api";

const toastSpies = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastSpies }));

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

describe("useApiMutation follow-up work", () => {
  function renderMutation(onSuccess: () => Promise<void>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    function Harness() {
      const mutation = useApiMutation(async () => "saved", { onSuccess });
      return (
        <div>
          <span data-testid="pending">{String(mutation.isPending)}</span>
          <span data-testid="success">{String(mutation.isSuccess)}</span>
          <span data-testid="mutation-error">{String(mutation.isError)}</span>
          <button type="button" onClick={() => mutation.mutate()}>Save</button>
        </div>
      );
    }
    return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  }

  it("stays pending until the caller's asynchronous success work has finished", async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const followUp = new Promise<void>((resolve) => { release = resolve; });
    let followUpStarted = false;
    renderMutation(async () => { followUpStarted = true; await followUp; });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(followUpStarted).toBe(true));
    // The write itself resolved immediately; the refresh has not.
    expect(screen.getByTestId("pending")).toHaveTextContent("true");
    expect(screen.getByTestId("success")).toHaveTextContent("false");

    release();
    await waitFor(() => expect(screen.getByTestId("success")).toHaveTextContent("true"));
    expect(screen.getByTestId("pending")).toHaveTextContent("false");
  });

  it("does not report a committed write as failed when only its follow-up refresh throws", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    toastSpies.error.mockClear();
    toastSpies.warning.mockClear();
    renderMutation(async () => { throw new Error("refresh failed"); });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("success")).toHaveTextContent("true"));
    expect(screen.getByTestId("mutation-error")).toHaveTextContent("false");
    expect(toastSpies.error).not.toHaveBeenCalled();
    expect(toastSpies.warning).toHaveBeenCalledWith(expect.stringMatching(/Saved, but this screen could not refresh/));
    consoleError.mockRestore();
  });
});

describe("useApiQuery access revocation", () => {
  function RevocationHarness({ deny }: { deny: { current: boolean } }) {
    const query = useApiQuery(
      ["revocation"],
      async () => {
        if (deny.current) throw ApiError.of(ERR.FORBIDDEN, "Your role is missing the members.read permission.");
        return "member list";
      },
      { retry: false },
    );
    return (
      <div>
        <span data-testid="data">{query.data ?? "no data"}</span>
        <span data-testid="error">{String(query.isError)}</span>
        <span data-testid="background-error">{String(query.isBackgroundError)}</span>
        <span data-testid="message">{query.error?.message ?? ""}</span>
      </div>
    );
  }

  it("withdraws a loaded snapshot once the server refuses access, instead of a refresh warning", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const deny = { current: false };
    render(<QueryClientProvider client={client}><RevocationHarness deny={deny} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByTestId("data")).toHaveTextContent("member list"));

    deny.current = true;
    await client.invalidateQueries({ queryKey: ["revocation"] });
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("true"));
    expect(screen.getByTestId("data")).toHaveTextContent("no data");
    expect(screen.getByTestId("background-error")).toHaveTextContent("false");
    expect(screen.getByTestId("message")).toHaveTextContent("members.read");
  });
});
