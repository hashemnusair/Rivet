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
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ ...state, retryExperience: vi.fn() }),
  useMarketplaceGyms: () => [],
}));

vi.mock("@/components/public/public-shell", () => ({
  PublicHeader: () => <header aria-label="Public header" />,
  PublicFooter: () => <footer aria-label="Public footer" />,
}));

vi.mock("@/components/marketing/decorative-qr", () => ({ DecorativeQr: () => <div aria-hidden /> }));
vi.mock("@/components/marketing/hero-devices", () => ({ HeroDevices: () => <div aria-hidden /> }));
vi.mock("@/components/marketing/reveal", () => ({ Reveal: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/marketing/rivet-loop-machine", () => ({ RivetLoopMachine: () => <div aria-hidden /> }));
vi.mock("@/components/marketing/scroll-progress", () => ({ ScrollProgress: () => <div aria-hidden /> }));
vi.mock("@/components/marketing/vocabulary-marquee", () => ({ VocabularyMarquee: () => <div aria-hidden /> }));
vi.mock("@/components/public/experience-data-state", () => ({ ExperienceDataState: () => <div role="status" /> }));

describe("landing-page pricing", () => {
  beforeEach(() => {
    state.saasPlans = [];
    state.experienceStatus = "ready";
    state.experienceError = undefined;
  });

  it("keeps gym application and existing-account entry points in the cinematic navigation", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.click(screen.getByRole("button", { name: "Menu" }));

    const navigation = screen.getByRole("dialog", { name: "RIVET navigation" });
    expect(within(navigation).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(within(navigation).getByRole("link", { name: "Send gym application" })).toHaveAttribute("href", "/signup");
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
