import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportPage from "./page";

const state = vi.hoisted(() => ({
  createSupportCase: vi.fn(),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({
    session: {
      user: { email: "owner@gym.example" },
      branches: [{ id: "branch-1", name: "Main branch" }],
      workspace: { entitlements: { subscriptionPlan: "Starter" } },
    },
  }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    saasPlans: [
      { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
      { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
      { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
      { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" },
    ],
  }),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    subscribeSupportCases: async (onValue: (cases: unknown[]) => void) => { onValue([]); return () => undefined; },
    createSupportCase: state.createSupportCase,
  }),
}));

describe("gym support plan requests", () => {
  beforeEach(() => {
    state.createSupportCase.mockReset();
    state.createSupportCase.mockResolvedValue({ id: "SUP-NEW", subject: "Pro upgrade", status: "open", priority: "normal", gym: "Gym A" });
  });

  it("submits a structured upgrade request without an auto-upgrade action", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);
    await user.click(screen.getByRole("button", { name: "Request plan upgrade" }));
    expect(screen.getByRole("heading", { name: "Request a plan upgrade" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Requested plan" }), "Pro");
    await user.selectOptions(screen.getByRole("combobox", { name: "Billing cadence" }), "annual");
    await user.type(screen.getByRole("textbox", { name: "Subject" }), "Please upgrade our workspace");
    await user.type(screen.getByRole("textbox", { name: "Why do you need this plan?" }), "We need financial reporting for the next renewal.");
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() => expect(state.createSupportCase).toHaveBeenCalledWith(expect.objectContaining({ requestType: "plan_upgrade", requestedPlan: "Pro", billingInterval: "annual" })));
  });
});
