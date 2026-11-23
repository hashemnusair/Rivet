import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { bumpApiScope } from "@/lib/api/scope";
import { useApiQuery } from "./use-api";

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => { resolve = done; });
  return { promise, resolve };
}

const reads = new Map<string, ReturnType<typeof deferred>>();
const readOf = (key: string) => {
  if (!reads.has(key)) reads.set(key, deferred());
  return reads.get(key)!.promise;
};

function List({ branch, filter, keep }: { branch: string; filter: string; keep: boolean }) {
  const query = useApiQuery(["list", branch, filter], () => readOf(`${branch}:${filter}`), {
    retry: false,
    ...(keep ? { keepPreviousWithin: [branch] } : {}),
  });
  return <p>{query.data ?? "loading"}</p>;
}

function setup(keep: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><List branch="b1" filter="all" keep={keep} /></QueryClientProvider>);
  const show = (branch: string, filter: string) =>
    view.rerender(<QueryClientProvider client={client}><List branch={branch} filter={filter} keep={keep} /></QueryClientProvider>);
  return show;
}

describe("keepPreviousWithin", () => {
  it("keeps the last list on screen while a filter changes, then shows the new one", async () => {
    reads.clear();
    const show = setup(true);
    await act(async () => reads.get("b1:all")!.resolve("branch 1, all"));
    expect(await screen.findByText("branch 1, all")).toBeInTheDocument();
    show("b1", "outstanding");
    expect(screen.getByText("branch 1, all")).toBeInTheDocument();
    await act(async () => reads.get("b1:outstanding")!.resolve("branch 1, outstanding"));
    expect(await screen.findByText("branch 1, outstanding")).toBeInTheDocument();
  });

  it("never shows one branch's list under another", async () => {
    reads.clear();
    const show = setup(true);
    await act(async () => reads.get("b1:all")!.resolve("branch 1, all"));
    expect(await screen.findByText("branch 1, all")).toBeInTheDocument();
    show("b2", "all");
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("never carries a list across a sign-in, organization or branch scope change", async () => {
    reads.clear();
    const show = setup(true);
    await act(async () => reads.get("b1:all")!.resolve("branch 1, all"));
    expect(await screen.findByText("branch 1, all")).toBeInTheDocument();
    bumpApiScope();
    show("b1", "outstanding");
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("is off unless a screen asks for it", async () => {
    reads.clear();
    const show = setup(false);
    await act(async () => reads.get("b1:all")!.resolve("branch 1, all"));
    expect(await screen.findByText("branch 1, all")).toBeInTheDocument();
    show("b1", "outstanding");
    expect(screen.getByText("loading")).toBeInTheDocument();
  });
});
