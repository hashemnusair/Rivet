import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import GymApplicationPage from "./page";

const state = vi.hoisted(() => ({
  saasPlans: [] as PlatformSaasPlan[],
  submitGymApplication: vi.fn(),
}));

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
  getApi: () => ({ submitGymApplication: state.submitGymApplication }),
}));

describe("gym application pricing selection", () => {
  beforeEach(() => {
    state.saasPlans = [];
    state.submitGymApplication.mockReset();
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

  it("submits the selected annual cadence with the application", async () => {
    const user = userEvent.setup();
    state.submitGymApplication.mockResolvedValue({
      applicationId: "application-annual",
      status: "pending",
      notificationStatus: "sent",
      submittedAt: "2026-08-23T00:00:00.000Z",
      duplicate: false,
    });
    render(<GymApplicationPage />);

    await screen.findByRole("radio", { name: /Enterprise/ });
    await user.type(screen.getByPlaceholderText("Omar Khalil"), "Annual Owner");
    await user.type(screen.getByPlaceholderText("owner@example.com"), "annual-owner@example.test");
    await user.type(screen.getByPlaceholderText("+962 79 555 0194"), "+962790000999");
    await user.type(screen.getByPlaceholderText("Northstar Fitness"), "Annual Gym");
    await user.click(screen.getByRole("button", { name: /Send gym application/ }));

    expect(state.submitGymApplication).toHaveBeenCalledWith(expect.objectContaining({
      ownerName: "Annual Owner",
      gymName: "Annual Gym",
      email: "annual-owner@example.test",
      contactNumber: "+962790000999",
      plan: "Enterprise",
      billingInterval: "annual",
    }));
    expect(state.submitGymApplication.mock.calls[0]?.[0].idempotencyKey).toEqual(expect.any(String));
  });
});
