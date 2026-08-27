import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_GYMS, type MarketplaceGym } from "@/lib/public/experience-data";
import { PUBLIC_EXPERIENCE_FIRST_SNAPSHOT_TIMEOUT_MS } from "@/lib/public/experience-refresh";
import { ExperienceProvider, useExperience } from "./experience-provider";

type SubscriptionEntry<T> = {
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  resolve: (unsubscribe: () => void) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  active: boolean;
};

function createStream<T>() {
  const entries: SubscriptionEntry<T>[] = [];
  const subscribe = vi.fn((onValue: (value: T) => void, onError: (error: unknown) => void) => {
    let resolve!: (unsubscribe: () => void) => void;
    const entry: SubscriptionEntry<T> = {
      onValue,
      onError,
      resolve: (unsubscribe) => resolve(unsubscribe),
      unsubscribe: vi.fn(),
      active: true,
    };
    entry.unsubscribe.mockImplementation(() => {
      entry.active = false;
    });
    entries.push(entry);
    const promise = new Promise<() => void>((nextResolve) => {
      resolve = nextResolve;
    });
    return promise;
  });

  return {
    entries,
    subscribe,
    resolveAll() {
      entries.forEach((entry) => entry.resolve(entry.unsubscribe));
    },
    activeCount() {
      return entries.filter((entry) => entry.active).length;
    },
  };
}

const state = vi.hoisted(() => ({
  identity: {
    status: "anonymous",
    platformAdmin: false,
    gymAccessUnavailable: false,
    memberships: [],
  } as Record<string, unknown>,
  api: undefined as unknown,
}));

vi.mock("@/lib/api/ConvexGymOSApi", () => ({
  isConvexMode: () => true,
}));

vi.mock("@/lib/auth/rivet-identity", () => ({
  useRivetIdentity: () => state.identity,
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => state.api,
}));

function Probe() {
  const experience = useExperience();
  return (
    <div>
      <output data-testid="status">{experience.experienceStatus}</output>
      <output data-testid="error">{experience.experienceError ?? ""}</output>
      <output data-testid="refreshing">{String(experience.experienceRefreshing)}</output>
      <output data-testid="plan-count">{experience.saasPlans.length}</output>
      <output data-testid="gym-count">{experience.marketplaceGyms.length}</output>
      <button type="button" onClick={experience.retryExperience}>Retry</button>
    </div>
  );
}

function renderProvider(api: unknown) {
  state.api = api;
  return render(
    <ExperienceProvider>
      <Probe />
    </ExperienceProvider>,
  );
}

function gym(): MarketplaceGym {
  return {
    ...MARKETPLACE_GYMS[0]!,
    id: "gym-live",
    name: "Live Gym",
    shortName: "LIVE",
    category: "Strength",
    audience: "All members",
    tagline: "A live listing",
    description: "A live listing",
    areas: ["Amman"],
    accent: "#111111",
    featured: false,
    memberCount: 10,
    fromPriceMinor: 79_000,
    isPublic: true,
    isProvisioned: true,
    isArchived: false,
    trainers: [],
    amenities: [],
  };
}

function apiFor(
  catalog: ReturnType<typeof createStream<unknown>>,
  marketplace: ReturnType<typeof createStream<unknown>>,
) {
  return {
    subscribePublicSaasPlans: catalog.subscribe,
    subscribeMarketplaceGyms: marketplace.subscribe,
    setBehavior: vi.fn(),
  };
}

describe("ExperienceProvider public live recovery", () => {
  beforeEach(() => {
    state.identity = {
      status: "anonymous",
      platformAdmin: false,
      gymAccessUnavailable: false,
      memberships: [],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts immediate catalog and marketplace snapshots", async () => {
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));

    await waitFor(() => expect(catalog.entries).toHaveLength(1));
    act(() => {
      catalog.entries[0]!.onValue([{ name: "Growth" }]);
      marketplace.entries[0]!.onValue([gym()]);
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("plan-count")).toHaveTextContent("1");
    expect(screen.getByTestId("gym-count")).toHaveTextContent("1");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("treats an empty live catalog as a successful snapshot for fallback plans", async () => {
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));

    await waitFor(() => expect(catalog.entries).toHaveLength(1));
    act(() => {
      catalog.entries[0]!.onValue([]);
      marketplace.entries[0]!.onValue([]);
    });

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("plan-count")).toHaveTextContent("0");
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("moves out of full-screen loading when the first snapshot times out", async () => {
    vi.useFakeTimers();
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));

    act(() => {
      vi.advanceTimersByTime(PUBLIC_EXPERIENCE_FIRST_SNAPSHOT_TIMEOUT_MS);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("error");
    expect(screen.getByTestId("error")).toHaveTextContent(/timed out/i);
  });

  it("retries both streams after a timeout and clears the recovered error", async () => {
    vi.useFakeTimers();
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));

    act(() => {
      vi.advanceTimersByTime(PUBLIC_EXPERIENCE_FIRST_SNAPSHOT_TIMEOUT_MS);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("error");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(catalog.entries).toHaveLength(2);
    expect(marketplace.entries).toHaveLength(2);

    act(() => {
      catalog.entries[1]!.onValue([{ name: "Growth" }]);
      marketplace.entries[1]!.onValue([gym()]);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("error")).toHaveTextContent("");
    expect(screen.getByTestId("refreshing")).toHaveTextContent("false");
  });

  it("retries after an explicit subscription failure", async () => {
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));
    await waitFor(() => expect(catalog.entries).toHaveLength(1));

    act(() => {
      catalog.entries[0]!.onError(new Error("subscription failed"));
    });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(catalog.entries).toHaveLength(2));
    act(() => {
      catalog.entries[1]!.onValue([]);
      marketplace.entries[1]!.onValue([]);
    });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("retains the last good snapshots during a later failure", async () => {
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    renderProvider(apiFor(catalog, marketplace));
    await waitFor(() => expect(catalog.entries).toHaveLength(1));
    act(() => {
      catalog.entries[0]!.onValue([{ name: "Growth" }]);
      marketplace.entries[0]!.onValue([gym()]);
    });
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));

    act(() => {
      catalog.entries[0]!.onError(new Error("later network failure"));
    });
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("later network failure"));
    expect(screen.getByTestId("status")).toHaveTextContent("ready");
    expect(screen.getByTestId("plan-count")).toHaveTextContent("1");
    expect(screen.getByTestId("gym-count")).toHaveTextContent("1");
    expect(screen.getByTestId("refreshing")).toHaveTextContent("true");
  });

  it("does not leave duplicate active listeners after repeated retries", async () => {
    const catalog = createStream<unknown>();
    const marketplace = createStream<unknown>();
    const view = renderProvider(apiFor(catalog, marketplace));
    await waitFor(() => expect(catalog.entries).toHaveLength(1));
    catalog.resolveAll();
    marketplace.resolveAll();
    await act(async () => undefined);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(catalog.entries).toHaveLength(3);
      expect(marketplace.entries).toHaveLength(3);
    });
    catalog.resolveAll();
    marketplace.resolveAll();
    await act(async () => undefined);

    expect(catalog.activeCount()).toBe(1);
    expect(marketplace.activeCount()).toBe(1);
    view.unmount();
    catalog.resolveAll();
    marketplace.resolveAll();
    await act(async () => undefined);
    expect(catalog.activeCount()).toBe(0);
    expect(marketplace.activeCount()).toBe(0);
  });
});
