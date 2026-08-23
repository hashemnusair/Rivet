import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import GymApplicationPage from "./page";

const state = vi.hoisted(() => ({ saasPlans: [] as PlatformSaasPlan[] }));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    saasPlans: state.saasPlans,
    experienceError: undefined,
    experienceStatus: "ready",
    retryExperience: vi.fn(),
  }),
}));

vi.mock("@/components/public/public-shell", () => ({ PublicHeader: () => <header aria-label="Public header" /> }));
vi.mock("@/lib/api/client", () => ({
  getApi: () => ({ submitGymApplication: vi.fn() }),
}));

describe("gym application pricing selection", () => {
  beforeEach(() => {
    state.saasPlans = [];
    window.history.replaceState({}, "", "/signup?plan=Enterprise&interval=annual");
  });

  it("restores the landing-page selection and still allows changing plans", async () => {
    const user = userEvent.setup();
    render(<GymApplicationPage />);

    expect(await screen.findByRole("radio", { name: /Enterprise/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("tab", { name: /Annual/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/JD 4800\.000 billed annually/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Starter/ }));
    expect(screen.getByRole("radio", { name: /Starter/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Enterprise/ })).toHaveAttribute("aria-checked", "false");
  });
});
