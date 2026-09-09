import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import LandingPage from "./page";

const state = vi.hoisted(() => ({
  saasPlans: [] as PlatformSaasPlan[],
  experienceStatus: "ready" as "loading" | "ready" | "error",
  experienceError: undefined as string | undefined,
  viewer: { status: "signed-out" } as Record<string, unknown>,
}));

vi.mock("@/lib/auth/public-viewer", () => ({ usePublicViewer: () => state.viewer }));
vi.mock("@/components/public/signed-in-guard", () => ({ SignedInGuard: () => null }));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ ...state, retryExperience: vi.fn() }),
  useMarketplaceGyms: () => [],
}));

vi.mock("@/components/public/public-footer", () => ({ PublicFooter: () => <footer aria-label="Public footer" /> }));

vi.mock("@/components/marketing/hero-devices", () => ({ HeroDevices: () => <div aria-hidden /> }));
vi.mock("@/components/marketing/reveal", () => ({ Reveal: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/marketing/scroll-progress", () => ({ ScrollProgress: () => <div aria-hidden /> }));
vi.mock("@/components/public/experience-data-state", () => ({ ExperienceDataState: () => <div role="status" /> }));

describe("landing-page pricing", () => {
  beforeEach(() => {
    state.saasPlans = [];
    state.experienceStatus = "ready";
    state.experienceError = undefined;
    state.viewer = { status: "signed-out" };
  });

  it("offers both doors and the application to a signed-out visitor", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    // The member section's own "Sign in" leads straight to the member door.
    expect(screen.getAllByRole("link", { name: "Sign in" }).map((link) => link.getAttribute("href"))).toEqual(["/login", "/login/member"]);
    expect(screen.getByRole("link", { name: "Apply for access" })).toHaveAttribute("href", "/signup");
    for (const link of screen.getAllByRole("link", { name: /Send a gym application/ })) expect(link).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: /Create a free account/ })).toHaveAttribute("href", "/login/member/create");
    expect(screen.getByRole("link", { name: "Already have access? Sign in" })).toHaveAttribute("href", "/login/gym");
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const navigation = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(navigation).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(within(navigation).getByRole("link", { name: "Send gym application" })).toHaveAttribute("href", "/signup");
  });

  it("offers a signed-in owner nothing but their dashboard", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn().mockResolvedValue(undefined);
    state.viewer = { status: "signed-in", destination: { area: "gym", href: "/dashboard", label: "Dashboard", verb: "Open your dashboard" }, signOut };
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getAllByRole("link", { name: /Open your dashboard/ }).length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply for access" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Send (a )?gym application/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Create a free account/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Find a gym" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Already a member\?/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Menu" }));

    const navigation = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(navigation).queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the marketplace link for a signed-in member", () => {
    state.viewer = { status: "signed-in", destination: { area: "member", href: "/customer/my-gyms", label: "My gyms", verb: "Open your gyms" }, signOut: vi.fn() };
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: "My gyms" })).toHaveAttribute("href", "/customer/my-gyms");
    expect(screen.getByRole("link", { name: "Find a gym" })).toHaveAttribute("href", "/customer/discover");
  });

  it("shows all four tiers and defaults to monthly billing", () => {
    render(<LandingPage />);

    const pricing = document.querySelector("#pricing")!;
    expect(pricing).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Monthly" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getByText("JD 500.000")).toBeInTheDocument();
  });

  it("updates every card accessibly for annual savings and carries the choice into signup", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.click(screen.getByRole("tab", { name: /Annual/ }));

    expect(screen.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("Save 20%")).toHaveLength(4);
    expect(screen.getByText("JD 63.200")).toBeInTheDocument();
    expect(screen.getByText("JD 758.400 billed annually", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Send gym application" })[0]).toHaveAttribute("href", "/signup?plan=Starter&interval=annual");
  });

  it("renders the live catalog module selection on the matching public card", () => {
    state.saasPlans = [{ name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal", entitledModules: ["foundation", "revenue"] }];
    render(<LandingPage />);

    const growthCard = screen.getByText("Growth").closest("div.rounded-lg");
    expect(growthCard).not.toBeNull();
    if (!(growthCard instanceof HTMLElement)) throw new Error("Growth pricing card was not rendered as an element.");
    expect(within(growthCard).getByText("Gym foundation")).toBeInTheDocument();
    expect(within(growthCard).getByText("Revenue protection")).toBeInTheDocument();
    expect(within(growthCard).queryByText("Daily operations")).not.toBeInTheDocument();
  });
});
