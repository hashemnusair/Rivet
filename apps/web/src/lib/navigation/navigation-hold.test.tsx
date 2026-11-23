import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { Suspense, startTransition, useLayoutEffect, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useApiQuery } from "@/lib/hooks/use-api";
import { NAVIGATION_HOLD_CAP_MS, NavigationHoldGate, resetNavigationHoldForTests } from "./navigation-hold";

/*
 * A small App Router stand-in: the pathname context and the keyed page change
 * together inside a transition, as in next/dist/client/components/app-router.js,
 * and the gate renders after the route tree, as in app/layout.tsx.
 */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Every committed loading placeholder, so a test can prove none was ever shown. */
let committedPlaceholders: string[] = [];
function Placeholder({ name }: { name: string }) {
  useLayoutEffect(() => { committedPlaceholders.push(name); }, [name]);
  return <p>{name}</p>;
}

let reads: Record<string, ReturnType<typeof deferred<string>>> = {};
function readOf(key: string) {
  reads[key] ??= deferred<string>();
  return reads[key]!.promise;
}

function Screen({ name, staleTime }: { name: string; staleTime?: number }) {
  const query = useApiQuery([name], () => readOf(name), { retry: false, ...(staleTime === undefined ? {} : { staleTime }) });
  return query.data ? <p>{`${name} ready: ${query.data}`}</p> : <Placeholder name={`${name} loading`} />;
}

/** A screen whose list only mounts once its access check has data (WorkspaceModuleBoundary). */
function GatedScreen() {
  const access = useApiQuery(["access"], () => readOf("access"), { retry: false });
  if (!access.data) return <Placeholder name="access loading" />;
  return <Screen name="list" />;
}

let navigate: (path: string) => void = () => undefined;
let openUrgently: () => void = () => undefined;

function Router({ pages, client }: { pages: Record<string, ReactNode>; client: QueryClient }) {
  const [path, setPath] = useState("/a");
  const [dialog, setDialog] = useState(false);
  useLayoutEffect(() => {
    navigate = (next) => startTransition(() => setPath(next));
    openUrgently = () => setDialog(true);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <PathnameContext.Provider value={path}>
        <div key={path}>{pages[path]}</div>
        {dialog ? <Screen name="dialog" /> : null}
        <NavigationHoldGate />
      </PathnameContext.Provider>
    </QueryClientProvider>
  );
}

function setup(pages: Record<string, ReactNode>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<Router client={client} pages={{ "/a": <p>Screen A</p>, ...pages }} />);
  return client;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetNavigationHoldForTests();
  committedPlaceholders = [];
  reads = {};
});
afterEach(() => resetNavigationHoldForTests());

describe("navigation hold", () => {
  it("keeps the current screen until the next one's data is in, then swaps with no loading frame", async () => {
    setup({ "/b": <Screen name="b" /> });
    await act(async () => navigate("/b"));
    expect(screen.getByText("Screen A")).toBeInTheDocument();
    expect(screen.queryByText("b loading")).toBeNull();

    await act(async () => reads.b!.resolve("rows"));
    expect(screen.getByText("b ready: rows")).toBeInTheDocument();
    expect(screen.queryByText("Screen A")).toBeNull();
    expect(committedPlaceholders).toEqual([]);
  });

  it("shows the next screen with its placeholders once the cap passes", async () => {
    setup({ "/b": <Screen name="b" /> });
    const started = Date.now();
    await act(async () => navigate("/b"));
    expect(screen.getByText("Screen A")).toBeInTheDocument();

    await act(async () => wait(NAVIGATION_HOLD_CAP_MS + 60));
    expect(screen.getByText("b loading")).toBeInTheDocument();
    expect(Date.now() - started).toBeGreaterThanOrEqual(NAVIGATION_HOLD_CAP_MS);

    // The read the hold started is the one the screen keeps: no second request.
    await act(async () => reads.b!.resolve("late rows"));
    expect(await screen.findByText("b ready: late rows")).toBeInTheDocument();
  });

  it("holds even when the next screen wraps itself in a new Suspense boundary", async () => {
    setup({ "/b": <Suspense fallback={<Placeholder name="blank fallback" />}><Screen name="b" /></Suspense> });
    await act(async () => navigate("/b"));
    expect(screen.getByText("Screen A")).toBeInTheDocument();
    await act(async () => reads.b!.resolve("rows"));
    expect(screen.getByText("b ready: rows")).toBeInTheDocument();
    expect(committedPlaceholders).toEqual([]);
  });

  it("also waits for a read that mounts only after an earlier one, within the same cap", async () => {
    setup({ "/b": <GatedScreen /> });
    await act(async () => navigate("/b"));
    await act(async () => reads.access!.resolve("ok"));
    expect(screen.getByText("Screen A")).toBeInTheDocument();
    await act(async () => reads.list!.resolve("rows"));
    expect(screen.getByText("list ready: rows")).toBeInTheDocument();
    expect(committedPlaceholders).toEqual([]);
  });

  it("swaps at once when the next screen's data is already in memory", async () => {
    const client = setup({ "/b": <Screen name="b" /> });
    client.setQueryData(["b"], "cached rows");
    await act(async () => navigate("/b"));
    expect(screen.getByText("b ready: cached rows")).toBeInTheDocument();
  });

  it("never holds an urgent update: a read mounting outside a navigation shows its placeholder at once", async () => {
    setup({});
    // There is no Suspense boundary in this tree: a suspension here would
    // throw instead of rendering the placeholder.
    await act(async () => openUrgently());
    expect(screen.getByText("dialog loading")).toBeInTheDocument();
    expect(screen.getByText("Screen A")).toBeInTheDocument();
  });

  it("does not hold for an always-stale read, which would be fetched twice", async () => {
    setup({ "/b": <Screen name="b" staleTime={0} /> });
    await act(async () => navigate("/b"));
    expect(screen.getByText("b loading")).toBeInTheDocument();
  });

  it("does nothing outside the App Router, where there is no pathname", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Screen name="plain" /><NavigationHoldGate /></QueryClientProvider>);
    expect(screen.getByText("plain loading")).toBeInTheDocument();
    await act(async () => reads.plain!.resolve("rows"));
    expect(await screen.findByText("plain ready: rows")).toBeInTheDocument();
  });
});
