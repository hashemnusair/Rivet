import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import PlatformGymsPage, { sortGymDirectory } from "./page";

const state = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    isBackgroundError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: () => state.query,
}));

function gym(id: string, status: MarketplaceGym["subscriptionStatus"], overrides: Partial<MarketplaceGym> = {}): MarketplaceGym {
  return {
    id,
    name: `${id} Fitness`,
    shortName: id.slice(0, 3).toUpperCase(),
    tagline: "A gym",
    description: "A gym description",
    city: "Amman",
    areas: ["Shmeisani"],
    category: "Strength",
    audience: "Everyone",
    memberCount: 100,
    branchCount: 1,
    fromPriceMinor: 20_000,
    amenities: [],
    accent: "#15140f",
    featured: false,
    subscriptionStatus: status,
    rivetPlan: "Growth",
    joinedAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: "2026-01-02T00:00:00.000Z",
    monthlyRevenueMinor: 149_000,
    isPublic: true,
    branches: [],
    ...overrides,
  };
}

describe("Platform gyms directory", () => {
  beforeEach(() => {
    state.query = {
      data: {
        gyms: [
          gym("active", "active"),
          gym("paused", "suspended", { name: "Paused Fitness", isPublic: true }),
          gym("hidden", "active", { name: "Hidden Fitness", isPublic: false }),
        ],
      },
      isLoading: false,
      isError: false,
      isBackgroundError: false,
      refetch: vi.fn(),
    };
  });

  it("shows lean status cards and links Add gym to applications", () => {
    render(<PlatformGymsPage />);

    expect(screen.getByRole("heading", { name: "Gym organizations" })).toBeInTheDocument();
    expect(screen.getAllByText("Period ends").length).toBeGreaterThan(0);
    expect(screen.queryByText("Gym revenue")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add gym" })).toHaveAttribute("href", "/platform/applications");
    expect(screen.getByRole("link", { name: "Open Paused Fitness admin details" })).toHaveAttribute("href", "/platform/gyms/paused");
  });

  it("sorts active gyms first, then lifecycle status and name", () => {
    const gyms = [
      gym("cancelled-z", "cancelled", { name: "Zulu Fitness" }),
      gym("trial-a", "trial", { name: "Alpha Fitness" }),
      gym("active-z", "active", { name: "Zulu Active" }),
      gym("active-a", "active", { name: "Alpha Active" }),
      gym("overdue-a", "overdue", { name: "Alpha Past Due" }),
    ];

    expect(sortGymDirectory(gyms).map((item) => item.id)).toEqual(["active-a", "active-z", "trial-a", "overdue-a", "cancelled-z"]);
  });

  it("does not show archived rows in the default directory", () => {
    const archived = gym("archived", "cancelled", { name: "Archived Fitness" }) as MarketplaceGym & { isArchived: boolean };
    archived.isArchived = true;
    state.query = {
      data: { gyms: [gym("active", "active"), archived] },
      isLoading: false,
      isError: false,
      isBackgroundError: false,
      refetch: vi.fn(),
    };

    render(<PlatformGymsPage />);

    expect(screen.getByRole("heading", { name: "active Fitness" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Archived Fitness" })).not.toBeInTheDocument();
    expect(screen.getByText("1 gym shown.")).toBeInTheDocument();
  });

  it("filters by subscription status and supports searching by gym id", () => {
    render(<PlatformGymsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Suspended 1" }));
    expect(screen.getByRole("heading", { name: "Paused Fitness" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "active Fitness" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspended 1" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "All gyms 3" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search gym organizations" }), { target: { value: "hidden" } });
    expect(screen.getByRole("heading", { name: "Hidden Fitness" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Paused Fitness" })).not.toBeInTheDocument();
  });

  it("has honest loading and retryable error states", () => {
    state.query = { data: undefined, isLoading: true, isError: false, isBackgroundError: false, refetch: vi.fn() };
    const { unmount } = render(<PlatformGymsPage />);
    expect(screen.getByRole("status", { name: "Loading gym directory" })).toBeInTheDocument();

    unmount();
    const refetch = vi.fn();
    state.query = { data: undefined, isLoading: false, isError: true, isBackgroundError: false, refetch };
    render(<PlatformGymsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
